// =============================================================================
// arcade.js — SEED STORM: the core planting game. A real arcade loop:
// seeds rain down; click them inside the glowing soil band to plant (closer to
// the band's heart = better tree). Don't click rocks or toxic barrels. Douse
// fires before they eat your saplings. Chain good plants for a multiplier;
// chain hard enough to trigger BLOOM RUSH. 45 seconds; perfects add time.
//
// API: Arcade.start(host, {species, difficulty, biomeName, best}, onRunEnd)
//        onRunEnd(results) => rewardSummary (displayed on the end screen)
//      Arcade.stopAll() — call before any screen re-render.
// =============================================================================

const Arcade = (() => {
  const live = new Set();

  function start(host, opts, onRunEnd) {
    stopAll();
    const run = new Run(host, opts, onRunEnd);
    live.add(run);
    window.__run = run; // dev/debug handle
    return run;
  }
  function stopAll() { [...live].forEach((r) => r.destroy()); }

  class Run {
    constructor(host, opts, onRunEnd) {
      this.host = host; this.opts = opts; this.onRunEnd = onRunEnd;
      this.build();
      this.reset();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    build() {
      this.host.innerHTML = `<div class="arcade"><canvas></canvas><div class="arc-end" style="display:none"></div></div>`;
      this.wrap = this.host.querySelector(".arcade");
      this.cv = this.host.querySelector("canvas");
      this.endEl = this.host.querySelector(".arc-end");
      const w = Math.min(860, this.host.clientWidth || 860);
      this.W = w; this.H = Math.max(420, Math.min(500, Math.round(w * 0.56)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
      this.cv.style.width = this.W + "px"; this.cv.style.height = this.H + "px";
      this.x = this.cv.getContext("2d");
      this.x.scale(dpr, dpr);
      this.onDown = (e) => this.tap(e);
      this.cv.addEventListener("pointerdown", this.onDown);
      this.host.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    reset() {
      // seeded runs (Daily Storm): same RNG stream every attempt, every player
      if (this.opts.seed != null) {
        let a = this.opts.seed | 0;
        this.rnd = () => {
          a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      } else this.rnd = Math.random;
      const d = this.opts.difficulty || 0;
      this.t = 0; this.last = performance.now();
      this.timeLeft = this.opts.tutorial ? 30 : 45; this.bonusGiven = 0;
      this.seeds = []; this.trees = []; this.fires = []; this.parts = []; this.pops = [];
      this.score = 0; this.combo = 0; this.bestCombo = 0; this.missed = 0; this.doused = 0;
      this.fever = 0; this.spawnAt = 0; this.flash = 0; this.shake = 0;
      this.groundY = this.H - 56;
      this.bandBase = this.H - 168; this.bandY = this.bandBase; this.bandHalf = 52;
      this.diff = d;
      this.mech = this.opts.species.mech || null;   // species superpower
      this.rainBoost = 0; this.detoxed = 0; this.swept = 0;
      this.over = false;
      this.endEl.style.display = "none";
    }

    // ---- input ----
    tap(e) {
      if (this.over) return;
      const r = this.cv.getBoundingClientRect();
      // Object coordinates are in internal pixels; the canvas element can be
      // CSS-shrunk (max-width:100%), so scale the tap point or the right
      // side of the field becomes untappable.
      const sx = r.width ? this.W / r.width : 1, sy = r.height ? this.H / r.height : 1;
      const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
      // nearest interactive object within reach
      let best = null, bd = 34;
      this.fires.forEach((f) => {
        const tr = this.trees[f.tree]; if (!tr) return;
        const dx = tr.x - px, dy = this.groundY - 26 - py, dd = Math.hypot(dx, dy);
        if (dd < bd + 8) { best = { kind: "fire", obj: f }; bd = dd; }
      });
      this.seeds.forEach((s) => {
        const dd = Math.hypot(s.x - px, s.y - py);
        if (dd < bd) { best = { kind: s.type, obj: s }; bd = dd; }
      });
      if (!best) return;

      if (best.kind === "power") {
        const s = best.obj;
        this.seeds.splice(this.seeds.indexOf(s), 1);
        if (s.sub === "time") {
          this.timeLeft = Math.min(60, this.timeLeft + 5);
          this.pop(px, py, "⏳ +5s", "#7dd3fc", 1.3);
        } else { // rain: douse every fire + bless the next 8 plants
          this.fires = [];
          this.rainBoost = 8;
          this.pop(px, py, "💧 RAIN - fires out, +quality ×8", "#7dd3fc", 1.2);
        }
        Sfx.good();
        return;
      }
      if (best.kind === "seed") {
        const s = best.obj;
        this.seeds.splice(this.seeds.indexOf(s), 1);
        let q = Math.max(0.2, Math.min(1, 1 - Math.abs(s.y - this.bandY) / (this.bandHalf * 1.35)));
        if (this.rainBoost > 0) { q = Math.min(1, q + 0.1); this.rainBoost--; }
        const inBand = Math.abs(s.y - this.bandY) <= this.bandHalf;
        if (!inBand) { // planted outside the band — weak sapling, chain broken
          this.combo = 0;
          this.plant(s.x, 0.3, false);
          Sfx.bad();
          return;
        }
        this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
        const mult = this.mult();
        const perfect = q >= 0.88;
        if (perfect && this.timeLeft < 60 && this.bonusGiven < 15) { this.timeLeft += 0.8; this.bonusGiven++; }
        const pts = Math.round(100 * q * mult * (this.fever > 0 ? 2 : 1));
        this.score += pts;
        this.plant(s.x, q, perfect);
        this.pop(s.x, s.y, (perfect ? "PERFECT +" : "+") + pts, perfect ? "#ffd94d" : "#7dffa8");
        if (this.combo >= 2) Sfx.combo(this.combo); else Sfx.pop();
        if (this.combo === 9 && this.fever <= 0) { this.fever = 6; this.pop(this.W / 2, this.H * 0.35, "🌸 BLOOM RUSH! 🌸", "#ffd94d", 1.6); Sfx.epic(); }
        // 🌿 CANOPY (giants): every 5-chain sweeps all hazards off the sky
        if (this.mech === "canopy" && this.combo > 0 && this.combo % 5 === 0) {
          let swept = 0;
          for (let i = this.seeds.length - 1; i >= 0; i--) {
            if (this.seeds[i].type === "rock" || this.seeds[i].type === "barrel") {
              this.pop(this.seeds[i].x, this.seeds[i].y, "+50", "#7dffa8", 0.9);
              this.seeds.splice(i, 1);
              this.score += 50 * mult; swept++;
            }
          }
          if (swept) { this.swept += swept; this.pop(this.W / 2, this.H * 0.3, `🌿 CANOPY SWEEP ×${swept}`, "#7dffa8", 1.3); Sfx.good(); }
        }
      } else if (best.kind === "fire") {
        const f = best.obj;
        this.fires.splice(this.fires.indexOf(f), 1);
        this.doused++;
        const pts = 75 * this.mult();
        this.score += pts;
        this.pop(px, py, `💧 +${pts}`, "#7dd3fc");
        Sfx.coin();
      } else { // rock / barrel
        const s = best.obj;
        this.seeds.splice(this.seeds.indexOf(s), 1);
        // 🧪 DETOX (pioneers): barrels are prey, not poison
        if (this.mech === "detox" && best.kind === "barrel") {
          const pts = 120 * this.mult();
          this.score += pts; this.detoxed++;
          this.pop(px, py, `🧪 DETOXED +${pts}`, "#a3e635", 1.2);
          Sfx.coin();
          return;
        }
        this.combo = 0; this.timeLeft = Math.max(1, this.timeLeft - 2);
        this.flash = 0.5; this.shake = 0.4;
        this.pop(px, py, best.kind === "rock" ? "🪨 -2s" : "☢️ -2s", "#f87171", 1.2);
        Sfx.bad();
      }
    }

    mult() { return Math.min(8, 1 + Math.floor(this.combo / 3)); }

    plant(px, q, perfect) {
      this.trees.push({ x: Math.max(16, Math.min(this.W - 16, px)), q, born: this.t });
      for (let i = 0; i < (perfect ? 10 : 5); i++) {
        this.parts.push({ x: px, y: this.bandY, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 2.4, life: 0.9, c: perfect ? "#ffd94d" : "#7dffa8" });
      }
    }

    pop(px, py, txt, c, scale) {
      this.pops.push({ x: px, y: py, txt, c, life: 1, scale: scale || 1 });
    }

    // ---- simulation ----
    step(dt) {
      this.t += dt;
      this.timeLeft -= dt;
      if (this.fever > 0) this.fever -= dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.shake > 0) this.shake -= dt;
      if (this.timeLeft <= 0) return this.finish();

      // 🌊 TIDE (mangrove): the planting band breathes with the sea
      if (this.mech === "mangrove") this.bandY = this.bandBase + Math.sin(this.t * 0.55) * 34;

      // spawn: quickens over the run; fever doubles the rain
      this.spawnAt -= dt;
      if (this.spawnAt <= 0) {
        const tut = this.opts.tutorial;
        const base = Math.max(0.42, 0.85 - this.t * 0.008 - this.diff * 0.05) * (tut ? 1.25 : 1);
        this.spawnAt = base * (this.fever > 0 ? 0.5 : 1);
        // tutorial: no hazards for the first 12s — let them learn the catch
        const hazardP = tut && this.t < 12 ? 0 : Math.min(0.3, 0.1 + this.diff * 0.04 + this.t * 0.002);
        const roll = this.rnd();
        let type = this.fever > 0 ? "seed" : roll < hazardP ? (this.rnd() < 0.5 ? "rock" : "barrel") : "seed";
        let sub = null;
        // rare power-ups drift down among the seeds (not in tutorials)
        if (type === "seed" && !tut && this.rnd() < 0.045) {
          type = "power";
          sub = this.rnd() < 0.5 ? "time" : "rain";
        }
        this.seeds.push({
          type, sub, x: 24 + this.rnd() * (this.W - 48), y: -16,
          vy: (52 + this.t * 1.3 + this.diff * 8) * (0.85 + this.rnd() * 0.35) * (tut ? 0.72 : 1),
          drift: (this.rnd() - 0.5) * 26, phase: this.rnd() * 6,
        });
      }

      // fall
      for (let i = this.seeds.length - 1; i >= 0; i--) {
        const s = this.seeds[i];
        s.y += s.vy * dt;
        s.x += Math.sin(this.t * 2 + s.phase) * s.drift * dt;
        if (s.y > this.groundY - 6) {
          this.seeds.splice(i, 1);
          if (s.type === "seed") { this.missed++; this.combo = 0; this.pop(s.x, this.groundY - 14, "wilted", "#8a8f8a", 0.85); }
        }
      }

      // fires ignite planted trees as the run heats up (🛡️ IRONBARK is immune)
      if (this.mech !== "fireproof" && this.trees.length > 2 && this.rnd() < dt * (0.05 + this.diff * 0.02 + this.t * 0.0015)) {
        const idx = Math.floor(this.rnd() * this.trees.length);
        if (!this.fires.some((f) => f.tree === idx)) this.fires.push({ tree: idx, t: 2.6 });
      }
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        f.t -= dt;
        if (f.t <= 0) {
          this.fires.splice(i, 1);
          if (this.trees[f.tree]) { this.trees.splice(f.tree, 1); this.fires.forEach((g) => { if (g.tree > f.tree) g.tree--; }); }
          this.combo = 0; this.flash = 0.4;
          this.pop(this.W / 2, this.groundY - 40, "🔥 a sapling burned!", "#f87171", 1.1);
          Sfx.bad();
        }
      }

      // particles / popups
      this.parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt * 1.4; });
      this.parts = this.parts.filter((p) => p.life > 0);
      this.pops.forEach((p) => { p.y -= 34 * dt; p.life -= dt * 0.9; });
      this.pops = this.pops.filter((p) => p.life > 0);
    }

    // ---- render ----
    draw() {
      const x = this.x, W = this.W, H = this.H;
      x.save();
      if (this.shake > 0) x.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);

      // sky
      const bg = x.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, this.fever > 0 ? "#2a2408" : "#0a1a10");
      bg.addColorStop(1, "#06140d");
      x.fillStyle = bg; x.fillRect(-8, -8, W + 16, H + 16);

      // planting band — the glowing sweet zone
      const glow = 0.16 + Math.sin(this.t * 3.4) * 0.05 + (this.fever > 0 ? 0.12 : 0);
      const grd = x.createLinearGradient(0, this.bandY - this.bandHalf, 0, this.bandY + this.bandHalf);
      grd.addColorStop(0, "rgba(74,222,128,0)");
      grd.addColorStop(0.5, `rgba(74,222,128,${glow + 0.14})`);
      grd.addColorStop(1, "rgba(74,222,128,0)");
      x.fillStyle = grd;
      x.fillRect(0, this.bandY - this.bandHalf, W, this.bandHalf * 2);
      x.strokeStyle = `rgba(74,222,128,${glow + 0.25})`;
      x.setLineDash([8, 7]); x.lineWidth = 1.5;
      x.strokeRect(-4, this.bandY - this.bandHalf, W + 8, this.bandHalf * 2);
      x.setLineDash([]);
      x.fillStyle = `rgba(190,255,210,${0.5 + glow})`;
      x.font = "600 11px -apple-system, sans-serif"; x.textAlign = "left";
      x.fillText("PLANT IN THE LIGHT", 10, this.bandY - this.bandHalf - 6);

      // ground + your growing row of trees
      x.fillStyle = "#173523"; x.fillRect(0, this.groundY, W, H - this.groundY);
      x.fillStyle = "#0d2417"; x.fillRect(0, this.groundY, W, 5);
      x.textAlign = "center";
      this.trees.forEach((tr, i) => {
        const age = Math.min(1, (this.t - tr.born) / 1.2);
        const size = (13 + tr.q * 15) * (0.4 + age * 0.6);
        x.font = `${size}px serif`;
        x.fillText(tr.q >= 0.75 ? "🌳" : tr.q >= 0.45 ? "🌿" : "🌱", tr.x, this.groundY + 2);
        const f = this.fires.find((g) => g.tree === i);
        if (f) {
          x.font = `${20 + Math.sin(this.t * 14) * 4}px serif`;
          x.fillText("🔥", tr.x, this.groundY - 22);
          x.strokeStyle = "#f87171"; x.lineWidth = 2;
          x.beginPath(); x.arc(tr.x, this.groundY - 26, 17, -Math.PI / 2, -Math.PI / 2 + (f.t / 2.6) * Math.PI * 2); x.stroke();
        }
      });

      // falling things.
      // CENTER the glyph on (s.x, s.y): the hit-test in tap() measures distance
      // from exactly that point, but canvas defaults (textAlign:left,
      // textBaseline:alphabetic) drew the emoji offset ~13px right and ~11px up,
      // so a tap on the visible seed landed outside the 34px hitbox. This was
      // the "doesn't catch the seeds" bug.
      x.textAlign = "center"; x.textBaseline = "middle";
      this.seeds.forEach((s) => {
        if (s.type === "power") {
          x.beginPath();
          x.arc(s.x, s.y, 20 + Math.sin(this.t * 6) * 3, 0, Math.PI * 2);
          x.strokeStyle = "rgba(125,211,252,.75)"; x.lineWidth = 2.5; x.stroke();
          x.font = "24px serif";
          x.fillText(s.sub === "time" ? "⏳" : "💧", s.x, s.y);
          return;
        }
        x.font = "26px serif";
        if (s.type === "seed") x.fillText(this.fever > 0 ? "✨" : "🌰", s.x, s.y);
        else x.fillText(s.type === "rock" ? "🪨" : "🛢️", s.x, s.y);
      });
      x.textAlign = "left"; x.textBaseline = "alphabetic";

      // particles
      this.parts.forEach((p) => {
        x.globalAlpha = Math.max(0, p.life);
        x.fillStyle = p.c;
        x.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      x.globalAlpha = 1;

      // popup texts
      this.pops.forEach((p) => {
        x.globalAlpha = Math.max(0, p.life);
        x.fillStyle = p.c;
        x.font = `800 ${15 * p.scale}px -apple-system, sans-serif`;
        x.fillText(p.txt, p.x, p.y);
      });
      x.globalAlpha = 1;

      // HUD: timer bar
      const tw = Math.max(0, this.timeLeft / 60) * (W - 24);
      x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(12, 10, W - 24, 7);
      x.fillStyle = this.timeLeft < 8 ? "#f87171" : this.fever > 0 ? "#ffd94d" : "#4ade80";
      x.fillRect(12, 10, tw, 7);
      // score + combo
      x.textAlign = "left"; x.fillStyle = "#eafff0";
      x.font = "800 20px -apple-system, sans-serif";
      x.fillText(this.score.toLocaleString(), 12, 42);
      x.font = "600 11px -apple-system, sans-serif"; x.fillStyle = "#8fae9b";
      x.fillText(`${this.opts.species.emoji} ${this.opts.biomeName} · best ${this.opts.best ? this.opts.best.toLocaleString() : "-"}`, 12, 58);
      if (this.opts.species.mechLabel) {
        x.fillStyle = "#7dd3fc";
        x.fillText(this.opts.species.mechLabel, 12, 74);
      }
      if (this.rainBoost > 0) {
        x.fillStyle = "#7dd3fc";
        x.fillText(`💧 blessed ×${this.rainBoost}`, 12, 90);
      }
      if (this.combo >= 2) {
        x.textAlign = "center";
        const pulse = 1 + Math.sin(this.t * 9) * 0.08;
        x.font = `800 ${Math.min(30, 15 + this.combo) * pulse}px -apple-system, sans-serif`;
        x.fillStyle = this.fever > 0 ? "#ffd94d" : "#fb923c";
        x.fillText(`x${this.mult()} · ${this.combo} chain`, W / 2, 46);
      }
      if (this.fever > 0) {
        x.textAlign = "center"; x.fillStyle = "#ffd94d";
        x.font = "800 13px -apple-system, sans-serif";
        x.fillText(`🌸 BLOOM RUSH ${this.fever.toFixed(0)}s - DOUBLE EVERYTHING 🌸`, W / 2, 66);
      }
      // hazard flash
      if (this.flash > 0) { x.fillStyle = `rgba(248,113,113,${this.flash * 0.35})`; x.fillRect(-8, -8, W + 16, H + 16); }
      x.restore();
    }

    loop(now) {
      if (this.over) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      if (!this.over) { this.draw(); this.raf = requestAnimationFrame(this.loop); }
    }

    finish() {
      this.over = true;
      cancelAnimationFrame(this.raf);
      const results = {
        qualities: this.trees.map((t) => t.q),
        score: this.score, bestCombo: this.bestCombo,
        doused: this.doused, missed: this.missed, detoxed: this.detoxed,
      };
      try { if (window.Quests) Quests.onEvent("run", results); } catch (e) {}
      const summary = this.onRunEnd(results) || {};
      const newBest = this.score > (this.opts.best || 0);
      if (newBest) this.opts.best = this.score;
      this.endEl.style.display = "flex";
      this.endEl.innerHTML = `
        <div class="arc-card">
          <div class="arc-title">${newBest ? "🏆 NEW RECORD!" : "🌱 Run complete"}</div>
          <div class="arc-score">${this.score.toLocaleString()}</div>
          <div class="arc-stats">
            <span>🌳 ${results.qualities.length} planted</span>
            <span>🔥 x${Math.min(8, 1 + Math.floor(this.bestCombo / 3))} best</span>
            <span>💧 ${this.doused} doused</span>
            <span>🥀 ${this.missed} missed</span>
          </div>
          ${summary.html || ""}
          <div class="arc-btns">
            <button class="btn btn-primary" id="arc-again">🌱 Run it again</button>
            ${this.opts.shareText ? `<button class="btn" id="arc-share">📣 Share</button>` : ""}
            <button class="btn" id="arc-back">Done</button>
          </div>
        </div>`;
      const sh = this.endEl.querySelector("#arc-share");
      if (sh) sh.onclick = async () => {
        const text = this.opts.shareText(this.score);
        try {
          if (navigator.share) await navigator.share({ text });
          else await navigator.clipboard.writeText(text);
          sh.textContent = "✅ Shared";
        } catch (e) {}
      };
      this.endEl.querySelector("#arc-again").onclick = () => { Sfx.click(); this.reset(); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); };
      this.endEl.querySelector("#arc-back").onclick = () => { this.destroy(); if (this.opts.onDone) this.opts.onDone(); };
      if (newBest) Sfx.epic(); else Sfx.good();
    }

    destroy() {
      this.over = true;
      cancelAnimationFrame(this.raf);
      if (this.cv) this.cv.removeEventListener("pointerdown", this.onDown);
      if (this.wrap && this.wrap.parentElement) this.wrap.remove();
      live.delete(this);
    }
  }

  return { start, stopAll };
})();
window.Arcade = Arcade;
