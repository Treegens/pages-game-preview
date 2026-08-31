// =============================================================================
// net.js — the shared world: global GROWalition counter + cross-player board.
// Talks to the treegens-api Netlify function (Blobs-backed). Gameplay stats
// only (display name + scores); a random local `pid` identifies this save.
// Everything degrades gracefully offline — the game never blocks on the net.
//
// Trust boundary rules (tests/security.test.mjs enforces the testable ones):
//  · Every server response is sanitized to expected types/lengths/caps before
//    it touches game state or the DOM (names are still esc()'d at render).
//  · Outbound stats are clamped; the server independently validates them —
//    local exp/tree counts are display state, never proof of anything.
//  · All API fetches use cache: "no-store" so keyed URLs and session/save
//    responses never enter the HTTP cache (the service worker also ignores
//    cross-origin and query-string requests).
//  · Leaderboard pid is generated with crypto.getRandomValues, never a
//    seedable PRNG. It is a public player id, not a restore credential.
//  · Cloud backup is the API v2 contract: the server mints saveId + recovery
//    secret, the secret travels only in Authorization: Bearer, and query
//    strings may carry the public saveId (`?id=`) never the recovery secret.
// =============================================================================

const Net = (() => {
  const URL_ = CONFIG.apiUrl;
  let cache = null, fetchedAt = 0, lastPush = 0;
  let lastOkAt = 0, lastError = null;

  // --- sanitizers: the ONLY doorway server data comes through ---
  const num = (v, cap = 1e9) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, cap) : 0;
  };
  const str = (v, max) => (typeof v === "string" ? v : "").slice(0, max);

  function sanitizeWorld(j) {
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    const w = { growers: num(j.growers), board: [], daily: null, weekly: null, you: null };
    if (Array.isArray(j.board)) {
      w.board = j.board.slice(0, 100).map((r) => ({
        id: str(r?.id, 16),
        name: str(r?.name, 24) || "Treegen",
        exp: num(r?.exp),
        trees: num(r?.trees),
      }));
    }
    if (j.daily && typeof j.daily === "object") {
      w.daily = {
        players: num(j.daily.players),
        top: (Array.isArray(j.daily.top) ? j.daily.top : []).slice(0, 10).map((e) => ({
          name: str(e?.name, 24) || "Treegen",
          score: num(e?.score),
        })),
      };
    }
    if (j.weekly && typeof j.weekly === "object") {
      w.weekly = { planted: num(j.weekly.planted), goal: Math.max(1, num(j.weekly.goal)) };
    }
    if (j.you && typeof j.you === "object") {
      w.you = { rank: num(j.you.rank), dailyRank: num(j.you.dailyRank) };
    }
    return w;
  }

  function sanitizeReal(d) {
    if (!d || typeof d !== "object" || typeof d.totalTrees !== "number") return null;
    return {
      totalTrees: num(d.totalTrees),
      verifiedTrees: num(d.verifiedTrees),
      totalSubmissions: num(d.totalSubmissions),
    };
  }

  // All API traffic goes through here: no-store (keyed URLs must never enter
  // the HTTP cache), a timeout, and a hard r.ok check so 4xx/5xx bodies are
  // rejected instead of being stored as world state.
  async function fetchJson(url, opts = {}, timeoutMs = 6000) {
    const r = await fetch(url, {
      ...opts,
      cache: "no-store",
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!r.ok) {
      const err = new Error("http " + r.status);
      err.status = r.status;
      throw err;
    }
    // Some endpoints (DELETE) reply with an empty body — that is still success.
    return r.json().catch(() => null);
  }

  async function fetchWorld(force) {
    if (!URL_) return null;
    if (!force && cache && Date.now() - fetchedAt < 60000) return cache;
    try {
      const pid = State.get().onlineStats ? State.get().pid : null;
      const u = pid ? URL_ + "?id=" + encodeURIComponent(pid) : URL_;
      const w = sanitizeWorld(await fetchJson(u));
      if (w) { cache = w; fetchedAt = Date.now(); lastOkAt = Date.now(); lastError = null; }
    } catch (e) { lastError = e; /* offline or rejected — keep stale cache */ }
    return cache;
  }

  // True when the last successful world fetch is stale (or never happened) —
  // screens use it to label leaderboard data as cached/offline.
  const isStale = () => !lastOkAt || Date.now() - lastOkAt > 90000;

  // Clamped public stats: what we send is display state the server re-validates.
  function publicStats(s) {
    return {
      id: s.pid,
      name: str(s.avatar.name, 24) || "Treegen",
      exp: num(s.exp),
      trees: num(s.treesPlanted),
      real: 0,
    };
  }

  // Debounced push of this player's public stats (called on every save).
  function push() {
    if (!URL_) return;
    const now = Date.now();
    if (now - lastPush < 15000) return;
    const s = State.get();
    if (!s.onlineStats) return;
    if (!s.created || s.exp <= 0) return;
    lastPush = now;
    if (!s.pid) ensureKey();
    fetchJson(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(publicStats(s)),
    }).then((j) => {
      const w = sanitizeWorld(j);
      if (w) { cache = w; fetchedAt = Date.now(); lastOkAt = Date.now(); lastError = null; }
    }).catch((e) => { lastError = e; });
  }

  // Real-world totals from the actual Treegens backend (via our server-side
  // bridge, which sidesteps that backend's CORS allowlist).
  let realCache = null, realAt = 0;
  async function fetchReal() {
    if (realCache && Date.now() - realAt < 300000) return realCache;
    try {
      const j = await fetchJson(CONFIG.realStatsUrl, {}, 20000);
      const d = sanitizeReal(j && j.data);
      if (d) { realCache = d; realAt = Date.now(); }
    } catch (e) {}
    return realCache;
  }

  // ---- cloud save: progress must outlive the browser ----
  let saveAt = 0, saving = false;

  // Crypto-strong key material. 32-symbol alphabet = zero modulo bias and
  // 5 bits/char (16 chars ≈ 80 bits). Lowercase alnum so the server's existing
  // [^a-z0-9] strip is a no-op. Deliberately no weaker fallback: if
  // getRandomValues is unavailable we fail closed, never mint a guessable code.
  function randKey(len) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz012345";
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) out += alphabet[b % 32];
    return out;
  }

  function ensureKey() {
    const s = State.get();
    // 16 chars: old 8-char pids are extended once, new ones are unguessable.
    // This is the public leaderboard id only. Cloud restore uses a separate
    // server-minted secret that never shares this value.
    if (!s.pid || s.pid.length < 12) {
      s.pid = ((s.pid || "") + randKey(16)).slice(0, 16);
      State.save();
    }
    return s.pid;
  }

  const SAVE_ID_RE = /^[a-z0-9]{16}$/;
  const SAVE_SECRET_RE = /^[A-Za-z0-9._~+/=-]{16,512}$/;

  function parseRestoreCode(code) {
    const raw = String(code || "").trim();
    const dot = raw.indexOf(".");
    if (dot !== 16) return null;
    const id = raw.slice(0, 16);
    const secret = raw.slice(17);
    if (!SAVE_ID_RE.test(id) || !SAVE_SECRET_RE.test(secret)) return null;
    return { id, secret };
  }

  function restoreCodeOf(s) {
    return s.saveId && s.saveSecret ? s.saveId + "." + s.saveSecret : null;
  }

  function saveAuthHeaders(secret, extra) {
    const headers = { ...(extra || {}) };
    if (secret) headers.Authorization = "Bearer " + secret;
    return headers;
  }

  function outgoingSave(s) {
    const safeSave = JSON.parse(JSON.stringify(s));
    safeSave.wallet = null;
    safeSave.onlineStats = false;
    safeSave.proofs = [];
    safeSave.log = [];
    delete safeSave.saveSecret;
    delete safeSave.saveSession;
    delete safeSave.saveSessionExp;
    return safeSave;
  }

  function rememberSaveCreds(id, secret, version) {
    if (!SAVE_ID_RE.test(id) || !SAVE_SECRET_RE.test(secret)) return false;
    const s = State.get();
    s.saveId = id;
    s.saveSecret = secret;
    const ver = Math.round(Number(version));
    s.saveVersion = Number.isInteger(ver) && ver >= 0 ? ver : 1;
    State.save();
    return true;
  }

  async function cloudSave(force) {
    const s = State.get();
    if (!s.created || !CONFIG.saveUrl) return null;
    const now = Date.now();
    if (!force && (saving || now - saveAt < 20000)) return restoreCodeOf(s);
    saving = true; saveAt = now;
    try {
      // A cloud code is a deliberate backup action. Never upload the watched
      // wallet, exact practice coordinates, local-only consent, or the
      // recovery secret (that belongs in the Authorization header only).
      const safeSave = outgoingSave(s);
      if (!s.saveId || !s.saveSecret) {
        const j = await fetchJson(CONFIG.saveUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "create", save: safeSave }),
        }, 20000);
        if (!j || !rememberSaveCreds(String(j.id || ""), String(j.recoverySecret || ""), j.version || 1)) {
          lastError = new Error("create-rejected");
          return null;
        }
        return restoreCodeOf(State.get());
      }
      const j = await fetchJson(CONFIG.saveUrl, {
        method: "POST",
        headers: saveAuthHeaders(s.saveSecret, { "content-type": "application/json" }),
        body: JSON.stringify({
          action: "save",
          id: s.saveId,
          save: safeSave,
          baseVersion: s.saveVersion || 1,
        }),
      }, 20000);
      if (j && Number.isInteger(Number(j.version))) {
        State.get().saveVersion = Math.round(Number(j.version));
        State.save();
      }
      return restoreCodeOf(State.get());
    } catch (e) { lastError = e; return null; } finally { saving = false; }
  }

  async function cloudLoad(code) {
    if (!CONFIG.saveUrl) return null;
    const parsed = parseRestoreCode(code);
    if (!parsed) return null;
    try {
      const j = await fetchJson(
        CONFIG.saveUrl + "?id=" + encodeURIComponent(parsed.id),
        { headers: saveAuthHeaders(parsed.secret) },
        20000,
      );
      if (!j || !j.save || typeof j.save !== "object" || Array.isArray(j.save)) return null;
      j.save.saveId = parsed.id;
      j.save.saveSecret = parsed.secret;
      const ver = Math.round(Number(j.version));
      if (Number.isInteger(ver) && ver >= 0) j.save.saveVersion = ver;
      // Fail closed: the restore confirm dialog interpolates this object into
      // HTML, so a hostile API body must never leave this function unsanitized.
      j.save = State.migrate(j.save);
      return j;
    } catch (e) { return null; }
  }

  const myShortId = () => (State.get().pid || "").slice(0, 6);

  // Submit a Daily Storm score; resolves with fresh world state (incl. rank
  // data), or null when the server is unreachable or rejects the submission —
  // callers label the score as local-only in that case.
  async function pushDaily(day, score) {
    if (!URL_) return null;
    const s = State.get();
    if (!s.onlineStats) return null;
    if (!s.pid) ensureKey();
    try {
      const j = await fetchJson(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...publicStats(s), daily: { day: num(day), score: num(score) } }),
      });
      const w = sanitizeWorld(j);
      if (!w) return null;
      cache = w; fetchedAt = Date.now(); lastOkAt = Date.now(); lastError = null;
      return cache;
    } catch (e) { lastError = e; return null; }
  }

  async function deleteOnline() {
    const id = State.get().pid;
    if (!URL_ || !id) return false;
    try {
      await fetchJson(URL_ + "?id=" + encodeURIComponent(id), { method: "DELETE" });
      return true;
    } catch (e) { return false; }
  }

  async function cloudDelete() {
    const s = State.get();
    if (!CONFIG.saveUrl || !s.saveId || !s.saveSecret) return false;
    try {
      await fetchJson(
        CONFIG.saveUrl + "?id=" + encodeURIComponent(s.saveId),
        { method: "DELETE", headers: saveAuthHeaders(s.saveSecret) },
        20000,
      );
      s.saveId = "";
      s.saveSecret = "";
      s.saveVersion = 0;
      State.save();
      return true;
    } catch (e) { return false; }
  }

  return {
    fetchWorld, fetchReal, push, pushDaily, deleteOnline, myShortId,
    cloudSave, cloudLoad, cloudDelete, ensureKey, isStale,
  };
})();
window.Net = Net;
