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
  mouse: { x: 0, y: 0, down: false, rdown: false },
  btn: {}, castAim: null, hitButton: null,
  touch: false,
  lstick: null,
  rstick: null,
  wheel: 0,
  take(code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },
  // WASD / arrow keys, or the left stick
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
  // a skill button being dragged to aim, if any
  drag() {
    for (const id in this.btn) {
      const b = this.btn[id];
      if (b.skill && Math.hypot(b.x - b.ox, b.y - b.oy) > 16) return b;
    }
    return null;
  },
  // is a finger down on this on-screen button right now?
  held(id) { for (const k in this.btn) if (this.btn[k].id === id) return true; return false; },
  init(canvas) {
    // a phone or tablet: lay the screen out for thumbs from the first frame, not after the first touch
    try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) { this.touch = true; document.body.classList.add('touch'); } } catch (e) { /* old browser */ }
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; this.mouse.rdown = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) { this.mouse.down = true; this.pressed.lclick = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.pressed.rclick = true; }
      if (e.button === 1) { this.pressed.mclick = true; e.preventDefault(); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // Touch: left stick to move; the on-canvas buttons attack and cast.
    // Skill buttons fire on release, so you can drag one to aim it first.
    const tstart = (e) => {
      e.preventDefault();
      this.touch = true; this.pressed.tap = true;
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        const id = this.hitButton ? this.hitButton(t.clientX, t.clientY) : null;
        if (id) {
          const skill = 'qer'.includes(id);
          this.btn[t.identifier] = { id, skill, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
          if (id === 'atk') { this.keys.btn_atk = true; this.pressed.btn_atk = true; }
          else if (!skill) this.pressed['btn_' + id] = true;
        } else if (!this.lstick && t.clientX < innerWidth * 0.6) {
          this.lstick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        }
      }
    };
    const tmove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.lstick && this.lstick.id === t.identifier) { this.lstick.x = t.clientX; this.lstick.y = t.clientY; }
        const b = this.btn[t.identifier];
        if (b) { b.x = t.clientX; b.y = t.clientY; }
      }
    };
    const tend = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.lstick && this.lstick.id === t.identifier) this.lstick = null;
        const b = this.btn[t.identifier];
        if (!b) continue;
        delete this.btn[t.identifier];
        if (b.id === 'atk') this.keys.btn_atk = false;
        else if (b.skill) {
          const dx = b.x - b.ox, dy = b.y - b.oy, m = Math.hypot(dx, dy);
          this.castAim = m > 16 ? { a: Math.atan2(dy / 0.62, dx), d: Math.min(1, m / 80) } : null;
          this.pressed['btn_' + b.id] = true;
        }
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
  rate: 1,
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
    f *= this.rate; slide *= this.rate; // rate: a pitch shift for whatever is played while it is set
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
    // one burst of noise per length, made once and replayed: no buffer to fill on every hit
    const cache = this.noises || (this.noises = {});
    let buf = cache[n];
    if (!buf) { buf = cache[n] = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n); }
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
  // v: an optional variation (combo step / combo count) that shifts the pitch
  play(name, v = 0) {
    switch (name) {
      case 'shoot': this.tone(620, 0.06, 'square', 0.03, -300); break;
      case 'keys': this.noise(0.08, 0.05, 0, 2500); this.tone(900, 0.04, 'square', 0.02); break;
      case 'lob': this.tone(300, 0.18, 'sine', 0.05, 200); break;
      case 'plane': this.tone(1100, 0.09, 'triangle', 0.04, -500); break;
      case 'book': this.tone(160, 0.14, 'sawtooth', 0.05, -60); break;
      case 'hit': this.noise(0.06, 0.12, 0, 1100); this.tone(150 + (v % 5) * 14, 0.09, 'square', 0.08, -90); this.tone(70, 0.1, 'sine', 0.12, -25); break;
      case 'kill': this.tone(520, 0.12, 'square', 0.06, -380); this.noise(0.14, 0.1, 0, 500); this.tone(64, 0.28, 'sine', 0.18, -24); break;
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
      case 'slash': this.noise(v === 3 ? 0.16 : 0.1, 0.07, 0, v === 3 ? 1400 : 2200); this.tone(430 + v * 90, v === 3 ? 0.14 : 0.08, 'sawtooth', 0.03, -360); break;
      case 'hit2': this.noise(0.16, 0.2, 0, 300); this.tone(1700, 0.025, 'square', 0.07); this.tone(110, 0.18, 'square', 0.12, -70); this.tone(58, 0.3, 'sine', 0.22, -22); break;
      case 'ult': this.noise(0.5, 0.16); this.tone(70, 0.5, 'sine', 0.14, -30); this.tone(240, 0.25, 'square', 0.06, -150); break;
      case 'open': this.noise(0.1, 0.05, 0, 1200); this.tone(520, 0.08, 'triangle', 0.05, 200, 0.05); break;
    }
  },
};
