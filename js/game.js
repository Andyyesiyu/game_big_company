'use strict';
// ---------- meta: what you carried out so far ----------
const Bank = {
  money: 0, best: 0, runs: 0,
  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('layoff_games_bank') || '{}')); } catch (e) { /* storage unavailable: play without a bank */ }
    this.money = +this.money || 0; this.best = +this.best || 0; this.runs = +this.runs || 0;
  },
  save() {
    try { localStorage.setItem('layoff_games_bank', JSON.stringify({ money: this.money, best: this.best, runs: this.runs })); } catch (e) { /* ignore */ }
  },
};
const KITS = [
  { id: 'bare', icon: '📎', cost: 0, apply() {} },
  { id: 'std', icon: '🪭', cost: 2000, apply(p) { p.weapon = 'fan'; p.armor = 50; p.tea = 2; } },
  { id: 'pro', icon: '⌨️', cost: 6000, apply(p) { p.weapon = 'keyboard'; p.armor = 100; p.tea = 4; } },
];
const money = (n) => '¥' + Math.round(n).toLocaleString('en-US');

// ---------- match flow ----------
let canvas, DPR = 1;

function startMatch(kit) {
  Bank.money -= kit.cost; Bank.save();
  genWorld();
  initZone();
  const p = (G.player = makePlayer());
  for (let i = 0; i < 200; i++) {
    const a = rand(TAU), d = rand(1500, 1900);
    p.x = clamp(ARENA.w / 2 + Math.cos(a) * d, 320, ARENA.w - 320); p.y = clamp(ARENA.h / 2 + Math.sin(a) * d, 320, ARENA.h - 320);
    if (isClear(p.x, p.y, 70) && !G.bosses.some((b) => dist(p.x, p.y, b.home.x + b.home.w / 2, b.home.y + b.home.h / 2) < 1000)) break;
  }
  kit.apply(p);
  for (let i = 0; i < G.total - 1; i++) {
    for (let k = 0; k < 60; k++) {
      const s = clearSpot(40);
      if (s && dist(s.x, s.y, p.x, p.y) > 750) { spawnRival(s.x, s.y); break; }
    }
  }
  Object.assign(G, { state: 'play', time: 0, kills: 0, signed: 0, exT: 0, exitsOpen: false, result: null, lastHit: '' });
  View.cam.x = p.x; View.cam.y = p.y;
  UI.hide();
  banner(T('drop_title', G.total), T('drop_sub'), 3.2, '#ffe08a');
  Sfx.play('boss');
}

function endMatch(kind) {
  const p = G.player, haul = p.loot.value, bonus = kind === 'winner' ? 20000 : 0;
  G.state = 'over';
  G.result = { kind, haul, bonus, place: kind === 'dead' ? aliveRivals() + 1 : 1, by: G.lastHit, time: G.time, kills: G.kills, signed: G.signed, counts: p.loot.counts.slice() };
  if (kind !== 'dead') { Bank.money += haul + bonus; Bank.best = Math.max(Bank.best, haul + bonus); }
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
  if (Input.take('Escape') || Input.take('KeyP') || Input.take('pauseBtn')) return showPause();
  const p = G.player;
  G.time += dt;
  updateZone(dt);
  if (!G.exitsOpen && G.time >= 40) {
    G.exitsOpen = true;
    for (const e of G.exits) e.open = true;
    banner(T('exit_open'), T('exit_open_sub'), 2.8, '#7df0a0');
    Sfx.play('safe');
  }
  updatePlayer(dt);
  if (G.state !== 'play') return;

  // a CEO wakes when you get close to them, and stays on you until you leave their plaza
  let near = null;
  for (const b of G.bosses) {
    const h = b.home, inside = p.x > h.x - 180 && p.x < h.x + h.w + 180 && p.y > h.y - 240 && p.y < h.y + h.h + 180;
    if (!inside || b.down) b.aggro = false;
    else if (dist(p.x, p.y, b.x, b.y) < 300) b.aggro = true;
    if (b.aggro) near = b;
    if (b !== G.boss) { b.t += dt; b.sayT -= dt; }
  }
  if (near !== G.boss) {
    if (G.boss) clearHazards();
    G.boss = near;
    if (near && !near.met) {
      near.met = true;
      banner(T('n_' + near.id), T('t_' + near.id), 2.8, THEMES[near.id].neon);
      say(near, T('q_' + near.id + '_intro'), 3);
      Sfx.play('boss');
    }
  }
  updateBullets(dt);
  updateUlts(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateEBullets(dt);
  updateZones(dt);
  updateLasers(dt);
  updateContainers(dt);
  updatePickups(dt);
  updatePets(dt);
  updateFx(dt);
  if (G.state !== 'play') return;

  let inExit = false;
  for (const e of G.exits) if (e.open && dist(p.x, p.y, e.x, e.y) < e.r) inExit = true;
  if (inExit) { if ((G.exT += dt) >= 5) return endMatch('extract'); }
  else G.exT = Math.max(0, G.exT - dt * 2);
  if (aliveRivals() === 0) return endMatch('winner');
  updateCamera(dt, p.x + Math.cos(p.aim) * 50, p.y + Math.sin(p.aim) * 40);
}

function updateCamera(dt, tx, ty) {
  const k = 1 - Math.pow(0.002, dt);
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
    const sweep = Math.min(1, u * 2.4 + 0.4), a0 = s.a - s.half * s.dir, a1 = a0 + s.half * 2 * sweep * s.dir;
    const r1 = s.reach, r0 = s.reach * (0.42 + u * 0.34);
    c.beginPath(); c.arc(s.x, s.y, r1, a0, a1, s.dir < 0); c.arc(s.x, s.y, r0, a1, a0, s.dir > 0); c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.strokeStyle = s.col; c.lineWidth = s.fin ? 8 : 5; c.stroke();
  });
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
  const w = WEAPONS[p.weapon];
  let wa = p.aim, ws = 1.25;
  if (p.swingT > 0) { const k = 1 - p.swingT / p.swingMax; wa = p.swingA + lerp(-w.arc, w.arc, clamp(k * 1.6, 0, 1)) * (p.chain === 2 ? -1 : 1); ws = 1.5; }
  ctx.globalAlpha = p.inv > 0 && p.dashT <= 0 && Math.floor(p.t * 22) % 2 ? 0.4 : p.hidden ? 0.72 : 1;
  at(p.x, p.y, 0, (c) => drawPerson(c, Object.assign({}, PLAYER_LOOK, {
    t: p.t, moving: p.moving, face: p.face, scared: p.hurtT > 0, armUp: p.castT > 0, plaid: p.armor > 0 ? 'rgba(255,255,255,0.4)' : null,
    extra: heldWeapon(wa, p.face, p.weapon, ws),
  })));
  ctx.globalAlpha = 1;
}

const HR_LOOK = { top: '#f06292', shirt: '#fff', bottom: '#3b4a6b', skin: '#f6d3b3', hair: '#4a3327', hairStyle: 'long', smile: true };
const MGR_LOOK = { top: '#7889a3', shirt: '#fff', tie: '#e5484d', bottom: '#3b4a6b', skin: '#eec3a2', hairStyle: 'bald', scale: 1.35 };
const LVL_COL = ['#ffffff', '#9cc9ff', '#ffcf4a'];
const WHITE = { top: '#fff', bottom: '#fff', skin: '#fff', hair: '#fff', shirt: null, tie: null, plaid: null, band: null, badge: null, glasses: null, logo: null };
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
  if (G.player.atkTarget === e) { ctx.strokeStyle = '#ff5a5f'; ctx.lineWidth = 2.5; groundEllipse(e.x, e.y, e.r + 8); ctx.stroke(); }
  shadow(e.x, e.y, e.r * (e.z > 10 ? 0.75 : 1) * (1 - rise * 0.5));
  ctx.globalAlpha = 1 - rise;
  at(e.x, e.y, e.z + rise * 50, (c) => {
    // hit flash: paint the whole figure white for a few frames and pop it slightly
    const fl = e.flash > 0 ? WHITE : null;
    if (fl) c.scale(1.1, 1.1);
    if (e.type === 'rival') drawPerson(c, Object.assign({}, e.look, fl, { t: e.t, moving: e.moving, face: e.face, scared: e.stun > 0, extra: heldWeapon(e.wind > 0 ? e.windA - 1.5 * e.face : e.aim, e.face, e.w, e.wind > 0 ? 1.45 : 1.2) }));
    else if (e.type === 'penguin') drawPenguin(c, e.t, e.face, false);
    else if (e.type === 'drone') drawDrone(c, e.t);
    else if (e.type === 'agent') drawAgentBot(c, e.t, e.face);
    else if (e.type === 'doubao') drawDoubao(c, e.t, e.face);
    else if (e.type === 'crab') drawCrab(c, e.t, e.face);
    else if (e.type === 'gpt') drawGptBot(c, e.t, e.face);
    else if (e.type === 'hr') drawPerson(c, Object.assign({}, HR_LOOK, fl, { t: e.t, moving: !e.asleep, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#a1887f'; rrS(cc, hx - 2, hy - 9, 10, 13, 1.5); cc.fillStyle = '#fff'; cc.fillRect(hx - 0.5, hy - 7, 7, 9); } }));
    else drawPerson(c, Object.assign({}, MGR_LOOK, fl, { t: e.t, moving: !e.asleep, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#fff'; rrS(cc, hx - 3, hy - 7, 8, 8, 1.5); cc.fillStyle = '#8a5a3c'; cc.fillRect(hx - 2, hy - 6, 6, 2); } }));
    if (fl && e.type !== 'rival' && e.type !== 'hr' && e.type !== 'manager') { c.fillStyle = 'rgba(255,255,255,0.8)'; circ(c, 0, -15, 19); }
  });
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
  at(q.x, q.y, q.type === 'doubao' ? Math.abs(Math.sin(q.t * 5)) * 6 : 0, (c) => {
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
  const S = View.S, p = G.player, t = G.t;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  View.ox = rand(-1, 1) * View.shake; View.oy = rand(-1, 1) * View.shake;
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
  for (const u of G.ults) list.push([u.y + 1, () => drawUltBook(u)]);
  for (const b of G.bullets) list.push([b.y, () => drawBullet(b)]);
  for (const b of G.ebullets) if (onScreen(b.x, b.y, 60)) list.push([b.y, () => { shadow(b.x, b.y, b.r * 0.8, 0.18); at(b.x, b.y, b.z, (c) => drawEnemyBullet(c, b)); }]);
  list.sort((a, b) => a[0] - b[0]);
  for (const it of list) it[1]();

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
    ctx.font = `900 ${Math.round(fl.size * Math.max(S, 0.75))}px ${FONT}`;
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.strokeText(fl.text, sx(fl.x), sy(fl.y, fl.z));
    ctx.fillStyle = fl.color; ctx.fillText(fl.text, sx(fl.x), sy(fl.y, fl.z));
  }
  ctx.globalAlpha = 1;

  if (G.zone) drawStorm(G.zone, t);

  // wind
  ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
  for (const w of G.wind) {
    const u = w.t / w.life, x0 = (w.x + u * 0.45) * View.W, y0 = w.y * View.H, len = w.len * View.W;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.5; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + len * 0.35, y0 - 16, x0 + len * 0.65, y0 + 16, x0 + len, y0 - 4);
    ctx.stroke();
  }
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
  const vg = ctx.createRadialGradient(View.W / 2, View.H / 2, Math.min(View.W, View.H) * 0.5, View.W / 2, View.H / 2, Math.max(View.W, View.H) * 0.85);
  vg.addColorStop(0, 'rgba(40,30,90,0)'); vg.addColorStop(1, 'rgba(40,30,90,0.3)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, View.W, View.H);

  if (G.state === 'play' || G.state === 'paused' || G.state === 'over') drawHUD();
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
  const px = sx(wx), py = sy(wy), W = View.W, H = View.H, m = 54;
  if (px > m && px < W - m && py > m + 40 && py < H - m - 40) return;
  const a = Math.atan2(py - H / 2, px - W / 2);
  const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - m - 40) / Math.abs(Math.sin(a) || 1e-6));
  const x = W / 2 + Math.cos(a) * k, y = H / 2 + Math.sin(a) * k;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (label) hudText(label, x - Math.cos(a) * 30, y - Math.sin(a) * 30, 11, color, 'center');
}

function drawMinimap(x, y, s) {
  const k = s / ARENA.w, z = G.zone, p = G.player;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.clip();
  ctx.fillStyle = '#84c95a'; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = '#eadba6'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (const pa of G.map.paths) { ctx.beginPath(); for (const q of pa) ctx.lineTo(x + q[0] * k, y + q[1] * k); ctx.stroke(); }
  for (const o of G.map.ponds) { ctx.fillStyle = '#4aa8e6'; ctx.beginPath(); ctx.arc(x + o.x * k, y + o.y * k, o.r * k, 0, TAU); ctx.fill(); }
  for (const pl of G.map.plazas) {
    ctx.fillStyle = pl.minor ? 'rgba(255,255,255,0.5)' : THEMES[pl.theme].wall;
    ctx.fillRect(x + pl.x * k, y + pl.y * k, pl.w * k, pl.h * k);
  }
  // storm
  ctx.beginPath(); ctx.rect(x, y, s, s); ctx.arc(x + z.x * k, y + z.y * k, Math.max(z.r * k, 0.1), 0, TAU, true);
  ctx.fillStyle = 'rgba(140,50,190,0.55)'; ctx.fill('evenodd');
  ctx.strokeStyle = '#f3c8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + z.x * k, y + z.y * k, Math.max(z.r * k, 0.1), 0, TAU); ctx.stroke();
  if (z.mode !== 'done' && z.nr > 0) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x + z.nx * k, y + z.ny * k, z.nr * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const b of G.bosses) {
    const bx = x + (b.home.x + b.home.w / 2) * k, by = y + (b.home.y + b.home.h / 2) * k;
    ctx.fillStyle = b.down ? '#7df0a0' : '#ff5a5f'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx + 5, by); ctx.lineTo(bx, by + 6); ctx.lineTo(bx - 5, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  for (const e of G.exits) {
    ctx.fillStyle = e.open ? '#3fe08a' : '#cfcfcf'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x + e.x * k - 5, y + e.y * k - 4, 10, 8, 2); ctx.fill(); ctx.stroke();
  }
  ctx.translate(x + p.x * k, y + p.y * k); ctx.rotate(p.aim);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, s, s, 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 2.5, y + 2.5, s - 5, s - 5, 10); ctx.stroke();
}

function drawHUD() {
  const W = View.W, H = View.H, p = G.player, z = G.zone;
  const u = clamp(Math.min(W, H) / 720, 0.72, 1.25), narrow = W < 760, pad = 14 * u;
  // hearts: 20 HP each
  const hs = 11 * u, n = Math.ceil(p.maxhp / 20);
  for (let i = 0; i < n; i++) {
    const hx = pad + hs + i * hs * 2.5, hy = pad + hs, f = clamp((p.hp - i * 20) / 20, 0, 1);
    heartPath(ctx, hx, hy, hs); ctx.fillStyle = '#3b3550'; ctx.fill();
    if (f > 0) { ctx.save(); heartPath(ctx, hx, hy, hs); ctx.clip(); ctx.fillStyle = '#ff5a6e'; ctx.fillRect(hx - hs * 1.3, hy - hs, hs * 2.6 * f, hs * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(hx - hs * 0.45, hy - hs * 0.25, hs * 0.22, 0, TAU); ctx.fill(); ctx.restore(); }
    heartPath(ctx, hx, hy, hs); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();
  }
  let ly = pad + hs * 2.6;
  const bw = n * hs * 2.5 - hs * 0.5;
  if (p.armor > 0) { bar(pad, ly, bw, 7 * u, p.armor / 100, '#6fb1ff'); hudText(T('armor'), pad + bw + 8 * u, ly + 4 * u, 10 * u, '#9cc9ff'); ly += 15 * u; }
  ly += 6 * u;
  ctx.save(); ctx.translate(pad + 10 * u, ly); ctx.scale(0.9 * u, 0.9 * u); drawWeapon(ctx, p.weapon, 1); ctx.restore();
  hudText(T('w_' + p.weapon), pad + 26 * u, ly, 12 * u, TIER[WEAPONS[p.weapon].tier]);
  ly += 22 * u;
  ctx.save(); ctx.translate(pad + 7 * u, ly + 2 * u); ctx.scale(0.62 * u, 0.62 * u); drawLootIcon(ctx, { kind: 'tea' }); ctx.restore();
  hudText('×' + p.tea + (Input.touch ? '' : '  [F]'), pad + 18 * u, ly, 12 * u, p.tea ? '#ffd0d6' : '#b8b2d0'); ly += 22 * u;
  hudText(money(p.loot.value), pad, ly + 2 * u, 17 * u, '#ffe08a', 'left', 900);
  let px = pad + ctx.measureText(money(p.loot.value)).width + 12 * u;
  for (let i = 2; i < 6; i++) for (let k = 0; k < Math.min(p.loot.counts[i], 5); k++) { ctx.fillStyle = TIER[i]; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(px, ly - 5 * u, 8 * u, 11 * u, 2); ctx.fill(); ctx.stroke(); px += 10 * u; }
  ly += 22 * u;
  if (p.hidden) { hudText(T('hud_hidden'), pad, ly, 11 * u, '#b9f59a'); ly += 18 * u; }
  // kill feed
  ly += 4 * u;
  for (const f of G.feed) { ctx.globalAlpha = clamp(f.t, 0, 1); hudText(f.text, pad, ly, 10.5 * u, f.color, 'left', 700); ly += 15 * u; }
  ctx.globalAlpha = 1;

  // minimap + match status
  const ms = clamp(150 * u, 104, 190), mx = W - pad - ms;
  drawMinimap(mx, pad, ms);
  hudText(`${T('hud_alive')} ${aliveRivals() + (p.hp > 0 ? 1 : 0)}`, mx, pad + ms + 14 * u, 12 * u, '#fff');
  hudText(`${T('hud_kills')} ${G.kills}`, W - pad, pad + ms + 14 * u, 12 * u, '#ffe08a', 'right');
  const zt = z.mode === 'hold' ? T('hud_zone_in', fmtTime(Math.max(0, z.t))) : z.mode === 'shrink' ? T('hud_zone_now') : T('hud_zone_done');
  hudText(zt, W - pad, pad + ms + 32 * u, 11 * u, z.mode === 'hold' ? '#e9d5ff' : '#ff9df0', 'right');

  // centre: boss bar
  const b = G.boss, cyTop = narrow ? pad + ms + 56 * u : pad + 6 * u;
  if (b && !b.gone && !b.down) {
    const w = narrow ? W - pad * 2 : Math.min(W * 0.36, 460), bx = (W - w) / 2;
    hudText(T('n_' + b.id), W / 2, cyTop, 14 * u, '#fff', 'center', 900);
    bar(bx, cyTop + 13 * u, w, 11 * u, b.hp / b.maxhp, '#ff5a5f');
    hudText(T('t_' + b.id), W / 2, cyTop + 37 * u, 10 * u, '#fff', 'center', 600);
  }
  if (p.outside && G.state === 'play') hudText(T('hud_outside'), W / 2, H * 0.24, 20 * u * (1 + Math.sin(G.t * 8) * 0.04), '#f3b8ff', 'center', 900);

  // pointers
  if (G.state === 'play') {
    if (p.outside) edgeArrow(z.x, z.y, '#f3b8ff', T('hud_safe'));
    if (G.exitsOpen) {
      let ex = null, xd = 1e9;
      for (const e of G.exits) { const d = dist(p.x, p.y, e.x, e.y); if (d < xd) { xd = d; ex = e; } }
      if (ex) edgeArrow(ex.x, ex.y, '#5df09a', T('hud_exit') + ' ' + Math.round(xd / 10) + 'm');
    }
    if (G.exT > 0) {
      const w = Math.min(280 * u, W * 0.6);
      hudText(T('hud_extract') + ' ' + Math.max(0, 5 - G.exT).toFixed(1), W / 2, H * 0.66, 16 * u, '#9df0b8', 'center', 900);
      bar((W - w) / 2, H * 0.66 + 16 * u, w, 10 * u, G.exT / 5, '#3fe08a');
    }
    const kc = G.containers.find((k) => !k.opened && k.prog > 0);
    if (kc) hudText(T('hud_search'), sx(kc.x), sy(kc.y, 96), 11 * u, '#fff', 'center');
  }

  drawSkills(u);
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

// One layout shared by drawing and touch hit-testing.
// Phone: a thumb cluster in the bottom-right corner. PC: a bar with the key under each skill.
function skillButtons() {
  const W = View.W, H = View.H;
  if (Input.touch) {
    return [
      { id: 'atk', x: W - 80, y: H - 96, r: 46 }, { id: 'q', x: W - 192, y: H - 84, r: 28 }, { id: 'w', x: W - 164, y: H - 174, r: 28 },
      { id: 'e', x: W - 88, y: H - 212, r: 28 }, { id: 'r', x: W - 150, y: H - 264, r: 31 }, { id: 'd', x: W - 36, y: H - 266, r: 22 }, { id: 'tea', x: W - 36, y: H - 320, r: 22 },
    ];
  }
  const u = clamp(Math.min(W, H) / 720, 0.72, 1.25), gap = 64 * u, y = H - 52 * u, x0 = W / 2 - gap * 2.5;
  return ['q', 'w', 'e', 'r', 'd', 'tea'].map((id, i) => ({ id, x: x0 + i * gap + (i > 3 ? 14 * u : 0), y, r: (id === 'r' ? 29 : i > 3 ? 21 : 26) * u, key: 'QWERDF'[i] }));
}
function drawSkillIcon(c, id) {
  ink(c, 1.6);
  if (id === 'atk') drawWeapon(c, G.player.weapon, 1.9);
  else if (id === 'q') drawWeapon(c, 'pan', 1.5);
  else if (id === 'r') drawWeapon(c, 'book', 1.25);
  else if (id === 'tea') { c.scale(0.9, 0.9); drawLootIcon(c, { kind: 'tea' }); }
  else if (id === 'w') {
    c.fillStyle = '#ffcf4a'; c.beginPath();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? 6 : 15; c.lineTo(Math.cos((i / 16) * TAU) * r, Math.sin((i / 16) * TAU) * r); }
    c.closePath(); c.fill(); c.stroke();
  } else {
    c.fillStyle = id === 'e' ? '#5cc8ff' : '#fff';
    for (const o of id === 'e' ? [-7, 3] : [-2]) poly(c, [o - 4, -10, o + 8, 0, o - 4, 10, o, 0], true);
  }
}
function drawSkills(u) {
  const p = G.player;
  for (const b of skillButtons()) {
    const max = b.id === 'tea' ? 1 : SKILL_CD[b.id] || 1, cd = b.id === 'tea' ? Math.max(0, p.teaCd) : b.id === 'atk' ? 0 : p.cd[b.id];
    const ready = cd <= 0 && (b.id !== 'tea' || p.tea > 0);
    ctx.fillStyle = !ready ? 'rgba(42,36,56,0.55)' : b.id === 'r' ? '#ffe9a8' : 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = b.id === 'r' && ready ? '#ffcf4a' : INK; ctx.lineWidth = b.id === 'r' && ready ? 4 : 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.r / 27, b.r / 27); ctx.globalAlpha = ready ? 1 : 0.55; drawSkillIcon(ctx, b.id); ctx.restore();
    if (cd > 0) {
      ctx.fillStyle = 'rgba(42,36,56,0.62)';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(cd / max, 0, 1)); ctx.closePath(); ctx.fill();
      if (b.id !== 'tea') hudText(cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd)), b.x, b.y, b.r * 0.7, '#fff', 'center', 900);
    }
    if (b.key) hudText(b.key, b.x, b.y + b.r + 9 * u, 10 * u, '#fff', 'center');
    if (b.key && b.id !== 'tea') hudText(T('sk_' + b.id), b.x, b.y - b.r - 9 * u, 9.5 * u, '#fff', 'center', 700);
    if (b.id === 'tea') hudText('×' + p.tea, b.x + b.r * 0.8, b.y - b.r * 0.8, 11 * u, '#ffd0d6', 'center');
  }
}

// ---------- menus (DOM overlay) ----------
const UI = {
  el: null, cur: null,
  show(fn) { this.cur = fn; this.el.innerHTML = `<div class="card">${fn()}</div>`; this.el.classList.add('on'); },
  hide() { this.cur = null; this.el.classList.remove('on'); this.el.innerHTML = ''; },
  refresh() { if (this.cur) this.show(this.cur); },
};
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const optRow = () => `<div class="row"><button class="ghost" data-act="lang">${T('lang')}</button><button class="ghost" data-act="mute">${T(Sfx.muted ? 'sound_off' : 'sound_on')}</button></div>`;

function showTitle() {
  if (!G.map || G.state !== 'menu') { genWorld(); initZone(); G.player = makePlayer(); G.player.x = G.player.y = -9999; }
  G.state = 'menu'; G.result = null;
  UI.show(() => `
    <div class="kicker">${T('kicker')}</div>
    <h1>${T('title')}</h1>
    <h2>${T('title2')}</h2>
    <p class="tag">${T('tagline')}</p>
    <button class="big" data-act="kits">${T('start')}</button>
    <div class="bank">${T('bank')} <b>${money(Bank.money)}</b></div>
    <p class="ctl">${T('ctl_desktop')}<br>${T('ctl_touch')}</p>
    ${optRow()}
    <p class="disc">${T('disclaimer')}</p>`);
}
function showKits() {
  UI.show(() => `
    <div class="kicker">${T('kit_title')}</div>
    <ul class="rules"><li>${T('rule0')}</li><li>${T('rule1')}</li><li>${T('rule2')}</li><li>${T('rule3')}</li><li>${T('rule4')}</li><li>${T('rule5')}</li></ul>
    <div class="perks">${KITS.map((k, i) => `<button class="perk" data-act="kit" data-i="${i}" ${Bank.money < k.cost ? 'disabled' : ''}><span class="ic">${k.icon}</span><b>${T('kit_' + k.id + '_n')}</b><small>${T('kit_' + k.id + '_d')}</small><em>${k.cost ? money(k.cost) : T('kit_free')}</em></button>`).join('')}</div>
    <div class="bank">${T('bank')} <b>${money(Bank.money)}</b></div>
    <button class="ghost" data-act="menu">${T('menu')}</button>`);
}
function showResult() {
  const r = G.result;
  if (!r || G.state !== 'over') return;
  const pips = r.counts.map((n, i) => (n ? `<span style="color:${TIER[i]}">■×${n}</span>` : '')).join(' ');
  const rows = [
    ['st_haul', r.kind === 'dead' ? `<s>${money(r.haul)}</s>` : money(r.haul + r.bonus)],
    ['st_place', r.kind === 'extract' ? T('st_extracted') : '#' + r.place + ' / ' + G.total],
    ['st_kills', r.kills], ['st_signed', r.signed + ' / 5'], ['st_time', fmtTime(r.time)], ['st_bank', money(Bank.money)],
  ];
  const line = pick(['dead1', 'dead2', 'dead3']);
  const head = r.kind === 'dead'
    ? `<h1 class="red">${T('res_dead_title')}</h1><p class="story">${T('res_dead_sub', r.by || T('by_pve'))}</p><p class="story dim">${T(line)}</p>`
    : r.kind === 'extract'
      ? `<h1 class="green">${T('res_ex_title')}</h1><p class="story">${T('res_ex_sub')}</p>`
      : `<h1 class="gold">${T('res_win_title')}</h1><p class="story">${T('res_win_sub', money(r.bonus))}</p>`;
  UI.show(() => `
    ${head}
    ${r.kind !== 'dead' && r.signed >= 5 ? `<p class="story hi">${T('res_all_signed')}</p>` : ''}
    <div class="stats">${rows.map(([k, v]) => `<div><span>${T(k)}</span><b>${v}</b></div>`).join('')}</div>
    <p class="pips">${pips}</p>
    <button class="big" data-act="kits">${T('again')}</button>
    <button class="ghost" data-act="menu">${T('menu')}</button>
    ${r.kind !== 'dead' ? `<p class="disc">${T('win_twist')}</p>` : ''}`);
}
function showPause() {
  G.state = 'paused';
  UI.show(() => `
    <h1>${T('paused')}</h1>
    <p class="ctl">${T('ctl_desktop')}<br>${T('ctl_touch')}</p>
    <button class="big" data-act="resume">${T('resume')}</button>
    ${optRow()}
    <button class="ghost" data-act="menu">${T('quit')}</button>`);
}

function onAction(act, el) {
  Sfx.init();
  Sfx.play('ui');
  if (act === 'kits') showKits();
  else if (act === 'kit') startMatch(KITS[+el.dataset.i]);
  else if (act === 'lang') { LANG.zh = !LANG.zh; UI.refresh(); }
  else if (act === 'mute') { Sfx.muted = !Sfx.muted; UI.refresh(); }
  else if (act === 'menu') showTitle();
  else if (act === 'resume') { G.state = 'play'; UI.hide(); }
}

// ---------- boot ----------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  View.W = innerWidth; View.H = innerHeight;
  canvas.width = Math.round(View.W * DPR); canvas.height = Math.round(View.H * DPR);
  const land = Math.min(View.W / 1150, View.H / 720);
  View.S = clamp(View.H > View.W ? Math.max(land, View.W / 640) : land, 0.42, 1.5);
}

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  G.t += dt;
  if (G.state === 'play') {
    // hit-stop: the world freezes for a few frames on a solid hit
    if (G.hitstop > 0) { G.hitstop -= dt; updateFx(dt * 0.25); } else update(dt);
  } else if (G.state === 'menu') {
    updateFx(dt);
    updateCamera(dt, ARENA.w / 2 + Math.sin(G.t * 0.07) * 1300, ARENA.h / 2 + Math.cos(G.t * 0.05) * 1100);
  } else if (G.state === 'over') updateFx(dt);
  else if (G.state === 'paused' && Input.take('Escape')) { G.state = 'play'; UI.hide(); }
  render();
  requestAnimationFrame(frame);
}

function boot() {
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d');
  UI.el = document.getElementById('ui');
  Input.init(canvas);
  Bank.load();
  resize();
  addEventListener('resize', resize);
  UI.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) onAction(b.dataset.act, b);
  });
  Input.hitButton = (x, y) => {
    if (G.state !== 'play') return null;
    for (const b of skillButtons()) if (dist(x, y, b.x, b.y) < b.r + 8) return b.id;
    return null;
  };
  for (const [id, key] of [['tb-pause', 'pauseBtn']]) {
    const el = document.getElementById(id);
    const press = (e) => { e.preventDefault(); Input.pressed[key] = true; };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('mousedown', press);
  }
  canvas.addEventListener('pointerdown', () => Sfx.init());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') showPause(); });
  View.cam.x = ARENA.w / 2; View.cam.y = ARENA.h / 2;
  showTitle();
  requestAnimationFrame(frame);
}
addEventListener('DOMContentLoaded', boot);
