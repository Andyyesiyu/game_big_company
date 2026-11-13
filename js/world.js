'use strict';
// ---------- shared game state ----------
const G = {
  state: 'menu', t: 0, time: 0,
  player: null, boss: null, bosses: [], map: null, zone: null,
  enemies: [], bullets: [], ebullets: [], zones: [], lasers: [], pickups: [],
  parts: [], floats: [], rings: [], obstacles: [], containers: [], exits: [], feed: [], wind: [], pets: [], slashes: [], ults: [], sparks: [], corpses: [],
  hitstop: 0, combo: 0, comboT: 0, slowT: 0, day: 0,
  kills: 0, signed: 0, exT: 0, lastHit: '', run: null,
  flash: null, banner: null, boomCd: 0,
};

// Melee weapons. Better tiers replace what you hold; tier also scales your skills.
const WEAPONS = {
  stapler: { tier: 0, dmg: 12, reach: 64, arc: 0.95, swing: 0.26, kb: 150, n: 4 }, // n: lights in a string
  fan: { tier: 1, dmg: 15, reach: 80, arc: 1.25, swing: 0.29, kb: 150 },
  keyboard: { tier: 2, dmg: 21, reach: 86, arc: 1.05, swing: 0.38, kb: 300 },
  board: { tier: 3, dmg: 29, reach: 96, arc: 1.3, swing: 0.5, kb: 380, stun3: 0.6, chg: 1.3 }, // chg: charged attacks hit harder
  book: { tier: 4, dmg: 26, reach: 90, arc: 1.1, swing: 0.32, kb: 240, crit: 0.15, ko: 1.5 }, // ko: topples bosses sooner
};
const SKILL_CD = { q: 5, e: 6, r: 26, d: 1.4 };

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
// [deep shade, mid tone, sunlit]
const TREE_PALS = [
  ['#1c4426', '#3d7a36', '#93c95c'], ['#1c4426', '#3d7a36', '#93c95c'], ['#1a4034', '#2f7560', '#7fcf9a'], ['#1f3d1f', '#4a7a2c', '#a9c95a'],
  ['#7a3050', '#cf6c94', '#ffc4d8'], ['#7a4c12', '#d0922a', '#ffe08a'],
];
function addContainer(x, y, kind, poi = null) {
  G.containers.push({ x, y, kind, poi, opened: false, prog: 0, need: { crate: 0.45, locker: 0.8, safe: 1.3 }[kind] });
}
function genWorld() {
  const M = (G.map = { blobs: [], paths: [], stones: [], plazas: [], ponds: [], grass: [], grassRows: [], tufts: [] });
  Object.assign(G, { obstacles: [], containers: [], exits: [], bosses: [], enemies: [], bullets: [], pickups: [], parts: [], floats: [], rings: [], feed: [], ebullets: [], pets: [], slashes: [], ults: [], sparks: [], corpses: [], hitstop: 0, combo: 0, comboT: 0, slowT: 0, boss: null });
  clearHazards();
  const C = { x: ARENA.w / 2, y: ARENA.h / 2 };

  for (const d of POI_DEFS) {
    const pl = { x: d.x - 500, y: d.y - 360, w: 1000, h: 740, theme: d.id, id: d.id };
    M.plazas.push(pl);
    G.obstacles.push({ k: 'box', x: d.x - 330, y: pl.y - 330, w: 660, d: 300, h: 190, bld: d.id });
    for (const q of POI_DESKS[d.id]) G.obstacles.push({ k: 'box', desk: true, theme: d.id, x: pl.x + q[0], y: pl.y + q[1], w: q[2], d: q[3], h: 36 });
    addContainer(d.x - 410, pl.y + 70, 'safe', d.id);
    addContainer(d.x + 410, pl.y + 70, 'safe', d.id);
    addContainer(pl.x + 70, pl.y + pl.h - 80, 'locker', d.id);
    addContainer(pl.x + pl.w - 70, pl.y + pl.h - 80, 'locker', d.id);
    addContainer(d.x, pl.y + pl.h - 60, 'crate', d.id);
    G.bosses.push(makeBoss(d.id, pl));
    G.exits.push({ x: d.x, y: pl.y + pl.h + 215, r: 95, open: false, poi: d.id }); // the shuttle to the next company stops here
    if (d.id !== 'dario') M.paths.push([[d.x, d.y], [(d.x + C.x) / 2 + rand(-160, 160), (d.y + C.y) / 2 + rand(-160, 160)], [C.x, C.y + 30]]);
  }

  for (const pa of M.paths) {
    for (let k = 0; k < pa.length - 1; k++) {
      const a = pa[k], b = pa[k + 1], len = dist(a[0], a[1], b[0], b[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      for (let d = 20; d < len; d += rand(52, 78)) {
        const o = rand(-22, 22), x = lerp(a[0], b[0], d / len) + nx * o, y = lerp(a[1], b[1], d / len) + ny * o;
        if (!inPlaza(x, y, 20)) M.stones.push({ x, y, rx: rand(22, 38), ry: rand(20, 34), rot: rand(TAU), c: pick(['#8e8f87', '#9c9b90', '#7f837c', '#a3a094']), moss: rand() < 0.35 });
      }
    }
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
  const tree = (x, y) => {
    if (!isClear(x, y, 46)) return;
    // leaf clusters, back-to-front: lower-right (in shade) first, upper-left (in sun) last
    const cl = [];
    for (let i = 0; i < 11; i++) { const a = rand(TAU), d = Math.sqrt(rand()) * 0.6; cl.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.78, r: rand(0.32, 0.5), s: rand(0.4, 1) }); }
    cl.sort((p, q) => (q.dy + q.dx * 0.4) - (p.dy + p.dx * 0.4));
    G.obstacles.push({ k: 'tree', x, y, r: 12, cr: rand(46, 72), pal: pick(TREE_PALS), cl });
  };
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
      for (let dx = -hw; dx < hw; dx += 9) blades.push({ dx: dx + rand(-3, 3), h: rand(22, 34), c: pick(['#3b8232', '#519c40', '#6fb854']) });
      M.grassRows.push({ x: g.x, y: g.y + j * g.r, blades });
    }
  }
  for (let i = 0; i < 240; i++) {
    M.blobs.push({ x: rand(ARENA.w), y: rand(ARENA.h), r: rand(120, 330), c: pick(['rgba(120,180,78,0.38)', 'rgba(38,92,50,0.30)', 'rgba(150,178,84,0.26)', 'rgba(70,128,56,0.3)']) });
  }
  for (let i = 0; i < 1500; i++) {
    const x = rand(40, ARENA.w - 40), y = rand(40, ARENA.h - 40);
    if (inPlaza(x, y, 20) || M.ponds.some((o) => dist(x, y, o.x, o.y) < o.r + 20)) continue;
    const k = rand() < 0.7 ? 0 : rand() < 0.75 ? 1 : 2;
    M.tufts.push({ x, y, k, c: k === 0 ? pick(['#4c9440', '#86c25a', '#3c7c36']) : pick(['#fff', '#ffb3d1', '#b9a4ff', '#ffd76a']) });
  }
}

// The purple wall. In a run it is the edge of the floor you are fighting on: nobody walks through it.
const ARENA_R = 760;
function setArena(x, y, r) { G.zone = { x, y, r, mode: 'done', nr: 0, nx: x, ny: y }; }
function keepIn(o, pad) {
  const z = G.zone, dx = o.x - z.x, dy = o.y - z.y, d = Math.hypot(dx, dy), m = z.r - pad;
  if (d <= m || d <= 0) return false;
  o.x = z.x + (dx / d) * m; o.y = z.y + (dy / d) * m;
  return true;
}

// ---------- player ----------
function makePlayer() {
  return {
    x: 0, y: 0, z: 0, r: 14, hp: 100, maxhp: 100, armor: 0, tea: 2, speed: 320, mvx: 0, mvy: 0, stepT: 0,
    aim: -Math.PI / 2, aimD: 260, t: 0, moving: false, face: 1, vx: 0, vy: 0,
    dashT: 0, dashKind: '', dashDir: { x: 1, y: 0 }, dashHit: null, lungeT: 0, lvx: 0, lvy: 0,
    swingT: 0, swingMax: 1, swingA: 0, swingHit: true, chain: 0, chainT: 0, castT: 0, castKind: '',
    cd: { q: 0, e: 0, r: 0, d: 0 }, lock: null, moveTo: null, buf: 0, hbuf: 0, hold: 0, charge: 0, regenT: 0,
    lvl: 1, xp: 0, opened: 0, sta: 100, staMax: 100, staT: 0, staFlash: 0, denyT: 0, mv: null, mvId: '', swingDir: 1, counterT: 0, afterDash: 0,
    inv: 0, hurtT: 0, fireT: 0, teaCd: 0, zoneT: 0, hidden: false, outside: false,
    weapon: 'stapler',
    // what the upgrades you pick during a run change (see BOONS)
    boons: {}, mods: { dmg: 1, haste: 1, crit: 0, critd: 0, leech: 0, cdr: 1, ko: 1, killHeal: 0, staRegen: 1, tea: 0, waveArmor: 0, pans: 0, dash: 1, ult: 1, ultR: 1, dodge: 1, pdHeal: 0, gold: 1 },
    loot: { value: 0, counts: [0, 0, 0, 0, 0, 0] },
  };
}

function hurtPlayer(d, force, src) {
  const p = G.player;
  if (G.state !== 'play' || p.hp <= 0 || p.inv > 0 || (p.dashT > 0 && !force)) return false;
  if (G.run) d *= 0.95 * (1 + 0.15 * G.run.floor); // every floor up, everything hits harder
  if (p.armor > 0) { const ab = Math.min(p.armor, d * 0.55); p.armor -= ab; d -= ab; }
  p.hp -= d; p.regenT = 0;
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
  healPlayer(50 + p.mods.tea);
  burst(p.x, p.y, 40, 10, ['#f8e1c4', '#ff9aa2', '#fff'], { sp: 80, up: 160 });
  Sfx.play('pickup');
}
// training ground: step through the five weapons, since each one swings very differently
function cycleWeapon() {
  const p = G.player, ids = Object.keys(WEAPONS), id = ids[(ids.indexOf(p.weapon) + 1) % ids.length];
  p.weapon = id;
  floater(p.x, p.y, 84, T('w_' + id), TIER[WEAPONS[id].tier], 18, 1.5);
  ring(p.x, p.y, 60, TIER[WEAPONS[id].tier], 0.4);
  Sfx.play('pickup');
}
function giveWeapon(id) {
  const p = G.player;
  if (WEAPONS[id].tier <= WEAPONS[p.weapon].tier) return false;
  p.weapon = id;
  floater(p.x, p.y, 84, T('w_' + id), TIER[WEAPONS[id].tier], 18, 1.5);
  ring(p.x, p.y, 60, TIER[WEAPONS[id].tier], 0.4);
  return true;
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
// ---------- getting promoted ----------
// Knock-outs, boxes and signatures earn experience. Each grade up (P5, P6, ...) is more health and harder hits.
const MAX_LVL = 6;
const XP_NEED = (lvl) => 120 + lvl * 110; // paced so the last promotion lands around the fourth floor
const gradeName = (lvl) => 'P' + (4 + lvl);
function gainXp(n) {
  const p = G.player;
  if (!p || p.hp <= 0 || p.lvl >= MAX_LVL) return;
  p.xp += n;
  while (p.lvl < MAX_LVL && p.xp >= XP_NEED(p.lvl)) {
    p.xp -= XP_NEED(p.lvl); p.lvl++;
    p.maxhp += 10; p.hp = Math.min(p.maxhp, p.hp + 40); p.sta = p.staMax;
    banner(T('lvl_up', gradeName(p.lvl)), T('lvl_up_sub'), 1.8, '#ffe14d');
    ring(p.x, p.y, 110, '#ffe14d', 0.5); ring(p.x, p.y, 60, '#fff', 0.35);
    burst(p.x, p.y, 30, 26, ['#ffe14d', '#fff', '#ffb347'], { sp: 260, up: 380, life: 0.9, size: 6 });
    Sfx.play('win');
  }
  if (p.lvl >= MAX_LVL) p.xp = 0;
}

function shortName(id) {
  const parts = T('n_' + id).split(' · ');
  return (LANG.zh && parts.find((s) => /[\u4e00-\u9fff]/.test(s))) || parts[0];
}

// ---------- action combat ----------
function forTargets(fn) {
  for (const e of G.enemies) if (!e.dead && e.spawnT <= 0) fn(e);
  const b = G.boss;
  if (b && !b.gone && !b.down) fn(b);
}
// Closest thing worth hitting; with aimBias, things near the cursor direction win.
function pickTarget(p, range, aimBias) {
  let best = null, bs = 1e9;
  forTargets((t) => {
    const d = dist(p.x, p.y, t.x, t.y) - t.r;
    if (d > range) return;
    const s = d + (aimBias ? Math.abs(angDiff(p.aim, angTo(p.x, p.y, t.x, t.y))) * 90 : 0);
    if (s < bs) { bs = s; best = t; }
  });
  return best;
}
function inArc(px, py, a, reach, half, t) {
  const d = dist(px, py, t.x, t.y);
  if (d > reach + t.r) return false;
  return d < t.r + 12 || Math.abs(angDiff(a, angTo(px, py, t.x, t.y))) <= half;
}
const power = (p) => 1 + WEAPONS[p.weapon].tier * 0.15;

// Every hit you land goes through here: this is where the impact is sold.
function hitTarget(t, dmg, o) {
  const p = G.player, isBoss = !!t.def.attacks;
  if (isBoss && t.reflect > 0) {
    floater(t.x, t.y, 110, T('reflected'), '#ffd180', 16, 0.9);
    p.inv = 0; hurtPlayer(8, true, bossName(t));
    return false;
  }
  const crit = !o.nocrit && (o.crit || rand() < 0.15 + (WEAPONS[p.weapon].crit || 0) + p.mods.crit);
  dmg = Math.round(dmg * (crit ? 1.7 + p.mods.critd : 1) * p.mods.dmg * (1 + 0.07 * (p.lvl - 1)) * rand(0.92, 1.08));
  if (p.mods.leech && p.hp > 0) p.hp = Math.min(p.maxhp, p.hp + dmg * p.mods.leech);
  const big = o.heavy || crit, a = o.a, hz = 30 + (t.z || 0);
  // --- the impact ---
  floater(t.x + rand(-14, 14), t.y, 64 + rand(26), (crit ? T('crit') + ' ' : '') + dmg, crit ? '#ffe14d' : '#fff', crit ? 26 : 16 + Math.min(9, dmg / 7), 0.8);
  // contact point: between you and them, a burst of streaks thrown along the blow
  const cx0 = t.x - Math.cos(a) * t.r * 0.6, cy0 = t.y - Math.sin(a) * t.r * 0.6;
  const F = FEEL;
  G.sparks.push({ star: true, x: cx0, y: cy0, z: hz, t: 0, life: big ? 0.2 : 0.14, len: (big ? 46 : 30) * F.sparks, rot: rand(TAU) });
  for (let i = 0, n = Math.round((big ? 11 : 6) * F.sparks); i < n; i++) G.sparks.push({ x: cx0, y: cy0, z: hz, a: a + rand(-1.0, 1.0), len: rand(40, big ? 150 : 95) * (0.7 + F.sparks * 0.3), t: 0, life: rand(0.12, 0.24), w: rand(2, big ? 5.5 : 3.5), col: i % 3 ? '#fff' : '#ffd66b' });
  burst(t.x, t.y, hz, big ? 10 : 5, ['#fff', '#ffe08a', '#ffb347'], { sp: 300, up: 240, life: 0.4, size: 5 });
  if (big) { ring(t.x, t.y, 56, '#fff', 0.2); G.flash = { color: '255,255,255', t: 0.07, max: 0.07, a: 0.14 }; }
  // freeze, then shove the camera along the blow and punch the zoom
  // The freeze holds the fighters only: sparks, numbers and the camera keep moving through it (see frame()), so it
  // reads as weight rather than as a dropped frame. Hits that come in a burst (a dash through a crowd) freeze less.
  G.hitstop = Math.max(G.hitstop, F.stop[o.quick ? 0 : o.heavy ? 2 : crit ? 1 : 0]);
  if (o.fin && F.impact) G.impactT = Math.max(G.impactT || 0, F.impact); // only a finishing blow earns the beat of slow motion
  View.kx += Math.cos(a) * (big ? 13 : 4) * F.kick; View.ky += Math.sin(a) * YK * (big ? 13 : 4) * F.kick;
  View.zk = Math.max(View.zk, (big ? 0.05 : 0.014) * F.zoom);
  View.shake = Math.max(View.shake, (o.heavy ? 8 : crit ? 5 : F.lightShake) * F.shake);
  t.hitAt = G.t;
  t.recoil = Math.max(t.recoil || 0, (big ? 0.6 : 0.34) * F.recoil); // they snap back from the blow (3D rigs lean with it)
  G.combo++; G.comboT = 2.6;
  Sfx.rate = F.pitch; Sfx.play(big ? 'hit2' : 'hit', G.combo); Sfx.rate = 1;
  if (big && Input.touch && navigator.vibrate) { try { navigator.vibrate(big && o.heavy ? 28 : 14); } catch (e) { /* not allowed here */ } }
  if (isBoss) { damageBoss(t, dmg); t.flash = Math.max(t.flash || 0, F.flash); addKo(t, dmg * (o.ko != null ? o.ko : o.heavy ? 0.6 : 0.2) * (WEAPONS[p.weapon].ko || 1) * p.mods.ko); return true; }
  // --- the reaction: knocked back, and staggered out of whatever they were doing ---
  if (o.kb) { t.kx += Math.cos(a) * o.kb * F.kb; t.ky += Math.sin(a) * o.kb * F.kb; }
  if (o.stun) { t.stun = Math.max(t.stun, o.stun); if (o.air) t.air = t.stun; t.wind = 0; t.dashWind = 0; }
  else if (!(t.poiseT > G.time)) {
    // a few hits in a row and they grit their teeth: no more flinching for a moment, so they can answer back
    t.flinch = (t.flinchAt > G.time - 1.5 ? t.flinch || 0 : 0) + 1; t.flinchAt = G.time;
    if (t.flinch >= 5) { t.flinch = 0; t.poiseT = G.time + 1.6; }
    else { t.stun = Math.max(t.stun, F.flinch); t.wind = 0; t.dashWind = 0; }
  }
  damageEnemy(t, dmg);
  t.flash = Math.max(t.flash || 0, F.flash);
  return true;
}

// ---------- how a hit feels ----------
// The tuning for the moves you use most ("sharp": a long lunge in, big trails, the camera pushing in rather
// than shaking, a short beat of slow motion after a heavy hit). Every number is independent.
//   speed  swing time multiplier          at      shifts when in the swing the blow lands
//   cancel how much of the swing can be cut short by the next attack once the blow has landed
//   stop   hit-stop seconds for a light hit, a crit, a heavy hit
//   kick / shake / zoom  camera reaction   kb / flinch  knockback and stagger   recoil  how far they snap back
//   lunge / lungeT  how far and how fast you close the gap   impact  slow motion after a finishing blow, seconds
//   sparks / trail / flash  size of the effects   pitch  pitch of the hit sound   lightShake  shake on a light hit
const FEEL = { speed: 0.95, at: -0.02, cancel: 0.2, stop: [0.045, 0.07, 0.1], kick: 0.6, shake: 0.45, zoom: 1.7, kb: 1.0, flinch: 0.27, recoil: 1.0, lunge: 1.4, lungeT: 0.08, impact: 0.09, sparks: 1.7, trail: 1.6, flash: 0.12, pitch: 1.0, lightShake: 0 };

// ---------- the moveset ----------
// Light attacks string together, and a heavy attack branches off wherever you are in the string:
//   light, light, light      two sweeps and an overhead chop
//   heavy                    a lunging thrust            (also after one light)
//   light, light, heavy      a rising swing that launches
//   ..., heavy, heavy        a leaping slam with a shockwave (also after the chop)
// time / dmg / reach / arc / kb scale the weapon's own numbers; `at` is how far into the swing the blow lands.
const MOVES = {
  l1: { kind: 'sweep', dir: 1, time: 1, dmg: 1, reach: 1, arc: 1, kb: 1.25, at: 0.34 },
  l2: { kind: 'sweep', dir: -1, time: 1, dmg: 1.05, reach: 1, arc: 1, kb: 1.25, at: 0.34 },
  jab: { kind: 'sweep', dir: 1, time: 0.72, dmg: 0.75, reach: 0.95, arc: 0.9, kb: 0.6, at: 0.34 },
  l3: { kind: 'chop', dir: 1, time: 1.3, dmg: 1.55, reach: 1.18, arc: 1.2, kb: 2.1, at: 0.42, heavy: true, fin: true, ko: 0.8 },
  thrust: { kind: 'thrust', dir: 1, time: 1.35, dmg: 1.6, reach: 1.6, half: 0.3, kb: 1.9, at: 0.4, heavy: true, lunge: 95, ko: 1, cost: 12 },
  upper: { kind: 'upper', dir: -1, time: 1.4, dmg: 1.75, reach: 1.12, arc: 0.95, kb: 0.4, at: 0.42, heavy: true, air: 0.95, ko: 1.2, cost: 12 },
  slam: { kind: 'slam', dir: 1, time: 1.9, dmg: 2.5, reach: 1.3, kb: 1.2, at: 0.56, heavy: true, stun: 0.9, ko: 2, cost: 18, fin: true },
  dashcut: { kind: 'thrust', dir: 1, time: 0.9, dmg: 1.25, reach: 1.45, half: 0.36, kb: 1.5, at: 0.3, heavy: true, lunge: 120, ko: 0.6 },
};
const CHARGE_AT = [0.4, 0.85, 1.35]; // seconds of holding for charge levels 1, 2, 3
const chargeLevel = (c) => (c >= CHARGE_AT[2] ? 3 : c >= CHARGE_AT[1] ? 2 : c >= CHARGE_AT[0] ? 1 : 0);
const DODGE_COST = 22;

function nextLight(p) {
  if (p.afterDash > 0) return 'dashcut';
  const n = WEAPONS[p.weapon].n || 3, c = p.chainT > 0 && p.chain < n ? p.chain : 0;
  return c === n - 1 ? 'l3' : ['l1', 'l2', 'jab'][c];
}
function nextHeavy(p) {
  if (p.chainT <= 0) return 'thrust';
  if (p.mvId === 'thrust' || p.mvId === 'upper' || p.mvId === 'l3') return 'slam';
  return p.chain >= 2 ? 'upper' : 'thrust';
}
// A phone has one attack button, so there the string carries on by itself into the heavy moves:
// sweep, sweep, chop, launcher, slam, for as long as there is stamina to pay for them.
function nextTouch(p) {
  if (p.afterDash <= 0 && p.chainT > 0) {
    if (p.mvId === 'l3' && p.sta >= MOVES.upper.cost) return 'upper';
    if (p.mvId === 'upper' && p.sta >= MOVES.slam.cost) return 'slam';
  }
  return nextLight(p);
}
function spend(p, n) {
  if (p.sta < n) { p.staFlash = 0.4; if (p.denyT <= 0) { p.denyT = 0.4; Sfx.play('ui'); } return false; }
  p.sta -= n; p.staT = 0.7;
  return true;
}
function startMove(p, id) {
  const w = WEAPONS[p.weapon], m = MOVES[id], light = !m.cost && id !== 'dashcut', n = w.n || 3;
  const tg = p.lock || pickTarget(p, w.reach * m.reach + 150 + (m.lunge || 0), !Input.touch);
  let lunged = false;
  if (tg) {
    const d = dist(p.x, p.y, tg.x, tg.y), a = angTo(p.x, p.y, tg.x, tg.y);
    if (Input.touch || p.lock || Math.abs(angDiff(p.aim, a)) < 1.3) {
      p.aim = a;
      // close the gap so the blow lands
      const gap = Math.min(d - w.reach * m.reach * 0.6 - tg.r, (115 + (m.lunge || 0)) * FEEL.lunge), lt = FEEL.lungeT;
      if (gap > 8) { p.lungeT = lt; p.lvx = (Math.cos(a) * gap) / lt; p.lvy = (Math.sin(a) * gap) / lt; lunged = true; }
      else if (m.lunge) lunged = true;
    }
  }
  if (m.lunge && !lunged) { p.lungeT = 0.12; p.lvx = (Math.cos(p.aim) * m.lunge) / 0.12; p.lvy = (Math.sin(p.aim) * m.lunge) / 0.12; }
  if (light) p.chain = p.chainT > 0 && p.chain < n ? p.chain + 1 : 1;
  p.mv = m; p.mvId = id; p.swingDir = m.dir;
  p.swingT = p.swingMax = (w.swing * m.time * FEEL.speed) / p.mods.haste;
  p.chainT = id === 'slam' ? 0 : p.swingMax + 0.8;
  if (id === 'slam') p.chain = 0;
  p.swingA = p.aim; p.swingHit = false; p.fireT = 1.2; p.afterDash = 0; p.swingN = (p.swingN || 0) + 1;
  Sfx.play('slash', m.heavy ? 3 : p.chain);
}
const startSwing = (p) => startMove(p, nextLight(p)); // a plain tap of the attack button
function resolveSwing(p) {
  const w = WEAPONS[p.weapon], m = p.mv || MOVES.l1, a = p.swingA, ctr = p.counterT > 0;
  const reach = w.reach * m.reach, dmg = w.dmg * m.dmg * (ctr ? 1.6 : 1);
  let landed = false;
  if (m.kind === 'slam') {
    // comes down in front of you and hits everything around the impact
    const cx = p.x + Math.cos(a) * reach * 0.5, cy = p.y + Math.sin(a) * reach * 0.5, R = reach * 0.95;
    ring(cx, cy, R, '#ffe08a', 0.4); ring(cx, cy, R * 0.55, '#fff', 0.28);
    G.slashes.push({ x: cx, y: cy, a, reach: R, half: Math.PI, t: 0, life: 0.3, col: '#ffe08a', fin: true, dir: 1 });
    burst(cx, cy, 4, 22, ['#fff', '#ffe08a', '#d9c98f'], { sp: 360, up: 300, life: 0.6, size: 7 });
    View.shake = Math.max(View.shake, 10);
    Sfx.play('boom');
    forTargets((t) => {
      if (dist(cx, cy, t.x, t.y) < R + t.r) landed = hitTarget(t, dmg, { a: angTo(p.x, p.y, t.x, t.y), kb: w.kb * m.kb, heavy: true, fin: true, stun: m.stun, ko: m.ko, crit: ctr }) || landed;
    });
  } else {
    const half = m.half || w.arc * m.arc;
    G.slashes.push({ x: p.x, y: p.y, a, reach: reach * (0.9 + FEEL.trail * 0.1), half, t: 0, life: (m.heavy ? 0.28 : 0.2) * FEEL.trail, col: TIER[w.tier], fin: !!m.heavy, dir: p.swingDir, line: m.kind === 'thrust' });
    forTargets((t) => {
      if (inArc(p.x, p.y, a, reach, half, t)) landed = hitTarget(t, dmg, { a: angTo(p.x, p.y, t.x, t.y), kb: w.kb * m.kb, heavy: !!m.heavy, fin: !!m.fin, stun: m.air || (m.fin ? w.stun3 || 0 : 0), air: !!m.air, ko: m.ko, crit: ctr }) || landed;
    });
  }
  if (landed && ctr) { p.counterT = 0; floater(p.x, p.y, 112, T('counter'), '#8fe8ff', 22, 1.1); }
}
// Charged attack: a spin that launches everything around you. lv is the charge level, 1 to 3.
function slam(p, lv) {
  const R = [0, 125, 155, 195][lv], w = WEAPONS[p.weapon];
  ring(p.x, p.y, R, '#ffe08a', 0.4);
  if (lv === 3) ring(p.x, p.y, R * 1.25, '#fff', 0.55);
  G.slashes.push({ x: p.x, y: p.y, a: p.aim, reach: R, half: Math.PI, t: 0, life: 0.3, col: lv === 3 ? '#ff9a4a' : '#ffe08a', fin: true, dir: 1 });
  burst(p.x, p.y, 4, 16 + lv * 8, ['#fff', '#ffe08a', '#d9c98f'], { sp: 380, up: 320, life: 0.6, size: 7 });
  View.shake = Math.max(View.shake, 6 + 3 * lv);
  Sfx.play('boom');
  forTargets((t) => {
    if (dist(p.x, p.y, t.x, t.y) < R + t.r) hitTarget(t, [0, 24, 40, 64][lv] * power(p) * (w.chg || 1), { a: angTo(p.x, p.y, t.x, t.y), kb: 140, stun: 0.45 + 0.25 * lv, air: true, heavy: true, fin: lv === 3, ko: 0.6 + 0.35 * lv });
  });
}
// R: Labor Arbitration. A very large book arrives from above.
function updateUlts(dt) {
  const p = G.player;
  for (const u of G.ults) {
    u.t += dt;
    if (u.done || u.t < u.delay) continue;
    u.done = true;
    ring(u.x, u.y, u.r, '#ffcf4a', 0.5); ring(u.x, u.y, u.r * 0.6, '#fff', 0.35);
    burst(u.x, u.y, 4, 46, ['#fff', '#ffcf4a', '#c0392b', '#f0e2b0'], { sp: 520, up: 420, life: 0.9, size: 8 });
    View.shake = 18; G.hitstop = Math.max(G.hitstop, 0.14);
    G.flash = { color: '255,225,120', t: 0.3, max: 0.3, a: 0.35 };
    Sfx.play('ult');
    forTargets((t) => {
      if (dist(u.x, u.y, t.x, t.y) < u.r + t.r) hitTarget(t, 90 * power(p) * p.mods.ult, { a: angTo(u.x, u.y, t.x, t.y), kb: 200, stun: 1.5, air: true, heavy: true, nocrit: true });
    });
  }
  G.ults = G.ults.filter((u) => u.t < u.delay + 0.45);
  for (const s of G.slashes) s.t += dt;
  G.slashes = G.slashes.filter((s) => s.t < s.life);
}

// Is something about to land on you right now? A dodge that slips past it is a perfect dodge.
function threatSoon(p) {
  for (const e of G.enemies) {
    if (e.dead || Math.abs(e.x - p.x) > 320) continue;
    if (e.type === 'rival') {
      const w = WEAPONS[e.w];
      if (e.wind > 0 && e.wind < 0.32 && inArc(e.x, e.y, e.windA, w.reach + 30, w.arc + 0.25, p)) return true;
      if ((e.dashT > 0 || (e.dashWind > 0 && e.dashWind < 0.24)) && distToSeg(p.x, p.y, e.x, e.y, e.x + Math.cos(e.dashA) * 260, e.y + Math.sin(e.dashA) * 260) < 50) return true;
    } else if (!e.asleep && e.spawnT <= 0 && e.def.kind !== 'shooter' && e.atkCd <= 0.25 && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 26) return true;
  }
  for (const z of G.zones) if (!z.done && z.delay - z.t < 0.32 && inZone(z, p.x, p.y, 4)) return true;
  for (const b of G.ebullets) {
    const dx = p.x - b.x, dy = p.y - b.y;
    if (Math.hypot(dx, dy) < 80 && dx * b.vx + dy * b.vy > 0) return true;
  }
  return false;
}

function updatePlayer(dt) {
  const p = G.player;
  p.t += dt;
  p.inv = Math.max(0, p.inv - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.fireT -= dt; p.teaCd -= dt; p.chainT -= dt; p.counterT -= dt; p.afterDash -= dt; p.staFlash -= dt; p.denyT -= dt;
  // one warning tone as health drops into the red
  { const lowNow = p.hp > 0 && p.hp <= p.maxhp * 0.35; if (lowNow && !p.lowWarn) Sfx.play('warn'); p.lowWarn = lowNow; }
  // stamina: dodges, heavy attacks and charging spend it; it comes back after a short breather
  if ((p.staT -= dt) <= 0) p.sta = Math.min(p.staMax, p.sta + 38 * p.mods.staRegen * dt);
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  if ((G.comboT -= dt) <= 0) G.combo = 0;
  // catch your breath: health creeps back once nothing has hit you for a while
  // (only up to half: the rest has to come from bubble tea, upgrades and signatures, or waiting would be free)
  if ((p.regenT += dt) > 6 && p.hp > 0 && p.hp < p.maxhp * 0.5) p.hp = Math.min(p.maxhp * 0.5, p.hp + 2.5 * dt);
  const free = p.castT <= 0 && p.dashT <= 0;
  const stick = Input.moveVec();
  let mx = stick.x, my = stick.y;
  if (mx || my) p.moveTo = null;
  else if (p.moveTo) {
    const d = dist(p.x, p.y, p.moveTo.x, p.moveTo.y);
    if (d < 10) p.moveTo = null; else { mx = (p.moveTo.x - p.x) / d; my = (p.moveTo.y - p.y) / d; }
  }
  const moving = Math.hypot(mx, my) > 0.1;
  const press = (btn, ...keys) => { let v = Input.take('btn_' + btn); for (const k of keys) v = Input.take(k) || v; return v; };
  const body = Input.touch ? null : screenToWorld(Input.mouse.x, Input.mouse.y, 26);

  // lock-on: Tab or middle-click picks whoever is nearest the cursor (or nearest you)
  if (press('lock', 'mclick', 'Tab')) {
    if (p.lock) p.lock = null;
    else {
      let best = null, bd = 190;
      if (body) forTargets((t) => { const d = dist(body.x, body.y, t.x, t.y); if (d < bd) { bd = d; best = t; } });
      p.lock = best || pickTarget(p, 520, false);
      if (p.lock) Sfx.play('ui');
    }
  }
  const lk = p.lock;
  if (lk && (lk.dead || lk.down || lk.gone || lk.hp <= 0 || dist(p.x, p.y, lk.x, lk.y) > 720)) p.lock = null;

  const idle = free && p.swingT <= 0;
  // once a blow has landed, the tail of the swing can be cut short by the next attack
  const canAtk = free && (p.swingT <= 0 || (p.swingHit && p.swingT <= p.swingMax * FEEL.cancel));
  const aimCursor = () => {
    if (p.lock) p.aim = angTo(p.x, p.y, p.lock.x, p.lock.y);
    else if (body) p.aim = angTo(p.x, p.y, body.x, body.y);
  };
  if (idle) { if (p.lock) aimCursor(); else if (moving && p.charge <= 0) p.aim = Math.atan2(my, mx); }

  // where a skill goes: your lock, else the cursor (PC) or a dragged direction / nearest target (touch)
  const aimSkill = (range) => {
    if (p.lock) { aimCursor(); return { tg: p.lock, d: dist(p.x, p.y, p.lock.x, p.lock.y) }; }
    if (!Input.touch) { aimCursor(); return { tg: null, d: dist(p.x, p.y, body.x, body.y) }; }
    const ca = Input.castAim;
    Input.castAim = null;
    if (ca) { p.aim = ca.a; return { tg: null, d: ca.d * range }; }
    const tg = pickTarget(p, range, false);
    if (tg) p.aim = angTo(p.x, p.y, tg.x, tg.y);
    return { tg, d: range * 0.6 };
  };
  const begin = (k) => { p.cd[k] = SKILL_CD[k] * p.mods.cdr; p.swingT = 0; p.lungeT = 0; p.charge = 0; p.hold = 0; p.fireT = 1.2; };

  // attack: light and heavy presses run the moveset; holding light winds up a three-level charged spin
  const atkHeld = Input.mouse.down || !!Input.keys.KeyJ || !!Input.keys.btn_atk;
  if (press('atk', 'lclick', 'KeyJ')) p.buf = 0.35;
  if (press('hvy', 'rclick', 'KeyK')) p.hbuf = 0.35;
  if (p.hbuf > 0) {
    p.hbuf -= dt;
    if (canAtk && p.charge < CHARGE_AT[0]) {
      p.hbuf = 0; p.buf = 0;
      const id = nextHeavy(p);
      if (spend(p, MOVES[id].cost)) { if (!Input.touch) aimCursor(); startMove(p, id); }
    }
  }
  if (p.buf > 0) {
    p.buf -= dt;
    if (canAtk && p.charge < CHARGE_AT[0]) {
      p.buf = 0;
      if (!Input.touch) { aimCursor(); startSwing(p); }
      else { const id = nextTouch(p); if (MOVES[id].cost) spend(p, MOVES[id].cost); startMove(p, id); }
    }
  }
  if (atkHeld && idle) {
    if ((p.hold += dt) > 0.18 && p.sta > 0) {
      const was = chargeLevel(p.charge);
      p.charge = Math.min(CHARGE_AT[2] + 0.1, p.charge + dt);
      p.sta = Math.max(0, p.sta - 13 * dt); p.staT = 0.7;
      const lv = chargeLevel(p.charge);
      if (lv > was) { ring(p.x, p.y, 40 + lv * 16, lv === 3 ? '#ff9a4a' : '#ffe08a', 0.3); Sfx.play('ui', lv); p.chargeFlash = 0.18; }
    }
  } else if (!atkHeld) {
    const lv = chargeLevel(p.charge);
    if (lv && free) { p.swingT = 0; p.fireT = 1.2; p.castT = p.castMax = lv === 3 ? 0.3 : 0.18; p.castKind = 'spin'; p.chainT = 0; slam(p, lv); }
    p.charge = 0; p.hold = 0;
  }
  p.chargeFlash = Math.max(0, (p.chargeFlash || 0) - dt);

  // dodge: a hop with a moment of invulnerability; time it against an attack for a perfect dodge
  if (press('d', 'Space') && free && p.cd.d <= 0 && spend(p, DODGE_COST * p.mods.dodge)) {
    const m = Math.hypot(mx, my);
    p.dashDir = m > 0.1 ? { x: mx / m, y: my / m } : { x: -Math.cos(p.aim), y: -Math.sin(p.aim) };
    p.dashT = 0.22; p.dashKind = 'd'; p.cd.d = SKILL_CD.d; p.swingT = 0; p.charge = 0; p.hold = 0;
    Sfx.play('dash');
    if (threatSoon(p)) {
      G.slowT = 1.8; p.cd.d = 0.35; p.inv = 0.6;
      p.counterT = 2.4; p.sta = Math.min(p.staMax, p.sta + 40); // your next blow is a counter
      if (p.mods.pdHeal) healPlayer(p.mods.pdHeal);
      floater(p.x, p.y, 100, T('perfect'), '#8fe8ff', 24, 1.3);
      G.flash = { color: '170,225,255', t: 0.35, max: 0.35, a: 0.4 };
      Sfx.play('safe');
    }
  }
  if (press('q', 'KeyQ', 'Digit1') && free && p.cd.q <= 0) {
    aimSkill(460); begin('q');
    p.castT = 0.12; p.castKind = 'q';
    const pan = (a) => G.bullets.push({ id: 'pan', x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, z: 26, vx: Math.cos(a) * 800, vy: Math.sin(a) * 800, r: 13, dmg: 22 * power(p), life: 0.58, t: 0 });
    pan(p.aim);
    for (let i = 1; i <= p.mods.pans; i++) { pan(p.aim + i * 0.26); pan(p.aim - i * 0.26); }
    Sfx.play('slash');
  }
  if (press('e', 'KeyE', 'ShiftLeft', 'ShiftRight', 'Digit2') && free && p.cd.e <= 0) {
    aimSkill(330); begin('e');
    p.dashDir = { x: Math.cos(p.aim), y: Math.sin(p.aim) };
    p.dashT = 0.18; p.dashKind = 'e'; p.dashHit = new Set();
    G.slashes.push({ x: p.x, y: p.y, a: p.aim, reach: 270, half: 0.16, t: 0, life: 0.28, col: '#8fe8ff', fin: true, dir: 1, line: true });
    Sfx.play('dash'); Sfx.play('slash');
  }
  if (press('r', 'KeyR', 'Digit3') && free && p.cd.r <= 0) {
    const s = aimSkill(360), d = clamp(s.d, 60, 340);
    begin('r');
    G.ults.push({ x: s.tg ? s.tg.x : p.x + Math.cos(p.aim) * d, y: s.tg ? s.tg.y : p.y + Math.sin(p.aim) * d, t: 0, delay: 0.6, r: 170 * p.mods.ultR });
    p.castT = 0.25; p.castKind = 'r';
    Sfx.play('warn');
  }
  if (Input.take('KeyF') | Input.take('btn_tea')) useTea();
  if (G.training && Input.take('KeyB')) cycleWeapon();

  if (p.castT > 0) p.castT -= dt;
  if (p.swingT > 0) {
    p.swingT -= dt;
    if (!p.swingHit && p.swingT <= p.swingMax * (1 - clamp((p.mv ? p.mv.at : 0.32) + FEEL.at, 0.15, 0.7))) { p.swingHit = true; resolveSwing(p); }
  }

  let vx, vy;
  if (p.dashT > 0) {
    p.dashT -= dt;
    if (p.dashT <= 0 && p.dashKind === 'd') p.afterDash = 0.4; // attack out of a dodge for a dash cut
    const sp = p.dashKind === 'e' ? 1500 : 900;
    vx = p.dashDir.x * sp; vy = p.dashDir.y * sp;
    part(p.x, p.y, rand(8, 40), { vx: -vx * 0.06, vy: -vy * 0.06, life: 0.25, color: p.dashKind === 'e' ? '#8fe8ff' : '#fff', size: 8, grav: 0, round: true });
    if (p.dashKind === 'e') {
      forTargets((t) => {
        if (p.dashHit.has(t) || dist(p.x, p.y, t.x, t.y) > t.r + 40) return;
        p.dashHit.add(t);
        hitTarget(t, 24 * power(p) * p.mods.dash, { a: Math.atan2(vy, vx) + pick([-0.9, 0.9]), kb: 280, heavy: true, quick: true });
      });
    }
  } else if (p.lungeT > 0) { p.lungeT -= dt; vx = p.lvx; vy = p.lvy; }
  else {
    // run: velocity eases towards the stick so starts and turns feel planted, not robotic
    const f = p.castT > 0 ? 0 : p.swingT > 0 ? 0.5 : p.charge > 0 ? 0.6 : 1, m = Math.max(1, Math.hypot(mx, my));
    const tx = (mx / m) * p.speed * f, ty = (my / m) * p.speed * f, k = 1 - Math.pow(tx || ty ? 1e-7 : 1e-10, dt);
    p.mvx += (tx - p.mvx) * k; p.mvy += (ty - p.mvy) * k;
    vx = p.mvx; vy = p.mvy;
    if (Math.hypot(vx, vy) > p.speed * 0.8 && (p.stepT -= dt) <= 0) {
      p.stepT = 0.16;
      part(p.x - vx * 0.03, p.y - vy * 0.03, 2, { vx: -vx * 0.12 + rand(-20, 20), vy: -vy * 0.12 + rand(-20, 20), vz: rand(30, 70), life: 0.35, color: '#ebe1c8', size: rand(6, 10), grav: 60, round: true });
    }
  }
  if (p.dashT > 0 || p.lungeT > 0) { p.mvx = vx * 0.3; p.mvy = vy * 0.3; }
  p.vx = vx; p.vy = vy;
  p.x += vx * dt; p.y += vy * dt;
  p.moving = moving && p.castT <= 0;
  pushOut(p);
  p.face = Math.cos(p.swingT > 0 ? p.swingA : p.aim) >= 0 ? 1 : -1;
  p.hidden = p.fireT <= 0 && p.dashT <= 0 && inTallGrass(p.x, p.y);

  keepIn(p, 22); // the wall around the floor
}

function damageEnemy(e, d, b) {
  if (e.type === 'rival') return damageRival(e, d, G.player);
  e.hp -= d;
  e.flash = 0.09; e.asleep = false;
  if (b && !b.lob) { const m = Math.hypot(b.vx, b.vy) || 1; e.kx += (b.vx / m) * 120; e.ky += (b.vy / m) * 120; }
  if (e.hp <= 0 && !e.dead) killEnemy(e, true);
  else if (b) Sfx.play('hit'); // melee hits make their own sound in hitTarget
}
// Whoever you finish off is sent flying along the last blow before they vanish.
function launchCorpse(e) {
  const m = Math.hypot(e.kx, e.ky), a = m > 1 ? Math.atan2(e.ky, e.kx) : rand(TAU);
  G.corpses.push({ e, x: e.x, y: e.y, z: e.z || 0, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, vz: 300, rot: 0, vr: (Math.cos(a) >= 0 ? 1 : -1) * rand(9, 14), t: 0 });
  G.hitstop = Math.max(G.hitstop, 0.09);
  View.zk = Math.max(View.zk, 0.045);
}
function killEnemy(e, byPlayer) {
  e.dead = true;
  if (byPlayer) launchCorpse(e); else poof(e.x, e.y);
  if (!byPlayer) return;
  gainXp(12);
  if (G.player.mods.killHeal) healPlayer(G.player.mods.killHeal);
  Sfx.play('kill');
  if (rand() < 0.14) dropItem(e.x, e.y, { kind: 'tea' });
  else if (rand() < 0.2) dropItem(e.x, e.y, rollVal(0, 1));
}

// The only projectiles left: your thrown pan (Q) and the sidekicks' claws and tokens.
function updateBullets(dt) {
  const boss = G.boss;
  for (const b of G.bullets) {
    b.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.t > b.life || inObstacle(b.x, b.y)) { b.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.spawnT > 0 || e.dead || Math.abs(b.x - e.x) > 40 || dist(b.x, b.y, e.x, e.y) > e.r + b.r + 2) continue;
      if (b.id === 'pan') hitTarget(e, b.dmg, { a: Math.atan2(b.vy, b.vx), kb: 220, stun: 0.7, heavy: true });
      else damageEnemy(e, b.dmg, b);
      b.dead = true;
      break;
    }
    if (!b.dead && boss && !boss.gone && !boss.down && dist(b.x, b.y, boss.x, boss.y) < boss.r + b.r) {
      if (b.id === 'pan') hitTarget(boss, b.dmg, { a: 0, heavy: true });
      else if (boss.reflect <= 0) damageBoss(boss, b.dmg);
      b.dead = true;
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
}

// ---------- minions ----------
function spawnEnemy(type, x, y) {
  const d = ENEMY[type];
  const e = {
    type, def: d, x, y, z: 0, r: d.r, hp: d.hp, maxhp: d.hp, t: rand(10), spawnT: 0.6, aggro: 360,
    atkCd: rand(0.3, 0.8), shootCd: rand(1.2, 2.6), face: 1, flash: 0, kx: 0, ky: 0, strafe: pick([-1, 1]), stun: 0, air: 0,
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
    if (e.stun > 0) {
      e.stun -= dt;
      e.z = e.air > 0 ? Math.sin(Math.PI * clamp(1 - e.stun / e.air, 0, 1)) * 44 : e.z;
      if (e.stun <= 0) { e.air = 0; e.z = 0; }
      e.x += e.kx * dt; e.y += e.ky * dt;
      const dm = Math.pow(0.002, dt);
      e.kx *= dm; e.ky *= dm;
      pushOut(e, true);
      if (e.wave) keepIn(e, e.r + 4);
      continue;
    }
    const d = dist(e.x, e.y, p.x, p.y);
    if (e.asleep) { if (d < (p.hidden ? 170 : e.aggro)) e.asleep = false; else continue; }
    if (d > 1100 && !e.wave) { e.asleep = true; continue; }
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
    if (e.wave) keepIn(e, e.r + 4);
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

// ---------- rivals: colleagues who would rather it was you ----------
const RIVAL_KITS = [
  { hp: 80, armor: 0, sight: 340, spread: 0.2, tea: 0, speed: 210, ws: ['stapler', 'stapler', 'fan'], loot: [100, 700] },
  { hp: 110, armor: 25, sight: 370, spread: 0.15, tea: 1, speed: 222, ws: ['fan', 'keyboard', 'fan'], loot: [500, 3000] },
  { hp: 140, armor: 60, sight: 400, spread: 0.11, tea: 2, speed: 235, ws: ['keyboard', 'board', 'book'], loot: [2500, 9000] },
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

function spawnRival(x, y, lvl = 0) {
  const kit = RIVAL_KITS[lvl];
  const e = {
    type: 'rival', def: ENEMY.rival, x, y, z: 0, r: 14, hp: kit.hp, maxhp: kit.hp, armor: kit.armor, lvl,
    w: pick(kit.ws), sight: kit.sight, spread: kit.spread, tea: kit.tea, speed: kit.speed, loot: Math.round(rand(kit.loot[0], kit.loot[1])),
    t: rand(10), spawnT: 0, think: rand(0.5), fireCd: rand(1), healCd: 0, kx: 0, ky: 0, stun: 0, air: 0,
    wind: 0, windMax: 1, windA: 0, atkCd: rand(0.5), dashWind: 0, dashT: 0, dashA: 0, dashHit: false, skillCd: rand(3, 8), ranged: rand() < 0.2, strafe: pick([-1, 1]), pref: rand(200, 300), face: 1, aim: 0, flash: 0,
    state: 'wander', gx: x, gy: y, target: null, alertT: 0, stT: 0, sx0: x, sy0: y, detour: null, wait: false,
    vx: 0, vy: 0, moving: false,
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
  if (e.dummy) { e.hp = Math.max(1, e.hp - d); e.flash = 0.09; e.hurtAt = G.time; return; } // a sandbag: takes it, never falls
  if (e.armor > 0) { const ab = Math.min(e.armor, d * 0.55); e.armor -= ab; d -= ab; }
  e.hp -= d;
  e.flash = 0.09;
  if (e.hp <= 0) killRival(e, src);
}
function killRival(e, src) {
  if (e.dead) return;
  e.dead = true;
  const p = G.player, name = rivalName(e);
  if (src === p) launchCorpse(e); else poof(e.x, e.y);
  if (src === p) {
    G.kills++;
    gainXp(40 + e.lvl * 15);
    if (p.mods.killHeal) healPlayer(p.mods.killHeal);
    Sfx.play('kill');
    feed(T('feed_you', name), '#ffe08a');
    floater(e.x, e.y, 90, T('optimized'), '#ffb3b3', 15, 1.3);
  }
  if (WEAPONS[e.w].tier > WEAPONS[p.weapon].tier) dropItem(e.x, e.y, { kind: 'weapon', id: e.w });
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

// A few rivals keep their distance and throw staples instead.
function rivalFire(e, a, tg) {
  e.fireCd = rand(1.0, 1.5);
  eb(e.x, e.y, a + rand(-e.spread, e.spread), 430, { shape: 'staple', dmg: 7, r: 6, owner: e, life: 1.2 });
  if (tg === G.player && onScreen(e.x, e.y, 100)) Sfx.play('shoot');
}
// The wound-up swing lands: whoever is still inside the red wedge gets hit.
function rivalSwing(e) {
  const w = WEAPONS[e.w], a = e.windA, reach = w.reach + 6, p = G.player, dmg = Math.round(w.dmg * 0.95);
  G.slashes.push({ x: e.x, y: e.y, a, reach, half: w.arc, t: 0, life: 0.18, col: '#ff8a8a', dir: 1 });
  if (p.hp > 0 && inArc(e.x, e.y, a, reach, w.arc, p)) hurtPlayer(dmg, false, rivalName(e));
  if (onScreen(e.x, e.y, 100)) Sfx.play('slash');
}

// They all want the same thing: you. Only a couple press the attack at a time; the rest circle and wait
// for an opening, so a crowd reads as a fight and not as a blender.
function rivalThink(e) {
  const p = G.player;
  if (p.hp <= 0) { e.target = null; e.state = 'wander'; e.gx = e.x; e.gy = e.y; return; }
  e.target = p; e.state = 'fight';
  if (e.hp < e.maxhp * 0.4 && e.tea > 0 && e.healCd <= 0) { e.tea--; e.hp = Math.min(e.maxhp, e.hp + 35); e.healCd = 5; floater(e.x, e.y, 80, '+35', '#7df0a0', 14); }
  const d = dist(e.x, e.y, p.x, p.y);
  let ahead = 0;
  for (const o of G.enemies) {
    if (o === e || o.type !== 'rival' || o.dead || o.ranged || o.dummy) continue;
    if (o.wind > 0 || o.dashWind > 0 || o.dashT > 0 || dist(o.x, o.y, p.x, p.y) < d) ahead++;
  }
  e.wait = !e.ranged && ahead >= (G.run && G.run.floor >= 2 ? 3 : 2);
}

function updateRival(e, dt) {
  const p = G.player;
  e.fireCd -= dt; e.healCd -= dt; e.atkCd -= dt; e.skillCd -= dt;
  const damp = Math.pow(0.002, dt);
  e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= damp; e.ky *= damp;
  if (e.stun > 0) {
    // launched or dazed: no thinking, no swinging
    e.stun -= dt;
    e.z = e.air > 0 ? Math.sin(Math.PI * clamp(1 - e.stun / e.air, 0, 1)) * 44 : 0;
    if (e.stun <= 0) { e.air = 0; e.z = 0; }
    e.moving = false;
    pushOut(e); keepIn(e, 18);
    return;
  }
  if (e.dummy) {
    // training ground sandbag: stands its post facing you, shakes hits off, and tops itself back up
    e.aim = angTo(e.x, e.y, p.x, p.y); e.moving = false; e.wind = 0;
    if (G.time - (e.hurtAt || -9) > 1.4) { e.hp = Math.min(e.maxhp, e.hp + e.maxhp * dt); e.x += (e.hx - e.x) * Math.min(1, dt * 2); e.y += (e.hy - e.y) * Math.min(1, dt * 2); }
    pushOut(e);
    return;
  }
  if ((e.think -= dt) <= 0) { e.think = rand(0.3, 0.5); rivalThink(e); }
  let mx = 0, my = 0;
  const tg = e.state === 'fight' && e.target && !e.target.dead && (e.target !== p || p.hp > 0) ? e.target : null;
  if (e.dashT > 0) {
    // dash strike in progress
    e.dashT -= dt;
    e.x += Math.cos(e.dashA) * 1100 * dt; e.y += Math.sin(e.dashA) * 1100 * dt;
    if (!e.dashHit && p.hp > 0 && dist(e.x, e.y, p.x, p.y) < 34 && hurtPlayer(18, false, rivalName(e))) e.dashHit = true;
    pushOut(e); keepIn(e, 18);
    return;
  }
  if (e.dashWind > 0) { if ((e.dashWind -= dt) <= 0) { e.dashT = 0.22; e.dashHit = false; if (onScreen(e.x, e.y, 100)) Sfx.play('dash'); } e.moving = false; return; }
  if (e.wind > 0) { e.aim = e.windA; e.moving = false; if ((e.wind -= dt) <= 0) { rivalSwing(e); e.atkCd = rand(0.7, 1.1) * (G.run ? 1 - 0.07 * G.run.floor : 1); } return; }
  if (tg) {
    const d = dist(e.x, e.y, tg.x, tg.y), a = angTo(e.x, e.y, tg.x, tg.y);
    e.aim = a;
    if (e.ranged || e.wait) {
      const pref = e.ranged ? e.pref : 210, radial = d > pref + 50 ? 1 : d < pref - 60 ? -1 : 0;
      mx = Math.cos(a) * radial - Math.sin(a) * e.strafe * 0.8; my = Math.sin(a) * radial + Math.cos(a) * e.strafe * 0.8;
      if (e.ranged && e.fireCd <= 0 && d < e.sight + 60) rivalFire(e, angTo(e.x, e.y, tg.x + (tg.vx || 0) * 0.25, tg.y + (tg.vy || 0) * 0.25), tg);
    } else {
      const w = WEAPONS[e.w], close = w.reach + tg.r - 6;
      if (d < close && e.atkCd <= 0) { e.wind = 0.4 + w.swing * 0.5; e.windMax = e.wind; e.windA = a; }
      else if (e.lvl === 2 && e.skillCd <= 0 && d > 150 && d < 300) { e.dashWind = 0.5; e.dashA = a; e.skillCd = rand(6, 9); }
      else {
        // step in to strike, drift back out while recovering
        const radial = d > close - 12 ? 1 : e.atkCd > 0.25 ? -0.6 : 0, side = d < close + 70 ? 0.7 : 0.15;
        mx = Math.cos(a) * radial - Math.sin(a) * e.strafe * side; my = Math.sin(a) * radial + Math.cos(a) * e.strafe * side;
      }
    }
    if (rand() < dt * 0.6) e.strafe *= -1;
  } else {
    const d = dist(e.x, e.y, e.gx, e.gy);
    if (d > 14) { const a = angTo(e.x, e.y, e.gx, e.gy); mx = Math.cos(a); my = Math.sin(a); e.aim = a; }
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
  } else { e.vx = 0; e.vy = 0; }
  pushOut(e); keepIn(e, 18);
  e.face = Math.cos(e.aim) >= 0 ? 1 : -1;
  // wedged against a wall or a pond? sidestep for a moment
  if ((e.stT += dt) > 0.7) {
    if (e.moving && !e.detour && dist(e.x, e.y, e.sx0, e.sy0) < 26 && (!tg || dist(e.x, e.y, tg.x, tg.y) > 150)) e.detour = { a: e.aim + pick([-1, 1]) * rand(1.2, 1.9), t: rand(0.6, 1.2) };
    e.stT = 0; e.sx0 = e.x; e.sy0 = e.y;
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
const WEAPON_ROLL = { crate: ['fan', 'fan', 'fan', 'keyboard', 'keyboard', 'board'], locker: ['fan', 'keyboard', 'keyboard', 'board', 'board', 'book'], safe: ['keyboard', 'board', 'board', 'book', 'book'] };
// what a box can hold gets better floor by floor
const rollWeapon = (kind) => ({ kind: 'weapon', id: pick(WEAPON_ROLL[kind].filter((id) => WEAPONS[id].tier <= (G.run ? G.run.floor + 2 : 9))) });
function openContainer(k) {
  k.opened = true;
  G.player.opened++; gainXp(10);
  Sfx.play('open');
  burst(k.x, k.y, 20, 10, ['#fff', '#ffe08a'], { sp: 120, up: 200 });
  const out = (it) => dropItem(k.x, k.y + 8, it);
  if (k.kind === 'crate') {
    for (let i = randi(1, 2); i > 0; i--) { const q = rand(); out(q < 0.3 ? rollWeapon('crate') : q < 0.5 ? { kind: 'tea' } : q < 0.62 ? { kind: 'armor', amt: 35 } : rollVal(0, q > 0.93 ? 2 : 1)); }
  } else if (k.kind === 'locker') {
    for (let i = randi(2, 3); i > 0; i--) { const q = rand(); out(q < 0.28 ? rollWeapon('locker') : q < 0.42 ? { kind: 'tea' } : q < 0.58 ? { kind: 'armor', amt: 50 } : rollVal(1, q > 0.9 ? 3 : 2)); }
  } else {
    for (let i = randi(3, 4); i > 0; i--) { const q = rand(); out(q < 0.2 ? rollWeapon('safe') : q < 0.24 ? { kind: 'tea' } : q < 0.38 ? { kind: 'armor', amt: 100 } : rollVal(2, q > 0.88 ? 4 : 3)); }
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
  else if (k.kind === 'weapon') { if (!giveWeapon(k.id)) return false; }
  else {
    const v = Math.round(k.value * p.mods.gold);
    p.loot.value += v; p.loot.counts[k.tier]++;
    floater(p.x, p.y, 84, T(k.key) + '  +¥' + v.toLocaleString('en-US'), TIER[k.tier], k.tier >= 3 ? 19 : 15, 1.6);
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
    // once a floor is quiet, everything on it comes to you
    const calm = G.run && G.run.calm && k.t > 0.9;
    if (!calm && Math.abs(k.x - p.x) > 90) continue;
    const d = dist(k.x, k.y, p.x, p.y);
    if ((d > 80 && !(calm && d < 1700)) || k.t < 0.4) continue;
    if ((k.kind === 'tea' && p.tea >= 6) || (k.kind === 'armor' && p.armor >= 100) || (k.kind === 'weapon' && WEAPONS[k.id].tier <= WEAPONS[p.weapon].tier)) continue;
    if (d > 26) { const a = angTo(k.x, k.y, p.x, p.y), sp = Math.min(calm ? 1100 : 420, d / dt); k.x += Math.cos(a) * sp * dt; k.y += Math.sin(a) * sp * dt; }
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
  if (rand() < dt * 1.1 && G.wind.length < 5) G.wind.push({ x: rand(-0.2, 0.8), y: rand(0.1, 0.9), t: 0, life: rand(1.4, 2.2), len: rand(0.12, 0.22), cx: View.cam.x, cy: View.cam.y });
  for (const w of G.wind) w.t += dt;
  G.wind = G.wind.filter((w) => w.t < w.life);
  if (G.flash && (G.flash.t -= dt) <= 0) G.flash = null;
  if (G.banner && (G.banner.t += dt) >= G.banner.dur) G.banner = null;
  for (const s of G.sparks) s.t += dt;
  G.sparks = G.sparks.filter((s) => s.t < s.life);
  for (const c of G.corpses) {
    c.t += dt; c.vz -= 900 * dt;
    c.x = clamp(c.x + c.vx * dt, 20, ARENA.w - 20); c.y = clamp(c.y + c.vy * dt, 20, ARENA.h - 20); c.z = Math.max(0, c.z + c.vz * dt);
    c.rot += c.vr * dt;
    if (c.t > 0.1 && c.z <= 0) { c.dead = true; poof(c.x, c.y); }
  }
  G.corpses = G.corpses.filter((c) => !c.dead);
  G.boomCd -= dt;
  View.shake = Math.max(0, View.shake - dt * 42);
  // the camera kick and zoom punch spring back fast
  const kd = Math.pow(1e-6, dt);
  View.kx *= kd; View.ky *= kd; View.zk *= Math.pow(1e-4, dt);
}
