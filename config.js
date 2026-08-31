// =============================================================================
// Treegens Game — The Reforestation Metaverse
// config.js — all static game data (the "design doc" as code)
// A digital mirror of the real world: red zones come from real deforestation.
// =============================================================================

const CONFIG = {
  version: "1.3.2",

  // --- The reward token (real, verified on Base — same as TGN on-ramp / BounTREES) ---
  token: {
    symbol: "TGN",
    name: "TGNToken",
    address: "0xD75dfa972C6136f1c594Fec1945302f885E1ab29",
    explorer: "https://basescan.org/token/0xD75dfa972C6136f1c594Fec1945302f885E1ab29",
    usd: 0.11, // fallback when the live price feed is unreachable
  },

  // The real purchase flow — the live Apple Pay → USDC → TGN on-ramp.
  // The game only LINKS here; it never signs or moves funds itself.
  buyUrl: "https://buytgn.xyz",

  // Shared world state: global GROWalition counter + cross-player leaderboard.
  // Gameplay stats only (name + scores), no PII. Offline → graceful fallback.
  apiUrl: "https://treegens-api.netlify.app/api/grow",

  // Real planting totals from the live Treegens backend, proxied server-side.
  realStatsUrl: "https://treegens-api.netlify.app/api/tg?r=stats",

  // Cloud save: progress survives a cleared browser and moves between devices.
  saveUrl: "https://treegens-api.netlify.app/api/save",

  // Demo legendary points earned through the local practice-proof flow.
  legendary: { symbol: "MGRO", name: "Mangrove Legend", emoji: "🏆" },

  // Eco-Market simulation split (proposal §6). No real revenue moves here.
  marketSplit: { seller: 85, treasury: 5, planting: 10 },

  // The grand goal (proposal §3 / §7).
  goal: { trees: 1_000_000_000, label: "One Billion Trees" },

  // The guide & lore (proposal §3).
  guide: {
    name: "Jimi Cohen",
    title: "Leader of the GROWalition",
    record: "30,469 mangroves planted in 24 hours in Kenya, a former record",
    lines: [
      "Welcome, Treegen. I'm Jimi. The map you're about to see isn't fantasy - those red zones are real places bleeding green right now.",
      "I once planted 30,469 mangroves in a single day in Kenya. Not for a trophy - to prove what a coordinated crew can do.",
      "Your avatar can't be bought taller. It grows only when you heal soil. That's the whole game. That's the whole point.",
      "Heal a biome to 100% and you earn the right to name a real forest on-chain. Let's go to the GROWlympics. One billion trees.",
    ],
  },

  // --- World map: real deforestation red zones ---
  // health 0–100. Each zone unlocks the next once it crosses a threshold.
  biomes: [
    {
      id: "amazon",
      name: "Amazon Basin",
      flag: "🇧🇷",
      emoji: "🌳",
      coords: [-3.46, -62.21],
      lore: "The lungs of Earth. Cattle and soy have cleared an area the size of France since 1970.",
      source: "Global Forest Watch - primary forest loss",
      startHealth: 18,
      reqExp: 0,
      species: ["kapok", "brazilnut", "hemp"],
      hazard: "degraded pasture soil",
      color: "#22c55e",
    },
    {
      id: "kenya",
      name: "Gazi Bay Mangroves",
      flag: "🇰🇪",
      emoji: "🌿",
      coords: [-4.42, 39.50],
      lore: "Jimi's record site. Mangrove nurseries shelter fish, shield the coast from storms, and hold the shoreline together.",
      source: "NASA - coastal mangrove extent",
      startHealth: 30,
      reqExp: 120,
      species: ["mangrove", "casuarina", "hemp"],
      hazard: "saline tidal flat",
      color: "#14b8a6",
    },
    {
      id: "borneo",
      name: "Borneo Peatlands",
      flag: "🇮🇩",
      emoji: "🦧",
      coords: [0.95, 114.55],
      lore: "Palm-oil drainage turned deep peat into a tinderbox. Orangutans are running out of canopy.",
      source: "Global Forest Watch - peatland alerts",
      startHealth: 12,
      reqExp: 320,
      species: ["ramin", "dipterocarp", "cannabis"],
      hazard: "drained acidic peat",
      color: "#f59e0b",
    },
    {
      id: "sahel",
      name: "The Great Green Wall",
      flag: "🌍",
      emoji: "🏜️",
      coords: [14.5, -1.5],
      lore: "An 8,000 km belt of trees being grown across Africa to hold back the Sahara.",
      source: "UNCCD - Great Green Wall progress",
      startHealth: 8,
      reqExp: 620,
      species: ["acacia", "baobab", "cannabis"],
      hazard: "heavy-metal & arid soil",
      color: "#eab308",
    },
    {
      id: "atlantic",
      name: "Atlantic Forest",
      flag: "🇧🇷",
      emoji: "🦜",
      coords: [-22.5, -42.5],
      lore: "Once twice the size of Texas - 93% is gone. The most endangered rainforest on Earth.",
      source: "SOS Mata Atlântica - remnant mapping",
      startHealth: 7,
      reqExp: 900,
      species: ["brazilnut", "casuarina", "cannabis"],
      hazard: "fragmented farmland",
      color: "#a855f7",
    },
  ],

  // --- Plantable species (real biology — proposal §4) ---
  // role: "pioneer" species detox/prepare soil; "tree" species need healthy soil.
  species: {
    hemp: {
      mech: "detox", mechLabel: "🧪 DETOX - barrels are safe: grab them for points",
      name: "Industrial Hemp", emoji: "🌱", role: "pioneer", depthCm: 2, water: 2,
      fact: "Fast-cycle pioneer. Pulls heavy metals out of poisoned ground in weeks, not years.",
      exp: 8, tgn: 1, healPerPlant: 1.5,
    },
    cannabis: {
      mech: "detox", mechLabel: "🧪 DETOX - barrels are safe: grab them for points",
      name: "Cannabis (Phytoremediator)", emoji: "🌿", role: "pioneer", depthCm: 2, water: 3,
      fact: "Deep taproot pulls cadmium & lead from poisoned ground. Heal the soil first - medicine unlocks after.",
      exp: 10, tgn: 1, healPerPlant: 2.0,
    },
    mangrove: {
      mech: "mangrove", mechLabel: "🌊 TIDE - the band rises and falls",
      name: "Red Mangrove", emoji: "🌳", role: "tree", depthCm: 15, water: 5,
      fact: "Propagule planted in tidal mud. The nursery of the coast: fish, crabs and birds move in fast.",
      exp: 22, tgn: 3, healPerPlant: 3.5, needsHealthy: true,
    },
    kapok: {
      mech: "canopy", mechLabel: "🌿 CANOPY - every 5-chain sweeps all hazards",
      name: "Kapok Tree", emoji: "🌴", role: "tree", depthCm: 10, water: 4,
      fact: "Emergent giant of the Amazon - 60 m tall, a city of biodiversity in one crown.",
      exp: 20, tgn: 3, healPerPlant: 3.0, needsHealthy: true,
    },
    brazilnut: {
      name: "Brazil Nut", emoji: "🌰", role: "tree", depthCm: 8, water: 4,
      fact: "Cannot be farmed - needs intact forest & a specific bee. Plant it, protect the whole web.",
      exp: 20, tgn: 3, healPerPlant: 3.0, needsHealthy: true,
    },
    casuarina: {
      name: "Casuarina", emoji: "🌲", role: "tree", depthCm: 12, water: 3,
      fact: "Nitrogen-fixing coastal windbreak that thrives in salt and shelters mangrove nurseries.",
      exp: 18, tgn: 2, healPerPlant: 2.5, needsHealthy: true,
    },
    ramin: {
      name: "Ramin", emoji: "🌴", role: "tree", depthCm: 10, water: 5,
      fact: "Peat-swamp hardwood. Rewetting and replanting stops the peat drying out and burning.",
      exp: 22, tgn: 3, healPerPlant: 3.2, needsHealthy: true,
    },
    dipterocarp: {
      mech: "canopy", mechLabel: "🌿 CANOPY - every 5-chain sweeps all hazards",
      name: "Dipterocarp", emoji: "🌳", role: "tree", depthCm: 12, water: 4,
      fact: "Borneo's canopy backbone. Mast-fruits feed orangutans, then towers 70 m.",
      exp: 22, tgn: 3, healPerPlant: 3.2, needsHealthy: true,
    },
    acacia: {
      name: "Acacia Senegal", emoji: "🌳", role: "tree", depthCm: 8, water: 2,
      fact: "Drought-hardy nitrogen fixer - the workhorse of the Great Green Wall.",
      exp: 18, tgn: 2, healPerPlant: 2.6, needsHealthy: true,
    },
    baobab: {
      mech: "fireproof", mechLabel: "🛡️ IRONBARK - saplings cannot burn",
      name: "Baobab", emoji: "🌳", role: "tree", depthCm: 10, water: 2,
      fact: "The 'Tree of Life' - stores thousands of litres of water, lives over a thousand years.",
      exp: 24, tgn: 4, healPerPlant: 3.4, needsHealthy: true,
    },
  },

  // --- NFT collectibles by rarity (proposal §6) ---
  rarities: {
    common:    { label: "Common Flora",   color: "#9ca3af", glow: "#9ca3af" },
    rare:      { label: "Rare Hemp Gear", color: "#3b82f6", glow: "#60a5fa" },
    epic:      { label: "Epic Badge",     color: "#a855f7", glow: "#c084fc" },
    legendary: { label: "1-of-1 Biome",   color: "#f59e0b", glow: "#fbbf24" },
  },

  // Starter market listings (seller "Treegen DAO" = bought from treasury).
  marketSeed: [
    { id: "n1", name: "Bioluminescent Fern", rarity: "common", emoji: "🌿", price: 40, seller: "Treegen DAO", kind: "cosmetic" },
    { id: "n2", name: "Dewdrop Sapling",     rarity: "common", emoji: "🌱", price: 55, seller: "Treegen DAO", kind: "cosmetic" },
    { id: "n3", name: "Hemp-Weave Cloak",    rarity: "rare",   emoji: "🧥", price: 180, seller: "RootRunner",  kind: "accessory" },
    { id: "n4", name: "Phyto Goggles",       rarity: "rare",   emoji: "🥽", price: 210, seller: "MyceliaMax",  kind: "accessory" },
    { id: "n5", name: "Mangrove Medal",      rarity: "epic",   emoji: "🎖️", price: 640, seller: "Treegen DAO", kind: "badge", provenance: "Practice-proof reward" },
    { id: "n6", name: "Carbon Crown",        rarity: "epic",   emoji: "👑", price: 720, seller: "GaiaGardener", kind: "badge" },
  ],

  // --- DAO: where does the General Fund deploy next? (proposal §7) ---
  daoRegions: [
    { id: "congo", name: "Congo Basin", flag: "🌍", pitch: "Second-largest rainforest; least funded." },
    { id: "philippines", name: "Philippines Mangroves", flag: "🇵🇭", pitch: "Typhoon shield for coastal villages." },
    { id: "madagascar", name: "Madagascar Spiny Forest", flag: "🇲🇬", pitch: "90% endemic species, 90% already lost." },
  ],

  // --- Carbon credit market (proposal §8) ---
  // ⛔ HIDDEN 2026-08-06: tonne-CO₂ figures breach the no-CO2-estimates rule and
  // the rising-price/P&L framing implies appreciation. Code kept; set true only
  // if Jimi rules the copy can be reworked to be non-numeric and consumptive.
  carbonMarketEnabled: false,

  // 1 credit = 1 tonne CO₂ removed. Price drifts up as simulated regulation tightens.
  carbon: {
    startPrice: 12, // USD per tonne
    note: "1 credit = 1 tonne CO₂ removed. Mangrove (blue-carbon) credits trade at a premium.",
    types: [
      { id: "forest", name: "Reforestation Credit", emoji: "🌳", premium: 1.0 },
      { id: "blue",   name: "Blue-Carbon (Mangrove)", emoji: "🌊", premium: 1.6 },
    ],
  },

  // EXP needed for each avatar evolution stage (proposal §2).
  evolution: [0, 60, 180, 400, 750, 1200], // index = stage; stage caps at last
  stageNames: ["Sprout", "Seedling", "Sapling", "Young Tree", "Elder", "World Tree"],
};
