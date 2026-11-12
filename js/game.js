'use strict';
// ---------- floors ----------
const desk = (x, y, w, d) => ({ x, y, w, d, h: 36 });
const FLOORS = [
  {
    boss: 'pony', minions: ['penguin', 'penguin', 'hr'], cap: 6, spawnEvery: 1.7, rounds: 2, calm: 9, count: 4.2, safeN: 2, safeR: 115, move: 0,
    desks: [desk(250, 260, 200, 70), desk(1050, 260, 200, 70), desk(250, 640, 200, 70), desk(1050, 640, 200, 70), desk(650, 440, 200, 70)],
    theme: { floorA: '#27466e', floorB: '#2c4f7c', trim: '#152740', wall: '#1d3557', wallTop: '#132238', neon: '#4fc3f7', sky0: '#f9a66c', sky1: '#7b5ea7', deskTop: '#cfd8dc', deskSide: '#8fa3ad', screen: '#4fc3f7' },
  },
  {
    boss: 'yiming', minions: ['hr', 'drone', 'hr', 'manager'], cap: 7, spawnEvery: 1.6, rounds: 3, calm: 8, count: 4.0, safeN: 2, safeR: 105, move: 30,
    desks: [desk(200, 320, 90, 240), desk(1210, 320, 90, 240), desk(560, 300, 380, 70), desk(560, 600, 380, 70)],
    theme: { floorA: '#1b1b24', floorB: '#21212c', trim: '#0d0d13', wall: '#17171f', wallTop: '#0c0c12', neon: '#ff2d6f', sky0: '#1a1035', sky1: '#3a1c5c', deskTop: '#3a3a48', deskSide: '#272733', screen: '#25f4ee' },
  },
  {
    boss: 'elon', minions: ['drone', 'agent', 'agent', 'manager', 'hr'], cap: 9, spawnEvery: 1.4, rounds: 3, calm: 8, count: 3.9, safeN: 2, safeR: 100, move: 50,
    desks: [desk(300, 400, 180, 70), desk(1020, 400, 180, 70), desk(660, 250, 180, 70), desk(660, 620, 180, 70)],
    theme: { floorA: '#3a2422', floorB: '#432a27', trim: '#1e1211', wall: '#2a1a19', wallTop: '#170e0d', neon: '#ff7043', sky0: '#ffb199', sky1: '#8a3a25', deskTop: '#b0b8bd', deskSide: '#7b868c', screen: '#ff7043' },
  },
  {
    boss: 'sam', minions: ['agent', 'agent', 'drone', 'manager'], cap: 10, spawnEvery: 1.3, rounds: 3, calm: 7.5, count: 3.8, safeN: 1, safeR: 110, move: 60,
    desks: [desk(380, 300, 120, 120), desk(1000, 300, 120, 120), desk(380, 620, 120, 120), desk(1000, 620, 120, 120)],
    theme: { floorA: '#1d3832', floorB: '#22413a', trim: '#0f1f1b', wall: '#172b27', wallTop: '#0d1917', neon: '#69f0ae', sky0: '#b2dfdb', sky1: '#4a6fa5', deskTop: '#e0e5e3', deskSide: '#9aa8a4', screen: '#69f0ae' },
  },
  {
    boss: 'dario', minions: ['drone', 'agent', 'manager', 'hr', 'drone'], cap: 10, spawnEvery: 1.3, rounds: 3, calm: 7.5, count: 3.7, safeN: 1, safeR: 100, move: 80,
    desks: [desk(330, 460, 200, 70), desk(970, 460, 200, 70)],
    theme: { floorA: '#4a392c', floorB: '#544132', trim: '#261c15', wall: '#35281f', wallTop: '#1f1711', neon: '#ff9e6b', sky0: '#ffd9b3', sky1: '#c26a4a', deskTop: '#e8dccb', deskSide: '#b3a38e', screen: '#ff9e6b' },
  },
];

const PERKS = [
  { id: 'leave', icon: '🏖️', apply(p) { p.maxhp += 25; p.hp = p.maxhp; } },
  { id: 'side', icon: '💼', apply(p) { p.perks.dmg *= 1.25; } },
  { id: 'remote', icon: '🏠', apply(p) { p.perks.speed *= 1.12; } },
  { id: 'slack', icon: '🐟', apply(p) { p.perks.dashCd *= 0.65; } },
  { id: 'coffee', icon: '☕', apply(p) { p.perks.rate *= 1.22; } },
  { id: 'snacks', icon: '🍜', apply(p) { p.perks.ammo *= 1.5; for (const w of p.weapons) if (w.ammo !== Infinity) w.ammo = Math.max(w.ammo, Math.round(WEAPONS[w.id].ammo * p.perks.ammo)); } },
  { id: 'union', icon: '✊', apply(p) { p.perks.lifesteal += 1.5; } },
];

// ---------- flow ----------
let canvas, DPR = 1;

function resetArena() {
  G.enemies = []; G.bullets = []; G.pickups = []; G.parts = []; G.floats = []; G.rings = []; G.coworkers = [];
  clearHazards();
  G.boss = null; G.rv = null; G.doorOpen = 0; G.banner = null; G.flash = null;
}

function startRun(floor = 0) {
  Object.assign(G, { headcount: 10000, score: 0, kills: 0, saved: 0, deaths: 0, runTime: 0, hcDelta: null });
  G.player = makePlayer();
  G.state = 'play';
  UI.hide();
  startFloor(floor);
}

function startFloor(i) {
  const f = FLOORS[i], p = G.player;
  G.floor = i;
  resetArena();
  G.obstacles = f.desks.map((d) => Object.assign({}, d));
  G.hpScale = 1 + i * 0.15;
  p.x = ARENA.w / 2; p.y = ARENA.h * 0.82; p.inv = 0; p.dashT = 0; p.hurtT = 0;
  for (let k = 0; k < 8; k++) { const s = freeSpot(); spawnCoworker(s.x, s.y); }
  G.snapshot = JSON.stringify({ hp: p.hp, maxhp: p.maxhp, weapons: p.weapons, wi: p.wi, perks: p.perks, score: G.score, headcount: G.headcount, kills: G.kills, saved: G.saved });
  G.phase = 'intro'; G.phaseT = 2.6;
  banner(T('floor_n', i + 1) + ' · ' + T('fl_' + f.boss), T('floor_sub'), 2.5, f.theme.neon);
  G.crateT = 7;
  spawnCrate(true);
  if (i === 0) spawnCrate(true);
  View.cam.x = p.x; View.cam.y = p.y;
  Sfx.play('warn');
}

function retryFloor() {
  const s = JSON.parse(G.snapshot), p = G.player;
  p.hp = Math.max(s.hp, Math.round(s.maxhp * 0.7)); p.maxhp = s.maxhp; p.wi = s.wi; p.perks = s.perks;
  p.weapons = s.weapons.map((w) => ({ id: w.id, ammo: w.ammo === null ? Infinity : w.ammo }));
  G.score = s.score; G.headcount = s.headcount; G.kills = s.kills; G.saved = s.saved;
  G.state = 'play';
  UI.hide();
  startFloor(G.floor);
}

function startReview() {
  const f = FLOORS[G.floor];
  G.phase = 'review';
  G.rv = { round: 1, total: f.rounds, mode: 'calm', t: f.calm, zones: [], lastTick: 0 };
  G.spawnT = 0.6;
}

function makeSafeZones(f) {
  const zs = [];
  for (let i = 0; i < f.safeN; i++) {
    let s = null;
    for (let k = 0; k < 30; k++) {
      s = i === 0 ? freeSpot(230, 600) : freeSpot();
      if (zs.every((z) => dist(z.x, z.y, s.x, s.y) > f.safeR * 2.6)) break;
    }
    const a = rand(TAU);
    zs.push({ x: s.x, y: s.y, r: f.safeR, vx: Math.cos(a) * f.move, vy: Math.sin(a) * f.move });
  }
  return zs;
}

function judgeReview() {
  const rv = G.rv, p = G.player;
  G.flash = { color: '255,30,60', t: 0.45, max: 0.45, a: 0.45 };
  View.shake = 10;
  Sfx.play('snap');
  if (rv.zones.some((z) => dist(p.x, p.y, z.x, z.y) < z.r + 4)) {
    G.score += 100;
    floater(p.x, p.y, 90, T('rv_pass'), '#69f0ae', 22, 1.6);
    Sfx.play('safe');
  } else {
    p.inv = 0;
    hurtPlayer(26 + G.floor * 2, true);
    floater(p.x, p.y, 104, T('rv_fail'), '#ff5252', 22, 1.6);
  }
  for (const c of G.coworkers) {
    if (!rv.zones.some((z) => dist(c.x, c.y, z.x, z.y) < z.r + 8)) dustCoworker(c);
  }
  layoff(randi(500, 900));
}

function updateReview(dt) {
  const rv = G.rv, f = FLOORS[G.floor];
  G.spawnT -= dt;
  if (G.spawnT <= 0 && G.enemies.length < f.cap) {
    spawnAtEdge(pick(f.minions));
    G.spawnT = f.spawnEvery;
  }
  rv.t -= dt;
  if (rv.mode === 'calm') {
    if (rv.t <= 0) {
      rv.mode = 'count'; rv.t = f.count; rv.zones = makeSafeZones(f); rv.lastTick = Math.ceil(f.count);
      Sfx.play('warn');
    }
    return;
  }
  for (const z of rv.zones) {
    z.x += z.vx * dt; z.y += z.vy * dt;
    if (z.x < 140 || z.x > ARENA.w - 140) { z.vx *= -1; z.x = clamp(z.x, 140, ARENA.w - 140); }
    if (z.y < 160 || z.y > ARENA.h - 120) { z.vy *= -1; z.y = clamp(z.y, 160, ARENA.h - 120); }
  }
  if (Math.ceil(rv.t) < rv.lastTick) { rv.lastTick = Math.ceil(rv.t); Sfx.play('tick'); }
  if (rv.t > 0) return;
  judgeReview();
  if (G.state !== 'play') return;
  if (++rv.round > rv.total) startBossIntro();
  else { rv.mode = 'calm'; rv.t = f.calm; rv.zones = []; }
}

function startBossIntro() {
  const f = FLOORS[G.floor];
  for (const e of G.enemies) killEnemy(e, false);
  G.enemies = [];
  clearHazards();
  G.rv = null;
  G.phase = 'bossintro'; G.phaseT = 3.0;
  G.boss = makeBoss(f.boss);
  banner(T('n_' + f.boss), T('t_' + f.boss), 2.8, f.theme.neon);
  say(G.boss, T('q_' + f.boss + '_intro'), 2.9);
  Sfx.play('boss');
}

function floorCleared() {
  const saved = G.coworkers.length;
  G.saved += saved;
  G.score += saved * 50;
  if (G.floor >= FLOORS.length - 1) return showWin();
  showPerks();
}

function playerDie() {
  const p = G.player;
  G.state = 'dead';
  G.deaths++;
  Sfx.play('dead');
  dust(p.x, p.y, 60, ['#5c6bc0', '#f2c9a5', '#d7b98e', '#fff3c4'], 50);
  setTimeout(showDead, 1100);
}

function update(dt) {
  if (Input.take('Escape') || Input.take('KeyP') || Input.take('pauseBtn')) return showPause();
  if (Input.take('KeyM')) Sfx.muted = !Sfx.muted;
  const p = G.player;
  G.runTime += dt;
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateEBullets(dt);
  updateZones(dt);
  updateLasers(dt);
  updatePickups(dt);
  updateCoworkers(dt);
  updateFx(dt);
  if (G.state !== 'play') return;
  if ((G.phase === 'review' || G.phase === 'boss') && (G.crateT -= dt) <= 0) {
    G.crateT = G.phase === 'boss' ? 10 : 8;
    if (G.pickups.filter((k) => k.kind === 'weapon' || k.big).length < 3) spawnCrate();
  }
  if (G.phase === 'intro') { if ((G.phaseT -= dt) <= 0) startReview(); }
  else if (G.phase === 'review') updateReview(dt);
  else if (G.phase === 'bossintro') {
    const b = G.boss;
    G.doorOpen = Math.min(1, G.doorOpen + dt * 1.6);
    b.y = Math.min(200, b.y + dt * 85); b.moving = b.y < 200;
    if ((G.phaseT -= dt) <= 0) G.phase = 'boss';
  } else if (G.phase === 'boss') G.doorOpen = Math.max(0, G.doorOpen - dt);
  else if (G.phase === 'bossdown') { if ((G.phaseT -= dt) <= 0) floorCleared(); }
  updateCamera(dt, p.x + Math.cos(p.aim) * 40, p.y + Math.sin(p.aim) * 30);
}

function updateCamera(dt, tx, ty) {
  const vw = View.W / View.S, vh = View.H / (View.S * YK);
  const mTop = WALL_H / YK + 50, mB = 80, mS = 50;
  const x = vw >= ARENA.w + 2 * mS ? ARENA.w / 2 : clamp(tx, vw / 2 - mS, ARENA.w - vw / 2 + mS);
  const y = vh >= ARENA.h + mTop + mB ? (ARENA.h + mB - mTop) / 2 : clamp(ty, vh / 2 - mTop, ARENA.h - vh / 2 + mB);
  const k = 1 - Math.pow(0.002, dt);
  View.cam.x = lerp(View.cam.x, x, k); View.cam.y = lerp(View.cam.y, y, k);
}

// ---------- rendering ----------
const ZONE_RGB = { snap: '255,200,60', rocket: '255,112,67', feed: '255,45,111', delay: '255,45,111', grid: '255,138,80', red: '255,82,82' };

function drawZone(z) {
  const rgb = ZONE_RGB[z.look] || ZONE_RGB.red, u = clamp(z.t / z.delay, 0, 1), S = View.S;
  if (z.kind === 'circle') {
    if (!z.done) {
      ctx.fillStyle = `rgba(${rgb},${0.12 + 0.12 * u})`; groundEllipse(z.x, z.y, z.r); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.9)`; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = `rgba(${rgb},0.3)`; groundEllipse(z.x, z.y, z.r * u); ctx.fill();
      if (z.look === 'rocket') {
        at(z.x, z.y, (1 - u) * (1 - u) * 700 + 10, (c) => {
          c.fillStyle = '#eceff1'; rr(c, -6, -34, 12, 34, 5);
          c.fillStyle = '#263238'; c.beginPath(); c.moveTo(-6, -8); c.lineTo(-12, 2); c.lineTo(-6, 0); c.fill();
          c.beginPath(); c.moveTo(6, -8); c.lineTo(12, 2); c.lineTo(6, 0); c.fill();
          c.fillStyle = '#ff7043'; c.beginPath(); c.moveTo(-5, -34); c.lineTo(0, -52 - rand(8)); c.lineTo(5, -34); c.fill();
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
    ctx.fillStyle = `rgba(${rgb},${0.1 + 0.16 * u + (u > 0.7 ? Math.sin(z.t * 40) * 0.05 : 0)})`; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${rgb},0.85)`; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (z.w > z.h) { ctx.fillStyle = `rgba(${rgb},0.25)`; ctx.fillRect(x, y, w * u, h); }
    else { ctx.fillStyle = `rgba(${rgb},0.25)`; ctx.fillRect(x, y, w, h * u); }
  } else {
    const k = 1 - (z.t - z.delay) / z.linger;
    ctx.fillStyle = `rgba(${rgb},${0.55 * k})`; ctx.fillRect(x, y, w, h);
    if (z.look === 'feed') {
      // a wall of short videos streaking past
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
  if (l.look === 'warn') { ctx.fillStyle = `rgba(255,82,82,${0.18 + 0.14 * Math.sin(l.t * 30)})`; ctx.fill(); return; }
  if (l.look === 'flame') {
    ctx.fillStyle = active ? 'rgba(255,112,67,0.5)' : 'rgba(255,112,67,0.18)'; ctx.fill();
    if (!active) { ctx.strokeStyle = 'rgba(255,160,90,0.8)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    return;
  }
  ctx.fillStyle = active ? 'rgba(255,243,224,0.9)' : 'rgba(255,243,224,0.16)'; ctx.fill();
  ctx.strokeStyle = active ? '#ff8a50' : 'rgba(255,138,80,0.7)'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke();
  if (!active) return;
  // lines of text running down the page
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

const PLAYER_LOOK = { top: '#5c6bc0', bottom: '#263238', skin: '#f2c9a5', hair: '#1b1b1b', hairStyle: 'messy', bags: true, badge: '#29b6f6' };
function drawPlayer(p) {
  if (G.state === 'dead') return;
  shadow(p.x, p.y, p.r);
  if (p.dashCd <= 0 && G.state === 'play') { ctx.strokeStyle = 'rgba(159,168,218,0.5)'; ctx.lineWidth = 1.5; groundEllipse(p.x, p.y, p.r + 6); ctx.stroke(); }
  ctx.globalAlpha = p.inv > 0 && p.dashT <= 0 && Math.floor(p.t * 22) % 2 ? 0.4 : 1;
  at(p.x, p.y, 0, (c) => {
    drawPerson(c, Object.assign({}, PLAYER_LOOK, {
      t: p.t, moving: p.moving, face: p.face, scared: p.hurtT > 0,
      extra(cc, hx, hy) {
        const sa = Math.atan2(Math.sin(p.aim) * YK, Math.cos(p.aim));
        cc.save(); cc.translate(hx, hy); cc.rotate(p.face > 0 ? sa : Math.PI - sa); cc.translate(9, 0);
        drawWeapon(cc, p.weapons[p.wi].id, 0.95);
        cc.restore();
      },
    }));
  });
  ctx.globalAlpha = 1;
}

const HR_LOOK = { top: '#ec407a', shirt: '#fff', bottom: '#37474f', skin: '#f2c9a5', hair: '#3e2723', hairStyle: 'long', smile: true };
const MGR_LOOK = { top: '#546e7a', shirt: '#fff', tie: '#c62828', bottom: '#263238', skin: '#e8b796', hairStyle: 'bald', scale: 1.35 };
function drawEnemy(e) {
  const rise = e.spawnT > 0 ? e.spawnT / 0.6 : 0;
  shadow(e.x, e.y, e.r * (e.z > 10 ? 0.75 : 1) * (1 - rise * 0.5));
  ctx.globalAlpha = 1 - rise;
  at(e.x, e.y, e.z + rise * 50, (c) => {
    const fl = e.flash > 0;
    if (fl) c.filter = 'brightness(2.4)';
    if (e.type === 'penguin') drawPenguin(c, e.t, e.face, false);
    else if (e.type === 'drone') drawDrone(c, e.t, fl);
    else if (e.type === 'agent') drawAgentBot(c, e.t, e.face, fl);
    else if (e.type === 'hr') drawPerson(c, Object.assign({}, HR_LOOK, { t: e.t, moving: true, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#8d6e63'; rr(cc, hx - 2, hy - 9, 10, 13, 1.5); cc.fillStyle = '#fff'; cc.fillRect(hx - 0.5, hy - 7, 7, 9); cc.fillStyle = '#ec407a'; cc.fillRect(hx + 0.5, hy - 5, 5, 1.5); } }));
    else drawPerson(c, Object.assign({}, MGR_LOOK, { t: e.t, moving: true, face: e.face, extra(cc, hx, hy) { cc.fillStyle = '#fff'; rr(cc, hx - 3, hy - 7, 8, 8, 1.5); cc.fillStyle = '#6d4c41'; cc.fillRect(hx - 2, hy - 6, 6, 2); } }));
    c.filter = 'none';
  });
  ctx.globalAlpha = 1;
  if (e.type === 'manager' && e.hp < e.maxhp) {
    const w = 44 * View.S, x = sx(e.x) - w / 2, y = sy(e.y, 92);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#ff5252'; ctx.fillRect(x, y, w * clamp(e.hp / e.maxhp, 0, 1), 4);
  }
}

function drawBullet(b) {
  shadow(b.x, b.y, b.r * 0.8, 0.2);
  at(b.x, b.y, b.z, (c) => {
    const a = Math.atan2(b.vy * YK, b.vx);
    if (b.id === 'stapler') { c.rotate(a); c.fillStyle = '#eceff1'; c.fillRect(-7, -1.5, 14, 3); c.fillRect(-7, -1.5, 2, 5); c.fillRect(5, -1.5, 2, 5); }
    else if (b.id === 'keyboard') { c.rotate(b.spin + b.t * 14); c.fillStyle = '#eceff1'; rr(c, -4.5, -4.5, 9, 9, 2); c.fillStyle = '#455a64'; c.fillRect(-1.5, -1.5, 3, 3); }
    else if (b.id === 'coffee') { c.rotate(b.t * 9); drawWeapon(c, 'coffee', 1.15); }
    else if (b.id === 'plane') { c.rotate(a); drawWeapon(c, 'plane', 1.15); }
    else { c.rotate(b.t * 16); drawWeapon(c, 'book', 1.15); }
  });
}

function drawPickup(k) {
  const bobz = 34 + Math.sin(k.t * 4) * 4;
  shadow(k.x, k.y, 16, 0.25);
  if (k.kind === 'weapon') {
    at(k.x, k.y, 0, (c) => {
      c.fillStyle = '#b98b5a'; rr(c, -15, -20, 30, 20, 2);
      c.fillStyle = '#d2a679'; c.beginPath(); c.moveTo(-15, -20); c.lineTo(-10, -27); c.lineTo(20, -27); c.lineTo(15, -20); c.fill();
      c.fillStyle = '#f5e6c8'; c.fillRect(-3, -27, 6, 27);
    });
    at(k.x, k.y, bobz + 14, (c) => {
      c.fillStyle = 'rgba(255,213,79,0.25)'; circ(c, 0, 0, 16 + Math.sin(k.t * 5) * 2);
      drawWeapon(c, k.id, 1.3);
    });
  } else {
    at(k.x, k.y, k.big ? 4 + Math.abs(Math.sin(k.t * 3)) * 6 : 2, (c) => {
      const s = k.big ? 1.25 : 0.9;
      c.scale(s, s);
      c.fillStyle = '#f8e1c4'; c.beginPath(); c.moveTo(-8, -22); c.lineTo(8, -22); c.lineTo(6, 0); c.lineTo(-6, 0); c.fill();
      c.fillStyle = '#3e2723'; for (let i = 0; i < 3; i++) circ(c, -3.5 + i * 3.5, -3.5, 1.7);
      c.fillStyle = '#ef9a9a'; rr(c, -9, -25, 18, 4, 2);
      c.strokeStyle = '#66bb6a'; c.lineWidth = 2.5; seg(c, 2, -24, 5, -36);
    });
  }
}

function render() {
  const f = FLOORS[G.floor], th = f.theme, S = View.S, p = G.player;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070b';
  ctx.fillRect(0, 0, View.W, View.H);
  View.ox = rand(-1, 1) * View.shake; View.oy = rand(-1, 1) * View.shake;
  th.sign = T('fl_' + f.boss);
  drawFloor(th);
  drawBackWall(th, G.t, G.doorOpen);

  // ground decals
  const rv = G.rv;
  if (rv && rv.mode === 'count') {
    const u = 1 - rv.t / f.count;
    ctx.fillStyle = `rgba(255,30,60,${0.08 + 0.2 * u + Math.sin(G.t * 12) * 0.03})`;
    ctx.fillRect(sx(0), sy(0), ARENA.w * S, ARENA.h * S * YK);
    for (const z of rv.zones) {
      ctx.fillStyle = 'rgba(40,220,130,0.38)'; groundEllipse(z.x, z.y, z.r); ctx.fill();
      ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 3 + Math.sin(G.t * 10) * 1.5; ctx.stroke();
      ctx.fillStyle = '#eafff3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(20 * S)}px sans-serif`;
      ctx.fillText(T('rv_safe'), sx(z.x), sy(z.y));
    }
  }
  for (const z of G.zones) drawZone(z);
  for (const l of G.lasers) drawLaser(l);
  for (const r of G.rings) {
    const u = r.t / r.life;
    ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - u; ctx.lineWidth = 5 * (1 - u) + 1;
    groundEllipse(r.x, r.y, r.r * (0.4 + 0.6 * u)); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // depth-sorted billboards
  const list = [];
  for (const ob of G.obstacles) list.push([ob.y + ob.d, () => drawDesk(ob, th)]);
  for (const k of G.pickups) list.push([k.y, () => drawPickup(k)]);
  for (const c of G.coworkers) list.push([c.y, () => { shadow(c.x, c.y, 12); at(c.x, c.y, 0, (cc) => drawPerson(cc, Object.assign({}, c.look, { t: c.t, moving: c.moving, face: c.face, scared: c.scared }))); }]);
  for (const e of G.enemies) list.push([e.y, () => drawEnemy(e)]);
  if (G.boss) list.push([G.boss.y, () => drawBoss(G.boss)]);
  if (p && G.state !== 'menu') list.push([p.y, () => drawPlayer(p)]);
  for (const b of G.bullets) list.push([b.y, () => drawBullet(b)]);
  for (const b of G.ebullets) list.push([b.y, () => { shadow(b.x, b.y, b.r * 0.8, 0.2); at(b.x, b.y, b.z, (c) => drawEnemyBullet(c, b)); }]);
  list.sort((a, b) => a[0] - b[0]);
  for (const it of list) it[1]();

  for (const q of G.parts) {
    ctx.globalAlpha = clamp(1 - q.t / q.life, 0, 1);
    ctx.fillStyle = q.color;
    const s = q.size * S;
    ctx.fillRect(sx(q.x) - s / 2, sy(q.y, q.z) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const fl of G.floats) {
    ctx.globalAlpha = clamp((fl.life - fl.t) * 3, 0, 1);
    ctx.font = `900 ${Math.round(fl.size * Math.max(S, 0.75))}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(fl.text, sx(fl.x), sy(fl.y, fl.z));
    ctx.fillStyle = fl.color; ctx.fillText(fl.text, sx(fl.x), sy(fl.y, fl.z));
  }
  ctx.globalAlpha = 1;

  // pointer towards the nearest safe zone
  if (rv && rv.mode === 'count' && p && G.state === 'play') {
    let best = null, bd = 1e9;
    for (const z of rv.zones) { const d = dist(p.x, p.y, z.x, z.y); if (d < bd) { bd = d; best = z; } }
    if (best && bd > best.r) {
      const a = Math.atan2((best.y - p.y) * YK, best.x - p.x);
      ctx.save();
      ctx.translate(sx(p.x) + Math.cos(a) * 58 * S, sy(p.y, 26) + Math.sin(a) * 58 * S);
      ctx.rotate(a);
      ctx.fillStyle = '#69f0ae';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -10); ctx.lineTo(-1, 0); ctx.lineTo(-6, 10); ctx.fill();
      ctx.restore();
    }
  }

  if (G.flash) {
    ctx.fillStyle = `rgba(${G.flash.color},${G.flash.a * (G.flash.t / G.flash.max)})`;
    ctx.fillRect(0, 0, View.W, View.H);
  }
  // vignette
  const vg = ctx.createRadialGradient(View.W / 2, View.H / 2, Math.min(View.W, View.H) * 0.45, View.W / 2, View.H / 2, Math.max(View.W, View.H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, View.W, View.H);

  if (G.state !== 'menu') drawHUD();
}

// ---------- HUD ----------
const FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
function hudText(text, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2.5, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function bar(x, y, w, h, u, color, back = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = back; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, w + 4, h + 4, h / 2 + 2); ctx.fill();
  if (u > 0) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp(u, 0, 1)), h, h / 2); ctx.fill(); }
}

function drawHUD() {
  const W = View.W, H = View.H, p = G.player, f = FLOORS[G.floor];
  const u = clamp(Math.min(W, H) / 720, 0.72, 1.25), narrow = W < 760, pad = 14 * u;
  // HP + dash
  const hw = (narrow ? 130 : 210) * u;
  bar(pad, pad, hw, 15 * u, p.hp / p.maxhp, p.hp / p.maxhp > 0.3 ? '#ef5350' : '#ff1744');
  hudText('♥ ' + Math.ceil(p.hp) + '/' + p.maxhp, pad + 8 * u, pad + 8 * u, 11 * u, '#fff');
  const dc = 1 - clamp(p.dashCd / (1.1 * p.perks.dashCd), 0, 1);
  bar(pad, pad + 24 * u, hw * 0.5, 6 * u, dc, dc >= 1 ? '#9fa8da' : '#5c6bc0');
  hudText(T('dash'), pad + hw * 0.5 + 8 * u, pad + 27 * u, 10 * u, dc >= 1 ? '#c5cae9' : '#7986cb');
  hudText(`${G.floor + 1}F · ${T('fl_' + f.boss)}`, pad, pad + 46 * u, 11 * u, f.theme.neon);

  // headcount ticker
  hudText(T('headcount'), W - pad, pad + 4 * u, 10 * u, '#b0bec5', 'right');
  hudText(G.headcount.toLocaleString('en-US'), W - pad, pad + 23 * u, 22 * u, G.hcDelta && G.hcDelta.n < 0 ? '#ff8a80' : '#fff', 'right', 900);
  if (G.hcDelta) {
    ctx.globalAlpha = clamp(G.hcDelta.t, 0, 1);
    hudText(G.hcDelta.text || G.hcDelta.n.toLocaleString('en-US'), W - pad, pad + 44 * u, 13 * u, G.hcDelta.n < 0 ? '#ff5252' : '#69f0ae', 'right');
    ctx.globalAlpha = 1;
  }
  hudText(T('score') + ' ' + G.score.toLocaleString('en-US'), W - pad, pad + (G.hcDelta ? 62 : 46) * u, 11 * u, '#ffd54f', 'right');

  // centre: review status or boss bar
  const cyTop = narrow ? pad + 74 * u : pad + 6 * u;
  const b = G.boss, rv = G.rv;
  if (b && !b.gone) {
    const bw = narrow ? W - pad * 2 : Math.min(W * 0.42, 520), bx = (W - bw) / 2;
    hudText(T('n_' + b.id), W / 2, cyTop, 14 * u, '#fff', 'center', 900);
    bar(bx, cyTop + 13 * u, bw, 12 * u, b.hp / b.maxhp, f.theme.neon);
    hudText(T('t_' + b.id), W / 2, cyTop + 37 * u, 10 * u, '#cfd8dc', 'center', 600);
    if (b.def.phaseAt) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (const ph of b.def.phaseAt) ctx.fillRect(bx + bw * ph - 1, cyTop + 13 * u, 2, 12 * u);
    }
  } else if (rv) {
    hudText(T('rv_title', rv.round, rv.total), W / 2, cyTop, 14 * u, '#fff', 'center', 900);
    if (rv.mode === 'calm') hudText(T('rv_in', Math.ceil(rv.t)), W / 2, cyTop + 20 * u, 11 * u, '#b0bec5', 'center', 600);
  }
  if (rv && rv.mode === 'count') {
    const n = Math.max(1, Math.ceil(rv.t)), pulse = 1 + (rv.t % 1) * 0.25;
    hudText(String(n), W / 2, H * 0.2 + (narrow ? 50 * u : 0), 70 * u * pulse, '#ff5277', 'center', 900);
    hudText(T('rv_go'), W / 2, H * 0.2 + (narrow ? 50 * u : 0) + 56 * u, 20 * u, '#69f0ae', 'center', 900);
  }

  // weapons
  const sw = 54 * u, gap = 8 * u, n = p.weapons.length, x0 = (W - (n * sw + (n - 1) * gap)) / 2, wy = H - sw - pad - (Input.touch ? 6 * u : 0);
  p.weapons.forEach((w, i) => {
    const x = x0 + i * (sw + gap), on = i === p.wi;
    ctx.fillStyle = on ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)';
    ctx.strokeStyle = on ? '#ffd54f' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = on ? 2.5 : 1;
    ctx.beginPath(); ctx.roundRect(x, wy, sw, sw, 10 * u); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(x + sw / 2, wy + sw / 2 - 3 * u); drawWeapon(ctx, w.id, 1.7 * u); ctx.restore();
    hudText(w.ammo === Infinity ? '∞' : String(w.ammo), x + sw - 6 * u, wy + sw - 9 * u, 11 * u, '#fff', 'right');
    if (!Input.touch) hudText(String(i + 1), x + 7 * u, wy + 10 * u, 9 * u, '#90a4ae');
  });
  if (n) hudText(T('w_' + p.weapons[p.wi].id), W / 2, wy - 12 * u, 11 * u, '#ffd54f', 'center');

  // banner
  const bn = G.banner;
  if (bn) {
    const a = clamp(Math.min(bn.t * 4, (bn.dur - bn.t) * 3), 0, 1);
    ctx.globalAlpha = a;
    const by = H * 0.36, size = Math.min(52 * u, (W * 1.5) / Math.max(8, bn.title.length));
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, by - size * 0.85, W, size * 1.7 + (bn.sub ? 26 * u : 0));
    ctx.fillStyle = bn.color; ctx.fillRect(0, by - size * 0.85, W, 3); ctx.fillRect(0, by + size * 0.85 + (bn.sub ? 26 * u : 0) - 3, W, 3);
    hudText(bn.title, W / 2 + (1 - a) * -30, by, size, bn.color, 'center', 900);
    if (bn.sub) hudText(bn.sub, W / 2 + (1 - a) * 30, by + size * 0.75 + 6 * u, 16 * u, '#fff', 'center', 600);
    ctx.globalAlpha = 1;
  }

  // touch sticks
  for (const s of [Input.lstick, Input.rstick]) {
    if (!s) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.ox, s.oy, 44, 0, TAU); ctx.stroke();
    const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy) || 1, k = Math.min(m, 44) / m;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(s.ox + dx * k, s.oy + dy * k, 20, 0, TAU); ctx.fill();
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
function statsHTML() {
  const rows = [['st_score', G.score.toLocaleString('en-US')], ['st_time', fmtTime(G.runTime)], ['st_kills', G.kills], ['st_saved', G.saved], ['st_headcount', G.headcount.toLocaleString('en-US')], ['st_deaths', G.deaths]];
  return `<div class="stats">${rows.map(([k, v]) => `<div><span>${T(k)}</span><b>${v}</b></div>`).join('')}</div>`;
}

function showTitle() {
  G.state = 'menu';
  G.floor = 0;
  resetArena();
  G.obstacles = FLOORS[0].desks.map((d) => Object.assign({}, d));
  G.player = makePlayer();
  for (let k = 0; k < 10; k++) { const s = freeSpot(); spawnCoworker(s.x, s.y); }
  UI.show(() => `
    <div class="kicker">${T('kicker')}</div>
    <h1>${T('title')}</h1>
    <h2>${T('title2')}</h2>
    <p class="tag">${T('tagline')}</p>
    <button class="big" data-act="story">${T('start')}</button>
    <p class="ctl">${T('ctl_desktop')}<br>${T('ctl_touch')}</p>
    ${optRow()}
    <p class="disc">${T('disclaimer')}</p>`);
}
function showStory() {
  UI.show(() => `
    <div class="kicker">${T('story_h')}</div>
    <p class="story">${T('story1')}</p><p class="story">${T('story2')}</p><p class="story hi">${T('story3')}</p>
    <button class="big" data-act="go">${T('go')}</button>`);
}
function showPerks() {
  G.state = 'perk';
  const p = G.player;
  p.hp = Math.min(p.maxhp, p.hp + 35);
  const picks = shuffle(PERKS.slice()).slice(0, 3);
  G.perkPicks = picks;
  UI.show(() => `
    <div class="kicker">${T('perk_title')} · ${G.floor + 1}/${FLOORS.length}</div>
    <h3>${T('perk_sub')}</h3>
    <div class="perks">${picks.map((k, i) => `<button class="perk" data-act="perk" data-i="${i}"><span class="ic">${k.icon}</span><b>${T('perk_' + k.id + '_n')}</b><small>${T('perk_' + k.id + '_d')}</small></button>`).join('')}</div>`);
}
function showDead() {
  if (G.state !== 'dead') return;
  const line = pick(['dead1', 'dead2', 'dead3']);
  UI.show(() => `
    <div class="kicker">${G.floor + 1}F · ${T('fl_' + FLOORS[G.floor].boss)}</div>
    <h1 class="red">${T('dead_title')}</h1>
    <p class="story">${T(line)}</p>
    ${statsHTML()}
    <button class="big" data-act="retry">${T('retry')}</button>
    <button class="ghost" data-act="menu">${T('menu')}</button>`);
}
function showWin() {
  G.state = 'win';
  Sfx.play('win');
  UI.show(() => `
    <div class="kicker">5/5</div>
    <h1 class="green">${T('win_title')}</h1>
    <p class="story">${T('win_sub')}</p>
    ${statsHTML()}
    <p class="disc">${T('win_twist')}</p>
    <button class="big" data-act="go">${T('again')}</button>
    <button class="ghost" data-act="menu">${T('menu')}</button>`);
}
function showPause() {
  G.state = 'paused';
  UI.show(() => `
    <h1>${T('paused')}</h1>
    <p class="ctl">${T('ctl_desktop')}<br>${T('ctl_touch')}</p>
    <button class="big" data-act="resume">${T('resume')}</button>
    ${optRow()}
    <button class="ghost" data-act="menu">${T('menu')}</button>`);
}

function onAction(act, el) {
  Sfx.init();
  Sfx.play('ui');
  if (act === 'story') showStory();
  else if (act === 'go') startRun(0);
  else if (act === 'lang') { LANG.zh = !LANG.zh; UI.refresh(); }
  else if (act === 'mute') { Sfx.muted = !Sfx.muted; UI.refresh(); }
  else if (act === 'retry') retryFloor();
  else if (act === 'menu') showTitle();
  else if (act === 'resume') { G.state = 'play'; UI.hide(); }
  else if (act === 'perk') {
    const k = G.perkPicks[+el.dataset.i];
    k.apply(G.player);
    G.player.perks.taken.push(k.id);
    G.state = 'play';
    UI.hide();
    startFloor(G.floor + 1);
  }
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
  if (G.state === 'play') update(dt);
  else if (G.state === 'menu') {
    updateCoworkers(dt); updateFx(dt);
    updateCamera(dt, ARENA.w / 2 + Math.sin(G.t * 0.25) * 320, ARENA.h * 0.45 + Math.cos(G.t * 0.2) * 160);
  } else if (G.state === 'dead') updateFx(dt);
  else if (G.state === 'paused' && Input.take('Escape')) { G.state = 'play'; UI.hide(); }
  render();
  requestAnimationFrame(frame);
}

function boot() {
  canvas = document.getElementById('cv');
  ctx = canvas.getContext('2d');
  UI.el = document.getElementById('ui');
  Input.init(canvas);
  resize();
  addEventListener('resize', resize);
  UI.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) onAction(b.dataset.act, b);
  });
  for (const [id, key] of [['tb-dash', 'dashBtn'], ['tb-swap', 'swapBtn'], ['tb-pause', 'pauseBtn']]) {
    const el = document.getElementById(id);
    const press = (e) => { e.preventDefault(); Input.pressed[key] = true; };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('mousedown', press);
  }
  canvas.addEventListener('pointerdown', () => Sfx.init());
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') showPause(); });
  showTitle();
  View.cam.x = ARENA.w / 2; View.cam.y = ARENA.h * 0.45;
  // ?floor=3 jumps straight to a floor, ?floor=3&boss=1 straight to its boss (handy for testing)
  const q = new URLSearchParams(location.search);
  if (q.has('floor')) {
    startRun(clamp(parseInt(q.get('floor'), 10) - 1 || 0, 0, FLOORS.length - 1));
    if (q.has('boss')) startBossIntro();
  }
  requestAnimationFrame(frame);
}
addEventListener('DOMContentLoaded', boot);
