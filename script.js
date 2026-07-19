/* =========================================================
   POLARIS — RESEARCH NAVIGATOR & AI ENGINE
   Vanilla JS. No frameworks, no build step.
   Now featuring advanced, beginner-friendly client-to-AI api integrations.
   ========================================================= */

// 1. SINGLE CONFIGURATION OBJECT
// AI Studio automatically injects API secrets on the server.
// If you export this project to run purely as a static site, you can insert
// your direct Gemini API URL, API Key, and Model name here.
const API_CONFIG = {
  url: "/api/generate-roadmap", // Local proxy endpoint for safe, backend-only keys
  apiKey: ""                   // Replace with your API key when exporting
};

(function () {
  "use strict";

  /* ---------------------------------------------------------
     2. QUESTION DEFINITIONS
     Each question knows how to render itself and how to
     read its own value back out of the DOM.
     --------------------------------------------------------- */
  const QUESTIONS = [
    {
      key: "age",
      type: "text",
      inputType: "number",
      label: "How old are you?",
      hint: "This helps calibrate how ambitious your roadmap can be.",
      placeholder: "e.g. 16",
      required: true,
    },
    {
      key: "interests",
      type: "textarea",
      label: "What are you genuinely curious about right now?",
      hint: "Any field, hobby, or question counts — even ones that seem unrelated to school.",
      placeholder: "e.g. how vaccines are designed, why markets crash, how planes stay up...",
      required: true,
    },
    {
      key: "favouriteSubjects",
      type: "checkbox",
      label: "Which subjects do you enjoy most?",
      hint: "Select all that apply.",
      required: true,
      options: [
        "Mathematics", "Physics", "Chemistry", "Biology",
        "Computer Science", "Economics", "Engineering",
        "Humanities / Social Science", "Other",
      ],
    },
    {
      key: "mathBackground",
      type: "radio",
      label: "How would you describe your mathematical background?",
      hint: "Be honest — this shapes what research is actually accessible to you today.",
      required: true,
      options: [
        "Just school-level math",
        "Comfortable with calculus",
        "Comfortable with linear algebra / proofs",
        "Studied topics beyond standard high school math (e.g. olympiad math, real analysis)",
      ],
    },
    {
      key: "programmingExperience",
      type: "radio",
      label: "What's your programming experience?",
      hint: "",
      required: true,
      options: [
        "None yet",
        "Beginner (basic syntax, small scripts)",
        "Intermediate (built small projects independently)",
        "Advanced (comfortable with data structures, libraries, or larger codebases)",
      ],
    },
    {
      key: "availableTime",
      type: "dropdown",
      label: "How much time can you realistically commit each week?",
      hint: "",
      required: true,
      options: [
        "Choose an option",
        "Under 3 hours",
        "3–6 hours",
        "6–10 hours",
        "10+ hours",
      ],
    },
    {
      key: "researchExperience",
      type: "radio",
      label: "Have you done any research before?",
      hint: "",
      required: true,
      options: [
        "None yet",
        "A school project or science fair",
        "An independent project I designed myself",
        "Worked with a mentor, lab, or published something",
      ],
    },
    {
      key: "publicationGoals",
      type: "dropdown",
      label: "Is publishing your research a goal for you?",
      hint: "",
      required: true,
      options: [
        "Choose an option",
        "Not a priority right now",
        "Yes, eventually",
        "Yes — I'm actively aiming for a specific journal or conference",
      ],
    },
    {
      key: "competitionGoals",
      type: "checkbox",
      label: "Are you targeting any competitions?",
      hint: "Select all that apply, or skip if none.",
      required: false,
      options: [
        "Math olympiads (e.g. AMTI, INMO)",
        "Science fairs (e.g. ISEF, AIMER)",
        "RSI / research-focused programs",
        "Coding competitions",
        "None currently",
      ],
    },
    {
      key: "learningStyle",
      type: "radio",
      label: "How do you learn best?",
      hint: "",
      required: true,
      options: [
        "Reading textbooks and papers on my own",
        "Watching lectures or video explanations",
        "Working through problems hands-on",
        "Discussing ideas with a mentor or peers",
      ],
    },
    {
      key: "resourcesAvailable",
      type: "checkbox",
      label: "What resources do you currently have access to?",
      hint: "Select all that apply.",
      required: true,
      options: [
        "A mentor or teacher who can guide me",
        "A computer and stable internet",
        "A library or paid journal access",
        "A school lab or research facility",
        "None of the above yet",
      ],
    },
    {
      key: "biggestChallenge",
      type: "textarea",
      label: "What's the biggest thing holding you back right now?",
      hint: "Time, direction, resources, confidence — anything.",
      placeholder: "e.g. I don't know how to find a research question worth pursuing...",
      required: true,
    },
    {
      key: "dreamProject",
      type: "textarea",
      label: "If nothing could stop you, what would your dream project be?",
      hint: "Think big — this shapes the direction Polaris points you toward.",
      placeholder: "e.g. build a model that predicts...",
      required: false,
    },
    {
      key: "careerAspirations",
      type: "text",
      inputType: "text",
      label: "What's your long-term career aspiration?",
      hint: "It's okay if this is a rough guess.",
      placeholder: "e.g. aerospace engineer, research scientist, founder...",
      required: false,
    },
    {
      key: "currentGoal",
      type: "dropdown",
      label: "What's your single most immediate goal right now?",
      hint: "",
      required: true,
      options: [
        "Choose an option",
        "Finding a research topic",
        "Preparing for a competition",
        "Preparing for university admissions (e.g. MIT, Cambridge)",
        "Building technical skills",
        "Writing or publishing a paper",
      ],
    },
  ];

  /* ---------------------------------------------------------
     3. STATE
     answers: the single structured object every response
     is written into, keyed by question.key.
     --------------------------------------------------------- */
  const state = {
    currentIndex: 0,
    direction: "forward", // controls slide-in animation direction
    answers: {},
  };

  /* ---------------------------------------------------------
     4. DOM REFERENCES
     --------------------------------------------------------- */
  const isNavigatorPage = document.getElementById("navigator") !== null;
  if (!isNavigatorPage) return;

  const introEl = document.getElementById("navigator-intro");
  const startBtn = document.getElementById("start-navigator-btn");
  const formEl = document.getElementById("navigator-form");
  const viewportEl = document.getElementById("question-viewport");
  const progressFillEl = document.getElementById("progress-fill");
  const currentStepEl = document.getElementById("current-step");
  const totalStepsEl = document.getElementById("total-steps");
  const errorEl = document.getElementById("form-error");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  
  // New and Updated DOM targets
  const completeEl = document.getElementById("navigator-complete");
  const loadingEl = document.getElementById("navigator-loading");
  const errorScreenEl = document.getElementById("navigator-error");
  const roadmapContainerEl = document.getElementById("roadmap-container");
  
  const resultsOutputEl = document.getElementById("results-output");
  const restartBtn = document.getElementById("restart-btn");
  const generateRoadmapBtn = document.getElementById("generate-roadmap-btn");
  
  // Loading screen dynamic text/bars
  const loadingMessageEl = document.getElementById("loading-message");
  const loadingProgressFillEl = document.getElementById("loading-progress-fill");
  const loadingProgressTextEl = document.getElementById("loading-progress-text");
  
  // Roadmap page targets
  const roadmapVisionTitleEl = document.getElementById("roadmap-vision-title");
  const roadmapVisionTextEl = document.getElementById("roadmap-vision-text");
  const roadmapGridEl = document.getElementById("roadmap-grid");
  const printReportBtn = document.getElementById("download-report-btn");
  const restartFromRoadmapBtn = document.getElementById("restart-from-roadmap-btn");
  const regenerateRoadmapBtn = document.getElementById("regenerate-roadmap-btn");
  
  // Error page buttons
  const retryGenerationBtn = document.getElementById("retry-generation-btn");
  const errorBackBtn = document.getElementById("error-back-btn");
  const errorMessageTextEl = document.getElementById("error-message");

  totalStepsEl.textContent = QUESTIONS.length;

  /* ---------------------------------------------------------
     5. RENDERING QUESTIONS
     --------------------------------------------------------- */

  function renderQuestion(index) {
    const question = QUESTIONS[index];
    const slide = document.createElement("div");
    slide.className = "question-slide" + (state.direction === "back" ? " slide-back" : "");

    const label = document.createElement("h3");
    label.className = "question-label";
    label.textContent = question.label;
    label.id = `q-${question.key}-label`;
    slide.appendChild(label);

    if (question.hint) {
      const hint = document.createElement("p");
      hint.className = "question-hint";
      hint.textContent = question.hint;
      slide.appendChild(hint);
    }

    const savedValue = state.answers[question.key];

    if (question.type === "text") {
      const input = document.createElement("input");
      input.className = "field-text";
      input.type = question.inputType || "text";
      input.id = question.key;
      input.name = question.key;
      input.placeholder = question.placeholder || "";
      input.setAttribute("aria-labelledby", label.id);
      if (savedValue) input.value = savedValue;
      slide.appendChild(input);
    }

    if (question.type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.className = "field-textarea";
      textarea.id = question.key;
      textarea.name = question.key;
      textarea.placeholder = question.placeholder || "";
      textarea.setAttribute("aria-labelledby", label.id);
      textarea.rows = 4;
      if (savedValue) textarea.value = savedValue;
      slide.appendChild(textarea);
    }

    if (question.type === "dropdown") {
      const select = document.createElement("select");
      select.className = "field-select";
      select.id = question.key;
      select.name = question.key;
      select.setAttribute("aria-labelledby", label.id);
      question.options.forEach((optionText, i) => {
        const option = document.createElement("option");
        option.value = i === 0 ? "" : optionText;
        option.textContent = optionText;
        select.appendChild(option);
      });
      if (savedValue) select.value = savedValue;
      slide.appendChild(select);
    }

    if (question.type === "radio" || question.type === "checkbox") {
      const list = document.createElement("div");
      list.className = "option-list";
      list.setAttribute("role", question.type === "radio" ? "radiogroup" : "group");
      list.setAttribute("aria-labelledby", label.id);

      const savedArray = Array.isArray(savedValue) ? savedValue : [];

      question.options.forEach((optionText, i) => {
        const item = document.createElement("label");
        item.className = "option-item";

        const input = document.createElement("input");
        input.type = question.type;
        input.name = question.key;
        input.value = optionText;
        input.id = `${question.key}-${i}`;

        if (question.type === "radio") {
          if (savedValue === optionText) input.checked = true;
        } else {
          if (savedArray.includes(optionText)) input.checked = true;
        }

        const span = document.createElement("span");
        span.textContent = optionText;

        item.appendChild(input);
        item.appendChild(span);
        list.appendChild(item);
      });

      slide.appendChild(list);
    }

    viewportEl.innerHTML = "";
    viewportEl.appendChild(slide);

    const firstField = slide.querySelector("input, textarea, select");
    if (firstField) firstField.focus({ preventScroll: true });
  }

  function updateChrome() {
    const total = QUESTIONS.length;
    const percent = ((state.currentIndex + 1) / total) * 100;
    progressFillEl.style.width = percent + "%";
    currentStepEl.textContent = state.currentIndex + 1;

    prevBtn.disabled = state.currentIndex === 0;
    prevBtn.style.visibility = state.currentIndex === 0 ? "hidden" : "visible";
    nextBtn.textContent = state.currentIndex === total - 1 ? "Finish" : "Continue";

    errorEl.textContent = "";
  }

  /* ---------------------------------------------------------
     6. CAPTURING & VALIDATING ANSWERS
     --------------------------------------------------------- */

  function captureCurrentAnswer() {
    const question = QUESTIONS[state.currentIndex];

    if (question.type === "text" || question.type === "textarea" || question.type === "dropdown") {
      const field = document.getElementById(question.key);
      state.answers[question.key] = field.value.trim();
    }

    if (question.type === "radio") {
      const checked = viewportEl.querySelector(`input[name="${question.key}"]:checked`);
      state.answers[question.key] = checked ? checked.value : "";
    }

    if (question.type === "checkbox") {
      const checked = viewportEl.querySelectorAll(`input[name="${question.key}"]:checked`);
      state.answers[question.key] = Array.from(checked).map((el) => el.value);
    }
  }

  function validateCurrentAnswer() {
    const question = QUESTIONS[state.currentIndex];
    if (!question.required) return "";

    const value = state.answers[question.key];

    if (question.type === "checkbox") {
      if (!value || value.length === 0) return "Please select at least one option.";
      return "";
    }

    if (!value || value.length === 0) {
      return "This question needs an answer before you can continue.";
    }

    if (question.type === "text" && question.inputType === "number") {
      const num = Number(value);
      if (Number.isNaN(num) || num <= 0 || num > 100) {
        return "Please enter a valid age.";
      }
    }

    return "";
  }

  /* ---------------------------------------------------------
     7. NAVIGATION
     --------------------------------------------------------- */

  function goToStep(index, direction) {
    state.direction = direction;
    state.currentIndex = index;
    renderQuestion(index);
    updateChrome();
  }

  function handleNext() {
    captureCurrentAnswer();
    const error = validateCurrentAnswer();

    if (error) {
      errorEl.textContent = error;
      return;
    }

    if (state.currentIndex === QUESTIONS.length - 1) {
      finishNavigator();
      return;
    }

    goToStep(state.currentIndex + 1, "forward");
  }

  function handlePrev() {
    captureCurrentAnswer();
    if (state.currentIndex === 0) return;
    goToStep(state.currentIndex - 1, "back");
  }

  /* ---------------------------------------------------------
     8. FINISH & DYNAMIC PROGRESS LOADERS
     --------------------------------------------------------- */

  function startNavigator() {
    introEl.hidden = true;
    formEl.hidden = false;
    goToStep(0, "forward");
    formEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function finishNavigator() {
    formEl.hidden = true;
    completeEl.hidden = false;

    const profile = {
      submittedAt: new Date().toISOString(),
      answers: state.answers,
    };

    resultsOutputEl.textContent = JSON.stringify(profile, null, 2);
    window.polarisNavigatorProfile = profile;
    completeEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateLoadingStatus(msg, progressPercent) {
    if (loadingMessageEl) loadingMessageEl.textContent = msg;
    if (loadingProgressFillEl && progressPercent !== undefined) {
      loadingProgressFillEl.style.width = `${progressPercent}%`;
    }
  }

  /* ---------------------------------------------------------
     9. AI ROADMAP GENERATION (ABORT/RETRY/PROXY & DIRECT MODE)
     --------------------------------------------------------- */

  // Progress message sequence to keep user engaged
  const PROGRESS_MESSAGES = [
    { text: "Step 1 of 4: Synthesizing academic profile...", pct: 15 },
    { text: "Step 1 of 4: Mapping interest vectors to focus areas...", pct: 28 },
    { text: "Step 2 of 4: Scanning modern scientific literature indices...", pct: 45 },
    { text: "Step 2 of 4: Crafting custom study guides and books list...", pct: 58 },
    { text: "Step 3 of 4: Simulating weekly schedule allocations...", pct: 72 },
    { text: "Step 3 of 4: Framing viable laboratory/code experiments...", pct: 85 },
    { text: "Step 4 of 4: Fine-tuning publication benchmarks...", pct: 93 },
    { text: "Step 4 of 4: Finalizing true north report layout...", pct: 98 }
  ];

  async function generateRoadmap() {
    completeEl.hidden = true;
    loadingEl.hidden = false;
    loadingEl.scrollIntoView({ behavior: "smooth", block: "start" });

    // Staggered animated status updates
    let msgIndex = 0;
    const progressInterval = setInterval(() => {
      if (msgIndex < PROGRESS_MESSAGES.length) {
        const stage = PROGRESS_MESSAGES[msgIndex];
        if (loadingProgressTextEl) loadingProgressTextEl.textContent = stage.text;
        updateLoadingStatus("Calibrating research coordinates for " + (state.answers.interests ? '"' + state.answers.interests.substring(0, 30) + '..."' : "your interests"), stage.pct);
        msgIndex++;
      }
    }, 2800);

    try {
      const data = await callAiApi(state.answers);
      clearInterval(progressInterval);
      
      // Successfully got the response, render and display it!
      renderRoadmapReport(data);
      loadingEl.hidden = true;
      roadmapContainerEl.hidden = false;
      roadmapContainerEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Roadmap Generation Failed:", error);
      
      // Display Graceful Error Page
      if (errorMessageTextEl) {
        errorMessageTextEl.innerHTML = `Polaris encountered an error compiling your roadmap:<br><span style="font-family: var(--font-mono); font-size: 0.85rem; color: #F0A08D; margin-top: 10px; display: inline-block;">${error.message || "Unknown error occurred"}</span>`;
      }
      loadingEl.hidden = true;
      errorScreenEl.hidden = false;
      errorScreenEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Pure Client-side prompt builder used when direct API keys are present (static export)
  function createClientPrompt(answers) {
    const formattedAnswers = Object.entries(answers)
      .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(", ") : val}`)
      .join("\n");

    return `You are Polaris, an elite scientific mentor. Based on this profile:
${formattedAnswers}

Generate a structured JSON roadmap matching this exact structure:
{
  "researchVision": "A highly personalized, inspiring but realistic vision statement aligning the user's interests, available time, and background with a compelling scientific frontier.",
  "recommendedField": "Specific recommended scientific sub-field or research domain name.",
  "possibleResearchQuestions": ["Question 1", "Question 2"],
  "backgroundReading": [
    { "title": "Textbook/Paper Title", "author": "Author(s)", "description": "Why this reading is perfect for them." }
  ],
  "skillsToLearn": ["Skill 1", "Skill 2"],
  "weeklyRoadmap": [
    { "weekNumber": "Week 1", "objective": "Focus objective.", "tasks": ["Task 1", "Task 2"] }
  ],
  "softwareTools": [
    { "name": "Software/Library", "purpose": "How it contributes." }
  ],
  "experimentIdeas": [
    { "title": "Experiment 1", "description": "Detailed description of steps and controls." }
  ],
  "publicationChecklist": ["Checklist Item 1"],
  "competitions": [
    { "name": "Competition Name", "suitability": "Why this fits their profile." }
  ],
  "commonMistakes": ["Avoid pitfall 1"],
  "nextThreeActions": ["Action 1", "Action 2", "Action 3"]
}

Ensure the response is ONLY a single minified raw JSON string. Do not enclose it in backticks or markdown codeblocks.`;
  }

  // API Fetch Engine with AbortTimeout and Exponential Retries
  async function callAiApi(answers, attempt = 1, maxAttempts = 3) {
    const timeoutMs = 45000; // Increased timeout for deep synthesis
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let url = API_CONFIG.url;
      let headers = {
        "Content-Type": "application/json"
      };
      let body = {};

      const isProxy = url.startsWith("/api/") || !url.includes("generativelanguage.googleapis.com");

      if (isProxy) {
        body = JSON.stringify({
          answers: answers
        });
      }

      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMsg = `Coordinates server error: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const rawData = await response.json();
      
      // Parse output
      if (isProxy) {
        return rawData;
      } else {
        const generatedText = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!generatedText) {
          throw new Error("No generative contents were output by the AI coordinate engine.");
        }
        return JSON.parse(generatedText);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === "AbortError";
      
      console.warn(`[AI Engine] Attempt ${attempt} failed:`, err.message || (isTimeout ? "Timeout" : "Unknown"));

      if (attempt < maxAttempts) {
        const retryDelay = Math.pow(2, attempt) * 1500; // Exponential backup
        if (loadingProgressTextEl) {
          loadingProgressTextEl.textContent = `Attempt ${attempt} failed. Retrying in ${retryDelay / 1000}s...`;
        }
        await new Promise(res => setTimeout(res, retryDelay));
        return callAiApi(answers, attempt + 1, maxAttempts);
      } else {
        throw isTimeout ? new Error("Connecting to the AI engine took too long. Check your internet connection or key and try again.") : err;
      }
    }
  }

  /* ---------------------------------------------------------
     10. DYNAMIC REPORT RENDERING
     --------------------------------------------------------- */

  function renderRoadmapReport(data) {
    if (!roadmapGridEl) return;

    // Set high-level vision and titles
    if (roadmapVisionTitleEl) {
      roadmapVisionTitleEl.textContent = `Path to True North: ${data.recommendedField || data.recommendedResearchArea || "Your Research Journey"}`;
    }
    if (roadmapVisionTextEl) {
      roadmapVisionTextEl.textContent = data.researchVision || "Your tailored roadmap.";
    }

    roadmapGridEl.innerHTML = "";

    // 1. Recommended Field of Inquiry
    const recommendedFieldValue = data.recommendedField || data.recommendedResearchArea || "Not specified";
    createFullWidthCard(
      "Recommended Field of Inquiry",
      `<p style="font-size: 1.25rem; color: var(--gold-bright); font-family: var(--font-display); font-weight: 500; margin-bottom: 12px; border-left: 2px solid var(--gold); padding-left: 12px;">${recommendedFieldValue}</p>
       <p style="margin-top: 10px;">${data.researchVision || ""}</p>`,
      "✦",
      false
    );

    // 2. Possible Research Questions
    const questionsList = data.possibleResearchQuestions || data.possibleExperiments || [];
    if (questionsList.length > 0) {
      const questionsHtml = questionsList.map(q => {
        const text = typeof q === 'object' ? (q.title || q.description) : q;
        return `<li style="margin-bottom: 12px; border-bottom: 1px solid rgba(247, 245, 240, 0.03); padding-bottom: 8px;">
          <strong style="color: var(--paper);">${text}</strong>
        </li>`;
      }).join("");
      createGridCard("Possible Research Questions", `<ol style="padding-left: 18px; margin-top: 4px;">${questionsHtml}</ol>`, "❓");
    }

    // 3. Suggested Background Reading
    const readingList = data.backgroundReading || data.suggestedReadingList || [];
    if (readingList.length > 0) {
      const readingsHtml = readingList.map(book => `
        <li style="margin-bottom: 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.05); padding-bottom: 12px; list-style: none;">
          <strong style="display: block; font-size: 1.05rem; color: var(--paper);">${book.title}</strong>
          <span style="font-size: 0.85rem; font-family: var(--font-mono); color: var(--gold-bright); display: block; margin-top: 2px;">By ${book.author}</span>
          <p style="margin: 6px 0 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.7);">${book.description}</p>
        </li>
      `).join("");
      createGridCard("Suggested Background Reading", `<ul style="padding-left: 0;">${readingsHtml}</ul>`, "📖");
    }

    // 4. Skills To Learn
    if (data.skillsToLearn && data.skillsToLearn.length > 0) {
      const skillsHtml = data.skillsToLearn.map(skill => `<li>${skill}</li>`).join("");
      createGridCard("Skills To Learn", `<ul class="roadmap-card-mono-list">${skillsHtml}</ul>`, "🛠️");
    }

    // 5. Weekly Roadmap (4-Week Plan)
    const weeks = data.weeklyRoadmap || data.weeklyPlan || [];
    if (weeks.length > 0) {
      const weeklyHtml = weeks.map(week => `
        <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.05); padding-bottom: 12px;">
          <strong style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--gold-bright); display: block; text-transform: uppercase;">${week.weekNumber}</strong>
          <span style="font-weight: 600; display: block; margin: 4px 0 8px; color: var(--paper);">${week.objective}</span>
          <ul style="padding-left: 16px; margin: 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.75);">
            ${week.tasks.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join("")}
          </ul>
        </div>
      `).join("");
      createFullWidthCard("Weekly Roadmap (4-Week Plan)", weeklyHtml, "📅");
    }

    // 6. Recommended Software & Tools
    const tools = data.softwareTools || data.recommendedSoftware || [];
    if (tools.length > 0) {
      const softwareHtml = tools.map(soft => `
        <li style="margin-bottom: 12px; list-style: none;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${soft.name}</strong>
          <span style="color: rgba(247, 245, 240, 0.7); font-size: 0.9rem; display: block; margin-top: 2px;">${soft.purpose}</span>
        </li>
      `).join("");
      createGridCard("Recommended Software & Tools", `<ul style="padding-left: 0;">${softwareHtml}</ul>`, "💻");
    }

    // 7. Possible Experiments & Methodology
    const experiments = data.experimentIdeas || data.possibleExperiments || [];
    if (experiments.length > 0) {
      const experimentsHtml = experiments.map(exp => `
        <li style="margin-bottom: 16px; list-style: none; border-left: 2px solid var(--gold); padding-left: 12px;">
          <strong style="color: var(--gold-bright); display: block; font-size: 1.02rem;">${exp.title}</strong>
          <p style="margin: 4px 0 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.7);">${exp.description}</p>
        </li>
      `).join("");
      createGridCard("Possible Experiments & Methodology", `<ul style="padding-left: 0;">${experimentsHtml}</ul>`, "🔬");
    }

    // 8. Publication Prep Checklist
    if (data.publicationChecklist && data.publicationChecklist.length > 0) {
      const pubHtml = data.publicationChecklist.map(item => `<li style="margin-bottom: 8px;">✔️ ${item}</li>`).join("");
      createGridCard("Publication Prep Checklist", `<ul style="list-style: none; padding-left: 0; font-size: 0.92rem;">${pubHtml}</ul>`, "📝");
    }

    // 9. Potential Competitions & Programs
    const comps = data.competitions || data.potentialCompetitions || [];
    if (comps.length > 0) {
      const competitionsHtml = comps.map(comp => `
        <li style="margin-bottom: 12px; list-style: none; background: rgba(247, 245, 240, 0.02); padding: 12px; border-radius: 6px;">
          <strong style="color: var(--paper);">${comp.name}</strong>
          <p style="margin: 4px 0 0; font-size: 0.88rem; color: rgba(247, 245, 240, 0.65);">${comp.suitability}</p>
        </li>
      `).join("");
      createGridCard("Potential Competitions & Programs", `<ul style="padding-left: 0;">${competitionsHtml}</ul>`, "🏆");
    }

    // 10. Common Pitfalls & Mistakes
    if (data.commonMistakes && data.commonMistakes.length > 0) {
      const mistakesHtml = data.commonMistakes.map(item => `<li>${item}</li>`).join("");
      createGridCard("Common Pitfalls & Mistakes", `<ul style="padding-left: 20px; color: #F0A08D;">${mistakesHtml}</ul>`, "⚠️");
    }

    // 11. Your Next Three Actions
    if (data.nextThreeActions && data.nextThreeActions.length > 0) {
      const actionsHtml = data.nextThreeActions.map((action, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${action}</p>
        </div>
      `).join("");
      createFullWidthCard("Your Next Three Actions", actionsHtml, "🚀", false);
    }
  }

  function createGridCard(title, innerContent, iconStr = "✦", collapsible = true) {
    const card = document.createElement("div");
    card.className = "roadmap-card";
    
    card.innerHTML = `
      <h3 style="cursor: ${collapsible ? 'pointer' : 'default'}; display: flex; justify-content: space-between; align-items: center; user-select: none; margin: 0 0 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.08); padding-bottom: 10px;">
        <span style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--gold); font-size: 1rem;">${iconStr}</span>
          ${title}
        </span>
        ${collapsible ? '<button type="button" class="collapse-toggle">[ collapse ]</button>' : ''}
      </h3>
      <div class="card-content" style="transition: all 0.3s ease;">
        ${innerContent}
      </div>
    `;
    
    if (collapsible) {
      const h3 = card.querySelector("h3");
      const toggle = card.querySelector(".collapse-toggle");
      const content = card.querySelector(".card-content");
      h3.addEventListener("click", () => {
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "block" : "none";
        toggle.textContent = isCollapsed ? "[ collapse ]" : "[ expand ]";
        card.style.opacity = isCollapsed ? "1" : "0.85";
      });
    }
    
    roadmapGridEl.appendChild(card);
  }

  function createFullWidthCard(title, innerContent, iconStr = "✦", collapsible = true) {
    const card = document.createElement("div");
    card.className = "roadmap-card full-width";
    
    card.innerHTML = `
      <h3 style="cursor: ${collapsible ? 'pointer' : 'default'}; display: flex; justify-content: space-between; align-items: center; user-select: none; margin: 0 0 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.08); padding-bottom: 10px;">
        <span style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--gold); font-size: 1rem;">${iconStr}</span>
          ${title}
        </span>
        ${collapsible ? '<button type="button" class="collapse-toggle">[ collapse ]</button>' : ''}
      </h3>
      <div class="card-content" style="transition: all 0.3s ease;">
        ${innerContent}
      </div>
    `;
    
    if (collapsible) {
      const h3 = card.querySelector("h3");
      const toggle = card.querySelector(".collapse-toggle");
      const content = card.querySelector(".card-content");
      h3.addEventListener("click", () => {
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "block" : "none";
        toggle.textContent = isCollapsed ? "[ collapse ]" : "[ expand ]";
        card.style.opacity = isCollapsed ? "1" : "0.85";
      });
    }
    
    roadmapGridEl.appendChild(card);
  }

  /* ---------------------------------------------------------
     11. RESTARTS & UTILITIES
     --------------------------------------------------------- */

  function restartNavigator() {
    state.currentIndex = 0;
    state.direction = "forward";
    state.answers = {};
    completeEl.hidden = true;
    errorScreenEl.hidden = true;
    roadmapContainerEl.hidden = true;
    introEl.hidden = false;
    introEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goBackFromError() {
    errorScreenEl.hidden = true;
    completeEl.hidden = false;
    completeEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------------------------------------------------
     12. EVENT WIRING
     --------------------------------------------------------- */

  // Dashboard & Toggles
  const launchCard = document.getElementById("launch-navigator-card");
  const backToDashboardBtn = document.getElementById("back-to-dashboard-btn");
  const dashboardView = document.getElementById("dashboard-view");
  const navigatorSection = document.getElementById("navigator");

  if (launchCard && navigatorSection && dashboardView) {
    launchCard.addEventListener("click", () => {
      dashboardView.style.display = "none";
      navigatorSection.style.display = "block";
      restartNavigator();
    });
  }

  if (backToDashboardBtn && navigatorSection && dashboardView) {
    backToDashboardBtn.addEventListener("click", () => {
      navigatorSection.style.display = "none";
      dashboardView.style.display = "block";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  startBtn.addEventListener("click", startNavigator);
  nextBtn.addEventListener("click", handleNext);
  prevBtn.addEventListener("click", handlePrev);
  restartBtn.addEventListener("click", restartNavigator);
  
  // Roadmap Engine triggers
  generateRoadmapBtn.addEventListener("click", generateRoadmap);
  regenerateRoadmapBtn.addEventListener("click", generateRoadmap);
  retryGenerationBtn.addEventListener("click", generateRoadmap);
  errorBackBtn.addEventListener("click", goBackFromError);
  
  restartFromRoadmapBtn.addEventListener("click", restartNavigator);
  printReportBtn.addEventListener("click", () => {
    // Ensure every card is fully expanded so nothing is missing from print,
    // even if the user collapsed sections while reading on screen.
    roadmapGridEl.querySelectorAll(".roadmap-card").forEach((card) => {
      const content = card.querySelector(".card-content");
      const toggle = card.querySelector(".collapse-toggle");
      if (content) content.style.display = "block";
      if (toggle) toggle.textContent = "[ collapse ]";
      card.style.opacity = "1";
    });

    // Inject (or refresh) a print-only header strip with title + date.
    let printHeader = roadmapContainerEl.querySelector(".print-report-header");
    if (!printHeader) {
      printHeader = document.createElement("div");
      printHeader.className = "print-report-header";
      roadmapContainerEl.insertBefore(printHeader, roadmapContainerEl.firstChild);
    }
    const fieldName = (roadmapVisionTitleEl && roadmapVisionTitleEl.textContent) || "Polaris Research Roadmap";
    const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    printHeader.innerHTML = `<span>Polaris — ${fieldName}</span><span>Generated ${dateStr}</span>`;

    window.print();
  });

  formEl.addEventListener("submit", (e) => e.preventDefault());

  formEl.addEventListener("keydown", (e) => {
    const isTextInput = e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio";
    if (e.key === "Enter" && isTextInput) {
      e.preventDefault();
      handleNext();
    }
  });
})();