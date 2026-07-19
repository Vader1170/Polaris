/**
 * Polaris Research Navigator — Cloudflare Worker API Proxy
 * 
 * Securely proxies questionnaire answers from the client to the Google Gemini 2.5 Flash API.
 * Prevents exposure of your GEMINI_API_KEY to the public frontend.
 * 
 * Deployment:
 * 1. Deploy this code as a Cloudflare Worker.
 * 2. Configure a secret named GEMINI_API_KEY in the Cloudflare dashboard or via Wrangler.
 * 3. Update the API_CONFIG.url in your client-side script.js to point to your Worker's URL.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Or specify your GitHub Pages URL e.g. "https://username.github.io"
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Structured JSON schema to force Gemini to output the exact properties needed by Polaris
const ROADMAP_SCHEMA = {
  type: "object",
  properties: {
    researchVision: {
      type: "string",
      description: "A highly personalized, inspiring but realistic vision statement aligning the user's interests, available time, and background with a compelling scientific frontier."
    },
    recommendedField: {
      type: "string",
      description: "The specific recommended scientific sub-field or research domain (e.g., Computational Neurobiology, behavioral econometrics, numerical fluid dynamics)."
    },
    possibleResearchQuestions: {
      type: "array",
      items: {
        type: "string",
        description: "A high-quality, narrow, testable scientific research question relevant to the recommended field and their skills."
      }
    },
    backgroundReading: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the textbook, review article, or seminal academic paper." },
          author: { type: "string", description: "Author(s) or publication/source name." },
          description: { type: "string", description: "Why this text is crucial for them to read and how it specifically connects to their interest." }
        },
        required: ["title", "author", "description"]
      }
    },
    skillsToLearn: {
      type: "array",
      items: {
        type: "string",
        description: "A concrete technical, mathematical, or scientific skill they must acquire to answer the questions (e.g., basic ordinary differential equations, Python pandas library, image thresholding)."
      }
    },
    weeklyRoadmap: {
      type: "array",
      items: {
        type: "object",
        properties: {
          weekNumber: { type: "string", description: "The week (e.g., Week 1, Week 2, Week 3, Week 4)." },
          objective: { type: "string", description: "The primary milestone or focal point of this week's effort." },
          tasks: {
            type: "array",
            items: {
              type: "string",
              description: "A specific task or action item (e.g., install Python and run a test script, read Chapter 2 of textbook)."
            }
          }
        },
        required: ["weekNumber", "objective", "tasks"]
      }
    },
    softwareTools: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the software tool, framework, or library (e.g., Jupyter Notebooks, Overleaf/LaTeX, RStudio)." },
          purpose: { type: "string", description: "How they will use this tool during their investigation." }
        },
        required: ["name", "purpose"]
      }
    },
    experimentIdeas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title of the proposed experiment, computational modeling run, or data collection protocol." },
          description: { type: "string", description: "Detailed description of the steps, tools, dependent/independent variables, or mathematical controls." }
        },
        required: ["title", "description"]
      }
    },
    publicationChecklist: {
      type: "array",
      items: {
        type: "string",
        description: "A concrete milestone needed to compile their findings into a standard scientific paper structure (e.g., write the methodology section, plot experimental controls, draft the abstract)."
      }
    },
    competitions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of a suitable science fair, competition, journal, or program (e.g., ISEF, local state science fairs, Concord Review)." },
          suitability: { type: "string", description: "Why this competition aligns with their profile, age, and research ambition." }
        },
        required: ["name", "suitability"]
      }
    },
    commonMistakes: {
      type: "array",
      items: {
        type: "string",
        description: "A scientific or methodological pitfall specific to this domain that they must avoid (e.g., not having a negative control, confusing correlation with causation in their dataset)."
      }
    },
    nextThreeActions: {
      type: "array",
      items: {
        type: "string",
        description: "An immediate, completely practical action item they can start on today (e.g., download a specific public dataset from Kaggle, read a free review paper on Google Scholar)."
      }
    }
  },
  required: [
    "researchVision",
    "recommendedField",
    "possibleResearchQuestions",
    "backgroundReading",
    "skillsToLearn",
    "weeklyRoadmap",
    "softwareTools",
    "experimentIdeas",
    "publicationChecklist",
    "competitions",
    "commonMistakes",
    "nextThreeActions"
  ]
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight options
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST requests are accepted." }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }

    try {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY configuration secret is missing in Cloudflare Worker environment." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      // Parse payload
      const { answers, model = "gemini-2.5-flash" } = await request.json();
      if (!answers || typeof answers !== "object") {
        return new Response(JSON.stringify({ error: "Answers object is required in the body." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      // Format student answers into readable profile
      const formattedAnswers = Object.entries(answers)
        .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
        .join("\n");

      // System Instructions
      const systemInstruction = `You are Polaris, a world-class scientific mentor, university advisor, and educator. Your mission is to nurture independent inquiry in high school students (ages 14-18) while maintaining the highest academic standards.

When a student shares their interests and constraints, you must:
1. Speak directly to their intellectual level, calibrating your vocabulary and technical complexity to their background.
2. Provide high-quality, practical advice. Recommend specific textbooks, standard peer-reviewed literature, and concrete software tools (e.g., Python, LaTeX/Overleaf, Jupyter, R, Pandas, PyTorch, QGIS).
3. Do not formulate questions or experiments that are unrealistic (e.g., do not suggest wet-lab CRISPR editing or supercomputer modeling if they only have a standard laptop and no school lab).
4. Be structured, rigorous, encouraging, and clear. Avoid generic placeholder sentences; make every field detailed, specialized, and highly descriptive.`;

      // Prompt
      const prompt = `The student's profile is compiled below:
${formattedAnswers}

As their experienced research mentor, analyze their background, available time, current skills, and interests.
Generate a tailored scientific roadmap for them. It must be highly actionable, realistic for their available weekly hours, and mathematically/logically sound for their described level. 

Make sure the recommendedField, possibleResearchQuestions, and backgroundReading are specific and detailed (e.g. recommend actual books, papers, or standard university textbooks, not generic descriptions). For experimentIdeas, describe how they can utilize their existing resources (e.g. computer with internet, school lab if available) to conduct rigorous investigation.

Provide your analysis in the required JSON schema structure.`;

      // Construct REST call to official Google Generative Language API
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(geminiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ROADMAP_SCHEMA,
            temperature: 0.75
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: `Google API Error: ${response.status} - ${errorText}` }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      const geminiData = await response.json();
      const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        return new Response(JSON.stringify({ error: "Gemini API returned an empty output." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      // Try parsing to verify valid JSON before sending back to client
      const parsedData = JSON.parse(generatedText);

      return new Response(JSON.stringify(parsedData), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || "An unexpected error occurred." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }
  }
};
