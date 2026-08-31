// =============================================================================
// world3d.js — EXPLORE MODE: a first-person, walkable open world.
// Real-time "cinematic" rendering: ACES filmic tonemapping, dynamic sun with
// soft shadows, procedural fBm terrain with slope-based coloring, a pond,
// thousands of instanced trees + grass blades, drifting clouds, pollen motes,
// birds — and your own grove standing in the central clearing, verified trees
// burning gold. WASD/mouse (pointer lock) on desktop, twin-touch on mobile.
//
// API: World3D.open()  — fullscreen overlay; ESC/✕ to exit (auto-disposes)
// =============================================================================

const World3D = (() => {
  let active = null;

  // ---------------- procedural noise (value-noise fBm) ----------------
  function makeNoise(seed) {
    const perm = new Uint8Array(512);
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const p = [...Array(256).keys()].sort(() => rnd() - 0.5);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = (t) => t * t * (3 - 2 * t);
    function val(ix, iz) { return perm[(ix + perm[iz & 255]) & 255] / 255; }
    function noise(x, z) {
      const ix = Math.floor(x), iz = Math.floor(z);
      const fx = fade(x - ix), fz = fade(z - iz);
      const a = val(ix, iz), b = val(ix + 1, iz), c = val(ix, iz + 1), d = val(ix + 1, iz + 1);
      return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
    }
    return (x, z, oct = 4) => {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += noise(x * freq, z * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2.1;
      }
      return sum / norm;
    };
  }

  // ---------------- canvas textures (sky, sun, cloud) ----------------
  function skyTexture() {
    const c = document.createElement("canvas"); c.width = 4; c.height = 512;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, "#0e2a52");
    g.addColorStop(0.36, "#4a7cab");
    g.addColorStop(0.47, "#d9b07c");
    g.addColorStop(0.53, "#f0bd74");
    g.addColorStop(0.62, "#8a6a42");
    g.addColorStop(1.0, "#241b12");
    x.fillStyle = g; x.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c);
    return t;
  }
  function radialSprite(inner, outer, size = 128) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  function cloudSprite() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    const x = c.getContext("2d");
    for (let i = 0; i < 22; i++) {
      const g = x.createRadialGradient(0,0,2, 0,0, 26 + Math.random()*22);
      g.addColorStop(0, "rgba(255,246,232,0.16)"); g.addColorStop(1, "rgba(255,246,232,0)");
      x.save();
      x.translate(40 + Math.random()*176, 40 + Math.random()*48);
      x.fillStyle = g; x.beginPath(); x.arc(0,0,50,0,Math.PI*2); x.fill();
      x.restore();
    }
    return new THREE.CanvasTexture(c);
  }

  class World {
    constructor() {
      this.dispose = [];
      if (window.Ambience) { Ambience.start(); Ambience.setScene("world"); }
      this.buildDOM();
      this.buildScene();
      this.buildTerrain();
      this.buildForest();
      this.buildGrove();
      this.buildSkyBits();
      this.buildAvatar();
      this.buildSap();
      this.buildInput();
      // in-world gameplay state: sky-fall seed storms + collectibles
      // Continuous loop: seeds ALWAYS fall (light rain), and waves surge on top.
      // Dead air was the game's biggest problem, so there is no longer any.
      this.storm = { wave: 0, inWave: false, nextWave: 12, waveEnd: 0, score: 0,
                     combo: 0, mult: 1, fever: 0, caught: [], tSpawn: 0, airborne: 0, best: 0 };
      this.stam = 100;                       // sprint is a resource, not a toggle
      this.obj = null; this.objDone = 0;
      this.falling = [];
      this.stormTrees = [];
      this.vy = 0; this.jumpY = 0; this.wantJump = false; this.grounded = true; this.camShake = 0; this.hurt = 0;
      this.applyQuality(localStorage.getItem("tg_quality") || "hi");
      this.visited = new Set();
      this.clock = { last: performance.now(), t: 0 };
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    // ---------------- DOM ----------------
    buildDOM() {
      this.el = document.createElement("div");
      this.el.className = "world3d";
      this.el.innerHTML = `
        <canvas></canvas>
        <div class="w3-hud">
          <div class="w3-hint" id="w3-hint">🖱️ look · WASD · JUMP for a mid-air catch (3x) · ⇧ sprint · M menus</div>
          <div class="w3-hurt" id="w3-hurt"></div>
          <div class="w3-stats" id="w3-stats"></div>
          <div class="w3-obj" id="w3-obj"></div>
          <div class="w3-stam"><div id="w3-stam-fill"></div></div>
          <button class="w3-exit" id="w3-exit" aria-label="Exit explore mode">✕</button>
          <button class="w3-exit w3-quality" id="w3-quality" title="Graphics quality (HI/LO)" aria-label="Toggle graphics quality">✨</button>
          <button type="button" class="w3-jump" id="w3-jump" hidden aria-label="Jump">JUMP</button>
          <button class="w3-plant" id="w3-plant" style="display:none">🌱 PLANT HERE <small>(E)</small></button>
        </div>
        <div class="w3-stick" id="w3-stick"><div class="w3-knob"></div></div>`;
      document.body.appendChild(this.el);
      this.cv = this.el.querySelector("canvas");
      this.el.querySelector("#w3-exit").onclick = () => this.close();
      this.plantBtn = this.el.querySelector("#w3-plant");
      this.plantBtn.onclick = () => this.startRun();
      this.qBtn = this.el.querySelector("#w3-quality");
      this.qBtn.onclick = () => this.applyQuality(this.quality === "lo" ? "hi" : "lo");
    }

    // LO: no shadows, no grass, 1x pixels — keeps weak phones at 60fps
    applyQuality(q) {
      this.quality = q;
      try { localStorage.setItem("tg_quality", q); } catch (e) {}
      const lo = q === "lo";
      this.renderer.setPixelRatio(lo ? 1 : Math.min(2, devicePixelRatio || 1));
      this.renderer.setSize(innerWidth, innerHeight);
      if (this.grass) this.grass.visible = !lo;
      this.sun.castShadow = !lo;
      if (this.qBtn) this.qBtn.textContent = lo ? "🍃" : "✨";
    }

    // ---------------- renderer / scene / light ----------------
    buildScene() {
      const W = innerWidth, H = innerHeight;
      let r;
      try {
        r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: true, preserveDrawingBuffer: !!window.__previewKeepBuffer });
      } catch (e) {
        if (window.Launch) Launch.noteFailure("context");
        throw e;
      }
      r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      r.setSize(W, H);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;      // filmic — the "engine look"
      r.toneMappingExposure = 1.12;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0xb7a98a, 0.0072); // warm atmospheric haze
      this.cam = new THREE.PerspectiveCamera(70, W / H, 0.1, 900);

      // golden-hour sun with soft shadows
      const sun = this.sun = new THREE.DirectionalLight(0xffdcae, 3.4);
      sun.position.set(-90, 62, -40);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -90; sc.right = sc.top = 90; sc.far = 400;
      sun.shadow.bias = -0.0004;
      this.scene.add(sun, sun.target);

      this.hemi = new THREE.HemisphereLight(0x9db8d9, 0x4a3d26, 1.1);
      this.scene.add(this.hemi);
      const bounce = new THREE.DirectionalLight(0x86efac, 0.25);
      bounce.position.set(60, 20, 80);
      this.scene.add(bounce);

      // sky dome
      const skyGeo = new THREE.SphereGeometry(760, 24, 16);
      const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
      this.scene.add(sky);
      this.dispose.push(skyGeo, sky.material, sky.material.map);

      // sun disc + glow sprite
      const sunTex = radialSprite("rgba(255,242,214,1)", "rgba(255,214,140,0)");
      const sunSpr = this.sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, transparent: true, opacity: 0.85 }));
      sunSpr.scale.set(110, 110, 1);
      sunSpr.position.copy(sun.position).multiplyScalar(6);
      this.scene.add(sunSpr);
      this.dispose.push(sunTex, sunSpr.material);

      // moon + stars — the night half of the cycle
      const moonTex = radialSprite("rgba(214,226,255,0.95)", "rgba(180,200,255,0)");
      const moon = this.moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, opacity: 0 }));
      moon.scale.set(70, 70, 1);
      moon.position.copy(sun.position).multiplyScalar(-6);
      moon.position.y = Math.abs(moon.position.y);
      this.scene.add(moon);
      this.dispose.push(moonTex, moon.material);

      const starGeo = new THREE.BufferGeometry();
      const sp = new Float32Array(500 * 3);
      for (let i = 0; i < 500; i++) {
        const a = Math.random() * Math.PI * 2, e2 = 0.12 + Math.random() * 1.35;
        const R = 700;
        sp.set([Math.cos(a) * Math.cos(e2) * R, Math.sin(e2) * R, Math.sin(a) * Math.cos(e2) * R], i * 3);
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xdde8ff, size: 1.7, transparent: true, opacity: 0, fog: false, sizeAttenuation: false });
      this.stars = new THREE.Points(starGeo, starMat);
      this.scene.add(this.stars);
      this.dispose.push(starGeo, starMat);

      this.skyMesh = sky;
      this.dayFog = new THREE.Color(0xb7a98a);
      this.nightFog = new THREE.Color(0x0a1626);
      this.dayT = 0.06; // start mid-morning golden hour

      this.onResize = () => {
        this.cam.aspect = innerWidth / innerHeight;
        this.cam.updateProjectionMatrix();
        r.setSize(innerWidth, innerHeight);
      };
      addEventListener("resize", this.onResize);
    }

    // ---------------- terrain + pond ----------------
    buildTerrain() {
      this.noise = makeNoise(1337);
      const SIZE = this.SIZE = 420, SEG = 130;
      this.waterY = -1.4;
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const cGrass = new THREE.Color("#5a7d3a"), cMoss = new THREE.Color("#39592c"),
            cDirt = new THREE.Color("#6e5537"), cRock = new THREE.Color("#7a7468"),
            cSand = new THREE.Color("#a09067");
      this.height = (x, z) => {
        const d = Math.hypot(x, z);
        let h = (this.noise(x * 0.012 + 9, z * 0.012 + 7, 5) - 0.45) * 26;
        h += (this.noise(x * 0.05, z * 0.05, 3) - 0.5) * 3;         // detail
        h *= Math.min(1, d / 26) * 0.9 + 0.1;                        // flatten the clearing
        const pd = Math.hypot(x - 78, z + 52);                       // pond basin
        if (pd < 34) h = Math.min(h, -2.6 + (pd / 34) * 3.2);
        return h;
      };
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = this.height(x, z);
        pos.setY(i, h);
        // slope estimate for rock coloring
        const s = Math.abs(this.height(x + 2, z) - h) + Math.abs(this.height(x, z + 2) - h);
        if (h < this.waterY + 0.7) c.copy(cSand);
        else if (s > 2.1) c.copy(cRock);
        else if (h > 9) c.lerpColors(cGrass, cRock, Math.min(1, (h - 9) / 9));
        else c.lerpColors(cMoss, cGrass, this.noise(x * 0.03, z * 0.03, 2));
        if (h >= this.waterY + 0.7 && s <= 2.1) c.lerp(cDirt, Math.max(0, Math.min(0.35, (s - 0.9) * 0.5)));
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
      const ground = new THREE.Mesh(geo, mat);
      ground.receiveShadow = true;
      this.scene.add(ground);
      this.dispose.push(geo, mat);

      // pond
      const wGeo = new THREE.CircleGeometry(40, 40);
      const wMat = new THREE.MeshStandardMaterial({
        color: "#2e6a86", roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.86,
      });
      this.water = new THREE.Mesh(wGeo, wMat);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.set(78, this.waterY, -52);
      this.scene.add(this.water);
      this.dispose.push(wGeo, wMat);
    }

    // ---------------- instanced wild forest + grass ----------------
    buildForest() {
      const N = this.noise;
      const dummy = new THREE.Object3D();
      const spots = [];
      for (let i = 0; i < 4200 && spots.length < 1150; i++) {
        const x = (Math.random() - 0.5) * this.SIZE * 0.92;
        const z = (Math.random() - 0.5) * this.SIZE * 0.92;
        const d = Math.hypot(x, z);
        if (d < 26) continue;                                  // keep the clearing open
        if (Math.hypot(x - 78, z + 52) < 44) continue;         // not in the pond
        const h = this.height(x, z);
        if (h < this.waterY + 0.6 || h > 15) continue;
        if (N(x * 0.02 + 3, z * 0.02, 3) < 0.42) continue;     // forest patches, not uniform
        spots.push({ x, z, h });
      }

      // slight emissive floor so canopy undersides read as deep green, not black
      const trunkMat = new THREE.MeshStandardMaterial({ color: "#5d452a", roughness: 0.95 });
      const pineMat = new THREE.MeshStandardMaterial({ color: "#2f5a33", roughness: 0.85, emissive: "#0c2712", emissiveIntensity: 0.55 });
      const leafMat = new THREE.MeshStandardMaterial({ color: "#4a7a38", roughness: 0.8, emissive: "#122e14", emissiveIntensity: 0.55 });
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 6);
      const coneGeo = new THREE.ConeGeometry(1, 1, 7);
      const blobGeo = new THREE.IcosahedronGeometry(1, 1);

      const nPine = Math.floor(spots.length * 0.55), nLeaf = spots.length - nPine;
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
      const cones = new THREE.InstancedMesh(coneGeo, pineMat, nPine * 3);
      const blobs = new THREE.InstancedMesh(blobGeo, leafMat, nLeaf * 2);
      trunks.castShadow = cones.castShadow = blobs.castShadow = true;
      let ci = 0, bi = 0;
      spots.forEach((s, i) => {
        const big = 1 + N(s.x * 0.1, s.z * 0.1, 2) * 1.6;
        const th = (i < nPine ? 5.5 : 4.2) * big;
        dummy.position.set(s.x, s.h + th * 0.5, s.z);
        dummy.scale.set(big, th, big);
        dummy.rotation.set(0, Math.random() * 6.3, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        if (i < nPine) {
          for (let k = 0; k < 3; k++) {
            const cw = (2.6 - k * 0.62) * big, chh = 2.6 * big;
            dummy.position.set(s.x, s.h + th * 0.62 + k * 1.7 * big, s.z);
            dummy.scale.set(cw, chh, cw);
            dummy.rotation.set(0, Math.random(), 0);
            dummy.updateMatrix();
            cones.setMatrixAt(ci++, dummy.matrix);
          }
        } else {
          for (let k = 0; k < 2; k++) {
            const bw = (2.3 - k * 0.5) * big;
            dummy.position.set(s.x + (Math.random()-0.5) * big, s.h + th * 0.85 + k * 1.4 * big, s.z + (Math.random()-0.5) * big);
            dummy.scale.set(bw, bw * 0.82, bw);
            dummy.rotation.set(Math.random()*0.4, Math.random()*6.3, 0);
            dummy.updateMatrix();
            blobs.setMatrixAt(bi++, dummy.matrix);
          }
        }
      });
      this.scene.add(trunks, cones, blobs);
      this.dispose.push(trunkGeo, coneGeo, blobGeo, trunkMat, pineMat, leafMat, trunks, cones, blobs);

      // grass: instanced blades near the clearing — thin, bright, lit both sides
      const gGeo = new THREE.PlaneGeometry(0.16, 0.72);
      gGeo.translate(0, 0.36, 0);
      const gMat = new THREE.MeshStandardMaterial({
        color: "#7fae57", roughness: 0.85, side: THREE.DoubleSide,
        emissive: "#2c4a1e", emissiveIntensity: 0.5,
      });
      const GN = 3800;
      const grass = this.grass = new THREE.InstancedMesh(gGeo, gMat, GN);
      for (let i = 0; i < GN; i++) {
        const a = Math.random() * Math.PI * 2, rr = 4 + Math.pow(Math.random(), 0.6) * 95;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (Math.hypot(x - 78, z + 52) < 42) { i--; continue; }
        const h = this.height(x, z);
        if (h < this.waterY + 0.6) { i--; continue; }
        dummy.position.set(x, h, z);
        dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.22);
        const sc = 0.6 + Math.random() * 0.9;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      }
      this.scene.add(grass);
      this.dispose.push(gGeo, gMat, grass);
    }

    // ---------------- YOUR grove in the clearing ----------------
    buildGrove() {
      // rebuildable: all grove trees live in one group
      if (this.groveGroup) { this.scene.remove(this.groveGroup); }
      this.groveGroup = new THREE.Group();
      const entries = [...(State.get().grove || [])].slice(0, 160)
        .sort((a, b) => (a.sp === "real" ? -1 : 1) - (b.sp === "real" ? -1 : 1));
      this.groveTrees = [];
      const trunkMat = new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.9 });
      const goldMat = new THREE.MeshStandardMaterial({ color: "#ffd94d", emissive: "#f0a808", emissiveIntensity: 0.9, roughness: 0.35 });
      const goldTrunk = new THREE.MeshStandardMaterial({ color: "#a8842f", metalness: 0.4, roughness: 0.5 });
      const leafMats = [
        new THREE.MeshStandardMaterial({ color: "#3f9a55", roughness: 0.7, emissive: "#0f3018", emissiveIntensity: 0.5 }),
        new THREE.MeshStandardMaterial({ color: "#57b06a", roughness: 0.7, emissive: "#123a1e", emissiveIntensity: 0.5 }),
        new THREE.MeshStandardMaterial({ color: "#2f7a4a", roughness: 0.75, emissive: "#0c2814", emissiveIntensity: 0.5 }),
      ];
      // night bioluminescence: remember base glow so the cycle can breathe it
      this.groveMats = [goldMat, ...leafMats].map((m) => ({ m, base: m.emissiveIntensity }));
      const tGeo = new THREE.CylinderGeometry(0.09, 0.16, 1, 6);
      const cGeo = new THREE.SphereGeometry(0.8, 10, 8);
      this.dispose.push(trunkMat, goldMat, goldTrunk, tGeo, cGeo, ...leafMats);

      entries.forEach((e, i) => {
        const real = e.sp === "real";
        const idx = real ? i : i + 4;
        const r = 1.4 * Math.sqrt(idx) + 2.2;
        const th = idx * 2.39996;
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        const h = this.height(x, z);
        const q = e.q ?? 0.7;
        const g = new THREE.Group();
        const hgt = 1.6 + q * 2.6;
        const trunk = new THREE.Mesh(tGeo, real ? goldTrunk : trunkMat);
        trunk.scale.y = hgt; trunk.position.y = hgt / 2;
        trunk.castShadow = true;
        g.add(trunk);
        for (let k = 0; k < 2; k++) {
          const cn = new THREE.Mesh(cGeo, real ? goldMat : leafMats[i % 3]);
          cn.position.set((Math.random()-0.5)*0.5, hgt + 0.3 + k * 0.7, (Math.random()-0.5)*0.5);
          const cs = (1 - k * 0.25) * (0.7 + q * 0.7);
          cn.scale.set(cs, cs * 0.85, cs);
          cn.castShadow = true;
          g.add(cn);
        }
        g.position.set(x, h, z);
        this.groveGroup.add(g);
        this.groveTrees.push({ g, x, z, real, visited: false });
      });
      this.scene.add(this.groveGroup);

      if (!this.heart && entries.some((e) => e.sp === "real")) {
        const heart = new THREE.PointLight(0xffc84a, 30, 30, 2);
        heart.position.set(0, 4, 0);
        this.scene.add(heart);
        this.heart = heart;
      }

      // glowing soil patches — plant right here, inside the world
      if (!this.patches) {
        this.patches = [];
        const soilGeo = new THREE.CircleGeometry(2.3, 24);
        const soilMat = new THREE.MeshStandardMaterial({ color: "#3a2c1a", roughness: 1 });
        const ringGeo = new THREE.TorusGeometry(2.3, 0.09, 8, 40);
        const ringMat = new THREE.MeshStandardMaterial({ color: "#4ade80", emissive: "#22c55e", emissiveIntensity: 1.6, roughness: 0.3 });
        this.dispose.push(soilGeo, soilMat, ringGeo, ringMat);
        [[20, -7], [-19, 9], [7, 21]].forEach(([px, pz]) => {
          const h = this.height(px, pz);
          const soil = new THREE.Mesh(soilGeo, soilMat);
          soil.rotation.x = -Math.PI / 2;
          soil.position.set(px, h + 0.05, pz);
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(px, h + 0.12, pz);
          this.scene.add(soil, ring);
          this.patches.push({ x: px, z: pz, ring });
        });
      }
    }

    // ---------------- clouds, pollen, birds ----------------
    buildSkyBits() {
      const cTex = cloudSprite();
      this.clouds = [];
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, transparent: true, opacity: 0.8, fog: false }));
        m.position.set((Math.random()-0.5) * 900, 120 + Math.random() * 90, (Math.random()-0.5) * 900);
        m.scale.set(160 + Math.random() * 200, 60 + Math.random() * 60, 1);
        this.scene.add(m);
        this.clouds.push(m);
        this.dispose.push(m.material);
      }
      this.dispose.push(cTex);

      const pGeo = new THREE.BufferGeometry();
      const PN = 320, pp = new Float32Array(PN * 3);
      this.pollenBase = [];
      for (let i = 0; i < PN; i++) {
        const v = new THREE.Vector3((Math.random()-0.5)*80, 1 + Math.random() * 9, (Math.random()-0.5)*80);
        this.pollenBase.push(v); pp.set([v.x, v.y, v.z], i * 3);
      }
      pGeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
      const pTex = radialSprite("rgba(255,236,178,0.9)", "rgba(255,236,178,0)", 64);
      const pMat = new THREE.PointsMaterial({ map: pTex, color: 0xffe9b0, size: 0.42, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      this.dispose.push(pTex);
      this.pollen = new THREE.Points(pGeo, pMat);
      this.scene.add(this.pollen);
      this.dispose.push(pGeo, pMat);

      // butterflies — daytime dancers over the clearing
      this.butterflies = new THREE.Group();
      const wingGeo = new THREE.PlaneGeometry(0.22, 0.3);
      const wingCols = ["#f59e0b", "#60a5fa", "#f472b6", "#a3e635", "#fbbf24", "#22d3ee"];
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: wingCols[i], side: THREE.DoubleSide });
        const L = new THREE.Mesh(wingGeo, mat), R = new THREE.Mesh(wingGeo, mat);
        L.position.x = -0.11; R.position.x = 0.11;
        b.add(L, R);
        b.userData = { L, R, cx: (Math.random() - 0.5) * 30, cz: (Math.random() - 0.5) * 30, r: 3 + Math.random() * 6, h: 1 + Math.random() * 2, sp: 0.3 + Math.random() * 0.4, ph: Math.random() * 6 };
        this.butterflies.add(b);
        this.dispose.push(mat);
      }
      this.dispose.push(wingGeo);
      this.scene.add(this.butterflies);

      // birds: dark chevrons circling high
      this.birds = [];
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1,0,0, 0,0.3,0.4, 0,0.3,-0.4, -1,0,0]), 3));
      const bMat = new THREE.MeshBasicMaterial({ color: 0x1c2419, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(bGeo, bMat);
        b.scale.setScalar(1.6);
        this.scene.add(b);
        this.birds.push({ m: b, r: 60 + i * 14, h: 46 + i * 7, ph: i * 1.3, sp: 0.14 + i * 0.02 });
      }
      this.dispose.push(bGeo, bMat);
    }

    // ---------------- input: pointer lock + WASD + touch ----------------
    buildInput() {
      this.yaw = 2.6; this.pitch = -0.06;
      this.pos = new THREE.Vector3(14, 0, 16);
      this.vel = new THREE.Vector3();
      this.keys = {};
      this.touchLook = null; this.stick = null;

      this.onKey = (e) => {
        if (e.key === " ") e.preventDefault(); // space = jump, not page scroll
        if (e.type === "keydown" && e.key === "Escape") {
          return this.uiOpen ? this.closeRun() : this.close();
        }
        if (e.type === "keydown" && e.key.toLowerCase() === "e" && this.nearPatch && !this.uiOpen) {
          return this.startRun();
        }
        if (e.type === "keydown" && e.key.toLowerCase() === "m" && !this.uiOpen) {
          return this.close();
        }
        this.keys[e.key.toLowerCase()] = e.type === "keydown";
      };
      addEventListener("keydown", this.onKey);
      addEventListener("keyup", this.onKey);

      this.onClick = () => { if (!("ontouchstart" in window)) this.cv.requestPointerLock?.(); };
      this.cv.addEventListener("click", this.onClick);
      this.onMouse = (e) => {
        if (document.pointerLockElement === this.cv) {
          this.yaw -= e.movementX * 0.0023;
          this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - e.movementY * 0.0023));
        } else if (this.mouseDrag) {
          // fallback look for contexts where pointer lock is blocked
          this.yaw -= (e.clientX - this.mouseDrag.x) * 0.0035;
          this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - (e.clientY - this.mouseDrag.y) * 0.0035));
          this.mouseDrag = { x: e.clientX, y: e.clientY };
        }
      };
      addEventListener("mousemove", this.onMouse);
      this.onMDown = (e) => { if (document.pointerLockElement !== this.cv) this.mouseDrag = { x: e.clientX, y: e.clientY }; };
      this.onMUp = () => { this.mouseDrag = null; };
      this.cv.addEventListener("mousedown", this.onMDown);
      addEventListener("mouseup", this.onMUp);

      // touch: left half = joystick (move), right half = look
      const stickEl = this.el.querySelector("#w3-stick");
      const knob = stickEl.querySelector(".w3-knob");
      this.onTS = (e) => {
        // HUD buttons (exit, quality, jump, plant) must not steal into look/move.
        if (e.target && e.target.closest && e.target.closest("button")) return;
        for (const t of e.changedTouches) {
          if (t.clientX < innerWidth / 2 && !this.stick) {
            this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
            stickEl.style.display = "block";
            stickEl.style.left = (t.clientX - 55) + "px";
            stickEl.style.top = (t.clientY - 55) + "px";
          } else if (!this.touchLook) {
            this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
          }
        }
      };
      this.onTM = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this.stick && t.identifier === this.stick.id) {
            this.stick.dx = Math.max(-50, Math.min(50, t.clientX - this.stick.x0));
            this.stick.dy = Math.max(-50, Math.min(50, t.clientY - this.stick.y0));
            knob.style.transform = `translate(${this.stick.dx}px, ${this.stick.dy}px)`;
          } else if (this.touchLook && t.identifier === this.touchLook.id) {
            this.yaw -= (t.clientX - this.touchLook.x) * 0.0045;
            this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - (t.clientY - this.touchLook.y) * 0.0045));
            this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
          }
        }
      };
      this.onTE = (e) => {
        for (const t of e.changedTouches) {
          if (this.stick && t.identifier === this.stick.id) { this.stick = null; stickEl.style.display = "none"; knob.style.transform = ""; }
          if (this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null;
        }
      };
      this.el.addEventListener("touchstart", this.onTS, { passive: true });
      this.el.addEventListener("touchmove", this.onTM, { passive: false });
      this.el.addEventListener("touchend", this.onTE);
      // HUD overlay is pointer-events:none; re-enable the tap targets so JUMP
      // is not dead on phones (or on desktop when Spacebar is unknown).
      this.el.querySelectorAll("#w3-jump, #w3-exit, #w3-quality, #w3-plant").forEach((el) => {
        el.style.pointerEvents = "auto";
      });
      const jumpBtn = this.el.querySelector("#w3-jump");
      if (jumpBtn) {
        jumpBtn.hidden = false;
        const down = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.wantJump = true;
          this.keys[" "] = true;
        };
        const up = (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          this.keys[" "] = false;
        };
        jumpBtn.addEventListener("pointerdown", down);
        jumpBtn.addEventListener("pointerup", up);
        jumpBtn.addEventListener("pointercancel", up);
      }
      if ("ontouchstart" in window) {
        const hint = this.el.querySelector("#w3-hint");
        if (hint) hint.textContent = "left: move · right: look · JUMP for a mid-air catch (3x) · ✕ exit";
      }
    }

    // ---------------- per-frame ----------------
    step(dt) {
      const t = (this.clock.t += dt);
      if (this.uiOpen) return; // frozen while the planting run overlay is up
      // movement
      // sprint burns stamina, so running is a decision instead of a held key
      const wantRun = !!this.keys["shift"] && this.stam > 2;
      const run = wantRun ? 2 : 1;
      this.stam = Math.max(0, Math.min(100, this.stam + (wantRun ? -34 : 22) * dt));
      const sf = this.el.querySelector("#w3-stam-fill");
      if (sf) { sf.style.width = this.stam + "%"; sf.style.background = this.stam < 25 ? "#f87171" : "#7dd3fc"; }
      const speed = 9.5 * run;
      let mx = (this.keys["d"] || this.keys["arrowright"] ? 1 : 0) - (this.keys["a"] || this.keys["arrowleft"] ? 1 : 0);
      let mz = (this.keys["w"] || this.keys["arrowup"] ? 1 : 0) - (this.keys["s"] || this.keys["arrowdown"] ? 1 : 0);
      if (this.stick) { mx += this.stick.dx / 50; mz -= this.stick.dy / 50; }
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.vel.x += (mz * -sin + mx * cos) * speed * dt * 6;
      this.vel.z += (mz * -cos - mx * sin) * speed * dt * 6;
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      const lim = this.SIZE * 0.46;
      this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
      this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
      const groundH = Math.max(this.height(this.pos.x, this.pos.z), this.waterY + 0.25);
      const moving = Math.hypot(this.vel.x, this.vel.z);
      // footsteps keep pace with movement speed
      this.stepAcc = (this.stepAcc || 0) + moving * dt;
      if (moving > 1.4 && this.stepAcc > 2.4) {
        this.stepAcc = 0;
        if (window.Ambience) Ambience.footstep();
      }
      const bob = Math.min(1, moving / 6) * Math.sin(t * 10 * run) * 0.06;

      // jump physics (space on desktop; on-screen JUMP queues a tap so a short press is not missed)
      if ((this.keys[" "] || this.wantJump) && this.grounded) {
        this.vy = 5.6; this.grounded = false; this.wantJump = false; Sfx.pop();
      }
      this.vy -= 15 * dt;
      this.jumpY = Math.max(0, this.jumpY + this.vy * dt);
      if (this.jumpY === 0 && this.vy < 0) { this.vy = 0; if (!this.grounded) { this.grounded = true; if (window.Ambience) Ambience.footstep(); } }

      // your Treegen, embodied — runs, leans, hops
      if (this.avatar) {
        this.avatar.position.set(this.pos.x, groundH + this.jumpY, this.pos.z);
        this.avatar.rotation.y = this.yaw + Math.PI;
        const lean = Math.min(1, moving / 8);
        this.avatar.rotation.x = Math.sin(t * 11 * run) * 0.06 * lean;
        this.avatar.rotation.z = Math.sin(t * 5.5 * run) * 0.04 * lean;
      }

      // third-person chase camera
      if (this.camShake > 0) this.camShake -= dt;
      const shx = this.camShake > 0 ? (Math.random() - 0.5) * 0.3 : 0;
      const back = 4.6, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const cx = this.pos.x + fx * back, cz = this.pos.z + fz * back;
      const camY = Math.max(
        groundH + 2.3 + this.jumpY * 0.6 - this.pitch * 2.2 + bob * 0.4,
        this.height(cx, cz) + 0.7
      );
      this.cam.position.set(cx + shx, camY, cz + shx);
      this.cam.lookAt(this.pos.x, groundH + 1.5 + this.jumpY + this.pitch * 2.4, this.pos.z);

      // ---- day-night cycle (~140s; nights run short so play stays bright) ----
      this.dayT += dt / 140;
      const elev = Math.sin(this.dayT * Math.PI * 2) * 0.62 + 0.28; // biased sun elevation
      const dayK = this.dayK = Math.max(0, Math.min(1, elev * 3 + 0.35));
      this.sun.intensity = 0.18 + 3.2 * dayK;
      this.sun.color.setHSL(0.09, 0.55, 0.55 + 0.25 * dayK);          // warm → pale moonlight
      this.hemi.intensity = 0.32 + 0.8 * dayK;
      this.scene.fog.color.lerpColors(this.nightFog, this.dayFog, dayK);
      this.skyMesh.material.color.setRGB(0.1 + 0.9 * dayK, 0.12 + 0.88 * dayK, 0.2 + 0.8 * dayK);
      this.sunSpr.material.opacity = 0.85 * dayK;
      this.moonSpr.material.opacity = 0.9 * (1 - dayK);
      this.stars.material.opacity = 0.85 * (1 - dayK);
      // the grove answers the dark: bioluminescence swells at night
      const glowF = 1 + (1 - dayK) * 1.6;
      if (this.groveMats) this.groveMats.forEach(({ m, base }) => { m.emissiveIntensity = base * glowF; });
      if (this.heart) this.heart.distance = 30 + (1 - dayK) * 14;
      this.pollen.material.opacity = 0.35 + (1 - dayK) * 0.55;        // fireflies own the night

      // butterflies dance by day, roost at night
      this.butterflies.visible = dayK > 0.35;
      if (this.butterflies.visible) {
        this.butterflies.children.forEach((b) => {
          const u = b.userData, a = t * u.sp + u.ph;
          const bx = u.cx + Math.cos(a) * u.r, bz = u.cz + Math.sin(a * 1.3) * u.r;
          b.position.set(bx, Math.max(this.height(bx, bz), this.waterY) + u.h + Math.sin(t * 3 + u.ph) * 0.4, bz);
          b.rotation.y = -a;
          const flap = Math.sin(t * 18 + u.ph) * 1.1;
          u.L.rotation.y = flap; u.R.rotation.y = -flap;
        });
      }

      // shadows follow the player so detail stays crisp; sun rides its arc
      this.sun.target.position.set(this.pos.x, 0, this.pos.z);
      this.sun.position.set(this.pos.x - 90, 20 + 70 * Math.max(0.06, elev), this.pos.z - 40);

      // living world
      this.water.position.y = this.waterY + Math.sin(t * 0.9) * 0.05;
      this.clouds.forEach((c, i) => { c.position.x += dt * (2.4 + i * 0.2); if (c.position.x > 480) c.position.x = -480; });
      const pa = this.pollen.geometry.attributes.position;
      this.pollenBase.forEach((p, i) => {
        pa.setXYZ(i,
          p.x + Math.sin(t * 0.5 + i) * 1.6,
          p.y + Math.sin(t * 0.8 + i * 1.7) * 0.7,
          p.z + Math.cos(t * 0.4 + i) * 1.6);
      });
      pa.needsUpdate = true;
      this.birds.forEach((b) => {
        const a = t * b.sp + b.ph;
        b.m.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 2 + b.ph) * 1.5, Math.sin(a) * b.r);
        b.m.rotation.y = -a;
      });
      if (this.heart) this.heart.intensity = 30 * (1 + Math.sin(t * 2) * 0.2);

      // grove proximity: your trees greet you
      if ((this.proxAt || 0) < t) {
        this.proxAt = t + 0.4;
        for (const gt of this.groveTrees) {
          if (gt.visited) continue;
          if (Math.hypot(gt.x - this.pos.x, gt.z - this.pos.z) < 4.2) {
            gt.visited = true; this.visited.add(gt);
            gt.g.children.forEach((m) => { if (m.material.emissiveIntensity !== undefined) m.material = m.material.clone(); });
            Sfx.good();
            break;
          }
        }
        const st = this.el.querySelector("#w3-stats");
        if (st) {
          const sm = this.storm;
          st.textContent = sm.inWave
            ? `🌩 WAVE ${sm.wave} · ${Math.max(0, Math.ceil(sm.waveEnd - t))}s · ${sm.score.toLocaleString()} pts · x${sm.mult * (sm.fever > t ? 2 : 1)} · ${sm.combo}⛓${sm.fever > t ? " · 🌸RUSH" : ""}${sm.airborne ? ` · ✈️${sm.airborne}` : ""}`
            : `${sm.score.toLocaleString()} pts · ${this.groveTrees.length + this.stormTrees.length} trees · 🌩 wave ${sm.wave + 1} in ${Math.max(0, Math.ceil(sm.nextWave - t))}s`;
        }
      }
      // greeted trees sway with joy
      this.visited.forEach((gt) => { gt.g.rotation.z = Math.sin(t * 3) * 0.05; gt.g.scale.setScalar(1 + Math.sin(t * 3) * 0.02); });

      this.updateGameplay(t, dt);

      // soil-patch proximity → offer a planting run
      if (this.patches) {
        this.nearPatch = null;
        for (const p of this.patches) {
          p.ring.material.emissiveIntensity = 1.2 + Math.sin(t * 3 + p.x) * 0.6;
          if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 3.6) this.nearPatch = p;
        }
        const show = !!this.nearPatch && !this.uiOpen;
        if (this.plantBtn.style.display !== (show ? "block" : "none")) {
          this.plantBtn.style.display = show ? "block" : "none";
        }
      }
    }


    // ---------------- your embodied Treegen (third-person) ----------------
    buildAvatar() {
      if (typeof Char3D === "undefined" || !Char3D.build) return;
      const av = State.get().avatar || {};
      const b = Char3D.build({ stage: State.stage(), hue: av.hue || 130, accent: av.accent || "#fbbf24", seed: av.seed || 7, coin: false });
      this.avatar = b.root;
      this.avatar.scale.setScalar(0.62);
      this.avatar.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.scene.add(this.avatar);
      b.dispose.forEach((d) => this.dispose.push(d));
    }

    // ---------------- sap orbs: idle exploration rewards ----------------
    buildSap() {
      this.sap = [];
      this.sapGeo = new THREE.SphereGeometry(0.26, 12, 10);
      this.sapMat = new THREE.MeshStandardMaterial({ color: "#ffd94d", emissive: "#f0a808", emissiveIntensity: 1.4, roughness: 0.25 });
      this.dispose.push(this.sapGeo, this.sapMat);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 26;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const m = new THREE.Mesh(this.sapGeo, this.sapMat);
        m.position.set(x, this.height(x, z) + 0.8, z);
        this.scene.add(m);
        this.sap.push({ m, x, z, taken: false, respawn: 0 });
      }
    }

    // ---------------- 3D → screen reward popups ----------------
    popup3D(text, color, x, y3, z) {
      const v = new THREE.Vector3(x, y3, z).project(this.cam);
      if (v.z > 1) return;
      const n = document.createElement("div");
      n.className = "fx-float";
      n.textContent = text;
      n.style.color = color;
      n.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + "px";
      n.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + "px";
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 1400);
    }

    // ---------------- THE STORM: catch seeds falling from the sky ----------------
    initFallingAssets() {
      this.orbGeo = new THREE.SphereGeometry(0.3, 12, 10);
      this.orbMat = new THREE.MeshStandardMaterial({ color: "#b6ff7a", emissive: "#7ac943", emissiveIntensity: 1.5, roughness: 0.3 });
      this.rockGeo = new THREE.DodecahedronGeometry(0.42);
      this.rockMat = new THREE.MeshStandardMaterial({ color: "#6b6b66", roughness: 0.95 });
      this.barGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.62, 10);
      this.barMat = new THREE.MeshStandardMaterial({ color: "#8a2f2f", emissive: "#5a1010", emissiveIntensity: 0.7, roughness: 0.6 });
      this.trunkGeo2 = new THREE.CylinderGeometry(0.08, 0.14, 1, 6);
      this.canGeo2 = new THREE.SphereGeometry(0.7, 10, 8);
      this.trunkMat2 = new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.9 });
      [this.orbGeo, this.orbMat, this.rockGeo, this.rockMat, this.barGeo, this.barMat,
       this.trunkGeo2, this.canGeo2, this.trunkMat2].forEach((d) => this.dispose.push(d));
    }

    spawnFalling() {
      const st = this.storm;
      if (!this.orbGeo) this.initFallingAssets();
      if (this.falling.length > 26) return;
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 13;
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      const hazard = st.wave > 0 && Math.random() < Math.min(0.28, 0.08 + st.wave * 0.03);
      const type = hazard ? (Math.random() < 0.5 ? "rock" : "barrel") : "seed";
      const mesh = type === "seed" ? new THREE.Mesh(this.orbGeo, this.orbMat)
        : type === "rock" ? new THREE.Mesh(this.rockGeo, this.rockMat)
        : new THREE.Mesh(this.barGeo, this.barMat);
      mesh.position.set(x, 20 + Math.random() * 6, z);
      this.scene.add(mesh);
      this.falling.push({ mesh, x, z, y: mesh.position.y, vy: 2.4 + Math.random() * 1.4 + st.wave * 0.12, type });
    }

    catchSeed(o, gh, height) {
      const st = this.storm;
      const h = height != null ? height : o.y - gh;
      // Snatching a seed out of the AIR (jumping) is the skill move: 3x and a
      // stronger tree. Catching it at ankle height is the lazy option.
      const airborne = this.jumpY > 0.5 && h > 1.1;
      const q = airborne ? 1 : Math.max(0.35, Math.min(0.95, 1.05 - h / 2.6));
      st.combo++;
      st.mult = Math.min(8, 1 + Math.floor(st.combo / 4));
      const fever = st.fever > this.clock.t;
      const pts = Math.round(120 * q * st.mult * (fever ? 2 : 1) * (airborne ? 3 : 1));
      st.score += pts;
      st.caught.push(+q.toFixed(2));
      if (airborne) { st.airborne++; this.bumpObjective("air", 1); }
      this.bumpObjective("chain", st.combo);
      this.bumpObjective("catch", 1);
      this.popup3D(airborne ? `✈️ AIRBORNE +${pts}` : `+${pts}`,
                   airborne ? "#ffd94d" : "#7dffa8", o.x, gh + h + 0.5, o.z);
      if (airborne) Sfx.epic(); else if (st.combo >= 2) Sfx.combo(st.combo); else Sfx.pop();
      if (st.combo === 10 && st.fever < this.clock.t) {
        st.fever = this.clock.t + 6;
        this.popup3D("🌸 BLOOM RUSH: DOUBLE POINTS 🌸", "#ffd94d", this.pos.x, gh + 3, this.pos.z);
        Sfx.epic();
      }
      if (st.combo === 5) this.popup3D("🧲 FLOW: seeds pull toward you", "#7dd3fc", this.pos.x, gh + 2.8, this.pos.z);
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(this.trunkGeo2, this.trunkMat2);
      const hgt = 1 + q * 1.6;
      trunk.scale.y = hgt; trunk.position.y = hgt / 2;
      const can = new THREE.Mesh(this.canGeo2, this.groveMats[1 + (st.caught.length % 3)]?.m || this.trunkMat2);
      can.position.y = hgt + 0.3;
      can.scale.setScalar(0.55 + q * 0.5);
      trunk.castShadow = can.castShadow = true;
      g.add(trunk, can);
      g.position.set(o.x, gh, o.z);
      g.scale.setScalar(0.01);
      this.scene.add(g);
      this.stormTrees.push({ g, born: this.clock.t, q });
    }

    hazardHit(o) {
      const st = this.storm;
      st.combo = 0; st.mult = 1;
      st.score = Math.max(0, st.score - 150);
      this.camShake = 0.4; this.hurt = 0.6;
      this.stam = Math.max(0, this.stam - 35);
      this.popup3D(o.type === "rock" ? "🪨 −150" : "☢️ −150", "#f87171", o.x, o.y + 0.6, o.z);
      Sfx.bad();
    }

    // ---- objectives: always something to chase, refreshes on completion ----
    rollObjective() {
      const pool = [
        { id: "air3",   label: "Catch 3 seeds mid-air",   need: 3,  key: "air" },
        { id: "chain12",label: "Reach a 12 chain",        need: 12, key: "chain" },
        { id: "catch15",label: "Catch 15 seeds",          need: 15, key: "catch" },
        { id: "wave1",  label: "Survive a full wave",     need: 1,  key: "wave" },
      ];
      const p = pool[Math.floor(Math.random() * pool.length)];
      this.obj = { ...p, at: 0 };
      this.paintObjective();
    }
    paintObjective() {
      const el = this.el.querySelector("#w3-obj");
      if (!el || !this.obj) return;
      el.innerHTML = `🎯 ${this.obj.label} <b>${Math.min(this.obj.at, this.obj.need)}/${this.obj.need}</b>`;
    }
    bumpObjective(key, n) {
      const result = advanceObjective(this.obj, key, n);
      if (!result) return;
      this.obj.at = result.at;
      if (result.completed) {
        this.objDone++;
        State.earn(60, 12);
        this.popup3D(`🎯 ${this.obj.label} +60⭐ +12🪙`, "#a3e635", this.pos.x, this.height(this.pos.x, this.pos.z) + 3, this.pos.z);
        Sfx.fanfare();
        this.rollObjective();
      } else this.paintObjective();
    }

    startWave() {
      const st = this.storm;
      st.wave++; st.inWave = true;
      st.waveEnd = this.clock.t + 22 + st.wave;
      this.popup3D(`🌩 WAVE ${st.wave}: GO!`, "#ffd94d", this.pos.x, this.height(this.pos.x, this.pos.z) + 3.4, this.pos.z);
      Sfx.fanfare();
    }
    endWave() {
      const st = this.storm;
      st.inWave = false;
      st.nextWave = this.clock.t + 26;   // short breather, never dead air
      this.bumpObjective("wave", 1);
      this.bankRun();
      this.popup3D(`WAVE ${st.wave} CLEAR · next in 26s`, "#7dffa8", this.pos.x, this.height(this.pos.x, this.pos.z) + 3, this.pos.z);
    }

    // Pay out what has been caught so far into the real economy.
    bankRun() {
      const st = this.storm;
      if (!st.caught.length) return;
      const biomes = CONFIG.biomes.filter((b) => State.biomeUnlocked(b));
      const target = biomes.sort((a, b) => State.biomeHealth(a.id) - State.biomeHealth(b.id))[0] || CONFIG.biomes[0];
      const healthy = State.biomeHealth(target.id) >= 50;
      const key = target.species.find((k) => !(CONFIG.species[k].needsHealthy && !healthy)) || target.species[0];
      const r = State.plantMany(target.id, key, st.caught);
      st.caught = [];
      const s = State.get();
      if (!s.records) s.records = {};
      if (st.score > (s.records.world?.score || 0)) s.records.world = { score: st.score };
      State.save();
      try { if (window.Quests) Quests.onEvent("run", { doused: 0, detoxed: 0, score: st.score }); } catch (e) {}
      this.popup3D(`+${r.exp} ⭐  +${r.tgn} 🪙  ${target.emoji} +${r.heal.toFixed(1)}%`, "#7dffa8",
                   this.pos.x, this.height(this.pos.x, this.pos.z) + 2.2, this.pos.z);
      if (r.evolved) Sfx.epic();
    }

    updateGameplay(t, dt) {
      const st = this.storm;
      if (!this.obj) this.rollObjective();
      if (this.hurt > 0) {
        this.hurt -= dt;
        const hv = this.el.querySelector("#w3-hurt");
        if (hv) hv.style.opacity = Math.max(0, this.hurt);
      }
      if (this.uiOpen) return;

      // wave lifecycle — surges on top of continuous rain
      if (!st.inWave && t > st.nextWave) this.startWave();
      if (st.inWave && t > st.waveEnd) this.endWave();

      // seeds ALWAYS fall; waves just fall harder
      st.tSpawn -= dt;
      if (st.tSpawn <= 0) {
        st.tSpawn = st.inWave ? Math.max(0.18, 0.42 - st.wave * 0.02) : 1.15;
        this.spawnFalling();
        if (st.inWave && st.wave > 2 && Math.random() < 0.4) this.spawnFalling();
      }

      const magnet = st.combo >= 5;   // flow state literally pulls seeds in
      for (let i = this.falling.length - 1; i >= 0; i--) {
        const o = this.falling[i];
        o.y -= o.vy * dt;
        const gh = this.height(o.x, o.z);
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
        const d = Math.hypot(dx, dz);
        if (magnet && o.type === "seed" && d < 7) {
          const pull = Math.min(1, (7 - d) / 7) * 9 * dt;
          o.x += dx * pull / Math.max(d, 0.001); o.z += dz * pull / Math.max(d, 0.001);
        }
        o.mesh.position.set(o.x, o.y, o.z);
        o.mesh.rotation.y += dt * 3;
        const height = o.y - gh;
        if (o.type === "seed" && d < 2.0 && height < 3.2 && height > 0.05) {
          this.catchSeed(o, gh, height);
          this.scene.remove(o.mesh); this.falling.splice(i, 1);
        } else if (o.type !== "seed" && d < 1.4 && height < 2.3 && height > 0) {
          this.hazardHit(o);
          this.scene.remove(o.mesh); this.falling.splice(i, 1);
        } else if (o.y <= gh + 0.3) {
          if (o.type === "seed" && d < 14) {
            st.combo = 0; st.mult = 1;
            this.popup3D("missed", "#8a8f8a", o.x, gh + 0.8, o.z);
          }
          this.scene.remove(o.mesh); this.falling.splice(i, 1);
        }
      }

      this.stormTrees.forEach((tr) => {
        const k = Math.min(1, (t - tr.born) / 1.5);
        tr.g.scale.setScalar(0.01 + k * (0.55 + tr.q * 0.55));
      });

      this.sap.forEach((o) => {
        if (o.taken) { if (t > o.respawn) { o.taken = false; o.m.visible = true; } return; }
        o.m.position.y = this.height(o.x, o.z) + 0.8 + Math.sin(t * 2 + o.x) * 0.15;
        o.m.rotation.y = t;
        if (Math.hypot(o.x - this.pos.x, o.z - this.pos.z) < 1.5) {
          o.taken = true; o.m.visible = false; o.respawn = t + 75;
          State.earn(0, 2);
          this.popup3D("+2 🪙 sap", "#ffd94d", o.x, this.height(o.x, o.z) + 1.6, o.z);
          Sfx.coin();
        }
      });
    }

    // ---- Seed Storm without leaving the world ----
    startRun() {
      if (this.uiOpen || typeof Arcade === "undefined") return;
      this.uiOpen = true;
      this.plantBtn.style.display = "none";
      document.exitPointerLock?.();
      // target: the neediest unlocked biome; seed: best planter for its soil
      const biomes = CONFIG.biomes.filter((b) => State.biomeUnlocked(b));
      const target = biomes.sort((a, b) => State.biomeHealth(a.id) - State.biomeHealth(b.id))[0] || CONFIG.biomes[0];
      const healthy = State.biomeHealth(target.id) >= 50;
      const key = target.species.find((k) => !(CONFIG.species[k].needsHealthy && !healthy)) || target.species[0];
      const sp = CONFIG.species[key];
      const diff = CONFIG.biomes.findIndex((b) => b.id === target.id);
      const rec = State.get().records?.[target.id];

      this.runEl = document.createElement("div");
      this.runEl.className = "w3-run";
      this.runEl.innerHTML = `
        <div class="w3-run-head">🌱 Planting from your grove → <b>${target.flag} ${target.name}</b> (${State.biomeHealth(target.id).toFixed(0)}% healed)</div>
        <div class="w3-run-host"></div>`;
      this.el.appendChild(this.runEl);
      const host = this.runEl.querySelector(".w3-run-host");

      Arcade.start(host, {
        species: sp, difficulty: diff, biomeName: target.name, best: rec?.score || 0,
        onDone: () => this.closeRun(),
      }, (results) => {
        const r = State.plantMany(target.id, key, results.qualities);
        const s = State.get();
        if (!s.records) s.records = {};
        if (results.score > (s.records[target.id]?.score || 0)) {
          s.records[target.id] = { score: results.score, combo: results.bestCombo };
        }
        State.save();
        try { window.Quests && Quests.checkAchv(); } catch (e) {}
        return { html: `<div class="arc-rewards">+${r.exp} ⭐ · +${r.tgn} 🪙 · ${target.emoji} +${r.heal.toFixed(1)}%<div class="arc-loot">Your new trees are waiting outside 🌳</div></div>` };
      });
    }

    closeRun() {
      if (!this.uiOpen) return;
      this.uiOpen = false;
      if (typeof Arcade !== "undefined") Arcade.stopAll();
      if (this.runEl) { this.runEl.remove(); this.runEl = null; }
      this.buildGrove();  // the magic: freshly planted trees now stand in the clearing
      const st = this.el.querySelector("#w3-stats");
      if (st) st.textContent = `🌳 ${this.groveTrees.length} of your trees stand here - the newest just took root`;
    }

    loop(now) {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.clock.last) / 1000);
      this.clock.last = now;
      this.step(dt);
      this.renderer.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(this.loop);
    }

    close() {
      if (this.dead) return;
      try { this.bankRun(); } catch (e) {}
      this.dead = true;
      if (window.Ambience) Ambience.setScene("ui");
      if (this.uiOpen && typeof Arcade !== "undefined") Arcade.stopAll();
      cancelAnimationFrame(this.raf);
      document.exitPointerLock?.();
      removeEventListener("keydown", this.onKey);
      removeEventListener("keyup", this.onKey);
      removeEventListener("mousemove", this.onMouse);
      removeEventListener("mouseup", this.onMUp);
      removeEventListener("resize", this.onResize);
      this.falling.forEach((o) => this.scene.remove(o.mesh));
      this.el.querySelectorAll(".storm-result").forEach((n) => n.remove());
      this.dispose.forEach((d) => d.dispose && d.dispose());
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !Array.isArray(o.material)) o.material.dispose();
      });
      this.renderer.dispose();
      this.el.remove();
      active = null;
    }
  }

  function open() {
    if (typeof THREE === "undefined") { return null; }
    if (window.Launch && !Launch.webglOk()) return null;
    if (active) active.close();
    try {
      active = new World();
      window.__world = active; // dev/debug handle
      return active;
    } catch (e) {
      if (window.Launch) Launch.noteFailure("context");
      try { document.querySelectorAll(".world3d").forEach((n) => n.remove()); } catch (err) {}
      active = null;
      return null;
    }
  }
  function closeAll() { if (active) active.close(); }

  // Exact key match: "catch 15 seeds" must not treat air/chain/wave as catches.
  function advanceObjective(obj, key, n) {
    if (!obj || obj.key !== key) return null;
    const at = obj.key === "chain" ? Math.max(obj.at, n) : obj.at + n;
    return { at, completed: at >= obj.need };
  }

  return { open, closeAll, advanceObjective };
})();
window.World3D = World3D;
