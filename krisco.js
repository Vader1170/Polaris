// ============================================================
// KRISCO — Druva for Kids
// Built-in topics answer instantly from a hand-picked list.
// Anything else gets sent to /api/generate-kids-search, which
// uses the same OpenRouter setup as the rest of Druva, with a
// strict kid-safe system prompt, to fetch a fresh, true answer.
// ============================================================

const TOPICS = [
  {
    slug: "space",
    label: "Space & Planets",
    emoji: "🪐",
    chipClass: "c1",
    keywords: ["space", "planet", "planets", "moon", "stars", "solar system", "jupiter", "venus"],
    facts: [
      "Jupiter is so huge that more than 1,300 Earths could fit inside it.",
      "A day on Venus lasts longer than a whole year on Venus.",
      "Footprints left on the Moon could stay put for millions of years, since there is no wind up there to blow them away."
    ]
  },
  {
    slug: "dinosaurs",
    label: "Dinosaurs",
    emoji: "🦖",
    chipClass: "c2",
    keywords: ["dinosaur", "dinosaurs", "trex", "t-rex", "fossil", "fossils", "velociraptor"],
    facts: [
      "Spinosaurus is the only known dinosaur that hunted mostly underwater.",
      "T. rex had teeth the size of bananas, but its arms were shorter than yours.",
      "Real Velociraptors were about the size of a turkey, nowhere near the movie-sized monsters."
    ]
  },
  {
    slug: "ocean",
    label: "Ocean Creatures",
    emoji: "🐙",
    chipClass: "c3",
    keywords: ["ocean", "sea", "whale", "shark", "octopus", "fish", "jellyfish"],
    facts: [
      "The blue whale is the biggest animal that has ever lived, bigger than any dinosaur.",
      "Octopuses have three hearts and blue blood.",
      "Some jellyfish have been drifting around since before dinosaurs even existed."
    ]
  },
  {
    slug: "how-things-work",
    label: "How Things Work",
    emoji: "⚙️",
    chipClass: "c4",
    keywords: ["how", "works", "magnet", "magnets", "airplane", "plane", "microwave", "science"],
    facts: [
      "Magnets stick together because tiny particles inside them line up and point the same way.",
      "A microwave heats food by making the water inside it wiggle super fast.",
      "Airplane wings push air downward, and that push sends the plane upward."
    ]
  },
  {
    slug: "coding",
    label: "Coding & Games",
    emoji: "🎮",
    chipClass: "c5",
    keywords: ["coding", "code", "games", "game", "computer", "programming"],
    facts: [
      "Every app or game you love is built from small, simple steps stacked together, kind of like giant Lego instructions.",
      "The first computer bug in history was an actual moth stuck inside a machine in 1947.",
      "You can build a real, working game with just a handful of code blocks. No fancy setup needed to start."
    ]
  },
  {
    slug: "human-body",
    label: "Human Body",
    emoji: "🫀",
    chipClass: "c6",
    keywords: ["body", "human", "brain", "bones", "blink"],
    facts: [
      "Pound for pound, your bones are about five times stronger than a steel bar.",
      "You blink around 15,000 times a day without ever counting.",
      "Your brain burns about a fifth of your body's energy, even while you're asleep."
    ]
  },
  {
    slug: "wild-animals",
    label: "Wild Animals",
    emoji: "🦩",
    chipClass: "c7",
    keywords: ["animals", "animal", "wild", "elephant", "flamingo", "shrimp"],
    facts: [
      "A group of flamingos is called a flamboyance.",
      "Elephants can hear each other's rumbles from more than two miles away.",
      "The mantis shrimp can throw a punch faster than a bullet leaves a gun."
    ]
  },
  {
    slug: "earth-science",
    label: "Volcanoes & Quakes",
    emoji: "🌋",
    chipClass: "c8",
    keywords: ["volcano", "volcanoes", "earthquake", "earthquakes", "lava", "earth"],
    facts: [
      "There are more than 1,500 active volcanoes on Earth right now.",
      "The biggest earthquakes can make the whole planet ring like a bell for days afterward.",
      "Lava can top 1,000 degrees Celsius, hot enough to melt steel."
    ]
  },
  {
    slug: "inventions",
    label: "Cool Inventions",
    emoji: "💡",
    chipClass: "c1",
    keywords: ["invention", "inventions", "history", "roller coaster", "velcro"],
    facts: [
      "The first roller coaster was made of ice and built in Russia over 300 years ago.",
      "Velcro was invented after a scientist studied burrs stuck to his dog's fur up close.",
      "The first video game was built inside a science lab, not a game studio."
    ]
  },
  {
    slug: "weird-but-true",
    label: "Weird But True",
    emoji: "🤯",
    chipClass: "c2",
    keywords: ["weird", "random", "true", "facts", "strange"],
    facts: [
      "Bananas count as berries. Strawberries, oddly, do not.",
      "A single cloud can weigh more than a million pounds.",
      "Sharks have been swimming around Earth longer than trees have existed."
    ]
  }
];

const LAUNCH_MS = 680;
const AI_SEARCH_ENDPOINT = "/api/generate-kids-search";

function init() {
  const chipsWrap = document.getElementById("krisco-chips");
  const form = document.getElementById("krisco-search-form");
  const input = document.getElementById("krisco-search-input");
  const goBtn = form ? form.querySelector(".krisco-go-btn") : null;
  const emptyState = document.getElementById("krisco-empty");
  const resultsSection = document.getElementById("krisco-results");
  const resultsGrid = document.getElementById("krisco-results-grid");
  const resultsMeta = document.getElementById("krisco-results-meta");
  const rankLine = document.querySelector(".krisco-rank");
  const rocketFx = document.getElementById("krisco-rocket-fx");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!form || !input || !chipsWrap || !resultsSection || !resultsGrid) {
    console.error("KrisCo: expected page elements were not found.");
    return;
  }

  let factsFound = 0;
  let searchToken = 0; // guards against a stale AI response landing after a newer search

  // build topic chips
  TOPICS.forEach((topic) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `krisco-chip ${topic.chipClass}`;
    btn.textContent = `${topic.emoji} ${topic.label}`;
    btn.addEventListener("click", () => {
      input.value = topic.label;
      runSearch(topic.label);
      input.focus();
    });
    chipsWrap.appendChild(btn);
  });

  function slugify(str) {
    return (
      str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "search"
    );
  }

  function matchTopics(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TOPICS.filter((topic) => {
      if (topic.label.toLowerCase().includes(q)) return true;
      return topic.keywords.some((k) => k.includes(q) || q.includes(k));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- rocket launch effect ----
  function playLaunchEffect() {
    if (reduceMotion) return;
    document.body.classList.remove("krisco-is-launching");
    // force reflow so the animation restarts on back-to-back searches
    void document.body.offsetWidth;
    document.body.classList.add("krisco-is-launching");
    if (rocketFx) {
      rocketFx.classList.remove("krisco-launch");
      void rocketFx.offsetWidth;
      rocketFx.classList.add("krisco-launch");
    }
    window.setTimeout(() => {
      document.body.classList.remove("krisco-is-launching");
    }, LAUNCH_MS + 50);
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // ---- fetch a fresh answer for anything not in the built-in list ----
  async function fetchAiTopic(query) {
    const resp = await fetch(AI_SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim() }),
    });
    if (!resp.ok) {
      let msg = `Server error: ${resp.status}`;
      try {
        const d = await resp.json();
        if (d && d.error) msg = d.error;
      } catch (_) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    if (!data || !data.found || !Array.isArray(data.facts) || data.facts.length === 0) {
      return null;
    }
    return {
      slug: slugify(data.topic || query),
      label: data.topic || query,
      emoji: data.emoji || "✨",
      facts: data.facts.filter((f) => typeof f === "string").slice(0, 4),
      isFresh: true,
    };
  }

  async function resolveSearch(query) {
    const staticMatches = matchTopics(query);
    if (staticMatches.length > 0) {
      return { status: "ok", topics: staticMatches };
    }
    try {
      const aiTopic = await fetchAiTopic(query);
      if (!aiTopic) return { status: "empty" };
      return { status: "ok", topics: [aiTopic] };
    } catch (err) {
      console.error("KrisCo AI search failed:", err);
      return { status: "error" };
    }
  }

  function showSearching(query) {
    if (emptyState) emptyState.hidden = true;
    resultsSection.hidden = false;
    if (resultsMeta) resultsMeta.textContent = "";
    resultsGrid.innerHTML = `
      <div class="krisco-searching">
        <span class="krisco-searching-emoji" aria-hidden="true">🛰️</span>
        <p>Scanning the galaxy for "${escapeHtml(query)}"...</p>
      </div>
    `;
  }

  function renderNoResults(reason) {
    resultsGrid.innerHTML = "";
    if (resultsMeta) resultsMeta.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "krisco-noresults";
    if (reason === "error") {
      wrap.innerHTML = `
        <span class="k-emoji" aria-hidden="true">📡</span>
        <h3>Lost the signal</h3>
        <p>KrisCo couldn't reach mission control just now. Give it another shot.</p>
        <button type="button" id="krisco-retry-btn">Try again</button>
      `;
    } else {
      wrap.innerHTML = `
        <span class="k-emoji" aria-hidden="true">🧭</span>
        <h3>Nothing here yet</h3>
        <p>KrisCo couldn't find a kid-friendly answer for that. Try another search or tap a topic below.</p>
        <button type="button" id="krisco-retry-btn">Show me topics</button>
      `;
    }
    resultsGrid.appendChild(wrap);
    const retryBtn = document.getElementById("krisco-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        if (reason === "error") {
          runSearch(input.value);
        } else {
          input.value = "";
          resultsSection.hidden = true;
          if (emptyState) emptyState.hidden = false;
          input.focus();
        }
      });
    }
  }

  function renderResults(topics) {
    resultsGrid.innerHTML = "";
    let cardCount = 0;
    topics.forEach((topic) => {
      topic.facts.forEach((fact) => {
        cardCount++;
        const card = document.createElement("article");
        card.className = "krisco-result-card";
        card.innerHTML = `
          <p class="krisco-result-breadcrumb">
            <span aria-hidden="true">${topic.emoji}</span> krisco.com › ${topic.slug}
          </p>
          <h3>Did you know?</h3>
          <p>${escapeHtml(fact)}</p>
          <div class="krisco-result-tags">
            <span>${escapeHtml(topic.label)}</span>
            <span>${topic.isFresh ? "Freshly found ✨" : "Kid-checked"}</span>
          </div>
        `;
        resultsGrid.appendChild(card);
      });
    });

    if (resultsMeta) {
      resultsMeta.textContent = `${cardCount} cool thing${cardCount === 1 ? "" : "s"} found`;
    }
    factsFound += cardCount;
    if (rankLine) {
      const level = factsFound >= 20 ? 3 : factsFound >= 8 ? 2 : 1;
      rankLine.textContent = `🏆 LVL ${level} EXPLORER · ${factsFound} FACTS FOUND`;
    }
  }

  async function runSearch(query) {
    if (!query || !query.trim()) return;
    const myToken = ++searchToken;

    playLaunchEffect();
    if (goBtn) goBtn.disabled = true;

    if (emptyState) emptyState.hidden = true;
    resultsSection.hidden = false;

    // let the shake play for a beat before results slam in; if the
    // search itself takes longer, a searching state fills the gap
    const searchPromise = resolveSearch(query);
    await wait(LAUNCH_MS * 0.7);
    if (myToken !== searchToken) return;

    let settled = false;
    searchPromise.then(() => { settled = true; });
    if (!settled) showSearching(query);

    const result = await searchPromise;
    if (myToken !== searchToken) return;

    if (goBtn) goBtn.disabled = false;

    if (result.status === "ok") {
      renderResults(result.topics);
    } else if (result.status === "error") {
      renderNoResults("error");
    } else {
      renderNoResults("empty");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(input.value);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
