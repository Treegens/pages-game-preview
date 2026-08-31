// =============================================================================
// character3d.js — the key characters, in real 3D (Three.js, local build).
// A procedural "Treegen": a root-sprite of woven golden strands with a
// bioluminescent leaf canopy, big glossy eyes, and the golden $TGN coin —
// modelled on the four reference renders. Evolves with avatar stage 0–5.
//
// API:  const h = Char3D.mount(container, {stage, hue, accent, coin, interactive})
//       h.setStage(n) · h.setLook({hue, accent}) · h.dispose()
//       Char3D.disposeAll() — call before any full re-render.
// =============================================================================

const Char3D = (() => {
  const mounts = new Set();
  const ok = () => typeof THREE !== "undefined" && (!window.Launch || Launch.webglOk());

  // ---- $TGN coin face: gold disc + palm-tree "T" glyph, drawn on canvas ----
  function coinTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(110, 100, 20, 128, 128, 150);
    g.addColorStop(0, "#ffe36a"); g.addColorStop(1, "#f0b90b");
    x.fillStyle = g;
    x.beginPath(); x.arc(128, 128, 127, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#c9970a"; x.lineWidth = 12;
    x.beginPath(); x.arc(128, 128, 116, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = "#8a6503"; x.lineCap = "round"; x.lineWidth = 20;
    x.beginPath(); x.moveTo(128, 200); x.lineTo(128, 118); x.stroke();      // trunk
    x.beginPath(); x.moveTo(86, 118); x.lineTo(170, 118); x.stroke();       // bar
    x.lineWidth = 16;
    [[-44, -22], [-24, -40], [0, -48], [24, -40], [44, -22]].forEach(([dx, dy]) => {
      x.beginPath(); x.moveTo(128, 102); x.lineTo(128 + dx, 102 + dy); x.stroke(); // fronds
    });
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // Deterministic rng so a given seed always grows the same body.
  function rng(seed) {
    let v = seed * 9301 + 49297;
    return () => { v = (v * 9301 + 49297) % 233280; return v / 233280; };
  }

  // ---- build one character into a THREE.Group ----
  function buildCharacter({ stage, hue, accent, coin, seed, elder }) {
    const rand = rng((seed || 7) + stage * 13);
    const root = new THREE.Group();
    const leafCol = new THREE.Color(`hsl(${hue}, 75%, 58%)`);
    const leafDim = new THREE.Color(`hsl(${hue}, 60%, 38%)`);
    const glowCol = new THREE.Color(accent);
    const strandCol = new THREE.Color(elder ? "#c9a25a" : "#d9c06a");
    const strandMat = new THREE.MeshStandardMaterial({ color: strandCol, roughness: 0.55, metalness: 0.08 });
    const dispose = [];

    // --- moss mound + dark water ---
    const moundGeo = new THREE.SphereGeometry(1.15, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = moundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.02) {
        pos.setX(i, pos.getX(i) + (rand() - 0.5) * 0.09);
        pos.setZ(i, pos.getZ(i) + (rand() - 0.5) * 0.09);
        pos.setY(i, y + (rand() - 0.5) * 0.07);
      }
    }
    moundGeo.computeVertexNormals();
    const mound = new THREE.Mesh(moundGeo, new THREE.MeshStandardMaterial({ color: "#3d6626", roughness: 1 }));
    mound.scale.set(0.82, 0.34, 0.82);
    root.add(mound);
    dispose.push(moundGeo, mound.material);

    // A small reflective water pool ringing the mound. Kept teal + translucent
    // and slightly smaller so it reads as water, not a black disc (the old
    // #07130c at metalness .85 rendered as a black void around the character).
    const waterGeo = new THREE.CircleGeometry(2.9, 48);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: "#0e5c4a", roughness: 0.22, metalness: 0.5,
      transparent: true, opacity: 0.72,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.005;
    root.add(water);
    dispose.push(waterGeo, water.material);

    // --- body: a sheaf of wavy root strands from mound to neck ---
    const body = new THREE.Group();
    const strandCount = (elder ? 16 : 10) + stage * 4;
    const neckY = elder ? 1.22 : 1.05;
    for (let i = 0; i < strandCount; i++) {
      const a = (i / strandCount) * Math.PI * 2 + rand() * 0.5;
      const spread = 0.34 + rand() * 0.3;
      const wob = 0.10 + rand() * 0.14;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const r = spread * (1 - t * 0.82);
        pts.push(new THREE.Vector3(
          Math.cos(a) * r + Math.sin(t * Math.PI * 2 + i) * wob * t,
          0.12 + t * neckY,
          Math.sin(a) * r + Math.cos(t * Math.PI * 1.6 + i) * wob * t
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.028 + rand() * 0.025, 5);
      body.add(new THREE.Mesh(tubeGeo, strandMat));
      dispose.push(tubeGeo);
    }
    // a few stray root tendrils onto the moss
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25),
        new THREE.Vector3(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6),
        new THREE.Vector3(Math.cos(a) * (0.8 + rand() * 0.4), 0.02, Math.sin(a) * (0.8 + rand() * 0.4)),
      ]);
      const tGeo = new THREE.TubeGeometry(curve, 8, 0.02, 4);
      body.add(new THREE.Mesh(tGeo, strandMat));
      dispose.push(tGeo);
    }
    root.add(body);
    dispose.push(strandMat);

    // --- head ---
    const head = new THREE.Group();
    head.position.y = neckY + 0.42;
    const skullGeo = new THREE.SphereGeometry(0.46, 28, 22);
    const skullMat = new THREE.MeshStandardMaterial({ color: "#cfb469", roughness: 0.6 });
    head.add(new THREE.Mesh(skullGeo, skullMat));
    dispose.push(skullGeo, skullMat);

    // eyes — big, black, glossy, with a catchlight
    const eyeGeo = new THREE.SphereGeometry(0.105, 18, 14);
    const eyeMat = new THREE.MeshStandardMaterial({ color: "#0b0f0a", roughness: 0.05, metalness: 0.2 });
    const dotGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: "#eafff0" });
    const eyes = [];
    [-0.17, 0.17].forEach((dx) => {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(dx, 0.03, 0.40);
      e.scale.z = 0.6;
      head.add(e); eyes.push(e);
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(dx + 0.035, 0.075, 0.485);
      head.add(d);
    });
    dispose.push(eyeGeo, eyeMat, dotGeo, dotMat);

    // gentle smile
    const smileGeo = new THREE.TorusGeometry(0.09, 0.014, 6, 16, Math.PI * 0.8);
    const smileMat = new THREE.MeshBasicMaterial({ color: "#4a3218" });
    const smile = new THREE.Mesh(smileGeo, smileMat);
    smile.position.set(0, -0.13, 0.42);
    smile.rotation.z = Math.PI + 0.35;
    head.add(smile);
    dispose.push(smileGeo, smileMat);

    // --- canopy: glowing clover-leaves on wiry stems, denser with stage ---
    const canopy = new THREE.Group();
    const leafCount = 26 + stage * 22;
    const leafGeo = new THREE.SphereGeometry(0.068, 8, 6);
    const leafMatBright = new THREE.MeshStandardMaterial({
      color: leafCol, emissive: leafCol, emissiveIntensity: 0.35 + stage * 0.1, roughness: 0.5,
    });
    const leafMatDim = new THREE.MeshStandardMaterial({ color: leafDim, roughness: 0.7 });
    for (let i = 0; i < leafCount; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = rand() * Math.PI * 0.55;                  // upper hemisphere
      const r = 0.5 + rand() * (0.22 + stage * 0.06);
      const leaf = new THREE.Mesh(leafGeo, i % 3 ? leafMatBright : leafMatDim);
      leaf.position.set(
        Math.sin(phi) * Math.cos(theta) * r,
        0.25 + Math.cos(phi) * r * 0.8,
        Math.sin(phi) * Math.sin(theta) * r
      );
      leaf.scale.set(1, 0.45, 1.5);
      leaf.rotation.set(rand() * 2, rand() * 2, rand() * 2);
      canopy.add(leaf);
      // wiry stem back to the skull
      const stemGeo = new THREE.CylinderGeometry(0.0045, 0.0045, leaf.position.length() * 0.5, 3);
      const stem = new THREE.Mesh(stemGeo, strandMat);
      stem.position.copy(leaf.position).multiplyScalar(0.62);
      stem.lookAt(leaf.position);
      stem.rotateX(Math.PI / 2);
      canopy.add(stem);
      dispose.push(stemGeo);
    }
    head.add(canopy);
    dispose.push(leafGeo, leafMatBright, leafMatDim);

    // bioluminescent glow from within the canopy
    const glow = new THREE.PointLight(glowCol, 6 + stage * 3, 4, 2);
    glow.position.set(0, 0.45, 0.1);
    head.add(glow);

    // stage 3+: golden berries in the canopy; stage 5: crown ring
    if (stage >= 3) {
      const berryGeo = new THREE.SphereGeometry(0.045, 10, 8);
      const berryMat = new THREE.MeshStandardMaterial({
        color: "#ffd94d", emissive: "#ffb200", emissiveIntensity: 0.9, roughness: 0.3,
      });
      for (let i = 0; i < (stage - 2) * 4; i++) {
        const b = new THREE.Mesh(berryGeo, berryMat);
        const a2 = rand() * Math.PI * 2;
        b.position.set(Math.cos(a2) * 0.55, 0.2 + rand() * 0.5, Math.sin(a2) * 0.55);
        head.add(b);
      }
      dispose.push(berryGeo, berryMat);
    }
    if (stage >= 5 || elder) {
      const ringGeo = new THREE.TorusGeometry(0.62, 0.02, 8, 40);
      const ringMat = new THREE.MeshStandardMaterial({
        color: glowCol, emissive: glowCol, emissiveIntensity: 1.4, roughness: 0.2,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.15;
      ring.position.y = 0.75;
      head.add(ring);
      dispose.push(ringGeo, ringMat);
    }
    root.add(head);

    // --- elder (Jimi): a gnarled staff with a bioluminescent seed at its tip ---
    if (elder) {
      const staffCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.55, 0.02, 0.25),
        new THREE.Vector3(0.62, 0.8, 0.28),
        new THREE.Vector3(0.55, 1.55, 0.22),
        new THREE.Vector3(0.62, 1.85, 0.30),
      ]);
      const staffGeo = new THREE.TubeGeometry(staffCurve, 14, 0.035, 6);
      root.add(new THREE.Mesh(staffGeo, strandMat));
      const seedGeo = new THREE.SphereGeometry(0.09, 14, 10);
      const seedMat = new THREE.MeshStandardMaterial({
        color: glowCol, emissive: glowCol, emissiveIntensity: 2.2, roughness: 0.15,
      });
      const seedTip = new THREE.Mesh(seedGeo, seedMat);
      seedTip.position.set(0.62, 1.95, 0.30);
      root.add(seedTip);
      const staffLight = new THREE.PointLight(glowCol, 5, 2.5, 2);
      staffLight.position.copy(seedTip.position);
      root.add(staffLight);
      dispose.push(staffGeo, seedGeo, seedMat);
    }

    // --- the $TGN coin, held in front with two root hands ---
    let coinMesh = null;
    if (coin) {
      const tex = coinTexture();
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.55 });
      const edge = new THREE.MeshStandardMaterial({ color: "#d8a20a", roughness: 0.35, metalness: 0.75 });
      const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 44);
      coinMesh = new THREE.Mesh(coinGeo, [edge, face, face]);
      coinMesh.rotation.x = Math.PI / 2;
      coinMesh.position.set(0, 0.72, 0.52);
      root.add(coinMesh);
      dispose.push(coinGeo, face, edge, tex);
      // two little arms curling around the coin
      [-1, 1].forEach((side) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.30, 0.95, 0.10),
          new THREE.Vector3(side * 0.42, 0.80, 0.38),
          new THREE.Vector3(side * 0.26, 0.66, 0.56),
        ]);
        const armGeo = new THREE.TubeGeometry(curve, 8, 0.035, 5);
        root.add(new THREE.Mesh(armGeo, strandMat));
        dispose.push(armGeo);
      });
    }

    return { root, head, eyes, coinMesh, canopy, glow, dispose };
  }

  // ---- fireflies (bokeh) ----
  function buildFireflies(count) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const basePositions = [];
    for (let i = 0; i < count; i++) {
      const p = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        0.3 + Math.random() * 3.2,
        -1.2 - Math.random() * 3.5
      );
      basePositions.push(p);
      positions.set([p.x, p.y, p.z], i * 3);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: "#ffd966", size: 0.14, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    return { points: new THREE.Points(geo, mat), basePositions, geo, mat };
  }

  // ---- mount a live character into a DOM container ----
  function mount(container, opts = {}) {
    if (!ok() || !container) return null;
    const o = { stage: 0, hue: 130, accent: "#fbbf24", coin: true, interactive: true, seed: 7, elder: false, preserve: false, ...opts };

    const w = container.clientWidth || 300;
    const h = container.clientHeight || w;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: o.preserve });
    } catch (e) {
      if (window.Launch) Launch.noteFailure("context");
      return null;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06140d, 6, 12);
    const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 30);
    cam.position.set(0, 1.3, 3.9);
    cam.lookAt(0, 1.02, 0);

    // lights: warm key, green rim, soft ambient
    scene.add(new THREE.AmbientLight(0x2a3d2c, 1.6));
    const key = new THREE.DirectionalLight(0xfff2cc, 2.4);
    key.position.set(1.6, 3.2, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.bias = -0.002;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3dff88, 1.1);
    rim.position.set(-2.5, 1.8, -2.5);
    scene.add(rim);

    // meshes cast; mound & water receive — grounded, cinematic
    function applyShadows(c2) {
      c2.root.traverse((m) => {
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
    }

    let char = buildCharacter(o);
    applyShadows(char);
    scene.add(char.root);
    const flies = buildFireflies(46);
    scene.add(flies.points);

    // drag to orbit
    let dragX = 0, dragging = false, lastX = 0;
    function onDown(e) { dragging = true; lastX = (e.touches ? e.touches[0] : e).clientX; }
    function onMove(e) {
      if (!dragging) return;
      const x = (e.touches ? e.touches[0] : e).clientX;
      dragX += (x - lastX) * 0.012;
      lastX = x;
    }
    function onUp() { dragging = false; }
    if (o.interactive) {
      renderer.domElement.style.cursor = "grab";
      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    let raf = 0, dead = false, blinkAt = 1.6;
    const t0 = performance.now();
    function tick() {
      if (dead) return;
      const t = (performance.now() - t0) / 1000;
      // idle: sway + breathe + slow auto-orbit blended with drag
      char.root.rotation.y = dragX + (dragging ? 0 : Math.sin(t * 0.25) * 0.25);
      char.root.rotation.z = Math.sin(t * 0.8) * 0.02;
      char.head.position.y = 1.47 + Math.sin(t * 1.3) * 0.02;
      char.canopy.rotation.y = Math.sin(t * 0.5) * 0.06;
      char.glow.intensity = (6 + o.stage * 3) * (1 + Math.sin(t * 2.2) * 0.18);
      if (char.coinMesh) {
        char.coinMesh.position.y = 0.72 + Math.sin(t * 1.6) * 0.025;
        char.coinMesh.rotation.z = Math.sin(t * 0.9) * 0.08;
      }
      // blink
      if (t > blinkAt) {
        const k = (t - blinkAt) / 0.14;
        const s = k < 1 ? Math.abs(1 - k * 2) : 1;
        char.eyes.forEach((e) => (e.scale.y = Math.max(0.08, s)));
        if (k >= 1) blinkAt = t + 2 + Math.random() * 2.5;
      }
      // fireflies drift
      const pa = flies.geo.attributes.position;
      flies.basePositions.forEach((p, i) => {
        pa.setXYZ(i,
          p.x + Math.sin(t * 0.4 + i) * 0.25,
          p.y + Math.sin(t * 0.6 + i * 1.7) * 0.18,
          p.z + Math.cos(t * 0.3 + i) * 0.2);
      });
      pa.needsUpdate = true;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    }
    tick();

    function swap(newOpts) {
      Object.assign(o, newOpts);
      scene.remove(char.root);
      char.dispose.forEach((d) => d.dispose && d.dispose());
      char = buildCharacter(o);
      applyShadows(char);
      scene.add(char.root);
    }

    const handle = {
      setStage: (n) => swap({ stage: n }),
      setLook: (look) => swap(look),
      dispose() {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        if (o.interactive) {
          renderer.domElement.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        }
        char.dispose.forEach((d) => d.dispose && d.dispose());
        flies.geo.dispose(); flies.mat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        mounts.delete(handle);
      },
    };
    mounts.add(handle);
    return handle;
  }

  function disposeAll() { [...mounts].forEach((m) => m.dispose()); }

  return {
    mount, disposeAll, ok,
    // raw character build for embedding in other scenes (third-person world)
    build: (o) => buildCharacter({ stage: 0, hue: 130, accent: "#fbbf24", coin: true, seed: 7, elder: false, ...o }),
  };
})();
window.Char3D = Char3D;
