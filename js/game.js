'use strict';
// ---------- meta: what you carried out so far ----------
const Bank = {
  money: 0, best: 0, runs: 0, ceo: [], // ceo: every boss you have ever made sign
  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('layoff_games_bank') || '{}')); } catch (e) { /* storage unavailable: play without a bank */ }
    this.money = +this.money || 0; this.best = +this.best || 0; this.runs = +this.runs || 0;
    if (!Array.isArray(this.ceo)) this.ceo = [];
  },
  save() {
    try { localStorage.setItem('layoff_games_bank', JSON.stringify({ money: this.money, best: this.best, runs: this.runs, ceo: this.ceo })); } catch (e) { /* ignore */ }
  },
};
const KITS = [
  { id: 'bare', icon: '📎', cost: 0, apply() {} },
  { id: 'std', icon: '🪭', cost: 2000, apply(p) { p.weapon = 'fan'; p.armor = 50; p.tea = 3; } },
  { id: 'pro', icon: '⌨️', cost: 6000, apply(p) { p.weapon = 'keyboard'; p.armor = 100; p.tea = 5; } },
];
const Settings = {
  fx: true, auto: true, // auto: step down (3D -> 2D -> no lighting pass) by itself if this device can't keep up
  mode3d: true, forced3d: false, forcedFx: false,
  quality: -1, // 3D quality level 0..3, or -1 to let the game pick and adjust it
  load() {
    try { const v = localStorage.getItem('layoff_games_fx'); if (v !== null) this.fx = v === '1'; } catch (e) { /* ignore */ }
    if (/[?&]fx=0/.test(location.search)) this.fx = false;
    if (/[?&]fx=1/.test(location.search)) { this.fx = true; this.auto = false; this.forcedFx = true; }
    try { const v = localStorage.getItem('layoff_games_q'); if (v !== null) this.quality = clamp(+v || 0, -1, 3); } catch (e) { /* ignore */ }
    try { const v = localStorage.getItem('layoff_games_3d'); if (v !== null) this.mode3d = v === '1'; } catch (e) { /* ignore */ }
    if (/[?&]mode=2d/.test(location.search)) this.mode3d = false;
    if (/[?&]mode=3d/.test(location.search)) { this.mode3d = true; this.auto = false; this.forced3d = true; }
  },
  save() { try { localStorage.setItem('layoff_games_fx', this.fx ? '1' : '0'); localStorage.setItem('layoff_games_3d', this.mode3d ? '1' : '0'); localStorage.setItem('layoff_games_q', String(this.quality)); } catch (e) { /* ignore */ } },
};
const money = (n) => '¥' + Math.round(n).toLocaleString('en-US');

// ---------- match flow ----------
let canvas, DPR = 1, SDPR = 1; // the world renders at up to 1.5x; the HUD stays at full sharpness
let hctx = null, sctx = null, sceneCv = null, glCv = null, c3 = null; // HUD canvas (also takes input), offscreen world canvas, WebGL output

function startMatch(kit, training) {
  Bank.money -= kit.cost; Bank.save();
  genWorld();
  R3.build();
  setArena(ARENA.w / 2, ARENA.h / 2, 3300);
  const p = (G.player = makePlayer());
  kit.apply(p);
  Object.assign(G, { state: 'play', time: 0, kills: 0, signed: 0, exT: 0, result: null, lastHit: '', cine: null, run: null, boss: null });
  G.quest = { i: 0, doneT: 0, scan: 0, now: null, tg: null, showT: 0, showMax: 4 };
  G.training = !!training; G.impactT = 0;
  if (training) {
    // the training ground: five sandbags in a ring out in the park, nobody else, every weapon on a key
    for (let i = 0; i < 200; i++) {
      const a = rand(TAU), d = rand(1500, 1900);
      p.x = clamp(ARENA.w / 2 + Math.cos(a) * d, 320, ARENA.w - 320); p.y = clamp(ARENA.h / 2 + Math.sin(a) * d, 320, ARENA.h - 320);
      if (isClear(p.x, p.y, 70) && !G.bosses.some((b) => dist(p.x, p.y, b.home.x + b.home.w / 2, b.home.y + b.home.h / 2) < 1000)) break;
    }
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.62, d = 190 + (k % 2) * 60, e = spawnRival(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, k % 3);
      e.dummy = true; e.hx = e.x; e.hy = e.y; e.hp = e.maxhp = 320; e.armor = 0;
    }
    p.weapon = 'keyboard'; p.tea = 6;
  } else startRun();
  View.cam.x = p.x; View.cam.y = p.y;
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* not available */ }
  UI.hide();
  if (training) banner(T('train_title'), T(Input.touch ? 'train_sub_touch' : 'train_sub'), 4.5, '#ffe14d');
  Sfx.play('boss');
}

// kind: 'dead' (you keep half of what you carried) or 'clear' (all five signed: everything, plus a bonus)
function endMatch(kind) {
  const p = G.player, run = G.run, haul = p.loot.value, bonus = kind === 'clear' ? CLEAR_BONUS : 0;
  const kept = !run ? 0 : kind === 'clear' ? haul + bonus : Math.round(haul * 0.5);
  G.state = 'over';
  G.result = { kind, haul, bonus, kept, floor: run ? run.floor + 1 : 0, by: G.lastHit, time: G.time, kills: G.kills, signed: G.signed, counts: p.loot.counts.slice(), boons: Object.assign({}, p.boons) };
  Bank.money += kept; Bank.best = Math.max(Bank.best, kept);
  Bank.runs++; Bank.save();
  Sfx.play(kind === 'dead' ? 'dead' : 'win');
  if (kind !== 'dead') burst(p.x, p.y, 40, 60, ['#7df0a0', '#ffe08a', '#fff', '#8fe8ff'], { sp: 320, up: 420, life: 1.4 });
  setTimeout(showResult, kind === 'dead' ? 1200 : 900);
}
function playerDie() {
  const p = G.player;
  poof(p.x, p.y, ['#fff', '#cdd6ff', '#5c7cf0']);
  endMatch('dead');
}

function update(dt) {
  if (Input.take('Escape') || Input.take('KeyP') || Input.take('btn_pause')) return showPause();
  const p = G.player;
  // perfect dodge: the world runs slow, you don't
  const wdt = G.slowT > 0 ? dt * 0.28 : dt;
  G.slowT = Math.max(0, G.slowT - dt);
  G.time += wdt;
  updatePlayer(dt);
  if (G.state !== 'play') return;

  if (G.run) { updateRun(dt); if (G.state !== 'play' || G.cine) return; }
  for (const b of G.bosses) if (b !== G.boss) b.t += dt;
  updateBullets(dt);
  updateUlts(dt);
  updateEnemies(wdt);
  updateBoss(wdt);
  updateEBullets(wdt);
  updateZones(wdt);
  updateLasers(wdt);
  updateContainers(dt);
  updatePickups(dt);
  updatePets(dt);
  if (G.run) updateQuest(dt);
  updateFx(dt);
  if (G.state !== 'play') return;

  // look a little ahead of where you are running, easing into it so changing direction does not swing the view
  const lk = 1 - Math.pow(0.08, dt), run = p.dashT > 0 || p.lungeT > 0 ? 0 : 0.11;
  G.lax = lerp(G.lax || 0, p.mvx * run, lk); G.lay = lerp(G.lay || 0, p.mvy * run * 0.8, lk);
  updateCamera(dt, p.x + G.lax, p.y + G.lay);
}

// ---------- the boss's entrance ----------
// The first time you walk up to a CEO the fight holds its breath: the camera goes in close, the name comes up.
function startCine(b) {
  const p = G.player;
  G.cine = { b, t: 0, dur: 4.6 };
  Input.pressed = {};
  p.moving = false; p.mvx = p.mvy = 0; p.charge = 0; p.hold = 0; p.buf = p.hbuf = 0;
  G.banner = null;
  Sfx.play('boss');
}
const cineK = () => { const c = G.cine; if (!c) return 0; const k = clamp(Math.min(c.t / 0.8, (c.dur - c.t) / 0.5), 0, 1); return k * k * (3 - 2 * k); };
function updateCine(dt) {
  const c = G.cine;
  c.t += dt; c.b.t += dt;
  // It cannot be skipped until the name has been up for a moment: whatever you were mashing when it began is
  // thrown away. After that, a deliberate press moves on.
  if (c.t < 2.6) Input.pressed = {};
  else if (c.t < c.dur - 0.5 && (Input.take('lclick') | Input.take('Space') | Input.take('tap') | Input.take('Escape') | Input.take('KeyJ'))) c.t = c.dur - 0.5;
  updateCamera(dt, lerp(G.player.x, c.b.x, cineK()), lerp(G.player.y, c.b.y - 30, cineK()));
  updateFx(dt * 0.3);
  if (c.t < c.dur) return;
  G.cine = null;
  Input.pressed = {};
  say(c.b, T('q_' + c.b.id + '_intro'), 3);
}
function drawCine() {
  const c = G.cine, W = View.W, H = View.H, u = clamp(Math.min(W, H) / 720, 0.72, 1.25), k = cineK(), col = THEMES[c.b.id].neon;
  const bh = H * 0.13 * k;
  ctx.fillStyle = '#15121f'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  const a = clamp((c.t - 0.9) / 0.4, 0, 1) * clamp((c.dur - c.t) / 0.45, 0, 1);
  if (a <= 0) return;
  const size = Math.min(66 * u, W * 0.088), x = W * 0.07 - (1 - a) * 70, y = H - bh - size * 1.75;
  ctx.globalAlpha = a;
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.font = `900 ${Math.round(size)}px ${FONT}`;
  const w = ctx.measureText(T('n_' + c.b.id)).width;
  ctx.beginPath(); ctx.moveTo(x - 6, y + size * 0.72); ctx.lineTo(x + w * a + 26, y + size * 0.72); ctx.lineTo(x + w * a + 12, y + size * 0.72 + 9 * u); ctx.lineTo(x - 20, y + size * 0.72 + 9 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
  hudText(T('n_' + c.b.id), x, y + size * 0.2, size, '#fff', 'left', 900);
  hudText(T('t_' + c.b.id), x + 2, y + size * 0.72 + 34 * u, Math.min(24 * u, W * 0.045), col, 'left', 900);
  ctx.globalAlpha = 1;
}

function updateCamera(dt, tx, ty) {
  const k = 1 - Math.pow(0.006, dt); // soft enough to swallow attack lunges without a jolt
  View.cam.x = lerp(View.cam.x, tx, k); View.cam.y = lerp(View.cam.y, ty, k);
}

// ---------- rendering ----------
const ZONE_RGB = { snap: '255,190,40', rocket: '255,100,50', feed: '255,45,111', delay: '255,45,111', grid: '255,120,60', red: '255,70,70' };

function drawZone(z) {
  const rgb = ZONE_RGB[z.look] || ZONE_RGB.red, u = clamp(z.t / z.delay, 0, 1), S = View.S;
  if (z.kind === 'circle') {
    if (!z.done) {
      ctx.fillStyle = `rgba(${rgb},${0.16 + 0.14 * u})`; groundEllipse(z.x, z.y, z.r); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.95)`; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = `rgba(${rgb},0.34)`; groundEllipse(z.x, z.y, z.r * u); ctx.fill();
      if (z.look === 'rocket') {
        at(z.x, z.y, (1 - u) * (1 - u) * 700 + 10, (c) => {
          ink(c, 1.6);
          c.fillStyle = '#fdfdf8'; rrS(c, -6, -34, 12, 34, 5);
          c.fillStyle = '#3b3550'; poly(c, [-6, -8, -12, 2, -6, 0], true); poly(c, [6, -8, 12, 2, 6, 0], true);
          c.fillStyle = '#ff7043'; poly(c, [-5, -34, 0, -52 - rand(8), 5, -34]);
        });
      } else if (z.look === 'delay') {
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(22 * S)}px sans-serif`;
        ctx.fillText(Math.max(0, z.delay - z.t).toFixed(1), sx(z.x), sy(z.y));
      }
    } else {
      ctx.fillStyle = `rgba(${rgb},${0.6 * (1 - (z.t - z.delay) / z.linger)})`; groundEllipse(z.x, z.y, z.r); ctx.fill();
    }
    return;
  }
  const x = sx(z.x), y = sy(z.y), w = z.w * S, h = z.h * S * YK;
  if (!z.done) {
    ctx.fillStyle = `rgba(${rgb},${0.14 + 0.18 * u + (u > 0.7 ? Math.sin(z.t * 40) * 0.05 : 0)})`; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${rgb},0.9)`; ctx.lineWidth = 2.5; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = `rgba(${rgb},0.26)`;
    if (z.w > z.h) ctx.fillRect(x, y, w * u, h); else ctx.fillRect(x, y, w, h * u);
  } else {
    const k = 1 - (z.t - z.delay) / z.linger;
    ctx.fillStyle = `rgba(${rgb},${0.55 * k})`; ctx.fillRect(x, y, w, h);
    if (z.look === 'feed') {
      const horiz = z.w > z.h, n = 9;
      for (let i = 0; i < n; i++) {
        const q = ((i / n + (z.t - z.delay) * 2.4) % 1);
        ctx.fillStyle = i % 2 ? '#25f4ee' : '#ff2d6f';
        ctx.globalAlpha = 0.8 * k;
        if (horiz) ctx.fillRect(x + q * w, y + h * 0.15, 46 * S, h * 0.7);
        else ctx.fillRect(x + w * 0.15, y + q * h, w * 0.7, 46 * S * YK);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawLaser(l) {
  const active = l.t >= l.tele, w = active ? l.width : l.width * (0.2 + 0.8 * (l.t / l.tele));
  const dx = Math.cos(l.a), dy = Math.sin(l.a), nx = (-dy * w) / 2, ny = (dx * w) / 2;
  const ex = l.x + dx * l.len, ey = l.y + dy * l.len;
  ctx.beginPath();
  ctx.moveTo(sx(l.x + nx), sy(l.y + ny)); ctx.lineTo(sx(ex + nx), sy(ey + ny));
  ctx.lineTo(sx(ex - nx), sy(ey - ny)); ctx.lineTo(sx(l.x - nx), sy(l.y - ny));
  ctx.closePath();
  if (l.look === 'warn') { ctx.fillStyle = `rgba(255,70,70,${0.22 + 0.14 * Math.sin(l.t * 30)})`; ctx.fill(); return; }
  if (l.look === 'flame') {
    ctx.fillStyle = active ? 'rgba(255,112,67,0.55)' : 'rgba(255,112,67,0.2)'; ctx.fill();
    if (!active) { ctx.strokeStyle = 'rgba(255,120,60,0.9)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    return;
  }
  ctx.fillStyle = active ? 'rgba(255,250,235,0.94)' : 'rgba(255,250,235,0.25)'; ctx.fill();
  ctx.strokeStyle = active ? INK : 'rgba(255,120,60,0.8)'; ctx.lineWidth = active ? 2.2 : 1.5; ctx.stroke();
  if (!active) return;
  ctx.strokeStyle = 'rgba(60,40,30,0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let d = 70; d < l.len; d += 22) {
    const k = ((d * 7) % 5) / 5 * 0.25 + 0.15;
    const px = l.x + dx * d, py = l.y + dy * d;
    ctx.moveTo(sx(px + nx * 0.7), sy(py + ny * 0.7));
    ctx.lineTo(sx(px - nx * k), sy(py - ny * k));
  }
  ctx.stroke();
}

function heldWeapon(aim, face, id, scale = 1.25) {
  return (cc, hx, hy) => {
    const sa = Math.atan2(Math.sin(aim) * YK, Math.cos(aim));
    cc.save(); cc.translate(hx, hy); cc.rotate(face > 0 ? sa : Math.PI - sa); cc.translate(12, 0);
    drawWeapon(cc, id, scale);
    cc.restore();
  };
}

// The white crescent a swing leaves behind (drawn flat on the ground plane).
function drawSlash(s) {
  const u = s.t / s.life;
  ground((c) => {
    c.globalAlpha = (1 - u) * (s.fin ? 0.92 : 0.78);
    if (s.line) {
      c.lineCap = 'round';
      c.strokeStyle = s.col; c.lineWidth = 46 * (1 - u * 0.6);
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + Math.cos(s.a) * s.reach, s.y + Math.sin(s.a) * s.reach); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 15 * (1 - u); c.stroke();
      return;
    }
    const sweep = Math.min(1, u * 3.2 + 0.45), a0 = s.a - s.half * s.dir, a1 = a0 + s.half * 2 * sweep * s.dir;
    const r1 = s.reach * (1 + u * 0.1), r0 = s.reach * (0.3 + u * 0.5);
    c.beginPath(); c.arc(s.x, s.y, r1, a0, a1, s.dir < 0); c.arc(s.x, s.y, r0, a1, a0, s.dir > 0); c.closePath();
    if (Q2D.level > 0) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = s.col; c.lineWidth = s.fin ? 26 : 16; c.globalAlpha = (1 - u) * 0.3; c.stroke(); c.globalCompositeOperation = 'source-over'; }
    c.globalAlpha = (1 - u) * (s.fin ? 0.95 : 0.85);
    c.fillStyle = '#fff'; c.fill();
    c.strokeStyle = s.col; c.lineWidth = s.fin ? 8 : 5; c.stroke();
    // leading edge: a hard bright line where the weapon is right now
    c.strokeStyle = '#fff'; c.lineWidth = s.fin ? 9 : 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s.x + Math.cos(a1) * r0, s.y + Math.sin(a1) * r0); c.lineTo(s.x + Math.cos(a1) * r1, s.y + Math.sin(a1) * r1); c.stroke();
  });
}
// Hit sparks: a flash star at the contact point and streaks thrown along the blow.
function drawSpark(s) {
  const u = s.t / s.life, S = View.S, x = sx(s.x), y = sy(s.y, s.z);
  ctx.globalAlpha = 1 - u * u;
  if (s.star) {
    const r = s.len * S * (0.5 + u * 0.9);
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.rot);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const q = i % 2 ? r * 0.16 : r; ctx.lineTo(Math.cos((i / 8) * TAU) * q, Math.sin((i / 8) * TAU) * q); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
    return;
  }
  const dx = Math.cos(s.a), dy = Math.sin(s.a) * YK, r0 = s.len * S * u * 0.75, r1 = s.len * S * (0.25 + u * 0.9);
  ctx.strokeStyle = s.col; ctx.lineWidth = s.w * S * (1 - u * 0.6); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + dx * r0, y + dy * r0); ctx.lineTo(x + dx * r1, y + dy * r1); ctx.stroke();
}
function drawUltMark(u) {
  const k = clamp(u.t / u.delay, 0, 1);
  if (u.done) { ctx.fillStyle = `rgba(255,207,74,${0.5 * (1 - (u.t - u.delay) / 0.45)})`; groundEllipse(u.x, u.y, u.r); ctx.fill(); return; }
  ctx.fillStyle = `rgba(255,207,74,${0.16 + 0.16 * k})`; groundEllipse(u.x, u.y, u.r); ctx.fill();
  ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(255,207,74,0.38)'; groundEllipse(u.x, u.y, u.r * k); ctx.fill();
}
function drawUltBook(u) {
  const k = clamp(u.t / u.delay, 0, 1);
  shadow(u.x, u.y, 60 * k, 0.3);
  at(u.x, u.y, u.done ? 0 : (1 - k) * (1 - k) * 900, (c) => {
    c.translate(0, -62); c.rotate(u.done ? 0.12 : (1 - k) * 2.5);
    drawWeapon(c, 'book', 6.2);
  });
}

const PLAYER_LOOK = { top: '#4f7bf0', bottom: '#3b4a6b', skin: '#f6d3b3', hair: '#2a2233', hairStyle: 'messy', bags: true, badge: '#ffcf4a', pack: '#ff9d3c' };
function drawPlayer(p) {
  if (p.hp <= 0) return;
  shadow(p.x, p.y, p.r);
  if (p.charge > 0.2) {
    // winding up a spin attack: the ring shows how far it will reach
    const lv = chargeLevel(p.charge), ready = lv > 0;
    ctx.strokeStyle = ready ? `rgba(255,${lv === 3 ? 150 : 224},${lv === 3 ? 70 : 138},${0.6 + Math.sin(p.t * 22) * 0.3})` : 'rgba(255,255,255,0.4)'; ctx.lineWidth = ready ? 3 + lv : 2;
    groundEllipse(p.x, p.y, [100, 125, 155, 195][lv]); ctx.stroke();
    if (ready && rand() < 0.5) part(p.x + rand(-18, 18), p.y, rand(4, 50), { vz: rand(60, 160), life: 0.4, color: '#ffe08a', size: 4, grav: -80, round: true });
  }
  const w = WEAPONS[p.weapon];
  let wa = p.aim, ws = 1.25;
  if (p.swingT > 0) { const k = 1 - p.swingT / p.swingMax; wa = p.swingA + lerp(-w.arc, w.arc, clamp(k * 1.6, 0, 1)) * p.swingDir; ws = 1.5; }
  ctx.globalAlpha = p.inv > 0 && p.dashT <= 0 && Math.floor(p.t * 22) % 2 ? 0.4 : p.hidden ? 0.72 : 1;
  const lean = p.swingT > 0 ? Math.sin(clamp(1 - p.swingT / p.swingMax, 0, 1) * Math.PI) * 0.2 : p.moving && p.dashT <= 0 ? 0.07 : 0;
  lit(p.x, p.y, 0, 150, 130, (c) => { c.rotate(lean * p.face); drawPerson(c, Object.assign({}, PLAYER_LOOK, {
    t: p.t, moving: p.moving, pace: 15, face: p.face, scared: p.hurtT > 0, armUp: p.castT > 0 || p.charge > 0.3, plaid: p.armor > 0 ? 'rgba(255,255,255,0.4)' : null,
    extra: heldWeapon(wa, p.face, p.weapon, ws),
  })); });
  ctx.globalAlpha = 1;
}

const HR_LOOK = { top: '#f06292', shirt: '#fff', bottom: '#3b4a6b', skin: '#f6d3b3', hair: '#4a3327', hairStyle: 'long', smile: true };
const MGR_LOOK = { top: '#7889a3', shirt: '#fff', tie: '#e5484d', bottom: '#3b4a6b', skin: '#eec3a2', hairStyle: 'bald', scale: 1.35 };
const LVL_COL = ['#ffffff', '#9cc9ff', '#ffcf4a'];
const WHITE = { top: '#fff', bottom: '#fff', skin: '#fff', hair: '#fff', shirt: null, tie: null, plaid: null, band: null, badge: null, glasses: null, logo: null };
function enemyFigure(c, e) {
  // hit flash: the whole figure goes white and squashes for a few frames
  const fl = e.flash > 0 ? WHITE : null;
  if (fl) c.scale(1.2, 0.86);
  if (e.type === 'rival') drawPerson(c, Object.assign({}, e.look, fl, { t: e.t, moving: e.moving, face: e.face, scared: e.stun > 0, extra: heldWeapon(e.wind > 0 ? e.windA - 1.5 * e.face : e.aim, e.face, e.w, e.wind > 0 ? 1.45 : 1.2), pace: 13 }));
  else if (e.type === 'penguin') drawPenguin(c, e.t, e.face, false);
  else if (e.type === 'drone') drawDrone(c, e.t);
  else if (e.type === 'agent') drawAgentBot(c, e.t, e.face);
  else if (e.type === 'doubao') drawDoubao(c, e.t, e.face);
  else if (e.type === 'crab') drawCrab(c, e.t, e.face);
  else if (e.type === 'gpt') drawGptBot(c, e.t, e.face);
  else if (e.type === 'hr') drawPerson(c, Object.assign({}, HR_LOOK, fl, { t: e.t, moving: !e.asleep, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#a1887f'; rrS(cc, hx - 2, hy - 9, 10, 13, 1.5); cc.fillStyle = '#fff'; cc.fillRect(hx - 0.5, hy - 7, 7, 9); } }));
  else drawPerson(c, Object.assign({}, MGR_LOOK, fl, { t: e.t, moving: !e.asleep, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#fff'; rrS(cc, hx - 3, hy - 7, 8, 8, 1.5); cc.fillStyle = '#8a5a3c'; cc.fillRect(hx - 2, hy - 6, 6, 2); } }));
  if (fl && e.type !== 'rival' && e.type !== 'hr' && e.type !== 'manager') { c.fillStyle = 'rgba(255,255,255,0.8)'; circ(c, 0, -15, 19); }
}
function drawEnemy(e) {
  const rise = e.spawnT > 0 ? e.spawnT / 0.6 : 0, S = View.S;
  if (e.wind > 0) {
    // red wedge: where this swing is about to land
    const w = WEAPONS[e.w], k = 1 - e.wind / e.windMax;
    ground((c) => {
      c.fillStyle = `rgba(255,50,50,${0.16 + 0.34 * k})`;
      c.beginPath(); c.moveTo(e.x, e.y); c.arc(e.x, e.y, w.reach + 6, e.windA - w.arc, e.windA + w.arc); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,50,50,0.9)'; c.lineWidth = 3; c.stroke();
    });
  } else if (e.dashWind > 0) {
    ground((c) => {
      c.strokeStyle = `rgba(255,50,50,${0.25 + 0.4 * (1 - e.dashWind / 0.5)})`; c.lineWidth = 40; c.lineCap = 'round';
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x + Math.cos(e.dashA) * 250, e.y + Math.sin(e.dashA) * 250); c.stroke();
    });
  }
  shadow(e.x, e.y, e.r * (e.z > 10 ? 0.75 : 1) * (1 - rise * 0.5));
  ctx.globalAlpha = 1 - rise;
  // struck: the figure judders in place for a few frames
  const jit = e.hitAt !== undefined ? Math.max(0, 1 - (G.t - e.hitAt) / 0.2) : 0;
  // (the key: a new image fifteen times a second, and at once whenever what they are doing or holding changes)
  const fk = Math.floor(e.t * 15) + (e.flash > 0 ? 'f' : '') + (e.stun > 0 ? 's' : '') + (e.asleep ? 'z' : '') + (e.moving ? 'm' : '') + e.face + (e.type === 'rival' ? e.w + Math.round((e.wind > 0 ? e.windA : e.aim) * 5) + (e.wind > 0 ? 'w' : '') : '');
  figure(e, fk, e.x + Math.sin(G.t * 95) * 5 * jit, e.y, e.z + rise * 50, 150, 150, (c) => enemyFigure(c, e));
  ctx.globalAlpha = 1;
  if (e.type === 'rival') {
    const y = sy(e.y, 82);
    ctx.font = `800 ${Math.round(11 * Math.max(S, 0.8))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.strokeText(rivalName(e), sx(e.x), y); ctx.fillStyle = LVL_COL[e.lvl]; ctx.fillText(rivalName(e), sx(e.x), y);
  }
  if (e.stun > 0) {
    ctx.font = `800 ${Math.round(14 * S)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe14d';
    for (let i = 0; i < 3; i++) ctx.fillText('✦', sx(e.x) + Math.cos(G.t * 7 + i * 2.1) * 16 * S, sy(e.y, e.z + 74) + Math.sin(G.t * 7 + i * 2.1) * 5 * S);
  } else if (e.asleep && e.type !== 'rival') {
    ctx.font = `800 ${Math.round(13 * S)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('z', sx(e.x) + 12 * S, sy(e.y, 50 + ((G.t * 14) % 14)));
  }
  if (e.hp < e.maxhp && (e.type === 'rival' || e.type === 'manager')) {
    const w = 40 * S, x = sx(e.x) - w / 2, y = sy(e.y, e.type === 'rival' ? 70 : 92);
    ctx.fillStyle = INK; ctx.fillRect(x - 1.5, y - 1.5, w + 3, 7);
    ctx.fillStyle = '#ff5a5f'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxhp, 0, 1), 4);
  }
}

function drawBullet(b) {
  shadow(b.x, b.y, b.r * 0.8, 0.18);
  at(b.x, b.y, b.z, (c) => {
    const a = Math.atan2(b.vy * YK, b.vx);
    ink(c, 1.2);
    if (b.id === 'pan') { c.rotate(b.t * 22); drawWeapon(c, 'pan', 1.5); }
    else if (b.id === 'claw') { c.rotate(a); c.fillStyle = '#d97757'; c.beginPath(); c.arc(0, 0, 8, -1.2, 1.2); c.arc(-4, 0, 6, 0.9, -0.9, true); c.closePath(); c.fill(); c.stroke(); }
    else { c.rotate(b.t * 10); c.fillStyle = '#3ddc97'; rrS(c, -5.5, -5.5, 11, 11, 3); c.fillStyle = '#fff'; c.fillRect(-2, -2, 4, 4); }
  });
}
function drawPet(q) {
  shadow(q.x, q.y, 12);
  ctx.strokeStyle = '#5df09a'; ctx.lineWidth = 2; groundEllipse(q.x, q.y, 17); ctx.stroke();
  figure(q, Math.floor(q.t * 15) + (q.moving ? 'm' : '') + q.face, q.x, q.y, q.type === 'doubao' ? Math.abs(Math.sin(q.t * 5)) * 6 : 0, 90, 90, (c) => {
    if (q.type === 'doubao') drawDoubao(c, q.t, q.face); else if (q.type === 'crab') drawCrab(c, q.moving ? q.t : 0, q.face); else drawGptBot(c, q.t, q.face);
  });
}

function drawPickup(k) {
  const tier = k.kind === 'val' ? k.tier : k.kind === 'weapon' ? WEAPONS[k.id].tier : k.kind === 'armor' ? 2 : 1, col = TIER[tier], S = View.S;
  if (k.z <= 0) {
    ctx.fillStyle = col; ctx.globalAlpha = 0.35; groundEllipse(k.x, k.y, 20); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2.5; groundEllipse(k.x, k.y, 20 + Math.sin(k.t * 5) * 2); ctx.stroke();
    if (tier >= 3) {
      const g = ctx.createLinearGradient(0, sy(k.y, 240), 0, sy(k.y));
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col);
      ctx.globalAlpha = 0.5; ctx.fillStyle = g; ctx.fillRect(sx(k.x) - 7 * S, sy(k.y, 240), 14 * S, 240 * S); ctx.globalAlpha = 1;
    }
  }
  at(k.x, k.y, k.z + 24 + (k.z <= 0 ? Math.sin(k.t * 4) * 4 : 0), (c) => {
    if (k.kind === 'weapon') drawWeapon(c, k.id, 1.7); else drawLootIcon(c, k);
  });
}

function render() {
  // (at the plainest 2D level the zoom punch is left out: scaling the whole ground every hit is what made hits stutter there)
  View.S = View.S0 * (1 + (Q2D.level > 0 ? View.zk * CAM.zoom : 0)) * (1 + cineK() * 0.55);
  const S = View.S, p = G.player, t = G.t;
  // with the lighting pass on, the world goes to an offscreen canvas and through the shader
  const fx = Post.ok && Settings.fx && Q2D.level > 0;
  if (glCv.style.display !== (fx ? 'block' : 'none')) glCv.style.display = fx ? 'block' : 'none';
  if (sceneCv.style.display !== (fx ? 'none' : 'block')) sceneCv.style.display = fx ? 'none' : 'block';
  // The world is drawn on its own canvas, at its own (lower) pixel ratio; the canvas above it only ever holds the
  // HUD, which therefore stays sharp however plain the world is being drawn.
  const rd = SDPR;
  RENDER.k = S * rd;
  ctx = sctx;
  ctx.setTransform(rd, 0, 0, rd, 0, 0);
  ctx.globalAlpha = 1;
  // shake is a quick smooth wobble rather than per-frame noise; the camera also leans a little with each blow
  View.ox = Math.sin(G.t * 53) * View.shake * CAM.shake - View.kx * CAM.kick; View.oy = Math.cos(G.t * 41) * View.shake * CAM.shake - View.ky * CAM.kick;
  setSun(G.day);
  drawTerrain(G.map, t);
  for (const e of G.exits) if (onScreen(e.x, e.y, 320)) drawExit(e, t);
  for (const z of G.zones) drawZone(z);
  for (const l of G.lasers) drawLaser(l);
  for (const r of G.rings) {
    const u = r.t / r.life;
    ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - u; ctx.lineWidth = 5 * (1 - u) + 1;
    groundEllipse(r.x, r.y, r.r * (0.4 + 0.6 * u)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const u of G.ults) drawUltMark(u);
  for (const s of G.slashes) drawSlash(s);
  const dg = G.state === 'play' ? Input.drag() : null;
  if (dg) {
    // dragging a skill button: show where it will go
    const a = Math.atan2((dg.y - dg.oy) / YK, dg.x - dg.ox), k = Math.min(1, Math.hypot(dg.x - dg.ox, dg.y - dg.oy) / 80);
    ctx.fillStyle = 'rgba(143,232,255,0.3)'; ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 2.5;
    if (dg.id === 'r') { const d = clamp(k * 360, 60, 340); groundEllipse(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 170); ctx.fill(); ctx.stroke(); }
    else if (dg.id === 'w') { groundEllipse(p.x, p.y, 140); ctx.fill(); ctx.stroke(); }
    else {
      const len = dg.id === 'q' ? 460 : 270;
      ground((c) => { c.strokeStyle = 'rgba(143,232,255,0.45)'; c.lineWidth = 36; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); c.stroke(); });
    }
  }

  // depth-sorted billboards (only what's on screen)
  const list = [];
  for (const ob of G.obstacles) {
    if (ob.k === 'pond') continue;
    if (ob.k === 'box') {
      if (!onScreen(ob.x + ob.w / 2, ob.y + ob.d, ob.w / 2 + 240)) continue;
      list.push([ob.y + ob.d, ob.desk ? () => drawDesk(ob, THEMES[ob.theme]) : () => drawBuilding(ob, THEMES[ob.bld || 'shed'], t, ob.bld ? T('fl_' + ob.bld) : null)]);
    } else if (onScreen(ob.x, ob.y, 200)) {
      if (ob.k === 'rock') list.push([ob.y, () => drawRock(ob)]);
      else list.push([ob.y, () => drawTree(ob, t, p.y < ob.y && p.y > ob.y - 150 && Math.abs(p.x - ob.x) < ob.cr * 1.1)]);
    }
  }
  for (const row of G.map.grassRows) if (onScreen(row.x, row.y, 200)) list.push([row.y, () => drawGrassRow(row, t)]);
  for (const k of G.containers) if (onScreen(k.x, k.y)) list.push([k.y, () => drawContainer(k, t)]);
  for (const k of G.pickups) if (onScreen(k.x, k.y, 260)) list.push([k.y, () => drawPickup(k)]);
  for (const e of G.enemies) if (onScreen(e.x, e.y)) list.push([e.y, () => drawEnemy(e)]);
  for (const b of G.bosses) if (onScreen(b.x, b.y, 240)) list.push([b.y, () => drawBoss(b)]);
  if (G.state !== 'menu') list.push([p.y, () => drawPlayer(p)]);
  for (const q of G.pets) list.push([q.y, () => drawPet(q)]);
  for (const q of G.corpses) list.push([q.y, () => { shadow(q.x, q.y, 12, 0.2, 0); lit(q.x, q.y, q.z, 170, 170, (c) => { c.translate(0, -28); c.rotate(q.rot); c.translate(0, 28); if (q.t < 0.1) q.e.flash = 1; else q.e.flash = 0; enemyFigure(c, q.e); }); }]);
  for (const u of G.ults) list.push([u.y + 1, () => drawUltBook(u)]);
  for (const b of G.bullets) list.push([b.y, () => drawBullet(b)]);
  for (const b of G.ebullets) if (onScreen(b.x, b.y, 60)) list.push([b.y, () => { shadow(b.x, b.y, b.r * 0.8, 0.18); at(b.x, b.y, b.z, (c) => drawEnemyBullet(c, b)); }]);
  list.sort((a, b) => a[0] - b[0]);
  for (const it of list) it[1]();
  const lk = p.lock;
  if (lk && G.state === 'play') {
    // lock-on marker: a bouncing arrow and a ring under the target
    ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 3; groundEllipse(lk.x, lk.y, lk.r + 9 + Math.sin(t * 8) * 2); ctx.stroke();
    const ax = sx(lk.x), ay = sy(lk.y, (lk.z || 0) + (lk.def.attacks ? 128 : 96)) + Math.sin(t * 8) * 4 * S;
    ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ax - 9 * S, ay - 12 * S); ctx.lineTo(ax + 9 * S, ay - 12 * S); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  for (const q of G.parts) {
    ctx.globalAlpha = clamp(1 - q.t / q.life, 0, 1);
    ctx.fillStyle = q.color;
    const s = q.size * S;
    if (q.round) { ctx.beginPath(); ctx.arc(sx(q.x), sy(q.y, q.z), s / 2, 0, TAU); ctx.fill(); }
    else ctx.fillRect(sx(q.x) - s / 2, sy(q.y, q.z) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const fl of G.floats) {
    ctx.globalAlpha = clamp((fl.life - fl.t) * 3, 0, 1);
    ctx.font = `900 ${Math.round(fl.size * Math.max(S, 0.75) * (1 + Math.max(0, 0.12 - fl.t) * 7))}px ${FONT}`; // numbers land big, then settle
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.strokeText(fl.text, sx(fl.x), sy(fl.y, fl.z));
    ctx.fillStyle = fl.color; ctx.fillText(fl.text, sx(fl.x), sy(fl.y, fl.z));
  }
  for (const s of G.sparks) drawSpark(s);
  ctx.globalAlpha = 1;

  if (G.zone) drawStorm(G.zone, t);

  // wind and drifting motes of light: atmosphere, skipped at the plainest level
  ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
  const air = Q2D.level > 0;
  if (air) for (const w of G.wind) {
    const u = w.t / w.life, x0 = (w.x + u * 0.12) * View.W - (View.cam.x - w.cx) * S, y0 = w.y * View.H - (View.cam.y - w.cy) * S * YK, len = w.len * View.W;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.5; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + len * 0.35, y0 - 16, x0 + len * 0.65, y0 + 16, x0 + len, y0 - 4);
    ctx.stroke();
  }
  // motes of light drifting in the air
  ctx.globalCompositeOperation = 'lighter';
  if (air) for (const q of G.motes) {
    const u = (((q.x + Math.sin(t * 0.7 + q.ph) * 0.012 - (View.cam.x * S) / View.W) % 1) + 1) % 1, y = (((q.y + Math.sin(t * 0.4 + q.ph) * 0.03 - (View.cam.y * S * YK) / View.H) % 1) + 1) % 1, a = 0.4 + Math.sin(t * 1.6 + q.ph) * 0.35;
    ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#d8ff8a';
    ctx.beginPath(); ctx.arc(u * View.W, y * View.H, q.s * 2.8, 0, TAU); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = '#fbffd6';
    ctx.beginPath(); ctx.arc(u * View.W, y * View.H, q.s, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (p.outside && G.state === 'play') {
    const g = ctx.createRadialGradient(View.W / 2, View.H / 2, Math.min(View.W, View.H) * 0.3, View.W / 2, View.H / 2, Math.max(View.W, View.H) * 0.7);
    g.addColorStop(0, 'rgba(170,60,220,0)'); g.addColorStop(1, `rgba(170,60,220,${0.4 + Math.sin(t * 6) * 0.12})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, View.W, View.H);
  }
  if (G.flash) {
    ctx.fillStyle = `rgba(${G.flash.color},${G.flash.a * (G.flash.t / G.flash.max)})`;
    ctx.fillRect(0, 0, View.W, View.H);
  }
  if (fx) Post.draw(sceneCv, View.cam.x - View.ox / S, View.cam.y - View.oy / (S * YK), S * SDPR, YK, t, G.day, clamp(G.slowT * 2, 0, 1));
  else {
    if (G.slowT > 0) { ctx.fillStyle = `rgba(90,150,255,${0.22 * clamp(G.slowT * 2, 0, 1)})`; ctx.fillRect(0, 0, View.W, View.H); }
    if (air) ctx.drawImage(vignette(), 0, 0, View.W, View.H);
  }
  ctx = hctx;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, View.W, View.H);

  if (G.cine) drawCine(); else if (G.state === 'play' || G.state === 'paused' || G.state === 'over' || G.state === 'boon') drawHUD();
}

// The darkened corners of the 2D view: a full-screen gradient is costly to fill every frame, so it is painted once,
// small, and stretched.
let vigCv = null, vigKey = '';
function vignette() {
  const key = View.W + 'x' + View.H;
  if (vigCv && vigKey === key) return vigCv;
  vigCv = vigCv || document.createElement('canvas'); vigKey = key;
  const w = (vigCv.width = 256), h = (vigCv.height = Math.max(64, Math.round((256 * View.H) / View.W))), c = vigCv.getContext('2d');
  const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.5, w / 2, h / 2, Math.max(w, h) * 0.85);
  vg.addColorStop(0, 'rgba(40,30,90,0)'); vg.addColorStop(1, 'rgba(40,30,90,0.3)');
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
  return vigCv;
}

// ---------- HUD ----------
const FONT = '"Trebuchet MS", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
function hudText(text, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 4.5); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function bar(x, y, w, h, u, color) {
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 2.5, y - 2.5, w + 5, h + 5, h / 2 + 2.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  if (u > 0.01) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp(u, 0, 1)), h, h / 2); ctx.fill(); }
}
// An arrow pinned to the screen edge, pointing at something off-screen.
function edgeArrow(wx, wy, color, label) {
  const sp = toScreen(wx, wy), W = View.W, H = View.H, m = 54;
  let px = sp.x, py = sp.y;
  if (!sp.ok) { px = W / 2 + (wx - View.cam.x) * 50; py = H / 2 + (wy - View.cam.y) * 50; } // behind the 3D camera: just use its direction
  if (px > m && px < W - m && py > m + 40 && py < H - m - 40) return;
  const a = Math.atan2(py - H / 2, px - W / 2);
  const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m - 40) / Math.abs(Math.sin(a) || 1e-6));
  const x = W / 2 + Math.cos(a) * k, hu = hudU();
  let y = H / 2 + Math.sin(a) * k;
  // keep clear of the status block and the minimap in the top corners
  if ((x < 290 * hu + View.safe.l || x > W - 190 * hu - View.safe.r) && y < 215 * hu + View.safe.t) y = 215 * hu + View.safe.t;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (label) hudText(label, x - Math.cos(a) * 30, y - Math.sin(a) * 30, 11, color, 'center');
}

function drawMinimap(x, y, s) {
  const z = G.zone, p = G.player;
  // in a run the map shows the floor you are on; otherwise the whole campus
  const span = G.run ? (z.r + 50) * 2 : ARENA.w, ox = G.run ? z.x - span / 2 : 0, oy = G.run ? z.y - span / 2 : 0, k = s / span;
  const X = (wx) => x + (wx - ox) * k, Y = (wy) => y + (wy - oy) * k;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.clip();
  // the map under the markers never changes: painted once per match and size, then copied
  const M = G.map, mk = Math.round(s * DPR * (G.run ? 2.5 : 1));
  if (!M._mini || M._mini.width !== mk) {
    const cv = (M._mini = document.createElement('canvas')), c = cv.getContext('2d'), q0 = mk / ARENA.w;
    cv.width = cv.height = mk;
    c.fillStyle = '#84c95a'; c.fillRect(0, 0, mk, mk);
    c.strokeStyle = '#eadba6'; c.lineWidth = 2 * DPR; c.lineCap = 'round';
    for (const pa of M.paths) { c.beginPath(); for (const q of pa) c.lineTo(q[0] * q0, q[1] * q0); c.stroke(); }
    for (const o of M.ponds) { c.fillStyle = '#4aa8e6'; c.beginPath(); c.arc(o.x * q0, o.y * q0, o.r * q0, 0, TAU); c.fill(); }
    for (const pl of M.plazas) { c.fillStyle = pl.minor ? 'rgba(255,255,255,0.5)' : THEMES[pl.theme].wall; c.fillRect(pl.x * q0, pl.y * q0, pl.w * q0, pl.h * q0); }
    for (const o of G.obstacles) if (o.bld) { c.fillStyle = '#2a2438'; c.fillRect(o.x * q0, o.y * q0, o.w * q0, o.d * q0); }
  }
  ctx.drawImage(M._mini, X(0), Y(0), ARENA.w * k, ARENA.h * k);
  // the wall
  ctx.beginPath(); ctx.rect(x, y, s, s); ctx.arc(X(z.x), Y(z.y), Math.max(z.r * k, 0.1), 0, TAU, true);
  ctx.fillStyle = 'rgba(140,50,190,0.55)'; ctx.fill('evenodd');
  ctx.strokeStyle = '#f3c8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(z.x), Y(z.y), Math.max(z.r * k, 0.1), 0, TAU); ctx.stroke();
  for (const e of G.exits) {
    if (!e.open) continue;
    ctx.fillStyle = '#3fe08a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(X(e.x) - 6, Y(e.y) - 5, 12, 10, 3); ctx.fill(); ctx.stroke();
  }
  // everyone still standing on this floor
  for (const e of G.enemies) {
    if (e.dead || e.asleep || e.dummy) continue;
    ctx.fillStyle = e.type === 'rival' ? '#ff5a5f' : '#ffb0a0';
    ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), e.type === 'rival' ? 3 : 2.2, 0, TAU); ctx.fill();
  }
  const b = G.boss;
  if (b && !b.gone) {
    const bx = X(b.x), by = Y(b.y);
    ctx.fillStyle = b.down ? '#7df0a0' : '#ff5a5f'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx, by - 7); ctx.lineTo(bx + 6, by); ctx.lineTo(bx, by + 7); ctx.lineTo(bx - 6, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.translate(X(p.x), Y(p.y)); ctx.rotate(p.aim);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 2.5, y + 2.5, s - 5, s - 5, 10); ctx.stroke();
}

function drawHUD() {
  const W = View.W, H = View.H, p = G.player, z = G.zone;
  const u = hudU(), narrow = W < (Input.touch ? 600 : 760), pad = 14 * u, sf = View.safe;
  const low = G.state === 'play' && p.hp > 0 && p.hp <= p.maxhp * 0.35, beat = 0.5 + 0.5 * Math.sin(G.t * 9);
  if (low) {
    // running low: the edges of the screen throb red
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(255,40,60,0)'); vg.addColorStop(1, `rgba(255,40,60,${0.2 + beat * 0.22})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  ctx.save(); ctx.translate(sf.l, sf.t);
  // status: a weapon medallion, then glass gauges for health, stamina and the plaid shirt
  const mr = 27 * u, mcx = pad + mr, mcy = pad + mr, gx = pad + mr * 2 + 8 * u, gw = clamp(W * 0.26, 120 * u, 215 * u);
  plate(gx - 16 * u, pad + 3 * u, gw + 26 * u, (p.armor > 0 ? 52 : 42) * u, 12 * u);
  tube(gx, pad + 9 * u, gw, 16 * u, p.hp / p.maxhp, low && beat > 0.5 ? '#ff9aa6' : '#ff6a7c', '#d92b48', 5, low ? beat : 0);
  tube(gx, pad + 30 * u, gw * 0.8 * Math.min(1.25, p.staMax / 100), 8 * u, p.sta / p.staMax, p.staFlash > 0 ? '#ff7a6a' : '#ffe27a', p.staFlash > 0 ? '#c9302c' : '#e0a51e', 0, 0);
  if (p.armor > 0) tube(gx, pad + 42 * u, gw * 0.6, 6 * u, p.armor / 100, '#a9d2ff', '#4a8fe0', 0, 0);
  knob(mcx, mcy, mr, TIER[WEAPONS[p.weapon].tier], false);
  ctx.save(); ctx.translate(mcx, mcy); ctx.scale(1.35 * u, 1.35 * u); ink(ctx, 1.6); drawWeapon(ctx, p.weapon, 1.2); ctx.restore();
  // your grade, with a ring that fills towards the next promotion
  const xf = p.lvl >= MAX_LVL ? 1 : p.xp / XP_NEED(p.lvl);
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 6.5 * u; ctx.beginPath(); ctx.arc(mcx, mcy, mr + 2 * u, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#5a5470'; ctx.lineWidth = 3.5 * u; ctx.beginPath(); ctx.arc(mcx, mcy, mr + 2 * u, 0, TAU); ctx.stroke();
  if (xf > 0.01) { ctx.strokeStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(mcx, mcy, mr + 2 * u, -Math.PI / 2, -Math.PI / 2 + TAU * xf); ctx.stroke(); }
  plate(mcx - 16 * u, mcy + mr - 7 * u, 32 * u, 16 * u, 8 * u);
  hudText(gradeName(p.lvl), mcx, mcy + mr + 1.5 * u, 11 * u, '#ffe14d', 'center', 900);
  let ly = pad + mr * 2 + 26 * u;
  coin(pad + 10 * u, ly, 10 * u);
  hudText(money(p.loot.value).replace(/^[¥$]/, ''), pad + 26 * u, ly + 1, 19 * u, '#ffe08a', 'left', 900);
  let px = pad + 26 * u + ctx.measureText(money(p.loot.value).replace(/^[¥$]/, '')).width + 12 * u;
  for (let i = 2; i < 6; i++) for (let k = 0; k < Math.min(p.loot.counts[i], 5); k++) { ctx.fillStyle = TIER[i]; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(px, ly - 6 * u, 8 * u, 12 * u, 2); ctx.fill(); ctx.stroke(); px += 6 * u; }
  ly += 22 * u;
  // the current objective: what to do, how far along, and what it pays
  const q = G.quest, qs = q && q.now;
  if (qs && G.state === 'play') {
    const done = q.doneT > 0, qw = clamp(W * 0.32, 180 * u, 250 * u), qh = 44 * u, qy = ly - 6 * u;
    if (done) { ctx.save(); ctx.shadowColor = '#7df0a0'; ctx.shadowBlur = 18; ctx.fillStyle = '#7df0a0'; ctx.beginPath(); ctx.roundRect(pad, qy, qw, qh, 10 * u); ctx.fill(); ctx.restore(); }
    plate(pad, qy, qw, qh, 10 * u);
    ctx.fillStyle = done ? '#7df0a0' : '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pad + 20 * u, qy + qh / 2, 11 * u, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `900 ${Math.round(15 * u)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(done ? '✓' : '!', pad + 20 * u, qy + qh / 2 + 1);
    hudText(done ? T('qs_done') : qs.text, pad + 38 * u, qy + 14 * u, 14 * u, done ? '#7df0a0' : '#fff', 'left', 900);
    if (!done) {
      // one pip per enemy in the wave, filling as they go down; then what clearing it pays
      const rw = qs.reward ? '✦ ' + T(qs.reward === 'boon2' ? 'qs_boon2_s' : 'qs_boon_s') : '';
      if (rw) hudText(rw, pad + qw - 10 * u, qy + 31 * u, 12 * u, '#ffe08a', 'right', 900);
      const room = qw - 48 * u - (rw ? ctx.measureText(rw).width + 8 * u : 0), step = Math.min(16 * u, room / Math.max(1, qs.n));
      for (let i = 0; i < qs.n; i++) { ctx.fillStyle = i < qs.cur ? '#ffe14d' : '#231d33'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(pad + 38 * u + i * step, qy + 26 * u, Math.max(4, step - 4 * u), 9 * u, 3); ctx.fill(); ctx.stroke(); }
    }
    ly += qh + 8 * u;
  }
  if (p.hidden) { hudText(T('hud_hidden'), pad, ly, 11 * u, '#b9f59a'); ly += 18 * u; }
  // kill feed
  ly += 4 * u;
  for (const f of Input.touch ? G.feed.slice(-2) : G.feed) { ctx.globalAlpha = clamp(f.t, 0, 1); hudText(f.text, pad, ly, 10.5 * u, f.color, 'left', 700); ly += 15 * u; }
  ctx.globalAlpha = 1;

  ctx.restore();
  ctx.save(); ctx.translate(-sf.r, sf.t);
  // minimap in a bezel; under it, who is still standing on this floor, your knock-outs, and how far up you are
  const ms = miniSize(u), mx = W - pad - ms, run = G.run;
  plate(mx - 6, pad - 6, ms + 12, ms + 12 + 30 * u, 16);
  drawMinimap(mx, pad, ms);
  const iy = pad + ms + 15 * u;
  glyph('person', mx + 12 * u, iy, 8 * u, '#ff9a9a');
  hudText(String(run && run.stage === 'wave' ? run.left : G.boss && !G.boss.down ? 1 : 0), mx + 24 * u, iy + 1, 15 * u, '#ff9a9a', 'left', 900);
  glyph('ko', mx + ms * 0.36, iy, 7 * u, '#ffe08a');
  hudText(String(G.kills), mx + ms * 0.36 + 10 * u, iy + 1, 15 * u, '#ffe08a', 'left', 900);
  if (run) hudText(T('hud_floor', run.floor + 1, FLOORS.length), W - pad - 3 * u, iy + 1, 13 * u, '#e9d5ff', 'right', 900);

  ctx.restore();
  // centre: the boss's health in a framed tube, and under it how close they are to toppling
  const b = G.boss, cyTop = sf.t + (narrow ? pad + ms + 64 * u : pad + 4 * u);
  if (b && !b.gone && !b.down) {
    const w = narrow ? W - pad * 2 - 20 : Math.min(W * 0.36, 460), bx = (W - w) / 2;
    plate(bx - 14 * u, cyTop + 12 * u, w + 28 * u, 38 * u, 12 * u);
    hudText(T('n_' + b.id), W / 2, cyTop + 6 * u, 15 * u, '#fff', 'center', 900);
    tube(bx, cyTop + 20 * u, w, 14 * u, b.hp / b.maxhp, '#ff8a70', '#d9342b', 10, 0);
    tube(bx + w * 0.2, cyTop + 39 * u, w * 0.6, 5 * u, b.topple > 0 ? 1 : b.ko / b.koMax, '#fff3a0', '#ffc22e', 0, b.topple > 0 ? beat : 0);
  }

  // pointers
  if (G.state === 'play') {
    // the way to the current objective: an arrow at the screen edge, or a marker over it once it is in view
    const qt = G.quest.tg, qn = G.quest.now;
    // (in a brawl the enemies come to you: only the last few stragglers, or ones far off, get a pointer)
    if (qt && qn && !(qn.kind === 'fight' && G.run.left > 3 && dist(p.x, p.y, qt.x, qt.y) < 420)) {
      const qd = dist(p.x, p.y, qt.x, qt.y);
      if (!(qn.kind === 'boss' && G.boss) && qd > 150) {
        // a column of light on the target, and chevrons on the ground at your feet pointing the way
        const b0 = toScreen(qt.x, qt.y, 0), b1 = toScreen(qt.x, qt.y, 320);
        if (b0.ok !== false && b1.ok !== false) {
          const lg = ctx.createLinearGradient(b0.x, b0.y, b1.x, b1.y);
          lg.addColorStop(0, `rgba(255,225,77,${0.5 + Math.sin(G.t * 4) * 0.15})`); lg.addColorStop(1, 'rgba(255,225,77,0)');
          ctx.strokeStyle = lg; ctx.lineWidth = 14 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
        }
        const ga = angTo(p.x, p.y, qt.x, qt.y), run = (G.t * 1.6) % 1;
        for (let i = 0; i < 3; i++) {
          const d0 = 96 + (i + run) * 34, al = clamp(1.25 - (i + run) / 2.6, 0, 1) * clamp((i + run) * 2, 0, 1);
          const tip = toScreen(p.x + Math.cos(ga) * (d0 + 14), p.y + Math.sin(ga) * (d0 + 14), 2);
          const l = toScreen(p.x + Math.cos(ga) * d0 + Math.cos(ga + 1.57) * 13, p.y + Math.sin(ga) * d0 + Math.sin(ga + 1.57) * 13, 2);
          const r = toScreen(p.x + Math.cos(ga) * d0 - Math.cos(ga + 1.57) * 13, p.y + Math.sin(ga) * d0 - Math.sin(ga + 1.57) * 13, 2);
          if (tip.ok === false || l.ok === false || r.ok === false) continue;
          ctx.globalAlpha = al * 0.9; ctx.strokeStyle = INK; ctx.lineWidth = 7 * u; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(r.x, r.y); ctx.stroke();
          ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3.5 * u; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      edgeArrow(qt.x, qt.y, '#ffe14d', Math.round(qd / 10) + 'm');
      const sp = toScreen(qt.x, qt.y, qn.kind === 'boss' ? 150 : 96);
      if (qd > 110 && sp.ok !== false && sp.x > 40 && sp.x < W - 40 && sp.y > 70 && sp.y < H - 90 && !(qn.kind === 'boss' && G.boss)) {
        const by = sp.y + Math.sin(G.t * 6) * 5 * u;
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(sp.x - 11 * u, by - 16 * u); ctx.lineTo(sp.x + 11 * u, by - 16 * u); ctx.lineTo(sp.x, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (G.exT > 0) {
      const w = Math.min(280 * u, W * 0.6);
      hudText(T('hud_board'), W / 2, H * 0.66, 16 * u, '#9df0b8', 'center', 900);
      bar((W - w) / 2, H * 0.66 + 16 * u, w, 10 * u, G.exT / 1.5, '#3fe08a');
    }
    const kc = G.containers.find((k) => !k.opened && k.prog > 0);
    if (kc) {
      const s = toScreen(kc.x, kc.y, 96);
      hudText(T('hud_search'), s.x, s.y, 11 * u, '#fff', 'center');
      if (R3.on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(s.x, s.y + 22 * u, 12 * u, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(kc.prog / kc.need, 0, 1)); ctx.stroke(); }
    }
  }

  drawSkills(u);
  // A new objective is announced large, in the upper middle of the screen, before it settles into its HUD slot.
  if (qs && q.showT > 0 && G.state === 'play') {
    const k = clamp(Math.min((q.showMax - q.showT) / 0.3, q.showT / 0.4), 0, 1), pop = 0.86 + 0.14 * k;
    const tw = Math.min(W - 40, 470 * u) * pop, th = 104 * u * pop, tx = (W - tw) / 2, ty = H * (narrow ? 0.31 : 0.19) - th / 2 + sf.t; // (on a narrow screen, below the map and the boss's bar)
    ctx.globalAlpha = k;
    plate(tx, ty, tw, th, 16 * u);
    ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(W / 2 - 54 * u, ty - 13 * u, 108 * u, 26 * u, 8 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `900 ${Math.round(14 * u)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T(q.i <= 1 ? 'qs_first' : 'qs_next'), W / 2, ty + 1);
    hudText(qs.text, W / 2, ty + th * 0.44, Math.min(34 * u, (tw * 1.5) / Math.max(6, qs.text.length)) * pop, '#fff', 'center', 900);
    const rw = qs.reward ? T(qs.reward === 'boon2' ? 'qs_boon2' : 'qs_boon') : '';
    if (rw) hudText(T('qs_reward', rw), W / 2, ty + th * 0.78, 15 * u * pop, '#ffe08a', 'center', 800);
    ctx.globalAlpha = 1;
  }
  if (G.combo >= 2 && G.state === 'play') {
    const pop = 1 + Math.max(0, G.comboT - 2.45) * 2.4;
    hudText(G.combo + ' ' + T('combo'), W - pad, H * 0.44, (22 + Math.min(G.combo, 24) * 0.7) * u * pop, G.combo >= 10 ? '#ff8a3c' : '#ffe14d', 'right', 900);
  }

  const bn = G.banner;
  if (bn) {
    const a = clamp(Math.min(bn.t * 4, (bn.dur - bn.t) * 3), 0, 1);
    ctx.globalAlpha = a;
    const by = H * 0.36, size = Math.min(46 * u, (W * 1.4) / Math.max(8, bn.title.length));
    ctx.fillStyle = 'rgba(42,36,56,0.72)'; ctx.fillRect(0, by - size * 0.85, W, size * 1.7 + (bn.sub ? 26 * u : 0));
    hudText(bn.title, W / 2 + (1 - a) * -30, by, size, bn.color, 'center', 900);
    if (bn.sub) hudText(bn.sub, W / 2 + (1 - a) * 30, by + size * 0.75 + 6 * u, 15 * u, '#fff', 'center', 600);
    ctx.globalAlpha = 1;
  }

  for (const s of [Input.lstick]) {
    if (!s) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.ox, s.oy, 44, 0, TAU); ctx.stroke();
    const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy) || 1, k = Math.min(m, 44) / m;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(s.ox + dx * k, s.oy + dy * k, 20, 0, TAU); ctx.fill();
  }
}

// a speech bubble at a screen position (the 3D overlay uses this)
function bubbleAt(px, py, text) {
  ctx.save();
  ctx.font = `bold 15px ${FONT}`;
  const w = ctx.measureText(text).width + 22, h = 30, x = clamp(px, w / 2 + 6, View.W - w / 2 - 6), y = Math.max(h, py - h);
  ctx.fillStyle = '#fffdf4'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 6, y + h / 2 - 1); ctx.lineTo(x, y + h / 2 + 9); ctx.lineTo(x + 6, y + h / 2 - 1); ctx.fill();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

// One layout shared by drawing and touch hit-testing.
// Phone: a thumb cluster in the bottom-right corner. PC: a bar with the key under each skill.
// HUD scale: a little larger on a phone, where the screen is small but close.
const hudU = () => clamp(Math.min(View.W, View.H) / 720, Input.touch ? 0.8 : 0.72, 1.25);
// the minimap gives way on a small phone so the gauges, the pause button and the skill fan all fit
const miniSize = (u) => { const s = clamp(150 * u, 104, 190); return Input.touch ? Math.max(84, Math.min(s, View.W * 0.3, View.H * 0.27)) : s; };
function skillButtons() {
  const W = View.W, H = View.H, sf = View.safe, u = hudU();
  if (Input.touch) {
    // Phone: one attack button in the corner with dodge and the three skills fanned around it,
    // bubble tea out of the way at the bottom, pause up by the minimap.
    const k = clamp(Math.min(W, H) / 390, 0.85, 1.2), R = W - sf.r, B = H - Math.max(sf.b, 6);
    const at = (id, x, y, r) => ({ id, x: R - x * k, y: B - y * k, r: r * k });
    const ms = miniSize(u);
    return [
      at('atk', 76, 84, 43), at('d', 180, 56, 27), at('q', 170, 138, 25), at('e', 109, 189, 25), at('r', 36, 186, 27), at('tea', 252, 40, 22),
      { id: 'pause', x: R - 14 * u - ms - 30, y: sf.t + 14 * u + 16, r: 17 },
    ];
  }
  const gap = 68 * u, y = H - 58 * u, x0 = W / 2 - gap * 2;
  const keys = { q: 'Q', e: 'E', r: 'R', d: '␣', tea: 'F' };
  return ['q', 'e', 'r', 'd', 'tea'].map((id, i) => ({ id, x: x0 + i * gap + (i > 2 ? 14 * u : 0), y, r: (id === 'r' ? 30 : i > 2 ? 23 : 27) * u, key: keys[id] }));
}
function drawSkillIcon(c, id) {
  ink(c, 1.6);
  if (id === 'atk') drawWeapon(c, G.player.weapon, 1.9);
  else if (id === 'hvy') { c.rotate(0.9); drawWeapon(c, G.player.weapon, 1.5); c.rotate(-0.9); c.fillStyle = '#fff'; poly(c, [-13, 4, -4, 13, -15, 15], true); }
  else if (id === 'q') drawWeapon(c, 'pan', 1.5);
  else if (id === 'r') drawWeapon(c, 'book', 1.25);
  else if (id === 'tea') { c.scale(0.9, 0.9); drawLootIcon(c, { kind: 'tea' }); }
  else {
    c.fillStyle = id === 'e' ? '#5cc8ff' : '#fff';
    for (const o of id === 'e' ? [-7, 3] : [-2]) poly(c, [o - 4, -10, o + 8, 0, o - 4, 10, o, 0], true);
  }
}

// ---------- the look of the HUD: things you could touch ----------
// A piece of the HUD painted once and kept: w x h, with (0, 0) at its centre while painting.
const HUDC = new Map();
function hudSprite(key, w, h, paint) {
  key += '|' + DPR;
  let cv = HUDC.get(key);
  if (cv) return cv;
  if (HUDC.size > 90) HUDC.clear();
  cv = document.createElement('canvas');
  cv.width = Math.ceil(w * DPR); cv.height = Math.ceil(h * DPR);
  const prev = ctx;
  ctx = cv.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, (w / 2) * DPR, (h / 2) * DPR);
  try { paint(); } finally { ctx = prev; }
  HUDC.set(key, cv);
  return cv;
}
// A dark metal plate that gauges and dials sit on.
function plate(x, y, w, h, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, r); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#5a5470'); g.addColorStop(0.5, '#3b3550'); g.addColorStop(1, '#2a2438');
  ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(x + 2.5, y + 2.5, w - 5, h - 5, Math.max(1, r - 2)); ctx.stroke();
}
// A glass tube of liquid: f is how full, ticks divides it, glow (0..1) makes it throb.
function tube(x, y, w, h, f, top, bottom, ticks, glow) {
  f = clamp(f, 0, 1);
  if (glow > 0) { ctx.save(); ctx.shadowColor = top; ctx.shadowBlur = 8 + glow * 14; ctx.fillStyle = top; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - 2.5, y - 2.5, w + 5, h + 5, h / 2 + 2.5); ctx.fill();
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, '#120f1c'); bg.addColorStop(1, '#3a3450');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.clip();
  if (f > 0.004) {
    const lg = ctx.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, top); lg.addColorStop(1, bottom);
    ctx.fillStyle = lg; ctx.fillRect(x, y, w * f, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + w * f - 2, y, 2, h);
  }
  ctx.fillStyle = 'rgba(20,16,30,0.45)';
  for (let i = 1; i < ticks; i++) ctx.fillRect(x + (w * i) / ticks - 0.75, y, 1.5, h);
  const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.roundRect(x + h * 0.3, y + h * 0.1, w - h * 0.6, h * 0.42, h * 0.2); ctx.fill();
  ctx.restore();
}
// A domed push-button in a metal ring.
function knob(x, y, r, face, down) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.16 + 3, r * 1.02, r * 0.98, 0, 0, TAU); ctx.fill();
  const rg = ctx.createLinearGradient(0, y - r, 0, y + r);
  rg.addColorStop(0, '#fbf8ee'); rg.addColorStop(0.5, '#b9b3c7'); rg.addColorStop(1, '#6d6784');
  ctx.fillStyle = rg; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  const fr = r * 0.82, fy = y + (down ? 1.5 : 0);
  const fg = ctx.createRadialGradient(x - fr * 0.35, fy - fr * 0.45, fr * 0.1, x, fy, fr);
  fg.addColorStop(0, shadeHex(face, 1.35)); fg.addColorStop(0.7, face); fg.addColorStop(1, shadeHex(face, 0.62));
  ctx.fillStyle = fg; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, fy, fr, 0, TAU); ctx.fill(); ctx.stroke();
}
function gloss(x, y, r) {
  const g = ctx.createLinearGradient(0, y - r, 0, y);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - r * 0.42, r * 0.62, r * 0.36, 0, 0, TAU); ctx.fill();
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgb(' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * k))).join(',') + ')';
}
// The key that fires a button, drawn as a keycap.
function keycap(x, y, label, u, hot) {
  ctx.font = `900 ${Math.round(11 * u)}px ${FONT}`;
  const w = Math.max(20 * u, ctx.measureText(label).width + 10 * u), h = 17 * u;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 6, 5 * u); ctx.fill();
  ctx.fillStyle = hot ? '#c9304a' : '#aaa3bd'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2 + 3, w, h, 4 * u); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, hot ? '#ff9aa6' : '#ffffff'); g.addColorStop(1, hot ? '#ff5a6e' : '#e2ddec');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 4 * u); ctx.fill();
  ctx.fillStyle = hot ? '#fff' : INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 0.5);
}
function coin(x, y, r) {
  ctx.fillStyle = '#a8740f'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y + 2, r, 0, TAU); ctx.fill(); ctx.stroke();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
  g.addColorStop(0, '#fff3b8'); g.addColorStop(0.6, '#f2b01e'); g.addColorStop(1, '#c98a12');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a5a08'; ctx.font = `900 ${Math.round(r * 1.25)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¥', x, y + 0.5);
}
// Small pictograms that stand in for labels.
function glyph(kind, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y); ctx.strokeStyle = INK; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  if (kind === 'person') {
    ctx.beginPath(); ctx.arc(0, -r * 0.45, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.9); ctx.quadraticCurveTo(-r * 0.8, r * 0.05, 0, r * 0.05); ctx.quadraticCurveTo(r * 0.8, r * 0.05, r * 0.8, r * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (kind === 'ko') {
    ctx.lineWidth = r * 0.5 + 3; ctx.lineCap = 'round';
    for (const c of [INK, color]) { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6); ctx.stroke(); ctx.lineWidth = r * 0.5; }
  } else {
    ctx.lineWidth = r * 0.36 + 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = r * 0.36; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
// A mouse with one button lit: how light and heavy attacks are shown on PC.
function mouseHint(x, y, u, right, hot) {
  const w = 20 * u, h = 30 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2 + 3, w, h, w / 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfc9dc');
  ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2); ctx.clip();
  ctx.fillStyle = hot ? '#ffd24a' : right ? '#ff8a3c' : '#ff5a6e';
  ctx.fillRect(right ? x : x - w / 2, y - h / 2, w / 2, h * 0.42);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y - h * 0.08); ctx.moveTo(x - w / 2, y - h * 0.08); ctx.lineTo(x + w / 2, y - h * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2); ctx.stroke();
}

function drawSkills(u) {
  const p = G.player, low = p.hp > 0 && p.hp <= p.maxhp * 0.35 && G.state === 'play', beat = 0.5 + 0.5 * Math.sin(G.t * 9);
  const FACE = { r: '#f2b01e', hvy: '#ff8a3c', atk: '#ff5a6e', tea: '#ffd0d6', e: '#e8f6ff', q: '#fff6e0', d: '#f1eefb' };
  for (const b of skillButtons()) {
    if (b.id === 'pause') {
      plate(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, 9);
      ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 6, b.y - 7, 4, 14); ctx.fillRect(b.x + 2, b.y - 7, 4, 14);
      continue;
    }
    const max = b.id === 'tea' ? 1 : SKILL_CD[b.id] || 1, cd = b.id === 'tea' ? Math.max(0, p.teaCd) : b.id === 'atk' || b.id === 'hvy' ? 0 : p.cd[b.id];
    const short = (b.id === 'd' && p.sta < DODGE_COST) || (b.id === 'hvy' && p.sta < 12);
    const ready = cd <= 0 && !short && (b.id !== 'tea' || p.tea > 0), urge = b.id === 'tea' && low && p.tea > 0;
    const r = b.r * (urge ? 1.08 + beat * 0.12 : 1);
    if (urge) { ctx.save(); ctx.shadowColor = '#ff3b55'; ctx.shadowBlur = 16 + beat * 22; ctx.fillStyle = '#ff3b55'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill(); ctx.restore(); }
    // a button looks the same until its state changes, so it is painted once per state and copied
    const down = Input.held(b.id), box = r * 2.5;
    const face = () => {
      knob(0, 0, r, ready ? FACE[b.id] : '#4a4560', down);
      ctx.save(); ctx.scale(r / 29, r / 29); ctx.globalAlpha = ready ? 1 : 0.5; drawSkillIcon(ctx, b.id); ctx.restore();
      if (ready) gloss(0, 0, r * 0.82);
    };
    if (urge) { ctx.save(); ctx.translate(b.x, b.y); face(); ctx.restore(); }
    else ctx.drawImage(hudSprite(b.id + (ready ? 1 : 0) + (down ? 1 : 0) + p.weapon + Math.round(r * 8), box, box, face), b.x - box / 2, b.y - box / 2, box, box);
    if (cd > 0) {
      ctx.fillStyle = 'rgba(30,24,44,0.66)';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, r * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(cd / max, 0, 1)); ctx.closePath(); ctx.fill();
      if (b.id !== 'tea') hudText(cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd)), b.x, b.y, r * 0.72, '#fff', 'center', 900);
    }
    if (b.key) keycap(b.x, b.y + r + 12 * u - (urge ? beat * 4 * u : 0), b.key, u, urge);
    if (b.id === 'tea') {
      // how many are left, on a little badge
      const bx = b.x + r * 0.78, by = b.y - r * 0.78, br = 9.5 * u;
      ctx.fillStyle = p.tea ? '#ff5a6e' : '#6f6787'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(12 * u)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.tea), bx, by + 0.5);
    }
  }
  if (G.training && !Input.touch) {
    // training ground: which weapon is out, and the key that steps through them
    const sf = View.safe, x = sf.l + 12 * u, y = View.H - Math.max(sf.b, 6) - 34 * u;
    plate(x, y, 104 * u, 26 * u, 9 * u); hudText(T('w_' + p.weapon), x + 11 * u, y + 13.5 * u, 11 * u, '#fff', 'left', 800); keycap(x + 88 * u, y + 11 * u, 'B', u * 0.85, false);
  }
  if (!Input.touch) {
    // left of the bar: which mouse button is the light attack and which the heavy
    const bs = skillButtons(), x = bs[0].x - bs[0].r - 62 * u, y = bs[0].y;
    mouseHint(x, y, u, false, Input.mouse.down); mouseHint(x + 30 * u, y, u, true, p.mv && p.mv.cost && p.swingT > 0);
  }
  if (low) {
    // the one thing to do right now, spelled out
    const tb = Input.touch && skillButtons().find((b) => b.id === 'tea');
    const y = tb ? tb.y - tb.r - 30 : View.H * 0.7, s = 1 + beat * 0.06;
    if (tb) {
      // on a phone the prompt sits right on top of the button it is about
      const tx = T(p.tea > 0 ? 'hud_drink_touch' : 'hud_notea');
      ctx.font = `900 ${Math.round(17 * u)}px ${FONT}`;
      const tw = ctx.measureText(tx).width, col = p.tea > 0 ? '#ff8fa0' : '#ffb0bc', sz = 17 * u * (p.tea > 0 ? s : 1);
      // beside the button when there is room (a phone on its side), otherwise just above it
      if (tb.x - tb.r - 14 - tw > View.safe.l + 8) hudText(tx, tb.x - tb.r - 14, tb.y, sz, col, 'right', 900);
      else hudText(tx, clamp(tb.x - 16, tw / 2 + 8 + View.safe.l, View.W - tw / 2 - 8), y, sz, col, 'center', 900);
    } else if (p.tea > 0) {
      const tx = T(Input.touch ? 'hud_drink_touch' : 'hud_drink');
      ctx.font = `900 ${Math.round(22 * u * s)}px ${FONT}`;
      const w = ctx.measureText(tx).width + (Input.touch ? 0 : 44 * u);
      if (!Input.touch) keycap(View.W / 2 - w / 2 + 14 * u, y, 'F', u * 1.5, true);
      hudText(tx, View.W / 2 + (Input.touch ? 0 : 22 * u), y, 22 * u * s, '#ff8fa0', 'center', 900);
    } else hudText(T('hud_notea'), View.W / 2, y, 16 * u, '#ffb0bc', 'center', 800);
  }
}

// ---------- menus (DOM overlay) ----------
const UI = {
  el: null, cur: null,
  show(fn) { this.cur = fn; this.el.innerHTML = `<div class="card">${fn()}</div>`; this.el.classList.add('on'); this.fit(); },
  // shrink the sheet until it fits the screen (a phone on its side is very short), wider when there is room
  fit() {
    const c = this.el && this.el.firstElementChild;
    if (!c) return;
    const wide = innerWidth > innerHeight * 1.25 && innerHeight < 560;
    c.style.zoom = 1; c.style.width = wide ? '760px' : '';
    const z = clamp((innerHeight - 64) / (c.offsetHeight + 30), 0.5, 1);
    c.style.zoom = z;
    if (wide) c.style.width = Math.min(760, (innerWidth - 70) / z) + 'px';
  },
  hide() { this.cur = null; this.el.classList.remove('on'); this.el.innerHTML = ''; },
  refresh() { if (this.cur) this.show(this.cur); },
};
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const canFull = () => Input.touch && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const qLabel = () => T('q_label', T(Settings.quality < 0 ? 'q_auto' : 'q_' + Settings.quality));
const optRow = () => `<div class="row">${canFull() ? `<button class="ghost" data-act="full">${T('full')}</button>` : ''}<button class="ghost" data-act="lang">${T('lang')}</button><button class="ghost" data-act="mute">${T(Sfx.muted ? 'sound_off' : 'sound_on')}</button><button class="ghost" data-act="mode" ${R3.ok ? '' : 'disabled'}>${T(R3.on ? 'mode_3d' : 'mode_2d')}</button><button class="ghost" data-act="quality">${qLabel()}</button>${R3.on ? '' : `<button class="ghost" data-act="fx" ${Post.ok ? '' : 'disabled'}>${T(!Post.ok ? 'fx_na' : Settings.fx ? 'fx_on' : 'fx_off')}</button>`}</div>`;

function showTitle() {
  if (!G.map || G.state !== 'menu') { genWorld(); setArena(ARENA.w / 2, ARENA.h / 2, 3300); G.run = null; G.boss = null; G.player = makePlayer(); G.player.x = G.player.y = -9999; R3.build(); }
  G.state = 'menu'; G.result = null;
  UI.show(() => `
    <div class="kicker">${T('kicker')}</div>
    <h1>${T('title')}</h1>
    <h2>${T('title2')}</h2>
    <button class="big" data-act="kits">${T('start')}</button>
    <div class="bank"><i></i><b>${money(Bank.money)}</b></div>
    <div class="stamps">${['pony', 'yiming', 'elon', 'sam', 'dario'].map((id) => `<span class="${Bank.ceo.includes(id) ? 'on' : ''}">${shortName(id)}</span>`).join('')}</div>
    <div class="row"><button class="ghost" data-act="how">${T('how')}</button><button class="ghost" data-act="train">${T('train')}</button></div>
    ${optRow()}
    ${R3.ok && R3.soft ? `<p class="note">${T('no_gpu')}</p>` : R3.on && !R3.models && !R3.modelsFailed ? `<p class="note">${T('loading_models')}</p>` : ''}
    <p class="disc">${T('disclaimer')}</p>`);
}
// Controls and rules as pictures of keys, not paragraphs.
const HOW_KEYS = [['WASD', 'k_move'], ['␣', 'k_dodge'], ['@L', 'k_light'], ['@R', 'k_heavy'], ['@L', 'k_charge'], ['Tab', 'k_lock'], ['Q E R', 'k_skill'], ['F', 'k_tea']];
const HOW_TOUCH = [['@M', 'kt_move'], ['@D', 'k_dodge'], ['@A', 'k_light'], ['@A', 'k_charge'], ['@S', 'kt_skill'], ['@T', 'k_tea']];
const HOW_COMBOS = [['LLL', 'c_chop'], ['LLH', 'c_upper'], ['HH', 'c_slam'], ['␣L', 'c_dash']];
let howBack = 'menu';
function showHow() {
  const TK = { '@M': '<kbd>◎</kbd>', '@D': '<kbd>▷</kbd>', '@A': '<kbd class="l">●</kbd>', '@S': '<kbd>✦</kbd>', '@T': `<kbd>${T('tea_short')}</kbd>` };
  const key = (k) => k.split(' ').map((x) => TK[x] || (x === '@L' ? `<kbd class="l">${T('m_l')}</kbd>` : x === '@R' ? `<kbd class="h">${T('m_r')}</kbd>` : `<kbd>${x}</kbd>`)).join('');
  const seq = (q) => [...q].map((ch) => (ch === 'L' ? '<kbd class="l">●</kbd>' : ch === 'H' ? '<kbd class="h">◆</kbd>' : `<kbd>${ch}</kbd>`)).join('');
  UI.show(() => `
    <div class="kicker">${T('how')}</div>
    <div class="keys">${(Input.touch ? HOW_TOUCH : HOW_KEYS).map(([k, t]) => `<div>${key(k)}<span>${T(t)}</span></div>`).join('')}</div>
    <div class="keys combos${Input.touch ? ' one' : ''}">${(Input.touch ? [['LLLHH', 'kt_string'], ['▷L', 'c_dash']] : HOW_COMBOS).map(([q, t]) => `<div>${seq(q)}<span>${T(t)}</span></div>`).join('')}</div>
    <ul class="rules"><li>${T('rule_a')}</li><li>${T('rule_b')}</li><li>${T('rule_c')}</li></ul>
    <button class="ghost" data-act="${howBack}">${T('back')}</button>`);
}
function showKits() {
  UI.show(() => `
    <div class="kicker">${T('kit_title')}</div>
    <div class="steps"><span><b>1</b>${T('step_1')}</span><i>›</i><span><b>2</b>${T('step_2')}</span><i>›</i><span><b>3</b>${T('step_3')}</span></div>
    <div class="perks">${KITS.map((k, i) => `<button class="perk" data-act="kit" data-i="${i}" ${Bank.money < k.cost ? 'disabled' : ''}><span class="ic">${k.icon}</span><b>${T('kit_' + k.id + '_n')}</b><small>${T('kit_' + k.id + '_d')}</small><em>${k.cost ? money(k.cost) : T('kit_free')}</em></button>`).join('')}</div>
    <div class="bank"><i></i><b>${money(Bank.money)}</b></div>
    <button class="ghost" data-act="menu">${T('menu')}</button>`);
}
// the upgrades held, as a row of icons
const boonRow = (boons) => { const ids = Object.keys(boons || {}); return ids.length ? `<p class="boonrow">${ids.map((id) => `<span title="${T('bn_' + id)}">${boonById(id).icon}${boons[id] > 1 ? `<b>${boons[id]}</b>` : ''}</span>`).join('')}</p>` : ''; };
function showBoons() {
  const o = G.run.offer, p = G.player;
  UI.show(() => `
    <div class="kicker">${T(o.gold ? 'boon_title2' : 'boon_title')}</div>
    <div class="perks${o.gold ? ' gold' : ''}">${o.list.map((b, i) => `<button class="perk" data-act="boon" data-i="${i}"><span class="ic">${b.icon}</span><b>${T('bn_' + b.id)}</b><small>${T('bd_' + b.id)}</small><em>${o.gold ? '×2' : p.boons[b.id] ? 'Lv ' + (p.boons[b.id] + 1) : T('boon_new')}</em></button>`).join('')}</div>
    ${boonRow(p.boons)}
    ${Input.touch ? '' : `<p class="note">${T('boon_hint')}</p>`}`);
}
function showResult() {
  const r = G.result;
  if (!r || G.state !== 'over') return;
  const pips = r.counts.map((n, i) => (n ? `<span style="color:${TIER[i]}">■×${n}</span>` : '')).join(' ');
  const rows = [
    ['st_haul', money(r.kept)], ['st_floor', r.floor + ' / ' + FLOORS.length],
    ['st_kills', r.kills], ['st_signed', r.signed + ' / 5'], ['st_time', fmtTime(r.time)], ['st_bank', money(Bank.money)],
  ];
  const head = r.kind === 'dead'
    ? `<h1 class="red">${T('res_dead_title')}</h1><p class="story">${T('res_dead_sub', r.by || T('by_pve'), money(r.kept))}</p>`
    : `<h1 class="gold">${T('res_win_title')}</h1><p class="story">${T('res_win_sub', money(r.bonus))}</p>`;
  UI.show(() => `
    ${head}
    <div class="stats">${rows.map(([k, v]) => `<div><span>${T(k)}</span><b>${v}</b></div>`).join('')}</div>
    ${boonRow(r.boons)}
    <p class="pips">${pips}</p>
    <button class="big" data-act="kits">${T('again')}</button>
    <button class="ghost" data-act="menu">${T('menu')}</button>
    ${r.kind !== 'dead' ? `<p class="disc">${T('win_twist')}</p>` : ''}`);
}
function showPause() {
  G.state = 'paused';
  UI.show(() => `
    <h1>${T('paused')}</h1>
    <button class="big" data-act="resume">${T('resume')}</button>
    ${boonRow(G.player.boons)}
    <div class="row"><button class="ghost" data-act="how2">${T('how')}</button>${G.training ? `<button class="ghost" data-act="weapon">${T('train_weapon', T('w_' + G.player.weapon))}</button>` : ''}</div>
    ${optRow()}
    <button class="ghost" data-act="menu">${T('quit')}</button>`);
}

function onAction(act, el) {
  Sfx.init();
  Sfx.play('ui');
  if (act === 'kits') showKits();
  else if (act === 'kit') startMatch(KITS[+el.dataset.i]);
  else if (act === 'boon') takeBoon(+el.dataset.i);
  else if (act === 'lang') { LANG.zh = !LANG.zh; UI.refresh(); }
  else if (act === 'mute') { Sfx.muted = !Sfx.muted; UI.refresh(); }
  else if (act === 'fx') { Settings.fx = !Settings.fx; Settings.save(); UI.refresh(); }
  else if (act === 'mode') { R3.on = Settings.mode3d = !R3.on; Settings.auto = false; Settings.save(); if (R3.on) { modelsArrived(); if (R3.stale) R3.build(); } resize(); UI.refresh(); }
  else if (act === 'quality') { Settings.quality = Settings.quality >= (R3.on ? 3 : 2) ? -1 : Settings.quality + 1; applyQuality(); Settings.save(); UI.refresh(); }
  else if (act === 'menu') showTitle();
  else if (act === 'train') startMatch(KITS[0], true);
  else if (act === 'weapon') { cycleWeapon(); UI.refresh(); }
  else if (act === 'full') { const d = document, e = d.documentElement; try { if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else (e.requestFullscreen || e.webkitRequestFullscreen).call(e); } catch (er) { /* not allowed here */ } }
  else if (act === 'how') { howBack = 'menu'; showHow(); }
  else if (act === 'how2') { howBack = 'pause'; showHow(); }
  else if (act === 'pause') showPause();
  else if (act === 'resume') { G.state = 'play'; UI.hide(); }
}

// ---------- boot ----------
function resize() {
  // this canvas only carries the HUD, so it stays sharp; the 2D world's own canvas follows the quality level
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  View.W = innerWidth; View.H = innerHeight;
  // notches and home bars: the HUD keeps clear of them
  const cs = getComputedStyle(document.getElementById('safe')), px = (v) => parseFloat(v) || 0;
  View.safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  UI.fit();
  SDPR = Math.min(window.devicePixelRatio || 1, Q2D.sdpr[Q2D.level]);
  canvas.width = Math.round(View.W * DPR); canvas.height = Math.round(View.H * DPR);
  for (const c of [sceneCv, glCv]) { c.width = Math.round(View.W * SDPR); c.height = Math.round(View.H * SDPR); }
  R3.resize(View.W, View.H, DPR);
  const land = Math.min(View.W / 1150, View.H / 720);
  View.S = View.S0 = clamp(View.H > View.W ? Math.max(land, View.W / 640) : land, 0.42, 1.5);
}

// Keeps the frame rate up by itself. It watches two-second windows during play: when the 3D view is slow it
// drops a quality level (fewer pixels, cheaper shadows and glow), and at the lowest level falls back to 2D;
// when there is clear headroom it climbs back, but never to a level that has already proved too heavy.
const Gov = { n: 0, t: 0, good: 0, cap: 3, before: 0, locked: false };
function governor(raw) {
  Gov.n++; Gov.t += raw;
  if (Gov.t < 2) return;
  const fps = Gov.n / Gov.t;
  Gov.n = 0; Gov.t = 0;
  if (R3.on) {
    if (Settings.quality >= 0) { if (fps < 14 && Settings.auto) { R3.on = false; resize(); } return; } // a level chosen by hand is left alone
    if (Gov.locked) return;
    // A drop that changed nothing means the browser itself is holding the rate down (a 30 fps power-saving
    // mode, say), not the graphics: put the level back and stop adjusting.
    if (Gov.before && Math.abs(fps - Gov.before) < 3 && fps > 24) { Gov.locked = true; R3.setQuality(R3.ql + 1); return; }
    Gov.before = 0;
    if (fps < 42) {
      Gov.good = 0;
      if (R3.ql > 0) { Gov.cap = R3.ql - 1; Gov.before = fps; R3.setQuality(R3.ql - 1); }
      else if (fps < 20 && Settings.auto) { R3.on = false; resize(); }
    } else if (fps > 57 && R3.ql < Math.min(Gov.cap, Input.touch ? 2 : 3)) { if (++Gov.good >= 4) { Gov.good = 0; R3.setQuality(R3.ql + 1); } }
    else Gov.good = 0;
  } else {
    // the 2D view has three levels of its own, and moves between them the same way
    if (Settings.quality >= 0 || Gov2.locked) return;
    if (Gov2.before && Math.abs(fps - Gov2.before) < 3 && fps > 24) { Gov2.locked = true; setQ2D(Q2D.level + 1); return; }
    Gov2.before = 0;
    if (fps < 42) { Gov2.good = 0; if (Q2D.level > 0) { Gov2.cap = Q2D.level - 1; Gov2.before = fps; setQ2D(Q2D.level - 1); } }
    else if (fps > 57 && Q2D.level < Gov2.cap) { if (++Gov2.good >= 4) { Gov2.good = 0; setQ2D(Q2D.level + 1); } }
    else Gov2.good = 0;
  }
}
const Gov2 = { good: 0, cap: 2, before: 0, locked: false };
function setQ2D(q) {
  q = clamp(q, 0, 2);
  if (q === Q2D.level) return;
  Q2D.level = q;
  resize();
}
// The level each renderer starts on: whatever was chosen by hand, else a guess from the device.
function applyQuality() {
  const q = Settings.quality;
  Gov.cap = 3; Gov.good = 0; Gov.before = 0; Gov.locked = false; Gov2.cap = 2; Gov2.good = 0; Gov2.before = 0; Gov2.locked = false;
  R3.setQuality(q >= 0 ? q : Input.touch ? 1 : 2);
  Q2D.level = q >= 0 ? Math.min(2, q) : R3.soft ? 0 : Input.touch ? 1 : 2; // no graphics hardware: start plain
  if (canvas) resize();
}
let lastTs = 0;
function frame(ts) {
  const raw = (ts - lastTs) / 1000 || 0, dt = Math.min(0.033, raw);
  if (raw < 2 && G.state === 'play' && !G.cine) governor(raw); // (a gap over 2 s is a backgrounded tab, not a slow frame)
  lastTs = ts;
  G.t += dt;
  // noon on the first floor, golden hour by the last
  const dayGoal = G.state === 'menu' ? 0.3 + Math.sin(G.t * 0.05) * 0.3 : G.run ? clamp(G.run.floor * 0.22 + (G.boss ? 0.1 : 0), 0, 1) : 0.15;
  G.day = lerp(G.day, dayGoal, 0.02);
  if (G.state === 'play') {
    // hit-stop: the world freezes for a few frames on a solid hit
    if (G.cine) updateCine(dt);
    else if (G.hitstop > 0) { G.hitstop -= dt; updateFx(dt); } // the fighters hold still; effects and the camera do not
    else if (G.impactT > 0) { G.impactT -= dt; update(dt * 0.45); } // the beat of slow motion after a finishing blow
    else update(dt);
  } else if (G.state === 'menu') {
    updateFx(dt);
    updateCamera(dt, ARENA.w / 2 + Math.sin(G.t * 0.07) * 1300, ARENA.h / 2 + Math.cos(G.t * 0.05) * 1100);
  } else if (G.state === 'over') updateFx(dt);
  else if (G.state === 'boon') { updateFx(dt * 0.4); for (let i = 0; i < 3; i++) if (Input.take('Digit' + (i + 1))) takeBoon(i); }
  else if (G.state === 'paused' && Input.take('Escape')) { G.state = 'play'; UI.hide(); }
  if (c3.style.display !== (R3.on ? 'block' : 'none')) c3.style.display = R3.on ? 'block' : 'none';
  if (R3.on) {
    // 3D: Three.js draws the world; this canvas only carries the HUD and the labels pinned to things
    if (glCv.style.display !== 'none') glCv.style.display = 'none';
    if (sceneCv.style.display !== 'none') sceneCv.style.display = 'none';
    View.S = View.S0;
    R3.frame(dt);
    ctx = hctx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, View.W, View.H);
    if (G.flash) { ctx.fillStyle = `rgba(${G.flash.color},${G.flash.a * (G.flash.t / G.flash.max)})`; ctx.fillRect(0, 0, View.W, View.H); }
    if (G.cine) drawCine(); else if (G.state === 'play' || G.state === 'paused' || G.state === 'over' || G.state === 'boon') { R3.overlay(); drawHUD(); }
  } else render();
  requestAnimationFrame(frame);
}

function boot() {
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d');
  UI.el = document.getElementById('ui');
  Input.init(canvas);
  Bank.load();
  Settings.load();
  hctx = ctx;
  sceneCv = document.getElementById('c2');
  sctx = sceneCv.getContext('2d');
  glCv = document.getElementById('gl');
  Post.init(glCv);
  c3 = document.getElementById('c3');
  R3.init(c3);
  // Without hardware acceleration the browser draws WebGL on the CPU: go straight to the plain 2D view.
  if (R3.ok && R3.soft && !Settings.forced3d) Settings.mode3d = false;
  if (R3.soft && !Settings.forcedFx) Settings.fx = false;
  R3.on = R3.ok && Settings.mode3d;
  applyQuality();
  if (typeof MODEL_B64 !== 'undefined') modelsArrived();
  G.motes = [];
  for (let i = 0; i < 44; i++) G.motes.push({ x: rand(), y: rand(), s: rand(1.2, 3), ph: rand(TAU), v: rand(0.008, 0.03) });
  resize();
  addEventListener('resize', resize);
  UI.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) onAction(b.dataset.act, b);
  });
  Input.hitButton = (x, y) => {
    if (G.state !== 'play') return null;
    for (const b of skillButtons()) if (dist(x, y, b.x, b.y) < (b.hit || b.r + 8)) return b.id;
    return null;
  };
  canvas.addEventListener('pointerdown', () => Sfx.init());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') showPause(); });
  View.cam.x = ARENA.w / 2; View.cam.y = ARENA.h / 2;
  const sp = document.getElementById('splash');
  if (sp) sp.remove();
  showTitle();
  requestAnimationFrame(frame);
}
// The model library is the last and by far the largest script on the page. The game is already running on its
// built-in shapes by the time it arrives; swap them for the models as soon as they have decoded.
function modelsArrived() {
  if (!R3.on) return; // the 2D view has no use for them: they are loaded if and when 3D is switched on
  R3.loadModels(() => { R3.build(); if (UI.cur && G.state === 'menu') UI.refresh(); });
}
// The canvases and menu container are above the scripts in the page, so there is nothing to wait for.
boot();
