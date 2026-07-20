/* =========================================================
   POLARIS — MULTI‑NAVIGATOR SYSTEM
   Vanilla JS. No frameworks.
   Supports Research, Science Fair, Olympiad, Portfolio,
   Debate, Project, Learning, Paper, Journal, Career.
   ========================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     HELPERS: DOM references & utilities
     --------------------------------------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // Dashboard & back buttons
  const dashboardView = document.getElementById("dashboard-view");
  const backButtons = $$(".back-to-dashboard-btn");

  // Hide all navigator sections
  function hideAllNavigators() {
    $$(".navigator").forEach(el => el.style.display = "none");
  }

  // Show a specific navigator by its data-navigator value
  function showNavigator(name) {
    hideAllNavigators();
    const section = document.querySelector(`.navigator[data-navigator="${name}"]`);
    if (section) section.style.display = "block";
    if (dashboardView) dashboardView.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Return to dashboard
  function goToDashboard() {
    hideAllNavigators();
    if (dashboardView) dashboardView.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  backButtons.forEach(btn => btn.addEventListener("click", goToDashboard));

  // Dashboard cards
  const toolCards = $$(".tool-card.active[data-navigator]");
  toolCards.forEach(card => {
    card.addEventListener("click", () => {
      const navName = card.dataset.navigator;
      if (navName) {
        // If it's the journal, we may need to initialise it later
        showNavigator(navName);
        // Initialise the navigator state if not already
        if (NAVIGATORS[navName]) {
          const nav = NAVIGATORS[navName];
          if (nav.init) nav.init();
        }
      }
    });
  });

  /* ---------------------------------------------------------
     GENERIC NAVIGATOR ENGINE
     --------------------------------------------------------- */
  const NAVIGATORS = {};

  // Each navigator config: questions, state, renderers, etc.
  function createNavigator(config) {
    const {
      key,                // e.g. "research"
      questions,          // array of question objects
      introSelector,      // e.g. "#research-intro"
      formSelector,       // e.g. "#research-form"
      progressFillSelector,
      currentStepSelector,
      totalStepsSelector,
      questionViewportSelector,
      errorSelector,
      prevBtnSelector,
      nextBtnSelector,
      completeSelector,
      resultsOutputSelector,
      restartBtnSelectors, // array of selectors
      generateBtnSelector,
      loadingSelector,
      loadingMessageSelector,
      loadingProgressFillSelector,
      loadingProgressTextSelector,
      reportSelector,
      reportTitleSelector,
      reportLeadSelector,
      reportGridSelector,
      regenerateBtnSelector,
      printBtnSelector,
      errorSelectorFull,
      errorMessageSelector,
      errorBackBtnSelector,
      retryBtnSelector,
      // Journal specific
      isJournal = false,
      journalAppSelector,
      journalEntryForm,
      journalDate,
      journalWork,
      journalBlockers,
      journalNext,
      journalEntriesList,
      journalSummarizeBtn,
      journalSummaryContainer,
      journalSummaryContent,
      journalError,
      journalErrorMessage,
      journalRetrySummary,
      journalSummaryClose,
    } = config;

    // State
    const state = {
      currentIndex: 0,
      direction: "forward",
      answers: {},
      isGenerating: false,
    };

    // DOM refs
    const intro = $(introSelector);
    const form = $(formSelector);
    const progressFill = $(progressFillSelector);
    const currentStep = $(currentStepSelector);
    const totalSteps = $(totalStepsSelector);
    const viewport = $(questionViewportSelector);
    const errorEl = $(errorSelector);
    const prevBtn = $(prevBtnSelector);
    const nextBtn = $(nextBtnSelector);
    const complete = $(completeSelector);
    const resultsOutput = $(resultsOutputSelector);
    const generateBtn = $(generateBtnSelector);
    const loading = $(loadingSelector);
    const loadingMessage = $(loadingMessageSelector);
    const loadingProgressFill = $(loadingProgressFillSelector);
    const loadingProgressText = $(loadingProgressTextSelector);
    const report = $(reportSelector);
    const reportTitle = $(reportTitleSelector);
    const reportLead = $(reportLeadSelector);
    const reportGrid = $(reportGridSelector);
    const regenerateBtn = $(regenerateBtnSelector);
    const printBtn = $(printBtnSelector);
    const errorScreen = $(errorSelectorFull);
    const errorMessage = $(errorMessageSelector);
    const errorBackBtn = $(errorBackBtnSelector);
    const retryBtn = $(retryBtnSelector);

    // Helper: get all restart buttons (maybe multiple)
    const restartBtns = restartBtnSelectors.map(s => $(s)).filter(Boolean);

    // Progress messages for loading
    const progressMessages = config.progressMessages || [
      { text: "Step 1 of 4: Analysing your input...", pct: 15 },
      { text: "Step 2 of 4: Structuring your plan...", pct: 45 },
      { text: "Step 3 of 4: Refining details...", pct: 72 },
      { text: "Step 4 of 4: Finalising report...", pct: 98 },
    ];

    // ---------------------------------------------------------
    // RENDER / CAPTURE / VALIDATE
    // ---------------------------------------------------------
    function renderQuestion(index) {
      const q = questions[index];
      const slide = document.createElement("div");
      slide.className = "question-slide" + (state.direction === "back" ? " slide-back" : "");

      const label = document.createElement("h3");
      label.className = "question-label";
      label.textContent = q.label;
      label.id = `q-${key}-${q.key}-label`;
      slide.appendChild(label);

      if (q.hint) {
        const hint = document.createElement("p");
        hint.className = "question-hint";
        hint.textContent = q.hint;
        slide.appendChild(hint);
      }

      const saved = state.answers[q.key];

      if (q.type === "text") {
        const input = document.createElement("input");
        input.className = "field-text";
        input.type = q.inputType || "text";
        input.id = `${key}-${q.key}`;
        input.name = q.key;
        input.placeholder = q.placeholder || "";
        input.setAttribute("aria-labelledby", label.id);
        if (saved) input.value = saved;
        slide.appendChild(input);
      }

      if (q.type === "textarea") {
        const ta = document.createElement("textarea");
        ta.className = "field-textarea";
        ta.id = `${key}-${q.key}`;
        ta.name = q.key;
        ta.placeholder = q.placeholder || "";
        ta.setAttribute("aria-labelledby", label.id);
        ta.rows = 4;
        if (saved) ta.value = saved;
        slide.appendChild(ta);
      }

      if (q.type === "dropdown") {
        const select = document.createElement("select");
        select.className = "field-select";
        select.id = `${key}-${q.key}`;
        select.name = q.key;
        select.setAttribute("aria-labelledby", label.id);
        q.options.forEach((opt, i) => {
          const option = document.createElement("option");
          option.value = i === 0 ? "" : opt;
          option.textContent = opt;
          select.appendChild(option);
        });
        if (saved) select.value = saved;
        slide.appendChild(select);
      }

      if (q.type === "radio" || q.type === "checkbox") {
        const list = document.createElement("div");
        list.className = "option-list";
        list.setAttribute("role", q.type === "radio" ? "radiogroup" : "group");
        list.setAttribute("aria-labelledby", label.id);

        const savedArray = Array.isArray(saved) ? saved : [];

        q.options.forEach((opt, i) => {
          const item = document.createElement("label");
          item.className = "option-item";

          const input = document.createElement("input");
          input.type = q.type;
          input.name = q.key;
          input.value = opt;
          input.id = `${key}-${q.key}-${i}`;

          if (q.type === "radio") {
            if (saved === opt) input.checked = true;
          } else {
            if (savedArray.includes(opt)) input.checked = true;
          }

          const span = document.createElement("span");
          span.textContent = opt;

          item.appendChild(input);
          item.appendChild(span);
          list.appendChild(item);
        });

        slide.appendChild(list);
      }

      viewport.innerHTML = "";
      viewport.appendChild(slide);

      const firstField = slide.querySelector("input, textarea, select");
      if (firstField) firstField.focus({ preventScroll: true });
    }

    function updateChrome() {
      const total = questions.length;
      const pct = ((state.currentIndex + 1) / total) * 100;
      progressFill.style.width = pct + "%";
      currentStep.textContent = state.currentIndex + 1;
      totalSteps.textContent = total;
      prevBtn.disabled = state.currentIndex === 0;
      prevBtn.style.visibility = state.currentIndex === 0 ? "hidden" : "visible";
      nextBtn.textContent = state.currentIndex === total - 1 ? "Finish" : "Continue";
      errorEl.textContent = "";
    }

    function captureAnswer() {
      const q = questions[state.currentIndex];
      let val;
      if (q.type === "text" || q.type === "textarea" || q.type === "dropdown") {
        const field = document.getElementById(`${key}-${q.key}`);
        val = field ? field.value.trim() : "";
      } else if (q.type === "radio") {
        const checked = viewport.querySelector(`input[name="${q.key}"]:checked`);
        val = checked ? checked.value : "";
      } else if (q.type === "checkbox") {
        const checked = viewport.querySelectorAll(`input[name="${q.key}"]:checked`);
        val = Array.from(checked).map(el => el.value);
      }
      state.answers[q.key] = val;
    }

    function validateAnswer() {
      const q = questions[state.currentIndex];
      if (!q.required) return "";
      const val = state.answers[q.key];
      if (q.type === "checkbox") {
        if (!val || val.length === 0) return "Please select at least one option.";
        return "";
      }
      if (!val || val.length === 0) return "This question needs an answer before you can continue.";
      if (q.type === "text" && q.inputType === "number") {
        const num = Number(val);
        if (isNaN(num) || num <= 0 || num > 100) return "Please enter a valid number.";
      }
      return "";
    }

    function goToStep(index, direction) {
      state.direction = direction;
      state.currentIndex = index;
      renderQuestion(index);
      updateChrome();
    }

    function handleNext() {
      captureAnswer();
      const err = validateAnswer();
      if (err) { errorEl.textContent = err; return; }
      if (state.currentIndex === questions.length - 1) {
        finish();
        return;
      }
      goToStep(state.currentIndex + 1, "forward");
    }

    function handlePrev() {
      captureAnswer();
      if (state.currentIndex === 0) return;
      goToStep(state.currentIndex - 1, "back");
    }

    // ---------------------------------------------------------
    // FINISH, LOADING, GENERATE
    // ---------------------------------------------------------
    function finish() {
      form.hidden = true;
      complete.hidden = false;
      const profile = { submittedAt: new Date().toISOString(), answers: state.answers };
      resultsOutput.textContent = JSON.stringify(profile, null, 2);
      window[`polaris${key.charAt(0).toUpperCase()+key.slice(1)}Profile`] = profile;
      complete.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function restart() {
      state.currentIndex = 0;
      state.direction = "forward";
      state.answers = {};
      complete.hidden = true;
      errorScreen.hidden = true;
      report.hidden = true;
      loading.hidden = true;
      intro.hidden = false;
      form.hidden = true;
      // Reset progress
      updateChrome();
      intro.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function startForm() {
      intro.hidden = true;
      form.hidden = false;
      goToStep(0, "forward");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Update loading status
    function updateLoadingStatus(msg, pct) {
      if (loadingMessage) loadingMessage.textContent = msg;
      if (loadingProgressFill && pct !== undefined) {
        loadingProgressFill.style.width = pct + "%";
      }
    }

    // Generic generation function
    async function generate() {
      complete.hidden = true;
      loading.hidden = false;
      loading.scrollIntoView({ behavior: "smooth", block: "start" });

      let msgIndex = 0;
      const interval = setInterval(() => {
        if (msgIndex < progressMessages.length) {
          const stage = progressMessages[msgIndex];
          if (loadingProgressText) loadingProgressText.textContent = stage.text;
          updateLoadingStatus("Generating your plan...", stage.pct);
          msgIndex++;
        }
      }, 2500);

      try {
        const endpoint = config.generateEndpoint; // e.g. "/api/generate-sciencefair"
        const data = await callAiApi(endpoint, state.answers);
        clearInterval(interval);
        renderReport(data);
        loading.hidden = true;
        report.hidden = false;
        report.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        clearInterval(interval);
        console.error("Generation failed:", err);
        if (errorMessage) errorMessage.innerHTML = `Failed to generate plan: ${err.message || "Unknown error"}`;
        loading.hidden = true;
        errorScreen.hidden = false;
        errorScreen.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    // API call with retries
    async function callAiApi(endpoint, answers, attempt = 1, maxAttempts = 3) {
      const timeoutMs = 45000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          let errMsg = `Server error: ${resp.status}`;
          try { const d = await resp.json(); if (d.error) errMsg = d.error; } catch (_) {}
          throw new Error(errMsg);
        }
        return await resp.json();
      } catch (err) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === "AbortError";
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1500;
          if (loadingProgressText) loadingProgressText.textContent = `Attempt ${attempt} failed. Retrying in ${delay/1000}s...`;
          await new Promise(r => setTimeout(r, delay));
          return callAiApi(endpoint, answers, attempt + 1, maxAttempts);
        } else {
          throw isTimeout ? new Error("Request timed out. Please check your network.") : err;
        }
      }
    }

    // ---------------------------------------------------------
    // REPORT RENDERERS (each navigator provides its own)
    // ---------------------------------------------------------
    function renderReport(data) {
      // Each navigator has a renderer function
      if (config.renderReport) {
        config.renderReport(data, reportTitle, reportLead, reportGrid);
      } else {
        // fallback: display JSON
        reportTitle.textContent = "Your Plan";
        reportLead.textContent = "Generated roadmap.";
        reportGrid.innerHTML = `<pre style="color: var(--paper);">${JSON.stringify(data, null, 2)}</pre>`;
      }
    }

    // ---------------------------------------------------------
    // WIRING EVENTS
    // ---------------------------------------------------------
    function init() {
      // Start button
      const startBtn = intro.querySelector(".start-navigator-btn");
      if (startBtn) startBtn.addEventListener("click", startForm);

      // Navigation buttons
      if (prevBtn) prevBtn.addEventListener("click", handlePrev);
      if (nextBtn) nextBtn.addEventListener("click", handleNext);

      // Restart buttons
      restartBtns.forEach(btn => btn.addEventListener("click", restart));

      // Generate button
      if (generateBtn) generateBtn.addEventListener("click", generate);
      if (regenerateBtn) regenerateBtn.addEventListener("click", generate);
      if (retryBtn) retryBtn.addEventListener("click", generate);

      // Print
      if (printBtn) {
        printBtn.addEventListener("click", () => {
          // Expand all cards
          reportGrid.querySelectorAll(".roadmap-card").forEach(card => {
            const content = card.querySelector(".card-content");
            const toggle = card.querySelector(".collapse-toggle");
            if (content) content.style.display = "block";
            if (toggle) toggle.textContent = "[ collapse ]";
            card.style.opacity = "1";
          });
          // Add print header
          let header = report.querySelector(".print-report-header");
          if (!header) {
            header = document.createElement("div");
            header.className = "print-report-header";
            report.insertBefore(header, report.firstChild);
          }
          const titleText = reportTitle.textContent || "Polaris Plan";
          const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
          header.innerHTML = `<span>Polaris — ${titleText}</span><span>Generated ${dateStr}</span>`;
          window.print();
        });
      }

      // Error back button
      if (errorBackBtn) errorBackBtn.addEventListener("click", () => {
        errorScreen.hidden = true;
        complete.hidden = false;
      });

      // Form submit (prevent)
      if (form) form.addEventListener("submit", e => e.preventDefault());

      // Keyboard shortcut: Enter on text inputs
      if (form) {
        form.addEventListener("keydown", (e) => {
          const isText = e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio";
          if (e.key === "Enter" && isText) {
            e.preventDefault();
            handleNext();
          }
        });
      }

      // Init state
      if (totalSteps) totalSteps.textContent = questions.length;
      updateChrome();
    }

    // Journal-specific initialisation
    if (isJournal) {
      // Override init and add CRUD
      const journalApp = $(journalAppSelector);
      const entryForm = $(journalEntryForm);
      const dateInput = $(journalDate);
      const workInput = $(journalWork);
      const blockersInput = $(journalBlockers);
      const nextInput = $(journalNext);
      const entriesList = $(journalEntriesList);
      const summarizeBtn = $(journalSummarizeBtn);
      const summaryContainer = $(journalSummaryContainer);
      const summaryContent = $(journalSummaryContent);
      const summaryClose = $(journalSummaryClose);
      const journalErrorEl = $(journalError);
      const journalErrorMsg = $(journalErrorMessage);
      const journalRetry = $(journalRetrySummary);

      // Load entries from localStorage
      function loadEntries() {
        const raw = localStorage.getItem(`polaris-journal-${key}`);
        return raw ? JSON.parse(raw) : [];
      }

      function saveEntries(entries) {
        localStorage.setItem(`polaris-journal-${key}`, JSON.stringify(entries));
      }

      function renderEntries() {
        const entries = loadEntries();
        if (entries.length === 0) {
          entriesList.innerHTML = '<p style="color: rgba(247,245,240,0.5);">No entries yet. Start logging!</p>';
          return;
        }
        // Reverse chronological
        const sorted = [...entries].reverse();
        let html = '';
        sorted.forEach((entry, idx) => {
          const realIdx = entries.length - 1 - idx;
          html += `
            <div style="background: rgba(247,245,240,0.03); border-radius: 6px; padding: 16px; margin-bottom: 16px; border-left: 2px solid var(--gold);">
              <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap;">
                <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${entry.date}</strong>
                <div>
                  <button class="btn btn-ghost journal-edit-btn" data-index="${realIdx}" style="font-size: 0.7rem; padding: 2px 8px;">Edit</button>
                  <button class="btn btn-ghost journal-delete-btn" data-index="${realIdx}" style="font-size: 0.7rem; padding: 2px 8px; color: #F0A08D;">Delete</button>
                </div>
              </div>
              <p><strong>Work:</strong> ${entry.work || ''}</p>
              ${entry.blockers ? `<p><strong>Blockers:</strong> ${entry.blockers}</p>` : ''}
              ${entry.next ? `<p><strong>Next:</strong> ${entry.next}</p>` : ''}
            </div>
          `;
        });
        entriesList.innerHTML = html;

        // Attach delete and edit events
        entriesList.querySelectorAll('.journal-delete-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            if (confirm('Delete this entry?')) {
              const entries = loadEntries();
              entries.splice(idx, 1);
              saveEntries(entries);
              renderEntries();
            }
          });
        });
        entriesList.querySelectorAll('.journal-edit-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const entries = loadEntries();
            const entry = entries[idx];
            dateInput.value = entry.date;
            workInput.value = entry.work || '';
            blockersInput.value = entry.blockers || '';
            nextInput.value = entry.next || '';
            // Remove the old entry (user will save as new or we can replace)
            entries.splice(idx, 1);
            saveEntries(entries);
            renderEntries();
            // Focus on work
            workInput.focus();
          });
        });
      }

      // Submit new entry
      function handleJournalSubmit(e) {
        e.preventDefault();
        const date = dateInput.value;
        const work = workInput.value.trim();
        if (!date || !work) {
          alert('Date and Work are required.');
          return;
        }
        const entries = loadEntries();
        entries.push({
          date,
          work,
          blockers: blockersInput.value.trim(),
          next: nextInput.value.trim(),
        });
        saveEntries(entries);
        renderEntries();
        entryForm.reset();
        // Set today's date again
        dateInput.value = new Date().toISOString().split('T')[0];
        workInput.focus();
      }

      // Summarize
      async function summarizeJournal() {
        const entries = loadEntries();
        if (entries.length === 0) {
          alert('No entries to summarize. Please add some entries first.');
          return;
        }
        // Ask user how many recent entries
        const count = prompt('How many recent entries to summarize? (e.g. 5)', '5');
        if (!count) return;
        const n = parseInt(count) || 5;
        const recent = entries.slice(-n);
        // Show loading
        summaryContainer.style.display = 'block';
        summaryContent.innerHTML = '<p>Generating summary...</p>';
        journalErrorEl.hidden = true;

        try {
          const data = await callAiApi('/api/summarize-journal', { entries: recent });
          summaryContent.innerHTML = `
            <p><strong>Period Summary:</strong> ${data.periodSummary || ''}</p>
            <p><strong>Momentum:</strong> ${data.momentum || ''}</p>
            ${data.recurringBlockers && data.recurringBlockers.length ? `<p><strong>Recurring Blockers:</strong> ${data.recurringBlockers.join(', ')}</p>` : ''}
            ${data.suggestedNextSteps && data.suggestedNextSteps.length ? `<p><strong>Suggested Next Steps:</strong></p><ul>${data.suggestedNextSteps.map(s => `<li>${s}</li>`).join('')}</ul>` : ''}
          `;
        } catch (err) {
          journalErrorEl.hidden = false;
          journalErrorMsg.textContent = err.message || 'Failed to summarize.';
        }
      }

      // Journal init (override)
      function journalInit() {
        // Override start to show app
        const startBtn = intro.querySelector(".start-navigator-btn");
        if (startBtn) {
          startBtn.addEventListener("click", () => {
            intro.hidden = true;
            journalApp.hidden = false;
            // Set today's date
            dateInput.value = new Date().toISOString().split('T')[0];
            renderEntries();
          });
        }
        // Form submit
        if (entryForm) entryForm.addEventListener("submit", handleJournalSubmit);
        // Summarize
        if (summarizeBtn) summarizeBtn.addEventListener("click", summarizeJournal);
        // Close summary
        if (summaryClose) summaryClose.addEventListener("click", () => {
          summaryContainer.style.display = 'none';
        });
        // Retry summary
        if (journalRetry) journalRetry.addEventListener("click", summarizeJournal);
        // Back to dashboard from journal
        // back buttons already handled
      }

      // Store init function
      config.init = journalInit;

      // Also store renderEntries so we can call it from outside if needed
      config.renderEntries = renderEntries;

      // Return early; the generic init will not be used
      return config;
    }

    // For non-journal navigators, store init
    config.init = init;

    // Store state and helpers for external access (if needed)
    NAVIGATORS[key] = config;

    return config;
  }

  // ---------------------------------------------------------
  // QUESTION ARRAYS FOR EACH NAVIGATOR
  // ---------------------------------------------------------

  // 1. RESEARCH (existing, but we'll redefine with same questions)
  const researchQuestions = [
    { key: "age", type: "text", inputType: "number", label: "How old are you?", hint: "This helps calibrate ambition.", placeholder: "e.g. 16", required: true },
    { key: "interests", type: "textarea", label: "What are you genuinely curious about right now?", hint: "Any field, hobby, or question counts.", placeholder: "e.g. how vaccines are designed, why markets crash...", required: true },
    { key: "favouriteSubjects", type: "checkbox", label: "Which subjects do you enjoy most?", hint: "Select all that apply.", required: true, options: ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Economics", "Engineering", "Humanities / Social Science", "Other"] },
    { key: "mathBackground", type: "radio", label: "How would you describe your mathematical background?", hint: "Be honest.", required: true, options: ["Just school-level math", "Comfortable with calculus", "Comfortable with linear algebra / proofs", "Studied topics beyond standard high school math (e.g. olympiad math, real analysis)"] },
    { key: "programmingExperience", type: "radio", label: "What's your programming experience?", hint: "", required: true, options: ["None yet", "Beginner (basic syntax, small scripts)", "Intermediate (built small projects independently)", "Advanced (comfortable with data structures, libraries, or larger codebases)"] },
    { key: "availableTime", type: "dropdown", label: "How much time can you realistically commit each week?", hint: "", required: true, options: ["Choose an option", "Under 3 hours", "3–6 hours", "6–10 hours", "10+ hours"] },
    { key: "researchExperience", type: "radio", label: "Have you done any research before?", hint: "", required: true, options: ["None yet", "A school project or science fair", "An independent project I designed myself", "Worked with a mentor, lab, or published something"] },
    { key: "publicationGoals", type: "dropdown", label: "Is publishing your research a goal for you?", hint: "", required: true, options: ["Choose an option", "Not a priority right now", "Yes, eventually", "Yes — I'm actively aiming for a specific journal or conference"] },
    { key: "competitionGoals", type: "checkbox", label: "Are you targeting any competitions?", hint: "Select all that apply, or skip if none.", required: false, options: ["Math olympiads (e.g. AMTI, INMO)", "Science fairs (e.g. ISEF, AIMER)", "RSI / research-focused programs", "Coding competitions", "None currently"] },
    { key: "learningStyle", type: "radio", label: "How do you learn best?", hint: "", required: true, options: ["Reading textbooks and papers on my own", "Watching lectures or video explanations", "Working through problems hands-on", "Discussing ideas with a mentor or peers"] },
    { key: "resourcesAvailable", type: "checkbox", label: "What resources do you currently have access to?", hint: "Select all that apply.", required: true, options: ["A mentor or teacher who can guide me", "A computer and stable internet", "A library or paid journal access", "A school lab or research facility", "None of the above yet"] },
    { key: "biggestChallenge", type: "textarea", label: "What's the biggest thing holding you back right now?", hint: "Time, direction, resources, confidence — anything.", placeholder: "e.g. I don't know how to find a research question worth pursuing...", required: true },
    { key: "dreamProject", type: "textarea", label: "If nothing could stop you, what would your dream project be?", hint: "Think big — this shapes the direction.", placeholder: "e.g. build a model that predicts...", required: false },
    { key: "careerAspirations", type: "text", inputType: "text", label: "What's your long-term career aspiration?", hint: "It's okay if this is a rough guess.", placeholder: "e.g. aerospace engineer, research scientist, founder...", required: false },
    { key: "currentGoal", type: "dropdown", label: "What's your single most immediate goal right now?", hint: "", required: true, options: ["Choose an option", "Finding a research topic", "Preparing for a competition", "Preparing for university admissions (e.g. MIT, Cambridge)", "Building technical skills", "Writing or publishing a paper"] },
  ];

  // 2. SCIENCE FAIR
  const scienceFairQuestions = [
    { key: "targetFairs", type: "checkbox", label: "Which fair(s) are you targeting?", hint: "Select all that apply.", required: true, options: ["ISEF/Regeneron affiliate fair", "EUCYS", "State/regional fair", "School fair", "Other/unsure"] },
    { key: "deadline", type: "text", inputType: "date", label: "Fair deadline / project timeline (date)", hint: "When is your fair?", placeholder: "e.g. 2026-03-15", required: true },
    { key: "projectIdea", type: "textarea", label: "Rough project idea or area of interest", hint: "Describe what you're curious about.", placeholder: "e.g. I want to study how different fertilisers affect plant growth...", required: true },
    { key: "category", type: "dropdown", label: "Which category does your project fall into?", hint: "", required: true, options: ["Choose an option", "Engineering", "Environmental Science", "Biology", "Chemistry", "Physics/Astronomy", "Computer Science", "Robotics", "Behavioral/Social Science", "Other"] },
    { key: "hypothesisStatus", type: "radio", label: "Do you already have a hypothesis, or are you still exploring?", hint: "", required: true, options: ["I have a testable hypothesis", "I'm still exploring the question"] },
    { key: "equipmentAccess", type: "checkbox", label: "What equipment/lab access do you have?", hint: "Select all that apply.", required: true, options: ["Home only", "School lab", "Mentor/university lab access", "None yet"] },
    { key: "experience", type: "dropdown", label: "Prior science fair experience?", hint: "", required: true, options: ["Choose an option", "None", "Participated once", "Won awards at school/regional level", "National/international experience"] },
    { key: "team", type: "radio", label: "Are you working solo or with a partner/team?", hint: "", required: true, options: ["Solo", "Partner", "Team (3+)"] },
    { key: "budget", type: "dropdown", label: "Budget constraints?", hint: "", required: false, options: ["Choose an option", "No budget", "Under $50", "$50–$200", "$200+"] },
    { key: "unsureAbout", type: "textarea", label: "What are you most unsure about?", hint: "e.g. experimental design, data analysis, presentation.", placeholder: "I'm not sure how to control variables...", required: true },
  ];

  // 3. OLYMPIAD
  const olympiadQuestions = [
    { key: "olympiads", type: "checkbox", label: "Which olympiad(s) are you preparing for?", hint: "Select all that apply.", required: true, options: ["Math — AMC/AIME/Olympiad-level (e.g. INMO/IMO track)", "Physics — e.g. IPhO track", "Chemistry — e.g. IChO track", "Biology — e.g. IBO track", "Informatics/Coding — e.g. IOI/USACO track", "Other/unsure"] },
    { key: "currentLevel", type: "dropdown", label: "Current level in that subject", hint: "", required: true, options: ["Choose an option", "Beginner / just starting", "Competent at school level", "Already medals at local competitions", "Training for national team"] },
    { key: "targetDate", type: "text", inputType: "date", label: "Target competition date", hint: "When is the exam?", placeholder: "e.g. 2026-05-20", required: true },
    { key: "hoursPerWeek", type: "dropdown", label: "Hours available per week for preparation", hint: "", required: true, options: ["Choose an option", "Under 5", "5–10", "10–20", "20+"] },
    { key: "learningStyle", type: "radio", label: "Preferred learning style", hint: "", required: true, options: ["Reading books/papers", "Watching lectures/videos", "Solving problems", "Discussing with others"] },
    { key: "pastScores", type: "text", label: "Past scores/results (if any)", hint: "Optional", placeholder: "e.g. AMC 12 score 90", required: false },
    { key: "coach", type: "radio", label: "Access to a coach/mentor/team?", hint: "", required: true, options: ["Yes", "No"] },
    { key: "weakArea", type: "textarea", label: "Biggest weak area", hint: "What do you find most challenging?", placeholder: "e.g. geometry proofs, organic chemistry mechanisms...", required: true },
  ];

  // 4. PORTFOLIO
  const portfolioQuestions = [
    { key: "existingWork", type: "checkbox", label: "What do you already have?", hint: "Select all that apply.", required: true, options: ["Open-source code/GitHub repos", "A research paper/pre-print", "Competition results", "A personal project", "Internship/lab experience", "None yet — starting from scratch"] },
    { key: "targetUniversities", type: "text", label: "Target universities/programs", hint: "Comma separated is fine.", placeholder: "e.g. MIT, Cambridge, Stanford", required: true },
    { key: "intendedMajor", type: "text", label: "Intended major/field", hint: "", placeholder: "e.g. Computer Science, Physics", required: true },
    { key: "strongestThing", type: "textarea", label: "What's the single strongest thing you've built or done?", hint: "Be specific.", placeholder: "e.g. I built a web app for local farmers that predicts crop yield...", required: true },
    { key: "gap", type: "textarea", label: "What gap do you feel exists in your portfolio?", hint: "What's missing?", placeholder: "e.g. I don't have any published research...", required: true },
    { key: "timeline", type: "text", inputType: "date", label: "Timeline to application deadline", hint: "When is your first deadline?", placeholder: "e.g. 2026-11-01", required: true },
    { key: "approach", type: "radio", label: "Do you want to add something new or just better present what exists?", hint: "", required: true, options: ["Add something new", "Better present what I have", "Both"] },
  ];

  // 5. DEBATE
  const debateQuestions = [
    { key: "format", type: "dropdown", label: "Debate format", hint: "", required: true, options: ["Choose an option", "World Schools", "Lincoln-Douglas", "Public Forum", "Policy", "British Parliamentary", "Other"] },
    { key: "resolution", type: "textarea", label: "The exact resolution/topic", hint: "Required", placeholder: "e.g. This house believes that...", required: true },
    { key: "side", type: "dropdown", label: "Side you need to argue", hint: "", required: true, options: ["Choose an option", "Proposition/Affirmative", "Opposition/Negative", "Both — need to prep for either"] },
    { key: "tournamentDate", type: "text", inputType: "date", label: "Tournament date", hint: "", placeholder: "e.g. 2026-04-10", required: true },
    { key: "experience", type: "dropdown", label: "Experience level", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "hoursAvailable", type: "dropdown", label: "Hours available to prep", hint: "", required: true, options: ["Choose an option", "Under 5", "5–10", "10–20", "20+"] },
    { key: "existingMaterials", type: "checkbox", label: "What do you already have?", hint: "Select all that apply.", required: false, options: ["Nothing yet", "Some research", "A partial case", "Cards/evidence collected"] },
  ];

  // 6. PROJECT BUILDER
  const projectQuestions = [
    { key: "idea", type: "textarea", label: "What do you want to build?", hint: "Required", placeholder: "e.g. A mobile app for language learning...", required: true },
    { key: "audience", type: "textarea", label: "Who is it for / what problem does it solve?", hint: "", placeholder: "e.g. For students who want to learn vocabulary on the go...", required: true },
    { key: "skillLevel", type: "dropdown", label: "Your current technical skill level", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "techStack", type: "text", label: "Preferred tech stack (if any)", hint: "Optional", placeholder: "e.g. React, Node.js, MongoDB", required: false },
    { key: "timePerWeek", type: "dropdown", label: "Time available per week", hint: "", required: true, options: ["Choose an option", "Under 3", "3–6", "6–10", "10+"] },
    { key: "targetLaunch", type: "text", inputType: "date", label: "Target launch/demo date (if any)", hint: "Optional", placeholder: "e.g. 2026-08-01", required: false },
    { key: "teamSize", type: "radio", label: "Solo or with a team?", hint: "", required: true, options: ["Solo", "Team"] },
  ];

  // 7. LEARNING PLANNER
  const learningQuestions = [
    { key: "subject", type: "textarea", label: "What are you trying to learn?", hint: "Required", placeholder: "e.g. Calculus BC, Real Analysis, specific textbook title", required: true },
    { key: "textbook", type: "text", label: "Do you have a specific textbook/course already chosen?", hint: "Optional", placeholder: "e.g. Stewart Calculus", required: false },
    { key: "currentLevel", type: "dropdown", label: "Current level in the subject", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "reason", type: "dropdown", label: "Why are you learning this?", hint: "", required: true, options: ["Choose an option", "School requirement", "Exam prep", "Personal interest", "Prerequisite for research/olympiad", "Other"] },
    { key: "targetDate", type: "text", inputType: "date", label: "Target date (exam date, deadline, or none)", hint: "Optional", placeholder: "e.g. 2026-06-01", required: false },
    { key: "hoursPerWeek", type: "dropdown", label: "Hours available per week", hint: "", required: true, options: ["Choose an option", "Under 3", "3–6", "6–10", "10+"] },
    { key: "learningStyle", type: "radio", label: "Preferred learning style", hint: "", required: true, options: ["Reading", "Watching videos", "Solving problems", "Discussing"] },
  ];

  // 8. PAPER REVIEWER (different: includes a large textarea for manuscript)
  const paperQuestions = [
    { key: "field", type: "text", label: "Field/subject area", hint: "e.g. Computer Science, Biology", placeholder: "e.g. Machine Learning", required: true },
    { key: "venue", type: "text", label: "Target venue (if any)", hint: "e.g. Journal, conference, class assignment", placeholder: "e.g. NeurIPS, school science fair", required: false },
    { key: "manuscript", type: "textarea", label: "Paste your manuscript text here", hint: "Provide the full text or a detailed description.", placeholder: "Paste your draft here...", required: true },
    { key: "feedbackFocus", type: "checkbox", label: "What kind of feedback do you want most?", hint: "Select all that apply.", required: true, options: ["Methodology", "Writing clarity", "Statistics/results", "Citations", "All of the above"] },
  ];

  // 9. CAREER EXPLORER
  const careerQuestions = [
    { key: "fields", type: "text", label: "Field(s) of interest", hint: "e.g. Physics, Computer Science", placeholder: "e.g. Astrophysics, AI", required: true },
    { key: "stage", type: "dropdown", label: "Current academic stage", hint: "", required: true, options: ["Choose an option", "High school", "Undergraduate", "Graduate", "Other"] },
    { key: "lookingFor", type: "checkbox", label: "What are you looking for?", hint: "Select all that apply.", required: true, options: ["Understanding subfields/specializations", "Finding labs/professors to reach out to", "Finding internships/summer programs", "Understanding grad school paths"] },
    { key: "geographic", type: "text", label: "Geographic constraints (if any)", hint: "Optional", placeholder: "e.g. USA, Europe, remote", required: false },
    { key: "timeHorizon", type: "dropdown", label: "Time horizon", hint: "", required: true, options: ["Choose an option", "This summer", "Next year", "Several years out"] },
  ];

  // ---------------------------------------------------------
  // REGISTER NAVIGATORS
  // ---------------------------------------------------------

  // Helper to create a generic renderer for a specific schema
  function makeRenderReport(schemaMap) {
    return function(data, titleEl, leadEl, gridEl) {
      // Example: schemaMap = { titleKey: 'projectTitle', leadKey: 'hypothesisStatement', ... }
      // We'll use a generic approach: display fields in order, with grids and full-width cards.
      // But we can customise per navigator.
      // For simplicity, we'll use a generic render that maps fields to cards.
      // However, we'll provide specific renderers for each to match the prompts' desired layout.
      // We'll implement per-navigator render functions in the config.
    };
  }

  // Research Navigator (existing)
  createNavigator({
    key: "research",
    questions: researchQuestions,
    introSelector: "#research-intro",
    formSelector: "#research-form",
    progressFillSelector: "#research-progress-fill",
    currentStepSelector: "#research-current-step",
    totalStepsSelector: "#research-total-steps",
    questionViewportSelector: "#research-question-viewport",
    errorSelector: "#research-form-error",
    prevBtnSelector: ".research-prev-btn",
    nextBtnSelector: ".research-next-btn",
    completeSelector: "#research-complete",
    resultsOutputSelector: "#research-results-output",
    restartBtnSelectors: [".research-restart-btn"],
    generateBtnSelector: ".research-generate-btn",
    loadingSelector: "#research-loading",
    loadingMessageSelector: "#research-loading-message",
    loadingProgressFillSelector: "#research-loading-progress-fill",
    loadingProgressTextSelector: "#research-loading-progress-text",
    reportSelector: "#research-report",
    reportTitleSelector: "#research-report-title",
    reportLeadSelector: "#research-report-lead",
    reportGridSelector: "#research-report-grid",
    regenerateBtnSelector: ".research-regenerate-btn",
    printBtnSelector: ".research-print-btn",
    errorSelectorFull: "#research-error",
    errorMessageSelector: "#research-error-message",
    errorBackBtnSelector: ".research-error-back-btn",
    retryBtnSelector: ".research-retry-btn",
    generateEndpoint: "/api/generate-roadmap",
    progressMessages: [
      { text: "Step 1 of 4: Synthesizing academic profile...", pct: 15 },
      { text: "Step 2 of 4: Scanning modern scientific literature indices...", pct: 45 },
      { text: "Step 3 of 4: Simulating weekly schedule allocations...", pct: 72 },
      { text: "Step 4 of 4: Finalizing true north report layout...", pct: 98 },
    ],
    renderReport: function(data, titleEl, leadEl, gridEl) {
      // Use existing renderRoadmapReport logic (we'll copy from old script)
      // We'll define it below as a global function.
      renderResearchReport(data, titleEl, leadEl, gridEl);
    },
  });

  // Science Fair
  createNavigator({
    key: "sciencefair",
    questions: scienceFairQuestions,
    introSelector: "#sciencefair-intro",
    formSelector: "#sciencefair-form",
    progressFillSelector: "#sciencefair-progress-fill",
    currentStepSelector: "#sciencefair-current-step",
    totalStepsSelector: "#sciencefair-total-steps",
    questionViewportSelector: "#sciencefair-question-viewport",
    errorSelector: "#sciencefair-form-error",
    prevBtnSelector: ".sciencefair-prev-btn",
    nextBtnSelector: ".sciencefair-next-btn",
    completeSelector: "#sciencefair-complete",
    resultsOutputSelector: "#sciencefair-results-output",
    restartBtnSelectors: [".sciencefair-restart-btn"],
    generateBtnSelector: ".sciencefair-generate-btn",
    loadingSelector: "#sciencefair-loading",
    loadingMessageSelector: "#sciencefair-loading-message",
    loadingProgressFillSelector: "#sciencefair-loading-progress-fill",
    loadingProgressTextSelector: "#sciencefair-loading-progress-text",
    reportSelector: "#sciencefair-report",
    reportTitleSelector: "#sciencefair-report-title",
    reportLeadSelector: "#sciencefair-report-lead",
    reportGridSelector: "#sciencefair-report-grid",
    regenerateBtnSelector: ".sciencefair-regenerate-btn",
    printBtnSelector: ".sciencefair-print-btn",
    errorSelectorFull: "#sciencefair-error",
    errorMessageSelector: "#sciencefair-error-message",
    errorBackBtnSelector: ".sciencefair-error-back-btn",
    retryBtnSelector: ".sciencefair-retry-btn",
    generateEndpoint: "/api/generate-sciencefair",
    progressMessages: [
      { text: "Step 1 of 4: Framing hypothesis...", pct: 20 },
      { text: "Step 2 of 4: Designing experiments...", pct: 50 },
      { text: "Step 3 of 4: Planning controls and validation...", pct: 75 },
      { text: "Step 4 of 4: Building display board outline...", pct: 98 },
    ],
    renderReport: renderScienceFairReport,
  });

  // Olympiad
  createNavigator({
    key: "olympiad",
    questions: olympiadQuestions,
    introSelector: "#olympiad-intro",
    formSelector: "#olympiad-form",
    progressFillSelector: "#olympiad-progress-fill",
    currentStepSelector: "#olympiad-current-step",
    totalStepsSelector: "#olympiad-total-steps",
    questionViewportSelector: "#olympiad-question-viewport",
    errorSelector: "#olympiad-form-error",
    prevBtnSelector: ".olympiad-prev-btn",
    nextBtnSelector: ".olympiad-next-btn",
    completeSelector: "#olympiad-complete",
    resultsOutputSelector: "#olympiad-results-output",
    restartBtnSelectors: [".olympiad-restart-btn"],
    generateBtnSelector: ".olympiad-generate-btn",
    loadingSelector: "#olympiad-loading",
    loadingMessageSelector: "#olympiad-loading-message",
    loadingProgressFillSelector: "#olympiad-loading-progress-fill",
    loadingProgressTextSelector: "#olympiad-loading-progress-text",
    reportSelector: "#olympiad-report",
    reportTitleSelector: "#olympiad-report-title",
    reportLeadSelector: "#olympiad-report-lead",
    reportGridSelector: "#olympiad-report-grid",
    regenerateBtnSelector: ".olympiad-regenerate-btn",
    printBtnSelector: ".olympiad-print-btn",
    errorSelectorFull: "#olympiad-error",
    errorMessageSelector: "#olympiad-error-message",
    errorBackBtnSelector: ".olympiad-error-back-btn",
    retryBtnSelector: ".olympiad-retry-btn",
    generateEndpoint: "/api/generate-olympiad",
    progressMessages: [
      { text: "Step 1 of 4: Assessing current level...", pct: 20 },
      { text: "Step 2 of 4: Building syllabus breakdown...", pct: 50 },
      { text: "Step 3 of 4: Creating weekly schedule...", pct: 75 },
      { text: "Step 4 of 4: Compiling resource list...", pct: 98 },
    ],
    renderReport: renderOlympiadReport,
  });

  // Portfolio
  createNavigator({
    key: "portfolio",
    questions: portfolioQuestions,
    introSelector: "#portfolio-intro",
    formSelector: "#portfolio-form",
    progressFillSelector: "#portfolio-progress-fill",
    currentStepSelector: "#portfolio-current-step",
    totalStepsSelector: "#portfolio-total-steps",
    questionViewportSelector: "#portfolio-question-viewport",
    errorSelector: "#portfolio-form-error",
    prevBtnSelector: ".portfolio-prev-btn",
    nextBtnSelector: ".portfolio-next-btn",
    completeSelector: "#portfolio-complete",
    resultsOutputSelector: "#portfolio-results-output",
    restartBtnSelectors: [".portfolio-restart-btn"],
    generateBtnSelector: ".portfolio-generate-btn",
    loadingSelector: "#portfolio-loading",
    loadingMessageSelector: "#portfolio-loading-message",
    loadingProgressFillSelector: "#portfolio-loading-progress-fill",
    loadingProgressTextSelector: "#portfolio-loading-progress-text",
    reportSelector: "#portfolio-report",
    reportTitleSelector: "#portfolio-report-title",
    reportLeadSelector: "#portfolio-report-lead",
    reportGridSelector: "#portfolio-report-grid",
    regenerateBtnSelector: ".portfolio-regenerate-btn",
    printBtnSelector: ".portfolio-print-btn",
    errorSelectorFull: "#portfolio-error",
    errorMessageSelector: "#portfolio-error-message",
    errorBackBtnSelector: ".portfolio-error-back-btn",
    retryBtnSelector: ".portfolio-retry-btn",
    generateEndpoint: "/api/generate-portfolio",
    progressMessages: [
      { text: "Step 1 of 4: Analysing existing work...", pct: 20 },
      { text: "Step 2 of 4: Identifying strengths and gaps...", pct: 50 },
      { text: "Step 3 of 4: Crafting essay angles...", pct: 75 },
      { text: "Step 4 of 4: Building timeline...", pct: 98 },
    ],
    renderReport: renderPortfolioReport,
  });

  // Debate
  createNavigator({
    key: "debate",
    questions: debateQuestions,
    introSelector: "#debate-intro",
    formSelector: "#debate-form",
    progressFillSelector: "#debate-progress-fill",
    currentStepSelector: "#debate-current-step",
    totalStepsSelector: "#debate-total-steps",
    questionViewportSelector: "#debate-question-viewport",
    errorSelector: "#debate-form-error",
    prevBtnSelector: ".debate-prev-btn",
    nextBtnSelector: ".debate-next-btn",
    completeSelector: "#debate-complete",
    resultsOutputSelector: "#debate-results-output",
    restartBtnSelectors: [".debate-restart-btn"],
    generateBtnSelector: ".debate-generate-btn",
    loadingSelector: "#debate-loading",
    loadingMessageSelector: "#debate-loading-message",
    loadingProgressFillSelector: "#debate-loading-progress-fill",
    loadingProgressTextSelector: "#debate-loading-progress-text",
    reportSelector: "#debate-report",
    reportTitleSelector: "#debate-report-title",
    reportLeadSelector: "#debate-report-lead",
    reportGridSelector: "#debate-report-grid",
    regenerateBtnSelector: ".debate-regenerate-btn",
    printBtnSelector: ".debate-print-btn",
    errorSelectorFull: "#debate-error",
    errorMessageSelector: "#debate-error-message",
    errorBackBtnSelector: ".debate-error-back-btn",
    retryBtnSelector: ".debate-retry-btn",
    generateEndpoint: "/api/generate-debate",
    progressMessages: [
      { text: "Step 1 of 4: Analysing resolution...", pct: 20 },
      { text: "Step 2 of 4: Building case framework...", pct: 50 },
      { text: "Step 3 of 4: Anticipating opposition...", pct: 75 },
      { text: "Step 4 of 4: Preparing cross-ex...", pct: 98 },
    ],
    renderReport: renderDebateReport,
  });

  // Project Builder
  createNavigator({
    key: "project",
    questions: projectQuestions,
    introSelector: "#project-intro",
    formSelector: "#project-form",
    progressFillSelector: "#project-progress-f
