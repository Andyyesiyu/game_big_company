'use strict';
// ---------- the run ----------
// One run is five companies, one after another. On each floor: clear two waves, then its CEO walks out.
// Every stage you clear pays a choice of three upgrades, and they stack until the run ends.
// Lose and you keep half of what you carried; make all five sign and you keep the lot, plus a bonus.
const FLOORS = ['pony', 'yiming', 'elon', 'sam', 'dario'];
const BOSS_HP = [1.3, 1.8, 2.3, 2.9, 4]; // later CEOs meet a stronger you
// colleagues per wave, by level (0 intern, 1 regular, 2 grinder)
const WAVE_RIVALS = [
  [[0], [0, 0], [0, 1], [1, 1], [1, 1, 2]],
  [[0, 1], [0, 1, 1], [1, 1, 2], [1, 2, 2], [1, 2, 2, 2]],
];
const CLEAR_BONUS = 50000;

// The upgrades. max: how many times one can be taken; ok: only offered when it would do something.
const BOONS = [
  { id: 'dmg', icon: '📈', max: 5, apply(p) { p.mods.dmg += 0.2; } },
  { id: 'haste', icon: '⏱️', max: 4, apply(p) { p.mods.haste += 0.12; } },
  { id: 'crit', icon: '🎯', max: 4, apply(p) { p.mods.crit += 0.12; } },
  { id: 'critd', icon: '💥', max: 3, apply(p) { p.mods.critd += 0.4; } },
  { id: 'leech', icon: '🧲', max: 3, apply(p) { p.mods.leech += 0.03; } },
  { id: 'hp', icon: '❤️', max: 5, apply(p) { p.maxhp += 30; p.hp = Math.min(p.maxhp, p.hp + 60); } },
  { id: 'sta', icon: '☕', max: 3, apply(p) { p.staMax += 30; p.mods.staRegen += 0.25; p.sta = p.staMax; } },
  { id: 'cdr', icon: '⚡', max: 3, apply(p) { p.mods.cdr *= 0.82; } },
  { id: 'ko', icon: '🔨', max: 3, apply(p) { p.mods.ko += 0.4; } },
  { id: 'kill', icon: '🍻', max: 3, apply(p) { p.mods.killHeal += 6; } },
  { id: 'speed', icon: '👟', max: 3, apply(p) { p.speed += 30; } },
  { id: 'tea', icon: '🧋', max: 3, apply(p) { p.tea = Math.min(6, p.tea + 2); p.mods.tea += 20; } },
  { id: 'armor', icon: '👔', max: 2, apply(p) { p.mods.waveArmor += 40; p.armor = Math.min(100, p.armor + 50); } },
  { id: 'weapon', icon: '🛠️', max: 4, ok: (p) => WEAPONS[p.weapon].tier < 4, apply(p) { const ids = Object.keys(WEAPONS), t = WEAPONS[p.weapon].tier; giveWeapon(ids.find((id) => WEAPONS[id].tier === t + 1) || p.weapon); } },
  { id: 'pans', icon: '🍳', max: 2, apply(p) { p.mods.pans += 1; } },
  { id: 'dash', icon: '🕘', max: 2, apply(p) { p.mods.dash += 0.8; } },
  { id: 'ult', icon: '⚖️', max: 2, apply(p) { p.mods.ult += 0.4; p.mods.ultR += 0.3; } },
  { id: 'dodge', icon: '🐟', max: 2, apply(p) { p.mods.dodge *= 0.65; p.mods.pdHeal += 12; } },
  { id: 'gold', icon: '💰', max: 2, apply(p) { p.mods.gold += 0.5; } },
];
const boonById = (id) => BOONS.find((b) => b.id === id);

function startRun() {
  G.run = { floor: 0, stage: 'ready', t: 0, wave: 0, total: 0, left: 0, calm: true, picks: [], offer: null, boss: null, pl: null, exit: null, waveId: 0 };
  enterFloor(0);
}

// Arrive on a floor: you step off the shuttle at the south side of the plaza and the wall goes up around it.
function enterFloor(i) {
  const run = G.run, id = FLOORS[i], p = G.player, pl = G.map.plazas.find((q) => q.id === id);
  run.floor = i; run.pl = pl; run.boss = G.bosses.find((b) => b.id === id); run.exit = G.exits.find((e) => e.poi === id);
  run.stage = 'ready'; run.t = 2.1; run.wave = 0; run.calm = true; // the floor's name first, then the first wave
  for (const e of G.exits) e.open = false;
  if (G.boss) clearHazards();
  G.boss = null; G.exT = 0;
  setArena(pl.x + pl.w / 2, pl.y + pl.h / 2, ARENA_R);
  p.x = pl.x + pl.w / 2; p.y = pl.y + pl.h - 170; p.aim = -Math.PI / 2;
  p.mvx = p.mvy = 0; p.lock = null; p.moveTo = null; p.dashT = 0; p.lungeT = 0; p.swingT = 0; p.charge = 0; p.hold = 0;
  for (const q of G.pets) { q.x = p.x; q.y = p.y; }
  G.pickups = []; G.bullets = []; G.lax = G.lay = 0;
  View.cam.x = p.x; View.cam.y = p.y;
  if (i) G.flash = { color: '21,18,31', t: 0.7, max: 0.7, a: 1 };
  banner(T('fl_' + id), T('run_floor', i + 1, FLOORS.length), 2, THEMES[id].neon);
  G.quest.now = null; G.quest.tg = null;
}

// somewhere on the floor to walk in from: clear ground, not behind the building, not on top of you
function edgeSpot(lo, hi) {
  const z = G.zone, p = G.player;
  let x = z.x, y = z.y + 300;
  for (let k = 0; k < 60; k++) {
    const a = rand(TAU), d = rand(lo, hi);
    if (Math.sin(a) < -0.3) continue;
    x = z.x + Math.cos(a) * d; y = z.y + Math.sin(a) * d;
    if (!blockAt(x, y, 34) && dist(x, y, p.x, p.y) > 330) break;
  }
  return { x, y };
}
function startWave(n) {
  const run = G.run, f = run.floor, id = FLOORS[f], pl = run.pl, tag = ++run.waveId;
  // everyone on a floor is tougher than on the one below
  const enlist = (e) => { e.wave = tag; e.hp = e.maxhp = Math.round(e.maxhp * (e.type === 'rival' ? 1.3 + 0.35 * f : 1.2 + 0.5 * f)); };
  let i = 0;
  const minion = (type) => { const s = edgeSpot(n === 1 ? 240 : 380, n === 1 ? 480 : 620), e = spawnEnemy(type, s.x, s.y); e.spawnT = 0.6 + 0.12 * i++; enlist(e); };
  const kinds = POI_GUARDS[id].filter((t) => t !== 'manager');
  if (n === 1) {
    // the company's own: its AI products and whoever runs them
    for (const t of POI_GUARDS[id]) minion(t);
    for (let k = 0; k < f; k++) minion(pick(kinds));
  } else {
    for (let k = 0; k < 4 + f; k++) minion(pick(kinds));
    for (let k = 0; k < (f >= 3 ? 2 : 1); k++) minion('manager');
  }
  for (const lvl of WAVE_RIVALS[n - 1][f]) {
    const s = edgeSpot(520, 690), e = spawnRival(s.x, s.y, lvl);
    enlist(e); poof(s.x, s.y);
  }
  run.wave = n; run.stage = 'wave'; run.calm = false;
  run.total = run.left = G.enemies.reduce((c, e) => c + (e.wave === tag && !e.dead ? 1 : 0), 0);
  announce();
  Sfx.play('warn');
}
// the new objective, large, in the middle of the screen for a moment
function announce() {
  const q = G.quest;
  q.scan = 0; q.doneT = 0; q.showT = q.showMax = q.i ? 2.8 : 4; q.i++;
}
function stageDone() {
  const q = G.quest;
  q.doneT = 1.6; q.tg = null;
  Sfx.play('safe');
}

// The CEO walks out of the building once their people are down.
function bossArrive() {
  const run = G.run, b = run.boss;
  b.away = false; b.gone = false; b.inv = false; b.met = true;
  b.x = b.home.x + b.home.w / 2; b.y = b.home.y + 130;
  b.hpK = BOSS_HP[run.floor]; b.maxhp = b.hp = Math.round(b.def.hp * b.hpK);
  b.cool = 1.6; b.busy = 0;
  poof(b.x, b.y); ring(b.x, b.y, 130, THEMES[b.id].neon, 0.6);
  G.boss = b;
  run.stage = 'boss'; run.calm = false;
  announce();
  startCine(b);
}

function updateRun(dt) {
  const run = G.run, p = G.player;
  run.t -= dt;
  if (run.stage === 'ready') { if (run.t <= 0) startWave(run.wave + 1); }
  else if (run.stage === 'wave') {
    let left = 0;
    for (const e of G.enemies) if (e.wave === run.waveId && !e.dead) left++;
    run.left = left;
    if (left) return;
    // wave down: catch your breath, then pick an upgrade
    run.stage = 'cleared'; run.t = 1.2; run.calm = true;
    healPlayer(Math.round(p.maxhp * 0.15));
    if (p.mods.waveArmor) p.armor = Math.min(100, p.armor + p.mods.waveArmor);
    stageDone();
  } else if (run.stage === 'cleared') {
    if (run.t > 0) return;
    const boss = run.wave >= 2;
    offerBoons(false, () => { run.stage = boss ? 'bossIn' : 'ready'; run.t = 1.2; });
  } else if (run.stage === 'bossIn') { if (run.t <= 0) bossArrive(); }
  else if (run.stage === 'boss') {
    if (!run.boss.down) return;
    run.stage = 'signed'; run.t = 2.6; run.calm = true;
    stageDone();
  } else if (run.stage === 'signed') {
    if (run.t > 0) return;
    if (run.floor >= FLOORS.length - 1) return endMatch('clear');
    offerBoons(true, () => {
      run.stage = 'leave'; run.exit.open = true;
      banner(T('exit_open'), T('exit_open_sub'), 2.4, '#7df0a0');
      announce();
    });
  } else if (run.stage === 'leave') {
    // stand at the shuttle stop for a moment and it takes you to the next company
    if (dist(p.x, p.y, run.exit.x, run.exit.y) < run.exit.r) {
      if ((G.exT += dt) >= 1.5) { Sfx.play('safe'); enterFloor(run.floor + 1); }
    } else G.exT = Math.max(0, G.exT - dt * 2);
  }
}

// ---------- upgrades ----------
// Three to choose from. After a CEO the choice counts double.
function offerBoons(gold, next) {
  const p = G.player;
  const pool = BOONS.filter((b) => (p.boons[b.id] || 0) < b.max && (!b.ok || b.ok(p)));
  G.run.offer = { gold, list: shuffle(pool).slice(0, 3), next, at: performance.now() };
  G.state = 'boon'; G.banner = null;
  Input.pressed = {};
  Sfx.play('win');
  showBoons();
}
function takeBoon(i) {
  const run = G.run, o = run.offer, p = G.player;
  // whatever you were mashing when the choice came up does not count as an answer
  if (!o || !o.list[i] || performance.now() - o.at < 600) return;
  const b = o.list[i];
  for (let k = 0; k < (o.gold ? 2 : 1); k++) {
    if ((p.boons[b.id] || 0) >= b.max || (b.ok && !b.ok(p))) break;
    b.apply(p); p.boons[b.id] = (p.boons[b.id] || 0) + 1;
  }
  run.picks.push(b.id); run.offer = null;
  G.state = 'play'; UI.hide(); Input.pressed = {};
  floater(p.x, p.y, 110, b.icon + ' ' + T('bn_' + b.id), '#ffe14d', 20, 1.6);
  ring(p.x, p.y, 90, '#ffe14d', 0.45);
  Sfx.play('pickup');
  o.next();
}

// ---------- what to do next ----------
// One line on the HUD, always: how much of this wave is left, whose signature you are after, or where the shuttle is.
function questNow() {
  const run = G.run, p = G.player;
  if (!run) return null;
  if (run.stage === 'wave') {
    let best = null, bd = 1e9;
    for (const e of G.enemies) { if (e.dead || e.wave !== run.waveId) continue; const d = dist(p.x, p.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return { kind: 'fight', text: T(run.wave === 1 ? 'qs_wave1' : 'qs_wave2'), cur: run.total - run.left, n: run.total, reward: 'boon', tg: best };
  }
  if (run.stage === 'boss') return { kind: 'boss', text: T('qs_boss', shortName(run.boss.id)), cur: 0, n: 1, reward: 'boon2', tg: run.boss };
  if (run.stage === 'leave') return { kind: 'exit', text: T('qs_leave'), cur: 0, n: 0, reward: 0, tg: run.exit };
  return null;
}
function updateQuest(dt) {
  const q = G.quest;
  q.doneT = Math.max(0, q.doneT - dt);
  if (q.doneT <= 0) q.showT = Math.max(0, q.showT - dt);
  if ((q.scan -= dt) > 0) return;
  q.scan = 0.25;
  const s = questNow();
  if (s) { q.now = s; q.tg = s.tg; }
  else if (q.doneT <= 0) { q.now = null; q.tg = null; }
}
