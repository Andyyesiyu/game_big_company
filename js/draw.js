'use strict';
// ---------- 2.5D projection ----------
// World is a flat office floor (x right, y "into the screen" downwards, z up).
// Everything standing on it is a billboard, depth-sorted by y.
const YK = 0.62; // vertical squash of the ground plane
const View = { W: 0, H: 0, S: 1, cam: { x: 0, y: 0 }, ox: 0, oy: 0, shake: 0 };
const ARENA = { w: 1500, h: 1000 };
const WALL_H = 170;
let ctx = null;

const sx = (x) => (x - View.cam.x) * View.S + View.W / 2 + View.ox;
const sy = (y, z = 0) => (y - View.cam.y) * View.S * YK + View.H / 2 - z * View.S + View.oy;
const screenToWorld = (px, py, z = 0) => ({
  x: (px - View.W / 2 - View.ox) / View.S + View.cam.x,
  y: (py - View.H / 2 - View.oy + z * View.S) / (View.S * YK) + View.cam.y,
});

function at(x, y, z, fn) {
  ctx.save();
  ctx.translate(sx(x), sy(y, z));
  ctx.scale(View.S, View.S);
  fn(ctx);
  ctx.restore();
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}
function circ(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}
function seg(c, x1, y1, x2, y2) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}
function groundEllipse(x, y, r) {
  ctx.beginPath();
  ctx.ellipse(sx(x), sy(y), r * View.S, r * View.S * YK, 0, 0, TAU);
}
function shadow(x, y, r, a = 0.28) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  groundEllipse(x, y, r);
  ctx.fill();
}

// ---------- characters ----------
function drawHair(c, p) {
  c.fillStyle = p.hair || '#222';
  const s = p.hairStyle || 'short';
  if (s === 'bald') return;
  c.beginPath();
  c.arc(0, -50, 13.4, Math.PI * 0.98, Math.PI * 2.02);
  c.fill();
  if (s === 'side') {
    c.beginPath();
    c.ellipse(-3, -58, 11, 5.5, -0.25, 0, TAU);
    c.fill();
  } else if (s === 'messy') {
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(i * 5 - 4, -58);
      c.lineTo(i * 5 + (i % 2 ? 2 : -1), -67 - Math.abs(i % 2) * 2);
      c.lineTo(i * 5 + 4, -58);
      c.fill();
    }
    c.beginPath();
    c.ellipse(6, -58, 8, 4.5, 0.4, 0, TAU);
    c.fill();
  } else if (s === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      circ(c, Math.cos(a) * 12, -52 + Math.sin(a) * 11, 5.2);
    }
    circ(c, 0, -62, 6);
  } else if (s === 'long') {
    rr(c, -14, -52, 8, 20, 4);
  }
}

// Billboard chibi. Origin at the feet, facing +x (flip with p.face = -1).
function drawPerson(c, p) {
  const t = p.t || 0, mv = p.moving && !p.kneel;
  const bob = mv ? -Math.abs(Math.sin(t * 11)) * 2 : Math.sin(t * 2.5) * 0.7;
  const sw = mv ? Math.sin(t * 11) * 5 : 0;
  const sc = p.scale || 1;
  c.save();
  c.scale((p.face || 1) * sc, sc);
  c.lineCap = 'round';
  if (p.kneel) {
    c.translate(0, 9);
    c.fillStyle = p.bottom || '#263238';
    rr(c, -10, -12, 22, 8, 3);
  } else {
    c.fillStyle = p.bottom || '#263238';
    rr(c, -8 + sw * 0.5, -13, 7, 13, 2.5);
    rr(c, 1 - sw * 0.5, -13, 7, 13, 2.5);
    c.fillStyle = '#111';
    rr(c, -9 + sw * 0.5, -3, 9.5, 3.5, 1.5);
    rr(c, 1 - sw * 0.5, -3, 9.5, 3.5, 1.5);
  }
  c.translate(0, bob);
  // back arm
  c.strokeStyle = p.top;
  c.lineWidth = 6;
  seg(c, -11, -31, -14, -19 - sw * 0.6);
  // torso
  c.fillStyle = p.top;
  rr(c, -12, -36, 24, 25, 7);
  if (p.shirt) {
    c.fillStyle = p.shirt;
    c.beginPath();
    c.moveTo(-5, -36); c.lineTo(5, -36); c.lineTo(0, -24);
    c.fill();
  }
  if (p.tie) {
    c.fillStyle = p.tie;
    c.beginPath();
    c.moveTo(-1.5, -35); c.lineTo(1.5, -35); c.lineTo(2.6, -25); c.lineTo(0, -22); c.lineTo(-2.6, -25);
    c.fill();
  }
  if (p.badge) {
    c.strokeStyle = p.badge;
    c.lineWidth = 1.4;
    seg(c, -5, -35, 1, -25);
    seg(c, 5, -35, 1, -25);
    c.fillStyle = '#fff';
    rr(c, -2.5, -25, 7, 8, 1);
    c.fillStyle = p.badge;
    c.fillRect(-1.5, -23, 5, 2);
  }
  if (p.logo) p.logo(c);
  // front arm
  const hx = p.armUp ? 18 : 15, hy = p.armUp ? -46 : -19 + sw * 0.6;
  c.strokeStyle = p.top;
  c.lineWidth = 6;
  seg(c, 11, -31, hx, hy);
  c.fillStyle = p.skin;
  circ(c, hx, hy, 3.6);
  // head
  c.fillStyle = p.skin;
  circ(c, 0, -48, 13);
  drawHair(c, p);
  // face
  c.fillStyle = '#1b1b1b';
  if (p.scared) {
    c.fillStyle = '#fff'; circ(c, 3, -48, 3.2); circ(c, 9.5, -48, 3.2);
    c.fillStyle = '#1b1b1b'; circ(c, 3.5, -48, 1.4); circ(c, 10, -48, 1.4);
    c.beginPath(); c.ellipse(6.5, -41, 2.6, 3.2, 0, 0, TAU); c.fill();
  } else {
    circ(c, 3, -48, 1.8);
    circ(c, 9.5, -48, 1.8);
    if (p.bags) {
      c.strokeStyle = 'rgba(60,40,80,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(3, -46.5, 2.4, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(9.5, -46.5, 2.4, 0.2, Math.PI - 0.2); c.stroke();
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
  if (p.extra) p.extra(c, hx, hy);
  c.restore();
}

function drawPenguin(c, t, face, scared) {
  c.save();
  c.scale(face || 1, 1);
  c.fillStyle = '#f5a623';
  c.beginPath(); c.ellipse(-5, -1, 6, 3, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(6, -1, 6, 3, 0, 0, TAU); c.fill();
  c.fillStyle = '#14161c';
  c.beginPath(); c.ellipse(0, -17, 14, 17, 0, 0, TAU); c.fill();
  // flippers
  const fl = Math.sin(t * 14) * 0.4;
  c.save(); c.translate(-12, -20); c.rotate(0.5 + fl); c.beginPath(); c.ellipse(0, 5, 4, 9, 0, 0, TAU); c.fill(); c.restore();
  c.save(); c.translate(12, -20); c.rotate(-0.5 - fl); c.beginPath(); c.ellipse(0, 5, 4, 9, 0, 0, TAU); c.fill(); c.restore();
  c.fillStyle = '#fafafa';
  c.beginPath(); c.ellipse(2.5, -13, 9, 12, 0, 0, TAU); c.fill();
  c.fillStyle = '#fff'; circ(c, 1, -25, 4.2); circ(c, 9, -25, 4.2);
  c.fillStyle = '#111'; circ(c, 2, -25, 1.8); circ(c, 10, -25, 1.8);
  c.fillStyle = '#f5a623';
  if (scared) { c.beginPath(); c.ellipse(6, -18.5, 5, 4.5, 0, 0, TAU); c.fill(); c.fillStyle = '#b3402a'; c.beginPath(); c.ellipse(6, -18, 3, 2.6, 0, 0, TAU); c.fill(); }
  else { c.beginPath(); c.ellipse(6.5, -19.5, 6, 2.8, 0, 0, TAU); c.fill(); }
  c.fillStyle = '#e53935';
  rr(c, -11, -15, 23, 5, 2.5);
  rr(c, -10, -13, 5, 10, 2);
  c.restore();
}

function drawDrone(c, t, flash) {
  c.strokeStyle = '#90a4ae'; c.lineWidth = 2;
  const rot = Math.sin(t * 40) * 10;
  seg(c, -14 - rot * 0.3, -15, -4 + rot * 0.3, -15);
  seg(c, 4 - rot * 0.3, -15, 14 + rot * 0.3, -15);
  seg(c, -9, -15, -7, -9); seg(c, 9, -15, 7, -9);
  c.fillStyle = flash ? '#fff' : '#37474f';
  rr(c, -13, -11, 26, 20, 8);
  c.fillStyle = '#102027'; rr(c, -9, -7, 18, 10, 4);
  c.fillStyle = `rgba(255,60,60,${0.7 + Math.sin(t * 8) * 0.3})`;
  circ(c, Math.sin(t * 2) * 3, -2, 3.2);
  c.fillStyle = '#cfd8dc'; c.font = 'bold 6px sans-serif'; c.textAlign = 'center';
  c.fillText('AI', 0, 8);
}

function drawAgentBot(c, t, face, flash) {
  c.save(); c.scale(face || 1, 1);
  c.fillStyle = '#111'; circ(c, -6, -3, 3.5); circ(c, 6, -3, 3.5);
  c.fillStyle = flash ? '#fff' : '#00bfa5';
  rr(c, -9, -17, 18, 14, 4);
  c.fillStyle = '#00332c'; rr(c, -2, -14, 9, 6, 2);
  c.fillStyle = '#b9f6ca'; circ(c, 3 + Math.sin(t * 9) * 1.5, -11, 1.6);
  c.strokeStyle = '#00bfa5'; c.lineWidth = 1.5; seg(c, -4, -17, -6, -23);
  c.fillStyle = '#ffeb3b'; circ(c, -6, -24, 1.8);
  c.restore();
}

// ---------- weapons & projectiles ----------
function drawWeapon(c, id, s = 1) {
  c.save(); c.scale(s, s);
  if (id === 'stapler') {
    c.fillStyle = '#e53935'; rr(c, -9, -4, 18, 5, 2);
    c.fillStyle = '#b0bec5'; rr(c, -9, 1, 18, 3, 1);
    c.fillStyle = '#263238'; rr(c, -10, 4, 20, 2.5, 1);
  } else if (id === 'keyboard') {
    c.fillStyle = '#37474f'; rr(c, -11, -5, 22, 10, 2);
    c.fillStyle = '#eceff1';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) c.fillRect(-9 + i * 4, -3.4 + j * 4, 2.8, 2.8);
    c.fillStyle = '#ff5252'; c.fillRect(7, -3.4, 2.8, 2.8);
  } else if (id === 'coffee') {
    c.fillStyle = '#fff'; rr(c, -5, -7, 10, 14, 2);
    c.fillStyle = '#6d4c41'; rr(c, -5, -2, 10, 5, 0);
    c.fillStyle = '#4e342e'; rr(c, -6, -9, 12, 3, 1);
  } else if (id === 'plane') {
    c.fillStyle = '#fafafa';
    c.beginPath(); c.moveTo(11, 0); c.lineTo(-9, -7); c.lineTo(-5, 0); c.lineTo(-9, 7); c.fill();
    c.strokeStyle = '#b0bec5'; c.lineWidth = 0.8; seg(c, 11, 0, -5, 0);
  } else if (id === 'book') {
    c.fillStyle = '#b71c1c'; rr(c, -8, -10, 16, 20, 2);
    c.fillStyle = '#ffd54f'; c.fillRect(-8, -10, 2.5, 20);
    c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('§', 1.5, 0.5);
  }
  c.restore();
}

function drawEnemyBullet(c, b) {
  const a = Math.atan2(b.vy * YK, b.vx);
  const sh = b.shape;
  if (sh === 'env') {
    c.rotate(a);
    c.fillStyle = '#d32f2f'; rr(c, -8, -6, 16, 12, 2);
    c.fillStyle = '#ffd54f'; circ(c, 0, 0, 3);
  } else if (sh === 'mail') {
    c.rotate(a);
    c.fillStyle = '#eceff1'; rr(c, -8, -5.5, 16, 11, 1.5);
    c.strokeStyle = '#78909c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-8, -5.5); c.lineTo(0, 1); c.lineTo(8, -5.5); c.stroke();
  } else if (sh === 'note') {
    c.fillStyle = 'rgba(255,255,255,0.18)'; circ(c, 0, 0, 13);
    c.fillStyle = b.color; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('♪', 0, 0);
  } else if (sh === 'chip') {
    c.rotate(b.t * 5);
    c.fillStyle = '#76ff03'; rr(c, -7, -7, 14, 14, 2);
    c.fillStyle = '#1b5e20'; c.fillRect(-4, -4, 8, 8);
    c.strokeStyle = '#76ff03'; c.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { seg(c, i * 4, -10, i * 4, -7); seg(c, i * 4, 7, i * 4, 10); }
  } else if (sh === 'spark') {
    c.fillStyle = 'rgba(255,170,110,0.22)'; circ(c, 0, 0, b.r * 1.7);
    c.rotate(b.t * 4);
    c.fillStyle = b.color;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? b.r * 0.45 : b.r * 1.25;
      c.lineTo(Math.cos((i / 16) * TAU) * r, Math.sin((i / 16) * TAU) * r);
    }
    c.fill();
  } else if (sh === 'invite') {
    c.rotate(a);
    c.fillStyle = '#fff'; rr(c, -7, -7, 14, 14, 2);
    c.fillStyle = '#1e88e5'; c.fillRect(-7, -7, 14, 4.5);
    c.fillStyle = '#1e88e5'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText('1:1', 0, 5);
  } else {
    c.globalAlpha = 0.3; c.fillStyle = b.color; circ(c, 0, 0, b.r * 1.6);
    c.globalAlpha = 1; circ(c, 0, 0, b.r);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    circ(c, -b.r * 0.25, -b.r * 0.25, b.r * 0.4);
  }
}

// ---------- environment ----------
function drawFloor(theme) {
  const x0 = sx(0), x1 = sx(ARENA.w), y0 = sy(0), y1 = sy(ARENA.h);
  ctx.fillStyle = theme.floorA;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = theme.floorB;
  const T = 100;
  for (let i = 0; i < ARENA.w / T; i++) {
    for (let j = 0; j < ARENA.h / T; j++) {
      if ((i + j) % 2) continue;
      const ax = sx(i * T), ay = sy(j * T);
      if (ax > View.W || ax + T * View.S < 0 || ay > View.H || ay + T * View.S < 0) continue;
      ctx.fillRect(ax, ay, T * View.S + 0.5, T * View.S * YK + 0.5);
    }
  }
  // front lip to give the slab some thickness
  ctx.fillStyle = theme.trim;
  ctx.fillRect(x0, y1, x1 - x0, 14 * View.S);
  ctx.strokeStyle = theme.neon; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = 1;
}

function drawBackWall(theme, t, doorOpen) {
  const x0 = sx(0), x1 = sx(ARENA.w), yt = sy(0, WALL_H), yb = sy(0, 0), S = View.S;
  const g = ctx.createLinearGradient(0, yt, 0, yb);
  g.addColorStop(0, theme.wallTop); g.addColorStop(1, theme.wall);
  ctx.fillStyle = g;
  ctx.fillRect(x0, yt, x1 - x0, yb - yt);
  // windows with a city behind
  const n = 8, ww = ARENA.w / n;
  for (let i = 0; i < n; i++) {
    if (i === 3 || i === 4) continue;
    const wx0 = sx(i * ww + 22), w = (ww - 44) * S, wy0 = sy(0, WALL_H - 28), h = 84 * S;
    const sg = ctx.createLinearGradient(0, wy0, 0, wy0 + h);
    sg.addColorStop(0, theme.sky0); sg.addColorStop(1, theme.sky1);
    ctx.fillStyle = sg; ctx.fillRect(wx0, wy0, w, h);
    ctx.fillStyle = 'rgba(10,14,30,0.75)';
    for (let k = 0; k < 5; k++) {
      const bh = (22 + ((i * 37 + k * 53) % 46)) * S;
      ctx.fillRect(wx0 + (k * w) / 5, wy0 + h - bh, w / 5 - 2 * S, bh);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(wx0, wy0, w, h);
  }
  // elevator door (bosses arrive through it)
  const cx = sx(ARENA.w / 2), dw = 150 * S, dh = 128 * S;
  ctx.fillStyle = '#12151c'; ctx.fillRect(cx - dw / 2 - 6 * S, yb - dh - 6 * S, dw + 12 * S, dh + 6 * S);
  const open = doorOpen * dw * 0.46;
  ctx.fillStyle = theme.neon; ctx.globalAlpha = 0.35 * doorOpen + 0.05;
  ctx.fillRect(cx - dw / 2, yb - dh, dw, dh);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#8d99a6';
  ctx.fillRect(cx - dw / 2, yb - dh, dw / 2 - open, dh);
  ctx.fillRect(cx + open, yb - dh, dw / 2 - open, dh);
  ctx.strokeStyle = '#2b323c'; ctx.lineWidth = 2;
  ctx.strokeRect(cx - dw / 2, yb - dh, dw / 2 - open, dh);
  ctx.strokeRect(cx + open, yb - dh, dw / 2 - open, dh);
  // neon sign
  ctx.save();
  ctx.font = `900 ${Math.round(26 * S)}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const flick = Math.sin(t * 13) > -0.96 ? 1 : 0.5;
  ctx.globalAlpha = flick;
  ctx.shadowColor = theme.neon; ctx.shadowBlur = 18 * S;
  ctx.fillStyle = '#fff';
  ctx.fillText(theme.sign, cx, yt + 17 * S);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x0, yb - 5 * S, x1 - x0, 5 * S);
}

function drawDesk(ob, theme) {
  const x0 = sx(ob.x), w = ob.w * View.S;
  const yTopBack = sy(ob.y, ob.h), yTopFront = sy(ob.y + ob.d, ob.h), yBot = sy(ob.y + ob.d, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x0 + 6 * View.S, yBot - 4 * View.S, w, 10 * View.S);
  ctx.fillStyle = theme.deskTop;
  ctx.fillRect(x0, yTopBack, w, yTopFront - yTopBack);
  ctx.fillStyle = theme.deskSide;
  ctx.fillRect(x0, yTopFront, w, yBot - yTopFront);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0, yTopFront, w, 2 * View.S);
  // monitors
  const S = View.S, n = Math.max(1, Math.floor(ob.w / 90));
  for (let i = 0; i < n; i++) {
    const mx = x0 + ((i + 0.5) * w) / n, my = (yTopBack + yTopFront) / 2;
    ctx.fillStyle = '#20242c'; ctx.fillRect(mx - 3 * S, my - 10 * S, 6 * S, 10 * S);
    ctx.fillStyle = '#20242c'; ctx.fillRect(mx - 22 * S, my - 38 * S, 44 * S, 28 * S);
    ctx.fillStyle = ob.dead ? '#3a1414' : theme.screen; ctx.fillRect(mx - 19 * S, my - 35 * S, 38 * S, 22 * S);
  }
}

function speechBubble(x, y, z, text, color = '#fff') {
  const S = Math.max(View.S, 0.7);
  ctx.save();
  ctx.font = `bold ${Math.round(15 * S)}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const w = ctx.measureText(text).width + 20 * S, h = 28 * S;
  const cx = clamp(sx(x), w / 2 + 6, View.W - w / 2 - 6), cy = Math.max(h, sy(y, z) - h);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 9 * S); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6 * S, cy + h / 2 - 1); ctx.lineTo(cx, cy + h / 2 + 9 * S); ctx.lineTo(cx + 6 * S, cy + h / 2 - 1); ctx.fill();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}
