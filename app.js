// =============================================================================
// app.js — SPA router + all screens for Treegens Game.
// Vanilla JS, no build step. State persists to localStorage (demo mode).
// =============================================================================

const $ = (sel, root = document) => root.querySelector(sel);
// Escape ANY user-controlled string before it touches innerHTML.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n) => n.toLocaleString();
const usd = (n) => "$" + n.toFixed(2);

const App = (() => {
  let route = "home";
  let routeArg = null;
  let lastSafeRoute = "home";
  const app = () => $("#app-root") || $("#app");

  function go(r, arg = null) { route = r; routeArg = arg; render(); window.scrollTo(0, 0); }

  // ---- top bar (live wallet + world health) ----
  function topbar() {
    const s = State.get();
    const lg = CONFIG.legendary;
    const st = State.stage();
    return `
    <header class="topbar">
      <div class="brand" data-go="home"><img class="brand-logo" src="treegens-logo.svg" alt="Treegens" width="118" height="27" /><em>Game</em></div>
      <nav class="tabs">
        ${tab("map", "🗺️ World")}
        ${tab("grove", "🌲 Grove")}
        ${tab("proof", "🛰️ Proof")}
        ${tab("market", "🛒 Market")}
        ${CONFIG.carbonMarketEnabled ? tab("carbon", "💨 Carbon") : ""}
        ${tab("dao", "🗳️ DAO")}
        ${tab("fund", "📊 Fund")}
      </nav>
      <div class="hud">
        <button class="hud-av" data-go="map" title="${esc(s.avatar.name||'Treegen')} · ${CONFIG.stageNames[st]} (Stage ${st})">
          <span class="hud-av-img">${Avatar.svg({ ...s.avatar, stage: st, size: 34 })}</span>
          <span class="hud-lv">L${st}</span>
        </button>
        <div class="chip exp" title="Experience"><span>⭐</span><b>${fmt(s.exp)}</b><i>EXP</i></div>
        <div class="chip tgn" title="$TGN balance"><span>🪙</span><b>${fmt(Math.round(s.tgn))}</b><i>TGN</i></div>
        <div class="chip mgro" title="Demo MGRO points - no token is minted"><span>${lg.emoji}</span><b>${s.mgro}</b><i>DEMO</i></div>
        <div class="chip streak ${ (s.streak?.count||0) >= 3 ? "hot" : "" }" title="Daily streak - play every day to keep it alive"><span>🔥</span><b>${s.streak?.count || 0}</b><i>DAY</i></div>
        ${s.wallet
          ? `<button class="chip chain" id="wallet-chip" title="Real on-chain $TGN at ${esc(s.wallet.addr)} - read-only"><span>⛓️</span><b>${fmt(Math.floor(s.wallet.bal))}</b><i>REAL</i></button>`
          : `<button class="chip chain connect" id="wallet-chip" title="Paste a public address to watch its TGN balance; no wallet connection or signature"><span>⛓️</span><b>Watch</b></button>`}
        <button class="mute" id="help-btn" title="How to play" aria-label="How to play">❓</button>
        <button class="mute" id="mute-btn" title="Toggle sound" aria-label="Toggle sound">${Sfx.isMuted() ? "🔇" : "🔊"}</button>
      </div>
    </header>`;
  }
  function tab(r, label) {
    return `<button class="tab ${route === r ? "on" : ""}" data-go="${r}">${label}</button>`;
  }

  function bind(root) {
    // Scoped when re-binding just the topbar: a document-wide pass after
    // every State.save stacked duplicate listeners on nodes that were never
    // replaced, so one tap ran go() several times.
    (root || document).querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go(b.getAttribute("data-go"), b.getAttribute("data-arg"))));
    const mute = $("#mute-btn");
    if (mute) mute.addEventListener("click", (e) => {
      e.stopPropagation();
      mute.textContent = Sfx.toggle() ? "🔇" : "🔊";
      Ambience.refresh();
      if (!Sfx.isMuted()) Sfx.coin();
    });
    const wc = $("#wallet-chip");
    if (wc) wc.addEventListener("click", () => {
      if (State.get().wallet) go("fund");
      else doConnect();
    });
    const hb = $("#help-btn");
    if (hb) hb.addEventListener("click", (e) => { e.stopPropagation(); showHelp(); });
  }

  // ❓ How-to-play - one screen, everything a new Treegen needs
  function showHelp() {
    if ($(".help-modal")) return;
    const mechs = Object.values(CONFIG.species).filter((s) => s.mechLabel)
      .filter((s, i, a) => a.findIndex((x) => x.mechLabel === s.mechLabel) === i)
      .map((s) => `<li>${s.emoji} <b>${s.name.split(" ")[0]}</b> - ${s.mechLabel}</li>`).join("");
    const m = el(`
      <div class="celebrate modal-veil help-modal">
        <div class="cel-card modal-card help-card">
          <h3>🌳 How to play</h3>
          <div class="help-body">
            <p><b>🌰 Seed Storm</b> - click falling seeds inside the glowing band (dead-center = PERFECT, adds time). Don't click 🪨 rocks or 🛢️ barrels (−2s). Douse 🔥 fires before they eat saplings. Chain catches for up to <b>x8</b>; chain 9 for 🌸 BLOOM RUSH. Grab ⏳/💧 power-ups.</p>
            <p><b>🌱 Seeds have powers:</b></p><ul>${mechs}</ul>
            <p><b>⚡ Daily Storm</b> - one seeded storm for the whole planet, new at midnight UTC. Best score hits the global board.</p>
            <p><b>🌲 Grove & Explore</b> - every tree you plant lives in your 3D grove. Walk it: <b>WASD</b> + mouse (drag on phone), <b>E</b> to plant at glowing soil, <b>ESC</b> to leave. Nights turn your grove bioluminescent.</p>
            <p><b>🪙 TGN</b> - in-game TGN is demo points with no cash value. The separate real $TGN token lives on Base; buying links out to buytgn.xyz. The game never touches your funds.</p>
            <p><b>🔒 Privacy</b> - your game stays on this device by default. Public scores are opt-in, and cloud backup happens only when you request a Treegen Code.</p>
            <p><b>🔥 Streaks</b> - play daily; a 7-day streak earns a ❄️ streak shield that saves you one missed day.</p>
          </div>
          <div class="modal-btns"><button class="btn btn-primary" id="help-ok">Got it 🌱</button></div>
        </div>
      </div>`);
    document.body.appendChild(m);
    $("#help-ok", m).onclick = () => m.remove();
  }

  // Read-only watch: paste a public address; never request wallet permission.
  async function doConnect() {
    const res = await Wallet.connect(() => modalInput({
      title: "🔗 Watch a wallet",
      label: "Paste a public Base address (0x…). The game only looks up its public balance; it never connects to or asks permission from a wallet.",
      value: "", okText: "Watch address",
    }));
    if (!res.ok) {
      if (res.reason === "bad-address") toast("⚠️ That doesn't look like a Base address");
      return;
    }
    Sfx.good();
    toast(`⛓️ Watching ${Wallet.short(res.addr)} - ${fmt(Math.floor(res.bal))} real $TGN on Base`);
    notifyAchievements();
    window.__onState(State.get());
    if (route === "fund") screenFund();
  }

  // Reset / restore / import = a different save may take over this browser.
  // Wipe every Cache Storage entry directly (works even with no live service
  // worker) and ask the worker to refill its static shell with fresh copies.
  function clearCachesForAccountChange() {
    try {
      if (window.caches?.keys) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      navigator.serviceWorker?.controller?.postMessage({ type: "tg-clear-caches" });
    } catch (e) {}
  }

  // Surface any newly unlocked achievements with fanfare. Call after actions.
  function notifyAchievements() {
    const fresh = Quests.checkAchv();
    if (fresh.length) State.earn(40 * fresh.length, 15 * fresh.length);
    fresh.forEach((a, i) => setTimeout(() => {
      Sfx.fanfare();
      toast(`🏅 ${a.icon} <b>${a.name}</b> - ${a.desc} (+40⭐ +15🪙)`);
    }, 400 + i * 1500));
  }

  // ===========================================================================
  // ONBOARDING - Jimi intro + avatar creation
  // ===========================================================================
  function screenOnboard() {
    Char3D.disposeAll();
    const g = CONFIG.guide;
    let step = 0;
    const a = State.get().avatar;
    let char = null;

    // Shell renders once so the 3D character survives dialogue steps.
    app().innerHTML = `
      <div class="onboard">
        <div class="ob-stage"><div id="ob3d" class="char3d"></div><div class="char3d-hint">drag to spin</div></div>
        <div class="ob-panel" id="ob-panel"></div>
      </div>`;
    if (Char3D.ok()) {
      char = Char3D.mount($("#ob3d"), { stage: 0, hue: a.hue, accent: a.accent, seed: a.seed, coin: true, interactive: true });
    }
    if (!char) {
      $("#ob3d").innerHTML = Avatar.svg({ ...a, stage: 0, size: 240 });
      const hint = $(".char3d-hint");
      if (hint) hint.remove();
    }

    let typeTimer = null;
    function typewrite(node, text) {
      clearInterval(typeTimer);
      let i = 0;
      node.textContent = "";
      typeTimer = setInterval(() => {
        node.textContent = text.slice(0, ++i);
        if (i >= text.length) clearInterval(typeTimer);
      }, 16);
    }

    function paint() {
      $("#ob-panel").innerHTML = `
          <div class="ob-guide">👤 <b>${g.name}</b> · ${g.title}</div>
          <p class="ob-line" id="ob-line"></p>
          <div class="ob-record">🏆 ${g.record}</div>
          ${step < g.lines.length - 1
            ? `<button class="btn btn-primary" id="ob-next">Continue →</button>
               <button class="ob-skip" id="ob-skip">skip intro ↦</button>`
            : avatarMaker()}`;
      typewrite($("#ob-line"), `"${g.lines[step]}"`);
      if (step < g.lines.length - 1) {
        $("#ob-next").onclick = () => { step++; paint(); };
        $("#ob-skip").onclick = () => { step = g.lines.length - 1; paint(); };
      } else wireMaker();
    }

    function avatarMaker() {
      return `
        <div class="maker">
          <h3>Create your Treegen</h3>
          <label>Name <input id="av-name" maxlength="18" placeholder="e.g. Root of Kenya" value="${esc(a.name)}"/></label>
          <label>Leaf hue <input id="av-hue" type="range" min="80" max="200" value="${a.hue}"/></label>
          <label>Bioluminescence
            <select id="av-accent">
              <option value="#fbbf24" ${a.accent==="#fbbf24"?"selected":""}>Amber</option>
              <option value="#22d3ee" ${a.accent==="#22d3ee"?"selected":""}>Cyan</option>
              <option value="#f472b6" ${a.accent==="#f472b6"?"selected":""}>Magenta</option>
              <option value="#a3e635" ${a.accent==="#a3e635"?"selected":""}>Lime</option>
            </select>
          </label>
          <div class="stage-preview">
            <span class="sp-label">Preview your future:</span>
            ${CONFIG.stageNames.map((n, i) => `<button class="stage-pill ${i===0?'on':''}" data-stage="${i}" title="${n}">${i}</button>`).join("")}
          </div>
          <p class="hint">Your avatar is an evolving in-game collectible. No NFT is minted and nothing is added to a wallet.</p>
          <label class="share-consent"><input id="av-online" type="checkbox"/> I am 13 or older, or a parent/guardian is doing this with me, and I choose to share my display name and gameplay scores on the public leaderboard. This is optional and off by default.</label>
          <p class="legal-links"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a></p>
          <button class="btn btn-primary" id="av-create">Create avatar & enter the world 🌍</button>
        </div>`;
    }

    function wireMaker() {
      let pending = false;
      const preview = () => {
        a.name = $("#av-name").value;
        a.hue = +$("#av-hue").value;
        a.accent = $("#av-accent").value;
        a.seed = (a.name.length || 7) + a.hue;
        if (char) {
          // rebuild at most once per frame - sliders fire fast
          if (pending) return;
          pending = true;
          requestAnimationFrame(() => { pending = false; char.setLook({ hue: a.hue, accent: a.accent, seed: a.seed }); });
        } else {
          $("#ob3d").innerHTML = Avatar.svg({ ...a, stage: 0, size: 240 });
        }
      };
      ["#av-name", "#av-hue", "#av-accent"].forEach((id) => {
        $(id).addEventListener("input", preview);
      });
      // stage preview pills - peek at the evolution ladder (visual only)
      document.querySelectorAll(".stage-pill").forEach((p) =>
        p.addEventListener("click", () => {
          document.querySelectorAll(".stage-pill").forEach((q) => q.classList.remove("on"));
          p.classList.add("on");
          Sfx.click();
          if (char) char.setStage(+p.getAttribute("data-stage"));
        }));
      $("#av-create").onclick = () => {
        preview();
        if (!a.name.trim()) a.name = "Treegen";
        const s = State.get();
        s.avatar = a;
        s.onlineStats = Boolean($("#av-online")?.checked);
        s.created = true;
        State.save();
        Char3D.disposeAll();
        firstFlight(); // straight into the fun - no menus between mint and play
      };
    }

    paint();
  }

  // ===========================================================================
  // WORLD MAP
  // ===========================================================================
  function screenMap() {
    Char3D.disposeAll();
    Quests.ensureDaily();
    const s = State.get();
    const webglOk = typeof THREE !== "undefined" && (!window.Launch || Launch.webglOk());
    app().innerHTML = `
      ${topbar()}
      <div class="wrap">
        ${webglOk
          ? `<button type="button" class="btn btn-primary btn-big enter-world" id="enter-world">🌍 ENTER THE LIVING WORLD <small>run · jump · catch seed storms · grow your grove</small></button>`
          : `<div class="card enter-world enter-world-2d" role="status">
              <b>3D explore is unavailable on this device</b>
              <p class="hint">WebGL did not start, so the living world cannot open. Face the Daily Storm and heal biomes on the 2D map. Reload the page to retry 3D.</p>
            </div>`}
        <div class="growcounter">
          <div class="gc-num" id="gc-num" data-target="0">…</div>
          <div class="gc-label">🌳 real trees planted through Treegens, toward <b>${CONFIG.goal.label}</b></div>
          <div class="gc-bar"><div id="gc-fill" style="width:0%"></div></div>
          <div class="gc-real" id="gc-real"></div>
          <div class="gc-ticker" id="gc-ticker">🎮 in-game planting activity appears here</div>
        </div>

        ${questPanel()}
        ${dailyCard()}

        <div class="mapwrap">
          <div class="map-head">
            <h2 class="h2">🛰️ Live red-zone map <span class="sub">a mirror of the real world · tap a zone to deploy</span></h2>
          </div>
          ${WorldMap.svg()}
          <div class="map-caption">
            🌍 <b>GROWalition hub</b> · ${State.avgWorldHealth().toFixed(0)}% world health ·
            ${CONFIG.biomes.filter(State.biomeUnlocked).length}/${CONFIG.biomes.length} zones active
            <span class="map-legend"><i class="dot live"></i> live &nbsp; <i class="dot lock"></i> locked</span>
          </div>
        </div>

        <h2 class="h2">Mission briefings <span class="sub">heal each biome to evolve your avatar</span></h2>
        <div class="biomes">
          ${CONFIG.biomes.map(biomeCard).join("")}
        </div>
        ${dashRow()}
        <div id="global-lb"></div>
        ${leaderboardCard()}
        ${achievementsCard()}
      </div>`;
    bind();
    animateCount($("#gc-num"));
    wireQuests();
    wireDaily();
    // headline = REAL verified planting from the live Treegens backend
    Net.fetchReal().then((d) => {
      if (!d) {
        const n = $("#gc-num"); if (n) n.textContent = fmt(0);
        const rl = $("#gc-real");
        if (rl) rl.textContent = "Public planting totals are offline. The rest of the game stays playable.";
        return;
      }
      const num = $("#gc-num");
      if (num) { num.setAttribute("data-target", d.totalTrees); animateCount(num); }
      const fill = $("#gc-fill");
      if (fill) fill.style.width = Math.max(0.4, (d.totalTrees / CONFIG.goal.trees) * 100).toFixed(2) + "%";
      const rl = $("#gc-real");
      if (rl) rl.innerHTML = `🛰️ ${fmt(d.verifiedTrees)} verified · ${fmt(d.totalSubmissions)} plantings submitted · <span class="green">live from treegens.app</span>`;
    });
    // the game's own numbers, kept clearly separate from real-world impact
    Net.fetchWorld().then((j) => {
      if (!j) return;
      const lbl = $(".gc-label");
      if (lbl && !$("#gc-live")) {
        lbl.insertAdjacentHTML("beforeend",
          ` · <span id="gc-live" class="gc-live">🎮 ${fmt(j.growers)} grower${j.growers === 1 ? "" : "s"} in-game</span>`);
      }
      renderGlobalBoard(j);
      if (j.weekly) {
        const gc = $(".growcounter");
        if (gc && !$("#weekly-goal")) {
          const pct = Math.min(100, (j.weekly.planted / j.weekly.goal) * 100).toFixed(1);
          gc.insertAdjacentHTML("beforeend",
            `<div class="weekly" id="weekly-goal">🤝 Weekly GROWal - <b>${fmt(j.weekly.planted)}</b> / ${fmt(j.weekly.goal)} trees planted together<div class="gc-bar wk"><div style="width:${pct}%"></div></div></div>`);
        }
      }
    });
    // live 3D avatar in the dashboard card (SVG fallback if WebGL missing)
    const mini = $("#dash3d");
    if (mini) {
      const st = State.stage();
      if (Char3D.ok()) Char3D.mount(mini, { stage: st, hue: s.avatar.hue, accent: s.avatar.accent, seed: s.avatar.seed, coin: true, interactive: true });
      else mini.innerHTML = Avatar.svg({ ...s.avatar, stage: st, size: 120 });
    }
    const share = $("#share-card");
    if (share) share.onclick = () => shareCard(share);
    const ew = $("#enter-world");
    if (ew) ew.onclick = () => {
      if (typeof THREE === "undefined" || (window.Launch && !Launch.webglOk())) {
        return toast("Explore mode needs WebGL. Daily Storm and the map still work.");
      }
      Sfx.good();
      if (!World3D.open()) toast("Explore mode needs WebGL. Daily Storm and the map still work.");
    };
    const rn = $("#rename-btn");
    if (rn) rn.onclick = async () => {
      const nm = await modalInput({ title: "✏️ Rename your Treegen", label: "Your name stays on this device unless public leaderboard sharing is on.", value: State.get().avatar.name || "", okText: "Rename" });
      if (nm === null) return;
      const v = nm.trim().slice(0, 18);
      if (!v) return;
      State.get().avatar.name = v;
      State.save();
      toast(State.get().onlineStats
        ? "✏️ The public leaderboard will know you as <b>" + esc(v) + "</b>"
        : "✏️ Your local Treegen is now <b>" + esc(v) + "</b>");
      screenMap();
    };
    startWorldTicker();
  }

  // Decorative game-world activity ticker. These are fictional events and are
  // always labelled as in-game; they do not alter the real Treegens total.
  let tickerIv = null;
  const TICKER_NAMES = ["Amara", "Kesha", "Diego", "Wanjiru", "Bao", "Luna", "Otieno", "Maya", "Rafael", "Zola", "Ines", "Kofi"];
  const TICKER_DEEDS = [
    ["planted {n} mangroves in", "kenya"], ["restored {n} m² of pasture in", "amazon"],
    ["rewetted peat & planted {n} ramin in", "borneo"], ["put {n} acacias into", "sahel"],
    ["recorded {n} practice trees in", "kenya"], ["planted {n} virtual kapoks in", "amazon"],
  ];
  function startWorldTicker() {
    clearInterval(tickerIv);
    let extra = 0;
    tickerIv = setInterval(() => {
      const tick = $("#gc-ticker");
      if (!tick) { clearInterval(tickerIv); tickerIv = null; return; }
      const n = 2 + Math.floor(Math.random() * 6);
      extra += n;
      const who = TICKER_NAMES[Math.floor(Math.random() * TICKER_NAMES.length)];
      const [deed, biomeId] = TICKER_DEEDS[Math.floor(Math.random() * TICKER_DEEDS.length)];
      const b = CONFIG.biomes.find((x) => x.id === biomeId);
      tick.textContent = `🎮 in-game: ${who} ${deed.replace("{n}", n)} ${b.flag} ${b.name}`;
      tick.classList.remove("flash"); void tick.offsetWidth; tick.classList.add("flash");
    }, 3200);
  }

  // Render the 3D character offscreen, composite a stats card, download as PNG.
  async function shareCard(btn) {
    const s = State.get();
    const st = State.stage();
    if (btn) { btn.disabled = true; btn.textContent = "📸 Rendering…"; }
    try {
      let charImg = null;
      if (Char3D.ok()) {
        const tmp = el(`<div style="position:fixed;left:-9999px;top:0;width:420px;height:470px"></div>`);
        document.body.appendChild(tmp);
        const h = Char3D.mount(tmp, { stage: st, hue: s.avatar.hue, accent: s.avatar.accent, seed: s.avatar.seed, coin: true, interactive: false, preserve: true });
        await new Promise((r) => setTimeout(r, 650)); // let it settle a few frames
        const data = tmp.querySelector("canvas").toDataURL("image/png");
        h.dispose(); tmp.remove();
        charImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = data; });
      }
      const c = document.createElement("canvas");
      c.width = 720; c.height = 960;
      const x = c.getContext("2d");
      const bg = x.createRadialGradient(360, 260, 60, 360, 480, 700);
      bg.addColorStop(0, "#15301f"); bg.addColorStop(1, "#060f0a");
      x.fillStyle = bg; x.fillRect(0, 0, 720, 960);
      x.strokeStyle = "#2f6b48"; x.lineWidth = 3; x.strokeRect(14, 14, 692, 932);
      if (charImg) x.drawImage(charImg, 150, 90, 420, 470);
      x.textAlign = "center";
      x.fillStyle = "#eafff0"; x.font = "800 44px -apple-system, sans-serif";
      x.fillText(s.avatar.name || "Treegen", 360, 620);
      x.fillStyle = "#fbbf24"; x.font = "700 26px -apple-system, sans-serif";
      x.fillText(`${CONFIG.stageNames[st]} · Stage ${st}/5`, 360, 662);
      x.fillStyle = "#8fae9b"; x.font = "600 22px -apple-system, sans-serif";
      x.fillText(`🌱 ${fmt(s.treesPlanted)} virtual trees   ·   📋 ${fmt(s.practiceTrees)} practice-proof trees`, 360, 726);
      x.fillText(`💚 ${usd(s.generalFund)} simulated planting allocation`, 360, 762);
      x.fillStyle = "#4ade80"; x.font = "800 28px -apple-system, sans-serif";
      x.fillText("🌳 TREEGENS GAME", 360, 856);
      x.fillStyle = "#5e7a68"; x.font = "600 18px -apple-system, sans-serif";
      x.fillText("Join the GROWalition - one billion trees", 360, 890);
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      const file = new File([blob], "treegen.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "My Treegen", text: "Growing the GROWalition 🌳 https://treegens-game.netlify.app" });
          Sfx.coin();
          toast("📣 Shared - grow the GROWalition!");
          if (btn) { btn.disabled = false; btn.textContent = "📸 Share card"; }
          return;
        } catch (e) { /* cancelled → fall through to download */ }
      }
      const a = document.createElement("a");
      a.download = `treegen-${(s.avatar.name || "sprout").toLowerCase().replace(/\s+/g, "-")}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
      Sfx.coin();
      toast("📸 Share card saved - post it, grow the GROWalition!");
    } catch (e) {
      toast("Couldn't render the card - try again");
    }
    if (btn) { btn.disabled = false; btn.textContent = "📸 Share card"; }
  }

  // ---- daily missions panel ----
  function questPanel() {
    const s = State.get();
    const q = s.quests;
    const rows = q.ids.map((id) => {
      const def = Quests.questDef(id);
      const cur = Math.min(def.target, q.prog[id] || 0);
      const done = cur >= def.target;
      const claimed = q.claimed.includes(id);
      const pct = Math.round((cur / def.target) * 100);
      return `
        <div class="q-row ${done ? "done" : ""} ${claimed ? "claimed" : ""}">
          <span class="q-icon">${def.icon}</span>
          <div class="q-mid">
            <div class="q-label">${def.label}</div>
            <div class="q-bar"><div style="width:${pct}%"></div><span>${def.amount ? cur.toFixed(0) : cur}/${def.target}</span></div>
          </div>
          ${claimed
            ? `<span class="q-check">✓ claimed</span>`
            : done
              ? `<button class="btn btn-sm btn-gold" data-claim="${esc(id)}">Claim +${def.reward.tgn}🪙 +${def.reward.exp}⭐</button>`
              : `<span class="q-reward">+${def.reward.tgn}🪙 +${def.reward.exp}⭐</span>`}
        </div>`;
    }).join("");
    const allClaimed = q.claimed.length === q.ids.length && q.ids.length > 0;
    return `
      <div class="quests card">
        <div class="q-head">
          <b>📅 Daily missions</b>
          <span class="q-streak">🔥 ${s.streak?.count || 0}-day streak</span>
          <span class="q-timer">new missions at midnight</span>
        </div>
        ${rows}
        ${allClaimed ? `<div class="q-alldone">🎁 All missions complete - bonus claimed. See you tomorrow, Treegen.</div>` : ""}
      </div>`;
  }

  function wireQuests() {
    app().querySelectorAll("[data-claim]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = Quests.claim(b.getAttribute("data-claim"));
        if (!r) return;
        Sfx.good(); FX.floatOver(b, `+${r.reward.tgn} 🪙`, "#fbbf24");
        if (r.bonus) {
          Sfx.epic();
          celebrate(`🎁 ALL DAILY MISSIONS COMPLETE!<br>Bonus: +${r.bonus.tgn} 🪙 · +${r.bonus.exp} ⭐`);
        }
        notifyAchievements();
        screenMap();
      }));
  }

  // ---- 🌱 First Flight: the tutorial storm right after minting ----
  function firstFlight() {
    if (typeof Arcade === "undefined") return go("map");
    const ov = el(`
      <div class="daily-overlay">
        <div class="w3-run-head">🌱 FIRST FLIGHT · Jimi: <b>"Show me your planting arm, sprout - catch seeds in the light!"</b></div>
        <div class="daily-host"></div>
        <button type="button" class="btn btn-ghost overlay-close" id="flight-close" aria-label="Skip First Flight and go to the map">Skip tutorial</button>
      </div>`);
    document.body.appendChild(ov);
    $("#flight-close", ov).onclick = () => { Arcade.stopAll(); ov.remove(); go("map"); };
    Arcade.start($(".daily-host", ov), {
      tutorial: true, species: CONFIG.species.hemp, difficulty: 0,
      biomeName: "Training Grove", best: 0,
      // Storm complete stays on the map. Explore / Walk Forest remain the only 3D entry.
      onDone: () => {
        ov.remove(); go("map");
        if (window.Launch) Launch.noteTutorialComplete();
      },
    }, (results) => {
      const r = State.plantMany("amazon", "hemp", results.qualities);
      // a guaranteed first drop - every new Treegen leaves their first storm richer
      State.mintReward({ id: "loot-first", name: "Sprout Charm", rarity: "rare", emoji: "🍀", kind: "accessory" });
      Sfx.fanfare();
      notifyAchievements();
      return { html: `<div class="arc-rewards">+${r.exp} ⭐ · +${r.tgn} 🪙 · 🇧🇷 Amazon +${r.heal.toFixed(1)}%<div class="arc-loot">🎁 <b>Sprout Charm</b> added to your in-game collection. Jimi: "You'll do, sprout. The world map awaits."</div></div>` };
    });
  }

  // ---- ⚡ Daily Storm: the same seeded run for every player on Earth ----
  function dailyInfo() {
    const day = Math.floor(Date.now() / 86400000);
    const biome = CONFIG.biomes[day % CONFIG.biomes.length];
    const key = biome.species[day % biome.species.length];
    return { day, biome, key, sp: CONFIG.species[key], seed: day * 7919 };
  }

  function dailyCard() {
    const d = dailyInfo();
    const s = State.get();
    const mine = s.daily?.day === d.day ? s.daily : { best: 0, plays: 0 };
    const hrsLeft = Math.max(0, Math.ceil((86400000 - (Date.now() % 86400000)) / 3600000));
    return `
      <div class="daily-card card">
        <div class="dc-left">
          <div class="dc-title">⚡ DAILY STORM <span class="dc-live" id="daily-players"></span></div>
          <div class="dc-sub">One storm, whole planet: ${d.sp.emoji} <b>${d.sp.name}</b> in ${d.biome.flag} <b>${d.biome.name}</b> · resets in ~${hrsLeft}h</div>
          <div class="dc-mine">${mine.best ? `Your best today: <b>${fmt(mine.best)}</b> · ${mine.plays} run${mine.plays===1?"":"s"}` : "You haven't faced today's storm yet"}</div>
          <div class="dc-top" id="daily-top"></div>
        </div>
        <button class="btn btn-gold btn-big" id="daily-play">⚡ FACE THE STORM</button>
      </div>`;
  }

  function wireDaily() {
    const btn = $("#daily-play");
    if (btn) btn.onclick = openDaily;
    Net.fetchWorld().then((j) => {
      if (!j?.daily) return;
      const p = $("#daily-players");
      if (p) p.textContent = `🟢 ${j.daily.players} played today`;
      const topEl = $("#daily-top");
      if (topEl && j.daily.top.length) {
        const medals = ["🥇","🥈","🥉"];
        topEl.innerHTML = j.daily.top.slice(0,3).map((e,i)=>`<span>${medals[i]} ${esc(e.name)} ${fmt(e.score)}</span>`).join(" · ");
      }
    });
  }

  function openDaily() {
    const d = dailyInfo();
    const s = State.get();
    Arcade.stopAll();
    const ov = el(`
      <div class="daily-overlay">
        <div class="w3-run-head">⚡ DAILY STORM · ${d.sp.emoji} ${d.sp.name} → ${d.biome.flag} ${d.biome.name} · same storm for every Treegen on Earth</div>
        <div class="daily-host"></div>
        <button type="button" class="btn btn-ghost overlay-close" id="daily-close" aria-label="Close Daily Storm and go to the map">✕ close</button>
      </div>`);
    document.body.appendChild(ov);
    $("#daily-close", ov).onclick = () => { Arcade.stopAll(); ov.remove(); screenMap(); };
    const rec = s.daily?.day === d.day ? s.daily.best : 0;

    Arcade.start($(".daily-host", ov), {
      seed: d.seed, species: d.sp, difficulty: CONFIG.biomes.indexOf(d.biome), biomeName: "Daily · " + d.biome.name, best: rec,
      shareText: (score) => `⚡ I scored ${score.toLocaleString()} in today's Daily Storm on Treegens - same storm, whole planet. Beat me 🌳 https://treegens-game.netlify.app`,
      onDone: () => { ov.remove(); screenMap(); },
    }, (results) => {
      const r = State.plantMany(d.biome.id, d.key, results.qualities);
      const st = State.get();
      if (st.daily?.day !== d.day) st.daily = { day: d.day, best: 0, plays: 0 };
      st.daily.plays++;
      st.daily.best = Math.max(st.daily.best, results.score);
      State.save();
      if (r.evolved) setTimeout(() => evolveCeremony(), 700);
      notifyAchievements();
      // submit and patch in the global rank when it lands
      Net.pushDaily(d.day, results.score).then((j) => {
        const rk = $("#daily-rank");
        if (!rk) return;
        if (!j?.daily) {
          // Server unreachable or rejected the submission: label honestly.
          if (State.get().onlineStats) rk.textContent = "📡 Could not reach the global board - score kept on this device only.";
          return;
        }
        const rank = j.you?.dailyRank;
        rk.textContent = rank
          ? `🌍 you're #${rank} of ${j.daily.players} on Earth today!`
          : `🌍 submitted - ${j.daily.players} storm-facers today`;
      });
      const rankText = State.get().onlineStats
        ? "🌍 submitting to the global board…"
        : "🔒 local score only · leaderboard sharing is off";
      return { html: `<div class="arc-rewards">+${r.exp} ⭐ · +${r.tgn} 🪙 · ${d.biome.emoji} +${r.heal.toFixed(1)}%<div class="arc-loot" id="daily-rank">${rankText}</div></div>` };
    });
  }

  // ---- global (server) leaderboard ----
  function renderGlobalBoard(j) {
    const host = $("#global-lb");
    if (!host || !j || !j.board || !j.board.length) return;
    const me = Net.myShortId();
    const max = j.board[0]?.exp || 1;
    const medals = ["🥇", "🥈", "🥉"];
    host.innerHTML = `
      <h2 class="h2" style="margin-top:28px">🌍 Global GROWers <span class="sub">${Net.isStale() ? "opt-in players · 📡 cached, reconnecting" : `opt-in players, live - <span class="green">🟢</span>`}</span></h2>
      <div class="lb card">
        ${j.board.map((r, i) => `
          <div class="lb-row ${r.id === me ? "you" : ""}">
            <span class="lb-rank">${medals[i] || (i + 1)}</span>
            <span class="lb-name">🌱 ${esc(r.name)}${r.id === me ? " (you)" : ""}</span>
            <div class="lb-bar"><div style="width:${Math.max(2, (r.exp / max) * 100)}%"></div></div>
            <span class="lb-exp">${fmt(r.exp)} ⭐ · ${fmt(r.trees)} 🌳</span>
          </div>`).join("")}
        ${j.you?.rank && !j.board.some((r) => r.id === me)
          ? `<div class="lb-yourank">📍 Your global rank: <b>#${j.you.rank}</b> of ${fmt(j.growers)} growers - keep planting!</div>` : ""}
      </div>`;
  }

  // ---- GROWlympics leaderboard ----
  function leaderboardCard() {
    const rows = Quests.leaderboard();
    const max = rows[0]?.exp || 1;
    const medals = ["🥇", "🥈", "🥉"];
    return `
      ${flexCard()}
      <h2 class="h2" style="margin-top:28px">🏅 Practice ladder <span class="sub">deterministic in-game rivals · not real players</span></h2>
      <div class="lb card">
        ${rows.map((r, i) => {
          const t = Skins.tierFor(r.real);
          return `
          <div class="lb-row ${r.you ? "you" : ""}">
            <span class="lb-rank">${medals[i] || (i + 1)}</span>
            ${Skins.chip(r.real)}
            <span class="lb-name">${esc(r.name)}${r.you ? " (you)" : ""}<span class="lb-skin" style="color:${t.glow}">${t.name}</span></span>
            <div class="lb-bar"><div style="width:${Math.max(2, (r.exp / max) * 100)}%"></div></div>
            <span class="lb-exp">${fmt(r.exp)} ⭐</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  // The flex card uses practice-proof milestones only. It makes no claim about
  // real verification or blockchain ownership.
  function flexCard() {
    const practice = State.get().practiceTrees || 0;
    const t = Skins.tierFor(practice);
    const nx = Skins.nextTier(practice);
    const prevMin = t.min;
    const pct = nx ? Math.min(100, Math.round(((practice - prevMin) / (nx.min - prevMin)) * 100)) : 100;
    return `
      <div class="flex-card card" style="--sg:${t.glow};--sr:${t.ring}">
        <div class="fx-badge">${t.badge}</div>
        <div class="fx-body">
          <div class="fx-top"><b>${t.name}</b> skin <span class="fx-sub">${practice} practice-proof tree${practice === 1 ? "" : "s"}</span></div>
          ${nx
            ? `<div class="fx-next">Record <b>${nx.min - practice}</b> more practice-proof tree${nx.min - practice === 1 ? "" : "s"} to unlock <span style="color:${nx.glow}">${nx.badge} ${nx.name}</span></div>
               <div class="fx-bar"><div style="width:${pct}%"></div></div>`
            : `<div class="fx-next">🏆 Top skin unlocked. You are a legend of the canopy.</div>`}
        </div>
      </div>`;
  }

  // ---- achievements shelf ----
  function achievementsCard() {
    const s = State.get();
    const unlocked = s.achv || [];
    return `
      <h2 class="h2" style="margin-top:28px">🏆 Achievements <span class="sub">${unlocked.length}/${Quests.achvAll().length} unlocked</span></h2>
      <div class="achv">
        ${Quests.achvAll().map((a) => `
          <div class="achv-badge ${unlocked.includes(a.id) ? "on" : ""}" title="${a.name} - ${a.desc}">
            <span>${a.icon}</span><b>${a.name}</b>
          </div>`).join("")}
      </div>`;
  }

  // Count-up animation for the GROWalition ticker. Cancels any prior run on
  // the same node (server fetch re-targets the counter after first paint).
  function animateCount(node) {
    if (!node) return;
    if (node._raf) cancelAnimationFrame(node._raf);
    const target = +node.getAttribute("data-target");
    // Write the real value first: requestAnimationFrame never fires in a
    // backgrounded tab, and a headline stuck on "…" is worse than no animation.
    node.textContent = fmt(target);
    const from = parseInt((node.textContent || "0").replace(/\D/g, ""), 10) || Math.max(0, target - 1840);
    const start = Math.abs(target - from) < 1e7 ? from : Math.max(0, target - 1840);
    const dur = 900; let t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(Math.floor(start + (target - start) * eased));
      if (p < 1) node._raf = requestAnimationFrame(step);
      else node._raf = null;
    }
    node._raf = requestAnimationFrame(step);
  }

  function biomeCard(b) {
    const h = State.biomeHealth(b.id);
    const unlocked = State.biomeUnlocked(b);
    const grad = `linear-gradient(90deg, ${b.color} ${h}%, #1f2937 ${h}%)`;
    return `
      <div class="biome ${unlocked ? "" : "locked"}" ${unlocked ? `data-go="biome" data-arg="${b.id}"` : ""}>
        <div class="b-head"><span class="b-emoji">${b.emoji}</span> ${b.flag} <b>${b.name}</b></div>
        <p class="b-lore">${b.lore}</p>
        <div class="b-src">🛰️ ${b.source}</div>
        <div class="b-health"><div class="b-fill" style="background:${grad}"></div><span>${h.toFixed(0)}% healed</span></div>
        ${unlocked
          ? `<div class="b-cta">Enter & reforest →</div>`
          : `<div class="b-lock">🔒 Reach ${b.reqExp} EXP to unlock</div>`}
      </div>`;
  }

  function dashRow() {
    const s = State.get();
    const st = State.stage();
    return `
      <div class="dashrow">
        <div class="dcard">
          <div class="av-mini char3d-mini" id="dash3d"></div>
          <div>
            <b>${esc(s.avatar.name) || "Treegen"}</b> <button class="rename" id="rename-btn" title="Rename" aria-label="Rename your Treegen">✏️</button>
            <div class="dsub">${CONFIG.stageNames[st]} · Stage ${st}/5</div>
            ${stageBar()}
            <button class="btn btn-sm" id="share-card" style="margin-top:10px">📸 Share card</button>
          </div>
        </div>
        <div class="dcard col">
          <b>This run</b>
          <div class="dgrid">
            <span>🌱 ${fmt(s.treesPlanted)}<small>virtual</small></span>
            <span>📋 ${fmt(s.practiceTrees)}<small>practice proof</small></span>
            <span>🖼️ ${s.nfts.length}<small>collectibles</small></span>
            ${CONFIG.carbonMarketEnabled ? `<span>💨 ${s.carbonOwned}<small>credits</small></span>` : ""}
          </div>
        </div>
        <div class="dcard col">
          <b>📜 Activity</b>
          <div class="feed">${(s.log.slice(0,5).map(l=>`<div>${esc(l.emoji)} ${esc(l.text)}<i>${esc(l.t)}</i></div>`).join("")) || "<i>No actions yet - go plant.</i>"}</div>
        </div>
      </div>`;
  }
  function stageBar() {
    const st = State.stage();
    const next = State.nextStageExp();
    const cur = CONFIG.evolution[st];
    const s = State.get();
    if (next === null) return `<div class="xpbar maxed"><div style="width:100%"></div><span>MAX - World Tree</span></div>`;
    const pct = ((s.exp - cur) / (next - cur)) * 100;
    return `<div class="xpbar"><div style="width:${pct}%"></div><span>${s.exp - cur}/${next - cur} EXP to ${CONFIG.stageNames[st+1]}</span></div>`;
  }

  // ===========================================================================
  // BIOME - choose species, play the right minigame
  // ===========================================================================
  function screenBiome(id) {
    Arcade.stopAll();
    const b = CONFIG.biomes.find((x) => x.id === id);
    const h = State.biomeHealth(id);
    const healthy = h >= 50;
    const rec = State.get().records?.[id];
    // default seed: first species playable right now
    let selected = b.species.find((k) => !(CONFIG.species[k].needsHealthy && !healthy)) || b.species[0];

    app().innerHTML = `
      ${topbar()}
      <div class="wrap">
        <button class="back" data-go="map">← World map</button>
        <div class="biome-hero" style="--c:${b.color}">
          <h2>${b.emoji} ${b.flag} ${b.name}</h2>
          <p>${b.lore}</p>
          <div class="b-health big"><div class="b-fill" style="width:${h}%;background:${b.color}"></div><span>${h.toFixed(0)}% healed</span></div>
          ${h>=100 ? `<div class="biome-done">🏆 BIOME HEALED - claim your 1-of-1 reward below</div>` : ""}
        </div>

        <div class="soil-status ${healthy?"ok":"bad"}">
          ${healthy
            ? "✅ Soil is recovering - deep-rooted trees can now take root here."
            : `⚠️ Soil is contaminated (${b.hazard}). <b>Pioneers</b> (hemp/cannabis) heal 60% harder here - or run a 🧪 Deep Detox.`}
        </div>

        <h3 class="h3">Pick your seed</h3>
        <div class="species">
          ${b.species.map((k) => speciesCard(k, healthy)).join("")}
        </div>

        <div class="run-bar">
          <button class="btn btn-primary btn-big" id="start-run">🌱 START PLANTING RUN <small>45s of Seed Storm</small></button>
          ${!healthy ? `<button class="btn" id="detox">🧪 Deep Detox <small>puzzle · big soil heal</small></button>` : ""}
          <div class="run-best">${rec ? `🏆 Best: <b>${fmt(rec.score)}</b> · x${Math.min(8, 1 + Math.floor((rec.combo||0) / 3))} chain` : "🏆 No record yet - set one"}</div>
        </div>

        <div id="mg-host" class="mg-host"></div>
        ${h>=100 ? `<button class="btn btn-gold" id="claim-biome">🌟 Name this virtual forest & claim an in-game 1-of-1</button>`:""}
      </div>`;
    bind();

    const cards = app().querySelectorAll("[data-species]");
    function paintSel() {
      cards.forEach((c) => c.classList.toggle("sel", c.getAttribute("data-species") === selected));
    }
    cards.forEach((card) => {
      card.addEventListener("click", () => {
        const key = card.getAttribute("data-species");
        const sp = CONFIG.species[key];
        if (sp.needsHealthy && !healthy) { toast("⚠️ This seed needs healthy soil (50%+). Heal it with pioneers first."); return; }
        selected = key; paintSel(); Sfx.click();
      });
    });
    paintSel();

    $("#start-run").onclick = () => startRun(id, () => selected);
    const dt = $("#detox");
    if (dt) dt.onclick = () => {
      Arcade.stopAll();
      const host = $("#mg-host");
      Minigames.phyto(host, CONFIG.species.cannabis, (q) => {
        const r = State.detox(id, q);
        toast(`🧪 Soil +${r.heal.toFixed(1)}% · +${r.exp} ⭐ · +${r.tgn} 🪙`);
        if (r.evolved) evolveCeremony();
        notifyAchievements();
        setTimeout(() => screenBiome(id), 900);
      });
    };

    const claim = $("#claim-biome");
    if (claim) claim.onclick = () => claimBiome(b);
  }

  // Launch a Seed Storm run and pipe its results into the real economy.
  function startRun(biomeId, getSelected) {
    const key = getSelected();
    const sp = CONFIG.species[key];
    const b = CONFIG.biomes.find((x) => x.id === biomeId);
    const diff = CONFIG.biomes.findIndex(x => x.id === biomeId);
    const rec = State.get().records?.[biomeId];
    Arcade.start($("#mg-host"), {
      species: sp, difficulty: diff, biomeName: b.name, best: rec?.score || 0,
      onDone: () => screenBiome(biomeId),
    }, (results) => {
      const r = State.plantMany(biomeId, key, results.qualities);
      // high score
      const s = State.get();
      if (!s.records) s.records = {};
      const prev = s.records[biomeId]?.score || 0;
      if (results.score > prev) s.records[biomeId] = { score: results.score, combo: results.bestCombo };
      State.save();
      // one loot roll per decent run
      let lootLine = "";
      if (results.qualities.length >= 6) {
        const avgQ = results.qualities.reduce((a, c) => a + c, 0) / results.qualities.length;
        const loot = Quests.rollLoot(avgQ);
        if (loot) {
          if (loot.kind === "tgn") { State.earn(0, loot.tgn); lootLine = `💰 Loot: +${loot.tgn} 🪙`; }
          if (loot.kind === "exp") { State.earn(loot.exp, 0); lootLine = `🎒 Loot: seed pack +${loot.exp} ⭐`; }
          if (loot.kind === "nft") {
            State.mintReward({ id: "loot-" + loot.name.replace(/\s/g, ""), name: loot.name, rarity: loot.rarity, emoji: loot.emoji, kind: "accessory" });
            lootLine = `${loot.rarity === "epic" ? "💠 EPIC" : "🎁 RARE"} DROP: ${loot.emoji} ${loot.name}`;
          }
        }
      }
      if (r.evolved) setTimeout(() => evolveCeremony(), 700);
      notifyAchievements();
      return { html: `<div class="arc-rewards">+${r.exp} ⭐ &nbsp; +${r.tgn} 🪙 &nbsp; ${b.emoji} biome +${r.heal.toFixed(1)}% ${lootLine ? `<div class="arc-loot">${lootLine}</div>` : ""}</div>` };
    });
  }

  function speciesCard(key, healthy) {
    const sp = CONFIG.species[key];
    const locked = sp.needsHealthy && !healthy;
    return `
      <div class="spcard ${locked?"locked":""} ${sp.role==='pioneer'?'pioneer':''}" data-species="${key}">
        <div class="sp-emoji">${sp.emoji}</div>
        <b>${sp.name}</b>
        <span class="sp-role">${sp.role==='pioneer'?'🧪 Pioneer · detoxes soil':'🌳 Deep-rooted tree'}</span>
        <p>${sp.fact}</p>
        ${sp.mechLabel ? `<div class="sp-mech">${sp.mechLabel}</div>` : ""}
        <div class="sp-rewards">+${sp.exp} EXP · +${sp.tgn} 🪙</div>
        ${locked?`<div class="sp-lock">needs healthy soil</div>`:""}
      </div>`;
  }

  // (single-plant flow replaced by Seed Storm runs - see startRun above)

  async function claimBiome(b) {
    const name = await modalInput({
      title: "🌍 Name your forest",
      label: "This game biome is healed. Name your virtual forest; no on-chain registration or NFT mint occurs:",
      value: `${b.name} of ${State.get().avatar.name || "the Treegens"}`,
      okText: "🌟 Save in game",
    });
    if (!name) return;
    State.mintReward({
      id: "biome-" + b.id, name: `1-of-1: ${name}`, rarity: "legendary",
      emoji: "🌟", kind: "biome", provenance: `Healed ${b.name} to 100%`,
    });
    celebrate(`🏆 "${esc(name)}" saved in your local game. Your in-game 1-of-1 collectible is ready.`);
    go("market");
  }

  // ===========================================================================
  // YOUR GROVE - every planted tree, alive in 3D
  // ===========================================================================
  function screenGrove() {
    Grove.disposeAll();
    Char3D.disposeAll();
    const s = State.get();
    const virt = s.grove.filter((g) => g.sp !== "practice").length;
    const practice = s.grove.filter((g) => g.sp === "practice").length;
    const empty = s.grove.length === 0;
    const webglOk = typeof THREE !== "undefined" && (!window.Launch || Launch.webglOk());
    app().innerHTML = `
      ${topbar()}
      <div class="wrap">
        <h2 class="h2">🌲 Your Grove <span class="sub">every in-game tree takes root here - practice-proof trees glow gold</span></h2>
        ${empty ? `
          <div class="grove-empty card">
            <div class="ge-emoji">🌱</div>
            <b>Your grove is bare ground, waiting.</b>
            <p>Every virtual plant you grow in a red zone takes root here. Practice-proof trees stand golden at its heart, without claiming real verification.</p>
            <button class="btn btn-primary" data-go="map">Plant your first tree →</button>
          </div>` : `
          <div id="grove3d" class="grove3d"></div>
          <div class="grove-actions">
            ${webglOk
              ? `<div class="char3d-hint">drag to orbit · scroll to zoom</div>
            <button type="button" class="btn btn-primary btn-big" id="walk-world">🚶 WALK YOUR FOREST <small>first-person · explore the living world</small></button>`
              : `<div class="card enter-world enter-world-2d" role="status">
              <b>3D explore is unavailable on this device</b>
              <p class="hint">WebGL did not start, so walking the forest cannot open. Face the Daily Storm and heal biomes on the 2D map. Reload the page to retry 3D.</p>
            </div>`}
          </div>
          <div class="grove-stats">
            <div class="card"><b>${fmt(s.treesPlanted)}</b><small>🌱 virtual trees</small></div>
            <div class="card gold"><b>${fmt(s.practiceTrees)}</b><small>📋 practice proof</small></div>
            <div class="card"><b>${usd(s.generalFund)}</b><small>💚 simulated allocation</small></div>
            <div class="card"><b>${CONFIG.stageNames[State.stage()]}</b><small>🌟 grove keeper rank</small></div>
          </div>
          ${s.treesPlanted > s.grove.length ? `<p class="hint" style="text-align:center;margin-top:10px">Showing the first ${s.grove.length} - the rest of your forest grows beyond the ridge 🌄</p>` : ""}
        `}
      </div>`;
    bind();
    if (!empty) {
      const host = $("#grove3d");
      if (Grove.ok() && Grove.mount(host)) { /* 3D grove */ }
      else host.innerHTML = `<p class="hint" style="padding:40px;text-align:center">3D view needs WebGL - but your ${fmt(s.treesPlanted)} trees are still growing.</p>`;
      const walk = $("#walk-world");
      if (walk) walk.onclick = () => {
        if (typeof THREE === "undefined" || (window.Launch && !Launch.webglOk())) {
          return toast("Explore mode needs WebGL. Daily Storm and the map still work.");
        }
        Grove.disposeAll(); Char3D.disposeAll();
        Sfx.good();
        if (!World3D.open()) toast("Explore mode needs WebGL. Daily Storm and the map still work.");
      };
    }
  }

  // ===========================================================================
  // PROOF OF PLANT - practice run. NOTHING here is verified: real verification
  // happens in the Treegens verifier network (see queue reality shown in the UI).
  // Never label a simulated result 'verified'.
  // ===========================================================================
  function screenProof() {
    const s = State.get();
    app().innerHTML = `
      ${topbar()}
      <div class="wrap narrow">
        <h2 class="h2">🛰️ Proof of Plant <span class="sub">practice run, not yet connected to the real verifier network</span></h2>
        <p class="lead">This is a <b>practice submission</b>. It rehearses the real flow (evidence, GPS, species,
        count) and pays in-game rewards only. It is <b>not</b> reviewed by anyone and nothing here is verified.</p>
        <div class="queue-real" id="queue-real">Checking the real Treegens verifier queue…</div>

        <div class="proof-form card">
          <label>Region
            <select id="pf-biome">${CONFIG.biomes.map(b=>`<option value="${b.id}">${b.flag} ${b.name}</option>`).join("")}</select>
          </label>
          <label>Species planted <input id="pf-species" placeholder="e.g. Red Mangrove"/></label>
          <label>How many? <input id="pf-count" type="number" min="1" max="500" value="12"/></label>
          <label>Video / photo proof
            <input id="pf-file" type="file" accept="image/*,video/*"/>
          </label>
          <button class="btn" id="pf-gps">📍 Capture GPS</button>
          <div id="pf-gps-read" class="mg-read"></div>
          <button class="btn btn-primary" id="pf-submit" disabled>Save practice record on this device</button>
          <div id="pf-status"></div>
        </div>

        <h3 class="h3">Your practice submissions</h3>
        <div class="proofs">
          ${s.proofs.length ? s.proofs.map(p=>`
            <div class="proof-row practice">
              🛰️ <b>${esc(p.count)}× ${esc(p.species)}</b> · ${esc(State.biomeName(p.biomeId))}
              <span>${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}</span>
              <em class="pending">📋 practice ${esc(p.t)}</em>
            </div>`).join("") : `<p class="hint">No practice submissions yet.</p>`}
        </div>
      </div>`;
    bind();

    // Show the REAL queue reality so nobody expects a fast real-world reward.
    Net.fetchReal().then((d) => {
      const q = $("#queue-real");
      if (!q) return;
      if (!d) { q.textContent = "Could not reach the Treegens verifier network right now."; return; }
      const pct = d.totalTrees ? ((d.verifiedTrees / d.totalTrees) * 100).toFixed(1) : "0";
      const days = d.medianReviewHours ? (d.medianReviewHours / 24).toFixed(1) : "?";
      q.innerHTML = `🛰️ <b>Real network status:</b> ${fmt(d.totalSubmissions)} plantings submitted, ` +
        `${fmt(d.verifiedTrees)} trees verified (${pct}% of planted). Median review takes about <b>${days} days</b>, ` +
        `and many submissions are still waiting. When the game connects to this queue, expect a real wait, not an instant reward.`;
    });

    let gps = null;
    const submit = $("#pf-submit");
    function maybeEnable() {
      submit.disabled = !(gps && $("#pf-species").value.trim() && +$("#pf-count").value > 0);
    }
    $("#pf-species").addEventListener("input", maybeEnable);
    $("#pf-count").addEventListener("input", maybeEnable);
    $("#pf-file").addEventListener("change", async (e) => {
      // pull real GPS from the photo's EXIF - the honest path to verification
      const file = e.target.files && e.target.files[0];
      const read = $("#pf-gps-read");
      if (file) {
        read.textContent = "📷 Reading photo metadata…";
        const g = await Exif.gpsFromFile(file);
        if (g) {
          gps = g;
          read.innerHTML = `📷 GPS from photo: <b>${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}</b> <span class="green">✓ extracted from image</span>`;
        } else {
          read.innerHTML = `📷 No GPS in this photo - use <b>📍 Capture GPS</b> below`;
        }
      }
      maybeEnable();
    });

    $("#pf-gps").onclick = () => {
      const read = $("#pf-gps-read");
      read.textContent = "Locating…";
      const fallback = () => {
        // demo coordinates near the selected biome
        const map = { amazon:[-3.46,-62.21], kenya:[-4.42,39.50], borneo:[0.95,114.55], sahel:[14.5,-1.5] };
        const [la,ln] = map[$("#pf-biome").value] || [0,0];
        gps = { lat: la + (Math.random()-0.5)*0.4, lng: ln + (Math.random()-0.5)*0.4 };
        read.innerHTML = `📍 ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)} <small>(demo location)</small>`;
        maybeEnable();
      };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { gps = { lat: pos.coords.latitude, lng: pos.coords.longitude }; read.innerHTML = `📍 ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`; maybeEnable(); },
          fallback, { timeout: 4000 });
      } else fallback();
    };

    submit.onclick = () => {
      const status = $("#pf-status");
      submit.disabled = true;
      status.innerHTML = `<div class="verify"><span class="spin"></span> Recording your practice submission…</div>`;
      let pct = 0;
      const steps = ["Reading photo metadata…","Checking GPS is inside a red zone…","Noting species and count…","Saving practice record…"];
      const iv = setInterval(() => {
        pct++;
        status.innerHTML = `<div class="verify"><span class="spin"></span> ${steps[Math.min(pct-1,steps.length-1)]}</div>`;
        if (pct >= 4) {
          clearInterval(iv);
          const stageBefore = State.stage();
          const r = State.submitProof({
            biomeId: $("#pf-biome").value,
            species: $("#pf-species").value.trim(),
            lat: gps.lat, lng: gps.lng,
            count: Math.min(500, +$("#pf-count").value),
          });
          Sfx.epic(); FX.shake();
          if (State.stage() > stageBefore) evolveCeremony();
          else celebrate(`📋 Practice submission recorded<br><span style="font-size:13px;color:#8fae9b">In-game only: +${r.exp} EXP · +${r.tgn} 🪙 · +${r.mgro} ${CONFIG.legendary.emoji} (demo). Not verified by anyone.</span>`);
          notifyAchievements();
          screenProof();
        }
      }, 700);
    };
  }

  // ===========================================================================
  // ECO-MARKET - 85/5/10 split
  // ===========================================================================
  function screenMarket() {
    const s = State.get();
    const sp = CONFIG.marketSplit;
    app().innerHTML = `
      ${topbar()}
      <div class="wrap">
        <h2 class="h2">🛒 Eco-Market <span class="sub">demo marketplace · no real tokens, NFTs, or payments move</span></h2>
        <div class="split-note">
          This in-game simulation models: <b>${sp.seller}%</b> to the seller · <b>${sp.treasury}%</b> to a treasury ·
          <b class="green">${sp.planting}% to a planting allocation</b>. No smart contract runs here.
        </div>
        <div class="buy-real">
          <span>🪙 In-game TGN is demo points. ⛓️ Real $TGN on Base is a separate token and never enters this game balance.</span>
          <button class="btn btn-sm btn-gold" id="buy-real-btn">💳 Buy real $TGN ↗</button>
        </div>

        <h3 class="h3">For sale</h3>
        <div class="nftgrid">
          ${s.market.map(nftCard).join("") || "<p class='hint'>Market is empty - list one of yours below.</p>"}
        </div>

        <h3 class="h3">Your collection <span class="sub">${s.nfts.length} item(s)</span></h3>
        <div class="nftgrid">
          ${s.nfts.length ? s.nfts.map(ownedCard).join("") : "<p class='hint'>Earn in-game collectibles by playing. Nothing is minted on-chain.</p>"}
        </div>
      </div>`;
    bind();

    const buyReal = $("#buy-real-btn");
    if (buyReal) buyReal.onclick = () => { Sfx.coin(); Wallet.openBuyPage(); };

    app().querySelectorAll("[data-buy]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = State.buyNft(b.getAttribute("data-buy"));
        if (!r.ok) { Sfx.bad(); return toast(r.reason === "funds" ? "Not enough 🪙 TGN" : "Already sold"); }
        Sfx.coin(); FX.burst(b, [r.item.emoji, "✨"]);
        toast(`Demo purchase: ${esc(r.item.name)} - ${(r.item.price*sp.planting/100).toFixed(0)} in-game TGN allocated in the simulation`);
        notifyAchievements();
        screenMarket();
      }));
    app().querySelectorAll("[data-sell]").forEach((b) =>
      b.addEventListener("click", async () => {
        const i = +b.getAttribute("data-sell");
        const nft = State.get().nfts[i];
        if (nft.kind === "biome" || nft.rarity === "legendary") return toast("In-game 1-of-1 biome collectibles stay in your local collection 🌟");
        const ask = await modalInput({
          title: `${nft.emoji} List ${esc(nft.name)}`,
          label: `Set a demo price in in-game TGN. You keep 85% and 10% goes to the simulated planting allocation.`,
          value: nft.price || 100, type: "number", okText: "List it",
        });
        if (ask === null) return;
        const price = Math.max(1, Math.round(+ask || 0));
        if (!price) return;
        const r = State.sellNft(i, price);
        if (r.ok) { Sfx.coin(); toast(`Sold! You got ${r.sellerCut.toFixed(0)} TGN (85%)`); notifyAchievements(); screenMarket(); }
      }));
  }

  function nftCard(m) {
    const r = CONFIG.rarities[m.rarity] || CONFIG.rarities.common;
    return `
      <div class="nft" style="--glow:${r.glow}">
        <div class="nft-art">${esc(m.emoji)}</div>
        <div class="nft-rare" style="background:${r.color}">${r.label}</div>
        <b>${esc(m.name)}</b>
        ${m.provenance?`<div class="prov">🎖️ ${esc(m.provenance)}</div>`:""}
        <div class="nft-foot">
          <span class="seller">demo seller: ${esc(m.seller)}</span>
          <button class="btn btn-sm btn-primary" data-buy="${esc(m.id)}">${m.price} 🪙</button>
        </div>
      </div>`;
  }
  function ownedCard(m, i) {
    const r = CONFIG.rarities[m.rarity] || CONFIG.rarities.common;
    const bound = m.kind === "biome" || m.rarity === "legendary";
    return `
      <div class="nft owned" style="--glow:${r.glow}">
        <div class="nft-art">${esc(m.emoji)}</div>
        <div class="nft-rare" style="background:${r.color}">${r.label}</div>
        <b>${esc(m.name)}</b>
        ${m.provenance?`<div class="prov">🎖️ ${esc(m.provenance)}</div>`:""}
        <div class="nft-foot">
          <span class="seller">in-game collection</span>
          ${bound?`<span class="bound">🔒 bound</span>`:`<button class="btn btn-sm" data-sell="${i}">List</button>`}
        </div>
      </div>`;
  }

  // ===========================================================================
  // CARBON MARKET - educational simulator
  // ===========================================================================
  // Lightweight SVG sparkline for a numeric series.
  function sparkline(series) {
    const W = 600, H = 130, pad = 10;
    const min = Math.min(...series), max = Math.max(...series);
    const rng = (max - min) || 1;
    const xs = (i) => pad + (i / (series.length - 1)) * (W - 2 * pad);
    const ys = (v) => H - pad - ((v - min) / rng) * (H - 2 * pad);
    const pts = series.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    const area = `${xs(0)},${H - pad} ${pts} ${xs(series.length - 1)},${H - pad}`;
    const lx = xs(series.length - 1), ly = ys(series[series.length - 1]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#22c55e" stop-opacity=".4"/>
        <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#sg)"/>
      <polyline points="${pts}" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${lx}" cy="${ly}" r="3.2" fill="#bbf7d0" class="spark-dot"/>
    </svg>`;
  }

  function screenCarbon() {
    const s = State.get();
    const price = State.carbonPrice();
    const c = CONFIG.carbon;
    const series = State.carbonSeries(30);
    const change = series[0] ? ((price - series[0]) / series[0]) * 100 : 0;
    const blueVal = price * 1.6 * s.carbonOwned;
    const pl = blueVal - s.carbonCostBasis;
    app().innerHTML = `
      ${topbar()}
      <div class="wrap narrow">
        <h2 class="h2">💨 Carbon Credit Market <span class="sub">educational simulator</span></h2>
        <p class="lead">${c.note} As simulated regulation tightens and the world heals, high-quality credits
        (especially blue-carbon mangroves) appreciate - saving the planet can be financially smart too.</p>

        <div class="carbon-news">📰 <b>Market news:</b> ${State.carbonNews().txt} <span class="cn-mult ${State.carbonNews().mult>=1?'green':'red'}">${State.carbonNews().mult>=1?'+':''}${((State.carbonNews().mult-1)*100).toFixed(0)}%</span></div>
        <div class="carbon-price card">
          <div class="cp-top">
            <div class="cp-now"><span class="big">${usd(price)}</span><small>/tonne · base price</small></div>
            <div class="cp-change ${change>=0?'up':'down'}">${change>=0?'▲':'▼'} ${Math.abs(change).toFixed(1)}%<small>since launch</small></div>
          </div>
          <div class="spark-wrap">${sparkline(series)}</div>
          <div class="cp-drivers">Simulation driven by game-world health ${State.avgWorldHealth().toFixed(0)}% · ${fmt(s.treesPlanted)} virtual + ${fmt(s.practiceTrees)} practice-proof trees</div>
        </div>

        <div class="carbon-hold card">
          <b>Your holdings</b>
          <div class="dgrid">
            <span>💨 ${s.carbonOwned}<small>credits (t)</small></span>
            <span>${usd(s.carbonOwned * price * 1.6)}<small>blue-carbon value</small></span>
            <span class="${pl>=0?'green':'red'}">${pl>=0?'+':''}${usd(pl)}<small>unrealised P/L</small></span>
          </div>
        </div>

        ${c.types.map(t=>`
          <div class="carbon-row card">
            <div>${t.emoji} <b>${t.name}</b><div class="hint">${usd(price*t.premium)}/tonne</div></div>
            <div class="carbon-btns">
              <button class="btn btn-sm btn-primary" data-cbuy="${t.id}" data-prem="${t.premium}">Buy 1</button>
              <button class="btn btn-sm" data-csell="${t.id}" data-prem="${t.premium}">Sell 1</button>
            </div>
          </div>`).join("")}
        <p class="hint">1 credit = 1 tonne CO₂ removed. Companies buy these to neutralise their footprint.</p>
      </div>`;
    bind();

    app().querySelectorAll("[data-cbuy]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = State.buyCarbon(1, +b.getAttribute("data-prem"));
        if (!r.ok) { Sfx.bad(); return toast(`Need ${r.tgnCost} 🪙 TGN`); }
        Sfx.coin(); toast(`Bought 1 credit for ${r.tgnCost} 🪙`); notifyAchievements(); screenCarbon();
      }));
    app().querySelectorAll("[data-csell]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = State.sellCarbon(1, +b.getAttribute("data-prem"));
        if (!r.ok) { Sfx.bad(); return toast("You don't hold any credits"); }
        Sfx.coin(); toast(`Sold 1 credit for ${r.tgnGain} 🪙`); notifyAchievements(); screenCarbon();
      }));
  }

  // ===========================================================================
  // DAO
  // ===========================================================================
  function screenDao() {
    Char3D.disposeAll();
    const s = State.get();
    const totalVotes = Object.values(s.daoVotes).reduce((a,b)=>a+b,0) || 0;
    app().innerHTML = `
      ${topbar()}
      <div class="wrap narrow">
        <h2 class="h2">🗳️ Treegens DAO <span class="sub">governance simulation · votes do not move real funds</span></h2>
        <p class="lead">Your demo voting power grows with EXP and legendary status.
        Your power: <b>${State.votePower()}</b> 🗳️ ${s.mgro?`(+${s.mgro*3} from ${CONFIG.legendary.symbol})`:""}</p>
        <div class="dao-list">
          ${CONFIG.daoRegions.map(r=>{
            const v = s.daoVotes[r.id]||0;
            const pct = totalVotes? Math.round(v/totalVotes*100):0;
            return `<div class="dao-row card">
              <div class="dao-info"><b>${r.flag} ${r.name}</b><p>${r.pitch}</p></div>
              <div class="dao-bar"><div style="width:${pct}%"></div><span>${pct}%</span></div>
              <button class="btn btn-sm btn-primary" data-vote="${r.id}">Vote +${State.votePower()}</button>
            </div>`;
          }).join("")}
        </div>
        <div class="jimi-mission card">
          <div class="jimi3d" id="jimi3d"></div>
          <div>📣 <b>Jimi's Global Mission:</b> "Congo Basin is bleeding and barely funded. If we can swing the next deployment there, I'll lead the planting crew myself."
          <div class="hint" style="margin-top:6px"> - Jimi Cohen, Elder of the GROWalition · 30,469 mangroves in 24h · former record</div></div>
        </div>
      </div>`;
    bind();
    const jimiHost = $("#jimi3d");
    if (jimiHost && Char3D.ok()) {
      Char3D.mount(jimiHost, { elder: true, stage: 3, hue: 95, accent: "#fbbf24", coin: false, interactive: true, seed: 30469 });
    } else if (jimiHost) jimiHost.remove();
    app().querySelectorAll("[data-vote]").forEach((b)=>
      b.addEventListener("click", ()=>{
        const power = State.votePower();
        const id = b.getAttribute("data-vote");
        for (let i=0;i<power;i++) State.voteRegion(id);
        Sfx.good(); FX.floatOver(b, `+${power} 🗳️`, "#4ade80");
        toast(`Cast ${power} 🗳️ for ${CONFIG.daoRegions.find(r=>r.id===id).name}`);
        notifyAchievements();
        screenDao();
      }));
  }

  // ===========================================================================
  // FUND DASHBOARD
  // ===========================================================================
  function screenFund() {
    const s = State.get();
    app().innerHTML = `
      ${topbar()}
      <div class="wrap narrow">
        <h2 class="h2">📊 Impact Simulator <span class="sub">educational game values, not money raised</span></h2>
        <div class="fund-hero card">
          <div class="fh-num">${usd(s.generalFund)}</div>
          <div>simulated planting allocation from your in-game actions</div>
        </div>

        <h3 class="h3">⛓️ Real $TGN <span class="sub">on Base · read-only - the game can never move funds</span></h3>
        <div class="wallet-card card">
          ${s.wallet ? `
            <div class="w-row">
              <div>
                <div class="w-bal"><b id="w-bal">${fmt(Math.floor(s.wallet.bal))}</b> $TGN</div>
                <div class="w-sub">≈ <span id="w-usd">…</span> · <span class="w-addr" title="${esc(s.wallet.addr)}">${Wallet.short(s.wallet.addr)}</span> · <a href="https://basescan.org/token/${CONFIG.token.address}?a=${encodeURIComponent(s.wallet.addr)}" target="_blank" rel="noopener">Basescan ↗</a></div>
              </div>
              <div class="w-btns">
                <button class="btn btn-sm" id="w-refresh">↻ Refresh</button>
                <button class="btn btn-sm btn-ghost" id="w-disconnect">Unlink</button>
              </div>
            </div>` : `
            <div class="w-row">
              <div class="w-sub">Link a wallet to see your real $TGN next to your in-game earnings. Read-only - no signatures, no transactions, ever.</div>
              <button class="btn btn-sm btn-primary" id="w-connect">👁 Watch public address</button>
            </div>`}
          <div class="w-buy">
            <div>
              <b>Buy real $TGN</b>
              <div class="w-sub">Apple Pay / card → USDC → $TGN, on the official on-ramp. Live price: <span id="w-price">$${CONFIG.token.usd.toFixed(2)}</span>/TGN</div>
            </div>
            <button class="btn btn-gold" id="w-buy">💳 Buy on buytgn.xyz ↗</button>
          </div>
          <div class="w-note">🪙 In-game TGN is demo points with no cash value. ⛓️ Real $TGN on Base stays separate; this game never promises redemption, payouts, or investment returns.</div>
        </div>
        <div class="impact-grid">
          <div class="card"><b>${fmt(s.treesPlanted)}</b><small>virtual trees</small></div>
          <div class="card"><b>${fmt(s.practiceTrees)}</b><small>practice-proof trees</small></div>
          <div class="card"><b>${s.mgro}</b><small>${CONFIG.legendary.emoji} demo ${CONFIG.legendary.symbol} points</small></div>
        </div>
        <h3 class="h3">What the simulation models</h3>
        <ul class="fund-src">
          <li>🌱 A notional allocation on in-game plantings</li>
          <li>🛒 A simulated 10% allocation on Eco-Market activity</li>
          <li>📋 Practice Proof-of-Plant rewards with no real verification</li>
        </ul>
        <h3 class="h3">🔒 Privacy controls</h3>
        <div class="card privacy-card">
          <p><b>${s.onlineStats ? "Public leaderboard sharing is on." : "Your display name and scores stay local."}</b></p>
          <p class="hint">Cloud backup is separate and happens only when you request a Treegen Code. Watched wallet addresses and practice proof coordinates are never included in cloud backups.</p>
          <button class="btn btn-sm ${s.onlineStats ? "btn-ghost" : "btn-primary"}" id="online-toggle">${s.onlineStats ? "Turn public sharing off" : "Opt in to public leaderboard"}</button>
          ${s.pid ? `<button class="btn btn-sm btn-ghost" id="online-delete">Delete my public leaderboard entry</button>` : ""}
          <p class="legal-links"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a></p>
        </div>
        <h3 class="h3">📜 Full activity log</h3>
        <div class="feed full">${s.log.map(l=>`<div>${esc(l.emoji)} ${esc(l.text)}<i>${esc(l.t)}</i></div>`).join("") || "<i>Nothing yet.</i>"}</div>

        <div class="danger">
          <button class="btn btn-ghost" id="save-code">☁️ Create/update Treegen Code</button>
          ${s.saveId ? `<button class="btn btn-ghost" id="save-delete">Delete cloud backup</button>` : ""}
          <button class="btn btn-ghost" id="save-restore">⬆ Restore from code</button>
          <button class="btn btn-ghost" id="save-export">⬇ Export save</button>
          <button class="btn btn-ghost" id="save-import">⬆ Import save</button>
          <button class="btn btn-ghost" id="reset">Reset game (clear save)</button>
          <a class="tok" href="${CONFIG.token.explorer}" target="_blank" rel="noopener">$TGN on Base ↗</a>
        </div>
      </div>`;
    bind();
    // wallet card wiring
    const wConnect = $("#w-connect");
    if (wConnect) wConnect.onclick = () => doConnect();
    const wBuy = $("#w-buy");
    if (wBuy) wBuy.onclick = () => { Sfx.coin(); Wallet.openBuyPage(); };
    const wRefresh = $("#w-refresh");
    if (wRefresh) wRefresh.onclick = async () => {
      wRefresh.textContent = "↻ …";
      const w = await Wallet.refresh();
      if (w) { $("#w-bal").textContent = fmt(Math.floor(w.bal)); toast("⛓️ Balance refreshed"); }
      wRefresh.textContent = "↻ Refresh";
      window.__onState(State.get());
    };
    const wDisc = $("#w-disconnect");
    if (wDisc) wDisc.onclick = () => { Wallet.disconnect(); toast("Wallet unlinked"); screenFund(); };
    // live price (and USD value of the linked balance)
    Wallet.livePrice().then((p) => {
      const el1 = $("#w-price");
      if (el1) el1.textContent = "$" + p.toFixed(4);
      const w = State.get().wallet;
      const el2 = $("#w-usd");
      if (el2 && w) el2.textContent = usd(w.bal * p);
    });

    $("#online-toggle").onclick = async () => {
      const state = State.get();
      if (state.onlineStats) {
        state.onlineStats = false;
        State.save();
        screenFund();
        toast("🔒 Future leaderboard sharing is off");
        return;
      }
      const yes = await modalConfirm({
        title: "Join the public leaderboard?",
        body: "Choose this only if you are 13 or older, or a parent/guardian is doing it with you. Your Treegen display name, gameplay EXP, virtual-tree count, and Daily Storm scores may be shown publicly. Your wallet address, exact practice coordinates, and full save are not included.",
        okText: "Opt in",
      });
      if (!yes) return;
      state.onlineStats = true;
      State.save();
      screenFund();
      toast("🌍 Public leaderboard sharing is on");
    };
    const deleteOnline = $("#online-delete");
    if (deleteOnline) deleteOnline.onclick = async () => {
      const yes = await modalConfirm({
        title: "Delete your public leaderboard entry?",
        body: "This removes the entry linked to this browser's private Treegen ID and turns future sharing off.",
        okText: "Delete entry",
        danger: true,
      });
      if (!yes) return;
      const ok = await Net.deleteOnline();
      if (!ok) return toast("⚠️ Could not delete the public entry right now");
      State.get().onlineStats = false;
      State.save();
      screenFund();
      toast("🗑️ Public leaderboard entry deleted");
    };

    $("#save-code").onclick = async () => {
      const allowed = await modalConfirm({
        title: "Create or update an online backup?",
        body: "Choose this only if you are 13 or older, or a parent/guardian is doing it with you. A sanitized game save will be stored online. Keep the restore code private because anyone with it may be able to restore that save.",
        okText: "Create backup",
      });
      if (!allowed) return;
      const k = await Net.cloudSave(true);
      if (!k) return toast("⚠️ Could not save the backup right now");
      await modalInput({
        title: "☁️ Your Treegen Code",
        label: "Your sanitized progress is saved under this private code. Write it down: enter it on another device to restore your Treegen. Wallet addresses, practice coordinates, and sharing consent are excluded.",
        value: k, okText: "Done",
      });
      screenFund();
    };
    const deleteSave = $("#save-delete");
    if (deleteSave) deleteSave.onclick = async () => {
      const yes = await modalConfirm({
        title: "Delete your cloud backup?",
        body: "The game on this device stays intact, but this Treegen Code will no longer restore the online backup.",
        okText: "Delete backup",
        danger: true,
      });
      if (!yes) return;
      const ok = await Net.cloudDelete();
      toast(ok ? "🗑️ Cloud backup deleted" : "⚠️ Could not delete the cloud backup right now");
    };
    $("#save-restore").onclick = async () => {
      const code = await modalInput({
        title: "⬆ Restore a Treegen",
        label: "Enter a Treegen Code. Your current progress on this device will be replaced.",
        value: "", okText: "Restore",
      });
      if (!code) return;
      const got = await Net.cloudLoad(code.trim());
      if (!got) return toast("⚠️ No saved Treegen found for that code");
      const count = (v) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };
      const yes = await modalConfirm({
        title: "Restore this Treegen?",
        body: `Found "${esc(got.save.avatar?.name || "Treegen")}" with ${esc(fmt(count(got.save.exp)))} EXP and ${esc(fmt(count(got.save.treesPlanted)))} trees. This replaces what is on this device.`,
        okText: "Restore it", danger: true,
      });
      if (!yes) return;
      clearCachesForAccountChange();
      localStorage.setItem("treegens_game_v1", JSON.stringify(got.save));
      location.reload();
    };
    $("#save-export").onclick = () => {
      const blob = new Blob([localStorage.getItem("treegens_game_v1") || "{}"], { type: "application/json" });
      const a = document.createElement("a");
      a.download = "treegens-save.json";
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
      toast("⬇ Save exported - move it to any device");
    };
    $("#save-import").onclick = () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "application/json,.json";
      inp.onchange = async () => {
        try {
          const j = JSON.parse(await inp.files[0].text());
          if (!j || typeof j !== "object" || !("exp" in j) || !("grove" in j)) throw new Error("bad");
          const yes = await modalConfirm({ title: "⬆ Import this save?", body: "Your current Treegen will be replaced by the imported one.", okText: "Import", danger: true });
          if (!yes) return;
          j.onlineStats = false;
          clearCachesForAccountChange();
          localStorage.setItem("treegens_game_v1", JSON.stringify(j));
          location.reload();
        } catch (e) { toast("⚠️ That file isn't a valid Treegens save"); }
      };
      inp.click();
    };
    $("#reset").onclick = async () => {
      const yes = await modalConfirm({
        title: "🥀 Reset everything?",
        body: "Your Treegen, grove, in-game collectibles, and streak will be wiped. This can't be undone.",
        okText: "Wipe it all", danger: true,
      });
      if (yes) { State.reset(); clearCachesForAccountChange(); go("home"); }
    };
  }

  // ===========================================================================
  // toasts / celebration
  // ===========================================================================
  function toast(msg) {
    const t = el(`<div class="toast" role="status" aria-live="polite">${msg}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // In-game modal input/confirm — replaces the browser's prompt()/confirm().
  function modalInput({ title, label, value = "", type = "text", okText = "Confirm" }) {
    return new Promise((resolve) => {
      const m = el(`
        <div class="celebrate modal-veil">
          <div class="cel-card modal-card">
            <h3>${title}</h3>
            ${label ? `<p class="modal-label">${label}</p>` : ""}
            <input id="modal-in" type="${type}" value="${String(value).replace(/"/g, "&quot;")}"/>
            <div class="modal-btns">
              <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary" id="modal-ok">${okText}</button>
            </div>
          </div>
        </div>`);
      document.body.appendChild(m);
      const input = $("#modal-in", m);
      input.focus(); input.select();
      const close = (val) => { m.remove(); resolve(val); };
      $("#modal-ok", m).onclick = () => close(input.value);
      $("#modal-cancel", m).onclick = () => close(null);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") close(input.value); if (e.key === "Escape") close(null); });
    });
  }
  function modalConfirm({ title, body, okText = "Yes, do it", danger = false }) {
    return new Promise((resolve) => {
      const m = el(`
        <div class="celebrate modal-veil">
          <div class="cel-card modal-card">
            <h3>${title}</h3>
            ${body ? `<p class="modal-label">${body}</p>` : ""}
            <div class="modal-btns">
              <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
              <button class="btn ${danger ? "" : "btn-primary"}" id="modal-ok" ${danger ? 'style="border-color:#7a2e2e;color:#fda4a4"' : ""}>${okText}</button>
            </div>
          </div>
        </div>`);
      document.body.appendChild(m);
      $("#modal-ok", m).onclick = () => { m.remove(); resolve(true); };
      $("#modal-cancel", m).onclick = () => { m.remove(); resolve(false); };
    });
  }
  function celebrate(msg) {
    const c = el(`<div class="celebrate"><div class="cel-card">${msg}<button class="btn btn-primary" id="cel-ok">🌳 Onwards</button></div></div>`);
    document.body.appendChild(c);
    // confetti leaves
    for (let i=0;i<24;i++){
      const leaf = el(`<span class="conf">${["🌱","🍃","🌿","🌳","✨"][i%5]}</span>`);
      leaf.style.left = Math.random()*100+"%";
      leaf.style.animationDelay = (Math.random()*0.5)+"s";
      c.appendChild(leaf);
    }
    $("#cel-ok", c).onclick = () => c.remove();
    setTimeout(()=>{ if (c.parentElement) c.remove(); }, 6000);
  }

  // Full-screen 3D evolution ceremony — the biggest moment in the game.
  function evolveCeremony() {
    const st = State.stage();
    const s = State.get();
    if (!Char3D.ok()) return celebrate(`🌟 Your avatar evolved to <b>${CONFIG.stageNames[st]}</b>!`);
    Sfx.epic(); FX.shake();
    const c = el(`
      <div class="celebrate ceremony">
        <div class="cer-box">
          <div class="cer-kicker">✨ EVOLUTION ✨</div>
          <div id="cer3d" class="char3d cer-stage"></div>
          <div class="cer-name">${esc(s.avatar.name) || "Your Treegen"} is now a <b>${CONFIG.stageNames[st]}</b> · Stage ${st}/5</div>
          <div class="cer-sub">Earned by healing soil - never bought.</div>
          <button class="btn btn-gold" id="cer-ok">🌳 Keep growing</button>
        </div>
      </div>`);
    document.body.appendChild(c);
    for (let i = 0; i < 30; i++) {
      const leaf = el(`<span class="conf">${["🌟","✨","🌸","🍃","🌿"][i%5]}</span>`);
      leaf.style.left = Math.random()*100+"%";
      leaf.style.animationDelay = (Math.random()*0.8)+"s";
      c.appendChild(leaf);
    }
    const h = Char3D.mount($("#cer3d", c), { stage: st, hue: s.avatar.hue, accent: s.avatar.accent, seed: s.avatar.seed, coin: true, interactive: true });
    $("#cer-ok", c).onclick = () => { if (h) h.dispose(); c.remove(); };
  }

  // ===========================================================================
  // router
  // ===========================================================================
  function render() {
    Char3D.disposeAll(); // tear down any live WebGL views before repainting
    Grove.disposeAll();
    Arcade.stopAll();
    World3D.closeAll();
    document.querySelectorAll(".daily-overlay").forEach((n) => n.remove());
    clearInterval(tickerIv); tickerIv = null;
    const s = State.get();
    if (!s.created && route !== "home") route = "home";
    try {
      renderRoute();
      lastSafeRoute = route;
    } catch (err) {
      let bar = "";
      try { bar = topbar(); } catch (e) { bar = ""; }
      app().innerHTML = `
        ${bar}
        <div class="wrap narrow" style="padding-top:40px;text-align:center">
          <div class="card" style="padding:32px">
            <div style="font-size:40px">🥀</div>
            <h2>Something snapped a branch</h2>
            <p>The last working screen was ${esc(lastSafeRoute)}. Your save is still on this device. Reload keeps it. Reset is optional and asks first.</p>
            <div class="modal-btns" style="justify-content:center">
              <button class="btn btn-primary" id="err-reload">Reload and keep this save</button>
              <button class="btn btn-ghost" id="err-reset">Reset save</button>
            </div>
            <details id="err-diag" class="err-diag">
              <summary>Technical details</summary>
              <p class="hint">${esc(err && err.message)}</p>
            </details>
          </div>
        </div>`;
      const reload = $("#err-reload");
      if (reload) reload.onclick = () => location.reload();
      const resetBtn = $("#err-reset");
      if (resetBtn) resetBtn.onclick = async () => {
        const yes = await modalConfirm({
          title: "Reset this save?",
          body: "This permanently deletes your Treegen, grove, collectibles, and streak on this browser. Export a save first if you want to keep it.",
          okText: "Wipe this save",
          danger: true,
        });
        if (yes) { State.reset(); location.reload(); }
      };
      if (bar) bind();
    }
  }

  function renderRoute() {
    const s = State.get();
    switch (route) {
      case "home": return s.created ? (go("map")) : screenOnboard();
      case "map": return screenMap();
      case "grove": return screenGrove();
      case "biome": return screenBiome(routeArg);
      case "proof": return screenProof();
      case "market": return screenMarket();
      case "carbon": return CONFIG.carbonMarketEnabled ? screenCarbon() : screenMap();
      case "dao": return screenDao();
      case "fund": return screenFund();
      default: return screenMap();
    }
  }

  // refresh wallet figures live when state changes mid-screen
  window.__onState = () => {
    const bar = $(".topbar");
    if (bar) { const fresh = el(topbar()); bar.replaceWith(fresh); bind(fresh); }
    Net.push(); // no-op unless the player explicitly opted into public scores
  };

  // Ambient drifting spores — nature-punk atmosphere across the whole app.
  function initSpores() {
    const layer = $("#spores");
    if (!layer || layer.childElementCount) return;
    const glyphs = ["🌱", "🍃", "🌿", "✨", "·"];
    for (let i = 0; i < 22; i++) {
      const s = el(`<span class="spore">${glyphs[i % glyphs.length]}</span>`);
      s.style.left = (Math.random() * 100).toFixed(1) + "%";
      s.style.fontSize = (8 + Math.random() * 16).toFixed(0) + "px";
      s.style.animationDuration = (12 + Math.random() * 16).toFixed(1) + "s";
      s.style.animationDelay = "-" + (Math.random() * 20).toFixed(1) + "s";
      s.style.opacity = (0.15 + Math.random() * 0.35).toFixed(2);
      layer.appendChild(s);
    }
  }

  function startDemo() {
    const s = State.get();
    const seeded = !s.created;
    if (seeded) {
      s.avatar = { name: "Sprout", hue: 130, accent: "#fbbf24", seed: 7 };
      s.created = true;
      s.onlineStats = false;
      State.save();
    }
    start({ demo: true });
    if (seeded) firstFlight();
  }

  function start(opts = {}) {
    if (window.__tgStarted) return;
    window.__tgStarted = true;
    // Deep links are not a feature of this game: query strings and fragments
    // are never read, and are stripped on boot so a pasted or forwarded URL
    // can never carry tokens or trigger actions (tests scan for regressions).
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    initSpores();
    Quests.ensureDaily();
    // subtle tactile click on every button press, app-wide
    // (first gesture also wakes the forest ambience — browsers require it)
    document.addEventListener("click", (e) => {
      Ambience.start();
      if (e.target.closest(".btn, .tab, .hotspot, .spcard, .biome")) Sfx.click();
    }, true);
    // register the PWA service worker here (keeps index.html free of inline
    // scripts so the CSP can be strict: script-src 'self')
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    render();
    // Continue / Play land on the map. World3D is opt-in from Explore or Walk Forest.
    if (window.__freezeUsed) {
      window.__freezeUsed = false;
      setTimeout(() => toast("❄️ Streak shield used - your 🔥 streak survived the missed day!"), 1200);
    }
    if (window.__welcomeBack) {
      const w = window.__welcomeBack; window.__welcomeBack = null;
      setTimeout(() => { Sfx.good(); toast(`🌤️ Welcome back! Your forests made <b>+${w.tgn} 🪙</b> sap while you were away (${w.hrs}h)`); }, 800);
    }
  }

  return { start, startDemo, go };
})();

// App.start() is called from launch.js after the visitor chooses Play.
// Do not create WebGL or enter the living world from DOMContentLoaded.
