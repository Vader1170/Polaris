/* =========================================================
   POLARIS MULTI-NAVIGATOR SYSTEM
   Vanilla JS. No frameworks.
   Supports Research, Science Fair, Olympiad, Portfolio,
   Debate, Project, Learning, Paper, Journal, Career.
   ========================================================= */

(function () {
  "use strict";

  // ── Firebase Auth & User State ────────────────────────────────────
  let currentUser = null;
  let firebaseAuth = window.firebaseAuth;
  let firebaseDb = window.firebaseDb;

  if (firebaseAuth) {
    window.onAuthStateChanged(firebaseAuth, (user) => {
      currentUser = user;
      updateAuthUI(user);
    });
  }

  function updateAuthUI(user) {
    const container = document.getElementById("auth-container");
    if (!container) return;
    if (user) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${user.photoURL || ''}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">
          <span style="font-weight: 500;">${user.displayName || 'User'}</span>
          <button class="btn btn-ghost" id="sign-out-btn" style="font-size: 0.8rem; padding: 4px 12px;">Sign Out</button>
          <button class="btn btn-ghost" id="history-btn" style="font-size: 0.8rem; padding: 4px 12px;">History</button>
        </div>
      `;
      document.getElementById("sign-out-btn")?.addEventListener("click", () => {
        if (window.signOut) window.signOut(firebaseAuth);
      });
      document.getElementById("history-btn")?.addEventListener("click", showHistory);
    } else {
      container.innerHTML = `
        <button class="btn btn-primary" id="sign-in-btn" style="background: var(--paper); color: var(--navy-950);">Sign in with Google</button>
      `;
      document.getElementById("sign-in-btn")?.addEventListener("click", () => {
        const provider = new window.GoogleAuthProvider();
        window.signInWithPopup(firebaseAuth, provider);
      });
    }
  }

  // ── History functions ──────────────────────────────────────────────
  async function showHistory() {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const resp = await fetch("/api/history", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error("Failed to fetch history");
      const items = await resp.json();

      const overlay = document.createElement("div");
      overlay.id = "history-overlay";
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); z-index: 9999;
        display: flex; justify-content: center; align-items: center;
        padding: 20px;
      `;
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      const panel = document.createElement("div");
      panel.style.cssText = `
        background: var(--navy-900); max-width: 600px; width: 100%;
        border-radius: 8px; padding: 24px; max-height: 80vh; overflow-y: auto;
        border: 1px solid var(--gold);
      `;
      let html = `<h3 style="font-family: var(--font-display); margin-bottom: 16px;">Your Roadmaps</h3>`;
      if (items.length === 0) {
        html += `<p style="color: rgba(247,245,240,0.6);">No saved roadmaps yet. Generate one and it will appear here.</p>`;
      } else {
        html += `<ul style="list-style: none; padding: 0;">`;
        items.forEach(item => {
          const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Unknown date";
          const label = item.summary || item.navigatorType || "Roadmap";
          html += `
            <li style="margin-bottom: 12px; border-bottom: 1px solid rgba(247,245,240,0.05); padding-bottom: 8px;">
              <button class="btn btn-ghost history-item-btn" data-id="${item.id}" style="width: 100%; text-align: left; padding: 8px; font-size: 0.95rem;">
                <strong>${label}</strong> <span style="color: rgba(247,245,240,0.5); font-size: 0.85rem;">${date}</span>
              </button>
            </li>
          `;
        });
        html += `</ul>`;
      }
      html += `<button class="btn btn-ghost" id="history-close-btn" style="margin-top: 16px;">Close</button>`;
      panel.innerHTML = html;
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      panel.querySelectorAll(".history-item-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          await loadRoadmapById(id);
          overlay.remove();
        });
      });
      document.getElementById("history-close-btn").addEventListener("click", () => overlay.remove());
    } catch (err) {
      console.error("History error:", err);
      alert("Could not load history.");
    }
  }

  async function loadRoadmapById(id) {
    if (!currentUser) return;
    try {
      const token = await currentUser.getIdToken();
      const resp = await fetch(`/api/history/${id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error("Failed to load roadmap");
      const data = await resp.json();
      const navName = data.navigatorType || "research";
      showNavigator(navName);
      const nav = NAVIGATORS[navName];
      if (nav) {
        const section = document.querySelector(`.navigator[data-navigator="${navName}"]`);
        if (section) {
          const grid = section.querySelector(nav.reportGridSelector);
          const titleEl = section.querySelector(nav.reportTitleSelector);
          const leadEl = section.querySelector(nav.reportLeadSelector);
          if (grid && titleEl && leadEl && nav.renderReport) {
            const intro = section.querySelector(".navigator-intro");
            const form = section.querySelector(".navigator-form");
            const complete = section.querySelector(".navigator-complete");
            const loading = section.querySelector(".navigator-loading");
            const report = section.querySelector(".roadmap-container");
            if (intro) intro.hidden = true;
            if (form) form.hidden = true;
            if (complete) complete.hidden = true;
            if (loading) loading.hidden = true;
            if (report) report.hidden = false;
            nav.renderReport(data.roadmap, titleEl, leadEl, grid);
          }
        }
      }
    } catch (err) {
      console.error("Error loading roadmap:", err);
      alert("Could not load the roadmap.");
    }
  }

  // ── Existing DOM helpers ───────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const dashboardView = document.getElementById("dashboard-view");
  const backButtons = $$(".back-to-dashboard-btn");

  function hideAllNavigators() {
    $$(".navigator").forEach(el => el.style.display = "none");
  }

  function showNavigator(name) {
    hideAllNavigators();
    const section = document.querySelector(`.navigator[data-navigator="${name}"]`);
    if (section) section.style.display = "block";
    if (dashboardView) dashboardView.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToDashboard() {
    hideAllNavigators();
    if (dashboardView) dashboardView.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  backButtons.forEach(btn => btn.addEventListener("click", goToDashboard));

  const toolCards = $$(".tool-card.active[data-navigator]");
  toolCards.forEach(card => {
    card.addEventListener("click", () => {
      const navName = card.dataset.navigator;
      if (navName) {
        showNavigator(navName);
        if (NAVIGATORS[navName]) {
          const nav = NAVIGATORS[navName];
          if (nav.init) nav.init();
        }
      }
    });
  });

  const NAVIGATORS = {};

  function createNavigator(config) {
    const {
      key,
      questions,
      introSelector,
      formSelector,
      progressFillSelector,
      currentStepSelector,
      totalStepsSelector,
      questionViewportSelector,
      errorSelector,
      prevBtnSelector,
      nextBtnSelector,
      completeSelector,
      resultsOutputSelector,
      restartBtnSelectors,
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

    const state = {
      currentIndex: 0,
      direction: "forward",
      answers: {},
      isGenerating: false,
    };

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

    const restartBtns = restartBtnSelectors.map(s => $(s)).filter(Boolean);

    const progressMessages = config.progressMessages || [
      { text: "Step 1 of 4: Analysing your input...", pct: 15 },
      { text: "Step 2 of 4: Structuring your plan...", pct: 45 },
      { text: "Step 3 of 4: Refining details...", pct: 72 },
      { text: "Step 4 of 4: Finalising report...", pct: 98 },
    ];

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
      updateChrome();
      intro.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function startForm() {
      intro.hidden = true;
      form.hidden = false;
      goToStep(0, "forward");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function updateLoadingStatus(msg, pct) {
      if (loadingMessage) loadingMessage.textContent = msg;
      if (loadingProgressFill && pct !== undefined) {
        loadingProgressFill.style.width = pct + "%";
      }
    }

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
        const endpoint = config.generateEndpoint;
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

    // ── Modified callAiApi with Firebase token ──────────────────────
    async function callAiApi(endpoint, answers, attempt = 1, maxAttempts = 3) {
      const headers = { "Content-Type": "application/json" };
      if (currentUser) {
        const token = await currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }
      const timeoutMs = 45000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: headers,
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

    function renderReport(data) {
      if (config.renderReport) {
        config.renderReport(data, reportTitle, reportLead, reportGrid);
      } else {
        reportTitle.textContent = "Your Plan";
        reportLead.textContent = "Generated roadmap.";
        reportGrid.innerHTML = `<pre style="color: var(--paper);">${JSON.stringify(data, null, 2)}</pre>`;
      }
    }

    function init() {
      const startBtn = intro.querySelector(".start-navigator-btn");
      if (startBtn) startBtn.addEventListener("click", startForm);

      if (prevBtn) prevBtn.addEventListener("click", handlePrev);
      if (nextBtn) nextBtn.addEventListener("click", handleNext);

      restartBtns.forEach(btn => btn.addEventListener("click", restart));

      if (generateBtn) generateBtn.addEventListener("click", generate);
      if (regenerateBtn) regenerateBtn.addEventListener("click", generate);
      if (retryBtn) retryBtn.addEventListener("click", generate);

      if (printBtn) {
        printBtn.addEventListener("click", () => {
          reportGrid.querySelectorAll(".roadmap-card").forEach(card => {
            const content = card.querySelector(".card-content");
            const toggle = card.querySelector(".collapse-toggle");
            if (content) content.style.display = "block";
            if (toggle) toggle.textContent = "[ collapse ]";
            card.style.opacity = "1";
          });
          let header = report.querySelector(".print-report-header");
          if (!header) {
            header = document.createElement("div");
            header.className = "print-report-header";
            report.insertBefore(header, report.firstChild);
          }
          const titleText = reportTitle.textContent || "Polaris Plan";
          const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
          header.innerHTML = `<span>Polaris - ${titleText}</span><span>Generated ${dateStr}</span>`;
          window.print();
        });
      }

      if (errorBackBtn) errorBackBtn.addEventListener("click", () => {
        errorScreen.hidden = true;
        complete.hidden = false;
      });

      if (form) form.addEventListener("submit", e => e.preventDefault());

      if (form) {
        form.addEventListener("keydown", (e) => {
          const isText = e.target.tagName === "INPUT" && e.target.type !== "checkbox" && e.target.type !== "radio";
          if (e.key === "Enter" && isText) {
            e.preventDefault();
            handleNext();
          }
        });
      }

      if (totalSteps) totalSteps.textContent = questions.length;
      updateChrome();
    }

    if (isJournal) {
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

      let editingIndex = null;

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
            editingIndex = idx;
            workInput.focus();
          });
        });
      }

      function handleJournalSubmit(e) {
        e.preventDefault();
        const date = dateInput.value;
        const work = workInput.value.trim();
        if (!date || !work) {
          alert('Date and Work are required.');
          return;
        }
        const entries = loadEntries();
        const entryData = {
          date,
          work,
          blockers: blockersInput.value.trim(),
          next: nextInput.value.trim(),
        };
        if (editingIndex !== null && entries[editingIndex]) {
          entries[editingIndex] = entryData;
          editingIndex = null;
        } else {
          entries.push(entryData);
        }
        saveEntries(entries);
        renderEntries();
        entryForm.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        workInput.focus();
      }

      async function summarizeJournal() {
        const entries = loadEntries();
        if (entries.length === 0) {
          alert('No entries to summarize. Please add some entries first.');
          return;
        }
        const count = prompt('How many recent entries to summarize? (e.g. 5)', '5');
        if (!count) return;
        const n = parseInt(count) || 5;
        const recent = entries.slice(-n);
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

      function journalInit() {
        const startBtn = intro.querySelector(".start-navigator-btn");
        if (startBtn) {
          startBtn.addEventListener("click", () => {
            intro.hidden = true;
            journalApp.hidden = false;
            dateInput.value = new Date().toISOString().split('T')[0];
            renderEntries();
          });
        }
        if (entryForm) entryForm.addEventListener("submit", handleJournalSubmit);
        if (summarizeBtn) summarizeBtn.addEventListener("click", summarizeJournal);
        if (summaryClose) summaryClose.addEventListener("click", () => {
          summaryContainer.style.display = 'none';
        });
        if (journalRetry) journalRetry.addEventListener("click", summarizeJournal);
      }

      config.init = journalInit;
      config.renderEntries = renderEntries;

      NAVIGATORS[key] = config;
      return config;
    }

    config.init = init;
    // ── Store report selectors for history view ──────────────────────
    config.reportTitleSelector = reportTitleSelector;
    config.reportLeadSelector = reportLeadSelector;
    config.reportGridSelector = reportGridSelector;
    config.renderReport = renderReport; // already set but ensure

    NAVIGATORS[key] = config;

    return config;
  }

  // ── All question sets (unchanged) ──────────────────────────────────
  // ... (keep all the question arrays exactly as they were)

  const researchQuestions = [
    // ... unchanged
  ];

  const scienceFairQuestions = [
    // ... unchanged
  ];

  const olympiadQuestions = [
    // ... unchanged
  ];

  const portfolioQuestions = [
    // ... unchanged
  ];

  const debateQuestions = [
    // ... unchanged
  ];

  const projectQuestions = [
    // ... unchanged
  ];

  const learningQuestions = [
    // ... unchanged
  ];

  const paperQuestions = [
    // ... unchanged
  ];

  const careerQuestions = [
    // ... unchanged
  ];

  // ── All createNavigator calls (unchanged) ──────────────────────────
  createNavigator({ ... }); // all same

  // ── Report renderers (unchanged) ──────────────────────────────────
  // All createGridCard, createFullWidthCard, render*Report functions remain exactly as they were.

  // (We omit the full definitions here for brevity, but they stay identical.)

})();
