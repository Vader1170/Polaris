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

// ── Shared helpers ──────────────────────────────────────────────────────
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

// ── Base system instruction (copied from original, used by all) ──────
const baseSystemInstruction = `You are Polaris, a world-class scientific mentor, university advisor, and educator. Your mission is to nurture independent inquiry in high school students (ages 14-18) while maintaining the highest academic standards.

When a student shares their interests and constraints, you must:
1. Calibrate STRICTLY to the math and programming background they actually reported — do not assume familiarity with anything beyond it. If they said "school-level math" or "just calculus," do not write as if they know linear algebra, PDEs, or graduate-level notation.
2. Every time you introduce a technical term, acronym, or piece of jargon (e.g. "PINN," "Navier-Stokes," "surrogate model"), immediately follow it with a short plain-English gloss in parentheses or the same sentence, written so a bright student at their stated level understands it without looking anything up. Never stack multiple unexplained jargon terms in a row.
3. Provide high-quality, practical advice. Recommend specific textbooks, standard peer-reviewed literature, and concrete software tools (e.g., Python, LaTeX/Overleaf, Jupyter, R, Pandas, PyTorch, QGIS) — but only real, correctly-attributed works you are confident exist. If you are not certain of an exact title or author, recommend a well-known standard reference in the field instead of inventing one.
4. Write only in English. Never insert stray characters, words, or script from other languages/alphabets anywhere in the output.
5. Do not formulate questions or experiments that are unrealistic (e.g., do not suggest wet-lab CRISPR editing or supercomputer modeling if they only have a standard laptop and no school lab).
6. Be structured, rigorous, encouraging, and clear. Avoid generic placeholder sentences; make every field detailed, specialized, and highly descriptive — but always in language the student can actually follow given point 1 and 2 above.
7. You must respond with ONLY a single valid JSON object matching the structure given by the user. Do not wrap it in markdown code fences. Do not include any text before or after the JSON.`;

// ── Generic endpoint creator ──────────────────────────────────────────
function createGenerateEndpoint(
  route: string,
  schemaDescription: string,
  promptBuilder: (answers: any) => string,
  statsKey: string
) {
  app.post(route, async (req, res) => {
    try {
      const { answers, model = OPENROUTER_MODEL } = req.body;
      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ error: "Answers object is required." });
      }
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY environment variable is missing.");
      }

      const userPrompt = promptBuilder(answers);
      const systemInstruction = baseSystemInstruction + "\n\n" +
        `Respond with a single JSON object matching this schema:\n${schemaDescription}`;

      const openRouterResponse = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.75,
          max_tokens: 16000,
          reasoning: { effort: "low" },
        }),
      });

      if (!openRouterResponse.ok) {
        const errorBody = await openRouterResponse.text().catch(() => "");
        console.error(`OpenRouter error (${openRouterResponse.status}):`, errorBody);
        return res.status(500).json({ error: `OpenRouter API request failed with status ${openRouterResponse.status}.` });
      }

      const data = await openRouterResponse.json();
      const messageContent = data?.choices?.[0]?.message?.content;
      if (!messageContent || typeof messageContent !== "string") {
        console.error("OpenRouter unexpected payload:", JSON.stringify(data));
        throw new Error("OpenRouter API returned an empty or malformed response.");
      }

      let parsedData;
      try {
        parsedData = extractJson(messageContent);
      } catch (parseErr) {
        console.error("Failed to parse JSON:", messageContent);
        throw new Error("Failed to parse the AI provider's response as JSON.");
      }

      incrementUsageStats(statsKey);
      res.json(parsedData);
    } catch (error: any) {
      console.error(`Error in ${route}:`, error);
      res.status(500).json({ error: error.message || "Failed to generate plan." });
    }
  });
}

// ── 1. Research (original) ─────────────────────────────────────────────
// We keep the original implementation to avoid breaking changes.
// The original endpoint is already defined below, but we also have the generic function.
// To avoid duplication, we'll keep the original code block as is (it's already there).
// Actually, the original code is defined after this; we'll just leave it untouched.
// But we need to ensure the original endpoint remains. It is already defined in the file,
// so we don't need to redefine it here. We'll keep the original `app.post("/api/generate-roadmap", ...)`.

// ── 2. Science Fair ────────────────────────────────────────────────────
const scienceFairSchema = `{
  "projectTitle": string,
  "hypothesisStatement": string,
  "independentVariable": string,
  "dependentVariable": string,
  "controlledVariables": string[],
  "experimentalDesign": [{ "title": string, "description": string }],
  "materialsAndEquipment": [{ "name": string, "purpose": string, "whereToGet": string }],
  "dataCollectionPlan": string,
  "validationAndControls": string[],
  "displayBoardOutline": [{ "title": string, "description": string }],
  "timelineToFairDate": [{ "milestone": string, "targetDate": string, "tasks": string[] }],
  "judgingPrepChecklist": string[],
  "commonPitfalls": string[],
  "suitableFairs": [{ "name": string, "suitability": string }]
}`;
createGenerateEndpoint(
  "/api/generate-sciencefair",
  scienceFairSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `The student's science fair profile:\n${formatted}\n\nGenerate a structured plan for their project.`;
  },
  "sciencefair"
);

// ── 3. Olympiad ────────────────────────────────────────────────────────
const olympiadSchema = `{
  "targetOlympiad": string,
  "currentLevelAssessment": string,
  "syllabusBreakdown": [{ "topic": string, "priority": string, "whyItMatters": string }],
  "resourceList": [{ "title": string, "author": string, "description": string }],
  "weeklySchedule": [{ "weekNumber": string, "focus": string, "tasks": string[] }],
  "practiceProblemSets": [{ "source": string, "description": string }],
  "mockTestPlan": string,
  "commonMistakes": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-olympiad",
  olympiadSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Olympiad preparation profile:\n${formatted}\n\nGenerate a strict study schedule and resource list.`;
  },
  "olympiad"
);

// ── 4. Portfolio ───────────────────────────────────────────────────────
const portfolioSchema = `{
  "portfolioNarrative": string,
  "strengthsIdentified": string[],
  "gapsToAddress": string[],
  "recommendedAdditions": [{ "title": string, "description": string, "effortLevel": string }],
  "howToPresentExisting": [{ "item": string, "howToFrameIt": string }],
  "essayAngleSuggestions": string[],
  "timeline": [{ "weekOrMonthLabel": string, "tasks": string[] }],
  "redFlagsToAvoid": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-portfolio",
  portfolioSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Student portfolio profile:\n${formatted}\n\nGenerate a coherent narrative and actionable plan.`;
  },
  "portfolio"
);

// ── 5. Debate ──────────────────────────────────────────────────────────
const debateSchema = `{
  "resolutionAnalysis": string,
  "caseFramework": [{ "contentionTitle": string, "claim": string, "warrant": string, "impact": string }],
  "evidenceToFind": [{ "claimItSupports": string, "whatKindOfSourceToLookFor": string }],
  "anticipatedOpposingArguments": [{ "argument": string, "howToRespond": string }],
  "crossExaminationPrep": string[],
  "deliveryTips": string[],
  "prepTimeline": [{ "sessionLabel": string, "tasks": string[] }],
  "commonMistakes": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-debate",
  debateSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Debate preparation profile:\n${formatted}\n\nGenerate a case brief with evidence needs and argument structure.`;
  },
  "debate"
);

// ── 6. Project Builder ────────────────────────────────────────────────
const projectSchema = `{
  "projectSummary": string,
  "coreFeatureList": [{ "feature": string, "priority": "must-have" | "nice-to-have" }],
  "suggestedTechStack": [{ "layer": string, "tool": string, "why": string }],
  "architectureOverview": string,
  "milestones": [{ "milestoneNumber": string, "title": string, "tasks": string[], "estimatedWeeks": string }],
  "databaseSchemaSketch": [{ "table": string, "keyFields": string }],
  "deploymentPlan": string,
  "testingChecklist": string[],
  "commonMistakes": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-project",
  projectSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Project build profile:\n${formatted}\n\nGenerate a milestone-based build plan.`;
  },
  "project"
);

// ── 7. Learning Planner ───────────────────────────────────────────────
const learningSchema = `{
  "learningGoalSummary": string,
  "recommendedResource": string,
  "topicBreakdown": [{ "topic": string, "whyItMatters": string, "prerequisiteOf": string[] }],
  "weeklySchedule": [{ "weekNumber": string, "topics": string[], "practiceRecommendation": string }],
  "selfCheckMilestones": string[],
  "commonStumblingBlocks": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-learning",
  learningSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Learning profile:\n${formatted}\n\nGenerate a weekly study schedule and resource plan.`;
  },
  "learning"
);

// ── 8. Paper Reviewer ─────────────────────────────────────────────────
const paperSchema = `{
  "overallAssessment": string,
  "strengths": string[],
  "methodologyIssues": [{ "issue": string, "whyItMatters": string, "suggestedFix": string }],
  "clarityIssues": [{ "location": string, "issue": string, "suggestedFix": string }],
  "statisticalConcerns": string[],
  "citationConcerns": string[],
  "revisionPriorityOrder": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-paper",
  paperSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Manuscript details:\n${formatted}\n\nProvide structured feedback on the manuscript.`;
  },
  "paper"
);

// ── 9. Journal Summary (different endpoint) ──────────────────────────
const journalSummarySchema = `{
  "periodSummary": string,
  "momentum": string,
  "recurringBlockers": string[],
  "suggestedNextSteps": string[]
}`;
app.post("/api/summarize-journal", async (req, res) => {
  try {
    const { entries, model = OPENROUTER_MODEL } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "Entries array is required and must not be empty." });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY missing.");

    const entriesText = entries.map((e, i) =>
      `Entry ${i+1}: Date: ${e.date}, Work: ${e.work}, Blockers: ${e.blockers || 'None'}, Next: ${e.next || 'None'}`
    ).join("\n");

    const userPrompt = `Here are the student's recent journal entries:\n${entriesText}\n\nSummarise the period, assess momentum, identify recurring blockers, and suggest next steps. Respond with JSON matching the schema.`;
    const systemInstruction = baseSystemInstruction + `\n\nRespond with a JSON object matching this schema:\n${journalSummarySchema}`;

    const openRouterResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 4000,
        reasoning: { effort: "low" },
      }),
    });

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text().catch(() => "");
      console.error(`OpenRouter error (${openRouterResponse.status}):`, errorBody);
      return res.status(500).json({ error: `OpenRouter API request failed with status ${openRouterResponse.status}.` });
    }

    const data = await openRouterResponse.json();
    const messageContent = data?.choices?.[0]?.message?.content;
    if (!messageContent || typeof messageContent !== "string") {
      throw new Error("OpenRouter returned empty or malformed response.");
    }

    let parsedData;
    try {
      parsedData = extractJson(messageContent);
    } catch (parseErr) {
      console.error("Failed to parse journal summary JSON:", messageContent);
      throw new Error("Failed to parse summary JSON.");
    }

    incrementUsageStats("journal");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Journal summary error:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary." });
  }
});

// ── 10. Career Explorer ──────────────────────────────────────────────
const careerSchema = `{
  "fieldOverview": string,
  "specializationOptions": [{ "name": string, "description": string, "whatItInvolves": string }],
  "howToFindLabs": string[],
  "internshipProgramTypes": [{ "type": string, "description": string, "typicalTimeline": string }],
  "gradSchoolPathOverview": string,
  "nextThreeActions": string[]
}`;
createGenerateEndpoint(
  "/api/generate-career",
  careerSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `Career exploration profile:\n${formatted}\n\nGenerate a roadmap for postgraduate and internship exploration.`;
  },
  "career"
);

// ── Original Research endpoint (kept as is) ───────────────────────────
// Note: This is the original block from your file. We keep it to avoid breaking existing functionality.
// The original code is already present in the file, but we are now adding the new endpoints above.
// We should ensure this block remains after the new endpoints, or we can move it up.
// For clarity, we'll place it before the new endpoints, but it's fine either way.
// However, to avoid duplication, we'll leave the original app.post("/api/generate-roadmap", ...) as it is.
// Since the original file already has it, we don't need to redefine it here.

// ── Stats endpoint ─────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  res.json(readUsageStats());
});

// ── Original Research endpoint (keep the existing one) ──────────────
// We'll keep the original code block that was in the file.
// To avoid duplication, we'll include it here (but it's already in the file).
// Actually, the original file has the entire endpoint definition after the stats.
// In this new version, we have placed the new endpoints before the stats,
// and the original endpoint is already defined later. We need to ensure we don't have two definitions.
// The safest way: remove the original definition from the file and rely on the generic createGenerateEndpoint? No, the original has a different schema and prompt.
// So we'll keep the original as is, and we'll not redefine it. We'll just add the new ones.
// Since we are replacing the file completely, we need to include the original endpoint code as well.
// Therefore, below we'll add the original endpoint.

// Original Research endpoint (copied from your file)
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

export default app;
