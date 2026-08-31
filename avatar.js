// =============================================================================
// avatar.js — procedural "nature-punk" avatar NFT, rendered as SVG.
// Evolves with EXP stage: more leaves, flowers, bioluminescence, a crown.
// (proposal §2 — evolution is earned by reforestation, never bought.)
// =============================================================================

const Avatar = (() => {
  // Deterministic pseudo-random from a seed (so each avatar is stable & unique).
  function rng(seed) {
    let x = seed * 9301 + 49297;
    return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  }

  function leaf(cx, cy, r, rot, fill, glow) {
    return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
      <path d="M0 0 C ${r*0.6} ${-r*0.5}, ${r*0.6} ${-r*1.1}, 0 ${-r*1.4}
               C ${-r*0.6} ${-r*1.1}, ${-r*0.6} ${-r*0.5}, 0 0 Z"
            fill="${fill}" ${glow ? `filter="url(#glow)"` : ""} opacity="0.95"/>
      <line x1="0" y1="0" x2="0" y2="${-r*1.3}" stroke="${glow||'#0a3a1f'}" stroke-width="1" opacity="0.5"/>
    </g>`;
  }

  function flower(cx, cy, r, color) {
    let petals = "";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      petals += `<ellipse cx="${cx + Math.cos(a)*r}" cy="${cy + Math.sin(a)*r}" rx="${r*0.7}" ry="${r*0.4}"
                 transform="rotate(${(a*180/Math.PI)} ${cx + Math.cos(a)*r} ${cy + Math.sin(a)*r})"
                 fill="${color}" opacity="0.92"/>`;
    }
    return `<g>${petals}<circle cx="${cx}" cy="${cy}" r="${r*0.5}" fill="#fde047"/></g>`;
  }

  // stage 0..5 ; hue rotates the leaf greens; accent colors flowers/glow.
  // Appearance fields are interpolated into SVG markup, so they must be
  // numbers or a hex color. Hostile saves / restored codes cannot break out.
  function svg(opts = {}) {
    const hueN = Number(opts.hue);
    const hue = Number.isFinite(hueN) ? Math.min(360, Math.max(0, hueN)) : 130;
    const accent = typeof opts.accent === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(opts.accent) ? opts.accent : "#fbbf24";
    const seedN = Number(opts.seed);
    const seed = Number.isFinite(seedN) ? seedN : 7;
    const stageN = Number(opts.stage);
    const stage = Number.isFinite(stageN) ? Math.max(0, Math.min(5, Math.round(stageN))) : 0;
    const sizeN = Number(opts.size);
    const size = Number.isFinite(sizeN) ? Math.max(8, Math.min(1024, sizeN)) : 220;
    const rand = rng(seed + stage);
    const base = `hsl(${hue} 60% 35%)`;
    const bright = `hsl(${hue} 70% 55%)`;
    const skin = `hsl(${hue} 30% 28%)`;

    // Body: a rounded root-creature with vine arms.
    let body = `
      <ellipse cx="110" cy="150" rx="46" ry="52" fill="${skin}"/>
      <ellipse cx="110" cy="150" rx="46" ry="52" fill="url(#bark)" opacity="0.35"/>
      <circle cx="94" cy="138" r="7" fill="#0b1f12"/>
      <circle cx="126" cy="138" r="7" fill="#0b1f12"/>
      <circle cx="96" cy="136" r="2.5" fill="${stage>=3?accent:'#bfffd6'}"/>
      <circle cx="128" cy="136" r="2.5" fill="${stage>=3?accent:'#bfffd6'}"/>
      <path d="M98 160 Q110 ${168 + stage} 122 160" stroke="#0b1f12" stroke-width="3" fill="none" stroke-linecap="round"/>
    `;

    // Canopy of leaves on the head — grows with stage.
    const leafCount = 3 + stage * 3;
    let canopy = "";
    for (let i = 0; i < leafCount; i++) {
      const t = i / (leafCount - 1 || 1);
      const angle = -120 + t * 240;
      const r = 26 + rand() * 14 + stage * 2;
      const px = 110 + Math.sin((angle * Math.PI) / 180) * 8;
      const py = 104 - Math.cos((angle * Math.PI) / 180) * 4;
      const glow = stage >= 2 && i % 2 === 0 ? accent : null;
      const fill = i % 3 === 0 ? bright : base;
      canopy += leaf(px, py, r, angle, fill, glow);
    }

    // Flowers appear from stage 2; more each stage.
    let flowers = "";
    const fCount = Math.max(0, stage - 1) * 2;
    for (let i = 0; i < fCount; i++) {
      const a = rand() * Math.PI * 2;
      const rr = 30 + rand() * 28;
      flowers += flower(110 + Math.cos(a) * rr, 100 + Math.sin(a) * rr * 0.7, 5 + rand() * 3, i % 2 ? accent : "#fb7185");
    }

    // Crown / halo at the final World Tree stage.
    let crown = "";
    if (stage >= 5) {
      crown = `<g filter="url(#glow)">
        <circle cx="110" cy="92" r="64" fill="none" stroke="${accent}" stroke-width="2" opacity="0.5"/>
        <path d="M86 70 L94 52 L102 68 L110 48 L118 68 L126 52 L134 70 Z" fill="${accent}" opacity="0.9"/>
      </g>`;
    }

    // Roots at the base.
    let roots = "";
    for (let i = 0; i < 5; i++) {
      const x = 78 + i * 16;
      roots += `<path d="M${x} 196 Q${x + (rand()*10-5)} 212 ${x + (rand()*16-8)} 220"
                stroke="${skin}" stroke-width="${4 - i%2}" fill="none" stroke-linecap="round"/>`;
    }

    return `
    <svg viewBox="0 0 220 230" width="${size}" height="${size*230/220}" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <radialGradient id="bark" cx="0.5" cy="0.3" r="0.8">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${roots}
      ${body}
      ${canopy}
      ${flowers}
      ${crown}
    </svg>`;
  }

  return { svg };
})();
