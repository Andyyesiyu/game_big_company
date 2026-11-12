'use strict';
// ---------- shared game state ----------
const G = {
  state: 'menu', phase: '', phaseT: 0, floor: 0, t: 0, runTime: 0,
  player: null, boss: null, rv: null,
  enemies: [], bullets: [], ebullets: [], zones: [], lasers: [], pickups: [],
  parts: [], floats: [], rings: [], coworkers: [], obstacles: [],
  headcount: 10000, hcDelta: null, score: 0, kills: 0, saved: 0, deaths: 0,
  flash: null, banner: null, doorOpen: 0, spawnT: 0, crateT: 0, hpScale: 1, boomCd: 0,
};

const WEAPONS = {
  stapler: { cd: 0.2, dmg: 10, speed: 780, ammo: Infinity },
  keyboard: { cd: 0.55, dmg: 8, speed: 700, ammo: 36, pellets: 6, spread: 0.5 },
  coffee: { cd: 0.75, dmg: 42, speed: 440, ammo: 14, aoe: 88 },
  plane: { cd: 0.3, dmg: 20, speed: 920, ammo: 32, pierce: 4 },
  book: { cd: 0.9, dmg: 34, speed: 640, ammo: 12 },
};
const WEAPON_IDS = ['keyboard', 'coffee', 'plane', 'book'];

const ENEMY = {
  hr: { hp: 34, speed: 122, r: 14, dmg: 10, score: 10, kind: 'chaser' },
  penguin: { hp: 20, speed: 165, r: 12, dmg: 8, score: 8, kind: 'hopper' },
  drone: { hp: 24, speed: 92, r: 13, dmg: 9, score: 14, kind: 'shooter' },
  manager: { hp: 110, speed: 72, r: 19, dmg: 16, score: 30, kind: 'tank' },
  agent: { hp: 10, speed: 215, r: 9, dmg: 6, score: 5, kind: 'chaser' },
};

// ---------- fx ----------
function part(x, y, z, o) {
  if (G.parts.length > 800) return;
  G.parts.push(Object.assign({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.6, t: 0, color: '#fff', size: 3, grav: 500 }, o));
}
function burst(x, y, z, n, colors, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(o.sp || 170);
    part(x, y, z, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(40, o.up || 230),
      life: rand(0.3, o.life || 0.7), color: pick(colors), size: rand(2, o.size || 4.5),
      grav: o.grav === undefined ? 520 : o.grav,
    });
  }
}
// Disintegration: specks peel off and drift up and away.
function dust(x, y, h, colors, n = 28) {
  for (let i = 0; i < n; i++) {
    part(x + rand(-12, 12), y + rand(-5, 5), rand(0, h), {
      vx: rand(20, 160), vy: rand(-40, 10), vz: rand(10, 100),
      life: rand(0.6, 1.6), color: pick(colors), size: rand(2, 5), grav: -25,
    });
  }
}
function floater(x, y, z, text, color = '#fff', size = 16, life = 1) {
  G.floats.push({ x, y, z, text, color, size, life, t: 0 });
}
function ring(x, y, r, color, life = 0.35) {
  G.rings.push({ x, y, r, color, life, t: 0 });
}
function banner(title, sub = '', dur = 2.2, color = '#fff') {
  G.banner = { title, sub, t: 0, dur, color };
}
// `weight` is roughly "people out of 12,000": cuts scale with whoever is left, so the ticker never quite hits zero.
function layoff(weight) {
  const n = Math.min(G.headcount - 1, Math.max(1, Math.round((G.headcount * weight) / 12000)));
  if (n <= 0) return;
  G.headcount -= n;
  G.hcDelta = { n: -n, t: 1.6 };
}

// ---------- collision ----------
function pushOut(e, ignoreDesks) {
  if (!ignoreDesks) {
    for (const ob of G.obstacles) {
      const cx = clamp(e.x, ob.x, ob.x + ob.w), cy = clamp(e.y, ob.y, ob.y + ob.d);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= e.r * e.r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * e.r; e.y = cy + (dy / d) * e.r;
      } else {
        const l = e.x - ob.x, r = ob.x + ob.w - e.x, t = e.y - ob.y, b = ob.y + ob.d - e.y;
        const m = Math.min(l, r, t, b);
        if (m === l) e.x = ob.x - e.r; else if (m === r) e.x = ob.x + ob.w + e.r;
        else if (m === t) e.y = ob.y - e.r; else e.y = ob.y + ob.d + e.r;
      }
    }
  }
  e.x = clamp(e.x, e.r, ARENA.w - e.r);
  e.y = clamp(e.y, e.r + 6, ARENA.h - e.r);
}
function inObstacle(x, y, pad = 0) {
  for (const ob of G.obstacles) {
    if (x > ob.x - pad && x < ob.x + ob.w + pad && y > ob.y - pad && y < ob.y + ob.d + pad) return ob;
  }
  return null;
}
function freeSpot(minD = 0, maxD = 1e9) {
  const p = G.player;
  let x = 0, y = 0;
  for (let i = 0; i < 60; i++) {
    x = rand(90, ARENA.w - 90); y = rand(130, ARENA.h - 90);
    if (inObstacle(x, y, 34)) continue;
    const d = p ? dist(x, y, p.x, p.y) : minD;
    if (d >= minD && d <= maxD) break;
  }
  return { x, y };
}

// ---------- player ----------
function makePlayer() {
  return {
    x: ARENA.w / 2, y: ARENA.h * 0.78, z: 0, r: 14, hp: 100, maxhp: 100, speed: 255,
    aim: -Math.PI / 2, aimD: 260, t: 0, moving: false, face: 1, vx: 0, vy: 0,
    dashT: 0, dashCd: 0, dashDir: { x: 1, y: 0 }, inv: 0, hurtT: 0, fireCd: 0,
    weapons: [{ id: 'stapler', ammo: Infinity }], wi: 0,
    perks: { dmg: 1, rate: 1, speed: 1, dashCd: 1, ammo: 1, lifesteal: 0, taken: [] },
  };
}

function hurtPlayer(d, force) {
  const p = G.player;
  if (G.state !== 'play' || (G.phase !== 'review' && G.phase !== 'boss')) return false;
  if (p.hp <= 0 || p.inv > 0 || (p.dashT > 0 && !force)) return false;
  p.hp -= d;
  p.inv = 0.6; p.hurtT = 0.3;
  View.shake = Math.max(View.shake, 9);
  G.flash = { color: '255,40,40', t: 0.25, max: 0.25, a: 0.28 };
  Sfx.play('hurt');
  floater(p.x, p.y, 70, '-' + Math.round(d), '#ff5252', 18);
  if (p.hp <= 0) { p.hp = 0; playerDie(); }
  return true;
}
function healPlayer(n) {
  const p = G.player;
  const before = p.hp;
  p.hp = Math.min(p.maxhp, p.hp + n);
  if (p.hp > before) floater(p.x, p.y, 70, '+' + Math.round(p.hp - before), '#69f0ae', 16);
}

function giveWeapon(id) {
  const p = G.player, cap = Math.round(WEAPONS[id].ammo * p.perks.ammo);
  let w = p.weapons.find((k) => k.id === id);
  if (w) w.ammo = Math.min(cap * 2, w.ammo + cap);
  else { w = { id, ammo: cap }; p.weapons.push(w); p.wi = p.weapons.length - 1; }
  floater(p.x, p.y, 80, T('w_' + id) + ' +' + cap, '#ffd54f', 16, 1.4);
}

function nearestTarget(x, y, range) {
  let best = null, bd = range;
  for (const e of G.enemies) {
    if (e.spawnT > 0) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  const b = G.boss;
  if (b && !b.gone && !b.down && G.phase === 'boss') {
    const d = dist(x, y, b.x, b.y);
    if (d < bd + 80 && (!best || d < bd)) best = b;
  }
  return best;
}

function switchWeapon(p, dir) {
  p.wi = (p.wi + dir + p.weapons.length) % p.weapons.length;
  Sfx.play('ui');
}

function updatePlayer(dt) {
  const p = G.player;
  p.t += dt;
  p.inv = Math.max(0, p.inv - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.fireCd -= dt; p.dashCd -= dt;
  const mv = Input.moveVec();
  let fire = false;
  if (Input.touch) {
    const rs = Input.rstick;
    if (rs && Math.hypot(rs.x - rs.ox, rs.y - rs.oy) > 12) {
      p.aim = Math.atan2((rs.y - rs.oy) / YK, rs.x - rs.ox);
      p.aimD = 260; fire = true;
    } else {
      const tg = nearestTarget(p.x, p.y, 540);
      if (tg) { p.aim = angTo(p.x, p.y, tg.x, tg.y); p.aimD = dist(p.x, p.y, tg.x, tg.y); fire = true; }
      else if (mv.x || mv.y) p.aim = Math.atan2(mv.y, mv.x);
    }
  } else {
    const w = screenToWorld(Input.mouse.x, Input.mouse.y, 26);
    p.aim = angTo(p.x, p.y, w.x, w.y);
    p.aimD = dist(p.x, p.y, w.x, w.y);
    fire = Input.mouse.down || Input.keys.KeyJ;
  }
  p.face = Math.cos(p.aim) >= 0 ? 1 : -1;

  const wantDash = Input.take('Space') | Input.take('ShiftLeft') | Input.take('ShiftRight') | Input.take('dashBtn');
  if (wantDash && p.dashCd <= 0) {
    const m = Math.hypot(mv.x, mv.y);
    p.dashDir = m > 0.1 ? { x: mv.x / m, y: mv.y / m } : { x: Math.cos(p.aim), y: Math.sin(p.aim) };
    p.dashT = 0.2;
    p.dashCd = 1.1 * p.perks.dashCd;
    Sfx.play('dash');
  }
  let vx, vy;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashDir.x * 820; vy = p.dashDir.y * 820;
    part(p.x, p.y, rand(8, 40), { vx: -vx * 0.1, vy: -vy * 0.1, life: 0.25, color: '#9fa8da', size: 5, grav: 0 });
  } else {
    const sp = p.speed * p.perks.speed;
    vx = mv.x * sp; vy = mv.y * sp;
  }
  p.vx = vx; p.vy = vy;
  p.x += vx * dt; p.y += vy * dt;
  p.moving = Math.hypot(mv.x, mv.y) > 0.1;
  pushOut(p);

  for (let i = 0; i < 5; i++) {
    if (Input.take('Digit' + (i + 1)) && p.weapons[i]) { p.wi = i; Sfx.play('ui'); }
  }
  if (Input.take('KeyQ')) switchWeapon(p, -1);
  if (Input.take('KeyE') || Input.take('swapBtn')) switchWeapon(p, 1);
  if (Input.wheel) { switchWeapon(p, Input.wheel > 0 ? 1 : -1); Input.wheel = 0; }

  if (fire && p.fireCd <= 0) fireWeapon(p);
}

function fireWeapon(p) {
  const w = p.weapons[p.wi], d = WEAPONS[w.id];
  p.fireCd = d.cd / p.perks.rate;
  const ox = p.x + Math.cos(p.aim) * 20, oy = p.y + Math.sin(p.aim) * 20, dm = d.dmg * p.perks.dmg;
  const mk = (ang, o, sm = 1) => G.bullets.push(Object.assign({
    id: w.id, x: ox, y: oy, z: 26, vx: Math.cos(ang) * d.speed * sm, vy: Math.sin(ang) * d.speed * sm,
    r: 6, dmg: dm, life: 1.3, t: 0, pierce: 0, hit: null,
  }, o));
  if (w.id === 'stapler') { mk(p.aim + rand(-0.03, 0.03)); Sfx.play('shoot'); }
  else if (w.id === 'keyboard') {
    for (let i = 0; i < d.pellets; i++) mk(p.aim + rand(-d.spread / 2, d.spread / 2), { life: rand(0.34, 0.52), r: 5, spin: rand(TAU) }, rand(0.8, 1.1));
    Sfx.play('keys');
  } else if (w.id === 'coffee') {
    const D = clamp(p.aimD || 260, 110, 440);
    mk(p.aim, { lob: true, T: D / d.speed, r: 8, life: 9 });
    Sfx.play('lob');
  } else if (w.id === 'plane') { mk(p.aim, { pierce: d.pierce, hit: new Set(), r: 8 }); Sfx.play('plane'); }
  else if (w.id === 'book') { mk(p.aim, { boom: true, hit: new Set(), r: 13, life: 9, pierce: 999 }); Sfx.play('book'); }
  if (w.ammo !== Infinity && --w.ammo <= 0) {
    p.weapons.splice(p.wi, 1);
    p.wi = 0;
    floater(p.x, p.y, 80, T('out_of_ammo'), '#b0bec5', 14);
  }
}

// ---------- player projectiles ----------
function coffeeSplash(b) {
  const aoe = WEAPONS.coffee.aoe;
  ring(b.x, b.y, aoe, '#8d6e63');
  burst(b.x, b.y, 4, 18, ['#6d4c41', '#8d6e63', '#d7ccc8'], { sp: 220, up: 200 });
  View.shake = Math.max(View.shake, 4);
  Sfx.play('boom');
  for (const e of G.enemies) {
    if (e.spawnT <= 0 && dist(b.x, b.y, e.x, e.y) < aoe + e.r) damageEnemy(e, b.dmg, b);
  }
  const bs = G.boss;
  if (bs && G.phase === 'boss' && dist(b.x, b.y, bs.x, bs.y) < aoe + bs.r) damageBoss(bs, b.dmg);
}

function damageEnemy(e, d, b) {
  e.hp -= d;
  e.flash = 0.09;
  if (b && !b.lob) { const m = Math.hypot(b.vx, b.vy) || 1; e.kx += (b.vx / m) * 120; e.ky += (b.vy / m) * 120; }
  if (e.hp <= 0 && !e.dead) killEnemy(e, true);
  else Sfx.play('hit');
}
function killEnemy(e, byPlayer) {
  e.dead = true;
  const cols = { hr: ['#ec407a', '#f8bbd0'], penguin: ['#14161c', '#fafafa', '#f5a623'], drone: ['#37474f', '#ff5252'], manager: ['#546e7a', '#c62828'], agent: ['#00bfa5', '#b9f6ca'] }[e.type];
  burst(e.x, e.y, 20 + e.z, 14, cols);
  if (!byPlayer) return;
  Sfx.play('kill');
  G.kills++;
  G.score += e.def.score;
  const p = G.player;
  if (p.perks.lifesteal) healPlayer(p.perks.lifesteal);
  if (rand() < 0.09) G.pickups.push({ kind: 'tea', x: e.x, y: e.y, t: 0, heal: 14 });
}

function updateBullets(dt) {
  const p = G.player, boss = G.boss;
  for (const b of G.bullets) {
    b.t += dt;
    if (b.lob) {
      const u = b.t / b.T;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.z = 26 * (1 - u) + 340 * u * (1 - u);
      if (u >= 1) { coffeeSplash(b); b.dead = true; }
      continue;
    }
    if (b.boom) {
      if (!b.ret) {
        const k = Math.max(0, 1 - b.t / 0.5);
        b.x += b.vx * k * dt; b.y += b.vy * k * dt;
        if (b.t > 0.5) { b.ret = true; b.hit.clear(); }
      } else {
        const a = angTo(b.x, b.y, p.x, p.y);
        b.vx = Math.cos(a) * 720; b.vy = Math.sin(a) * 720;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (dist(b.x, b.y, p.x, p.y) < 26) b.dead = true;
      }
      b.x = clamp(b.x, 8, ARENA.w - 8); b.y = clamp(b.y, 8, ARENA.h - 8);
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t > b.life || b.x < 0 || b.x > ARENA.w || b.y < 0 || b.y > ARENA.h) { b.dead = true; continue; }
      if (inObstacle(b.x, b.y)) {
        b.dead = true;
        burst(b.x, b.y, 26, 3, ['#cfd8dc'], { sp: 80, up: 80, life: 0.3 });
        continue;
      }
    }
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.dead || dist(b.x, b.y, e.x, e.y) > e.r + b.r + 2) continue;
      if (b.hit) { if (b.hit.has(e)) continue; b.hit.add(e); }
      damageEnemy(e, b.dmg, b);
      if (b.pierce > 0) b.pierce--; else { b.dead = true; break; }
    }
    if (b.dead || !boss || boss.gone || boss.down || G.phase !== 'boss') continue;
    if (boss.orbs) {
      let blocked = false;
      for (let i = 0; i < boss.orbs; i++) {
        const a = boss.orbA + (i / boss.orbs) * TAU;
        if (dist(b.x, b.y, boss.x + Math.cos(a) * 62, boss.y + Math.sin(a) * 62) < 17 + b.r) { blocked = true; break; }
      }
      if (blocked) {
        burst(b.x, b.y, 26, 4, ['#ffcc80', '#fff'], { sp: 90, up: 90, life: 0.3 });
        if (b.boom) { if (!b.ret) { b.ret = true; b.hit.clear(); } } else b.dead = true;
        continue;
      }
    }
    if (dist(b.x, b.y, boss.x, boss.y) < boss.r + b.r) {
      if (boss.reflect > 0 && !b.boom) {
        b.dead = true;
        eb(b.x, b.y, angTo(b.x, b.y, p.x, p.y) + rand(-0.25, 0.25), 330, { dmg: 8, color: '#ffd180', r: 6 });
        continue;
      }
      if (b.hit) { if (b.hit.has(boss)) continue; b.hit.add(boss); }
      damageBoss(boss, b.dmg);
      if (b.pierce > 0) b.pierce--; else b.dead = true;
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
}

// ---------- enemies ----------
function spawnEnemy(type, x, y) {
  const d = ENEMY[type];
  const e = {
    type, def: d, x, y, z: 0, r: d.r, hp: d.hp * G.hpScale, t: rand(10), spawnT: 0.6,
    atkCd: rand(0.3, 0.8), shootCd: rand(1.2, 2.6), face: 1, flash: 0, kx: 0, ky: 0, strafe: pick([-1, 1]),
  };
  e.maxhp = e.hp;
  G.enemies.push(e);
  return e;
}
function spawnAtEdge(type) {
  const p = G.player;
  let x = 0, y = 0;
  for (let i = 0; i < 30; i++) {
    const side = randi(0, 3);
    if (side === 0) { x = rand(60, ARENA.w - 60); y = 40; }
    else if (side === 1) { x = rand(60, ARENA.w - 60); y = ARENA.h - 40; }
    else if (side === 2) { x = 40; y = rand(60, ARENA.h - 60); }
    else { x = ARENA.w - 40; y = rand(60, ARENA.h - 60); }
    if (dist(x, y, p.x, p.y) > 340 && !inObstacle(x, y, 20)) break;
  }
  return spawnEnemy(type, x, y);
}

function updateEnemies(dt) {
  const p = G.player;
  for (const e of G.enemies) {
    e.t += dt; e.flash -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    const d = dist(e.x, e.y, p.x, p.y), a = angTo(e.x, e.y, p.x, p.y), k = e.def.kind;
    e.face = p.x >= e.x ? 1 : -1;
    let sp = e.def.speed, mx = Math.cos(a), my = Math.sin(a);
    if (k === 'hopper') {
      const ph = (e.t * 2.2) % 1;
      e.z = Math.sin(Math.min(1, ph / 0.75) * Math.PI) * 16;
      sp *= ph < 0.75 ? 1.3 : 0.15;
    } else if (k === 'shooter') {
      e.z = 34 + Math.sin(e.t * 3) * 4;
      const radial = d > 340 ? 1 : d < 260 ? -1 : 0;
      const tx = -my * e.strafe, ty = mx * e.strafe;
      mx = mx * radial + tx * 0.7; my = my * radial + ty * 0.7;
      if (rand() < dt * 0.3) e.strafe *= -1;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 580) {
        e.shootCd = rand(1.9, 2.7);
        eb(e.x, e.y, a, 235, { dmg: 9, color: '#ff5252', r: 7 });
      }
    } else if (k === 'tank') {
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 640) {
        e.shootCd = 3.4;
        for (const o of [-0.28, 0, 0.28]) eb(e.x, e.y, a + o, 250, { dmg: 10, shape: 'invite', r: 8 });
      }
    }
    e.x += (mx * sp + e.kx) * dt; e.y += (my * sp + e.ky) * dt;
    const damp = Math.pow(0.002, dt);
    e.kx *= damp; e.ky *= damp;
    e.atkCd -= dt;
    if (k !== 'shooter' && d < e.r + p.r + 5 && e.atkCd <= 0 && hurtPlayer(e.def.dmg)) e.atkCd = 0.9;
    pushOut(e, k === 'shooter');
  }
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push;
      b.x += (dx / d) * push; b.y += (dy / d) * push;
    }
  }
  G.enemies = es.filter((e) => !e.dead);
}

// ---------- hazards: bullets, zones, lasers ----------
function eb(x, y, ang, speed, o) {
  if (G.ebullets.length > 420) return;
  G.ebullets.push(Object.assign({
    x, y, z: 24, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    r: 8, dmg: 10, color: '#ff5252', shape: 'orb', life: 6, t: 0,
  }, o));
}
function zone(x, y, r, delay, o) {
  G.zones.push(Object.assign({ kind: 'circle', x, y, r, delay, t: 0, dmg: 18, look: 'red', linger: 0.25 }, o));
}
function rectZone(x, y, w, h, delay, o) {
  G.zones.push(Object.assign({ kind: 'rect', x, y, w, h, delay, t: 0, dmg: 18, look: 'red', linger: 0.25 }, o));
}
function laser(owner, a, o) {
  G.lasers.push(Object.assign({ owner, x: owner.x, y: owner.y, a, da: 0, tele: 0.7, life: 2, len: 600, width: 40, dmg: 12, look: 'essay', t: 0 }, o));
}
function clearHazards() {
  G.ebullets = []; G.zones = []; G.lasers = [];
}

function updateEBullets(dt) {
  const p = G.player;
  for (const b of G.ebullets) {
    b.t += dt;
    if (b.homing) {
      const cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
      const na = cur + clamp(angDiff(cur, angTo(b.x, b.y, p.x, p.y)), -b.homing * dt, b.homing * dt);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.split && b.t >= b.split.t) {
      const off = rand(TAU);
      for (let i = 0; i < b.split.n; i++) eb(b.x, b.y, off + (i / b.split.n) * TAU, b.split.speed, { color: b.color, dmg: 9, r: 7 });
      burst(b.x, b.y, 24, 10, [b.color, '#fff']);
      b.dead = true;
      continue;
    }
    if (b.t > b.life || b.x < -20 || b.x > ARENA.w + 20 || b.y < -20 || b.y > ARENA.h + 20) { b.dead = true; continue; }
    if (!b.ghost && inObstacle(b.x, b.y)) { b.dead = true; continue; }
    if (dist(b.x, b.y, p.x, p.y) < b.r + p.r - 3 && hurtPlayer(b.dmg)) b.dead = true;
  }
  G.ebullets = G.ebullets.filter((b) => !b.dead);
}

function inZone(z, x, y, pad = 0) {
  if (z.kind === 'rect') return x > z.x - pad && x < z.x + z.w + pad && y > z.y - pad && y < z.y + z.h + pad;
  return dist(x, y, z.x, z.y) < z.r + pad;
}
const ZONE_FX = {
  snap: ['#ffd54f', '#bf8f30', '#fff3c4', '#8d6e63'],
  rocket: ['#ff7043', '#ffca28', '#5d4037'],
  feed: ['#ff2d6f', '#25f4ee', '#fff'],
  delay: ['#ff2d6f', '#fff'],
  grid: ['#ff8a50', '#ffd180'],
  red: ['#ff5252', '#fff'],
};
function zoneBoom(z) {
  const p = G.player;
  if (inZone(z, p.x, p.y, -3)) hurtPlayer(z.dmg);
  for (const c of G.coworkers) if (!c.dead && inZone(z, c.x, c.y)) dustCoworker(c);
  const cols = ZONE_FX[z.look] || ZONE_FX.red;
  if (z.kind === 'circle') {
    burst(z.x, z.y, 4, 16, cols, { sp: z.r * 2.2, up: 260 });
    ring(z.x, z.y, z.r, cols[0]);
  } else {
    for (let i = 0; i < 26; i++) part(z.x + rand(z.w), z.y + rand(z.h), 2, { vx: rand(-60, 160), vz: rand(60, 240), life: rand(0.4, 1), color: pick(cols), size: rand(2, 5), grav: z.look === 'snap' ? -20 : 400 });
  }
  View.shake = Math.max(View.shake, z.kind === 'rect' ? 9 : 5);
  if (G.boomCd <= 0) { Sfx.play('boom'); G.boomCd = 0.12; }
}
function updateZones(dt) {
  const p = G.player;
  for (const z of G.zones) {
    z.t += dt;
    if (!z.done && z.t >= z.delay) { z.done = true; zoneBoom(z); }
    else if (z.done) {
      if (z.linger > 0.3 && inZone(z, p.x, p.y, -3)) hurtPlayer(z.dmg);
      if (z.t >= z.delay + z.linger) z.dead = true;
    }
  }
  G.zones = G.zones.filter((z) => !z.dead);
}
function updateLasers(dt) {
  const p = G.player;
  for (const l of G.lasers) {
    const o = l.owner;
    l.t += dt; l.x = o.x; l.y = o.y;
    if (o.gone || o.down || o.dead || G.phase !== 'boss') { l.dead = true; continue; }
    if (l.t > l.tele + l.life) { l.dead = true; continue; }
    if (l.t < l.tele) continue;
    l.a += l.da * dt;
    if (!l.dmg) continue;
    const ex = l.x + Math.cos(l.a) * l.len, ey = l.y + Math.sin(l.a) * l.len;
    if (distToSeg(p.x, p.y, l.x, l.y, ex, ey) < l.width / 2 + p.r - 4) hurtPlayer(l.dmg);
    for (const c of G.coworkers) if (!c.dead && distToSeg(c.x, c.y, l.x, l.y, ex, ey) < l.width / 2) dustCoworker(c);
    if (l.look === 'flame') {
      for (let i = 0; i < 3; i++) {
        const d = rand(40, l.len);
        part(l.x + Math.cos(l.a) * d, l.y + Math.sin(l.a) * d, rand(10, 30), { vx: rand(-40, 40), vy: rand(-40, 40), vz: rand(40, 160), life: rand(0.2, 0.5), color: pick(['#ff7043', '#ffca28', '#ff3d00']), size: rand(4, 9), grav: -100 });
      }
    }
  }
  G.lasers = G.lasers.filter((l) => !l.dead);
}

// ---------- pickups ----------
function spawnCrate(forceWeapon) {
  const s = freeSpot(140, 620);
  if (forceWeapon || rand() < 0.62) {
    const owned = G.player.weapons.map((w) => w.id);
    const fresh = WEAPON_IDS.filter((id) => !owned.includes(id));
    const id = fresh.length && rand() < 0.75 ? pick(fresh) : pick(WEAPON_IDS);
    G.pickups.push({ kind: 'weapon', id, x: s.x, y: s.y, t: 0 });
  } else G.pickups.push({ kind: 'tea', x: s.x, y: s.y, t: 0, heal: 28, big: true });
}
function updatePickups(dt) {
  const p = G.player;
  for (const k of G.pickups) {
    k.t += dt;
    if (dist(k.x, k.y, p.x, p.y) > 30) continue;
    if (k.kind === 'tea' && p.hp >= p.maxhp) continue;
    k.dead = true;
    Sfx.play('pickup');
    burst(k.x, k.y, 10, 10, ['#ffd54f', '#fff']);
    if (k.kind === 'weapon') giveWeapon(k.id); else healPlayer(k.heal);
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

// ---------- coworkers (the headcount) ----------
const CW_TOPS = ['#ef5350', '#ab47bc', '#26a69a', '#ffa726', '#8d6e63', '#78909c', '#66bb6a', '#42a5f5'];
const CW_SKIN = ['#f2c9a5', '#e8b796', '#d9a47a', '#c68e62'];
function spawnCoworker(x, y) {
  G.coworkers.push({
    x, y, t: rand(10), face: 1, tx: x, ty: y, wait: rand(2), speed: rand(150, 200), dumb: rand() < 0.15, moving: false,
    look: { top: pick(CW_TOPS), bottom: '#37474f', skin: pick(CW_SKIN), hair: pick(['#1b1b1b', '#3e2723', '#5d4037']), hairStyle: pick(['short', 'side', 'long', 'messy']), glasses: rand() < 0.4 ? '#263238' : null, badge: '#29b6f6' },
  });
}
function dustCoworker(c) {
  c.dead = true;
  dust(c.x, c.y, 60, [c.look.top, c.look.skin, '#d7b98e', '#fff3c4']);
  floater(c.x, c.y, 80, T('optimized'), '#ffab91', 14, 1.3);
  layoff(randi(60, 180));
}
function updateCoworkers(dt) {
  const counting = G.phase === 'review' && G.rv && G.rv.mode === 'count';
  for (const c of G.coworkers) {
    c.t += dt;
    c.scared = counting || G.phase === 'boss';
    if (counting && !c.dumb) {
      let best = null, bd = 1e9;
      for (const z of G.rv.zones) { const d = dist(c.x, c.y, z.x, z.y); if (d < bd) { bd = d; best = z; } }
      if (best && (bd > best.r * 0.55 || !c.inSafe)) { c.tx = best.x + (c.ox || 0) * best.r; c.ty = best.y + (c.oy || 0) * best.r; c.inSafe = bd < best.r * 0.55; }
    } else {
      c.inSafe = false;
      c.wait -= dt;
      if (c.wait <= 0) {
        c.wait = rand(1.5, 4);
        const s = freeSpot();
        c.tx = clamp(c.x + (s.x - c.x) * 0.35, 60, ARENA.w - 60); c.ty = clamp(c.y + (s.y - c.y) * 0.35, 90, ARENA.h - 60);
        c.ox = rand(-0.5, 0.5); c.oy = rand(-0.5, 0.5);
      }
    }
    // most of them have the sense to step out of a telegraphed blast
    let flee = null;
    if (!c.dumb) for (const z of G.zones) if (!z.done && inZone(z, c.x, c.y, 14)) { flee = z; break; }
    if (flee) {
      if (flee.kind === 'circle') { const a = angTo(flee.x, flee.y, c.x, c.y); c.tx = c.x + Math.cos(a) * 70; c.ty = c.y + Math.sin(a) * 70; }
      else if (flee.w > flee.h) { c.tx = c.x; c.ty = c.y - flee.y < flee.h / 2 ? flee.y - 30 : flee.y + flee.h + 30; }
      else { c.ty = c.y; c.tx = c.x - flee.x < flee.w / 2 ? flee.x - 30 : flee.x + flee.w + 30; }
      c.wait = 0.6;
    }
    const d = dist(c.x, c.y, c.tx, c.ty);
    c.moving = d > 6;
    if (c.moving) {
      const a = angTo(c.x, c.y, c.tx, c.ty), sp = c.speed * (counting || flee ? 1.25 : 0.55);
      c.x += Math.cos(a) * sp * dt; c.y += Math.sin(a) * sp * dt;
      c.face = Math.cos(a) >= 0 ? 1 : -1;
      c.r = 12; pushOut(c);
    }
  }
  G.coworkers = G.coworkers.filter((c) => !c.dead);
}

// ---------- ambient fx update ----------
function updateFx(dt) {
  for (const q of G.parts) {
    q.t += dt;
    q.vz -= q.grav * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.z < 0) { q.z = 0; q.vz *= -0.35; q.vx *= 0.6; q.vy *= 0.6; }
  }
  G.parts = G.parts.filter((q) => q.t < q.life);
  for (const f of G.floats) { f.t += dt; f.z += 34 * dt; }
  G.floats = G.floats.filter((f) => f.t < f.life);
  for (const r of G.rings) r.t += dt;
  G.rings = G.rings.filter((r) => r.t < r.life);
  if (G.flash && (G.flash.t -= dt) <= 0) G.flash = null;
  if (G.banner && (G.banner.t += dt) >= G.banner.dur) G.banner = null;
  if (G.hcDelta && (G.hcDelta.t -= dt) <= 0) G.hcDelta = null;
  G.boomCd -= dt;
  View.shake = Math.max(0, View.shake - dt * 30);
}
