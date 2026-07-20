import express from "express";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

dotenv.config();

const app = express();
app.use(express.json());

// ── Firebase Admin Initialisation ──────────────────────────────
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (firebaseProjectId && firebasePrivateKey && firebaseClientEmail) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseProjectId,
      privateKey: firebasePrivateKey,
      clientEmail: firebaseClientEmail,
    }),
  });
} else {
  console.warn("Firebase Admin credentials missing. Auth and Firestore will be disabled.");
}

const db = admin.firestore();

// ── Middleware: verify Firebase ID token ────────────────────────
async function verifyFirebaseToken(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null; // anonymous
    return next();
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    req.user = null;
    next(); // still proceed, but treat as anonymous
  }
}

// ── Apply to all /api/generate-* endpoints ──────────────────────
app.use("/api/generate-", verifyFirebaseToken);

// ── Shared helpers (extractJson, repairJsonBrackets) ────────────
function extractJson(text: string): any { /* unchanged */ }
function repairJsonBrackets(text: string): string { /* unchanged */ }

// ── Base system instruction (unchanged) ─────────────────────────
const baseSystemInstruction = `...`; // (copy from your file)

// ── Firestore stats functions ────────────────────────────────────
async function incrementUsageStats(type: string) {
  if (!db) return;
  try {
    const statsRef = db.collection("stats").doc("global");
    await statsRef.set(
      {
        totalGenerations: FieldValue.increment(1),
        byType: { [type]: FieldValue.increment(1) },
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to update Firestore stats:", err);
  }
}

// ── Generic endpoint creator (with saving to Firestore) ──────────
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
          // We still return the roadmap even if saving fails
        }
      }

      // ── Update Firestore stats ─────────────────────────────
      await incrementUsageStats(statsKey);

      res.json(parsedData);
    } catch (error: any) {
      console.error(`Error in ${route}:`, error);
      res.status(500).json({ error: error.message || "Failed to generate plan." });
    }
  });
}

// ── Define all endpoints (your existing ones) ────────────────────
// ... (all the schemas and createGenerateEndpoint calls from your file)
// They remain unchanged.

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
    snap.forEach(doc => {
      const data = doc.data();
      items.push({
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        navigatorType: data.navigatorType || "unknown",
        // we don't send the full roadmap here to keep response small
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

// ── Stats endpoint (now reads from Firestore) ──────────────────
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

// ── Original Research endpoint (kept as is) ─────────────────────
// ... (the large app.post("/api/generate-roadmap", ...) from your file)

export default app;
