// =============================================================================
// engine.js — game feel: synthesized sound effects (WebAudio, zero assets)
// and visual juice (floating reward numbers, emoji bursts, screen shake).
// =============================================================================

const Sfx = (() => {
  let ctx = null;
  let muted = localStorage.getItem("tg_muted") === "1";

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One enveloped oscillator note. `slide` bends the pitch over the note.
  function tone(freq, dur, type = "sine", vol = 0.12, when = 0, slide = 0) {
    if (muted) return;
    try {
      const c = ac();
      const t0 = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  return {
    click:   () => tone(660, 0.05, "triangle", 0.05),
    pop:     () => tone(440, 0.12, "triangle", 0.16, 0, 320),          // planting
    coin:    () => { tone(880, 0.07, "square", 0.05); tone(1318, 0.12, "square", 0.05, 0.07); },
    good:    () => { [523, 659, 784].forEach((f, i) => tone(f, 0.12, "sine", 0.11, i * 0.09)); },
    bad:     () => tone(196, 0.28, "sawtooth", 0.06, 0, -60),
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.11, i * 0.11)); },
    combo:   (n) => { const f = 440 * Math.pow(1.122, Math.min(n, 10)); tone(f, 0.1, "square", 0.07); tone(f * 1.5, 0.14, "square", 0.05, 0.08); },
    epic:    () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, "triangle", 0.11, i * 0.09)); },
    isMuted: () => muted,
    toggle() { muted = !muted; localStorage.setItem("tg_muted", muted ? "1" : "0"); return muted; },
  };
})();

// -----------------------------------------------------------------------------
// Ambience — a living forest soundscape, fully synthesized (no audio files).
// Wind = looped brown-ish noise through a gusting lowpass; birds = randomized
// sine trills; footsteps = low thumps. Scenes: 'ui' (soft) / 'world' (full).
// Honors the same mute toggle as Sfx.
// -----------------------------------------------------------------------------
const Ambience = (() => {
  let ctx = null, master = null, windFilter = null, started = false;
  let scene = "ui", birdTimer = null;

  function targetGain() {
    return Sfx.isMuted() ? 0 : scene === "world" ? 0.11 : 0.045;
  }
  function fade() {
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 1.2);
  }

  function start() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // wind: 2s brown-noise loop → gusting lowpass
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = "lowpass"; windFilter.frequency.value = 420; windFilter.Q.value = 0.6;
      const windGain = ctx.createGain(); windGain.gain.value = 0.6;
      src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
      src.start();
      // slow gust LFO on the filter cutoff
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 170;
      lfo.connect(lg); lg.connect(windFilter.frequency); lfo.start();

      scheduleBird();
      schedulePad();
      fade();
    } catch (e) { /* no audio — game plays silent */ }
  }

  // gentle evolving pad — two-octave-down triads, long swells, never loud
  let padTimer = null;
  const PAD_CHORDS = [
    [220, 277.18, 329.63], [196, 246.94, 293.66],
    [174.61, 220, 261.63], [146.83, 196, 220],
  ];
  function schedulePad() {
    clearTimeout(padTimer);
    if (ctx && !Sfx.isMuted()) {
      const notes = PAD_CHORDS[Math.floor(Math.random() * PAD_CHORDS.length)];
      const t0 = ctx.currentTime;
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f / 2;
        o.detune.value = (Math.random() - 0.5) * 9;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.05 / (i + 1), t0 + 4.5);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 16);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + 17);
      });
    }
    padTimer = setTimeout(schedulePad, 12000 + Math.random() * 6000);
  }

  function chirp() {
    if (!ctx || Sfx.isMuted()) return;
    const t0 = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2100 + Math.random() * 1500;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      const f = base * (1 - 0.11 * i) + Math.random() * 180;
      const ts = t0 + i * 0.095;
      o.frequency.setValueAtTime(f, ts);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, ts + 0.07);
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(0.05, ts + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.085);
      o.connect(g); g.connect(master);
      o.start(ts); o.stop(ts + 0.1);
    }
  }
  function scheduleBird() {
    clearTimeout(birdTimer);
    birdTimer = setTimeout(() => { chirp(); scheduleBird(); },
      (scene === "world" ? 2500 : 6500) + Math.random() * 8000);
  }

  function setScene(s) {
    scene = s;
    if (started) { fade(); scheduleBird(); }
  }

  // soft ground thump — Explore-mode footsteps
  function footstep() {
    if (!ctx || Sfx.isMuted()) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(72 + Math.random() * 22, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.08);
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.1);
  }

  return { start, setScene, footstep, refresh: fade, isStarted: () => started };
})();
window.Ambience = Ambience;

const FX = (() => {
  // Floating "+30 EXP" number drifting up from an element.
  function floatOver(elm, text, color = "#4ade80") {
    if (!elm) return;
    const r = elm.getBoundingClientRect();
    const n = document.createElement("div");
    n.className = "fx-float";
    n.textContent = text;
    n.style.color = color;
    n.style.left = r.left + r.width / 2 + (Math.random() * 90 - 45) + "px";
    n.style.top = r.top + r.height * 0.3 + "px";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1400);
  }

  // Radial emoji particle burst centred on an element.
  function burst(elm, glyphs = ["🍃", "🌱", "✨"]) {
    if (!elm) return;
    const r = elm.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 160);
    for (let i = 0; i < 12; i++) {
      const p = document.createElement("span");
      p.className = "fx-p";
      p.textContent = glyphs[i % glyphs.length];
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
      const d = 46 + Math.random() * 74;
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.setProperty("--dx", Math.cos(a) * d + "px");
      p.style.setProperty("--dy", Math.sin(a) * d - 40 + "px");
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  }

  function shake() {
    document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 420);
  }

  return { floatOver, burst, shake };
})();
