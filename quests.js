// =============================================================================
// quests.js — the retention layer: daily missions, login streaks, achievements,
// variable loot drops, and a rivals leaderboard that progresses in real time.
// State shape it owns (inside the main save): streak{count,day}, quests{day,ids,
// prog,claimed}, achv[], stats{}.
// =============================================================================

const Quests = (() => {
  const dayIndex = () => Math.floor(Date.now() / 86400000);

  // ---------------------------------------------------------------------------
  // Daily missions — 3 per day, rotated deterministically from this pool.
  // `on` = event type; `filter` gates which events count; `amount` for metered
  // quests (default 1 per matching event).
  // ---------------------------------------------------------------------------
  const POOL = [
    { id: "plant3",   icon: "🌱", label: "Plant 3 of anything",             target: 3,  on: "plant",  reward: { tgn: 25, exp: 30 } },
    { id: "pioneer2", icon: "🧪", label: "Detox soil with 2 pioneers",      target: 2,  on: "plant",  filter: (p) => p.role === "pioneer", reward: { tgn: 20, exp: 25 } },
    { id: "tree2",    icon: "🌳", label: "Plant 2 deep-rooted trees",       target: 2,  on: "plant",  filter: (p) => p.role === "tree",    reward: { tgn: 30, exp: 35 } },
    { id: "perfect1", icon: "🌟", label: "Nail a Flourishing plant (85%+)", target: 1,  on: "plant",  filter: (p) => p.quality >= 0.85,    reward: { tgn: 40, exp: 50 } },
    { id: "heal6",    icon: "💚", label: "Heal any biome by 6%",            target: 6,  on: "plant",  amount: (p) => p.heal,               reward: { tgn: 35, exp: 40 } },
    { id: "carbon1",  icon: "💨", label: "Trade 1 carbon credit",           target: 1,  on: "carbon", reward: { tgn: 20, exp: 25 } },
    { id: "vote1",    icon: "🗳️", label: "Cast a DAO vote",                 target: 1,  on: "vote",   reward: { tgn: 15, exp: 20 } },
    { id: "earn50",   icon: "🪙", label: "Earn 50 TGN from planting",       target: 50, on: "plant",  amount: (p) => p.tgn,                reward: { tgn: 30, exp: 40 } },
    { id: "douse3",   icon: "💧", label: "Douse 3 fires in storms",         target: 3,  on: "run",    amount: (p) => p.doused || 0,        reward: { tgn: 25, exp: 30 } },
    { id: "storm8k",  icon: "⚡", label: "Score 8,000 in one storm",        target: 1,  on: "run",    filter: (p) => p.score >= 8000,      reward: { tgn: 35, exp: 45 } },
  ];
  const ALL_DONE_BONUS = { tgn: 60, exp: 80 };

  // Carbon missions stay in POOL so they return if the market is turned back
  // on. While CONFIG.carbonMarketEnabled is false the Carbon tab is hidden,
  // so rolling "Trade 1 carbon credit" makes a daily uncompletable.
  function availablePool() {
    return (typeof CONFIG !== "undefined" && CONFIG.carbonMarketEnabled)
      ? POOL
      : POOL.filter((q) => q.on !== "carbon");
  }

  function pickDailyIds(today) {
    const pool = availablePool();
    const ids = [];
    const n = pool.length;
    if (!n) return ids;
    for (let k = 0; ids.length < 3 && k < n * 4; k++) {
      const q = pool[(today * 7 + k * 3) % n];
      if (!ids.includes(q.id)) ids.push(q.id);
    }
    return ids;
  }

  // ---------------------------------------------------------------------------
  // Achievements — permanent badges, checked against full state.
  // ---------------------------------------------------------------------------
  const ACHV = [
    { id: "first-plant", icon: "🌱", name: "First Roots",    desc: "Plant your first plant",            test: (s) => s.treesPlanted >= 1 },
    { id: "ten-plants",  icon: "🌿", name: "Green Thumb",    desc: "Plant 10 times",                    test: (s) => s.treesPlanted >= 10 },
    { id: "fifty",       icon: "🌳", name: "Forest Maker",   desc: "Plant 50 times",                    test: (s) => s.treesPlanted >= 50 },
    { id: "stage2",      icon: "🌸", name: "Blooming",       desc: "Reach avatar stage 2",              test: () => State.stage() >= 2 },
    { id: "stage4",      icon: "🌲", name: "Elder",          desc: "Reach avatar stage 4",              test: () => State.stage() >= 4 },
    { id: "proof1",      icon: "🛰️", name: "Practice Run",   desc: "Record a practice planting proof",  test: (s) => s.practiceTrees >= 1 },
    { id: "mgro3",       icon: "🏆", name: "Living Legend",  desc: "Earn 3 demo MGRO points",           test: (s) => s.mgro >= 3 },
    { id: "nft3",        icon: "🖼️", name: "Collector",      desc: "Own 3 in-game collectibles",        test: (s) => s.nfts.length >= 3 },
    { id: "carbon5",     icon: "💨", name: "Green Trader",   desc: "Complete 5 carbon trades",          test: (s) => (s.stats.carbon || 0) >= 5, on: "carbon" },
    { id: "streak3",     icon: "🔥", name: "On Fire",        desc: "3-day streak",                      test: (s) => (s.streak.count || 0) >= 3 },
    { id: "streak7",     icon: "☄️", name: "Unstoppable",    desc: "7-day streak",                      test: (s) => (s.streak.count || 0) >= 7 },
    { id: "biome50",     icon: "💚", name: "Turning Point",  desc: "Get any biome past 50%",            test: () => CONFIG.biomes.some((b) => State.biomeHealth(b.id) >= 50) },
    { id: "holder",      icon: "⛓️", name: "Token Watcher",  desc: "Watch a public address with TGN",   test: (s) => !!(s.wallet && s.wallet.bal > 0) },
    { id: "biome100",    icon: "🌍", name: "Biome Healer",   desc: "Fully heal a biome",                test: () => CONFIG.biomes.some((b) => State.biomeHealth(b.id) >= 100) },
  ];

  // ---------------------------------------------------------------------------
  // Loot — variable-ratio drops after each planting. Quality nudges the odds.
  // ---------------------------------------------------------------------------
  const LOOT_NFTS = {
    rare: [
      { name: "Mycelium Charm",  emoji: "🍄" }, { name: "Seed-Bomb Pouch", emoji: "💣" },
      { name: "Vine Bracelet",   emoji: "🌿" }, { name: "Dew Lantern",     emoji: "🏮" },
    ],
    epic: [
      { name: "Heartwood Sigil", emoji: "💠" }, { name: "Canopy Halo",     emoji: "😇" },
    ],
  };

  function rollLoot(quality) {
    const r = Math.random() - quality * 0.06; // better plants → slightly better luck
    if (r < 0.02) {
      const n = LOOT_NFTS.epic[Math.floor(Math.random() * LOOT_NFTS.epic.length)];
      return { kind: "nft", rarity: "epic", ...n };
    }
    if (r < 0.10) {
      const n = LOOT_NFTS.rare[Math.floor(Math.random() * LOOT_NFTS.rare.length)];
      return { kind: "nft", rarity: "rare", ...n };
    }
    if (r < 0.25) return { kind: "exp", exp: 15 + Math.floor(Math.random() * 25) };
    if (r < 0.55) return { kind: "tgn", tgn: 5 + Math.floor(Math.random() * 11) };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rivals — deterministic daily growth so the ladder moves between sessions.
  // ---------------------------------------------------------------------------
  const EPOCH = 20620; // fixed day index near launch
  // `real` is a legacy field name for deterministic practice-proof milestones
  // on the local rivals ladder. These are simulated rivals, not real people.
  const RIVALS = [
    { name: "CanopyQueen",  emoji: "👑", base: 520, rate: 52, real: 640 },
    { name: "BaobabBoss",   emoji: "🌳", base: 430, rate: 44, real: 128 },
    { name: "MossMessiah",  emoji: "🍀", base: 350, rate: 38, real: 41 },
    { name: "SeedSage",     emoji: "🧙", base: 260, rate: 30, real: 27 },
    { name: "FernGully",    emoji: "🦎", base: 180, rate: 24, real: 8 },
    { name: "RootRunner",   emoji: "🏃", base: 110, rate: 18, real: 3 },
    { name: "SproutScout",  emoji: "🔍", base: 40,  rate: 12, real: 1 },
  ];

  function leaderboard() {
    const days = Math.max(0, dayIndex() - EPOCH);
    const s = State.get();
    const rows = RIVALS.map((r) => ({
      name: r.name, emoji: r.emoji, exp: Math.floor(r.base + r.rate * days), real: r.real, you: false,
    }));
    rows.push({ name: s.avatar.name || "You", emoji: "🌟", exp: s.exp, real: s.practiceTrees, you: true });
    rows.sort((a, b) => b.exp - a.exp);
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Daily tick: streak + mission regeneration. Call on boot and on map render.
  // ---------------------------------------------------------------------------
  function ensureDaily() {
    const s = State.get();
    const today = dayIndex();
    if (!s.streak) s.streak = { count: 0, day: 0 };
    if (!s.quests) s.quests = { day: 0, ids: [], prog: {}, claimed: [] };
    if (!s.stats) s.stats = {};

    let changed = false;
    if (s.streak.day !== today) {
      if (s.streak.day === today - 1) {
        s.streak.count += 1;
      } else if (s.streak.day === today - 2 && (s.streak.freeze || 0) > 0) {
        // ❄️ streak shield: one missed day forgiven, streak continues
        s.streak.freeze -= 1;
        s.streak.count += 1;
        window.__freezeUsed = true;
      } else {
        s.streak.count = 1;
      }
      // every 7 consecutive days earns a shield (carry at most 2)
      if (s.streak.count > 0 && s.streak.count % 7 === 0) {
        s.streak.freeze = Math.min(2, (s.streak.freeze || 0) + 1);
      }
      s.streak.day = today;
      changed = true;
    }
    if (s.quests.day !== today) {
      s.quests = { day: today, ids: pickDailyIds(today), prog: {}, claimed: [] };
      changed = true;
    } else {
      const allowed = new Set(availablePool().map((q) => q.id));
      if (s.quests.ids.some((id) => !allowed.has(id))) {
        const next = s.quests.ids.filter((id) => allowed.has(id));
        const pool = availablePool();
        for (let k = 0; next.length < 3 && k < pool.length * 4; k++) {
          const q = pool[(today * 7 + k * 3) % pool.length];
          if (!next.includes(q.id)) next.push(q.id);
        }
        const keep = new Set(next);
        const prog = {};
        next.forEach((id) => { if (s.quests.prog[id]) prog[id] = s.quests.prog[id]; });
        s.quests.ids = next;
        s.quests.prog = prog;
        s.quests.claimed = (s.quests.claimed || []).filter((id) => keep.has(id));
        changed = true;
      }
    }
    if (changed) State.save();
    return s.quests;
  }

  const questDef = (id) => POOL.find((q) => q.id === id);

  // Called by State after every rewarding action.
  function onEvent(type, payload) {
    const s = State.get();
    ensureDaily();
    if (type === "carbon") s.stats.carbon = (s.stats.carbon || 0) + 1;
    let touched = false;
    s.quests.ids.forEach((id) => {
      const q = questDef(id);
      if (!q || q.on !== type) return;
      if (q.filter && !q.filter(payload || {})) return;
      const inc = q.amount ? q.amount(payload || {}) : 1;
      const cur = s.quests.prog[id] || 0;
      if (cur >= q.target) return;
      s.quests.prog[id] = Math.min(q.target, cur + inc);
      touched = true;
    });
    if (touched || type === "carbon") State.save();
  }

  function claim(id) {
    const s = State.get();
    const q = questDef(id);
    if (!q || s.quests.claimed.includes(id)) return null;
    if ((s.quests.prog[id] || 0) < q.target) return null;
    s.quests.claimed.push(id);
    State.earn(q.reward.exp, q.reward.tgn);
    let bonus = null;
    if (s.quests.claimed.length === s.quests.ids.length) {
      State.earn(ALL_DONE_BONUS.exp, ALL_DONE_BONUS.tgn);
      bonus = ALL_DONE_BONUS;
    }
    State.save();
    return { reward: q.reward, bonus };
  }

  // Carbon badges stay in ACHV so they return if the market is turned back
  // on. While it is off, listing a locked Green Trader is a dead end.
  function availableAchievements() {
    const unlocked = (typeof State !== "undefined" && State.get && State.get().achv) || [];
    if (typeof CONFIG !== "undefined" && CONFIG.carbonMarketEnabled) return ACHV;
    return ACHV.filter((a) => a.on !== "carbon" || unlocked.includes(a.id));
  }

  // Returns achievements newly unlocked since last check (and records them).
  function checkAchv() {
    const s = State.get();
    if (!s.achv) s.achv = [];
    const fresh = availableAchievements().filter((a) => !s.achv.includes(a.id) && a.test(s));
    if (fresh.length) {
      fresh.forEach((a) => s.achv.push(a.id));
      State.save();
    }
    return fresh;
  }

  const achvAll = () => availableAchievements();

  return { ensureDaily, questDef, onEvent, claim, checkAchv, achvAll, rollLoot, leaderboard };
})();
// `const` doesn't create a window property — expose explicitly so state.js's
// `window.Quests` guard (state.js loads first) can find us.
window.Quests = Quests;
