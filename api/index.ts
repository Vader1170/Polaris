import express from "express";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ── Usage stats (flat-file counter) ─────────────────────────────────────
// NOTE: on Vercel, the filesystem is ephemeral per invocation. This will
// NOT persist counts across requests in production. Swap for Vercel KV,
// a Firestore counter doc, or similar before trusting these numbers.
const USAGE_STATS_PATH = path.resolve("/tmp", "usage-stats.json");

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
    fs.writeFileSync(USAGE_STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to update usage stats:", err);
  }
}

const OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

function extractJson(text: string): any {
  let candidate = text.trim();
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidate = fenceMatch[1].trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = repairJsonBrackets(candidate);
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error("Could not parse JSON from AI response.");
    }
  }
}

function repairJsonBrackets(text: string): string {
  const stack: string[] = [];
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      result += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch === "{" ? "}" : "]"); result += ch; continue; }
    if (ch === "}" || ch === "]") {
      if (stack.length > 0) result += stack.pop();
      continue;
    }
    result += ch;
  }
  while (stack.length > 0) result += stack.pop();
  return result;
}

app.post("/api/generate-roadmap", async (req, res) => {
  try {
    const { answers, model = OPENROUTER_MODEL } = req.body;
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Answers object is required." });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is missing.");
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
      return res.status(500).json({ error: "Failed to reach OpenRouter API. Please check your network connection and try again." });
    }

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text().catch(() => "");
      console.error(`OpenRouter API error (${openRouterResponse.status}):`, errorBody);
      return res.status(500).json({ error: `OpenRouter API request failed with status ${openRouterResponse.status}.` });
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
    res.status(500).json({ error: error.message || "Failed to generate roadmap from AI provider." });
  }
});

app.get("/api/stats", (req, res) => {
  res.json(readUsageStats());
});

export default app;
