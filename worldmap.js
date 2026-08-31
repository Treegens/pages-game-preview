// =============================================================================
// worldmap.js — the "digital mirror of the real world" (proposal §1).
// A stylized satellite-ops world map. Biomes are live hotspots at their true
// lat/lng, pulsing by health, feeding a central GROWalition hub. Pure SVG.
// =============================================================================

const WorldMap = (() => {
  const W = 1000, H = 500;
  const project = (lat, lng) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];

  // Soft stylized landmasses (translucent blobs at real centroids — atmosphere,
  // not an atlas). Each entry: [cx, cy, rx, ry].
  const LAND = [
    // North America
    [196,106,78,54],[166,80,44,28],[236,150,50,40],[150,150,26,38],
    // Greenland
    [380,52,28,24],
    // South America
    [330,300,48,72],[346,360,26,50],[308,246,34,36],
    // Europe
    [532,106,40,28],
    // Africa
    [558,262,66,90],[544,200,46,38],
    // Asia
    [726,116,116,58],[804,158,58,42],[648,150,48,34],[690,210,32,36],
    // SE Asia / Indonesia
    [802,254,48,20],
    // Australia
    [870,330,50,36],
  ];

  function landLayer() {
    return LAND.map(([cx, cy, rx, ry]) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#land)" />`).join("");
  }

  function graticule() {
    let g = "";
    for (let lng = -120; lng <= 120; lng += 60) {
      const x = ((lng + 180) / 360) * W;
      g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="grat"/>`;
    }
    for (let lat = 60; lat >= -60; lat -= 30) {
      const y = ((90 - lat) / 180) * H;
      g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="grat ${lat === 0 ? "equator" : ""}"/>`;
    }
    return g;
  }

  function arc(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 60;
    return `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
  }

  function hotspot(b, health, unlocked) {
    const [x, y] = project(b.coords[0], b.coords[1]);
    const r = 17, C = 2 * Math.PI * r;
    const off = C * (1 - health / 100);
    const col = b.color;
    const dim = unlocked ? "" : "locked";
    const nav = unlocked ? `data-go="biome" data-arg="${b.id}"` : "";
    return `
    <g class="hotspot ${dim}" ${nav} transform="translate(${x} ${y})" tabindex="0">
      ${unlocked ? `<circle class="ping" r="${r}" stroke="${col}"/>` : ""}
      <circle r="${r + 6}" class="hs-bg"/>
      <circle r="${r}" class="hs-track"/>
      <circle r="${r}" class="hs-ring" stroke="${col}"
              stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
      <circle r="6" fill="${unlocked ? col : "#3a4a40"}" class="hs-core"/>
      <text class="hs-flag" y="-26" text-anchor="middle">${unlocked ? b.flag : "🔒"}</text>
      <g class="hs-label" transform="translate(0 ${r + 18})">
        <rect x="-58" y="-12" width="116" height="22" rx="6" class="hs-pill"/>
        <text text-anchor="middle" y="3" class="hs-name">${b.name}</text>
      </g>
      <text class="hs-pct" y="4" text-anchor="middle">${unlocked ? Math.round(health) + "%" : ""}</text>
    </g>`;
  }

  // Render the whole map. `biomes` from CONFIG; reads live state via State.
  function svg() {
    const hub = [W / 2, H / 2 + 10];
    let arcs = "", spots = "";
    CONFIG.biomes.forEach((b) => {
      const h = State.biomeHealth(b.id);
      const unlocked = State.biomeUnlocked(b);
      const [x, y] = project(b.coords[0], b.coords[1]);
      if (unlocked) {
        arcs += `<path class="feed" d="${arc(x, y, hub[0], hub[1])}" stroke="${b.color}"/>`;
      }
      spots += hotspot(b, h, unlocked);
    });

    return `
    <svg class="worldmap" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="World reforestation map">
      <defs>
        <radialGradient id="ocean" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stop-color="#0e2a1c"/>
          <stop offset="100%" stop-color="#06140d"/>
        </radialGradient>
        <radialGradient id="land" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#1c4a30" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#123222" stop-opacity="0.12"/>
        </radialGradient>
        <radialGradient id="hub" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#86efac"/>
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="3.5"/></filter>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#ocean)"/>
      <g filter="url(#soft)">${landLayer()}</g>
      <g>${graticule()}</g>

      <!-- radar sweep around the hub -->
      <g transform="translate(${hub[0]} ${hub[1]})">
        <polygon class="radar" points="0,0 230,-26 230,26">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite"/>
        </polygon>
      </g>

      <g class="feeds">${arcs}</g>

      <!-- central GROWalition hub (label rendered as a caption below the map) -->
      <g transform="translate(${hub[0]} ${hub[1]})">
        <circle r="46" fill="url(#hub)" class="hub-glow"/>
        <circle r="10" fill="#22c55e" class="hub-core"/>
      </g>

      ${spots}
    </svg>`;
  }

  return { svg };
})();
