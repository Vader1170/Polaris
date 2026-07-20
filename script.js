/* =========================================================
   POLARIS MULTI-NAVIGATOR SYSTEM
   Vanilla JS. No frameworks.
   Supports Research, Science Fair, Olympiad, Portfolio,
   Debate, Project, Learning, Paper, Journal, Career.
   ========================================================= */

(function () {
  "use strict";

  // ── Firebase auth & history ──────────────────────────────────────

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
            // Hide other views
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

  // ── DOM helpers & navigation ──────────────────────────────────────

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

  // ── Navigator factory ──────────────────────────────────────────────

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
  restartBtnSelectors = [],             // ✅ default empty array
  generateBtnSelector = null,
  loadingSelector,
  loadingMessageSelector,
  loadingProgressFillSelector,
  loadingProgressTextSelector,
  reportSelector,
  reportTitleSelector,
  reportLeadSelector,
  reportGridSelector,
  regenerateBtnSelector = null,
  printBtnSelector = null,
  errorSelectorFull,
  errorMessageSelector,
  errorBackBtnSelector = null,
  retryBtnSelector = null,
  isJournal = false,
  // journal-specific
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

    // ── Journal-specific initialisation ──────────────────────────────

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

    // ── For non‑journal navigators ──────────────────────────────────

    config.reportTitleSelector = reportTitleSelector;
    config.reportLeadSelector = reportLeadSelector;
    config.reportGridSelector = reportGridSelector;
    config.init = init;
    NAVIGATORS[key] = config;
    return config;
  }

  // ── Question definitions (unchanged) ──────────────────────────────

  const researchQuestions = [
    { key: "age", type: "text", inputType: "number", label: "How old are you?", hint: "This helps calibrate ambition.", placeholder: "e.g. 16", required: true },
    { key: "interests", type: "textarea", label: "What are you genuinely curious about right now?", hint: "Any field, hobby, or question counts.", placeholder: "e.g. how vaccines are designed, why markets crash...", required: true },
    { key: "favouriteSubjects", type: "checkbox", label: "Which subjects do you enjoy most?", hint: "Select all that apply.", required: true, options: ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Economics", "Engineering", "Humanities / Social Science", "Other"] },
    { key: "mathBackground", type: "radio", label: "How would you describe your mathematical background?", hint: "Be honest.", required: true, options: ["Just school-level math", "Comfortable with calculus", "Comfortable with linear algebra / proofs", "Studied topics beyond standard high school math (e.g. olympiad math, real analysis)"] },
    { key: "programmingExperience", type: "radio", label: "What's your programming experience?", hint: "", required: true, options: ["None yet", "Beginner (basic syntax, small scripts)", "Intermediate (built small projects independently)", "Advanced (comfortable with data structures, libraries, or larger codebases)"] },
    { key: "availableTime", type: "dropdown", label: "How much time can you realistically commit each week?", hint: "", required: true, options: ["Choose an option", "Under 3 hours", "3-6 hours", "6-10 hours", "10+ hours"] },
    { key: "researchExperience", type: "radio", label: "Have you done any research before?", hint: "", required: true, options: ["None yet", "A school project or science fair", "An independent project I designed myself", "Worked with a mentor, lab, or published something"] },
    { key: "publicationGoals", type: "dropdown", label: "Is publishing your research a goal for you?", hint: "", required: true, options: ["Choose an option", "Not a priority right now", "Yes, eventually", "Yes - I'm actively aiming for a specific journal or conference"] },
    { key: "competitionGoals", type: "checkbox", label: "Are you targeting any competitions?", hint: "Select all that apply, or skip if none.", required: false, options: ["Math olympiads (e.g. AMTI, INMO)", "Science fairs (e.g. ISEF, AIMER)", "RSI / research-focused programs", "Coding competitions", "None currently"] },
    { key: "learningStyle", type: "radio", label: "How do you learn best?", hint: "", required: true, options: ["Reading textbooks and papers on my own", "Watching lectures or video explanations", "Working through problems hands-on", "Discussing ideas with a mentor or peers"] },
    { key: "resourcesAvailable", type: "checkbox", label: "What resources do you currently have access to?", hint: "Select all that apply.", required: true, options: ["A mentor or teacher who can guide me", "A computer and stable internet", "A library or paid journal access", "A school lab or research facility", "None of the above yet"] },
    { key: "biggestChallenge", type: "textarea", label: "What's the biggest thing holding you back right now?", hint: "Time, direction, resources, confidence - anything.", placeholder: "e.g. I don't know how to find a research question worth pursuing...", required: true },
    { key: "dreamProject", type: "textarea", label: "If nothing could stop you, what would your dream project be?", hint: "Think big - this shapes the direction.", placeholder: "e.g. build a model that predicts...", required: false },
    { key: "careerAspirations", type: "text", inputType: "text", label: "What's your long-term career aspiration?", hint: "It's okay if this is a rough guess.", placeholder: "e.g. aerospace engineer, research scientist, founder...", required: false },
    { key: "currentGoal", type: "dropdown", label: "What's your single most immediate goal right now?", hint: "", required: true, options: ["Choose an option", "Finding a research topic", "Preparing for a competition", "Preparing for university admissions (e.g. MIT, Cambridge)", "Building technical skills", "Writing or publishing a paper"] },
  ];

  const scienceFairQuestions = [
    { key: "targetFairs", type: "checkbox", label: "Which fair(s) are you targeting?", hint: "Select all that apply.", required: true, options: ["ISEF/Regeneron affiliate fair", "EUCYS", "State/regional fair", "School fair", "Other/unsure"] },
    { key: "deadline", type: "text", inputType: "date", label: "Fair deadline / project timeline (date)", hint: "When is your fair?", placeholder: "e.g. 2026-03-15", required: true },
    { key: "projectIdea", type: "textarea", label: "Rough project idea or area of interest", hint: "Describe what you're curious about.", placeholder: "e.g. I want to study how different fertilisers affect plant growth...", required: true },
    { key: "category", type: "dropdown", label: "Which category does your project fall into?", hint: "", required: true, options: ["Choose an option", "Engineering", "Environmental Science", "Biology", "Chemistry", "Physics/Astronomy", "Computer Science", "Robotics", "Behavioral/Social Science", "Other"] },
    { key: "hypothesisStatus", type: "radio", label: "Do you already have a hypothesis, or are you still exploring?", hint: "", required: true, options: ["I have a testable hypothesis", "I'm still exploring the question"] },
    { key: "equipmentAccess", type: "checkbox", label: "What equipment/lab access do you have?", hint: "Select all that apply.", required: true, options: ["Home only", "School lab", "Mentor/university lab access", "None yet"] },
    { key: "experience", type: "dropdown", label: "Prior science fair experience?", hint: "", required: true, options: ["Choose an option", "None", "Participated once", "Won awards at school/regional level", "National/international experience"] },
    { key: "team", type: "radio", label: "Are you working solo or with a partner/team?", hint: "", required: true, options: ["Solo", "Partner", "Team (3+)"] },
    { key: "budget", type: "dropdown", label: "Budget constraints?", hint: "", required: false, options: ["Choose an option", "No budget", "Under $50", "$50-$200", "$200+"] },
    { key: "unsureAbout", type: "textarea", label: "What are you most unsure about?", hint: "e.g. experimental design, data analysis, presentation.", placeholder: "I'm not sure how to control variables...", required: true },
  ];

  const olympiadQuestions = [
    { key: "olympiads", type: "checkbox", label: "Which olympiad(s) are you preparing for?", hint: "Select all that apply.", required: true, options: ["Math - AMC/AIME/Olympiad-level (e.g. INMO/IMO track)", "Physics - e.g. IPhO track", "Chemistry - e.g. IChO track", "Biology - e.g. IBO track", "Informatics/Coding - e.g. IOI/USACO track", "Other/unsure"] },
    { key: "currentLevel", type: "dropdown", label: "Current level in that subject", hint: "", required: true, options: ["Choose an option", "Beginner / just starting", "Competent at school level", "Already medals at local competitions", "Training for national team"] },
    { key: "targetDate", type: "text", inputType: "date", label: "Target competition date", hint: "When is the exam?", placeholder: "e.g. 2026-05-20", required: true },
    { key: "hoursPerWeek", type: "dropdown", label: "Hours available per week for preparation", hint: "", required: true, options: ["Choose an option", "Under 5", "5-10", "10-20", "20+"] },
    { key: "learningStyle", type: "radio", label: "Preferred learning style", hint: "", required: true, options: ["Reading books/papers", "Watching lectures/videos", "Solving problems", "Discussing with others"] },
    { key: "pastScores", type: "text", label: "Past scores/results (if any)", hint: "Optional", placeholder: "e.g. AMC 12 score 90", required: false },
    { key: "coach", type: "radio", label: "Access to a coach/mentor/team?", hint: "", required: true, options: ["Yes", "No"] },
    { key: "weakArea", type: "textarea", label: "Biggest weak area", hint: "What do you find most challenging?", placeholder: "e.g. geometry proofs, organic chemistry mechanisms...", required: true },
  ];

  const portfolioQuestions = [
    { key: "existingWork", type: "checkbox", label: "What do you already have?", hint: "Select all that apply.", required: true, options: ["Open-source code/GitHub repos", "A research paper/pre-print", "Competition results", "A personal project", "Internship/lab experience", "None yet - starting from scratch"] },
    { key: "targetUniversities", type: "text", label: "Target universities/programs", hint: "Comma separated is fine.", placeholder: "e.g. MIT, Cambridge, Stanford", required: true },
    { key: "intendedMajor", type: "text", label: "Intended major/field", hint: "", placeholder: "e.g. Computer Science, Physics", required: true },
    { key: "strongestThing", type: "textarea", label: "What's the single strongest thing you've built or done?", hint: "Be specific.", placeholder: "e.g. I built a web app for local farmers that predicts crop yield...", required: true },
    { key: "gap", type: "textarea", label: "What gap do you feel exists in your portfolio?", hint: "What's missing?", placeholder: "e.g. I don't have any published research...", required: true },
    { key: "timeline", type: "text", inputType: "date", label: "Timeline to application deadline", hint: "When is your first deadline?", placeholder: "e.g. 2026-11-01", required: true },
    { key: "approach", type: "radio", label: "Do you want to add something new or just better present what exists?", hint: "", required: true, options: ["Add something new", "Better present what I have", "Both"] },
  ];

  const debateQuestions = [
    { key: "format", type: "dropdown", label: "Debate format", hint: "", required: true, options: ["Choose an option", "World Schools", "Lincoln-Douglas", "Public Forum", "Policy", "British Parliamentary", "Other"] },
    { key: "resolution", type: "textarea", label: "The exact resolution/topic", hint: "Required", placeholder: "e.g. This house believes that...", required: true },
    { key: "side", type: "dropdown", label: "Side you need to argue", hint: "", required: true, options: ["Choose an option", "Proposition/Affirmative", "Opposition/Negative", "Both - need to prep for either"] },
    { key: "tournamentDate", type: "text", inputType: "date", label: "Tournament date", hint: "", placeholder: "e.g. 2026-04-10", required: true },
    { key: "experience", type: "dropdown", label: "Experience level", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "hoursAvailable", type: "dropdown", label: "Hours available to prep", hint: "", required: true, options: ["Choose an option", "Under 5", "5-10", "10-20", "20+"] },
    { key: "existingMaterials", type: "checkbox", label: "What do you already have?", hint: "Select all that apply.", required: false, options: ["Nothing yet", "Some research", "A partial case", "Cards/evidence collected"] },
  ];

  const projectQuestions = [
    { key: "idea", type: "textarea", label: "What do you want to build?", hint: "Required", placeholder: "e.g. A mobile app for language learning...", required: true },
    { key: "audience", type: "textarea", label: "Who is it for / what problem does it solve?", hint: "", placeholder: "e.g. For students who want to learn vocabulary on the go...", required: true },
    { key: "skillLevel", type: "dropdown", label: "Your current technical skill level", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "techStack", type: "text", label: "Preferred tech stack (if any)", hint: "Optional", placeholder: "e.g. React, Node.js, MongoDB", required: false },
    { key: "timePerWeek", type: "dropdown", label: "Time available per week", hint: "", required: true, options: ["Choose an option", "Under 3", "3-6", "6-10", "10+"] },
    { key: "targetLaunch", type: "text", inputType: "date", label: "Target launch/demo date (if any)", hint: "Optional", placeholder: "e.g. 2026-08-01", required: false },
    { key: "teamSize", type: "radio", label: "Solo or with a team?", hint: "", required: true, options: ["Solo", "Team"] },
  ];

  const learningQuestions = [
    { key: "subject", type: "textarea", label: "What are you trying to learn?", hint: "Required", placeholder: "e.g. Calculus BC, Real Analysis, specific textbook title", required: true },
    { key: "textbook", type: "text", label: "Do you have a specific textbook/course already chosen?", hint: "Optional", placeholder: "e.g. Stewart Calculus", required: false },
    { key: "currentLevel", type: "dropdown", label: "Current level in the subject", hint: "", required: true, options: ["Choose an option", "Beginner", "Intermediate", "Advanced"] },
    { key: "reason", type: "dropdown", label: "Why are you learning this?", hint: "", required: true, options: ["Choose an option", "School requirement", "Exam prep", "Personal interest", "Prerequisite for research/olympiad", "Other"] },
    { key: "targetDate", type: "text", inputType: "date", label: "Target date (exam date, deadline, or none)", hint: "Optional", placeholder: "e.g. 2026-06-01", required: false },
    { key: "hoursPerWeek", type: "dropdown", label: "Hours available per week", hint: "", required: true, options: ["Choose an option", "Under 3", "3-6", "6-10", "10+"] },
    { key: "learningStyle", type: "radio", label: "Preferred learning style", hint: "", required: true, options: ["Reading", "Watching videos", "Solving problems", "Discussing"] },
  ];

  const paperQuestions = [
    { key: "field", type: "text", label: "Field/subject area", hint: "e.g. Computer Science, Biology", placeholder: "e.g. Machine Learning", required: true },
    { key: "venue", type: "text", label: "Target venue (if any)", hint: "e.g. Journal, conference, class assignment", placeholder: "e.g. NeurIPS, school science fair", required: false },
    { key: "manuscript", type: "textarea", label: "Paste your manuscript text here", hint: "Provide the full text or a detailed description.", placeholder: "Paste your draft here...", required: true },
    { key: "feedbackFocus", type: "checkbox", label: "What kind of feedback do you want most?", hint: "Select all that apply.", required: true, options: ["Methodology", "Writing clarity", "Statistics/results", "Citations", "All of the above"] },
  ];

  const careerQuestions = [
    { key: "fields", type: "text", label: "Field(s) of interest", hint: "e.g. Physics, Computer Science", placeholder: "e.g. Astrophysics, AI", required: true },
    { key: "stage", type: "dropdown", label: "Current academic stage", hint: "", required: true, options: ["Choose an option", "High school", "Undergraduate", "Graduate", "Other"] },
    { key: "lookingFor", type: "checkbox", label: "What are you looking for?", hint: "Select all that apply.", required: true, options: ["Understanding subfields/specializations", "Finding labs/professors to reach out to", "Finding internships/summer programs", "Understanding grad school paths"] },
    { key: "geographic", type: "text", label: "Geographic constraints (if any)", hint: "Optional", placeholder: "e.g. USA, Europe, remote", required: false },
    { key: "timeHorizon", type: "dropdown", label: "Time horizon", hint: "", required: true, options: ["Choose an option", "This summer", "Next year", "Several years out"] },
  ];

  // ── Register all navigators ────────────────────────────────────────

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
      renderResearchReport(data, titleEl, leadEl, gridEl);
    },
  });

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

  createNavigator({
    key: "project",
    questions: projectQuestions,
    introSelector: "#project-intro",
    formSelector: "#project-form",
    progressFillSelector: "#project-progress-fill",
    currentStepSelector: "#project-current-step",
    totalStepsSelector: "#project-total-steps",
    questionViewportSelector: "#project-question-viewport",
    errorSelector: "#project-form-error",
    prevBtnSelector: ".project-prev-btn",
    nextBtnSelector: ".project-next-btn",
    completeSelector: "#project-complete",
    resultsOutputSelector: "#project-results-output",
    restartBtnSelectors: [".project-restart-btn"],
    generateBtnSelector: ".project-generate-btn",
    loadingSelector: "#project-loading",
    loadingMessageSelector: "#project-loading-message",
    loadingProgressFillSelector: "#project-loading-progress-fill",
    loadingProgressTextSelector: "#project-loading-progress-text",
    reportSelector: "#project-report",
    reportTitleSelector: "#project-report-title",
    reportLeadSelector: "#project-report-lead",
    reportGridSelector: "#project-report-grid",
    regenerateBtnSelector: ".project-regenerate-btn",
    printBtnSelector: ".project-print-btn",
    errorSelectorFull: "#project-error",
    errorMessageSelector: "#project-error-message",
    errorBackBtnSelector: ".project-error-back-btn",
    retryBtnSelector: ".project-retry-btn",
    generateEndpoint: "/api/generate-project",
    progressMessages: [
      { text: "Step 1 of 4: Analysing project scope...", pct: 20 },
      { text: "Step 2 of 4: Defining core features...", pct: 50 },
      { text: "Step 3 of 4: Planning milestones...", pct: 75 },
      { text: "Step 4 of 4: Suggesting tech stack...", pct: 98 },
    ],
    renderReport: renderProjectReport,
  });

  createNavigator({
    key: "learning",
    questions: learningQuestions,
    introSelector: "#learning-intro",
    formSelector: "#learning-form",
    progressFillSelector: "#learning-progress-fill",
    currentStepSelector: "#learning-current-step",
    totalStepsSelector: "#learning-total-steps",
    questionViewportSelector: "#learning-question-viewport",
    errorSelector: "#learning-form-error",
    prevBtnSelector: ".learning-prev-btn",
    nextBtnSelector: ".learning-next-btn",
    completeSelector: "#learning-complete",
    resultsOutputSelector: "#learning-results-output",
    restartBtnSelectors: [".learning-restart-btn"],
    generateBtnSelector: ".learning-generate-btn",
    loadingSelector: "#learning-loading",
    loadingMessageSelector: "#learning-loading-message",
    loadingProgressFillSelector: "#learning-loading-progress-fill",
    loadingProgressTextSelector: "#learning-loading-progress-text",
    reportSelector: "#learning-report",
    reportTitleSelector: "#learning-report-title",
    reportLeadSelector: "#learning-report-lead",
    reportGridSelector: "#learning-report-grid",
    regenerateBtnSelector: ".learning-regenerate-btn",
    printBtnSelector: ".learning-print-btn",
    errorSelectorFull: "#learning-error",
    errorMessageSelector: "#learning-error-message",
    errorBackBtnSelector: ".learning-error-back-btn",
    retryBtnSelector: ".learning-retry-btn",
    generateEndpoint: "/api/generate-learning",
    progressMessages: [
      { text: "Step 1 of 4: Identifying learning goals...", pct: 20 },
      { text: "Step 2 of 4: Breaking down topics...", pct: 50 },
      { text: "Step 3 of 4: Creating weekly schedule...", pct: 75 },
      { text: "Step 4 of 4: Recommending resources...", pct: 98 },
    ],
    renderReport: renderLearningReport,
  });

  createNavigator({
    key: "paper",
    questions: paperQuestions,
    introSelector: "#paper-intro",
    formSelector: "#paper-form",
    progressFillSelector: "#paper-progress-fill",
    currentStepSelector: "#paper-current-step",
    totalStepsSelector: "#paper-total-steps",
    questionViewportSelector: "#paper-question-viewport",
    errorSelector: "#paper-form-error",
    prevBtnSelector: ".paper-prev-btn",
    nextBtnSelector: ".paper-next-btn",
    completeSelector: "#paper-complete",
    resultsOutputSelector: "#paper-results-output",
    restartBtnSelectors: [".paper-restart-btn"],
    generateBtnSelector: ".paper-generate-btn",
    loadingSelector: "#paper-loading",
    loadingMessageSelector: "#paper-loading-message",
    loadingProgressFillSelector: "#paper-loading-progress-fill",
    loadingProgressTextSelector: "#paper-loading-progress-text",
    reportSelector: "#paper-report",
    reportTitleSelector: "#paper-report-title",
    reportLeadSelector: "#paper-report-lead",
    reportGridSelector: "#paper-report-grid",
    regenerateBtnSelector: ".paper-regenerate-btn",
    printBtnSelector: ".paper-print-btn",
    errorSelectorFull: "#paper-error",
    errorMessageSelector: "#paper-error-message",
    errorBackBtnSelector: ".paper-error-back-btn",
    retryBtnSelector: ".paper-retry-btn",
    generateEndpoint: "/api/generate-paper",
    progressMessages: [
      { text: "Step 1 of 4: Reading your text...", pct: 20 },
      { text: "Step 2 of 4: Evaluating methodology...", pct: 50 },
      { text: "Step 3 of 4: Checking clarity...", pct: 75 },
      { text: "Step 4 of 4: Formulating revisions...", pct: 98 },
    ],
    renderReport: renderPaperReport,
  });

  createNavigator({
    key: "journal",
    isJournal: true,
    introSelector: "#journal-intro",
    journalAppSelector: "#journal-app",
    journalEntryForm: "#journal-entry-form",
    journalDate: "#journal-date",
    journalWork: "#journal-work",
    journalBlockers: "#journal-blockers",
    journalNext: "#journal-next",
    journalEntriesList: "#journal-entries-list",
    journalSummarizeBtn: "#journal-summarize-btn",
    journalSummaryContainer: "#journal-summary-container",
    journalSummaryContent: "#journal-summary-content",
    journalError: "#journal-error",
    journalErrorMessage: "#journal-error-message",
    journalRetrySummary: "#journal-retry-summary",
    journalSummaryClose: "#journal-summary-close",
  });

  createNavigator({
    key: "career",
    questions: careerQuestions,
    introSelector: "#career-intro",
    formSelector: "#career-form",
    progressFillSelector: "#career-progress-fill",
    currentStepSelector: "#career-current-step",
    totalStepsSelector: "#career-total-steps",
    questionViewportSelector: "#career-question-viewport",
    errorSelector: "#career-form-error",
    prevBtnSelector: ".career-prev-btn",
    nextBtnSelector: ".career-next-btn",
    completeSelector: "#career-complete",
    resultsOutputSelector: "#career-results-output",
    restartBtnSelectors: [".career-restart-btn"],
    generateBtnSelector: ".career-generate-btn",
    loadingSelector: "#career-loading",
    loadingMessageSelector: "#career-loading-message",
    loadingProgressFillSelector: "#career-loading-progress-fill",
    loadingProgressTextSelector: "#career-loading-progress-text",
    reportSelector: "#career-report",
    reportTitleSelector: "#career-report-title",
    reportLeadSelector: "#career-report-lead",
    reportGridSelector: "#career-report-grid",
    regenerateBtnSelector: ".career-regenerate-btn",
    printBtnSelector: ".career-print-btn",
    errorSelectorFull: "#career-error",
    errorMessageSelector: "#career-error-message",
    errorBackBtnSelector: ".career-error-back-btn",
    retryBtnSelector: ".career-retry-btn",
    generateEndpoint: "/api/generate-career",
    progressMessages: [
      { text: "Step 1 of 4: Analysing your interests...", pct: 20 },
      { text: "Step 2 of 4: Mapping subfields...", pct: 50 },
      { text: "Step 3 of 4: Finding labs and opportunities...", pct: 75 },
      { text: "Step 4 of 4: Outlining next actions...", pct: 98 },
    ],
    renderReport: renderCareerReport,
  });

  // ── UI card helpers ──────────────────────────────────────────────────

  function createGridCard(title, innerHTML, icon = "✦", collapsible = true) {
    const card = document.createElement("div");
    card.className = "roadmap-card";
    card.innerHTML = `
      <h3 style="cursor: ${collapsible ? 'pointer' : 'default'}; display: flex; justify-content: space-between; align-items: center; user-select: none; margin: 0 0 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.08); padding-bottom: 10px;">
        <span style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--gold); font-size: 1rem;">${icon}</span>
          ${title}
        </span>
        ${collapsible ? '<button type="button" class="collapse-toggle">[ collapse ]</button>' : ''}
      </h3>
      <div class="card-content" style="transition: all 0.3s ease;">
        ${innerHTML}
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
    return card;
  }

  function createFullWidthCard(title, innerHTML, icon = "✦", collapsible = true) {
    const card = document.createElement("div");
    card.className = "roadmap-card full-width";
    card.innerHTML = `
      <h3 style="cursor: ${collapsible ? 'pointer' : 'default'}; display: flex; justify-content: space-between; align-items: center; user-select: none; margin: 0 0 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.08); padding-bottom: 10px;">
        <span style="display: flex; align-items: center; gap: 10px;">
          <span style="color: var(--gold); font-size: 1rem;">${icon}</span>
          ${title}
        </span>
        ${collapsible ? '<button type="button" class="collapse-toggle">[ collapse ]</button>' : ''}
      </h3>
      <div class="card-content" style="transition: all 0.3s ease;">
        ${innerHTML}
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
    return card;
  }

  // ── Report renderers ──────────────────────────────────────────────────

  function renderResearchReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = `Path to True North: ${data.recommendedField || data.recommendedResearchArea || "Your Research Journey"}`;
    leadEl.textContent = data.researchVision || "Your tailored roadmap.";
    gridEl.innerHTML = "";

    const fieldVal = data.recommendedField || data.recommendedResearchArea || "Not specified";
    gridEl.appendChild(createFullWidthCard(
      "Recommended Field of Inquiry",
      `<p style="font-size: 1.25rem; color: var(--gold-bright); font-family: var(--font-display); font-weight: 500; margin-bottom: 12px; border-left: 2px solid var(--gold); padding-left: 12px;">${fieldVal}</p>
       <p style="margin-top: 10px;">${data.researchVision || ""}</p>`,
      "✦", false
    ));

    const qs = data.possibleResearchQuestions || data.possibleExperiments || [];
    if (qs.length) {
      const html = qs.map(q => {
        const text = typeof q === 'object' ? (q.title || q.description) : q;
        return `<li style="margin-bottom: 12px; border-bottom: 1px solid rgba(247, 245, 240, 0.03); padding-bottom: 8px;"><strong style="color: var(--paper);">${text}</strong></li>`;
      }).join("");
      gridEl.appendChild(createGridCard("Possible Research Questions", `<ol style="padding-left: 18px; margin-top: 4px;">${html}</ol>`, "❓"));
    }

    const reading = data.backgroundReading || data.suggestedReadingList || [];
    if (reading.length) {
      const html = reading.map(book => `
        <li style="margin-bottom: 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.05); padding-bottom: 12px; list-style: none;">
          <strong style="display: block; font-size: 1.05rem; color: var(--paper);">${book.title}</strong>
          <span style="font-size: 0.85rem; font-family: var(--font-mono); color: var(--gold-bright); display: block; margin-top: 2px;">By ${book.author}</span>
          <p style="margin: 6px 0 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.7);">${book.description}</p>
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Suggested Background Reading", `<ul style="padding-left: 0;">${html}</ul>`, "📖"));
    }

    if (data.skillsToLearn && data.skillsToLearn.length) {
      const html = data.skillsToLearn.map(s => `<li>${s}</li>`).join("");
      gridEl.appendChild(createGridCard("Skills To Learn", `<ul class="roadmap-card-mono-list">${html}</ul>`, "🛠️"));
    }

    const weeks = data.weeklyRoadmap || data.weeklyPlan || [];
    if (weeks.length) {
      const html = weeks.map(w => `
        <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(247, 245, 240, 0.05); padding-bottom: 12px;">
          <strong style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--gold-bright); display: block; text-transform: uppercase;">${w.weekNumber}</strong>
          <span style="font-weight: 600; display: block; margin: 4px 0 8px; color: var(--paper);">${w.objective}</span>
          <ul style="padding-left: 16px; margin: 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.75);">
            ${w.tasks.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join("")}
          </ul>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Weekly Roadmap (4-Week Plan)", html, "📅"));
    }

    const tools = data.softwareTools || data.recommendedSoftware || [];
    if (tools.length) {
      const html = tools.map(t => `
        <li style="margin-bottom: 12px; list-style: none;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${t.name}</strong>
          <span style="color: rgba(247, 245, 240, 0.7); font-size: 0.9rem; display: block; margin-top: 2px;">${t.purpose}</span>
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Recommended Software & Tools", `<ul style="padding-left: 0;">${html}</ul>`, "💻"));
    }

    const exps = data.experimentIdeas || data.possibleExperiments || [];
    if (exps.length) {
      const html = exps.map(e => `
        <li style="margin-bottom: 16px; list-style: none; border-left: 2px solid var(--gold); padding-left: 12px;">
          <strong style="color: var(--gold-bright); display: block; font-size: 1.02rem;">${e.title}</strong>
          <p style="margin: 4px 0 0; font-size: 0.9rem; color: rgba(247, 245, 240, 0.7);">${e.description}</p>
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Possible Experiments & Methodology", `<ul style="padding-left: 0;">${html}</ul>`, "🔬"));
    }

    if (data.publicationChecklist && data.publicationChecklist.length) {
      const html = data.publicationChecklist.map(i => `<li style="margin-bottom: 8px;">✔️ ${i}</li>`).join("");
      gridEl.appendChild(createGridCard("Publication Prep Checklist", `<ul style="list-style: none; padding-left: 0; font-size: 0.92rem;">${html}</ul>`, "📝"));
    }

    const comps = data.competitions || data.potentialCompetitions || [];
    if (comps.length) {
      const html = comps.map(c => `
        <li style="margin-bottom: 12px; list-style: none; background: rgba(247, 245, 240, 0.02); padding: 12px; border-radius: 6px;">
          <strong style="color: var(--paper);">${c.name}</strong>
          <p style="margin: 4px 0 0; font-size: 0.88rem; color: rgba(247, 245, 240, 0.65);">${c.suitability}</p>
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Potential Competitions & Programs", `<ul style="padding-left: 0;">${html}</ul>`, "🏆"));
    }

    if (data.commonMistakes && data.commonMistakes.length) {
      const html = data.commonMistakes.map(i => `<li>${i}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Pitfalls & Mistakes", `<ul style="padding-left: 20px; color: #F0A08D;">${html}</ul>`, "⚠️"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Your Next Three Actions", html, "🚀", false));
    }
  }

  function renderScienceFairReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.projectTitle || "Science Fair Project";
    leadEl.textContent = data.hypothesisStatement || "Hypothesis statement.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard(
      "Hypothesis",
      `<p style="font-size: 1.1rem; font-weight: 500; color: var(--gold-bright);">${data.hypothesisStatement || "Not provided"}</p>`,
      "✺", false
    ));

    const iv = data.independentVariable || "Not specified";
    const dv = data.dependentVariable || "Not specified";
    const cv = data.controlledVariables || [];
    const varsHtml = `
      <p><strong>Independent Variable:</strong> ${iv}</p>
      <p><strong>Dependent Variable:</strong> ${dv}</p>
      ${cv.length ? `<p><strong>Controlled Variables:</strong> ${cv.join(', ')}</p>` : ''}
    `;
    gridEl.appendChild(createGridCard("Variables", varsHtml, "📊"));

    const design = data.experimentalDesign || [];
    if (design.length) {
      const html = design.map(step => `
        <li style="margin-bottom: 8px; list-style: none; border-left: 2px solid var(--gold); padding-left: 12px;">
          <strong>${step.title}</strong> — ${step.description}
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Experimental Design", `<ul style="padding-left: 0;">${html}</ul>`, "🔬"));
    }

    const mats = data.materialsAndEquipment || [];
    if (mats.length) {
      const html = mats.map(m => `
        <li style="margin-bottom: 8px; list-style: none;">
          <strong>${m.name}</strong> — ${m.purpose} (${m.whereToGet || ''})
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Materials & Equipment", `<ul style="padding-left: 0;">${html}</ul>`, "🛠️"));
    }

    if (data.dataCollectionPlan) {
      gridEl.appendChild(createGridCard("Data Collection Plan", `<p>${data.dataCollectionPlan}</p>`, "📈"));
    }

    if (data.validationAndControls && data.validationAndControls.length) {
      const html = data.validationAndControls.map(v => `<li>${v}</li>`).join("");
      gridEl.appendChild(createGridCard("Validation & Controls", `<ul>${html}</ul>`, "✅"));
    }

    const board = data.displayBoardOutline || [];
    if (board.length) {
      const html = board.map(s => `<li><strong>${s.title}</strong> — ${s.description}</li>`).join("");
      gridEl.appendChild(createGridCard("Display Board Outline", `<ul>${html}</ul>`, "🖼️"));
    }

    const timeline = data.timelineToFairDate || [];
    if (timeline.length) {
      const html = timeline.map(t => `
        <div style="margin-bottom: 10px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${t.milestone}</strong> — ${t.targetDate || t.weekLabel || ''}
          <ul style="margin: 4px 0 0 16px;">${t.tasks ? t.tasks.map(ta => `<li>${ta}</li>`).join('') : ''}</ul>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Timeline to Fair Date", html, "📅"));
    }

    if (data.judgingPrepChecklist && data.judgingPrepChecklist.length) {
      const html = data.judgingPrepChecklist.map(j => `<li>${j}</li>`).join("");
      gridEl.appendChild(createGridCard("Judging Prep Checklist", `<ul>${html}</ul>`, "👨‍⚖️"));
    }

    if (data.commonPitfalls && data.commonPitfalls.length) {
      const html = data.commonPitfalls.map(p => `<li>${p}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Pitfalls", `<ul>${html}</ul>`, "⚠️"));
    }

    const fairs = data.suitableFairs || [];
    if (fairs.length) {
      const html = fairs.map(f => `<li><strong>${f.name}</strong> — ${f.suitability}</li>`).join("");
      gridEl.appendChild(createGridCard("Suitable Fairs", `<ul>${html}</ul>`, "🏆"));
    }
  }

  function renderOlympiadReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.targetOlympiad || "Olympiad Preparation";
    leadEl.textContent = data.currentLevelAssessment || "Assessment.";
    gridEl.innerHTML = "";

    const syllabus = data.syllabusBreakdown || [];
    if (syllabus.length) {
      const html = syllabus.map(s => `
        <li style="margin-bottom: 6px;"><strong>${s.topic}</strong> — ${s.priority} — ${s.whyItMatters}</li>
      `).join("");
      gridEl.appendChild(createGridCard("Syllabus Breakdown", `<ul>${html}</ul>`, "📘"));
    }

    const res = data.resourceList || [];
    if (res.length) {
      const html = res.map(r => `
        <li style="margin-bottom: 8px; list-style: none; border-bottom: 1px solid rgba(247,245,240,0.05); padding-bottom: 8px;">
          <strong style="display: block;">${r.title}</strong>
          <span style="font-size: 0.85rem; color: var(--gold-bright);">${r.author}</span>
          <p style="margin: 4px 0 0; font-size: 0.9rem; color: rgba(247,245,240,0.7);">${r.description}</p>
        </li>
      `).join("");
      gridEl.appendChild(createGridCard("Resource List", `<ul style="padding-left: 0;">${html}</ul>`, "📚"));
    }

    const weeks = data.weeklySchedule || [];
    if (weeks.length) {
      const html = weeks.map(w => `
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(247,245,240,0.05); padding-bottom: 8px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">Week ${w.weekNumber}</strong>
          <p style="margin: 4px 0;">Focus: ${w.focus}</p>
          <ul style="margin: 0 0 0 16px;">${w.tasks ? w.tasks.map(t => `<li>${t}</li>`).join('') : ''}</ul>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Weekly Schedule", html, "📅"));
    }

    const sets = data.practiceProblemSets || [];
    if (sets.length) {
      const html = sets.map(s => `<li><strong>${s.source}</strong> — ${s.description}</li>`).join("");
      gridEl.appendChild(createGridCard("Practice Problem Sets", `<ul>${html}</ul>`, "📝"));
    }

    if (data.mockTestPlan) {
      gridEl.appendChild(createGridCard("Mock Test Plan", `<p>${data.mockTestPlan}</p>`, "📋"));
    }

    if (data.commonMistakes && data.commonMistakes.length) {
      const html = data.commonMistakes.map(m => `<li>${m}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Mistakes", `<ul>${html}</ul>`, "⚠️"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderPortfolioReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = "Portfolio Narrative";
    leadEl.textContent = data.portfolioNarrative || "Your story.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Through‑Line Story", `<p>${data.portfolioNarrative || "Not provided."}</p>`, "🎓", false));

    if (data.strengthsIdentified && data.strengthsIdentified.length) {
      const html = data.strengthsIdentified.map(s => `<li>${s}</li>`).join("");
      gridEl.appendChild(createGridCard("Strengths Identified", `<ul>${html}</ul>`, "✅"));
    }

    if (data.gapsToAddress && data.gapsToAddress.length) {
      const html = data.gapsToAddress.map(g => `<li>${g}</li>`).join("");
      gridEl.appendChild(createGridCard("Gaps to Address", `<ul>${html}</ul>`, "🔍"));
    }

    const adds = data.recommendedAdditions || [];
    if (adds.length) {
      const html = adds.map(a => `<li><strong>${a.title}</strong> — ${a.description} (Effort: ${a.effortLevel})</li>`).join("");
      gridEl.appendChild(createGridCard("Recommended Additions", `<ul>${html}</ul>`, "📌"));
    }

    const pres = data.howToPresentExisting || [];
    if (pres.length) {
      const html = pres.map(p => `<li><strong>${p.item}</strong> — ${p.howToFrameIt}</li>`).join("");
      gridEl.appendChild(createGridCard("How to Present Existing Work", `<ul>${html}</ul>`, "🖼️"));
    }

    if (data.essayAngleSuggestions && data.essayAngleSuggestions.length) {
      const html = data.essayAngleSuggestions.map(e => `<li>${e}</li>`).join("");
      gridEl.appendChild(createGridCard("Essay Angle Suggestions", `<ul>${html}</ul>`, "✍️"));
    }

    const timeline = data.timeline || [];
    if (timeline.length) {
      const html = timeline.map(t => `
        <div style="margin-bottom: 8px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${t.weekOrMonthLabel}</strong>
          <ul>${t.tasks ? t.tasks.map(ta => `<li>${ta}</li>`).join('') : ''}</ul>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Timeline", html, "📅"));
    }

    if (data.redFlagsToAvoid && data.redFlagsToAvoid.length) {
      const html = data.redFlagsToAvoid.map(r => `<li>${r}</li>`).join("");
      gridEl.appendChild(createGridCard("Red Flags to Avoid", `<ul>${html}</ul>`, "🚩"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderDebateReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.resolutionAnalysis || "Resolution Analysis";
    leadEl.textContent = "Case framework.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Resolution Analysis", `<p>${data.resolutionAnalysis || "Not provided."}</p>`, "🗣️", false));

    const framework = data.caseFramework || [];
    if (framework.length) {
      const html = framework.map(c => `
        <div style="margin-bottom: 16px; border-left: 2px solid var(--gold); padding-left: 12px;">
          <strong style="display: block; font-size: 1.05rem; color: var(--gold-bright);">${c.contentionTitle}</strong>
          <p><strong>Claim:</strong> ${c.claim}</p>
          <p><strong>Warrant:</strong> ${c.warrant}</p>
          <p><strong>Impact:</strong> ${c.impact}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Case Framework", html, "📋"));
    }

    const ev = data.evidenceToFind || [];
    if (ev.length) {
      const html = ev.map(e => `<li><strong>${e.claimItSupports}</strong> — ${e.whatKindOfSourceToLookFor}</li>`).join("");
      gridEl.appendChild(createGridCard("Evidence to Find", `<ul>${html}</ul>`, "🔎"));
    }

    const opp = data.anticipatedOpposingArguments || [];
    if (opp.length) {
      const html = opp.map(o => `<li><strong>${o.argument}</strong> — ${o.howToRespond}</li>`).join("");
      gridEl.appendChild(createGridCard("Anticipated Opposing Arguments", `<ul>${html}</ul>`, "⚔️"));
    }

    if (data.crossExaminationPrep && data.crossExaminationPrep.length) {
      const html = data.crossExaminationPrep.map(c => `<li>${c}</li>`).join("");
      gridEl.appendChild(createGridCard("Cross‑Examination Prep", `<ul>${html}</ul>`, "❓"));
    }

    if (data.deliveryTips && data.deliveryTips.length) {
      const html = data.deliveryTips.map(t => `<li>${t}</li>`).join("");
      gridEl.appendChild(createGridCard("Delivery Tips", `<ul>${html}</ul>`, "🎤"));
    }

    const timeline = data.prepTimeline || [];
    if (timeline.length) {
      const html = timeline.map(t => `
        <div style="margin-bottom: 8px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">${t.sessionLabel}</strong>
          <ul>${t.tasks ? t.tasks.map(ta => `<li>${ta}</li>`).join('') : ''}</ul>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Prep Timeline", html, "📅"));
    }

    if (data.commonMistakes && data.commonMistakes.length) {
      const html = data.commonMistakes.map(m => `<li>${m}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Mistakes", `<ul>${html}</ul>`, "⚠️"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderProjectReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.projectSummary || "Project Build Plan";
    leadEl.textContent = "Core features overview.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Project Summary", `<p>${data.projectSummary || "Not provided."}</p>`, "🔧", false));

    const features = data.coreFeatureList || [];
    if (features.length) {
      const html = features.map(f => `<li><strong>${f.feature}</strong> — ${f.priority}</li>`).join("");
      gridEl.appendChild(createGridCard("Core Features", `<ul>${html}</ul>`, "⚙️"));
    }

    const tech = data.suggestedTechStack || [];
    if (tech.length) {
      const html = tech.map(t => `<li><strong>${t.layer}</strong> — ${t.tool} (${t.why})</li>`).join("");
      gridEl.appendChild(createGridCard("Suggested Tech Stack", `<ul>${html}</ul>`, "💻"));
    }

    if (data.architectureOverview) {
      gridEl.appendChild(createGridCard("Architecture Overview", `<p>${data.architectureOverview}</p>`, "🏗️"));
    }

    const milestones = data.milestones || [];
    if (milestones.length) {
      const html = milestones.map(m => `
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(247,245,240,0.05); padding-bottom: 8px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">Milestone ${m.milestoneNumber}: ${m.title}</strong>
          <ul>${m.tasks ? m.tasks.map(t => `<li>${t}</li>`).join('') : ''}</ul>
          <span style="font-size: 0.85rem; color: rgba(247,245,240,0.5);">Estimated: ${m.estimatedWeeks} weeks</span>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Milestones", html, "📋"));
    }

    if (data.databaseSchemaSketch && data.databaseSchemaSketch.length) {
      const html = data.databaseSchemaSketch.map(s => `<li><strong>${s.table}</strong> — ${s.keyFields}</li>`).join("");
      gridEl.appendChild(createGridCard("Database Schema Sketch", `<ul>${html}</ul>`, "🗄️"));
    }

    if (data.deploymentPlan) {
      gridEl.appendChild(createGridCard("Deployment Plan", `<p>${data.deploymentPlan}</p>`, "🚀"));
    }

    if (data.testingChecklist && data.testingChecklist.length) {
      const html = data.testingChecklist.map(t => `<li>${t}</li>`).join("");
      gridEl.appendChild(createGridCard("Testing Checklist", `<ul>${html}</ul>`, "🧪"));
    }

    if (data.commonMistakes && data.commonMistakes.length) {
      const html = data.commonMistakes.map(m => `<li>${m}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Mistakes", `<ul>${html}</ul>`, "⚠️"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderLearningReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.learningGoalSummary || "Learning Plan";
    leadEl.textContent = data.recommendedResource || "Recommended resource.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Learning Goal Summary", `<p>${data.learningGoalSummary || "Not provided."}</p>`, "🗓️", false));

    if (data.recommendedResource) {
      gridEl.appendChild(createGridCard("Recommended Resource", `<p>${data.recommendedResource}</p>`, "📖"));
    }

    const topics = data.topicBreakdown || [];
    if (topics.length) {
      const html = topics.map(t => `
        <li style="margin-bottom: 8px;"><strong>${t.topic}</strong> — ${t.whyItMatters} ${t.prerequisiteOf ? `(Prerequisite of: ${t.prerequisiteOf.join(', ')})` : ''}</li>
      `).join("");
      gridEl.appendChild(createGridCard("Topic Breakdown", `<ul>${html}</ul>`, "📚"));
    }

    const weeks = data.weeklySchedule || [];
    if (weeks.length) {
      const html = weeks.map(w => `
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(247,245,240,0.05); padding-bottom: 8px;">
          <strong style="font-family: var(--font-mono); color: var(--gold-bright);">Week ${w.weekNumber}</strong>
          <ul>${w.topics ? w.topics.map(t => `<li>${t}</li>`).join('') : ''}</ul>
          ${w.practiceRecommendation ? `<p style="margin: 4px 0; font-size: 0.9rem; color: rgba(247,245,240,0.7);">Practice: ${w.practiceRecommendation}</p>` : ''}
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Weekly Schedule", html, "📅"));
    }

    if (data.selfCheckMilestones && data.selfCheckMilestones.length) {
      const html = data.selfCheckMilestones.map(m => `<li>${m}</li>`).join("");
      gridEl.appendChild(createGridCard("Self‑Check Milestones", `<ul>${html}</ul>`, "📋"));
    }

    if (data.commonStumblingBlocks && data.commonStumblingBlocks.length) {
      const html = data.commonStumblingBlocks.map(b => `<li>${b}</li>`).join("");
      gridEl.appendChild(createGridCard("Common Stumbling Blocks", `<ul>${html}</ul>`, "⚠️"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderPaperReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = "Paper Review";
    leadEl.textContent = data.overallAssessment || "Overall assessment.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Overall Assessment", `<p>${data.overallAssessment || "Not provided."}</p>`, "📝", false));

    if (data.strengths && data.strengths.length) {
      const html = data.strengths.map(s => `<li>${s}</li>`).join("");
      gridEl.appendChild(createGridCard("Strengths", `<ul>${html}</ul>`, "✅"));
    }

    const meth = data.methodologyIssues || [];
    if (meth.length) {
      const html = meth.map(m => `<li><strong>${m.issue}</strong> — ${m.whyItMatters} (Suggested fix: ${m.suggestedFix})</li>`).join("");
      gridEl.appendChild(createGridCard("Methodology Issues", `<ul>${html}</ul>`, "🔬"));
    }

    const clarity = data.clarityIssues || [];
    if (clarity.length) {
      const html = clarity.map(c => `<li><strong>${c.location}</strong> — ${c.issue} (Fix: ${c.suggestedFix})</li>`).join("");
      gridEl.appendChild(createGridCard("Clarity Issues", `<ul>${html}</ul>`, "✍️"));
    }

    if (data.statisticalConcerns && data.statisticalConcerns.length) {
      const html = data.statisticalConcerns.map(s => `<li>${s}</li>`).join("");
      gridEl.appendChild(createGridCard("Statistical Concerns", `<ul>${html}</ul>`, "📊"));
    }

    if (data.citationConcerns && data.citationConcerns.length) {
      const html = data.citationConcerns.map(c => `<li>${c}</li>`).join("");
      gridEl.appendChild(createGridCard("Citation Concerns", `<ul>${html}</ul>`, "📚"));
    }

    if (data.revisionPriorityOrder && data.revisionPriorityOrder.length) {
      const html = data.revisionPriorityOrder.map(r => `<li>${r}</li>`).join("");
      gridEl.appendChild(createGridCard("Revision Priority Order", `<ul>${html}</ul>`, "📌"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

  function renderCareerReport(data, titleEl, leadEl, gridEl) {
    titleEl.textContent = data.fieldOverview || "Career Exploration";
    leadEl.textContent = "Specialization options.";
    gridEl.innerHTML = "";

    gridEl.appendChild(createFullWidthCard("Field Overview", `<p>${data.fieldOverview || "Not provided."}</p>`, "🧭", false));

    const specs = data.specializationOptions || [];
    if (specs.length) {
      const html = specs.map(s => `
        <li style="margin-bottom: 8px;"><strong>${s.name}</strong> — ${s.description} (${s.whatItInvolves})</li>
      `).join("");
      gridEl.appendChild(createGridCard("Specialization Options", `<ul>${html}</ul>`, "🔍"));
    }

    if (data.howToFindLabs && data.howToFindLabs.length) {
      const html = data.howToFindLabs.map(h => `<li>${h}</li>`).join("");
      gridEl.appendChild(createGridCard("How to Find Labs", `<ul>${html}</ul>`, "🔬"));
    }

    const progs = data.internshipProgramTypes || [];
    if (progs.length) {
      const html = progs.map(p => `<li><strong>${p.type}</strong> — ${p.description} (Timeline: ${p.typicalTimeline})</li>`).join("");
      gridEl.appendChild(createGridCard("Internship Program Types", `<ul>${html}</ul>`, "💼"));
    }

    if (data.gradSchoolPathOverview) {
      gridEl.appendChild(createGridCard("Grad School Path Overview", `<p>${data.gradSchoolPathOverview}</p>`, "🎓"));
    }

    if (data.nextThreeActions && data.nextThreeActions.length) {
      const html = data.nextThreeActions.map((a, i) => `
        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          <span style="font-family: var(--font-mono); background: var(--gold); color: var(--navy-950); font-weight: bold; font-size: 0.9rem; padding: 2px 8px; border-radius: 4px;">0${i+1}</span>
          <p style="margin: 0; font-size: 1rem; font-weight: 500; color: var(--paper);">${a}</p>
        </div>
      `).join("");
      gridEl.appendChild(createFullWidthCard("Next Three Actions", html, "🚀", false));
    }
  }

})();
