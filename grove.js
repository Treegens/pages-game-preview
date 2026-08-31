// =============================================================================
// grove.js — Your Grove: every tree you've ever planted, alive in one 3D scene.
// Trees are placed on a golden-angle spiral (old growth at the centre, new
// saplings at the edge). Verified real trees stand golden at the heart.
// API: Grove.mount(container) → handle{dispose} · Grove.disposeAll()
// =============================================================================

const Grove = (() => {
  const mounts = new Set();
  const ok = () => typeof THREE !== "undefined" && (!window.Launch || Launch.webglOk());

  function rng(seed) {
    let v = seed * 9301 + 49297;
    return () => { v = (v * 9301 + 49297) % 233280; return v / 233280; };
  }

  // ---- shared geometry/material library (built per mount, disposed with it) ----
  function makeLib() {
    const lib = {
      trunk: new THREE.CylinderGeometry(0.05, 0.09, 1, 7),
      canopy: new THREE.SphereGeometry(0.42, 12, 9),
      bush: new THREE.SphereGeometry(0.22, 9, 7),
      stilt: new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5),
      trunkMat: new THREE.MeshStandardMaterial({ color: "#6b4a2a", roughness: 0.9 }),
      leafMats: [
        new THREE.MeshStandardMaterial({ color: "#2f8f4e", roughness: 0.75 }),
        new THREE.MeshStandardMaterial({ color: "#48b063", roughness: 0.75 }),
        new THREE.MeshStandardMaterial({ color: "#1f6f44", roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: "#3aa07a", roughness: 0.75 }), // mangrove teal
      ],
      pioneerMat: new THREE.MeshStandardMaterial({
        color: "#8fd45a", emissive: "#5a8f2a", emissiveIntensity: 0.25, roughness: 0.7,
      }),
      goldMat: new THREE.MeshStandardMaterial({
        color: "#ffd94d", emissive: "#f0a808", emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.3,
      }),
      goldTrunkMat: new THREE.MeshStandardMaterial({ color: "#a8842f", roughness: 0.6, metalness: 0.4 }),
    };
    lib.all = [lib.trunk, lib.canopy, lib.bush, lib.stilt, lib.trunkMat, lib.pioneerMat,
      lib.goldMat, lib.goldTrunkMat, ...lib.leafMats];
    return lib;
  }

  // ---- one tree, shaped by species ----
  function makeTree(entry, i, lib, rand) {
    const g = new THREE.Group();
    const q = entry.q ?? 0.7;
    const role = entry.sp === "real" ? "real" : (CONFIG.species[entry.sp]?.role || "tree");
    const isMangrove = entry.sp === "mangrove";
    const leafMat = entry.sp === "real" ? lib.goldMat
      : isMangrove ? lib.leafMats[3]
      : lib.leafMats[i % 3];
    const trunkMat = entry.sp === "real" ? lib.goldTrunkMat : lib.trunkMat;

    if (role === "pioneer") {
      // hemp/cannabis: a slim glowing stalk with a leaf tuft
      const stalk = new THREE.Mesh(lib.stilt, trunkMat);
      stalk.scale.set(0.8, 1.1, 0.8); stalk.position.y = 0.27;
      const tuft = new THREE.Mesh(lib.bush, lib.pioneerMat);
      tuft.position.y = 0.58; tuft.scale.set(1, 0.75, 1);
      g.add(stalk, tuft);
    } else {
      const h = 0.75 + q * 0.75;
      const trunk = new THREE.Mesh(lib.trunk, trunkMat);
      trunk.scale.y = h; trunk.position.y = h / 2;
      g.add(trunk);
      if (isMangrove) {
        for (let k = 0; k < 4; k++) {                       // stilt roots
          const st = new THREE.Mesh(lib.stilt, trunkMat);
          const a = (k / 4) * Math.PI * 2 + rand();
          st.position.set(Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14);
          st.rotation.z = Math.cos(a) * 0.5; st.rotation.x = Math.sin(a) * 0.5;
          g.add(st);
        }
      }
      const blobs = role === "real" ? 2 : 1 + ((i * 7) % 2);
      for (let k = 0; k <= blobs; k++) {
        const c = new THREE.Mesh(lib.canopy, leafMat);
        c.position.set((rand() - 0.5) * 0.35, h + 0.15 + k * 0.24, (rand() - 0.5) * 0.35);
        const cs = (1 - k * 0.22) * (0.8 + q * 0.4);
        c.scale.set(cs, cs * 0.8, cs);
        g.add(c);
      }
    }
    // golden-angle spiral placement — real trees claim the inner rings
    const idx = entry.sp === "real" ? i : i + 6;
    const r = 0.62 * Math.sqrt(idx) + 0.55;
    const th = idx * 2.39996 + rand() * 0.2;
    g.position.set(Math.cos(th) * r, 0, Math.sin(th) * r);
    g.scale.setScalar((0.72 + q * 0.5) * (0.9 + rand() * 0.25));
    g.rotation.y = rand() * Math.PI * 2;
    return g;
  }

  function buildFireflies(count) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const base = [];
    for (let i = 0; i < count; i++) {
      const p = new THREE.Vector3((Math.random() - 0.5) * 12, 0.4 + Math.random() * 3.4, (Math.random() - 0.5) * 12);
      base.push(p); positions.set([p.x, p.y, p.z], i * 3);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: "#ffd966", size: 0.12, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    return { points: new THREE.Points(geo, mat), base, geo, mat };
  }

  function mount(container) {
    if (!ok() || !container) return null;
    const entries = [...(State.get().grove || [])].sort((a, b) => (a.sp === "real" ? -1 : 1) - (b.sp === "real" ? -1 : 1));

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 460;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      if (window.Launch) Launch.noteFailure("context");
      return null;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06140d, 9, 20);
    const cam = new THREE.PerspectiveCamera(42, w / h, 0.1, 60);

    scene.add(new THREE.AmbientLight(0x2a3d2c, 1.7));
    const key = new THREE.DirectionalLight(0xfff2cc, 2.0);
    key.position.set(4, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -12;
    key.shadow.camera.right = key.shadow.camera.top = 12;
    key.shadow.bias = -0.002;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3dff88, 0.9);
    rim.position.set(-5, 3, -5); scene.add(rim);
    const heart = new THREE.PointLight(0xffd966, entries.some((e) => e.sp === "real") ? 10 : 0, 7, 2);
    heart.position.set(0, 1.4, 0); scene.add(heart);

    // ground: big mossy disc + darker outer ring
    const groundGeo = new THREE.CircleGeometry(11, 48);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: "#16351f", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const rimGeo = new THREE.RingGeometry(11, 16, 48);
    const rimDisc = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: "#07130c", roughness: 0.3, metalness: 0.7 }));
    rimDisc.rotation.x = -Math.PI / 2; rimDisc.position.y = -0.01; scene.add(rimDisc);

    const lib = makeLib();
    const forest = new THREE.Group();
    const rand = rng(42);
    entries.forEach((e, i) => forest.add(makeTree(e, i, lib, rand)));
    forest.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    scene.add(forest);

    const flies = buildFireflies(70);
    scene.add(flies.points);

    // camera: slow orbit; drag adjusts angle, wheel zooms
    let ang = 0.6, dragging = false, lastX = 0, dist = Math.min(14, 7 + Math.sqrt(entries.length) * 0.55);
    function onDown(e) { dragging = true; lastX = (e.touches ? e.touches[0] : e).clientX; }
    function onMove(e) { if (!dragging) return; const x = (e.touches ? e.touches[0] : e).clientX; ang += (x - lastX) * 0.008; lastX = x; }
    function onUp() { dragging = false; }
    function onWheel(e) { e.preventDefault(); dist = Math.max(4.5, Math.min(18, dist + e.deltaY * 0.01)); }
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0, dead = false;
    const t0 = performance.now();
    function tick() {
      if (dead) return;
      const t = (performance.now() - t0) / 1000;
      const a = ang + (dragging ? 0 : t * 0.06);
      cam.position.set(Math.cos(a) * dist, 3 + Math.sin(t * 0.3) * 0.3 + dist * 0.16, Math.sin(a) * dist);
      cam.lookAt(0, 0.7, 0);
      heart.intensity && (heart.intensity = 10 * (1 + Math.sin(t * 1.8) * 0.2));
      const pa = flies.geo.attributes.position;
      flies.base.forEach((p, i) => {
        pa.setXYZ(i, p.x + Math.sin(t * 0.4 + i) * 0.3, p.y + Math.sin(t * 0.55 + i * 1.7) * 0.2, p.z + Math.cos(t * 0.3 + i) * 0.3);
      });
      pa.needsUpdate = true;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    }
    tick();

    const handle = {
      dispose() {
        if (dead) return;
        dead = true;
        cancelAnimationFrame(raf);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        lib.all.forEach((d) => d.dispose());
        groundGeo.dispose(); ground.material.dispose();
        rimGeo.dispose(); rimDisc.material.dispose();
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

  return { mount, disposeAll, ok };
})();
window.Grove = Grove;
