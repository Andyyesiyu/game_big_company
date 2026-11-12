'use strict';
// ---------- math helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ---------- input ----------
const Input = {
  keys: {},
  pressed: {},
  mouse: { x: 0, y: 0, down: false },
  touch: false,
  lstick: null,
  rstick: null,
  wheel: 0,
  take(code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },
  moveVec() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (this.lstick) {
      const dx = this.lstick.x - this.lstick.ox, dy = this.lstick.y - this.lstick.oy;
      const m = Math.hypot(dx, dy);
      if (m > 8) { x = dx / Math.max(m, 44); y = dy / Math.max(m, 44); }
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  },
  init(canvas) {
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.pressed.Space = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    const tstart = (e) => {
      e.preventDefault();
      this.touch = true;
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !this.lstick) {
          this.lstick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        } else if (!this.rstick) {
          this.rstick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        }
      }
    };
    const tmove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const s of [this.lstick, this.rstick]) {
          if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; }
        }
      }
    };
    const tend = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.lstick && this.lstick.id === t.identifier) this.lstick = null;
        if (this.rstick && this.rstick.id === t.identifier) this.rstick = null;
      }
    };
    canvas.addEventListener('touchstart', tstart, { passive: false });
    canvas.addEventListener('touchmove', tmove, { passive: false });
    canvas.addEventListener('touchend', tend, { passive: false });
    canvas.addEventListener('touchcancel', tend, { passive: false });
  },
};

// ---------- tiny synth ----------
const Sfx = {
  ctx: null,
  muted: false,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d, type = 'square', vol = 0.06, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + d + 0.02);
  },
  noise(d, vol = 0.08, delay = 0, hp = 0) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * d);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; g.gain.value = vol;
    let node = s;
    if (hp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = hp;
      s.connect(f); node = f;
    }
    node.connect(g).connect(this.ctx.destination);
    s.start(this.ctx.currentTime + delay);
  },
  play(name) {
    switch (name) {
      case 'shoot': this.tone(620, 0.06, 'square', 0.03, -300); break;
      case 'keys': this.noise(0.08, 0.05, 0, 2500); this.tone(900, 0.04, 'square', 0.02); break;
      case 'lob': this.tone(300, 0.18, 'sine', 0.05, 200); break;
      case 'plane': this.tone(1100, 0.09, 'triangle', 0.04, -500); break;
      case 'book': this.tone(160, 0.14, 'sawtooth', 0.05, -60); break;
      case 'hit': this.tone(220, 0.05, 'square', 0.03, -80); break;
      case 'kill': this.tone(420, 0.1, 'square', 0.04, -300); this.noise(0.08, 0.04); break;
      case 'hurt': this.tone(140, 0.2, 'sawtooth', 0.08, -80); this.noise(0.12, 0.06); break;
      case 'dash': this.noise(0.12, 0.05, 0, 1800); break;
      case 'pickup': this.tone(660, 0.07, 'square', 0.04); this.tone(990, 0.1, 'square', 0.04, 0, 0.07); break;
      case 'boom': this.noise(0.35, 0.12); this.tone(90, 0.3, 'sine', 0.1, -50); break;
      case 'snap': this.tone(1800, 0.03, 'square', 0.08); this.noise(0.5, 0.07, 0.03, 3000); this.tone(110, 0.6, 'sine', 0.08, -60, 0.03); break;
      case 'warn': this.tone(880, 0.1, 'square', 0.04); this.tone(660, 0.1, 'square', 0.04, 0, 0.12); break;
      case 'tick': this.tone(1000, 0.03, 'square', 0.03); break;
      case 'safe': this.tone(523, 0.08, 'triangle', 0.06); this.tone(659, 0.08, 'triangle', 0.06, 0, 0.08); this.tone(784, 0.14, 'triangle', 0.06, 0, 0.16); break;
      case 'boss': this.tone(110, 0.5, 'sawtooth', 0.07, -40); this.tone(165, 0.5, 'sawtooth', 0.05, -40, 0.15); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.06, 0, i * 0.12)); break;
      case 'dead': [400, 300, 200, 120].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.06, 0, i * 0.16)); break;
      case 'laser': this.tone(200, 0.3, 'sawtooth', 0.04, 300); break;
      case 'ui': this.tone(740, 0.05, 'square', 0.03); break;
    }
  },
};
