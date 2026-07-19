import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// ── Usage stats (flat-file counter) ─────────────────────────────────────
// NOTE: this uses a plain JSON file on the local filesystem via Node's fs
// module. That works fine in local dev, but Vercel's serverless deployment
// model gives each function invocation an ephemeral, read-only filesystem
// (aside from /tmp, which does not persist between invocations either).
// Once this is deployed to Vercel, writes here will silently stop
// persisting — the counter will appear to work per-request but reset/lose
// data constantly, and GET /api/stats will not reflect real usage.
// Before relying on these numbers in production, swap this for something
// that persists across serverless invocations (e.g. Vercel KV, a Firestore
// counter document, or a small external counter API).
const USAGE_STATS_PATH = path.resolve(process.cwd(), "data", "usage-stats.json");

interface UsageStats {
  totalGenerations: number;
  byType: Record<string, number>;
}

function readUsageStats(): UsageStats {
  try {
    const raw = fs.readFileSync(USAGE_STATS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { totalGenerations: 0, byType: {} };
  }
}

function incrementUsageStats(type: string): void {
  try {
    const stats = readUsageStats();
    stats.totalGenerations += 1;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    fs.mkdirSync(path.dirname(USAGE_STATS_PATH), { recursive: true });
    fs.writeFileSync(USAGE_STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
  } catch (err) {
    // Never let stats tracking break the actual request.
    console.error("Failed to update usage stats:", err);
  }
}

// ── OpenRouter configuration ──────────────────────────────────────────────
// To switch models later, change only this constant.
const OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// JSON schema description used to instruct the model (kept in sync with the
// frontend's expected shape). This replaces Gemini's responseSchema, since
// OpenRouter's Chat Completions API doesn't support it natively.
const roadmapSchemaDescription = `{
  "researchVision": string,
  "recommendedField": string,
  "possibleResearchQuestions": string[],
  "backgroundReading": [{ "title": string, "author": string, "description": string }],
  "skillsToLearn": string[],
  "weeklyRoadmap": [{ "weekNumber": string, "objective": string, "tasks": string[] }],
  "softwareTools": [{ "name": string, "purpose": string }],
  "experimentIdeas": [{ "title": string, "description": string }],
  "publicationChecklist": string[],
  "competitions": [{ "name": string, "suitability": string }],
  "commonMistakes": string[],
  "nextThreeActions": string[]
}`;

// Extracts a JSON object from a model response, tolerating markdown code
// fences or stray text around the JSON payload.
function extractJson(text: string): any {
  let candidate = text.trim();

  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    candidate = fenceMatch[1].trim();
  }

  // Narrow to the outermost { ... } block if there's any surrounding text.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  try {
    return JSON.parse(candidate);
  } catch {
    // The model produced near-valid JSON with a bracket mistake (e.g.
    // closing an array with `}` instead of `]`, or truncated output).
    // Repair bracket matching and retry once before giving up.
    const repaired = repairJsonBrackets(candidate);
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error("Could not parse JSON from AI response.");
    }
  }
}

// Walks a JSON-like string and fixes mismatched or missing closing
// brackets/braces (a common failure mode for smaller models generating
// long structured output, e.g. closing an array with `}` instead of `]`).
function repairJsonBrackets(text: string): string {
  const stack: string[] = [];
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      result += ch;
      continue;
    }

    if (ch === "}" || ch === "]") {
      if (stack.length > 0) {
        // Always emit what the stack expects next, correcting mismatches.
        result += stack.pop();
      }
      // Unmatched closer with nothing open: drop it.
      continue;
    }

    result += ch;
  }

  // Append any closers still owed at the end (handles truncation).
  while (stack.length > 0) {
    result += stack.pop();
  }

  return result;
}

// API proxy endpoint to handle roadmap generation
app.post("/api/generate-roadmap", async (req, res) => {
  try {
    const { answers, model = OPENROUTER_MODEL } = req.body;

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Answers object is required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is missing. Please add it to your .env file.");
    }

    const formattedAnswers = Object.entries(answers)
      .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
      .join("\n");

    const prompt = `The student's profile is compiled below:
${formattedAnswers}

As their experienced research mentor, analyze their background, available time, current skills, and interests.
Generate a tailored scientific roadmap for them. It must be highly actionable, realistic for their available weekly hours, and mathematically/logically sound for their described level. 

Make sure the recommendedField, possibleResearchQuestions, and backgroundReading are specific and detailed (e.g. recommend actual books, papers, or standard university textbooks, not generic descriptions). For experimentIdeas, describe how they can utilize their existing resources (e.g. computer with internet, school lab if available) to conduct rigorous investigation.

Respond with ONLY a single valid JSON object matching this exact structure, and nothing else (no markdown fences, no commentary):
${roadmapSchemaDescription}`;

    const systemInstruction = `You are Polaris, a world-class scientific mentor, university advisor, and educator. Your mission is to nurture independent inquiry in high school students (ages 14-18) while maintaining the highest academic standards.

When a student shares their interests and constraints, you must:
1. Calibrate STRICTLY to the math and programming background they actually reported — do not assume familiarity with anything beyond it. If they said "school-level math" or "just calculus," do not write as if they know linear algebra, PDEs, or graduate-level notation.
2. Every time you introduce a technical term, acronym, or piece of jargon (e.g. "PINN," "Navier-Stokes," "surrogate model"), immediately follow it with a short plain-English gloss in parentheses or the same sentence, written so a bright student at their stated level understands it without looking anything up. Never stack multiple unexplained jargon terms in a row.
3. Provide high-quality, practical advice. Recommend specific textbooks, standard peer-reviewed literature, and concrete software tools (e.g., Python, LaTeX/Overleaf, Jupyter, R, Pandas, PyTorch, QGIS) — but only real, correctly-attributed works you are confident exist. If you are not certain of an exact title or author, recommend a well-known standard reference in the field instead of inventing one.
4. Write only in English. Never insert stray characters, words, or script from other languages/alphabets anywhere in the output.
5. Do not formulate questions or experiments that are unrealistic (e.g., do not suggest wet-lab CRISPR editing or supercomputer modeling if they only have a standard laptop and no school lab).
6. Be structured, rigorous, encouraging, and clear. Avoid generic placeholder sentences; make every field detailed, specialized, and highly descriptive — but always in language the student can actually follow given point 1 and 2 above.
7. You must respond with ONLY a single valid JSON object matching the structure given by the user. Do not wrap it in markdown code fences. Do not include any text before or after the JSON.`;

    let openRouterResponse: Response;
    try {
      openRouterResponse = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt },
          ],
          temperature: 0.75,
          max_tokens: 16000,
          reasoning: { effort: "low" },
        }),
      });
    } catch (networkErr: any) {
      console.error("OpenRouter network error:", networkErr);
      return res.status(500).json({
        error: "Failed to reach OpenRouter API. Please check your network connection and try again.",
      });
    }

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text().catch(() => "");
      console.error(`OpenRouter API error (${openRouterResponse.status}):`, errorBody);
      return res.status(500).json({
        error: `OpenRouter API request failed with status ${openRouterResponse.status}.`,
      });
    }

    const data = await openRouterResponse.json();
    const messageContent = data?.choices?.[0]?.message?.content;

    if (!messageContent || typeof messageContent !== "string") {
      console.error("OpenRouter returned an unexpected payload:", JSON.stringify(data));
      throw new Error("OpenRouter API returned an empty or malformed response.");
    }

    let parsedData: any;
    try {
      parsedData = extractJson(messageContent);
    } catch (parseErr: any) {
      console.error("Failed to parse JSON from OpenRouter response:", messageContent);
      throw new Error("Failed to parse the AI provider's response as JSON.");
    }

    incrementUsageStats("research");

    res.json(parsedData);
  } catch (error: any) {
    console.error("Roadmap generation error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate roadmap from AI provider."
    });
  }
});

// Returns current usage counters. NOTE: unauthenticated — fine for
// checking your own numbers during a private beta, but remove or protect
// this (e.g. a shared-secret query param or basic auth) before a genuinely
// public launch, since anyone who finds the URL can currently read it.
app.get("/api/stats", (req, res) => {
  res.json(readUsageStats());
});

// Start server and handle Vite middleware
async function startServer() {
  let vite: any = null;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
  }

  const servePage = (htmlFileName: string) => async (req: any, res: any, next: any) => {
    try {
      const filePath = path.resolve(process.cwd(), htmlFileName);
      if (process.env.NODE_ENV !== "production") {
        if (fs.existsSync(filePath)) {
          const rawHtml = fs.readFileSync(filePath, "utf-8");
          const html = await vite.transformIndexHtml(req.originalUrl, rawHtml);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } else {
          res.status(404).send(`File not found: ${htmlFileName}`);
        }
      } else {
        const distPath = path.join(process.cwd(), "dist");
        const distPagePath = path.join(distPath, htmlFileName);
        if (fs.existsSync(distPagePath)) {
          res.sendFile(distPagePath);
        } else {
          res.status(404).sendFile(path.join(distPath, "index.html"));
        }
      }
    } catch (err) {
      next(err);
    }
  };

  // Modern Clean Routes
  app.get("/", servePage("index.html"));
  app.get("/mission", servePage("mission.html"));
  app.get("/principles", servePage("principles.html"));
  app.get("/how-it-works", servePage("how-it-works.html"));
  app.get("/story", servePage("story.html"));
  app.get("/navigator", servePage("navigator.html"));

  // Original Direct extension matches
  app.get("/index.html", servePage("index.html"));
  app.get("/mission.html", servePage("mission.html"));
  app.get("/prinnciples.html", servePage("principles.html"));
  app.get("/how-it-works.html", servePage("how-it-works.html"));
  app.get("/story.html", servePage("story.html"));
  app.get("/navigator.html", servePage("navigator.html"));

  if (process.env.NODE_ENV !== "production") {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Fallback for production clean URLs/spa routing
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    if (process.env.NODE_ENV === "production") {
      console.log(`Server running on port ${PORT}`);
    } else {
      console.log(`Server running on http://localhost:${PORT}`);
    }
  });
}

startServer();
