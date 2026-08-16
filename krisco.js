// ============================================================
// KRISCO — Druva for Kids
// A tiny, self-contained "search engine" over a hand-picked
// pile of true, cool facts. No external calls, no AI, nothing
// fancy under the hood, just a lookup and some fun styling.
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

function init() {
  const chipsWrap = document.getElementById("krisco-chips");
  const form = document.getElementById("krisco-search-form");
  const input = document.getElementById("krisco-search-input");
  const emptyState = document.getElementById("krisco-empty");
  const resultsSection = document.getElementById("krisco-results");
  const resultsGrid = document.getElementById("krisco-results-grid");
  const resultsMeta = document.getElementById("krisco-results-meta");
  const rankLine = document.querySelector(".krisco-rank");

  if (!form || !input || !chipsWrap || !resultsSection || !resultsGrid) {
    console.error("KrisCo: expected page elements were not found.");
    return;
  }

  let factsFound = 0;

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

  function renderResults(query) {
    const matches = matchTopics(query);
    resultsGrid.innerHTML = "";
    if (emptyState) emptyState.hidden = true;
    resultsSection.hidden = false;

    if (matches.length === 0) {
      if (resultsMeta) resultsMeta.textContent = "";
      const wrap = document.createElement("div");
      wrap.className = "krisco-noresults";
      wrap.innerHTML = `
        <span class="k-emoji" aria-hidden="true">🧭</span>
        <h3>Nothing here yet</h3>
        <p>KrisCo doesn't know that one yet. Try tapping a topic below instead.</p>
        <button type="button" id="krisco-clear-btn">Show me topics</button>
      `;
      resultsGrid.appendChild(wrap);
      const clearBtn = document.getElementById("krisco-clear-btn");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          input.value = "";
          resultsSection.hidden = true;
          if (emptyState) emptyState.hidden = false;
          input.focus();
        });
      }
      return;
    }

    let cardCount = 0;
    matches.forEach((topic) => {
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
            <span>${topic.label}</span>
            <span>Kid-checked</span>
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

  function runSearch(query) {
    if (!query || !query.trim()) return;
    renderResults(query);
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
