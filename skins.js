// =============================================================================
// skins.js - the demo flex layer. Skins reflect practice-proof milestones and
// show on your avatar and the deterministic in-game rivals ladder.
// Cosmetic only (frame glow + badge + title); it never gates gameplay - it
// gates BRAGGING RIGHTS, which is the point.
// =============================================================================

const Skins = (() => {
  // Tiers currently unlock on practice-proof milestones, not verified trees.
  const TIERS = [
    { min: 0,    key: "seedling", name: "Seedling",      badge: "🌱", glow: "#6b7a61", ring: "#3d4a38" },
    { min: 1,    key: "sprout",   name: "Sprout",        badge: "🌿", glow: "#7dffa8", ring: "#2f8f52" },
    { min: 5,    key: "grove",    name: "Grove Keeper",  badge: "🌳", glow: "#34d399", ring: "#0e9f6e" },
    { min: 25,   key: "canopy",   name: "Canopy Lord",   badge: "🏵️", glow: "#fbbf24", ring: "#d99a1a" },
    { min: 100,  key: "elder",    name: "Elder Ent",     badge: "👑", glow: "#a78bfa", ring: "#7c5cf0" },
    { min: 500,  key: "mythic",   name: "Mythic Warden", badge: "💎", glow: "#22d3ee", ring: "#0891b2" },
  ];

  function tierFor(realTrees) {
    let t = TIERS[0];
    for (const x of TIERS) if ((realTrees || 0) >= x.min) t = x;
    return t;
  }
  function nextTier(realTrees) {
    return TIERS.find((x) => x.min > (realTrees || 0)) || null;
  }
  // A small chip you can drop next to any name to show their skin.
  function chip(realTrees, opts) {
    const t = tierFor(realTrees);
    const sz = (opts && opts.size) || 20;
    return `<span class="skin-chip" title="${t.name} - ${realTrees || 0} practice-proof trees" style="--sg:${t.glow};--sr:${t.ring};width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.62)}px">${t.badge}</span>`;
  }

  return { TIERS, tierFor, nextTier, chip };
})();
