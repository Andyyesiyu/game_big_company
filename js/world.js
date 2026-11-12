'use strict';
// ---------- shared game state ----------
const G = {
  state: 'menu', t: 0, time: 0,
  player: null, boss: null, bosses: [], map: null, zone: null,
  enemies: [], bullets: [], ebullets: [], zones: [], lasers: [], pickups: [],
  parts: [], floats: [], rings: [], obstacles: [], containers: [], exits: [], feed: [], wind: [], pets: [],
  total: 30, kills: 0, signed: 0, exT: 0, exitsOpen: false, lastHit: '',
  flash: null, banner: null, boomCd: 0,
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
  hr: { hp: 34, speed: 122, r: 14, dmg: 10, kind: 'chaser' },
  penguin: { hp: 20, speed: 165, r: 12, dmg: 8, kind: 'hopper' },
  drone: { hp: 24, speed: 92, r: 13, dmg: 9, kind: 'shooter' },
  manager: { hp: 110, speed: 72, r: 19, dmg: 16, kind: 'tank' },
  agent: { hp: 10, speed: 215, r: 9, dmg: 6, kind: 'chaser' },
  // the AI products themselves: guards for their makers, and your sidekicks once the boss has signed
  doubao: { hp: 26, speed: 150, r: 13, dmg: 9, kind: 'hopper' },
  crab: { hp: 22, speed: 185, r: 12, dmg: 9, kind: 'chaser', zig: true },
  gpt: { hp: 30, speed: 95, r: 13, dmg: 9, kind: 'shooter', ground: true },
  rival: { r: 14, kind: 'rival' },
};

// Loot you carry out. [key, tier, value]
const VALS = [
  ['v_lanyard', 0, 120], ['v_snack', 0, 180], ['v_chair', 1, 600], ['v_headset', 1, 900],
  ['v_bonus', 2, 2500], ['v_gpu', 2, 4000], ['v_option', 3, 9000], ['v_seat', 4, 22000], ['v_n1', 5, 60000],
];

// The shrinking "optimization circle": hold, then shrink to radius r; dmg is per second outside it.
const ZPH = [
  { hold: 50, shrink: 35, r: 1500, dmg: 3 },
  { hold: 40, shrink: 30, r: 950, dmg: 5 },
  { hold: 35, shrink: 25, r: 520, dmg: 8 },
  { hold: 28, shrink: 22, r: 230, dmg: 12 },
  { hold: 18, shrink: 25, r: 0, dmg: 18 },
];

const POI_DEFS = [
  { id: 'pony', x: 900, y: 1050 }, { id: 'yiming', x: 3500, y: 1050 }, { id: 'dario', x: 2200, y: 2250 },
  { id: 'elon', x: 900, y: 3450 }, { id: 'sam', x: 3500, y: 3450 },
];
const POI_DESKS = {
  pony: [[150, 200, 180, 64], [670, 200, 180, 64], [150, 520, 180, 64], [670, 520, 180, 64]],
  yiming: [[120, 250, 80, 220], [800, 250, 80, 220], [360, 560, 280, 64]],
  elon: [[180, 320, 170, 64], [650, 320, 170, 64], [415, 560, 170, 64]],
  sam: [[230, 250, 110, 110], [660, 250, 110, 110], [230, 510, 110, 110], [660, 510, 110, 110]],
  dario: [[200, 380, 180, 64], [620, 380, 180, 64]],
};
const POI_GUARDS = {
  pony: ['penguin', 'penguin', 'penguin', 'hr'], yiming: ['doubao', 'doubao', 'doubao', 'hr'], elon: ['drone', 'agent', 'agent', 'manager'],
  sam: ['gpt', 'gpt', 'agent', 'agent'], dario: ['crab', 'crab', 'crab', 'manager'],
};
const PET_OF = { yiming: 'doubao', dario: 'crab', sam: 'gpt' };

// ---------- fx ----------
function part(x, y, z, o) {
  if (G.parts.length > 800) return;
  G.parts.push(Object.assign({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.6, t: 0, color: '#fff', size: 3, grav: 500 }, o));
}
function burst(x, y, z, n, colors, o = {}) {
  if (!onScreen(x, y, 300)) return;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(o.sp || 170);
    part(x, y, z, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(40, o.up || 230),
      life: rand(0.3, o.life || 0.7), color: pick(colors), size: rand(2, o.size || 4.5),
      grav: o.grav === undefined ? 520 : o.grav, round: o.round,
    });
  }
}
// A cartoon puff of smoke: what's left when someone is optimized.
function poof(x, y, colors = ['#ffffff', '#efe9ff', '#d9d0f0']) {
  burst(x, y, 24, 14, colors, { sp: 110, up: 120, life: 0.8, size: 13, grav: -60, round: true });
  ring(x, y, 46, '#fff', 0.3);
}
function dust(x, y, h, colors, n = 28) {
  for (let i = 0; i < n; i++) {
    part(x + rand(-12, 12), y + rand(-5, 5), rand(0, h), {
      vx: rand(20, 160), vy: rand(-40, 10), vz: rand(10, 100),
      life: rand(0.6, 1.6), color: pick(colors), size: rand(2, 5), grav: -25,
    });
  }
}
function floater(x, y, z, text, color = '#fff', size = 16, life = 1) {
  if (onScreen(x, y, 200)) G.floats.push({ x, y, z, text, color, size, life, t: 0 });
}
function ring(x, y, r, color, life = 0.35) { G.rings.push({ x, y, r, color, life, t: 0 }); }
function banner(title, sub = '', dur = 2.2, color = '#fff') { G.banner = { title, sub, t: 0, dur, color }; }
function feed(text, color = '#fff') {
  G.feed.push({ text, color, t: 6 });
  if (G.feed.length > 5) G.feed.shift();
}
const aliveRivals = () => G.enemies.reduce((n, e) => n + (e.type === 'rival' && !e.dead ? 1 : 0), 0);

// ---------- collision ----------
function pushOut(e, fly) {
  if (!fly) {
    for (const ob of G.obstacles) {
      if (ob.k === 'box') {
        if (e.x < ob.x - e.r || e.x > ob.x + ob.w + e.r || e.y < ob.y - e.r || e.y > ob.y + ob.d + e.r) continue;
        const px = clamp(e.x, ob.x, ob.x + ob.w), py = clamp(e.y, ob.y, ob.y + ob.d);
        const dx = e.x - px, dy = e.y - py, d2 = dx * dx + dy * dy;
        if (d2 >= e.r * e.r) continue;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          e.x = px + (dx / d) * e.r; e.y = py + (dy / d) * e.r;
        } else {
          const l = e.x - ob.x, r = ob.x + ob.w - e.x, t = e.y - ob.y, b = ob.y + ob.d - e.y;
          const m = Math.min(l, r, t, b);
          if (m === l) e.x = ob.x - e.r; else if (m === r) e.x = ob.x + ob.w + e.r;
          else if (m === t) e.y = ob.y - e.r; else e.y = ob.y + ob.d + e.r;
        }
      } else {
        const dx = e.x - ob.x, dy = e.y - ob.y, min = ob.r + e.r;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1;
        e.x = ob.x + (dx / d) * min; e.y = ob.y + (dy / d) * min;
      }
    }
  }
  e.x = clamp(e.x, e.r + 10, ARENA.w - e.r - 10);
  e.y = clamp(e.y, e.r + 10, ARENA.h - e.r - 10);
}
// mode 'move': anything solid; 'shot': stops projectiles (ponds don't); 'sight': tall cover only
function blockAt(x, y, pad = 0, mode = 'move') {
  for (const ob of G.obstacles) {
    if (mode !== 'move' && ob.low) continue;
    if (mode === 'sight' && (ob.k === 'tree' || (ob.k === 'box' && ob.h < 60))) continue;
    if (ob.k === 'box') {
      if (x > ob.x - pad && x < ob.x + ob.w + pad && y > ob.y - pad && y < ob.y + ob.d + pad) return ob;
    } else {
      const dx = x - ob.x, dy = y - ob.y, r = ob.r + pad;
      if (dx * dx + dy * dy < r * r) return ob;
    }
  }
  return null;
}
const inObstacle = (x, y, pad = 0) => blockAt(x, y, pad, 'shot');
function inPlaza(x, y, pad = 0) {
  for (const pl of G.map.plazas) if (x > pl.x - pad && x < pl.x + pl.w + pad && y > pl.y - pad && y < pl.y + pl.h + pad) return pl;
  return null;
}
function isClear(x, y, pad) {
  if (x < 140 || y < 140 || x > ARENA.w - 140 || y > ARENA.h - 140) return false;
  if (blockAt(x, y, pad) || inPlaza(x, y, pad)) return false;
  for (const e of G.exits) if (dist(x, y, e.x, e.y) < 190 + pad) return false;
  return true;
}
function clearSpot(pad = 40, tries = 80) {
  let x = 0, y = 0;
  for (let i = 0; i < tries; i++) {
    x = rand(160, ARENA.w - 160); y = rand(160, ARENA.h - 160);
    if (isClear(x, y, pad)) return { x, y };
  }
  return null;
}
function inTallGrass(x, y) {
  for (const g of G.map.grass) if (dist(x, y, g.x, g.y) < g.r - 6) return true;
  return false;
}
function hasSight(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by), n = Math.ceil(d / 40);
  for (let i = 1; i < n; i++) {
    const u = i / n;
    if (blockAt(lerp(ax, bx, u), lerp(ay, by, u), 0, 'sight')) return false;
  }
  return true;
}

// ---------- map generation ----------
const TREE_PALS = [
  ['#3f9a4a', '#5fc35a', '#a6ec7a'], ['#3f9a4a', '#5fc35a', '#a6ec7a'], ['#2f8a5a', '#48b574', '#8fe3a8'], ['#2f8a5a', '#48b574', '#8fe3a8'],
  ['#e77aa5', '#f7a3c2', '#ffdbe8'], ['#dfa02c', '#f2c24e', '#ffe9a3'],
];
function addContainer(x, y, kind, poi = null) {
  G.containers.push({ x, y, kind, poi, opened: false, prog: 0, need: { crate: 0.45, locker: 0.8, safe: 1.3 }[kind] });
}
function genWorld() {
  const M = (G.map = { blobs: [], paths: [], plazas: [], ponds: [], grass: [], grassRows: [], tufts: [] });
  Object.assign(G, { obstacles: [], containers: [], exits: [], bosses: [], enemies: [], bullets: [], pickups: [], parts: [], floats: [], rings: [], feed: [], ebullets: [], pets: [], boss: null });
  clearHazards();
  const C = { x: ARENA.w / 2, y: ARENA.h / 2 };

  for (const e of shuffle([[2200, 230], [2200, 4190], [210, 2250], [4190, 2250]]).slice(0, 3)) G.exits.push({ x: e[0], y: e[1], r: 95, open: false });

  for (const d of POI_DEFS) {
    const pl = { x: d.x - 500, y: d.y - 360, w: 1000, h: 740, theme: d.id, id: d.id };
    M.plazas.push(pl);
    G.obstacles.push({ k: 'box', x: d.x - 330, y: pl.y - 160, w: 660, d: 130, h: 190, bld: d.id });
    for (const q of POI_DESKS[d.id]) G.obstacles.push({ k: 'box', desk: true, theme: d.id, x: pl.x + q[0], y: pl.y + q[1], w: q[2], d: q[3], h: 36 });
    addContainer(d.x - 410, pl.y + 70, 'safe', d.id);
    addContainer(d.x + 410, pl.y + 70, 'safe', d.id);
    addContainer(pl.x + 70, pl.y + pl.h - 80, 'locker', d.id);
    addContainer(pl.x + pl.w - 70, pl.y + pl.h - 80, 'locker', d.id);
    addContainer(d.x, pl.y + pl.h - 60, 'crate', d.id);
    G.bosses.push(makeBoss(d.id, pl));
    for (const type of POI_GUARDS[d.id]) {
      const e = spawnEnemy(type, pl.x + rand(120, pl.w - 120), pl.y + rand(240, pl.h - 100));
      e.asleep = true; e.spawnT = 0; pushOut(e);
    }
    if (d.id !== 'dario') M.paths.push([[d.x, d.y], [(d.x + C.x) / 2 + rand(-160, 160), (d.y + C.y) / 2 + rand(-160, 160)], [C.x, C.y + 30]]);
  }
  for (const e of G.exits) {
    let best = POI_DEFS[0];
    for (const d of POI_DEFS) if (dist(e.x, e.y, d.x, d.y) < dist(e.x, e.y, best.x, best.y)) best = d;
    M.paths.push([[e.x, e.y], [(e.x + best.x) / 2 + rand(-120, 120), (e.y + best.y) / 2 + rand(-120, 120)], [best.x, best.y]]);
  }

  // small work sites: a shed, a couple of desks, a few boxes
  const sites = [];
  for (let i = 0; i < 400 && sites.length < 12; i++) {
    const x = rand(460, ARENA.w - 460), y = rand(520, ARENA.h - 420);
    if (inPlaza(x, y, 330) || sites.some((s) => dist(x, y, s.x, s.y) < 520) || G.exits.some((e) => dist(x, y, e.x, e.y) < 430)) continue;
    sites.push({ x, y });
    M.plazas.push({ x: x - 220, y: y - 50, w: 440, h: 230, theme: 'shed', tile: 110, minor: true });
    G.obstacles.push({ k: 'box', x: x - 85, y: y - 150, w: 170, d: 95, h: 110, shed: true });
    G.obstacles.push({ k: 'box', desk: true, theme: 'shed', x: x - 180, y: y + 30, w: 150, d: 58, h: 36 });
    G.obstacles.push({ k: 'box', desk: true, theme: 'shed', x: x + 40, y: y + 90, w: 150, d: 58, h: 36 });
    addContainer(x - 140, y - 20, 'crate');
    addContainer(x + 150, y + 30, rand() < 0.6 ? 'locker' : 'crate');
    if (rand() < 0.5) addContainer(x - 30, y + 140, 'crate');
  }
  for (let i = 0; i < 300 && M.ponds.length < 5; i++) {
    const r = rand(120, 190), x = rand(400, ARENA.w - 400), y = rand(400, ARENA.h - 400);
    if (!isClear(x, y, r + 120)) continue;
    const o = { k: 'pond', x, y, r, low: true };
    M.ponds.push(o); G.obstacles.push(o);
  }
  for (let i = 0; i < 44; i++) {
    const s = clearSpot(60);
    if (s) G.obstacles.push({ k: 'rock', x: s.x, y: s.y, r: rand(22, 38) });
  }
  const tree = (x, y) => { if (isClear(x, y, 46)) G.obstacles.push({ k: 'tree', x, y, r: 12, cr: rand(44, 68), pal: pick(TREE_PALS) }); };
  for (let f = 0; f < 18; f++) {
    const fx = rand(200, ARENA.w - 200), fy = rand(200, ARENA.h - 200);
    for (let i = 0; i < randi(6, 11); i++) tree(fx + rand(-300, 300), fy + rand(-260, 260));
  }
  for (let i = 0; i < 60; i++) tree(rand(160, ARENA.w - 160), rand(160, ARENA.h - 160));
  for (let i = 0; i < 26; i++) { const s = clearSpot(50); if (s) addContainer(s.x, s.y, 'crate'); }

  for (let i = 0; i < 26; i++) {
    const r = rand(90, 150), s = clearSpot(r * 0.85);
    if (!s) continue;
    const g = { x: s.x, y: s.y, r };
    M.grass.push(g);
    for (const j of [-0.6, -0.22, 0.16, 0.56]) {
      const hw = Math.sqrt(1 - j * j) * g.r, blades = [];
      for (let dx = -hw; dx < hw; dx += 9) blades.push({ dx: dx + rand(-3, 3), h: rand(22, 34), c: pick(['#4fa83e', '#63c04c', '#7bd45c']) });
      M.grassRows.push({ x: g.x, y: g.y + j * g.r, blades });
    }
  }
  for (let i = 0; i < 240; i++) {
    M.blobs.push({ x: rand(ARENA.w), y: rand(ARENA.h), r: rand(120, 330), c: pick(['rgba(130,225,95,0.4)', 'rgba(70,170,75,0.2)', 'rgba(200,238,110,0.28)']) });
  }
  for (let i = 0; i < 1500; i++) {
    const x = rand(40, ARENA.w - 40), y = rand(40, ARENA.h - 40);
    if (inPlaza(x, y, 20) || M.ponds.some((o) => dist(x, y, o.x, o.y) < o.r + 20)) continue;
    const k = rand() < 0.7 ? 0 : rand() < 0.75 ? 1 : 2;
    M.tufts.push({ x, y, k, c: k === 0 ? pick(['#63bd4c', '#a9e56f', '#55ad45']) : pick(['#fff', '#ffb3d1', '#b9a4ff', '#ffd76a']) });
  }
}

function initZone() {
  const z = (G.zone = { x: ARENA.w / 2, y: ARENA.h / 2, r: 3300, i: 0, mode: 'hold', t: ZPH[0].hold });
  nextZone(z);
}
function nextZone(z) {
  const ph = ZPH[z.i], a = rand(TAU), d = rand(0, Math.max(0, z.r - ph.r) * 0.55);
  const lo = Math.min(ARENA.w / 2, ph.r * 0.7 + 200), hi = ARENA.w - lo;
  z.nr = ph.r; z.nx = clamp(z.x + Math.cos(a) * d, lo, hi); z.ny = clamp(z.y + Math.sin(a) * d, lo, hi);
}
const zoneDmg = () => ZPH[Math.min(G.zone.i, ZPH.length - 1)].dmg;
function updateZone(dt) {
  const z = G.zone;
  if (z.mode === 'done') return;
  z.t -= dt;
  if (z.mode === 'hold') {
    if (z.t > 0) return;
    z.mode = 'shrink'; z.t = ZPH[z.i].shrink; z.fx = z.x; z.fy = z.y; z.fr = z.r;
    banner(T('zone_shrink'), T('zone_shrink_sub'), 2.2, '#e9b8ff');
    Sfx.play('warn');
    return;
  }
  const u = clamp(1 - z.t / ZPH[z.i].shrink, 0, 1);
  z.x = lerp(z.fx, z.nx, u); z.y = lerp(z.fy, z.ny, u); z.r = lerp(z.fr, z.nr, u);
  if (z.t > 0) return;
  if (++z.i >= ZPH.length) { z.mode = 'done'; z.r = 0; return; }
  z.mode = 'hold'; z.t = ZPH[z.i].hold;
  nextZone(z);
}

// ---------- player ----------
function makePlayer() {
  return {
    x: 0, y: 0, z: 0, r: 14, hp: 100, maxhp: 100, armor: 0, tea: 1, speed: 255,
    aim: -Math.PI / 2, aimD: 260, t: 0, moving: false, face: 1, vx: 0, vy: 0,
    dashT: 0, dashCd: 0, dashDir: { x: 1, y: 0 }, inv: 0, hurtT: 0, fireCd: 0, fireT: 0, teaCd: 0, zoneT: 0, hidden: false, outside: false,
    weapons: [{ id: 'stapler', ammo: Infinity }], wi: 0,
    loot: { value: 0, counts: [0, 0, 0, 0, 0, 0] },
  };
}

function hurtPlayer(d, force, src) {
  const p = G.player;
  if (G.state !== 'play' || p.hp <= 0 || p.inv > 0 || (p.dashT > 0 && !force)) return false;
  if (p.armor > 0) { const ab = Math.min(p.armor, d * 0.55); p.armor -= ab; d -= ab; }
  p.hp -= d;
  p.inv = 0.45; p.hurtT = 0.3;
  G.exT = Math.max(0, G.exT - 1.2);
  G.lastHit = src || (G.boss && !G.boss.down ? bossName(G.boss) : T('by_pve'));
  View.shake = Math.max(View.shake, 8);
  G.flash = { color: '255,60,60', t: 0.22, max: 0.22, a: 0.24 };
  Sfx.play('hurt');
  floater(p.x, p.y, 70, '-' + Math.max(1, Math.round(d)), '#ff6b6b', 18);
  if (p.hp <= 0) { p.hp = 0; playerDie(); }
  return true;
}
function healPlayer(n) {
  const p = G.player, before = p.hp;
  p.hp = Math.min(p.maxhp, p.hp + n);
  if (p.hp > before) floater(p.x, p.y, 70, '+' + Math.round(p.hp - before), '#7df0a0', 16);
}
function useTea() {
  const p = G.player;
  if (p.tea <= 0 || p.teaCd > 0 || p.hp >= p.maxhp) return;
  p.tea--; p.teaCd = 1;
  healPlayer(40);
  burst(p.x, p.y, 40, 10, ['#f8e1c4', '#ff9aa2', '#fff'], { sp: 80, up: 160 });
  Sfx.play('pickup');
}
function giveWeapon(id) {
  const p = G.player, cap = WEAPONS[id].ammo;
  let w = p.weapons.find((k) => k.id === id);
  if (w) w.ammo = Math.min(cap * 2, w.ammo + Math.ceil(cap * 0.6));
  else { w = { id, ammo: cap }; p.weapons.push(w); p.wi = p.weapons.length - 1; }
  floater(p.x, p.y, 80, T('w_' + id), '#ffe08a', 16, 1.4);
}

function nearestTarget(x, y, range) {
  let best = null, bd = range;
  for (const e of G.enemies) {
    if (e.spawnT > 0 || e.asleep || e.dead) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  const b = G.boss;
  if (b && !b.gone && !b.down) {
    const d = dist(x, y, b.x, b.y);
    if (d < range + 80 && (!best || d < bd)) best = b;
  }
  return best;
}
function switchWeapon(p, dir) {
  p.wi = (p.wi + dir + p.weapons.length) % p.weapons.length;
  Sfx.play('ui');
}

function updatePlayer(dt) {
  const p = G.player, z = G.zone;
  p.t += dt;
  p.inv = Math.max(0, p.inv - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.fireCd -= dt; p.dashCd -= dt; p.fireT -= dt; p.teaCd -= dt;
  const mv = Input.moveVec();
  let fire = false;
  if (Input.touch) {
    const rs = Input.rstick;
    if (rs && Math.hypot(rs.x - rs.ox, rs.y - rs.oy) > 12) {
      p.aim = Math.atan2((rs.y - rs.oy) / YK, rs.x - rs.ox);
      p.aimD = 260; fire = true;
    } else {
      const tg = nearestTarget(p.x, p.y, 500);
      if (tg && hasSight(p.x, p.y, tg.x, tg.y)) { p.aim = angTo(p.x, p.y, tg.x, tg.y); p.aimD = dist(p.x, p.y, tg.x, tg.y); fire = true; }
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
    p.dashT = 0.2; p.dashCd = 1.1;
    Sfx.play('dash');
  }
  let vx, vy;
  if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashDir.x * 820; vy = p.dashDir.y * 820;
    part(p.x, p.y, rand(8, 40), { vx: -vx * 0.1, vy: -vy * 0.1, life: 0.25, color: '#fff', size: 7, grav: 0, round: true });
  } else { vx = mv.x * p.speed; vy = mv.y * p.speed; }
  p.vx = vx; p.vy = vy;
  p.x += vx * dt; p.y += vy * dt;
  p.moving = Math.hypot(mv.x, mv.y) > 0.1;
  pushOut(p);
  p.hidden = p.fireT <= 0 && p.dashT <= 0 && inTallGrass(p.x, p.y);

  for (let i = 0; i < 5; i++) if (Input.take('Digit' + (i + 1)) && p.weapons[i]) { p.wi = i; Sfx.play('ui'); }
  if (Input.take('KeyQ')) switchWeapon(p, -1);
  if (Input.take('KeyE') || Input.take('swapBtn')) switchWeapon(p, 1);
  if (Input.wheel) { switchWeapon(p, Input.wheel > 0 ? 1 : -1); Input.wheel = 0; }
  if (Input.take('KeyF') || Input.take('KeyR') || Input.take('teaBtn')) useTea();
  if (fire && p.fireCd <= 0) fireWeapon(p);

  // the optimization circle bites every half second
  p.outside = dist(p.x, p.y, z.x, z.y) > z.r;
  if (p.outside && (p.zoneT += dt) >= 0.5) {
    p.zoneT = 0;
    p.hp -= zoneDmg() * 0.5;
    G.lastHit = T('by_zone');
    G.flash = { color: '190,80,255', t: 0.3, max: 0.3, a: 0.22 };
    if (p.hp <= 0) { p.hp = 0; playerDie(); }
  }
}

function fireWeapon(p) {
  const w = p.weapons[p.wi], d = WEAPONS[w.id];
  p.fireCd = d.cd; p.fireT = 1.2;
  const ox = p.x + Math.cos(p.aim) * 20, oy = p.y + Math.sin(p.aim) * 20;
  const mk = (ang, o, sm = 1) => G.bullets.push(Object.assign({
    id: w.id, x: ox, y: oy, z: 26, vx: Math.cos(ang) * d.speed * sm, vy: Math.sin(ang) * d.speed * sm,
    r: 6, dmg: d.dmg, life: 1.1, t: 0, pierce: 0, hit: null,
  }, o));
  if (w.id === 'stapler') { mk(p.aim + rand(-0.03, 0.03)); Sfx.play('shoot'); }
  else if (w.id === 'keyboard') {
    for (let i = 0; i < d.pellets; i++) mk(p.aim + rand(-d.spread / 2, d.spread / 2), { life: rand(0.34, 0.52), r: 5, spin: rand(TAU) }, rand(0.8, 1.1));
    Sfx.play('keys');
  } else if (w.id === 'coffee') {
    mk(p.aim, { lob: true, T: clamp(p.aimD || 260, 110, 440) / d.speed, r: 8, life: 9 });
    Sfx.play('lob');
  } else if (w.id === 'plane') { mk(p.aim, { pierce: d.pierce, hit: new Set(), r: 8 }); Sfx.play('plane'); }
  else if (w.id === 'book') { mk(p.aim, { boom: true, hit: new Set(), r: 13, life: 9, pierce: 999 }); Sfx.play('book'); }
  if (w.ammo !== Infinity && --w.ammo <= 0) {
    p.weapons.splice(p.wi, 1);
    p.wi = 0;
    floater(p.x, p.y, 80, T('out_of_ammo'), '#e8e4f0', 14);
  }
}

// ---------- player projectiles ----------
function coffeeSplash(b) {
  const aoe = WEAPONS.coffee.aoe;
  ring(b.x, b.y, aoe, '#8d6e63');
  burst(b.x, b.y, 4, 18, ['#6d4c41', '#8d6e63', '#d7ccc8'], { sp: 220, up: 200 });
  View.shake = Math.max(View.shake, 4);
  Sfx.play('boom');
  for (const e of G.enemies) if (e.spawnT <= 0 && !e.dead && dist(b.x, b.y, e.x, e.y) < aoe + e.r) damageEnemy(e, b.dmg, b);
  const bs = G.boss;
  if (bs && dist(b.x, b.y, bs.x, bs.y) < aoe + bs.r) damageBoss(bs, b.dmg);
}

function damageEnemy(e, d, b) {
  if (e.type === 'rival') return damageRival(e, d, G.player);
  e.hp -= d;
  e.flash = 0.09; e.asleep = false;
  if (b && !b.lob) { const m = Math.hypot(b.vx, b.vy) || 1; e.kx += (b.vx / m) * 120; e.ky += (b.vy / m) * 120; }
  if (e.hp <= 0 && !e.dead) killEnemy(e, true);
  else Sfx.play('hit');
}
function killEnemy(e, byPlayer) {
  e.dead = true;
  poof(e.x, e.y);
  if (!byPlayer) return;
  Sfx.play('kill');
  if (rand() < 0.14) dropItem(e.x, e.y, { kind: 'tea' });
  else if (rand() < 0.2) dropItem(e.x, e.y, rollVal(0, 1));
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
    } else {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t > b.life || b.x < 0 || b.x > ARENA.w || b.y < 0 || b.y > ARENA.h) { b.dead = true; continue; }
      if (inObstacle(b.x, b.y)) {
        b.dead = true;
        burst(b.x, b.y, 26, 3, ['#fff'], { sp: 80, up: 80, life: 0.3 });
        continue;
      }
    }
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.dead || Math.abs(b.x - e.x) > 40 || dist(b.x, b.y, e.x, e.y) > e.r + b.r + 2) continue;
      if (b.hit) { if (b.hit.has(e)) continue; b.hit.add(e); }
      damageEnemy(e, b.dmg, b);
      if (b.pierce > 0) b.pierce--; else { b.dead = true; break; }
    }
    if (b.dead || !boss || boss.gone || boss.down) continue;
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

// ---------- minions ----------
function spawnEnemy(type, x, y) {
  const d = ENEMY[type];
  const e = {
    type, def: d, x, y, z: 0, r: d.r, hp: d.hp, maxhp: d.hp, t: rand(10), spawnT: 0.6, aggro: 430,
    atkCd: rand(0.3, 0.8), shootCd: rand(1.2, 2.6), face: 1, flash: 0, kx: 0, ky: 0, strafe: pick([-1, 1]),
  };
  G.enemies.push(e);
  return e;
}

function updateEnemies(dt) {
  const p = G.player;
  for (const e of G.enemies) {
    e.t += dt; e.flash -= dt;
    if (e.type === 'rival') { updateRival(e, dt); continue; }
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    const d = dist(e.x, e.y, p.x, p.y);
    if (e.asleep) { if (d < (p.hidden ? 170 : e.aggro)) e.asleep = false; else continue; }
    if (d > 1100) { e.asleep = true; continue; }
    const a = angTo(e.x, e.y, p.x, p.y), k = e.def.kind;
    e.face = p.x >= e.x ? 1 : -1;
    let sp = e.def.speed, mx = Math.cos(a), my = Math.sin(a);
    if (e.def.zig) { const w = Math.sin(e.t * 7) * 0.9; mx -= Math.sin(a) * w; my += Math.cos(a) * w; }
    if (k === 'hopper') {
      const ph = (e.t * 2.2) % 1;
      e.z = Math.sin(Math.min(1, ph / 0.75) * Math.PI) * 16;
      sp *= ph < 0.75 ? 1.3 : 0.15;
    } else if (k === 'shooter') {
      e.z = e.def.ground ? 0 : 34 + Math.sin(e.t * 3) * 4;
      const radial = d > 340 ? 1 : d < 260 ? -1 : 0;
      const tx = -my * e.strafe, ty = mx * e.strafe;
      mx = mx * radial + tx * 0.7; my = my * radial + ty * 0.7;
      if (rand() < dt * 0.3) e.strafe *= -1;
      e.shootCd -= dt;
      if (e.shootCd <= 0 && d < 580) {
        e.shootCd = rand(1.9, 2.7);
        eb(e.x, e.y, a, 235, { dmg: 9, color: e.type === 'gpt' ? '#3ddc97' : '#ff6b6b', r: 7 });
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
    if (k !== 'shooter' && d < e.r + p.r + 5 && e.atkCd <= 0 && hurtPlayer(e.def.dmg, false, T('by_' + e.type))) e.atkCd = 0.9;
    pushOut(e, k === 'shooter' && !e.def.ground);
  }
  const es = G.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.asleep) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j], dx = b.x - a.x, min = a.r + b.r;
      if (dx > min || dx < -min) continue;
      const dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push;
      b.x += (dx / d) * push; b.y += (dy / d) * push;
    }
  }
  G.enemies = es.filter((e) => !e.dead);
}

// ---------- rivals: the other 29 people after the one remaining headcount ----------
const RIVAL_KITS = [
  { hp: 55, armor: 0, sight: 400, spread: 0.2, tea: 0, speed: 185, ws: ['stapler', 'stapler', 'keyboard'], loot: [100, 700] },
  { hp: 70, armor: 25, sight: 440, spread: 0.15, tea: 1, speed: 195, ws: ['keyboard', 'plane', 'stapler'], loot: [500, 3000] },
  { hp: 85, armor: 60, sight: 480, spread: 0.11, tea: 2, speed: 205, ws: ['plane', 'book', 'keyboard'], loot: [2500, 9000] },
];
const RIVAL_TITLES = [
  [['Intern', '实习生'], ['New grad', '校招生'], ['Contractor', '外包']],
  [['P6', 'P6'], ['P7', 'P7'], ['PM', '产品'], ['QA', '测试'], ['Ops', '运维']],
  [['Grinder', '卷王'], ['P9', 'P9'], ['Tech lead', 'TL']],
];
const RIVAL_NAMES = [['Zhang', '小张'], ['Li', '小李'], ['Wang', '老王'], ['Qiang', '阿强'], ['Lily', '莉莉'], ['Tony', 'Tony'], ['Kevin', 'Kevin'], ['Chen', '小陈'], ['Liu', '大刘'], ['May', '小美'], ['Jay', '阿杰'], ['Linda', '琳达'], ['Zhao', '老赵'], ['Yuki', '小雪']];
const CW_TOPS = ['#ef6a6a', '#b06fd8', '#35b8a6', '#ffa94d', '#a1887f', '#8ea3b8', '#72c96a', '#5aa9f0'];
const CW_SKIN = ['#f6d3b3', '#eec3a2', '#dfae86', '#c9966c'];
const rivalName = (e) => e.title[LANG.zh ? 1 : 0] + (LANG.zh ? '' : ' ') + e.nm[LANG.zh ? 1 : 0];

function spawnRival(x, y) {
  const q = rand(), lvl = q < 0.4 ? 0 : q < 0.82 ? 1 : 2, kit = RIVAL_KITS[lvl];
  const e = {
    type: 'rival', def: ENEMY.rival, x, y, z: 0, r: 14, hp: kit.hp, maxhp: kit.hp, armor: kit.armor, lvl,
    w: pick(kit.ws), sight: kit.sight, spread: kit.spread, tea: kit.tea, speed: kit.speed, loot: Math.round(rand(kit.loot[0], kit.loot[1])),
    t: rand(10), spawnT: 0, think: rand(0.5), fireCd: rand(1), healCd: 0, fleeT: 0, fleeCd: 0, strafe: pick([-1, 1]), pref: rand(200, 300), face: 1, aim: 0, flash: 0,
    state: 'loot', gx: x, gy: y, goalC: null, target: null, alertT: 0, stT: 0, sx0: x, sy0: y, detour: null, exT: 0, greed: rand(2500, 9000),
    vx: 0, vy: 0, moving: false, outside: false,
    title: pick(RIVAL_TITLES[lvl]), nm: pick(RIVAL_NAMES),
    look: {
      top: pick(CW_TOPS), bottom: '#3b4a6b', skin: pick(CW_SKIN), hair: pick(['#2a2233', '#4a3327', '#6b4a35']), hairStyle: pick(['short', 'side', 'long', 'messy']),
      glasses: rand() < 0.4 ? '#2a2438' : null, band: lvl === 2 ? '#ffcf4a' : '#e5484d', plaid: lvl > 0 ? 'rgba(42,36,56,0.45)' : null,
    },
  };
  G.enemies.push(e);
  return e;
}

function damageRival(e, d, src) {
  if (e.dead) return;
  if (e.armor > 0) { const ab = Math.min(e.armor, d * 0.55); e.armor -= ab; d -= ab; }
  e.hp -= d;
  e.flash = 0.09;
  if (src && e.fleeT <= 0) { e.target = src; e.alertT = 3; e.state = 'fight'; }
  if (e.hp <= 0) killRival(e, src);
  else if (src === G.player) Sfx.play('hit');
}
function killRival(e, src, cause) {
  if (e.dead) return;
  e.dead = true;
  poof(e.x, e.y);
  const p = G.player, name = rivalName(e);
  if (src === p) {
    G.kills++;
    Sfx.play('kill');
    feed(T('feed_you', name), '#ffe08a');
    floater(e.x, e.y, 90, T('optimized'), '#ffb3b3', 15, 1.3);
  } else if (src) { src.loot += Math.round(e.loot * 0.6); feed(T('feed_kill', rivalName(src), name)); }
  else feed(T(cause === 'zone' ? 'feed_zone' : 'feed_boss', name), '#e9b8ff');
  if (src !== p && dist(e.x, e.y, p.x, p.y) > 1300) return;
  if (e.w !== 'stapler') dropItem(e.x, e.y, { kind: 'weapon', id: e.w });
  if (e.tea > 0 || rand() < 0.35) dropItem(e.x, e.y, { kind: 'tea' });
  if (e.lvl > 0 && rand() < 0.5) dropItem(e.x, e.y, { kind: 'armor', amt: 35 });
  let v = e.loot;
  for (let i = 0; i < 4 && v >= 120; i++) {
    let it = VALS[0];
    for (const q of VALS) if (q[2] <= v && q[1] < 5) it = q;
    v -= it[2];
    dropItem(e.x, e.y, { kind: 'val', key: it[0], tier: it[1], value: it[2] });
  }
}

function rivalFire(e, a, tg) {
  const s = e.spread, onscr = onScreen(e.x, e.y, 100);
  const o = { owner: e, life: 1.2, ghost: false };
  if (e.w === 'stapler') {
    e.fireCd = rand(0.42, 0.6);
    eb(e.x, e.y, a + rand(-s, s), 520, Object.assign({ shape: 'staple', dmg: 7, r: 6 }, o));
  } else if (e.w === 'keyboard') {
    e.fireCd = rand(0.85, 1.1);
    for (let i = 0; i < 4; i++) eb(e.x, e.y, a + rand(-0.22, 0.22), 470 * rand(0.85, 1.1), Object.assign({ shape: 'key', dmg: 5, r: 5 }, o, { life: 0.6 }));
  } else if (e.w === 'plane') {
    e.fireCd = rand(0.5, 0.65);
    eb(e.x, e.y, a + rand(-s, s), 660, Object.assign({ shape: 'plane', dmg: 11, r: 7 }, o));
  } else {
    e.fireCd = rand(1.1, 1.4);
    eb(e.x, e.y, a + rand(-s, s), 430, Object.assign({ shape: 'book', dmg: 16, r: 11 }, o));
  }
  if (onscr) Sfx.play(tg === G.player ? 'shoot' : 'hit');
}

function rivalThink(e) {
  const z = G.zone, p = G.player;
  e.outside = dist(e.x, e.y, z.x, z.y) > z.r - 70 || ((z.mode === 'shrink' || z.t < 14) && dist(e.x, e.y, z.nx, z.ny) > z.nr - 50);
  if (e.fleeT > 0) return;
  // pick a fight?
  let best = null, bd = e.sight;
  if (e.alertT > 0 && e.target && !e.target.dead && (e.target !== p || p.hp > 0)) { best = e.target; }
  else {
    if (p.hp > 0 && G.time > 12) { // a short grace period after the drop
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < (p.hidden ? 150 : bd) && hasSight(e.x, e.y, p.x, p.y)) { best = p; bd = d; }
    }
    for (const o of G.enemies) {
      if (o === e || o.type !== 'rival' || o.dead) continue;
      const d = dist(e.x, e.y, o.x, o.y);
      if (d < Math.min(bd, e.sight * 0.6) && hasSight(e.x, e.y, o.x, o.y)) { best = o; bd = d; }
    }
  }
  if (best) {
    e.target = best; e.state = 'fight';
    if (e.hp < e.maxhp * 0.4 && e.tea > 0 && e.healCd <= 0) { e.tea--; e.hp = Math.min(e.maxhp, e.hp + 35); e.healCd = 5; floater(e.x, e.y, 80, '+35', '#7df0a0', 14); }
    else if (e.hp < e.maxhp * 0.4 && e.fleeCd <= 0) {
      // badly hurt and out of tea: break off and run
      const a = angTo(best.x, best.y, e.x, e.y) + rand(-0.6, 0.6);
      e.fleeT = rand(2.5, 4); e.fleeCd = 9; e.state = 'flee'; e.target = null; e.alertT = 0;
      e.gx = clamp(e.x + Math.cos(a) * 700, 200, ARENA.w - 200); e.gy = clamp(e.y + Math.sin(a) * 700, 200, ARENA.h - 200);
    }
    return;
  }
  e.target = null;
  if (e.outside) {
    e.state = 'rotate'; e.goalC = null;
    const a = rand(TAU), d = rand(z.nr * 0.6);
    e.gx = z.nx + Math.cos(a) * d; e.gy = z.ny + Math.sin(a) * d;
    return;
  }
  if (G.exitsOpen && e.loot > e.greed && G.time > 110) {
    let ex = null, xd = 1e9;
    for (const q of G.exits) { const d = dist(e.x, e.y, q.x, q.y); if (d < xd && dist(q.x, q.y, z.x, z.y) < z.r) { xd = d; ex = q; } }
    if (ex) { e.state = 'extract'; e.gx = ex.x; e.gy = ex.y; return; }
  }
  if (e.goalC && e.goalC.opened) e.goalC = null;
  if (!e.goalC) {
    let bc = null, cd = 1000;
    for (const k of G.containers) {
      if (k.opened || k.poi || Math.abs(k.x - e.x) > cd) continue;
      const d = dist(e.x, e.y, k.x, k.y);
      if (d < cd && dist(k.x, k.y, z.nx, z.ny) < Math.max(z.nr, 200)) { cd = d; bc = k; }
    }
    e.goalC = bc;
  }
  if (e.goalC) { e.state = 'loot'; e.gx = e.goalC.x; e.gy = e.goalC.y; }
  else if (e.state !== 'wander' || dist(e.x, e.y, e.gx, e.gy) < 40) {
    e.state = 'wander';
    const a = rand(TAU), d = rand(200, 700);
    e.gx = clamp(e.x + Math.cos(a) * d, 200, ARENA.w - 200); e.gy = clamp(e.y + Math.sin(a) * d, 200, ARENA.h - 200);
    if (inPlaza(e.gx, e.gy, 60) && !inPlaza(e.gx, e.gy, 60).minor) { e.gx = e.x; e.gy = e.y; }
  }
}

function updateRival(e, dt) {
  const z = G.zone, p = G.player;
  e.fireCd -= dt; e.healCd -= dt; e.alertT -= dt; e.fleeT -= dt; e.fleeCd -= dt;
  if ((e.think -= dt) <= 0) { e.think = rand(0.3, 0.5); rivalThink(e); }
  let mx = 0, my = 0;
  const tg = e.state === 'fight' && e.target && !e.target.dead && (e.target !== p || p.hp > 0) ? e.target : null;
  if (tg) {
    const d = dist(e.x, e.y, tg.x, tg.y), a = angTo(e.x, e.y, tg.x, tg.y);
    e.aim = a;
    const radial = d > e.pref + 50 ? 1 : d < e.pref - 60 ? -1 : 0;
    mx = Math.cos(a) * radial - Math.sin(a) * e.strafe * 0.8; my = Math.sin(a) * radial + Math.cos(a) * e.strafe * 0.8;
    if (rand() < dt * 0.6) e.strafe *= -1;
    if (e.fireCd <= 0 && d < e.sight + 60) {
      const lead = d / 560;
      rivalFire(e, angTo(e.x, e.y, tg.x + (tg.vx || 0) * lead * 0.5, tg.y + (tg.vy || 0) * lead * 0.5), tg);
    }
    if (e.outside) { const ca = angTo(e.x, e.y, z.nx, z.ny); mx = mx * 0.4 + Math.cos(ca); my = my * 0.4 + Math.sin(ca); }
  } else {
    const d = dist(e.x, e.y, e.gx, e.gy);
    if (d > 14) { const a = angTo(e.x, e.y, e.gx, e.gy); mx = Math.cos(a); my = Math.sin(a); e.aim = a; }
    if (e.state === 'loot' && e.goalC && d < 44) {
      const k = e.goalC;
      k.opened = true; e.goalC = null;
      e.loot += Math.round({ crate: rand(200, 800), locker: rand(600, 2600), safe: rand(3000, 12000) }[k.kind]);
      if (rand() < 0.3) e.armor = Math.min(100, e.armor + 30);
      if (rand() < 0.25) e.w = pick(['keyboard', 'plane', 'book']);
      if (rand() < 0.3) e.tea++;
    }
    if (e.state === 'extract' && d < 70 && (e.exT += dt) > 4) {
      e.dead = true;
      poof(e.x, e.y, ['#d6ffe6', '#fff']);
      feed(T('feed_extract', rivalName(e)), '#9df0b8');
      return;
    }
  }
  if (e.detour) {
    mx = Math.cos(e.detour.a); my = Math.sin(e.detour.a);
    if ((e.detour.t -= dt) <= 0) e.detour = null;
  }
  const m = Math.hypot(mx, my);
  e.moving = m > 0.1;
  if (e.moving) {
    const sp = e.speed * (e.state === 'wander' ? 0.7 : 1);
    e.vx = (mx / m) * sp; e.vy = (my / m) * sp;
    e.x += e.vx * dt; e.y += e.vy * dt;
    pushOut(e);
  } else { e.vx = 0; e.vy = 0; }
  e.face = Math.cos(e.aim) >= 0 ? 1 : -1;
  // wedged against a wall or a pond? sidestep for a moment
  if ((e.stT += dt) > 0.7) {
    if (e.moving && !tg && !e.detour && dist(e.x, e.y, e.sx0, e.sy0) < 26) e.detour = { a: e.aim + pick([-1, 1]) * rand(1.2, 1.9), t: rand(0.6, 1.2) };
    e.stT = 0; e.sx0 = e.x; e.sy0 = e.y;
  }
  if (dist(e.x, e.y, z.x, z.y) > z.r) {
    e.hp -= zoneDmg() * dt;
    if (e.hp <= 0) killRival(e, null, 'zone');
  }
}

// ---------- hazards: bullets, zones, lasers ----------
function eb(x, y, ang, speed, o) {
  if (G.ebullets.length > 480) return;
  G.ebullets.push(Object.assign({
    x, y, z: 24, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    r: 8, dmg: 10, color: '#ff6b6b', shape: 'orb', life: 6, t: 0,
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
  G.ebullets = G.ebullets ? G.ebullets.filter((b) => b.owner) : [];
  G.zones = []; G.lasers = [];
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
    if (p.hp > 0 && dist(b.x, b.y, p.x, p.y) < b.r + p.r - 3 && hurtPlayer(b.dmg, false, b.owner ? rivalName(b.owner) : null)) { b.dead = true; continue; }
    if (!b.owner) continue;
    for (const e of G.enemies) {
      if (e === b.owner || e.type !== 'rival' || e.dead || Math.abs(e.x - b.x) > 30 || dist(b.x, b.y, e.x, e.y) > e.r + b.r) continue;
      damageRival(e, b.dmg * 0.4, b.owner.dead ? null : b.owner);
      b.dead = true;
      break;
    }
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
  if (inZone(z, p.x, p.y, -3)) hurtPlayer(z.dmg, false, z.src);
  for (const e of G.enemies) if (e.type === 'rival' && !e.dead && inZone(z, e.x, e.y)) { damageRival(e, z.dmg * 1.5, null); }
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
      if (z.linger > 0.3 && inZone(z, p.x, p.y, -3)) hurtPlayer(z.dmg, false, z.src);
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
    if (o.gone || o.down || o !== G.boss) { l.dead = true; continue; }
    if (l.t > l.tele + l.life) { l.dead = true; continue; }
    if (l.t < l.tele) continue;
    l.a += l.da * dt;
    if (!l.dmg) continue;
    const ex = l.x + Math.cos(l.a) * l.len, ey = l.y + Math.sin(l.a) * l.len;
    if (distToSeg(p.x, p.y, l.x, l.y, ex, ey) < l.width / 2 + p.r - 4) hurtPlayer(l.dmg, false, bossName(o));
    if (l.look === 'flame') {
      for (let i = 0; i < 3; i++) {
        const d = rand(40, l.len);
        part(l.x + Math.cos(l.a) * d, l.y + Math.sin(l.a) * d, rand(10, 30), { vx: rand(-40, 40), vy: rand(-40, 40), vz: rand(40, 160), life: rand(0.2, 0.5), color: pick(['#ff7043', '#ffca28', '#ff3d00']), size: rand(4, 9), grav: -100, round: true });
      }
    }
  }
  G.lasers = G.lasers.filter((l) => !l.dead);
}

// ---------- loot ----------
function rollVal(minT, maxT) {
  const pool = VALS.filter((v) => v[1] >= minT && v[1] <= maxT), it = pick(pool);
  return { kind: 'val', key: it[0], tier: it[1], value: it[2] };
}
function dropItem(x, y, item) {
  const a = rand(TAU), sp = rand(60, 150);
  G.pickups.push(Object.assign({ x, y, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(170, 260), t: 0 }, item));
}
function rollWeapon() {
  const owned = G.player.weapons.map((w) => w.id), fresh = WEAPON_IDS.filter((id) => !owned.includes(id));
  return { kind: 'weapon', id: fresh.length && rand() < 0.7 ? pick(fresh) : pick(WEAPON_IDS) };
}
function openContainer(k) {
  k.opened = true;
  Sfx.play('open');
  burst(k.x, k.y, 20, 10, ['#fff', '#ffe08a'], { sp: 120, up: 200 });
  const out = (it) => dropItem(k.x, k.y + 8, it);
  if (k.kind === 'crate') {
    for (let i = randi(1, 2); i > 0; i--) { const q = rand(); out(q < 0.3 ? rollWeapon() : q < 0.5 ? { kind: 'tea' } : q < 0.62 ? { kind: 'armor', amt: 35 } : rollVal(0, q > 0.93 ? 2 : 1)); }
  } else if (k.kind === 'locker') {
    for (let i = randi(2, 3); i > 0; i--) { const q = rand(); out(q < 0.28 ? rollWeapon() : q < 0.42 ? { kind: 'tea' } : q < 0.58 ? { kind: 'armor', amt: 50 } : rollVal(1, q > 0.9 ? 3 : 2)); }
  } else {
    for (let i = randi(3, 4); i > 0; i--) { const q = rand(); out(q < 0.14 ? rollWeapon() : q < 0.24 ? { kind: 'tea' } : q < 0.38 ? { kind: 'armor', amt: 100 } : rollVal(2, q > 0.88 ? 4 : 3)); }
  }
}
function updateContainers(dt) {
  const p = G.player;
  for (const k of G.containers) {
    if (k.opened || Math.abs(k.x - p.x) > 60) continue;
    if (dist(k.x, k.y, p.x, p.y) < 48) { if ((k.prog += dt) >= k.need) openContainer(k); }
    else k.prog = 0;
  }
}
function takePickup(k) {
  const p = G.player;
  if (k.kind === 'tea') { if (p.tea >= 6) return false; p.tea++; floater(p.x, p.y, 80, T('tea') + ' +1', '#ffd0d6', 15, 1.2); }
  else if (k.kind === 'armor') { if (p.armor >= 100) return false; p.armor = Math.min(100, p.armor + k.amt); floater(p.x, p.y, 80, T('armor') + ' +' + k.amt, '#9cc9ff', 15, 1.2); }
  else if (k.kind === 'weapon') giveWeapon(k.id);
  else {
    p.loot.value += k.value; p.loot.counts[k.tier]++;
    floater(p.x, p.y, 84, T(k.key) + '  +¥' + k.value.toLocaleString('en-US'), TIER[k.tier], k.tier >= 3 ? 19 : 15, 1.6);
    if (k.tier >= 3) { ring(p.x, p.y, 70, TIER[k.tier], 0.5); Sfx.play('safe'); }
  }
  Sfx.play('pickup');
  return true;
}
function updatePickups(dt) {
  const p = G.player;
  for (const k of G.pickups) {
    k.t += dt;
    if (k.z > 0 || k.vz > 0) {
      k.vz -= 700 * dt; k.z += k.vz * dt; k.x += k.vx * dt; k.y += k.vy * dt;
      if (k.z <= 0) { k.z = 0; k.vz = 0; k.x = clamp(k.x, 30, ARENA.w - 30); k.y = clamp(k.y, 30, ARENA.h - 30); }
      continue;
    }
    if (Math.abs(k.x - p.x) > 90) continue;
    const d = dist(k.x, k.y, p.x, p.y);
    if (d > 80 || k.t < 0.4) continue;
    if ((k.kind === 'tea' && p.tea >= 6) || (k.kind === 'armor' && p.armor >= 100)) continue;
    if (d > 26) { const a = angTo(k.x, k.y, p.x, p.y); k.x += Math.cos(a) * 420 * dt; k.y += Math.sin(a) * 420 * dt; }
    else if (takePickup(k)) k.dead = true;
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

// ---------- sidekicks: an AI whose boss has signed switches sides ----------
function addPet(type) {
  const p = G.player;
  G.pets.push({ type, x: p.x, y: p.y, t: rand(10), cd: type === 'doubao' ? 6 : 1, face: 1, slot: G.pets.length, moving: false });
  feed(T('pet_join', T('pet_' + type)), '#7df0a0');
}
function updatePets(dt) {
  const p = G.player;
  for (const q of G.pets) {
    q.t += dt; q.cd -= dt;
    const a = p.aim + Math.PI + (q.slot - 1) * 0.9, tx = p.x + Math.cos(a) * 48, ty = p.y + Math.sin(a) * 48, d = dist(q.x, q.y, tx, ty);
    q.moving = d > 8;
    if (d > 500) { q.x = tx; q.y = ty; }
    else if (q.moving) { const m = angTo(q.x, q.y, tx, ty), sp = Math.min(340, d * 5); q.x += Math.cos(m) * sp * dt; q.y += Math.sin(m) * sp * dt; q.face = Math.cos(m) >= 0 ? 1 : -1; }
    if (q.cd > 0) continue;
    if (q.type === 'doubao') {
      q.cd = 24;
      if (p.tea < 6) { p.tea++; floater(q.x, q.y, 60, T('pet_tea'), '#ffd0d6', 14, 1.8); Sfx.play('pickup'); }
      continue;
    }
    const tg = nearestTarget(q.x, q.y, q.type === 'crab' ? 240 : 460);
    if (!tg || !hasSight(q.x, q.y, tg.x, tg.y)) { q.cd = 0.2; continue; }
    const ang = angTo(q.x, q.y, tg.x, tg.y), claw = q.type === 'crab', sp = claw ? 640 : 700;
    q.face = Math.cos(ang) >= 0 ? 1 : -1; q.cd = claw ? 0.6 : 1.2;
    G.bullets.push({ id: claw ? 'claw' : 'token', x: q.x, y: q.y, z: 16, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 7, dmg: claw ? 9 : 15, life: claw ? 0.42 : 0.75, t: 0, pierce: 0, hit: null });
  }
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
  for (const f of G.feed) f.t -= dt;
  G.feed = G.feed.filter((f) => f.t > 0);
  // wind streaks drifting across the meadow
  if (rand() < dt * 1.1 && G.wind.length < 5) G.wind.push({ x: rand(-0.2, 0.8), y: rand(0.1, 0.9), t: 0, life: rand(1.4, 2.2), len: rand(0.12, 0.22) });
  for (const w of G.wind) w.t += dt;
  G.wind = G.wind.filter((w) => w.t < w.life);
  if (G.flash && (G.flash.t -= dt) <= 0) G.flash = null;
  if (G.banner && (G.banner.t += dt) >= G.banner.dur) G.banner = null;
  G.boomCd -= dt;
  View.shake = Math.max(0, View.shake - dt * 30);
}
