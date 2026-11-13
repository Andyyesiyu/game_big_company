'use strict';
// ---------- 2.5D projection ----------
// World is a flat campus (x right, y "into the screen" downwards, z up).
// Everything standing on it is a billboard, depth-sorted by y.
// The look is cel-shaded: flat colour, one shade band, a dark ink outline.
const YK = 0.62; // vertical squash of the ground plane
// How much of each camera effect reaches the screen. Impacts should be felt, not make the view hard to read.
const CAM = { shake: 0.4, kick: 0.45, zoom: 0.5 };
const View = {
  safe: { t: 0, r: 0, b: 0, l: 0 }, W: 0, H: 0, S: 1, S0: 1, cam: { x: 0, y: 0 }, ox: 0, oy: 0, shake: 0, kx: 0, ky: 0, zk: 0 }; // kx/ky: hit kick, zk: zoom punch
const ARENA = { w: 4400, h: 4400 };
const INK = '#33294a';               // solid ink: HUD text and speech bubbles
const LINE = 'rgba(22,28,34,0.5)';   // soft edge for things in the world
const RENDER = { k: 1 };             // device pixels per world unit this frame
const SHADE = 'rgba(40,30,90,0.17)';
let ctx = null;

const sx = (x) => (x - View.cam.x) * View.S + View.W / 2 + View.ox;
const sy = (y, z = 0) => (y - View.cam.y) * View.S * YK + View.H / 2 - z * View.S + View.oy;
const screenToWorld = (px, py, z = 0) => (R3.on ? R3.unproject(px, py, z) : {
  x: (px - View.W / 2 - View.ox) / View.S + View.cam.x,
  y: (py - View.H / 2 - View.oy + z * View.S) / (View.S * YK) + View.cam.y,
});
// where a world point lands on screen, whichever renderer is drawing
const toScreen = (x, y, z = 0) => (R3.on ? R3.project(x, y, z) : { x: sx(x), y: sy(y, z), ok: true });
function onScreen(x, y, m = 160) {
  if (R3.on) return Math.abs(x - View.cam.x) < 900 + m && Math.abs(y - View.cam.y) < 1100 + m;
  const px = sx(x), py = sy(y), k = m * View.S;
  return px > -k && px < View.W + k && py > -k && py < View.H + k * 2;
}

function at(x, y, z, fn) {
  ctx.save();
  ctx.translate(sx(x), sy(y, z));
  ctx.scale(View.S, View.S);
  fn(ctx);
  ctx.restore();
}
// Draw directly in world coordinates on the ground plane (circles come out as ellipses).
function ground(fn) {
  ctx.save();
  ctx.translate(sx(0), sy(0));
  ctx.scale(View.S, View.S * YK);
  fn(ctx);
  ctx.restore();
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function rrS(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.stroke(); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function circS(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke(); }
function seg(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function poly(c, pts, stroke) {
  c.beginPath();
  for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fill();
  if (stroke) c.stroke();
}
function ink(c, w = 1.5) { c.strokeStyle = LINE; c.lineWidth = w * 0.7; c.lineJoin = 'round'; c.lineCap = 'round'; }

// Draw a figure through a scratch canvas so one soft light can be laid over the whole of it:
// warm from the upper-left, falling into cool shade at the lower-right. This is what stops
// characters reading as flat cut-outs.
const SCRATCH = document.createElement('canvas'), SC = SCRATCH.getContext('2d');
function lit(x, y, z, w, h, fn) {
  const k = RENDER.k, W = Math.ceil(w * k), H = Math.ceil(h * k), base = 16 * k;
  if (SCRATCH.width < W) SCRATCH.width = W;
  if (SCRATCH.height < H) SCRATCH.height = H;
  SC.setTransform(1, 0, 0, 1, 0, 0);
  SC.globalCompositeOperation = 'source-over'; SC.globalAlpha = 1;
  SC.clearRect(0, 0, W, H);
  SC.setTransform(k, 0, 0, k, W / 2, H - base);
  fn(SC);
  SC.setTransform(1, 0, 0, 1, 0, 0);
  SC.globalCompositeOperation = 'source-atop'; SC.globalAlpha = 1;
  const g = SC.createLinearGradient(W * 0.15, 0, W * 0.85, H);
  g.addColorStop(0, 'rgba(255,242,205,0.34)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(12,26,48,0.46)');
  SC.fillStyle = g; SC.fillRect(0, 0, W, H);
  SC.globalCompositeOperation = 'source-over';
  const dpr = k / View.S;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(SCRATCH, 0, 0, W, H, Math.round(sx(x) * dpr - W / 2), Math.round(sy(y, z) * dpr - (H - base)), W, H);
  ctx.restore();
}
function groundEllipse(x, y, r) {
  ctx.beginPath();
  ctx.ellipse(sx(x), sy(y), r * View.S, r * View.S * YK, 0, 0, TAU);
}
// ---------- sunlight ----------
// One sun, upper-left of the screen. Shadows fall down-right and lengthen towards dusk.
const SUN = { a: 0.6, len: 0.55, x: 0.45, y: 0.3 };
function setSun(day) {
  SUN.a = lerp(0.66, 0.4, day); SUN.len = lerp(0.5, 1.25, day);
  SUN.x = Math.cos(SUN.a) * SUN.len; SUN.y = Math.sin(SUN.a) * SUN.len;
}
// The shadow of something r wide and h tall standing at (x, y): a soft blob stretched away from the sun.
function shadow(x, y, r, a = 0.26, h) {
  if (h === undefined) h = r * 2.6;
  const half = (SUN.len * h) / 2;
  ctx.save();
  ctx.translate(sx(x), sy(y)); ctx.scale(View.S, View.S * YK); ctx.rotate(SUN.a);
  ctx.fillStyle = `rgba(36,44,104,${a})`;
  ctx.beginPath(); ctx.ellipse(half * 0.9, 0, r * 0.9 + half, r * 0.82, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
// The shadow a box throws on the ground.
function boxShadow(ob, a = 0.22) {
  const ox = SUN.x * ob.h, oy = SUN.y * ob.h;
  ground((c) => {
    c.fillStyle = `rgba(36,44,104,${a})`;
    c.beginPath();
    c.moveTo(ob.x, ob.y); c.lineTo(ob.x + ob.w, ob.y); c.lineTo(ob.x + ob.w + ox, ob.y + oy);
    c.lineTo(ob.x + ob.w + ox, ob.y + ob.d + oy); c.lineTo(ob.x + ox, ob.y + ob.d + oy); c.lineTo(ob.x, ob.y + ob.d);
    c.closePath(); c.fill();
  });
}

// ---------- characters ----------
function limb(c, x1, y1, x2, y2, col, w = 6) {
  c.strokeStyle = LINE; c.lineWidth = w + 2.8; seg(c, x1, y1, x2, y2);
  c.strokeStyle = col; c.lineWidth = w; seg(c, x1, y1, x2, y2);
  ink(c);
}
function drawHair(c, p) {
  c.fillStyle = p.hair || '#222';
  const s = p.hairStyle || 'short';
  if (s === 'bald') return;
  if (s === 'long') rrS(c, -15, -52, 8, 21, 4);
  c.beginPath();
  c.arc(0, -50, 13.6, Math.PI * 0.98, Math.PI * 2.02);
  c.closePath(); c.fill(); c.stroke();
  if (s === 'side') {
    c.beginPath(); c.ellipse(-3, -58, 11, 5.5, -0.25, 0, TAU); c.fill(); c.stroke();
  } else if (s === 'messy') {
    c.beginPath();
    c.moveTo(-13, -57);
    for (let i = -2; i <= 2; i++) { c.lineTo(i * 5 - 3.5, -58); c.lineTo(i * 5 + (i % 2 ? 2 : -1), -68 - Math.abs(i % 2) * 2); }
    c.lineTo(13, -57);
    c.closePath(); c.fill(); c.stroke();
  } else if (s === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      circS(c, Math.cos(a) * 12, -52 + Math.sin(a) * 11, 5.2);
    }
    circS(c, 0, -62, 6);
    circ(c, 0, -55, 9);
  }
}

// Billboard chibi. Origin at the feet, facing +x (flip with p.face = -1).
function drawPerson(c, p) {
  const t = p.t || 0, mv = p.moving && !p.kneel;
  const pace = p.pace || 11;
  const bob = mv ? -Math.abs(Math.sin(t * pace)) * 2.4 : Math.sin(t * 2.5) * 0.7;
  const sw = mv ? Math.sin(t * pace) * 6 : 0;
  const sc = p.scale || 1;
  c.save();
  c.scale((p.face || 1) * sc, sc);
  ink(c);
  if (p.pack) { c.fillStyle = p.pack; rrS(c, -20, -36 + bob, 10, 19, 3.5); c.fillStyle = SHADE; rr(c, -20, -27 + bob, 10, 10, 3); }
  if (p.kneel) {
    c.translate(0, 9);
    c.fillStyle = p.bottom || '#3b4a6b';
    rrS(c, -10, -12, 22, 8, 3);
  } else {
    c.fillStyle = p.bottom || '#3b4a6b';
    rrS(c, -8 + sw * 0.5, -13, 7, 12, 2.5);
    rrS(c, 1 - sw * 0.5, -13, 7, 12, 2.5);
    c.fillStyle = '#4a3327';
    rrS(c, -9 + sw * 0.5, -3.5, 10, 4, 1.8);
    rrS(c, 1 - sw * 0.5, -3.5, 10, 4, 1.8);
  }
  c.translate(0, bob);
  limb(c, -11, -31, -14, -19 - sw * 0.6, p.top);
  c.fillStyle = p.top;
  rrS(c, -12, -36, 24, 25, 7);
  const dark = (p.face || 1) > 0 ? 1 : -1; // local side facing away from the sun (the sun is screen-left)
  c.fillStyle = SHADE;
  if (dark > 0) rr(c, 3.2, -35.2, 8, 23.4, [0, 6, 6, 0]); else rr(c, -11.2, -35.2, 8, 23.4, [6, 0, 0, 6]);
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5;
  seg(c, -10.3 * dark, -32, -10.3 * dark, -17);
  ink(c);
  if (p.shirt) { c.fillStyle = p.shirt; poly(c, [-5, -36, 5, -36, 0, -24]); }
  if (p.tie) { c.fillStyle = p.tie; poly(c, [-1.5, -35, 1.5, -35, 2.6, -25, 0, -22, -2.6, -25]); }
  if (p.plaid) {
    c.strokeStyle = p.plaid; c.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { seg(c, i * 7, -35, i * 7, -12); seg(c, -11, -24 + i * 7, 11, -24 + i * 7); }
    ink(c);
  }
  if (p.badge) {
    c.strokeStyle = p.badge; c.lineWidth = 1.4;
    seg(c, -5, -35, 1, -25); seg(c, 5, -35, 1, -25);
    ink(c, 1);
    c.fillStyle = '#fff'; rrS(c, -2.5, -25, 7, 8, 1);
    c.fillStyle = p.badge; c.fillRect(-1.5, -23, 5, 2);
    ink(c);
  }
  if (p.logo) p.logo(c);
  const hx = p.armUp ? 18 : 15, hy = p.armUp ? -46 : -19 + sw * 0.6;
  limb(c, 11, -31, hx, hy, p.top);
  c.fillStyle = p.skin;
  circS(c, hx, hy, 3.6);
  // head
  circS(c, 0, -48, 13);
  c.save(); c.scale(-dark, 1);
  c.fillStyle = SHADE;
  c.beginPath(); c.arc(0, -48, 12.2, Math.PI * 0.55, Math.PI * 1.45); c.arc(7, -48, 15, Math.PI * 1.27, Math.PI * 0.73, true); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 1.6;
  c.beginPath(); c.arc(0, -48, 11.2, Math.PI * 1.78, Math.PI * 2.2); c.stroke();
  c.restore();
  ink(c);
  drawHair(c, p);
  if (p.band) {
    c.fillStyle = p.band;
    poly(c, [-13, -55, -21, -50, -19, -57], true);
    rrS(c, -13.5, -57, 27, 4.6, 1.5);
  }
  // face
  c.fillStyle = '#1b1b1b';
  if (p.scared) {
    c.fillStyle = '#fff'; ink(c, 1); circS(c, 3, -48, 3.2); circS(c, 9.5, -48, 3.2);
    c.fillStyle = '#1b1b1b'; circ(c, 3.5, -48, 1.4); circ(c, 10, -48, 1.4);
    c.beginPath(); c.ellipse(6.5, -41, 2.6, 3.2, 0, 0, TAU); c.fill();
  } else {
    c.beginPath(); c.ellipse(3, -48, 1.7, 2.3, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(9.5, -48, 1.7, 2.3, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,120,120,0.35)'; circ(c, 0.5, -43.5, 2.6);
    if (p.bags) {
      c.strokeStyle = 'rgba(60,40,80,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(3, -46, 2.4, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(9.5, -46, 2.4, 0.2, Math.PI - 0.2); c.stroke();
    }
    c.strokeStyle = '#1b1b1b'; c.lineWidth = 1.3;
    c.beginPath();
    if (p.smile) c.arc(6.5, -43.5, 3.4, 0.15, Math.PI - 0.15);
    else { c.moveTo(4, -41.5); c.lineTo(9, -41.5); }
    c.stroke();
  }
  if (p.glasses) {
    c.strokeStyle = p.glasses; c.lineWidth = 1.3;
    c.beginPath(); c.arc(2.5, -48, 4.3, 0, TAU); c.stroke();
    c.beginPath(); c.arc(10.5, -48, 4.3, 0, TAU); c.stroke();
    seg(c, -2, -48.5, -12, -50);
  }
  ink(c);
  if (p.extra) p.extra(c, hx, hy);
  c.restore();
}

function drawPenguin(c, t, face, scared) {
  c.save();
  c.scale(face || 1, 1);
  ink(c);
  c.fillStyle = '#f5a623';
  c.beginPath(); c.ellipse(-5, -1, 6, 3, 0, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(6, -1, 6, 3, 0, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#2b2d3a';
  const fl = Math.sin(t * 14) * 0.4;
  c.save(); c.translate(-12, -20); c.rotate(0.5 + fl); c.beginPath(); c.ellipse(0, 5, 4, 9, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
  c.save(); c.translate(12, -20); c.rotate(-0.5 - fl); c.beginPath(); c.ellipse(0, 5, 4, 9, 0, 0, TAU); c.fill(); c.stroke(); c.restore();
  c.beginPath(); c.ellipse(0, -17, 14, 17, 0, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#fafafa';
  c.beginPath(); c.ellipse(2.5, -13, 9, 12, 0, 0, TAU); c.fill();
  c.fillStyle = '#fff'; circ(c, 1, -25, 4.2); circ(c, 9, -25, 4.2);
  c.fillStyle = '#111'; circ(c, 2, -25, 1.8); circ(c, 10, -25, 1.8);
  c.fillStyle = '#f5a623';
  if (scared) { c.beginPath(); c.ellipse(6, -18.5, 5, 4.5, 0, 0, TAU); c.fill(); c.stroke(); }
  else { c.beginPath(); c.ellipse(6.5, -19.5, 6, 2.8, 0, 0, TAU); c.fill(); c.stroke(); }
  c.fillStyle = '#e5484d';
  rrS(c, -11, -15, 23, 5, 2.5);
  rrS(c, -10, -13, 5, 10, 2);
  c.restore();
}

function drawDrone(c, t) {
  ink(c);
  const rot = Math.sin(t * 40) * 10;
  c.strokeStyle = LINE; c.lineWidth = 2.4;
  seg(c, -14 - rot * 0.3, -15, -4 + rot * 0.3, -15);
  seg(c, 4 - rot * 0.3, -15, 14 + rot * 0.3, -15);
  seg(c, -9, -15, -7, -9); seg(c, 9, -15, 7, -9);
  ink(c);
  c.fillStyle = '#7a8aa3';
  rrS(c, -13, -11, 26, 20, 8);
  c.fillStyle = SHADE; rr(c, -12, 0, 24, 8, [0, 0, 7, 7]);
  c.fillStyle = '#1d2433'; rrS(c, -9, -7, 18, 10, 4);
  c.fillStyle = `rgba(255,80,80,${0.75 + Math.sin(t * 8) * 0.25})`;
  circ(c, Math.sin(t * 2) * 3, -2, 3.2);
  c.fillStyle = '#fff'; c.font = 'bold 6px sans-serif'; c.textAlign = 'center';
  c.fillText('AI', 0, 8);
}

function drawAgentBot(c, t, face) {
  c.save(); c.scale(face || 1, 1);
  ink(c);
  c.fillStyle = '#2a2438'; circ(c, -6, -3, 3.8); circ(c, 6, -3, 3.8);
  c.fillStyle = '#2fd3b5';
  rrS(c, -9, -17, 18, 14, 4);
  c.fillStyle = SHADE; rr(c, -9, -8, 18, 5, [0, 0, 4, 4]);
  c.fillStyle = '#0f3d36'; rr(c, -2, -14, 9, 6, 2);
  c.fillStyle = '#d6fff2'; circ(c, 3 + Math.sin(t * 9) * 1.5, -11, 1.6);
  seg(c, -4, -17, -6, -23);
  c.fillStyle = '#ffe14d'; circS(c, -6, -24, 2);
  c.restore();
}

// Doubao: a steamed bean bun wearing a headset.
function drawDoubao(c, t, face) {
  c.save(); c.scale(face || 1, 1);
  ink(c);
  const q = Math.sin(t * 6);
  c.fillStyle = '#fff6e6';
  c.beginPath(); c.moveTo(-15, 0); c.bezierCurveTo(-20, -14, -10, -27 + q, 0, -28 + q); c.bezierCurveTo(10, -27 + q, 20, -14, 15, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = SHADE; c.beginPath(); c.ellipse(0, -2, 13.5, 4.5, 0, 0, Math.PI); c.fill();
  c.lineWidth = 1.1;
  for (const i of [-1, 0, 1]) { c.beginPath(); c.moveTo(i * 3, -27 + q); c.quadraticCurveTo(i * 7, -23, i * 6, -19); c.stroke(); }
  ink(c);
  c.fillStyle = '#b06a3a'; circS(c, 0, -28 + q, 2.4);
  c.fillStyle = INK;
  c.beginPath(); c.ellipse(3, -12, 1.7, 2.4, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(10, -12, 1.7, 2.4, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,120,120,0.45)'; circ(c, -1, -8, 2.6); circ(c, 13, -8, 2.2);
  c.lineWidth = 1.3; c.beginPath(); c.arc(6.5, -8.5, 2.8, 0.2, Math.PI - 0.2); c.stroke();
  c.strokeStyle = '#4f8df0'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, -15, 15.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
  ink(c);
  c.fillStyle = '#4f8df0'; rrS(c, -18, -18, 5, 9, 2); circS(c, 12, -5, 2);
  c.restore();
}
// Claude's little crab.
function drawCrab(c, t, face) {
  c.save(); c.scale(face || 1, 1);
  const w = Math.sin(t * 12);
  c.strokeStyle = LINE; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const i of [-1, 1]) for (const j of [0, 1]) seg(c, i * (7 + j * 5), -5, i * (12 + j * 5), (j ? w : -w) * 1.6);
  ink(c);
  for (const i of [-1, 1]) {
    c.save(); c.translate(i * 17, -17 - Math.abs(w) * 2.5);
    c.fillStyle = '#d97757'; circS(c, 0, 0, 5.6);
    c.fillStyle = INK; poly(c, [-1.5 * i, -6.5, 1.5 * i, -1, 5 * i, -5]);
    c.restore();
  }
  c.fillStyle = '#d97757'; rrS(c, -14, -19, 28, 15, 5);
  c.fillStyle = SHADE; rr(c, -13.3, -9, 26.6, 4.4, [0, 0, 4, 4]);
  c.fillStyle = INK; c.fillRect(-6, -16, 3, 6.5); c.fillRect(3, -16, 3, 6.5);
  c.restore();
}
// A chatty white-and-green GPT bot.
function drawGptBot(c, t, face) {
  c.save(); c.scale(face || 1, 1);
  ink(c);
  c.fillStyle = INK; rr(c, -9, -4, 7, 4, 2); rr(c, 2, -4, 7, 4, 2);
  c.fillStyle = '#f7f7f2'; rrS(c, -12, -31, 24, 28, 8);
  c.fillStyle = SHADE; rr(c, -11.3, -10, 22.6, 6.3, [0, 0, 7, 7]);
  c.fillStyle = '#0f3d33'; rrS(c, -8, -27, 16, 14, 4);
  c.strokeStyle = '#3ddc97'; c.lineWidth = 1.3;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.8; c.beginPath(); c.arc(Math.cos(a) * 2.5, -20 + Math.sin(a) * 2.5, 2.6, 0, TAU); c.stroke(); }
  ink(c);
  seg(c, 0, -31, 0, -37);
  c.fillStyle = '#3ddc97'; circS(c, 0, -38, 2.4);
  c.restore();
}

// ---------- weapons & projectiles ----------
function drawWeapon(c, id, s = 1) {
  c.save(); c.scale(s, s);
  ink(c, 1.3);
  if (id === 'stapler') {
    c.fillStyle = '#e5484d'; rrS(c, -9, -4, 18, 5, 2);
    c.fillStyle = '#c9d3dc'; rrS(c, -9, 1, 18, 3, 1);
    c.fillStyle = '#3b3550'; rrS(c, -10, 4, 20, 2.5, 1);
  } else if (id === 'keyboard') {
    c.fillStyle = '#4b5672'; rrS(c, -11, -5, 22, 10, 2);
    c.fillStyle = '#f4f1ea';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) c.fillRect(-9 + i * 4, -3.4 + j * 4, 2.8, 2.8);
    c.fillStyle = '#ff6b6b'; c.fillRect(7, -3.4, 2.8, 2.8);
  } else if (id === 'fan') {
    // a resignation letter, folded into a fan
    c.fillStyle = '#fdfdf8';
    c.beginPath(); c.moveTo(-7, 0); c.arc(-7, 0, 19, -0.95, 0.95); c.closePath(); c.fill(); c.stroke();
    c.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++) seg(c, -7, 0, -7 + Math.cos(i * 0.38) * 19, Math.sin(i * 0.38) * 19);
    c.fillStyle = '#e5484d'; c.beginPath(); c.arc(-7, 0, 6.5, -0.95, 0.95); c.lineTo(-7, 0); c.closePath(); c.fill();
  } else if (id === 'board') {
    // a whiteboard, swung by its stand
    c.fillStyle = '#8d99b3'; rrS(c, -14, -1.6, 12, 3.2, 1.5);
    c.fillStyle = '#fdfdf8'; rrS(c, -3, -11, 18, 22, 2);
    c.strokeStyle = '#58a6ff'; c.lineWidth = 1.2; seg(c, 0, -6, 11, -6); seg(c, 0, -1, 8, -1);
    c.strokeStyle = '#e5484d'; seg(c, 0, 5, 12, 2);
  } else if (id === 'pan') {
    // the blame, in wok form
    c.fillStyle = '#6b4a35'; rrS(c, -17, -2, 11, 4, 2);
    c.fillStyle = '#3b3550'; circS(c, 3, 0, 9.5);
    c.fillStyle = '#5d5878'; circ(c, 3, 0, 6.2);
    c.fillStyle = 'rgba(255,255,255,0.5)'; circ(c, 0.5, -2.5, 1.8);
  } else if (id === 'book') {
    c.fillStyle = '#c0392b'; rrS(c, -8, -10, 16, 20, 2);
    c.fillStyle = '#ffd54f'; c.fillRect(-7.3, -9.3, 2.5, 18.6);
    c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('§', 1.5, 0.5);
  }
  c.restore();
}

function drawEnemyBullet(c, b) {
  const a = Math.atan2(b.vy * YK, b.vx);
  const sh = b.shape;
  if (b.owner) { c.fillStyle = 'rgba(255,70,70,0.35)'; circ(c, 0, 0, b.r + 5); }
  ink(c, 1.2);
  if (sh === 'staple') { c.rotate(a); c.fillStyle = '#ffd0d0'; rrS(c, -7, -2, 14, 4, 1.5); }
  else if (sh === 'env') {
    c.rotate(a);
    c.fillStyle = '#e5484d'; rrS(c, -8, -6, 16, 12, 2);
    c.fillStyle = '#ffd54f'; circ(c, 0, 0, 3);
  } else if (sh === 'mail') {
    c.rotate(a);
    c.fillStyle = '#fdfdf8'; rrS(c, -8, -5.5, 16, 11, 1.5);
    c.beginPath(); c.moveTo(-8, -5.5); c.lineTo(0, 1); c.lineTo(8, -5.5); c.stroke();
  } else if (sh === 'note') {
    c.fillStyle = 'rgba(255,255,255,0.3)'; circ(c, 0, 0, 13);
    c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeText('♪', 0, 0);
    c.fillStyle = b.color; c.fillText('♪', 0, 0);
  } else if (sh === 'chip') {
    c.rotate(b.t * 5);
    c.fillStyle = '#8cf04a'; rrS(c, -7, -7, 14, 14, 2);
    c.fillStyle = '#1f6b2a'; c.fillRect(-4, -4, 8, 8);
  } else if (sh === 'spark') {
    c.fillStyle = 'rgba(255,170,110,0.25)'; circ(c, 0, 0, b.r * 1.7);
    c.rotate(b.t * 4);
    c.fillStyle = b.color;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? b.r * 0.45 : b.r * 1.25;
      c.lineTo(Math.cos((i / 16) * TAU) * r, Math.sin((i / 16) * TAU) * r);
    }
    c.closePath(); c.fill(); c.stroke();
  } else if (sh === 'invite') {
    c.rotate(a);
    c.fillStyle = '#fff'; rrS(c, -7, -7, 14, 14, 2);
    c.fillStyle = '#3b8ef0'; c.fillRect(-6.4, -6.4, 12.8, 4.5);
    c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText('1:1', 0, 5);
  } else {
    c.globalAlpha = 0.3; c.fillStyle = b.color; circ(c, 0, 0, b.r * 1.6);
    c.globalAlpha = 1; circS(c, 0, 0, b.r);
    c.fillStyle = 'rgba(255,255,255,0.8)'; circ(c, -b.r * 0.25, -b.r * 0.25, b.r * 0.38);
  }
}

// ---------- the campus ----------
const TIER = ['#f1efe8', '#7bd66b', '#58a6ff', '#c084fc', '#ffcf4a', '#ff5a5f'];
const THEMES = {
  pony: { wall: '#3f6ea8', roof: '#365a8a', neon: '#8fe8ff', floorA: '#a9c4e3', floorB: '#98b6d9', screen: '#5cc8ff' },
  yiming: { wall: '#3a3a52', roof: '#2c2c40', neon: '#ff5c93', floorA: '#b9b2cc', floorB: '#aaa2bf', screen: '#3df2ea' },
  elon: { wall: '#9a4e3a', roof: '#6f3526', neon: '#ffc2a1', floorA: '#d9b9a2', floorB: '#cdaa90', screen: '#ff8a5c' },
  sam: { wall: '#3a8a76', roof: '#2c6a5a', neon: '#c9ffe6', floorA: '#afd6c5', floorB: '#9fcab8', screen: '#7df0b8' },
  dario: { wall: '#c27a4a', roof: '#8f5530', neon: '#fff0dc', floorA: '#e2cdb2', floorB: '#d6bea0', screen: '#ffae7a' },
  shed: { wall: '#b89868', roof: '#8a4a34', neon: '#fff', floorA: '#d8c9a8', floorB: '#ccbb97', screen: '#8fd3ff' },
};

function drawTerrain(M, t) {
  const S = View.S;
  ctx.fillStyle = '#56b4e8';
  ctx.fillRect(0, 0, View.W, View.H);
  const a = screenToWorld(0, 0), b = screenToWorld(View.W, View.H);
  const vis = (x, y, r) => x + r > a.x && x - r < b.x && y + r > a.y && y - r < b.y;
  ground((c) => {
    // island: beach rim, then meadow
    c.fillStyle = '#9ad8f5'; c.beginPath(); c.roundRect(-110, -110, ARENA.w + 220, ARENA.h + 220, 200); c.fill();
    c.fillStyle = '#f2e3ae'; c.beginPath(); c.roundRect(-60, -60, ARENA.w + 120, ARENA.h + 120, 160); c.fill();
    c.fillStyle = '#5c9a46'; c.beginPath(); c.roundRect(0, 0, ARENA.w, ARENA.h, 120); c.fill();
    for (const q of M.blobs) {
      if (!vis(q.x, q.y, q.r)) continue;
      c.fillStyle = q.c; c.beginPath(); c.arc(q.x, q.y, q.r, 0, TAU); c.fill();
    }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const pass of [['#4d6b36', 104], ['#6a5740', 80], ['#8a7250', 62]]) {
      c.strokeStyle = pass[0]; c.lineWidth = pass[1];
      for (const p of M.paths) { c.beginPath(); for (const q of p) c.lineTo(q[0], q[1]); c.stroke(); }
    }
    // flagstones pressed into the dirt
    for (const st of M.stones) {
      if (!vis(st.x, st.y, 50)) continue;
      c.save(); c.translate(st.x, st.y); c.rotate(st.rot);
      c.fillStyle = 'rgba(30,24,16,0.5)'; c.beginPath(); c.ellipse(3, 6, st.rx, st.ry, 0, 0, TAU); c.fill();
      c.fillStyle = st.c; c.beginPath(); c.ellipse(0, 0, st.rx, st.ry, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.17)'; c.beginPath(); c.ellipse(-st.rx * 0.14, -st.ry * 0.2, st.rx * 0.72, st.ry * 0.62, 0, 0, TAU); c.fill();
      if (st.moss) { c.fillStyle = 'rgba(88,140,64,0.6)'; c.beginPath(); c.ellipse(st.rx * 0.3, st.ry * 0.25, st.rx * 0.5, st.ry * 0.4, 0, 0, TAU); c.fill(); }
      c.restore();
    }
    for (const pl of M.plazas) {
      if (!vis(pl.x + pl.w / 2, pl.y + pl.h / 2, pl.w)) continue;
      const th = THEMES[pl.theme];
      c.fillStyle = 'rgba(40,30,90,0.18)'; c.beginPath(); c.roundRect(pl.x - 14, pl.y - 6, pl.w + 28, pl.h + 30, 30); c.fill();
      c.fillStyle = th.floorA; c.beginPath(); c.roundRect(pl.x - 14, pl.y - 14, pl.w + 28, pl.h + 28, 30); c.fill();
      c.fillStyle = th.floorB;
      const T = pl.tile || 100;
      for (let i = 0; i * T < pl.w; i++) for (let j = 0; j * T < pl.h; j++) if ((i + j) % 2) c.fillRect(pl.x + i * T, pl.y + j * T, Math.min(T, pl.w - i * T), Math.min(T, pl.h - j * T));
    }
    for (const o of M.ponds) {
      if (!vis(o.x, o.y, o.r + 30)) continue;
      c.fillStyle = '#6f6a4c'; c.beginPath(); c.arc(o.x, o.y, o.r + 18, 0, TAU); c.fill();
      c.fillStyle = '#2c7a9e'; c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill();
      c.fillStyle = '#48a0c2'; c.beginPath(); c.arc(o.x - o.r * 0.1, o.y - o.r * 0.12, o.r * 0.74, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.25 + i / 3) % 1;
        c.globalAlpha = 1 - u;
        c.beginPath(); c.arc(o.x + Math.cos(i * 2.1) * o.r * 0.3, o.y + Math.sin(i * 2.1) * o.r * 0.3, 14 + u * o.r * 0.4, 0.3 + i, 2.2 + i); c.stroke();
      }
      c.globalAlpha = 1;
    }
    for (const g of M.grass) {
      if (!vis(g.x, g.y, g.r)) continue;
      c.fillStyle = '#44853a'; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.fill();
    }
  });
  // short tufts, flowers and pebbles: tiny billboards that never need depth sorting
  for (const q of M.tufts) {
    if (!vis(q.x, q.y, 20)) continue;
    const px = sx(q.x), py = sy(q.y), w = Math.sin(t * 2 + q.x * 0.02 + q.y * 0.013) * 2.2 * S;
    if (q.k === 0) {
      ctx.fillStyle = q.c;
      ctx.beginPath();
      ctx.moveTo(px - 6 * S, py); ctx.lineTo(px - 4 * S + w, py - 11 * S); ctx.lineTo(px - 1 * S, py);
      ctx.lineTo(px + w, py - 15 * S); ctx.lineTo(px + 2 * S, py); ctx.lineTo(px + 5 * S + w, py - 10 * S); ctx.lineTo(px + 6 * S, py);
      ctx.fill();
    } else if (q.k === 1) {
      ctx.strokeStyle = '#3d7a34'; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + w, py - 10 * S); ctx.stroke();
      ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(px + w, py - 11 * S, 3.6 * S, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe36e'; ctx.beginPath(); ctx.arc(px + w, py - 11 * S, 1.4 * S, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#8d8f86'; ctx.beginPath(); ctx.ellipse(px, py, 5 * S, 3 * S, 0, 0, TAU); ctx.fill();
    }
  }
}

// One horizontal strip of tall grass; several strips per patch get depth-sorted with the actors.
function drawGrassRow(row, t) {
  const S = View.S, py = sy(row.y);
  for (const bl of row.blades) {
    const px = sx(row.x + bl.dx), w = Math.sin(t * 2.2 + (row.x + bl.dx) * 0.03) * 3 * S;
    ctx.fillStyle = bl.c;
    ctx.beginPath();
    ctx.moveTo(px - 4 * S, py); ctx.lineTo(px + w, py - bl.h * S); ctx.lineTo(px + 4 * S, py);
    ctx.fill();
  }
}

function drawTree(o, t, fade) {
  shadow(o.x, o.y, 8, 0.24, 54);
  const ch = 54 + o.cr * 0.55;
  ctx.fillStyle = 'rgba(20,34,60,0.26)'; groundEllipse(o.x + SUN.x * ch, o.y + SUN.y * ch, o.cr * 1.02); ctx.fill();
  at(o.x, o.y, 0, (c) => {
    const sway = Math.sin(t * 1.3 + o.x * 0.01) * 2.5, R = o.cr, cy = -48 - R * 0.55;
    // trunk: bark lit from the left, with a root flare
    const tg = c.createLinearGradient(-9, 0, 10, 0);
    tg.addColorStop(0, '#9a7450'); tg.addColorStop(0.45, '#6b4a31'); tg.addColorStop(1, '#33231a');
    c.fillStyle = tg;
    poly(c, [-13, 1, -6, -10, -5, -54, 5, -54, 7, -10, 14, 1]);
    if (fade) c.globalAlpha = 0.36;
    // canopy: a dark mass, then leaf clusters each catching the light on its upper-left
    c.fillStyle = o.pal[0];
    circ(c, sway * 0.5, cy + R * 0.12, R * 0.82);
    for (const q of o.cl) {
      const gx = q.dx * R + sway * q.s, gy = cy + q.dy * R, r = q.r * R;
      const g = c.createRadialGradient(gx - r * 0.38, gy - r * 0.42, r * 0.08, gx, gy, r);
      g.addColorStop(0, o.pal[2]); g.addColorStop(0.5, o.pal[1]); g.addColorStop(1, o.pal[0]);
      c.fillStyle = g;
      circ(c, gx, gy, r);
    }
  });
}

function drawRock(o) {
  shadow(o.x, o.y, o.r * 0.95, 0.26, o.r * 1.1);
  at(o.x, o.y, 0, (c) => {
    const r = o.r, g = c.createLinearGradient(-r, -r * 1.2, r, r * 0.2);
    g.addColorStop(0, '#c4c2b8'); g.addColorStop(0.5, '#8b8a84'); g.addColorStop(1, '#4b4a4c');
    c.fillStyle = g;
    poly(c, [-r, 0, -r * 0.8, -r * 0.8, -r * 0.1, -r * 1.25, r * 0.7, -r * 0.95, r, -r * 0.1, r * 0.6, r * 0.2, -r * 0.6, r * 0.2]);
    c.fillStyle = 'rgba(255,255,255,0.14)'; poly(c, [-r * 0.7, -r * 0.75, -r * 0.1, -r * 1.15, r * 0.6, -r * 0.9, r * 0.1, -r * 0.5]);
    // moss settling on the top
    c.fillStyle = 'rgba(84,140,62,0.78)';
    c.beginPath(); c.ellipse(-r * 0.05, -r * 1.02, r * 0.5, r * 0.2, -0.15, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(-r * 0.62, -r * 0.62, r * 0.24, r * 0.14, -0.7, 0, TAU); c.fill();
  });
}

function drawDesk(ob, th) {
  const S = View.S, x0 = sx(ob.x), w = ob.w * S;
  const yTopBack = sy(ob.y, ob.h), yTopFront = sy(ob.y + ob.d, ob.h), yBot = sy(ob.y + ob.d, 0);
  boxShadow(ob, 0.2);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2 * S; ctx.lineJoin = 'round';
  ctx.fillStyle = '#bfae90';
  ctx.beginPath(); ctx.rect(x0, yTopFront, w, yBot - yTopFront); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e9dfc8';
  ctx.beginPath(); ctx.rect(x0, yTopBack, w, yTopFront - yTopBack); ctx.fill(); ctx.stroke();
  const n = Math.max(1, Math.floor(ob.w / 90));
  for (let i = 0; i < n; i++) {
    const mx = x0 + ((i + 0.5) * w) / n, my = (yTopBack + yTopFront) / 2;
    ctx.fillStyle = INK; ctx.fillRect(mx - 3 * S, my - 10 * S, 6 * S, 10 * S);
    ctx.fillStyle = '#3b3550';
    ctx.beginPath(); ctx.roundRect(mx - 22 * S, my - 39 * S, 44 * S, 29 * S, 3 * S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = th.screen; ctx.fillRect(mx - 18 * S, my - 35 * S, 36 * S, 21 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(mx - 18 * S, my - 35 * S); ctx.lineTo(mx - 4 * S, my - 35 * S); ctx.lineTo(mx - 14 * S, my - 14 * S); ctx.lineTo(mx - 18 * S, my - 14 * S); ctx.fill();
  }
}

function drawBuilding(ob, th, t, sign) {
  const S = View.S, x0 = sx(ob.x), w = ob.w * S;
  const yRoofBack = sy(ob.y, ob.h), yRoofFront = sy(ob.y + ob.d, ob.h), yBot = sy(ob.y + ob.d, 0), fh = yBot - yRoofFront;
  boxShadow(ob, 0.24);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2.6 * S; ctx.lineJoin = 'round';
  ctx.fillStyle = th.wall;
  ctx.beginPath(); ctx.rect(x0, yRoofFront, w, fh); ctx.fill(); ctx.stroke();
  const wg = ctx.createLinearGradient(0, yRoofFront, 0, yBot);
  wg.addColorStop(0, 'rgba(255,255,255,0.16)'); wg.addColorStop(0.55, 'rgba(255,255,255,0)'); wg.addColorStop(1, 'rgba(30,36,100,0.22)');
  ctx.fillStyle = wg; ctx.fillRect(x0 + 1.3 * S, yRoofFront + 1.3 * S, w - 2.6 * S, fh - 2.6 * S);
  ctx.fillStyle = th.roof;
  ctx.beginPath(); ctx.rect(x0 - 8 * S, yRoofBack, w + 16 * S, yRoofFront - yRoofBack + 8 * S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x0 - 6 * S, yRoofBack + 2 * S, w + 12 * S, 5 * S);
  ctx.fillStyle = 'rgba(30,36,100,0.18)'; ctx.fillRect(x0 - 6 * S, yRoofFront + 1 * S, w + 12 * S, 6 * S);
  const cols = Math.max(2, Math.floor(ob.w / 95)), door = ob.h > 150;
  for (let r = 0; r < (door ? 2 : 1); r++) {
    for (let i = 0; i < cols; i++) {
      if (door && r === 1 && Math.abs(i - (cols - 1) / 2) < 1) continue;
      const wx = x0 + ((i + 0.22) * w) / cols, ww = (w / cols) * 0.56, wy = yRoofFront + fh * (door ? 0.36 + r * 0.31 : 0.34), wh = fh * (door ? 0.2 : 0.4);
      ctx.fillStyle = G.day > 0.45 ? '#ffc56e' : '#9cc4d6';
      ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, 3 * S); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(wx + ww * 0.1, wy + wh); ctx.lineTo(wx + ww * 0.45, wy); ctx.lineTo(wx + ww * 0.7, wy); ctx.lineTo(wx + ww * 0.35, wy + wh); ctx.fill();
    }
  }
  if (door) {
    const dw = 96 * S, dh = fh * 0.34, dx = x0 + w / 2 - dw / 2;
    ctx.fillStyle = '#8d99b3';
    ctx.beginPath(); ctx.rect(dx, yBot - dh, dw, dh); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx + dw / 2, yBot - dh); ctx.lineTo(dx + dw / 2, yBot); ctx.stroke();
  }
  // roof tiles and wall planks, so the faces aren't bare rectangles
  ctx.strokeStyle = 'rgba(20,24,30,0.16)'; ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) { const ry = yRoofBack + ((yRoofFront - yRoofBack) * i) / 4; ctx.moveTo(x0 - 8 * S, ry); ctx.lineTo(x0 + w + 8 * S, ry); }
  for (let px = x0 + 26 * S; px < x0 + w - 4 * S; px += 26 * S) { ctx.moveTo(px, yRoofFront + 9 * S); ctx.lineTo(px, yBot); }
  ctx.stroke();
  // lanterns either side of the front
  const glow = 0.07 + G.day * 0.2 + Math.sin(t * 3 + ob.x) * 0.02;
  for (const lx of [x0 + 14 * S, x0 + w - 14 * S]) {
    const ly = yBot - fh * 0.52;
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(lx - 1.5 * S, ly - 16 * S, 3 * S, 10 * S);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(lx, ly, 6.5 * S, 8.5 * S, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff1c2'; ctx.beginPath(); ctx.ellipse(lx, ly, 3 * S, 4.5 * S, 0, 0, TAU); ctx.fill();
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 95 * S);
    lg.addColorStop(0, `rgba(255,180,80,${glow})`); lg.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg; ctx.fillRect(lx - 95 * S, ly - 95 * S, 190 * S, 190 * S);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (sign) {
    ctx.save();
    ctx.font = `900 ${Math.round(24 * S)}px "Trebuchet MS", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = yRoofFront + fh * 0.19, tw = ctx.measureText(sign).width + 28 * S;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.roundRect(x0 + w / 2 - tw / 2, ty - 17 * S, tw, 34 * S, 8 * S); ctx.fill();
    ctx.fillStyle = Math.sin(t * 13) > -0.95 ? th.neon : '#888';
    ctx.fillText(sign, x0 + w / 2, ty + 1 * S);
    ctx.restore();
  }
}

function drawContainer(k, t) {
  shadow(k.x + 3, k.y + 1, 20, 0.2);
  at(k.x, k.y, 0, (c) => {
    ink(c, 1.8);
    if (k.kind === 'crate') {
      c.fillStyle = k.opened ? '#a88962' : '#d9a868'; rrS(c, -17, -24, 34, 24, 2);
      c.fillStyle = SHADE; rr(c, -17, -9, 34, 9, 0);
      c.strokeStyle = LINE; seg(c, -17, -12, 17, -12);
      if (k.opened) { c.fillStyle = '#3b2d22'; poly(c, [-15, -24, -11, -31, 21, -31, 17, -24], true); }
      else { c.fillStyle = '#e8c38a'; poly(c, [-17, -24, -12, -32, 22, -32, 17, -24], true); c.fillStyle = '#f7ecd0'; c.fillRect(-3, -31, 6, 30); }
    } else if (k.kind === 'locker') {
      c.fillStyle = k.opened ? '#7f8ba3' : '#9fb1cf'; rrS(c, -15, -46, 30, 46, 3);
      c.fillStyle = SHADE; rr(c, -15, -46, 9, 46, [3, 0, 0, 3]);
      seg(c, 0, -46, 0, 0);
      c.fillStyle = INK; c.fillRect(-9, -36, 5, 2); c.fillRect(4, -36, 5, 2);
      if (k.opened) { c.fillStyle = '#2a2438'; c.fillRect(1, -44, 12, 42); }
    } else {
      c.fillStyle = k.opened ? '#4a4660' : '#5d5878'; rrS(c, -20, -34, 40, 34, 4);
      c.fillStyle = SHADE; rr(c, -20, -12, 40, 12, [0, 0, 4, 4]);
      c.fillStyle = k.opened ? '#2a2438' : '#ffcf4a'; circS(c, 0, -17, 8);
      if (!k.opened) { c.fillStyle = INK; circ(c, 0, -17, 2.2); seg(c, 0, -17, 5, -22); }
    }
  });
  if (!k.opened && k.prog > 0) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * View.S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(sx(k.x), sy(k.y, 70), 13 * View.S, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k.prog / k.need, 0, 1)); ctx.stroke();
  } else if (!k.opened) {
    const glow = 0.5 + Math.sin(t * 4 + k.x) * 0.3;
    ctx.fillStyle = `rgba(255,255,255,${glow})`;
    ctx.beginPath(); ctx.arc(sx(k.x), sy(k.y, k.kind === 'locker' ? 62 : 46) + Math.sin(t * 3 + k.x) * 3 * View.S, 3 * View.S, 0, TAU); ctx.fill();
  }
}

function drawLootIcon(c, k) {
  ink(c, 1.4);
  const id = k.key;
  if (k.kind === 'tea') {
    c.fillStyle = '#f8e1c4'; poly(c, [-8, -11, 8, -11, 6, 11, -6, 11], true);
    c.fillStyle = '#4a3327'; for (let i = 0; i < 3; i++) circ(c, -3.5 + i * 3.5, 7, 1.7);
    c.fillStyle = '#ff9aa2'; rrS(c, -9, -14, 18, 4, 2);
    c.strokeStyle = '#5fb84a'; c.lineWidth = 2.5; seg(c, 2, -13, 5, -24); ink(c, 1.4);
  } else if (k.kind === 'armor') {
    c.fillStyle = '#e5484d'; rrS(c, -10, -9, 20, 20, 4);
    c.fillStyle = '#e5484d'; poly(c, [-10, -9, -16, -2, -11, 2], true); poly(c, [10, -9, 16, -2, 11, 2], true);
    c.strokeStyle = '#2a2438'; c.lineWidth = 1.1;
    for (let i = -1; i <= 1; i++) { seg(c, i * 6, -8, i * 6, 10); seg(c, -9, 1 + i * 6, 9, 1 + i * 6); }
  } else if (id === 'v_n1') {
    c.fillStyle = '#fffdf4'; rrS(c, -9, -12, 18, 24, 2);
    c.fillStyle = '#b8b2a0'; for (let i = 0; i < 4; i++) c.fillRect(-6, -8 + i * 4, 12, 1.4);
    c.fillStyle = '#e5484d'; circS(c, 4, 7, 4.5);
  } else if (id === 'v_seat') {
    c.fillStyle = '#ffcf4a'; rrS(c, -8, -14, 16, 16, 3); rrS(c, -10, 0, 20, 6, 2);
    c.fillRect(-8, 6, 3, 7); c.fillRect(5, 6, 3, 7);
  } else if (id === 'v_option') {
    c.fillStyle = '#f4f1ea'; rrS(c, -11, -9, 22, 18, 2);
    c.strokeStyle = '#c084fc'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-8, 5); c.lineTo(-3, 0); c.lineTo(1, 3); c.lineTo(8, -6); c.stroke();
  } else if (id === 'v_gpu') {
    c.fillStyle = '#2f3b52'; rrS(c, -12, -7, 24, 14, 2);
    c.fillStyle = '#58a6ff'; circS(c, -5, 0, 4.5); circS(c, 6, 0, 4.5);
  } else if (id === 'v_bonus') {
    c.fillStyle = '#e5484d'; rrS(c, -9, -12, 18, 24, 2);
    c.fillStyle = '#ffcf4a'; circS(c, 0, -2, 5);
  } else if (id === 'v_headset') {
    c.strokeStyle = LINE; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 9, Math.PI, 0); c.stroke();
    c.strokeStyle = '#7bd66b'; c.lineWidth = 2.6; c.beginPath(); c.arc(0, 0, 9, Math.PI, 0); c.stroke(); ink(c, 1.4);
    c.fillStyle = '#3b3550'; rrS(c, -12, -1, 6, 11, 2); rrS(c, 6, -1, 6, 11, 2);
  } else if (id === 'v_chair') {
    c.fillStyle = '#7bd66b'; rrS(c, -7, -14, 14, 15, 4); rrS(c, -9, 1, 18, 5, 2);
    seg(c, 0, 6, 0, 11); seg(c, -7, 12, 7, 12);
  } else if (id === 'v_snack') {
    c.fillStyle = '#ffb347'; poly(c, [-8, -10, 8, -10, 6, 11, -6, 11], true);
    c.fillStyle = '#fff'; c.fillRect(-5, -3, 10, 5);
  } else {
    c.strokeStyle = '#58a6ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -13); c.lineTo(0, -2); c.lineTo(6, -13); c.stroke(); ink(c, 1.4);
    c.fillStyle = '#fff'; rrS(c, -6, -2, 12, 14, 2);
    c.fillStyle = '#58a6ff'; c.fillRect(-4, 1, 8, 3);
  }
}

function drawExit(e, t) {
  const S = View.S;
  ground((c) => {
    c.fillStyle = e.open ? 'rgba(80,230,140,0.22)' : 'rgba(255,255,255,0.14)';
    c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.fill();
    c.strokeStyle = e.open ? '#3fe08a' : 'rgba(255,255,255,0.6)'; c.lineWidth = 7;
    c.setLineDash([26, 18]); c.lineDashOffset = -t * 40;
    c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.stroke();
    c.setLineDash([]);
  });
  // the shuttle bus
  shadow(e.x, e.y - e.r - 14, 70, 0.2);
  at(e.x, e.y - e.r - 14, 0, (c) => {
    ink(c, 2);
    c.fillStyle = '#ffd34d'; rrS(c, -66, -62, 132, 52, 12);
    c.fillStyle = SHADE; rr(c, -66, -24, 132, 14, [0, 0, 12, 12]);
    c.fillStyle = '#bfe9ff';
    for (let i = 0; i < 4; i++) rrS(c, -56 + i * 29, -54, 23, 20, 4);
    c.fillStyle = '#2a2438'; circS(c, -38, -8, 11); circS(c, 38, -8, 11);
    c.fillStyle = '#c9c5d6'; circ(c, -38, -8, 4.5); circ(c, 38, -8, 4.5);
    c.fillStyle = e.open ? '#3fe08a' : '#a9a4b8'; circS(c, 60, -30, 4);
  });
  if (e.open) {
    ctx.fillStyle = 'rgba(80,230,140,0.16)';
    ctx.fillRect(sx(e.x) - 5 * S, sy(e.y, 900), 10 * S, 900 * S);
  }
}

function drawStorm(z, t) {
  ground((c) => {
    c.beginPath();
    c.rect(-4000, -4000, ARENA.w + 8000, ARENA.h + 8000);
    c.arc(z.x, z.y, Math.max(z.r, 0.5), 0, TAU, true);
    c.fillStyle = 'rgba(150,50,190,0.34)';
    c.fill('evenodd');
    c.strokeStyle = `rgba(245,190,255,${0.75 + Math.sin(t * 6) * 0.2})`; c.lineWidth = 9;
    c.beginPath(); c.arc(z.x, z.y, Math.max(z.r, 0.5), 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 22;
    c.beginPath(); c.arc(z.x, z.y, Math.max(z.r, 0.5) + 16, 0, TAU); c.stroke();
    if (z.nr > 0 && z.mode !== 'done') {
      c.setLineDash([30, 22]); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 5;
      c.beginPath(); c.arc(z.nx, z.ny, z.nr, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
  });
}

function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.05, x, y - s * 0.3);
  c.bezierCurveTo(x + s * 0.75, y - s * 1.05, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  c.closePath();
}

function speechBubble(x, y, z, text, color = '#fffdf4') {
  const S = Math.max(View.S, 0.7);
  ctx.save();
  ctx.font = `bold ${Math.round(15 * S)}px "Trebuchet MS", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const w = ctx.measureText(text).width + 22 * S, h = 30 * S;
  const cx0 = clamp(sx(x), w / 2 + 6, View.W - w / 2 - 6), cy0 = Math.max(h, sy(y, z) - h);
  ctx.fillStyle = color;
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(cx0 - w / 2, cy0 - h / 2, w, h, 12 * S); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx0 - 6 * S, cy0 + h / 2 - 1); ctx.lineTo(cx0, cy0 + h / 2 + 9 * S); ctx.lineTo(cx0 + 6 * S, cy0 + h / 2 - 1); ctx.fill();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx0, cy0 + 1);
  ctx.restore();
}
