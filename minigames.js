// =============================================================================
// minigames.js — the actual "real biology" gameplay (proposal §4).
//   1) PlantingGame   — match planting depth + nutrient timing → quality score
//   2) PhytoGame      — detox a heavy-metal grid with pioneer plants (cannabis/hemp)
// Each returns a quality value 0..1 via onDone(quality) and renders into a host el.
// =============================================================================

const Minigames = (() => {
  // ---------------------------------------------------------------------------
  // 1) PLANTING GAME
  // Player picks the correct hole depth (slider near the species' ideal) and
  // hits a moving "nutrient" marker inside the green zone. Closeness = quality.
  // ---------------------------------------------------------------------------
  function planting(host, species, onDone) {
    const ideal = species.depthCm;
    let depth = Math.round(ideal * (0.4 + Math.random() * 1.2));
    let marker = 0, dir = 1, running = true, locked = false, timerPct = 100;
    const speed = 1.6 + Math.random();

    host.innerHTML = `
      <div class="mg">
        <h3>${species.emoji} Plant the ${species.name}</h3>
        <p class="mg-fact">${species.fact}</p>

        <label class="mg-label">1 · Planting depth - aim for <b>${ideal} cm</b></label>
        <input id="mg-depth" type="range" min="1" max="${Math.max(20, ideal*2)}" value="${depth}" />
        <div id="mg-depth-read" class="mg-read"></div>

        <label class="mg-label">2 · Drop the nutrient in the <b>healthy band</b></label>
        <div class="mg-bar">
          <div class="mg-zone"></div>
          <div id="mg-marker" class="mg-marker"></div>
        </div>
        <div class="mg-timer"><div id="mg-timer-fill"></div></div>

        <button id="mg-go" class="btn btn-primary">🌱 Plant it</button>
        <div id="mg-result" class="mg-result"></div>
      </div>`;

    const depthEl = host.querySelector("#mg-depth");
    const depthRead = host.querySelector("#mg-depth-read");
    const markerEl = host.querySelector("#mg-marker");
    const timerEl = host.querySelector("#mg-timer-fill");
    const go = host.querySelector("#mg-go");
    const result = host.querySelector("#mg-result");

    function depthQuality() {
      const off = Math.abs(depth - ideal) / Math.max(ideal, 4);
      return Math.max(0, 1 - off);
    }
    function renderDepth() {
      depth = +depthEl.value;
      const q = depthQuality();
      depthRead.textContent = `${depth} cm - ${q > 0.85 ? "perfect 👌" : q > 0.6 ? "close" : "too " + (depth > ideal ? "deep" : "shallow")}`;
      depthRead.style.color = q > 0.85 ? "#4ade80" : q > 0.6 ? "#fbbf24" : "#f87171";
    }
    depthEl.addEventListener("input", renderDepth);
    renderDepth();

    // Animate the nutrient marker bouncing 0..100. Green band is 38..62.
    function tick() {
      if (!running) return;
      if (!locked) {
        marker += dir * speed;
        if (marker >= 100) { marker = 100; dir = -1; }
        if (marker <= 0) { marker = 0; dir = 1; }
        markerEl.style.left = marker + "%";
      } else {
        timerPct -= 1.4;
        timerEl.style.width = timerPct + "%";
        if (timerPct <= 0) finish();
        requestAnimationFrame(tick);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    function bandQuality() {
      const center = 50, half = 12;
      const off = Math.abs(marker - center) / half;
      return Math.max(0, 1 - off * 0.9);
    }

    go.addEventListener("click", () => {
      if (!running) return;
      if (!locked) {
        // Lock the nutrient marker, start short timer, then finish.
        locked = true;
        go.textContent = "Settling roots…";
        go.disabled = true;
        timerEl.parentElement.style.opacity = 1;
        return;
      }
    });

    function finish() {
      running = false;
      const q = +(depthQuality() * 0.5 + bandQuality() * 0.5).toFixed(2);
      const grade = q > 0.85 ? "Flourishing 🌟" : q > 0.6 ? "Healthy 🌿" : q > 0.35 ? "Survives 🌱" : "Struggling 🥀";
      result.innerHTML = `<b>${grade}</b> - quality ${(q * 100) | 0}%`;
      result.style.color = q > 0.6 ? "#4ade80" : "#fbbf24";
      onDone(q);
    }
  }

  // ---------------------------------------------------------------------------
  // 2) PHYTOREMEDIATION GAME
  // A grid of toxic cells (heavy metals). Click cells to place a pioneer plant;
  // it detoxes that cell + neighbours. Clear enough toxicity to "heal the soil".
  // (proposal §4 — cannabis/hemp prep the ground before deep-rooted trees.)
  // ---------------------------------------------------------------------------
  function phyto(host, pioneer, onDone) {
    const N = 5;
    const cells = [];
    for (let i = 0; i < N * N; i++) cells.push(Math.random() < 0.55 ? Math.ceil(Math.random() * 3) : 0);
    let plants = 6; // limited pioneers
    const startTox = cells.reduce((a, b) => a + b, 0);

    host.innerHTML = `
      <div class="mg">
        <h3>${pioneer.emoji} Phytoremediation - heal the soil</h3>
        <p class="mg-fact">${pioneer.fact}</p>
        <div class="mg-grid-meta">
          <span>Pioneers left: <b id="ph-plants">${plants}</b></span>
          <span class="ph-warn">☣️ toxin spreads every 3s - move!</span>
          <span>Toxicity: <b id="ph-tox">100%</b></span>
        </div>
        <div id="ph-grid" class="ph-grid"></div>
        <div id="ph-result" class="mg-result"></div>
        <button id="ph-done" class="btn btn-primary" style="display:none">Soil ready → continue</button>
      </div>`;

    const grid = host.querySelector("#ph-grid");
    const plantsEl = host.querySelector("#ph-plants");
    const toxEl = host.querySelector("#ph-tox");
    const result = host.querySelector("#ph-result");
    const doneBtn = host.querySelector("#ph-done");
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;

    function neighbours(i) {
      const r = Math.floor(i / N), c = i % N;
      const out = [];
      [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(nr * N + nc);
      });
      return out;
    }
    const plantedAt = new Set();
    function tox() { return cells.reduce((a, b) => a + b, 0); }
    function render() {
      grid.innerHTML = "";
      cells.forEach((v, i) => {
        const d = document.createElement("button");
        d.className = "ph-cell tox-" + v + (plantedAt.has(i) ? " planted" : "");
        d.textContent = plantedAt.has(i) ? pioneer.emoji : v === 0 ? "" : "☠";
        d.title = plantedAt.has(i) ? "Pioneer planted" : v === 0 ? "Clean soil" : "Heavy metals: " + v;
        d.disabled = finished || plantedAt.has(i);
        d.addEventListener("click", () => place(i));
        grid.appendChild(d);
      });
      const pct = Math.round((tox() / startTox) * 100);
      toxEl.textContent = pct + "%";
      plantsEl.textContent = plants;
    }
    function place(i) {
      if (plants <= 0 || finished || plantedAt.has(i)) return;
      plantedAt.add(i);
      plants -= 1;
      [i, ...neighbours(i)].forEach((n) => { cells[n] = Math.max(0, cells[n] - 1); });
      render();
      check();
    }
    // the clock is against you: toxin creeps into a clean neighbour every 3s
    const spreadIv = setInterval(() => {
      if (!grid.isConnected) return clearInterval(spreadIv); // host was re-rendered
      if (finished) return clearInterval(spreadIv);
      const targets = [];
      cells.forEach((v, i) => {
        if (v > 0) neighbours(i).forEach((n) => { if (cells[n] === 0) targets.push(n); });
      });
      if (!targets.length) return;
      const hit = targets[Math.floor(Math.random() * targets.length)];
      cells[hit] = 1;
      render();
      const cell = grid.children[hit];
      if (cell) { cell.classList.add("spread"); setTimeout(() => cell.classList.remove("spread"), 500); }
    }, 3000);

    let finished = false;
    function check() {
      const remaining = tox();
      const cleared = 1 - remaining / startTox;
      if (plants <= 0 || remaining === 0) {
        finished = true;
        clearInterval(spreadIv);
        const q = +Math.max(0, Math.min(1, cleared)).toFixed(2);
        const healed = q >= 0.75;
        result.innerHTML = healed
          ? `<b style="color:#4ade80">Soil detoxified ${(q*100)|0}% - deep-rooted trees can now grow.</b>`
          : `<b style="color:#fbbf24">Cleared ${(q*100)|0}%. Soil still poisoned - trees will struggle here.</b>`;
        doneBtn.style.display = "block";
        doneBtn.onclick = () => onDone(q);
        grid.querySelectorAll(".ph-cell").forEach((b) => (b.disabled = true));
      }
    }
    render();
  }

  return { planting, phyto };
})();
