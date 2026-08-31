// =============================================================================
// state.js — persistent game state + economy engine (localStorage demo mode)
// All numbers are demo numbers; no real tokens move. Mirrors BounTREES pattern.
// =============================================================================

const SAVE_KEY = "treegens_game_v1";

const State = (() => {
  function fresh() {
    return {
      created: false,
      onlineStats: false,  // explicit opt-in for public display name / scores
      avatar: { name: "", hue: 130, accent: "#fbbf24", seed: 7 },
      exp: 0,
      tgn: 50,            // starter grant
      mgro: 0,            // demo legendary points; no token is minted
      treesPlanted: 0,    // virtual
      practiceTrees: 0,   // practice proof count; never represented as verified
      realTrees: 0,       // reserved for a future real verifier integration
      generalFund: 0,     // simulated allocation, not money raised or sent
      carbonOwned: 0,     // credits (tonnes)
      carbonCostBasis: 0, // total USD paid (for P/L)
      biomes: {},         // id -> { health }
      nfts: [],           // owned NFT ids/objects
      market: null,       // live listings (seeded once)
      daoVotes: {},       // regionId -> count (this player's allocation)
      proofs: [],         // submitted proof-of-plant records
      log: [],            // recent activity feed
      streak: { count: 0, day: 0 },              // daily login streak
      quests: { day: 0, ids: [], prog: {}, claimed: [] },
      achv: [],           // unlocked achievement ids
      stats: {},          // misc counters (carbon trades, ...)
      lastSeen: 0,        // ms timestamp — for welcome-back rewards
      grove: [],          // planting history for the 3D grove: {sp, q} ('real' = verified)
      records: {},        // biomeId -> {score, combo} — Seed Storm high scores
      wallet: null,       // {addr, bal, t} — real on-chain TGN, read-only
      daily: { day: 0, best: 0, plays: 0 }, // ⚡ Daily Storm progress
    };
  }

  let s = load();
  welcomeBack();

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {}
    return seed(fresh());
  }

  // Passive "sap" accrual: your forests keep photosynthesising while you're
  // away. Small, capped at 24h — a reason to come back, not an idle exploit.
  function welcomeBack() {
    const now = Date.now();
    const hrs = s.lastSeen ? (now - s.lastSeen) / 3600000 : 0;
    if (hrs >= 2 && (s.practiceTrees > 0 || s.treesPlanted > 0)) {
      const sap = Math.floor(Math.min(24, hrs) * (0.4 * s.practiceTrees + 0.05 * s.treesPlanted));
      if (sap > 0) {
        s.tgn += sap;
        logEvent("🌤️", `Welcome back! Your forests made ${sap} TGN of sap while you were away`);
        window.__welcomeBack = { tgn: sap, hrs: Math.round(hrs) };
      }
    }
    s.lastSeen = now;
    save();
  }

  // Notify the quest layer (loaded after us, so guard) about rewarding actions.
  function emit(type, payload) {
    try { if (window.Quests) Quests.onEvent(type, payload); } catch (e) {}
  }

  function seed(state) {
    CONFIG.biomes.forEach((b) => {
      if (!state.biomes[b.id]) state.biomes[b.id] = { health: b.startHealth };
    });
    if (!state.market) state.market = CONFIG.marketSeed.map((m) => ({ ...m }));
    return state;
  }

  // Restore/import write raw JSON then reload. Copy only known fields so a
  // hostile save cannot park markup in HUD numbers, collection lengths, or
  // extra keys. Invalid values fail closed to the fresh() default or 0.
  function asNum(v, fallback = 0, min = 0, max = 1e12) {
    if (v === undefined || v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
  }
  function asStr(v, max) {
    return (typeof v === "string" ? v : "").slice(0, max);
  }
  function asIdList(v, re, maxN) {
    return (Array.isArray(v) ? v : []).filter((id) => typeof id === "string" && re.test(id)).slice(0, maxN);
  }
  function asItem(m) {
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const item = {
      id: asStr(m.id, 32),
      name: asStr(m.name, 48),
      emoji: asStr(m.emoji, 8),
      rarity: asStr(m.rarity, 16),
      seller: asStr(m.seller, 32),
      kind: asStr(m.kind, 16),
      price: asNum(m.price, 0, 0, 1e9),
    };
    if (m.provenance) item.provenance = asStr(m.provenance, 80);
    if (m.ownedAt) item.ownedAt = asStr(m.ownedAt, 32);
    return item;
  }

  function migrate(state) {
    if (!state || typeof state !== "object" || Array.isArray(state)) return seed(fresh());
    const migrated = fresh();
    migrated.created = !!state.created;
    migrated.onlineStats = state.onlineStats === true;
    migrated.exp = asNum(state.exp, migrated.exp);
    migrated.tgn = asNum(state.tgn, migrated.tgn);
    migrated.mgro = asNum(state.mgro, migrated.mgro);
    migrated.treesPlanted = asNum(state.treesPlanted, migrated.treesPlanted);
    migrated.practiceTrees = ("practiceTrees" in state)
      ? asNum(state.practiceTrees, 0)
      : asNum(state.realTrees, 0);
    migrated.realTrees = 0;
    migrated.generalFund = asNum(state.generalFund, migrated.generalFund);
    migrated.carbonOwned = asNum(state.carbonOwned, migrated.carbonOwned);
    migrated.carbonCostBasis = asNum(state.carbonCostBasis, migrated.carbonCostBasis);
    migrated.lastSeen = asNum(state.lastSeen, 0, 0, 1e15);

    const av = state.avatar && typeof state.avatar === "object" && !Array.isArray(state.avatar)
      ? state.avatar : {};
    const hue = Number(av.hue);
    const seedN = Number(av.seed);
    migrated.avatar = {
      name: asStr(av.name, 18),
      hue: Number.isFinite(hue) ? Math.min(360, Math.max(0, hue)) : 130,
      accent: typeof av.accent === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(av.accent) ? av.accent : "#fbbf24",
      seed: Number.isFinite(seedN) ? seedN : 7,
    };

    const w = state.wallet;
    if (!w || typeof w !== "object" || Array.isArray(w) || typeof w.addr !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(w.addr)) {
      migrated.wallet = null;
    } else {
      const bal = Number(w.bal);
      migrated.wallet = { addr: w.addr, bal: Number.isFinite(bal) && bal >= 0 ? bal : 0, t: Number(w.t) || 0 };
    }

    const saveId = typeof state.saveId === "string" ? state.saveId : "";
    migrated.saveId = /^[a-z0-9]{16}$/.test(saveId) ? saveId : "";
    const saveSecret = typeof state.saveSecret === "string" ? state.saveSecret : "";
    migrated.saveSecret = /^[A-Za-z0-9._~+/=-]{16,512}$/.test(saveSecret) ? saveSecret : "";
    const saveVer = Math.round(Number(state.saveVersion));
    migrated.saveVersion = Number.isInteger(saveVer) && saveVer >= 0 ? saveVer : 0;
    const pid = typeof state.pid === "string" ? state.pid : "";
    if (/^[a-z0-9]{1,16}$/.test(pid)) migrated.pid = pid;

    const biomeIds = new Set(CONFIG.biomes.map((b) => b.id));
    const biomesIn = state.biomes && typeof state.biomes === "object" && !Array.isArray(state.biomes)
      ? state.biomes : {};
    migrated.biomes = {};
    biomeIds.forEach((id) => {
      const row = biomesIn[id] && typeof biomesIn[id] === "object" && !Array.isArray(biomesIn[id])
        ? biomesIn[id] : null;
      if (row) migrated.biomes[id] = { health: asNum(row.health, 0, 0, 100) };
    });

    const proofsIn = Array.isArray(state.proofs) ? state.proofs : [];
    migrated.proofs = proofsIn.slice(0, 40).map((p) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      const count = Math.round(Number(p.count));
      const biomeId = asStr(p.biomeId, 32);
      return {
        biomeId: biomeIds.has(biomeId) ? biomeId : "",
        species: asStr(p.species, 48),
        lat: Number.isFinite(lat) ? Math.min(90, Math.max(-90, lat)) : 0,
        lng: Number.isFinite(lng) ? Math.min(180, Math.max(-180, lng)) : 0,
        count: Number.isFinite(count) && count >= 0 ? Math.min(count, 500) : 0,
        verified: false,
        practice: true,
        t: asStr(p.t, 32),
      };
    }).filter(Boolean);

    migrated.log = (Array.isArray(state.log) ? state.log : []).slice(0, 40).map((l) => {
      if (!l || typeof l !== "object" || Array.isArray(l)) return null;
      return { emoji: asStr(l.emoji, 8), text: asStr(l.text, 240), t: asStr(l.t, 32) };
    }).filter(Boolean);
    migrated.nfts = (Array.isArray(state.nfts) ? state.nfts : []).slice(0, 100).map(asItem).filter(Boolean);
    if (Array.isArray(state.market)) {
      migrated.market = state.market.slice(0, 40).map(asItem).filter(Boolean);
    }
    migrated.grove = (Array.isArray(state.grove) ? state.grove : []).slice(0, 420).map((g) => {
      if (!g || typeof g !== "object" || Array.isArray(g)) return null;
      const q = Number(g.q);
      return { sp: asStr(g.sp, 24), q: Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0.7 };
    }).filter(Boolean);
    migrated.achv = asIdList(state.achv, /^[a-z0-9-]{1,32}$/, 40);

    if (state.streak && typeof state.streak === "object" && !Array.isArray(state.streak)) {
      migrated.streak = {
        count: asNum(state.streak.count, 0, 0, 1e6),
        day: asNum(state.streak.day, 0, 0, 1e9),
        freeze: asNum(state.streak.freeze, 0, 0, 2),
      };
    }
    if (state.daily && typeof state.daily === "object" && !Array.isArray(state.daily)) {
      migrated.daily = {
        day: asNum(state.daily.day, 0, 0, 1e9),
        best: asNum(state.daily.best, 0),
        plays: asNum(state.daily.plays, 0, 0, 1e6),
      };
    }
    if (state.quests && typeof state.quests === "object" && !Array.isArray(state.quests)) {
      const ids = asIdList(state.quests.ids, /^[a-z0-9]{1,24}$/, 8);
      const claimed = asIdList(state.quests.claimed, /^[a-z0-9]{1,24}$/, 8);
      const progIn = state.quests.prog && typeof state.quests.prog === "object" && !Array.isArray(state.quests.prog)
        ? state.quests.prog : {};
      const prog = {};
      ids.forEach((id) => { prog[id] = asNum(progIn[id], 0, 0, 1e6); });
      migrated.quests = { day: asNum(state.quests.day, 0, 0, 1e9), ids, prog, claimed };
    }

    const daoIds = new Set((CONFIG.daoRegions || []).map((r) => r.id));
    const dv = state.daoVotes && typeof state.daoVotes === "object" && !Array.isArray(state.daoVotes)
      ? state.daoVotes : {};
    migrated.daoVotes = {};
    daoIds.forEach((id) => { if (id in dv) migrated.daoVotes[id] = asNum(dv[id], 0, 0, 1e6); });

    const recIn = state.records && typeof state.records === "object" && !Array.isArray(state.records)
      ? state.records : {};
    migrated.records = {};
    biomeIds.forEach((id) => {
      const row = recIn[id] && typeof recIn[id] === "object" && !Array.isArray(recIn[id]) ? recIn[id] : null;
      if (row) migrated.records[id] = { score: asNum(row.score, 0), combo: asNum(row.combo, 0) };
    });

    const statsIn = state.stats && typeof state.stats === "object" && !Array.isArray(state.stats)
      ? state.stats : {};
    migrated.stats = {};
    Object.keys(statsIn).forEach((k) => {
      if (/^[a-z][a-z0-9]{0,31}$/.test(k)) migrated.stats[k] = asNum(statsIn[k], 0);
    });

    return seed(migrated);
  }

  function save() {
    s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
    if (typeof window.__onState === "function") window.__onState(s);
  }

  function reset() { s = seed(fresh()); save(); }

  // --- helpers ---
  function logEvent(emoji, text) {
    s.log.unshift({ emoji, text, t: nowLabel() });
    s.log = s.log.slice(0, 40);
  }
  function nowLabel() {
    // Date.now is fine in the browser runtime; only the agent sandbox blocks it.
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function stage() {
    let st = 0;
    CONFIG.evolution.forEach((req, i) => { if (s.exp >= req) st = i; });
    return Math.min(st, CONFIG.evolution.length - 1);
  }
  function nextStageExp() {
    const st = stage();
    return CONFIG.evolution[st + 1] ?? null;
  }
  function biomeHealth(id) { return s.biomes[id]?.health ?? 0; }
  function avgWorldHealth() {
    const vals = CONFIG.biomes.map((b) => biomeHealth(b.id));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function biomeUnlocked(b) { return s.exp >= b.reqExp; }

  // --- economy actions ---
  function earn(exp, tgn) {
    const beforeStage = stage();
    s.exp += exp; s.tgn += tgn;
    const afterStage = stage();
    save();
    return { evolved: afterStage > beforeStage, stage: afterStage };
  }

  function spend(tgn) {
    if (s.tgn < tgn) return false;
    s.tgn -= tgn; save(); return true;
  }

  // Virtual planting result feeds biome health, exp, tgn, fund.
  function plant(biomeId, speciesKey, quality /*0..1*/) {
    const sp = CONFIG.species[speciesKey];
    const b = s.biomes[biomeId];
    const mult = 0.5 + quality; // 0.5x .. 1.5x
    const heal = sp.healPerPlant * mult;
    b.health = Math.min(100, b.health + heal);
    const exp = Math.round(sp.exp * mult);
    const tgn = Math.max(1, Math.round(sp.tgn * mult));
    s.treesPlanted += 1;
    if (s.grove.length < 420) s.grove.push({ sp: speciesKey, q: +quality.toFixed(2) });
    // Educational simulation only: no payment or real-world contribution.
    s.generalFund += 0.05;
    const r = earn(exp, tgn);
    logEvent(sp.emoji, `Planted ${sp.name} in ${biomeName(biomeId)} (+${exp} EXP, +${tgn} TGN)`);
    emit("plant", { species: speciesKey, role: sp.role, quality, heal, tgn, exp });
    return { heal, exp, tgn, evolved: r.evolved, health: b.health };
  }

  function biomeName(id) { return CONFIG.biomes.find((b) => b.id === id)?.name || id; }

  // Batch-apply a Seed Storm run: many trees, one save. Per-tree rewards are
  // scaled down (~30%) since a run plants 15–30 trees. Pioneers heal harder
  // in contaminated soil — that's their whole job.
  function plantMany(biomeId, speciesKey, qualities) {
    const sp = CONFIG.species[speciesKey];
    const b = s.biomes[biomeId];
    let exp = 0, tgn = 0, heal = 0;
    const beforeStage = stage();
    const pioneerBoost = sp.role === "pioneer" && b.health < 50 ? 1.6 : 1;
    qualities.forEach((q) => {
      const m = 0.5 + q;
      const e = Math.round(sp.exp * 0.28 * m);
      const g = sp.tgn * 0.3 * m;
      const h = sp.healPerPlant * 0.32 * m * pioneerBoost;
      exp += e; tgn += g; heal += h;
      s.treesPlanted += 1;
      if (s.grove.length < 420) s.grove.push({ sp: speciesKey, q: +q.toFixed(2) });
      s.generalFund += 0.05;
      emit("plant", { species: speciesKey, role: sp.role, quality: q, heal: h, tgn: g, exp: e });
    });
    tgn = Math.max(qualities.length ? 1 : 0, Math.round(tgn));
    b.health = Math.min(100, b.health + heal);
    s.exp += exp; s.tgn += tgn;
    const evolved = stage() > beforeStage;
    if (qualities.length) logEvent(sp.emoji, `Planting run: ${qualities.length}× ${sp.name} in ${biomeName(biomeId)} (+${exp} EXP, +${tgn} TGN, +${heal.toFixed(1)}%)`);
    save();
    return { exp, tgn, heal, evolved, count: qualities.length, health: b.health };
  }

  // Deep-detox puzzle payout (phytoremediation side event on contaminated soil).
  function detox(biomeId, q) {
    const b = s.biomes[biomeId];
    const heal = 3 + 5 * q;
    const exp = Math.round(20 + 40 * q);
    const tgn = Math.round(8 + 12 * q);
    b.health = Math.min(100, b.health + heal);
    const r = earn(exp, tgn);
    logEvent("🧪", `Deep detox in ${biomeName(biomeId)} - soil +${heal.toFixed(1)}% (+${exp} EXP, +${tgn} TGN)`);
    emit("plant", { species: "cannabis", role: "pioneer", quality: q, heal, tgn, exp });
    return { heal, exp, tgn, evolved: r.evolved };
  }

  // --- Proof of Plant (PRACTICE ONLY: no real verification happens here) ---
  function submitProof({ biomeId, species, lat, lng, count }) {
    const reward = { exp: 250, tgn: 60, mgro: 1, fund: 0, practiceTrees: count };
    s.exp += reward.exp; s.tgn += reward.tgn; s.mgro += reward.mgro;
    s.practiceTrees += count;
    // Practice-proof trees glow gold in the local grove; this is not verification.
    for (let i = 0; i < Math.min(count, 24) && s.grove.length < 420; i++) s.grove.push({ sp: "practice", q: 1 });
    if (s.biomes[biomeId]) s.biomes[biomeId].health = Math.min(100, s.biomes[biomeId].health + 6);
    s.proofs.unshift({
      biomeId, species, lat, lng, count,
      verified: false, practice: true, t: nowLabel(),
    });
    logEvent("📋", `Practice submission recorded: ${count} ${species} @ ${lat.toFixed(2)},${lng.toFixed(2)} (in-game rewards only, not verified)`);
    save();
    emit("proof", { count });
    return reward;
  }

  // --- Eco-Market (85/5/10 split) ---
  function buyNft(id) {
    const idx = s.market.findIndex((m) => m.id === id);
    if (idx < 0) return { ok: false, reason: "gone" };
    const item = s.market[idx];
    if (s.tgn < item.price) return { ok: false, reason: "funds" };
    s.tgn -= item.price;
    const split = CONFIG.marketSplit;
    const toFund = item.price * (split.planting / 100);
    s.generalFund += toFund / 10; // price is TGN; convert ~ to USD-ish for fund display
    s.nfts.push({ ...item, ownedAt: nowLabel() });
    s.market.splice(idx, 1);
    logEvent(item.emoji, `Demo purchase: ${item.name} for ${item.price} in-game TGN - ${toFund.toFixed(0)} allocated in the simulation`);
    save();
    return { ok: true, item, toFund };
  }

  // Player lists one of their NFTs; on "sale" they get 85%.
  function sellNft(ownedIndex, price) {
    const nft = s.nfts[ownedIndex];
    if (!nft) return { ok: false };
    const split = CONFIG.marketSplit;
    const sellerCut = price * (split.seller / 100);
    const toFund = price * (split.planting / 100);
    s.tgn += sellerCut;
    s.generalFund += toFund / 10;
    s.nfts.splice(ownedIndex, 1);
    logEvent(nft.emoji, `Demo sale: ${nft.name} for ${price} in-game TGN - ${sellerCut.toFixed(0)} returned to your game balance`);
    save();
    return { ok: true, sellerCut, toFund };
  }

  function mintReward(nft) {
    s.nfts.push({ ...nft, ownedAt: nowLabel() });
    logEvent(nft.emoji, `Earned ${nft.name} - added to your in-game collection`);
    save();
  }

  // --- DAO ---
  function voteRegion(regionId) {
    s.daoVotes[regionId] = (s.daoVotes[regionId] || 0) + 1;
    logEvent("🗳️", `Voted to deploy the General Fund to ${CONFIG.daoRegions.find(r=>r.id===regionId)?.name}`);
    save();
    emit("vote", {});
  }
  function votePower() { return 1 + Math.floor(s.exp / 200) + s.mgro * 3; }

  // --- Carbon market ---
  // Rotating hourly market "news" — a shock multiplier that teaches volatility.
  const CARBON_NEWS = [
    { txt: "🏛️ EU tightens its emissions cap - compliance demand surges", mult: 1.12 },
    { txt: "📉 A registry scandal shakes low-quality credits - flight to quality", mult: 0.93 },
    { txt: "✈️ Airlines pre-buy offsets ahead of CORSIA deadline", mult: 1.08 },
    { txt: "🌊 New blue-carbon methodology approved - mangrove premium widens", mult: 1.15 },
    { txt: "🗞️ Quiet week in the compliance markets", mult: 1.0 },
    { txt: "🏭 Heavy industry lobbies for delay - prices soften", mult: 0.95 },
    { txt: "🛰️ Satellite MRV cuts verification costs - high-quality supply tightens", mult: 1.06 },
  ];
  function carbonNews() {
    return CARBON_NEWS[Math.floor(Date.now() / 3600000) % CARBON_NEWS.length];
  }
  function carbonPrice() {
    // Price rises with total world progress (regulation tightening proxy) + planted volume,
    // scaled by the hour's market news.
    const drift = avgWorldHealth() * 0.18 + s.treesPlanted * 0.02 + s.realTrees * 0.5;
    return +((CONFIG.carbon.startPrice + drift) * carbonNews().mult).toFixed(2);
  }
  // Deterministic price history climbing from the start price to the current
  // price (no randomness — keeps it stable across renders / agent sandbox).
  function carbonSeries(points) {
    const cur = carbonPrice(), start = CONFIG.carbon.startPrice;
    const arr = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const base = start + (cur - start) * Math.pow(t, 1.25);
      const wiggle = Math.sin(i * 0.8) * Math.min(0.6, (cur - start) * 0.05);
      arr.push(Math.max(start * 0.92, +(base + wiggle).toFixed(2)));
    }
    arr[points - 1] = cur;
    return arr;
  }
  function buyCarbon(tonnes, premium) {
    const cost = carbonPrice() * premium * tonnes;
    const tgnCost = Math.round(cost / CONFIG.token.usd); // pay in TGN at display rate
    if (s.tgn < tgnCost) return { ok: false, reason: "funds", tgnCost };
    s.tgn -= tgnCost; s.carbonOwned += tonnes; s.carbonCostBasis += cost;
    logEvent("💨", `Bought ${tonnes} carbon credit(s) for ${tgnCost} TGN @ $${(cost/tonnes).toFixed(2)}/t`);
    save();
    emit("carbon", { side: "buy", tonnes });
    return { ok: true, tgnCost, cost };
  }
  function sellCarbon(tonnes, premium) {
    if (s.carbonOwned < tonnes) return { ok: false, reason: "hold" };
    const value = carbonPrice() * premium * tonnes;
    const tgnGain = Math.round(value / CONFIG.token.usd);
    const basisPer = s.carbonOwned ? s.carbonCostBasis / s.carbonOwned : 0;
    s.carbonOwned -= tonnes; s.carbonCostBasis -= basisPer * tonnes;
    s.tgn += tgnGain;
    logEvent("💸", `Sold ${tonnes} credit(s) for ${tgnGain} TGN @ $${(value/tonnes).toFixed(2)}/t`);
    save();
    emit("carbon", { side: "sell", tonnes });
    return { ok: true, tgnGain, value };
  }

  return {
    get: () => s,
    save, reset, migrate,
    stage, nextStageExp, biomeHealth, avgWorldHealth, biomeUnlocked, biomeName,
    earn, spend, plant, plantMany, detox, submitProof,
    buyNft, sellNft, mintReward,
    voteRegion, votePower,
    carbonPrice, carbonSeries, carbonNews, buyCarbon, sellCarbon,
  };
})();
