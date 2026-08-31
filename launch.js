// =============================================================================
// launch.js — HTML marketing shell, WebGL detection, and PII-free telemetry.
// Runs before App.start() so a visitor can understand the game without a GPU
// context. No query/hash reads, no postMessage, no fingerprinting.
// =============================================================================

const Launch = (() => {
  const SAVE_KEY = "treegens_game_v1";
  const MUTE_KEY = "tg_muted";
  const MOTION_KEY = "tg_reduce_motion";
  const INIT_TIMEOUT_MS = 10000;

  const EVENTS = {
    webgl_supported: true,
    webgl_unsupported: true,
    init_shell: true,
    init_scripts: true,
    init_webgl: true,
    init_ready: true,
    init_timeout: true,
    fail_no_webgl: true,
    fail_context: true,
    fail_timeout: true,
    fail_script: true,
    fail_unknown: true,
    retry: true,
    play_start: true,
    tutorial_complete: true,
  };

  const FAIL_CATS = {
    no_webgl: "fail_no_webgl",
    context: "fail_context",
    timeout: "fail_timeout",
    script: "fail_script",
    unknown: "fail_unknown",
  };

  const events = [];
  let lastFail = { category: null };
  let webgl = null;
  let stage = null;
  let started = false;
  let ready = false;
  let timedOut = false;
  let bound = false;
  let timeoutId = null;
  let pollId = null;

  function track(name) {
    if (typeof name !== "string") return false;
    if (!EVENTS[name]) return false;
    if (/@|email|0x[0-9a-fA-F]{40}|user-?agent|renderer|gpu|fingerprint/i.test(name)) return false;
    events.push({ name, t: Date.now() });
    if (events.length > 40) events.shift();
    return true;
  }

  function setStage(next) {
    if (stage === next) return;
    stage = next;
    if (next === "shell") track("init_shell");
    else if (next === "scripts") track("init_scripts");
    else if (next === "webgl") track("init_webgl");
    else if (next === "ready") track("init_ready");
    else if (next === "timeout") track("init_timeout");
  }

  function noteFailure(category) {
    const key = FAIL_CATS[category] ? category : "unknown";
    lastFail = { category: key };
    if (key === "no_webgl") webgl = { ok: false, category: "no_webgl" };
    if (key === "context") webgl = { ok: false, category: "context" };
    track(FAIL_CATS[key]);
    return key;
  }

  function lastFailure() {
    return lastFail;
  }

  function failureCopy() {
    const key = lastFail && lastFail.category;
    if (timedOut) return "Loading stopped after 10 seconds. Scripts may still be arriving. Retry keeps this device save.";
    if (key === "no_webgl") return "This browser did not create a WebGL context. The 2D game does not need one. Retry keeps this device save.";
    if (key === "context") return "WebGL context creation failed. Retry, or play the 2D game. Your save is unchanged.";
    if (key === "script") return "A game script is not ready yet. Retry keeps this device save.";
    if (key === "timeout") return "Loading stopped after 10 seconds. Retry keeps this device save.";
    if (key) return "The game could not start. Retry keeps this device save.";
    return "";
  }

  // Capability check only. Never reads UNMASKED_RENDERER / vendor / userAgent.
  function detectWebGL(doc) {
    const root = doc || (typeof document !== "undefined" ? document : null);
    try {
      if (!root || typeof root.createElement !== "function") {
        return { ok: false, category: "unknown" };
      }
      const canvas = root.createElement("canvas");
      if (!canvas || typeof canvas.getContext !== "function") {
        return { ok: false, category: "no_webgl" };
      }
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return { ok: false, category: "no_webgl" };
      try {
        const ext = gl.getExtension && gl.getExtension("WEBGL_lose_context");
        if (ext && ext.loseContext) ext.loseContext();
      } catch (e) { /* drop the test context if the extension is missing */ }
      return { ok: true, category: null };
    } catch (e) {
      return { ok: false, category: "context" };
    }
  }

  function webglOk() {
    if (!webgl) webgl = detectWebGL();
    return !!webgl.ok;
  }

  function peekSave(storage) {
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store || typeof store.getItem !== "function") return null;
      const raw = store.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      const name = data.avatar && typeof data.avatar.name === "string" ? data.avatar.name : "";
      const exp = Number(data.exp);
      return {
        created: !!data.created,
        name: name.slice(0, 24),
        exp: Number.isFinite(exp) ? exp : 0,
      };
    } catch (e) {
      return null;
    }
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function isMuted() {
    if (typeof Sfx !== "undefined" && Sfx.isMuted) return Sfx.isMuted();
    return storageGet(MUTE_KEY) === "1";
  }

  function toggleMute() {
    if (typeof Sfx !== "undefined" && Sfx.toggle) return Sfx.toggle();
    const next = !isMuted();
    storageSet(MUTE_KEY, next ? "1" : "0");
    return next;
  }

  function osPrefersReduce() {
    try {
      return !!(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function motionReduced() {
    const stored = storageGet(MOTION_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return osPrefersReduce();
  }

  function setMotionReduced(on) {
    storageSet(MOTION_KEY, on ? "1" : "0");
    applyMotionClass(typeof document !== "undefined" ? document : null);
    return on;
  }

  function applyMotionClass(doc) {
    const root = doc && (doc.documentElement || doc.querySelector && doc.querySelector("html"));
    if (!root || !root.classList) return;
    root.classList.toggle("reduce-motion", motionReduced());
  }

  function scriptReadiness() {
    return {
      config: typeof CONFIG !== "undefined",
      state: typeof State !== "undefined",
      engine: typeof Sfx !== "undefined",
      app: typeof App !== "undefined",
      three: typeof THREE !== "undefined",
    };
  }

  function scriptsReady() {
    const r = scriptReadiness();
    return r.config && r.state && r.app;
  }

  function progressRatio() {
    const r = scriptReadiness();
    const bits = [r.config, r.state, r.engine, r.app, r.three || (webgl && !webgl.ok)];
    return bits.filter(Boolean).length / bits.length;
  }

  function $(id, doc) {
    const root = doc || document;
    return root.getElementById ? root.getElementById(id) : null;
  }

  function paint(doc) {
    const root = doc || document;
    const compat = $("launch-compat", root);
    const progress = $("launch-progress", root);
    const bar = $("launch-bar-fill", root);
    const meter = $("launch-bar", root);
    const play = $("launch-play", root);
    const fallback = $("launch-fallback", root);
    const saveEl = $("launch-save", root);
    const mute = $("launch-mute", root);
    const motion = $("launch-motion", root);

    if (compat) {
      if (!webgl) compat.textContent = "Checking whether this browser can run 3D…";
      else if (webgl.ok) compat.textContent = "3D is available. Seed Storm and the map also work without it.";
      else compat.textContent = "3D is not available here. You can still play the 2D game.";
    }

    if (progress) {
      if (timedOut) progress.textContent = "Loading timed out after 10 seconds. Retry, or play the 2D path if the scripts did arrive.";
      else if (ready) progress.textContent = webgl && webgl.ok ? "Ready to play." : "Ready to play the 2D game.";
      else progress.textContent = "Loading game scripts…";
    }

    if (bar) bar.style.width = Math.round((timedOut ? 1 : progressRatio()) * 100) + "%";
    if (meter) {
      meter.setAttribute("aria-valuenow", String(Math.round((timedOut ? 1 : progressRatio()) * 100)));
      meter.setAttribute("aria-valuetext", timedOut ? "Timed out" : ready ? "Ready" : "Loading");
    }

    const save = peekSave();
    const hasSave = !!(save && save.created);

    if (play) {
      play.disabled = !ready && !timedOut;
      if (hasSave) play.textContent = "Continue";
      else if (webgl && !webgl.ok) play.textContent = "Play the 2D game";
      else play.textContent = "Play now";
    }

    const demo = $("launch-demo", root);
    if (demo) {
      demo.disabled = !ready && !timedOut;
      demo.hidden = hasSave;
    }

    if (fallback) fallback.hidden = !((webgl && !webgl.ok) || timedOut);

    const diag = $("launch-diag", root);
    const diagBody = $("launch-diag-body", root);
    const failText = failureCopy();
    if (diag) diag.hidden = !failText;
    if (diagBody) diagBody.textContent = failText;

    if (saveEl) {
      if (hasSave) {
        saveEl.hidden = false;
        const who = save.name ? save.name : "your Treegen";
        saveEl.textContent = "Save on this device: " + who + " · " + save.exp + " EXP. Reset is permanent and asks first.";
      } else {
        saveEl.hidden = false;
        saveEl.textContent = "No save on this device yet. Progress stays in this browser until you export it or create a Treegen Code.";
      }
    }

    if (mute) {
      mute.setAttribute("aria-pressed", isMuted() ? "true" : "false");
      mute.textContent = isMuted() ? "Sound off" : "Sound on";
    }
    if (motion) {
      const reduced = motionReduced();
      motion.setAttribute("aria-pressed", reduced ? "true" : "false");
      motion.textContent = reduced ? "Motion reduced" : "Motion on";
    }
  }

  function showFallback(doc) {
    const fallback = $("launch-fallback", doc);
    if (fallback) fallback.hidden = false;
    paint(doc);
  }

  function enterApp(doc, starter) {
    if (started) return false;
    if (!scriptsReady()) {
      noteFailure("script");
      showFallback(doc);
      return false;
    }
    started = true;
    track("play_start");
    const root = doc || document;
    const shell = $("launch", root);
    const appEl = $("app", root);
    if (shell) shell.hidden = true;
    if (appEl) appEl.hidden = false;
    try {
      starter();
    } catch (e) {
      noteFailure("unknown");
      started = false;
      if (shell) shell.hidden = false;
      if (appEl) appEl.hidden = true;
      showFallback(root);
      return false;
    }
    return true;
  }

  function startGame(doc) {
    return enterApp(doc, () => App.start());
  }

  function startDemo(doc) {
    const peek = peekSave();
    if (peek && peek.created) return startGame(doc);
    if (typeof App !== "undefined" && App.startDemo) {
      return enterApp(doc, () => App.startDemo());
    }
    return startGame(doc);
  }

  function confirmReset(doc) {
    const root = doc || document;
    return new Promise((resolve) => {
      if (root.querySelector && root.querySelector(".launch-confirm")) {
        resolve(false);
        return;
      }
      const veil = root.createElement("div");
      veil.className = "launch-confirm";
      veil.setAttribute("role", "dialog");
      veil.setAttribute("aria-modal", "true");
      veil.setAttribute("aria-labelledby", "launch-reset-title");
      veil.innerHTML = '<div class="launch-confirm-card">'
        + '<h3 id="launch-reset-title">Reset this device save?</h3>'
        + "<p>This permanently deletes your Treegen, grove, collectibles, and streak in this browser. Export a save from Fund first if you want to keep it.</p>"
        + '<div class="launch-actions">'
        + '<button type="button" class="btn btn-ghost" id="launch-reset-cancel">Cancel</button>'
        + '<button type="button" class="btn" id="launch-reset-ok">Wipe this save</button>'
        + "</div></div>";
      (root.body || root).appendChild(veil);
      const done = (val) => { veil.remove(); resolve(val); };
      const ok = veil.querySelector("#launch-reset-ok");
      const cancel = veil.querySelector("#launch-reset-cancel");
      if (ok) ok.onclick = () => done(true);
      if (cancel) cancel.onclick = () => done(false);
      if (cancel && cancel.focus) cancel.focus();
    });
  }

  function resetSave() {
    if (typeof State !== "undefined" && State.reset) State.reset();
    else {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    }
  }

  function retry() {
    track("retry");
    try { location.reload(); } catch (e) { /* non-browser tests */ }
  }

  function markReady() {
    if (ready) return;
    ready = true;
    setStage("ready");
    if (timeoutId) clearTimeout(timeoutId);
    if (pollId) clearInterval(pollId);
    paint();
  }

  function onTimeout(doc) {
    timedOut = true;
    setStage("timeout");
    noteFailure("timeout");
    showFallback(doc);
    if (pollId) clearInterval(pollId);
    paint(doc);
  }

  function tick(doc) {
    const r = scriptReadiness();
    if (stage === "shell" && r.config && r.state) setStage("scripts");
    if (scriptsReady()) {
      if (stage === "shell" || stage === "scripts") setStage("webgl");
      markReady();
    }
    paint(doc);
  }

  function bind(doc) {
    const root = doc || document;
    if (bound) return;
    bound = true;
    setStage("shell");
    applyMotionClass(root);
    webgl = detectWebGL(root);
    track(webgl.ok ? "webgl_supported" : "webgl_unsupported");
    if (!webgl.ok) noteFailure(webgl.category === "context" ? "context" : "no_webgl");

    const play = $("launch-play", root);
    const retryBtn = $("launch-retry", root);
    const mute = $("launch-mute", root);
    const motion = $("launch-motion", root);
    const resetBtn = $("launch-reset", root);
    const wait = $("launch-waitlist", root);

    if (play) {
      play.addEventListener("click", () => {
        if (!scriptsReady()) {
          showFallback(root);
          return;
        }
        startGame(root);
      });
    }
    const demoBtn = $("launch-demo", root);
    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        if (!scriptsReady()) {
          showFallback(root);
          return;
        }
        startDemo(root);
      });
    }
    if (retryBtn) retryBtn.addEventListener("click", () => retry());
    if (mute) mute.addEventListener("click", () => { toggleMute(); paint(root); });
    if (motion) {
      motion.addEventListener("click", () => {
        setMotionReduced(!motionReduced());
        paint(root);
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const yes = await confirmReset(root);
        if (!yes) return;
        resetSave();
        paint(root);
      });
    }
    if (wait) wait.addEventListener("click", () => { /* mailto is the href; no extra data */ });

    if ("serviceWorker" in (typeof navigator !== "undefined" ? navigator : {}) && navigator.serviceWorker) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    paint(root);
    tick(root);
    if (!ready) {
      pollId = setInterval(() => tick(root), 150);
      timeoutId = setTimeout(() => {
        if (!ready) onTimeout(root);
      }, INIT_TIMEOUT_MS);
    }
  }

  function noteTutorialComplete() {
    return track("tutorial_complete");
  }

  if (typeof document !== "undefined") {
    const boot = () => {
      if (document.getElementById && document.getElementById("launch")) bind(document);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  return {
    EVENTS,
    INIT_TIMEOUT_MS,
    events,
    track,
    detectWebGL,
    webglOk,
    peekSave,
    noteFailure,
    noteTutorialComplete,
    startGame,
    startDemo,
    lastFailure,
    bind,
    retry,
    motionReduced,
    setMotionReduced,
    isMuted,
    toggleMute,
    scriptReadiness,
    stage: () => stage,
  };
})();

if (typeof window !== "undefined") window.Launch = Launch;
