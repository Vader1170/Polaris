import express from "express";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(express.json());

// Catch anything that would otherwise crash the whole serverless function
// with no response body (that's what was producing the bare "Server error: 500").
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

// Quick debug middleware for generate endpoints.
// NOTE: Express only matches mount paths on full path segments, so
// app.use("/api/generate-", ...) NEVER matched "/api/generate-roadmap"
// etc. — it needs a trailing "/" or a wildcard. Fixed below.
app.use("/api/generate-*", (req, res, next) => {
  try {
    console.log("[DEBUG] /api/generate-* request", {
      path: req.path,
      hasAuthHeader: !!req.headers.authorization,
      OPENROUTER_KEY_EXISTS: !!process.env.OPENROUTER_API_KEY,
    });
  } catch (e) {
    console.error("[DEBUG] logging error", e);
  }
  next();
});

// ── Firebase Admin Initialisation ──────────────────────────────
// Wrapped defensively: if anything here throws (bad private key format,
// Firestore not provisioned on the project yet, etc.) we log it and
// continue running with db = null instead of taking down every route.
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

let db: any = null;

function initFirebase() {
  if (!firebaseProjectId || !firebasePrivateKey || !firebaseClientEmail) {
    console.warn("Firebase Admin credentials missing. Auth and Firestore will be disabled.");
    return;
  }
  try {
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseProjectId,
          privateKey: firebasePrivateKey,
          clientEmail: firebaseClientEmail,
        }),
      });
    }
    if (admin.apps && admin.apps.length > 0) {
      db = admin.firestore();
      console.log("Firebase Admin initialized. Firestore is available.");
    } else {
      console.warn("Firebase Admin not available after initializeApp().");
    }
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err);
    db = null;
  }
}
initFirebase();

// ── Middleware: verify Firebase ID token ────────────────────────
async function verifyFirebaseToken(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    // If Firebase Admin is not initialized, skip verification and treat as unauthenticated
    if (!admin.apps || admin.apps.length === 0) {
      req.user = null;
      return next();
    }
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }
    const token = authHeader.split(" ")[1];
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = { uid: decoded.uid };
    } catch (err) {
      console.error("Token verification failed:", err);
      req.user = null;
    }
    next();
  } catch (err) {
    // Never let auth verification crash the request.
    console.error("verifyFirebaseToken unexpected error:", err);
    req.user = null;
    next();
  }
}

// ── Apply to all /api/generate-* endpoints ──────────────────────
app.use("/api/generate-*", verifyFirebaseToken);

// ── Shared helpers ──────────────────────────────────────────────
function extractJson(text: string): any {
  let candidate = text.trim();
  // Strip markdown code fences if present
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidate = fenceMatch[1].trim();

  // Find the first { and last } – assume it's JSON
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  try {
    return JSON.parse(candidate);
  } catch (e) {
    // If first parse fails, try to repair brackets
    const repaired = repairJsonBrackets(candidate);
    try {
      return JSON.parse(repaired);
    } catch (e2) {
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
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      } else {
        continue;
      }
      result += ch;
      continue;
    }
    result += ch;
  }
  while (stack.length > 0) {
    result += stack.pop();
  }
  return result;
}

// ── OpenRouter config ──────────────────────────────────────────────
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ── Base system instruction ──────────────────────────────────────
const baseSystemInstruction = `You are Polaris, a world-class scientific mentor, university advisor, and educator. Your mission is to nurture independent inquiry in high school students (ages 14-18) worldwide.

When a student shares their interests and constraints, you must:
1. Calibrate STRICTLY to the math and programming background they actually reported — do not assume familiarity with anything beyond it. If they said "school-level math" or "just calculus," do not reference topics like PDEs, tensor calculus, or advanced linear algebra without a plain-English explanation first.
2. Every time you introduce a technical term, acronym, or piece of jargon (e.g. "PINN," "Navier-Stokes," "surrogate model"), immediately follow it with a short plain-English gloss in parentheses or the same sentence.
3. Provide high-quality, practical advice. Recommend specific textbooks, standard peer-reviewed literature, and concrete software tools (e.g., Python, LaTeX/Overleaf, Jupyter, R, Pandas, PyTorch, QGIS) appropriate to their stated skill level.
4. Write only in English. Never insert stray characters, words, or script from other languages/alphabets anywhere in the output.
5. Do not formulate questions or experiments that are unrealistic (e.g., do not suggest wet-lab CRISPR editing or supercomputer modeling if they only have a standard laptop and no school lab).
6. Be structured, rigorous, encouraging, and clear. Avoid generic placeholder sentences; make every field detailed, specialized, and highly descriptive — but always in language the student can actually understand given their stated background.
7. You must respond with ONLY a single valid JSON object matching the structure given by the user. Do not wrap it in markdown code fences. Do not include any text before or after the JSON.`;

// ── Firestore stats functions ────────────────────────────────────
async function incrementUsageStats(type: string) {
  if (!db) return;
  try {
    const statsRef = db.collection("stats").doc("global");
    await statsRef.set(
      {
        totalGenerations: admin.firestore.FieldValue.increment(1),
        byType: { [type]: admin.firestore.FieldValue.increment(1) },
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to update Firestore stats:", err);
  }
}

// ── Generic endpoint creator ──────────────────────────────────────
function createGenerateEndpoint(
  route: string,
  schemaDescription: string,
  promptBuilder: (answers: any) => string,
  statsKey: string
) {
  app.post(route, async (req: any, res) => {
    try {
      const { answers, model = OPENROUTER_MODEL } = req.body;
      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ error: "Answers object is required." });
      }
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        console.error(`[${route}] OPENROUTER_API_KEY environment variable is missing.`);
        return res.status(500).json({ error: "OPENROUTER_API_KEY environment variable is missing on the server." });
      }

      const userPrompt = promptBuilder(answers);
      const systemInstruction = baseSystemInstruction + "\n\n" +
        `Respond with a single JSON object matching this schema:\n${schemaDescription}`;

      let openRouterResponse;
      try {
        openRouterResponse = await fetch(OPENROUTER_URL, {
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
            reasoning:{
              effort:"low"
            }
          }),
        });
      } catch (fetchErr: any) {
        console.error(`[${route}] Network error calling OpenRouter:`, fetchErr);
        return res.status(502).json({ error: "Could not reach the AI provider (network error)." });
      }

      if (!openRouterResponse.ok) {
        const errorBody = await openRouterResponse.text().catch(() => "");
        console.error(`OpenRouter error (${openRouterResponse.status}):`, errorBody);
        return res.status(502).json({ error: `OpenRouter API request failed with status ${openRouterResponse.status}.` });
      }

      const data = await openRouterResponse.json();
      const messageContent = data?.choices?.[0]?.message?.content;
      if (!messageContent || typeof messageContent !== "string") {
        console.error("OpenRouter unexpected payload:", JSON.stringify(data));
        return res.status(502).json({ error: "OpenRouter API returned an empty or malformed response." });
      }

      let parsedData;
      try {
        parsedData = extractJson(messageContent);
      } catch (parseErr) {
        console.error("Failed to parse JSON:", messageContent);
        return res.status(502).json({ error: "Failed to parse the AI provider's response as JSON." });
      }

      // ── Save to Firestore if user is authenticated ──────────
      const uid = req.user?.uid;
      if (uid && db) {
        try {
          const roadmapData = {
            roadmap: parsedData,
            answers: answers,
            navigatorType: statsKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          await db.collection("users").doc(uid).collection("roadmaps").add(roadmapData);
        } catch (err) {
          console.error("Failed to save roadmap to Firestore:", err);
        }
      }

      await incrementUsageStats(statsKey);
      res.json(parsedData);
    } catch (error: any) {
      console.error(`Error in ${route}:`, error);
      res.status(500).json({ error: error?.message || "Failed to generate plan." });
    }
  });
}

// ── Define all endpoints ────────────────────────────────────────

// Research
const researchSchema = `{
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
createGenerateEndpoint(
  "/api/generate-roadmap",
  researchSchema,
  (answers) => {
    const formatted = Object.entries(answers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");
    return `The student's profile is compiled below:\n${formatted}\n\nAs their experienced research mentor, analyze their background, available time, current skills, and interests. Generate a tailored research roadmap for them.`;
  },
  "research"
);

// Science Fair
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

// Olympiad (stub – complete later)
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
createGenerateEndpoint("/api/generate-olympiad", olympiadSchema, (a) => "Olympiad preparation", "olympiad");

// Portfolio
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
createGenerateEndpoint("/api/generate-portfolio", portfolioSchema, (a) => "Portfolio plan", "portfolio");

// Debate
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
createGenerateEndpoint("/api/generate-debate", debateSchema, (a) => "Debate case", "debate");

// Project Builder
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
createGenerateEndpoint("/api/generate-project", projectSchema, (a) => "Project plan", "project");

// Learning Planner
const learningSchema = `{
  "learningGoalSummary": string,
  "recommendedResource": string,
  "topicBreakdown": [{ "topic": string, "whyItMatters": string, "prerequisiteOf": string[] }],
  "weeklySchedule": [{ "weekNumber": string, "topics": string[], "practiceRecommendation": string }],
  "selfCheckMilestones": string[],
  "commonStumblingBlocks": string[],
  "nextThreeActions": string[]
}`;
createGenerateEndpoint("/api/generate-learning", learningSchema, (a) => "Learning plan", "learning");

// Paper Reviewer
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
createGenerateEndpoint("/api/generate-paper", paperSchema, (a) => "Paper review", "paper");

// Career Explorer
const careerSchema = `{
  "fieldOverview": string,
  "specializationOptions": [{ "name": string, "description": string, "whatItInvolves": string }],
  "howToFindLabs": string[],
  "internshipProgramTypes": [{ "type": string, "description": string, "typicalTimeline": string }],
  "gradSchoolPathOverview": string,
  "nextThreeActions": string[]
}`;
createGenerateEndpoint("/api/generate-career", careerSchema, (a) => "Career plan", "career");

// ── Journal Summary (separate, no Firestore save) ──────────────
app.post("/api/summarize-journal", async (req, res) => {
  try {
    const { entries, model = OPENROUTER_MODEL } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "Entries array is required and must not be empty." });
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("[/api/summarize-journal] OPENROUTER_API_KEY missing.");
      return res.status(500).json({ error: "OPENROUTER_API_KEY environment variable is missing on the server." });
    }

    const entriesText = entries.map((e, i) =>
      `Entry ${i+1}: Date: ${e.date}, Work: ${e.work}, Blockers: ${e.blockers || 'None'}, Next: ${e.next || 'None'}`
    ).join("\n");

    const userPrompt = `Here are the student's recent journal entries:\n${entriesText}\n\nSummarise the period, assess momentum, identify recurring blockers, and suggest next steps. Respond with JSON matching the given schema.`;
    const systemInstruction = baseSystemInstruction + `\n\nRespond with a JSON object matching this schema:
    {
      "periodSummary": string,
      "momentum": string,
      "recurringBlockers": string[],
      "suggestedNextSteps": string[]
    }`;

    let openRouterResponse;
    try {
      openRouterResponse = await fetch(OPENROUTER_URL, {
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
        }),
      });
    } catch (fetchErr: any) {
      console.error("Network error calling OpenRouter (journal):", fetchErr);
      return res.status(502).json({ error: "Could not reach the AI provider (network error)." });
    }

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text().catch(() => "");
      console.error(`OpenRouter error (${openRouterResponse.status}):`, errorBody);
      return res.status(502).json({ error: `OpenRouter API request failed with status ${openRouterResponse.status}.` });
    }

    const data = await openRouterResponse.json();
    const messageContent = data?.choices?.[0]?.message?.content;
    if (!messageContent || typeof messageContent !== "string") {
      return res.status(502).json({ error: "OpenRouter returned empty or malformed response." });
    }

    let parsedData;
    try {
      parsedData = extractJson(messageContent);
    } catch (parseErr) {
      console.error("Failed to parse journal summary JSON:", messageContent);
      return res.status(502).json({ error: "Failed to parse summary JSON." });
    }

    incrementUsageStats("journal");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Journal summary error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate summary." });
  }
});

// ── History endpoints ────────────────────────────────────────────
app.get("/api/history", verifyFirebaseToken, async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "You must be signed in to view history." });
  }
  if (!db) {
    return res.status(500).json({ error: "Firestore not available." });
  }
  try {
    const snap = await db
      .collection("users")
      .doc(req.user.uid)
      .collection("roadmaps")
      .orderBy("createdAt", "desc")
      .get();
    const items: any[] = [];
    snap.forEach((doc: any) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        navigatorType: data.navigatorType || "unknown",
        summary: data.roadmap?.researchVision || data.roadmap?.projectTitle || "Untitled",
      });
    });
    res.json(items);
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: "Failed to fetch history." });
  }
});

app.get("/api/history/:id", verifyFirebaseToken, async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "You must be signed in." });
  }
  if (!db) {
    return res.status(500).json({ error: "Firestore not available." });
  }
  try {
    const doc = await db
      .collection("users")
      .doc(req.user.uid)
      .collection("roadmaps")
      .doc(req.params.id)
      .get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Roadmap not found." });
    }
    const data = doc.data();
    res.json({
      roadmap: data?.roadmap,
      answers: data?.answers,
      navigatorType: data?.navigatorType,
      createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
    });
  } catch (err) {
    console.error("Error fetching roadmap:", err);
    res.status(500).json({ error: "Failed to fetch roadmap." });
  }
});

// ── Stats endpoint ──────────────────────────────────────────────
app.get("/api/stats", async (req, res) => {
  if (!db) {
    return res.json({ totalGenerations: 0, byType: {} });
  }
  try {
    const doc = await db.collection("stats").doc("global").get();
    if (!doc.exists) {
      return res.json({ totalGenerations: 0, byType: {} });
    }
    const data = doc.data();
    res.json({
      totalGenerations: data?.totalGenerations || 0,
      byType: data?.byType || {},
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
});

// ── Global error handler (must be last) ─────────────────────────
// Guarantees the client always gets JSON back with an `.error` field,
// even if something upstream throws synchronously and skips a route's
// own try/catch. This is what stops a raw, bodyless 500 from reaching
// the frontend.
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[GLOBAL ERROR HANDLER]", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || "Unexpected server error." });
});

export default app;
