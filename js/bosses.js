'use strict';
// ---------- boss framework ----------
// Each boss is a caricature with a small deck of telegraphed attacks.
// An attack schedules its beats on the boss's own timeline and returns how long it keeps the boss busy.
const after = (b, t, fn) => b.q.push({ t, fn });
const aimP = (b) => angTo(b.x, b.y, G.player.x, G.player.y);
function say(b, text, dur = 2) { b.say = text; b.sayT = dur; }
// Every boss is leashed to its own plaza; attacks are laid out relative to it.
let HOME = { x: 0, y: 0, w: ARENA.w, h: ARENA.h };
const cx = (x) => clamp(x, HOME.x + 60, HOME.x + HOME.w - 60);
const cy = (y) => clamp(y, HOME.y + 70, HOME.y + HOME.h - 60);
const bossName = (b) => T('n_' + b.id);
const ORB_R = 122; // Dario's safeguards orbit out here: slip between them to get into melee range

function makeBoss(id, home) {
  const d = BOSSES[id];
  const b = {
    id, def: d, home, x: home.x + home.w / 2, y: home.y + 130, z: 0, r: 24, hp: d.hp, maxhp: d.hp, t: rand(10), face: 1,
    q: [], busy: 0, cool: 1.6, phase: 1, flash: 0, say: null, sayT: 0, mode: 'orbit', orbitDir: pick([-1, 1]),
    stun: 0, last: -1, contactCd: 0, crowd: 0, kx: 0, ky: 0, charge: 0, reflect: 0, shield: null, data: {}, moving: false, met: false,
  };
  if (d.init) d.init(b);
  return b;
}

function damageBoss(b, d) {
  if (b.inv || b.gone || b.down) return;
  if (b.shield) {
    b.shield.hp -= d;
    b.flash = 0.06;
    Sfx.play('hit');
    if (b.shield.hp <= 0) {
      b.shield = null;
      b.mode = 'orbit'; b.stun = 1.7; b.busy = 0; b.cool = 0.3; b.q = [];
      say(b, T('q_sam_pulled'));
      burst(b.x, b.y, 40, 26, ['#ffd54f', '#a5d6a7', '#fff']);
      Sfx.play('boom');
    }
    return;
  }
  if (b.stun > 0) d *= 1.5;
  b.hp -= d;
  b.flash = 0.08;
  if (b.hp <= 0) bossDown(b);
}

function bossDown(b) {
  if (b.def.onDeath && b.def.onDeath(b)) return;
  b.down = true; b.hp = 0; b.q = []; b.shield = null; b.reflect = 0; b.charge = 0; b.mode = 'still';
  clearHazards();
  for (const e of G.enemies) if (e.type !== 'rival' && !e.asleep) killEnemy(e, false);
  say(b, T('q_sign'), 5);
  banner(T('boss_down'), T('boss_down_sub'), 3.2, '#7df0a0');
  feed(T('feed_signed', bossName(b)), '#ff8a8f');
  burst(b.x, b.y, 40, 60, ['#69f0ae', '#ffd54f', '#fff', '#4fc3f7'], { sp: 320, up: 420, life: 1.4 });
  Sfx.play('win');
  G.signed++;
  View.shake = 14;
  // the red item: a signed N+1 agreement, plus whatever was in their pockets
  dropItem(b.x, b.y + 20, { kind: 'val', key: 'v_n1', tier: 5, value: 60000 });
  dropItem(b.x, b.y + 20, rollVal(3, 4));
  dropItem(b.x, b.y + 20, rollVal(2, 3));
  dropItem(b.x, b.y + 20, { kind: 'tea' });
  dropItem(b.x, b.y + 20, { kind: 'armor', amt: 100 });
  for (const k of G.containers) if (k.poi === b.id) k.poi = null;
  if (PET_OF[b.id]) addPet(PET_OF[b.id]);
}

// a boss's scheduled beats (attack steps, Sam's comeback)
function runQueue(b, dt) {
  if (!b.q.length) return;
  for (const it of b.q) it.t -= dt;
  const due = b.q.filter((i) => i.t <= 0);
  b.q = b.q.filter((i) => i.t > 0);
  for (const it of due) it.fn();
}

function updateBoss(dt) {
  const b = G.boss;
  if (!b) return;
  const d = b.def, p = G.player;
  HOME = b.home;
  b.t += dt; b.flash -= dt; b.sayT -= dt; b.contactCd -= dt;
  runQueue(b, dt);
  if (b.gone || b.down) return;
  if (b.reflect > 0) b.reflect -= dt;
  if (b.charge > 0) b.charge -= dt;
  if (b.shield && (b.shield.t -= dt) <= 0) { const s = b.shield; b.shield = null; s.onEnd(); }
  if (d.tick) d.tick(b, dt);
  if (d.phaseAt) {
    const ph = 1 + d.phaseAt.filter((f) => b.hp / b.maxhp <= f).length;
    if (ph > b.phase) { b.phase = ph; if (d.onPhase) d.onPhase(b); }
  }
  if (b.stun > 0) { b.stun -= dt; b.moving = false; return; }
  b.moving = false;
  if (b.mode === 'orbit') {
    const a = angTo(p.x, p.y, b.x, b.y) + b.orbitDir * 0.5;
    const tx = cx(p.x + Math.cos(a) * d.dist), ty = cy(p.y + Math.sin(a) * d.dist);
    const dd = dist(b.x, b.y, tx, ty), ta = angTo(b.x, b.y, tx, ty);
    const sp = Math.min(d.speed * (1 + 0.15 * (b.phase - 1)), dd * 3);
    b.x += Math.cos(ta) * sp * dt; b.y += Math.sin(ta) * sp * dt;
    b.moving = sp > 25;
    if (rand() < dt * 0.25) b.orbitDir *= -1;
    pushOut(b);
  }
  if (b.mode !== 'charge') b.face = p.x >= b.x ? 1 : -1;
  const dp = dist(b.x, b.y, p.x, p.y);
  if (b.mode === 'charge' && dp < b.r + p.r + 6 && b.contactCd <= 0 && hurtPlayer(26, false, bossName(b))) b.contactCd = 0.7;
  // stand in a CEO's personal space for too long and you get shoved out
  b.crowd = dp < 115 ? b.crowd + dt : Math.max(0, b.crowd - dt * 0.5);
  if (b.crowd > 1.6 && b.mode !== 'charge') { b.crowd = -1.4; zone(b.x, b.y, 140, 0.6, { look: 'red', dmg: 16 }); }
  if (b.orbs && b.contactCd <= 0) {
    for (let i = 0; i < b.orbs; i++) {
      const a = b.orbA + (i / b.orbs) * TAU;
      if (dist(p.x, p.y, b.x + Math.cos(a) * ORB_R, b.y + Math.sin(a) * ORB_R) < 18 + p.r && hurtPlayer(10, false, bossName(b))) { b.contactCd = 0.6; break; }
    }
  }

  if (b.busy > 0) b.busy -= dt;
  else if ((b.cool -= dt) <= 0) {
    const deck = d.attacks.filter((a) => b.phase >= (a[1] || 1));
    let i = randi(0, deck.length - 1);
    if (deck.length > 1 && deck[i][0] === b.last) i = (i + 1) % deck.length;
    b.last = deck[i][0];
    b.busy = deck[i][0](b);
    b.cool = d.rest * (b.phase > 1 ? 0.75 : 1);
  }
}

const summonAround = (b, type, n) => {
  for (let i = 0; i < n; i++) {
    after(b, 0.3 + i * 0.14, () => {
      const a = rand(TAU);
      spawnEnemy(type, cx(b.x + Math.cos(a) * 80), cy(b.y + Math.sin(a) * 80));
    });
  }
};

// ---------- the board of directors ----------
const BOSSES = {
  // Floor 1 — the gauntlet snap that turns the headcount to dust.
  pony: {
    hp: 850, speed: 105, dist: 330, rest: 1.0, phaseAt: [0.5],
    look: { top: '#34466e', shirt: '#fff', bottom: '#2b3654', skin: '#f0c8a0', hair: '#1b1b1b', hairStyle: 'side', glasses: '#37474f', smile: true },
    onPhase(b) { say(b, T('q_pony_p2'), 2.4); Sfx.play('boss'); },
    attacks: [
      [function envelopes(b) {
        const n = b.phase > 1 ? 9 : 7;
        for (let i = 0; i < 3; i++) {
          after(b, 0.3 + i * 0.5, () => {
            const a = aimP(b);
            for (let k = 0; k < n; k++) eb(b.x, b.y, a + (k - (n - 1) / 2) * 0.16, 300, { shape: 'env', dmg: 10, r: 8 });
            Sfx.play('shoot');
          });
        }
        say(b, T('q_pony_env'));
        return 2.0;
      }],
      [function summon(b) {
        say(b, T('q_pony_summon'));
        summonAround(b, 'penguin', b.phase > 1 ? 4 : 3);
        return 1.4;
      }],
      [function snap(b) {
        b.charge = 1.3;
        say(b, T('q_pony_snap'), 1.8);
        Sfx.play('warn');
        after(b, 1.3, () => {
          const p = G.player;
          Sfx.play('snap');
          G.flash = { color: '255,214,102', t: 0.5, max: 0.5, a: 0.5 };
          View.shake = 12;
          const zs = [[p.x, p.y, 110]];
          for (let i = 0; i < 4 + b.phase; i++) zs.push([p.x + rand(-380, 380), p.y + rand(-300, 300), rand(70, 100)]);
          zs.forEach(([x, y, r], i) => zone(cx(x), cy(y), r, 0.95 + i * 0.07, { look: 'snap', dmg: 20 }));
          if (b.phase > 1) {
            const band = Math.floor(clamp(p.x - HOME.x, 0, HOME.w - 1) / (HOME.w / 3));
            rectZone(HOME.x + (band * HOME.w) / 3, HOME.y, HOME.w / 3, HOME.h, 2.1, { look: 'snap', dmg: 26 });
          }
        });
        return b.phase > 1 ? 4.0 : 3.0;
      }],
    ],
  },

  // Floor 2 — the feed never ends.
  yiming: {
    hp: 1000, speed: 118, dist: 340, rest: 0.9, phaseAt: [0.5],
    look: { top: '#607d8b', bottom: '#263238', skin: '#f0c8a0', hair: '#1b1b1b', hairStyle: 'short', glasses: '#212121' },
    onPhase(b) { say(b, T('q_ym_p2'), 2.4); Sfx.play('boss'); },
    attacks: [
      [function feed(b) {
        say(b, T('q_ym_feed'));
        const lanes = 5, h = HOME.h / lanes, hm = HOME;
        const pl = Math.floor(clamp(G.player.y - HOME.y, 0, HOME.h - 1) / h);
        const safe = clamp(pl + pick([-1, 0, 1]), 0, lanes - 1);
        const wave = (skip, delay) => {
          for (let i = 0; i < lanes; i++) {
            if (i === skip || (b.phase === 1 && i === (skip + 2) % lanes)) continue;
            rectZone(hm.x, hm.y + i * h, hm.w, h, delay, { look: 'feed', dmg: 18, linger: 0.45 });
          }
        };
        wave(safe, 1.2);
        const s2 = safe + (safe === 0 ? 1 : safe === lanes - 1 ? -1 : pick([-1, 1]));
        after(b, 1.35, () => wave(s2, 1.1));
        return 3.1;
      }],
      [function notes(b) {
        say(b, T('q_ym_algo'));
        const n = b.phase > 1 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          after(b, 0.2 + i * 0.22, () => {
            eb(b.x, b.y, aimP(b) + rand(-1.2, 1.2), 215, { shape: 'note', homing: 2.3, life: 4.2, dmg: 11, r: 10, color: pick(['#ff2d6f', '#25f4ee']), ghost: true });
            Sfx.play('plane');
          });
        }
        return 2.2;
      }],
      [function delayed(b) {
        say(b, T('q_ym_delay'));
        const p = G.player;
        for (let i = 0; i < 5 + b.phase * 2; i++) zone(cx(p.x + rand(-330, 330)), cy(p.y + rand(-260, 260)), 85, 2.3 + rand(0.6), { look: 'delay', dmg: 20 });
        return 0.9;
      }],
      [function columns(b) {
        say(b, T('q_ym_scroll'));
        const cols = 6, w = HOME.w / cols;
        const pc = Math.floor(clamp(G.player.x - HOME.x, 0, HOME.w - 1) / w);
        const safe = clamp(pc + pick([-1, 1]), 0, cols - 1);
        for (let i = 0; i < cols; i++) {
          if (i === safe || i === (safe + 3) % cols) continue;
          rectZone(HOME.x + i * w, HOME.y, w, HOME.h, 1.35, { look: 'feed', dmg: 18, linger: 0.45 });
        }
        return 2.2;
      }, 2],
    ],
  },

  // Floor 3 — rockets, flames, a very angular truck.
  elon: {
    hp: 1200, speed: 130, dist: 350, rest: 0.9, phaseAt: [0.5],
    look: {
      top: '#2d2f3a', bottom: '#2d2f3a', skin: '#eec3a2', hair: '#3e2f25', hairStyle: 'side', smile: true,
      logo(c) { c.strokeStyle = '#eceff1'; c.lineWidth = 1.8; seg(c, -4, -31, 4, -21); seg(c, 4, -31, -4, -21); ink(c); },
    },
    onPhase(b) { say(b, T('q_el_p2'), 2.4); banner(T('el_hardcore'), '', 1.6, '#ff7043'); Sfx.play('boss'); },
    tick(b, dt) {
      if (b.mode !== 'charge') return;
      b.x += Math.cos(b.data.ca) * 950 * dt; b.y += Math.sin(b.data.ca) * 950 * dt;
      b.face = Math.cos(b.data.ca) >= 0 ? 1 : -1;
      part(b.x, b.y, 6, { vx: rand(-60, 60), vy: rand(-60, 60), vz: rand(20, 120), life: 0.4, color: '#b0bec5', size: 5, grav: 100 });
      const desk = inObstacle(b.x, b.y, 14);
      if (desk && desk.desk) {
        G.obstacles.splice(G.obstacles.indexOf(desk), 1);
        burst(desk.x + desk.w / 2, desk.y + desk.d / 2, 30, 30, ['#cfd8dc', '#90a4ae', '#4fc3f7', '#263238'], { sp: 320, up: 380, life: 1 });
        View.shake = 10; Sfx.play('boom');
      }
      if (b.x < HOME.x + b.r || b.x > HOME.x + HOME.w - b.r || b.y < HOME.y + b.r || b.y > HOME.y + HOME.h - b.r) {
        b.x = clamp(b.x, HOME.x + b.r, HOME.x + HOME.w - b.r); b.y = clamp(b.y, HOME.y + b.r, HOME.y + HOME.h - b.r);
        View.shake = 16; Sfx.play('boom');
        burst(b.x, b.y, 20, 24, ['#b0bec5', '#eceff1', '#ffca28'], { sp: 260, up: 300 });
        if (--b.data.charges > 0) { b.mode = 'still'; after(b, 0.35, b.data.next); }
        else { b.mode = 'orbit'; b.stun = 1.7; b.busy = 0; b.cool = 0.4; say(b, T('q_el_crash')); }
      }
    },
    attacks: [
      [function rockets(b) {
        say(b, T('q_el_rocket'));
        const n = b.phase > 1 ? 12 : 8;
        for (let i = 0; i < n; i++) {
          after(b, 0.25 + i * 0.26, () => {
            const p = G.player;
            zone(cx(p.x + p.vx * 0.35 + rand(-50, 50)), cy(p.y + p.vy * 0.35 + rand(-50, 50)), 78, 0.85, { look: 'rocket', dmg: 20 });
          });
        }
        return 1.1 + n * 0.26;
      }],
      [function flame(b) {
        say(b, T('q_el_flame'));
        b.mode = 'still';
        const dir = pick([-1, 1]);
        laser(b, aimP(b) - dir * 1.0, { da: dir * (b.phase > 1 ? 1.35 : 1.1), tele: 0.7, life: 1.9, len: 540, width: 64, dmg: 14, look: 'flame' });
        Sfx.play('laser');
        after(b, 2.7, () => { b.mode = 'orbit'; });
        return 2.9;
      }],
      [function truck(b) {
        say(b, T('q_el_truck'));
        b.mode = 'still';
        b.data.charges = b.phase > 1 ? 2 : 1;
        b.data.next = () => {
          b.data.ca = aimP(b);
          laser(b, b.data.ca, { tele: 0.75, life: 0.02, len: 1700, width: 70, dmg: 0, look: 'warn' });
          Sfx.play('warn');
          after(b, 0.78, () => { b.mode = 'charge'; Sfx.play('laser'); });
        };
        b.data.next();
        return 8;
      }],
      [function emails(b) {
        say(b, T('q_el_mail'), 2.4);
        for (let w = 0; w < (b.phase > 1 ? 3 : 2); w++) {
          after(b, 0.3 + w * 0.55, () => {
            const n = 14, off = rand(TAU);
            for (let k = 0; k < n; k++) eb(b.x, b.y, off + (k / n) * TAU, 235, { shape: 'mail', dmg: 10, r: 8 });
            Sfx.play('shoot');
          });
        }
        return 2.1;
      }],
    ],
  },

  // Floor 4 — fired by the board, back five days later.
  sam: {
    hp: 760, speed: 125, dist: 330, rest: 0.9,
    look: { top: '#8d9aa5', bottom: '#37474f', skin: '#f1cdb0', hair: '#5d4a3a', hairStyle: 'messy' },
    onDeath(b) {
      if (b.data.revived) return false;
      b.data.revived = true;
      b.gone = true; b.inv = true; b.hp = 1; b.q = []; b.busy = 99; b.shield = null; b.mode = 'orbit';
      clearHazards();
      poof(b.x, b.y);
      Sfx.play('snap');
      banner(T('sam_fired'), T('sam_fired_sub'), 2.4, '#ffd54f');
      after(b, 2.6, () => banner(T('sam_days'), '', 1.6, '#b0bec5'));
      after(b, 4.4, () => {
        b.gone = false; b.inv = false; b.maxhp = 550; b.hp = 550; b.phase = 2; b.busy = 0; b.cool = 1;
        b.x = b.home.x + b.home.w / 2; b.y = b.home.y + 150;
        say(b, T('q_sam_back'), 2.6);
        banner(T('sam_back'), T('sam_back_sub'), 2, '#69f0ae');
        burst(b.x, b.y, 40, 30, ['#69f0ae', '#fff']);
        Sfx.play('boss');
      });
      return true;
    },
    attacks: [
      [function spiral(b) {
        say(b, T('q_sam_gpu'));
        const arms = b.phase > 1 ? 3 : 2, base = rand(TAU), dir = pick([-1, 1]);
        for (let i = 0; i < 32; i++) {
          after(b, 0.3 + i * 0.075, () => {
            for (let k = 0; k < arms; k++) eb(b.x, b.y, base + dir * i * 0.21 + (k / arms) * TAU, 225, { shape: 'chip', dmg: 9, r: 8 });
            if (i % 4 === 0) Sfx.play('shoot');
          });
        }
        return 3.0;
      }],
      [function agents(b) {
        say(b, T('q_sam_agents'));
        summonAround(b, 'agent', b.phase > 1 ? 6 : 4);
        return 1.3;
      }],
      [function raise(b) {
        say(b, T('q_sam_raise'), 2.6);
        b.mode = 'still';
        const hp = b.phase > 1 ? 105 : 80;
        b.shield = {
          hp, max: hp, t: 2.8,
          onEnd() {
            b.mode = 'orbit';
            b.hp = Math.min(b.maxhp, b.hp + Math.round(b.maxhp * 0.07));
            floater(b.x, b.y, 90, '+$40B', '#ffd54f', 24, 1.6);
            Sfx.play('pickup');
          },
        };
        return 3.0;
      }],
      [function orb(b) {
        say(b, T('q_sam_scale'));
        for (let i = 0; i < (b.phase > 1 ? 2 : 1); i++) {
          after(b, 0.3 + i * 0.6, () => {
            eb(b.x, b.y, aimP(b) + rand(-0.25, 0.25), 175, { r: 17, dmg: 16, color: '#b388ff', split: { t: 1.15, n: 10, speed: 255 }, ghost: true });
            Sfx.play('lob');
          });
        }
        return 2.2;
      }],
    ],
  },

  // Floor 5 — the safety-first final boss, escalating one ASL at a time.
  dario: {
    hp: 1350, speed: 105, dist: 340, rest: 0.9, phaseAt: [0.68, 0.36],
    look: { top: '#3f6fb5', shirt: '#e3f2fd', bottom: '#2b2f3a', skin: '#efc7a6', hair: '#3b2a20', hairStyle: 'curly', glasses: '#263238', smile: true },
    init(b) { b.orbs = 3; b.orbA = 0; },
    tick(b, dt) { b.orbA += dt * 1.7; },
    onPhase(b) {
      b.orbs = 2 + b.phase;
      banner('ASL-' + (b.phase + 1), T('asl_sub'), 1.9, '#ff8a50');
      say(b, T('q_da_asl'), 2.4);
      Sfx.play('boss');
    },
    attacks: [
      [function rings(b) {
        say(b, T('q_da_rings'));
        const waves = 2 + b.phase;
        for (let w = 0; w < waves; w++) {
          after(b, 0.3 + w * 0.62, () => {
            const n = 24, gap = rand(TAU);
            for (let k = 0; k < n; k++) {
              const a = (k / n) * TAU + w * 0.13;
              if (Math.abs(angDiff(a, gap)) < 0.45) continue;
              eb(b.x, b.y, a, 200, { shape: 'spark', dmg: 10, r: 8, color: '#ff8a50' });
            }
            Sfx.play('shoot');
          });
        }
        return 1.0 + waves * 0.62;
      }],
      [function essay(b) {
        say(b, T('q_da_essay'), 2.6);
        b.mode = 'still';
        const n = b.phase > 2 ? 3 : 2, base = aimP(b) + Math.PI / n, dir = pick([-1, 1]);
        for (let k = 0; k < n; k++) laser(b, base + (k / n) * TAU, { da: dir * (0.55 + 0.1 * b.phase), tele: 0.9, life: 3.4, len: 950, width: 34, dmg: 14, look: 'essay' });
        Sfx.play('laser');
        after(b, 4.3, () => { b.mode = 'orbit'; });
        return 4.5;
      }],
      [function refuse(b) {
        say(b, T('q_da_refuse'), 2.3);
        b.reflect = 2.3;
        for (let i = 0; i < 4; i++) {
          after(b, 0.4 + i * 0.5, () => {
            const a = aimP(b);
            for (const k of [-0.2, 0, 0.2]) eb(b.x, b.y, a + k, 270, { shape: 'spark', dmg: 10, r: 7, color: '#ffd180' });
            Sfx.play('shoot');
          });
        }
        return 2.5;
      }],
      [function grid(b) {
        say(b, T('q_da_grid'), 2.4);
        const p = G.player, sp = 190, ox = p.x - sp * 2, oy = p.y - sp * 2, par = randi(0, 1);
        const lay = (par, delay) => {
          for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
              const x = ox + i * sp, y = oy + j * sp;
              if ((i + j) % 2 === par && x > HOME.x && x < HOME.x + HOME.w && y > HOME.y && y < HOME.y + HOME.h) zone(x, y, 92, delay, { look: 'grid', dmg: 20 });
            }
          }
        };
        lay(par, 1.25);
        after(b, 1.05, () => lay(1 - par, 1.25));
        return 2.9;
      }, 2],
    ],
  },
};

// ---------- boss rendering ----------
function drawGauntlet(c, hx, hy, glow) {
  c.fillStyle = '#d4a017';
  rr(c, hx - 6, hy - 9, 12, 15, 3);
  c.fillStyle = '#f6c945';
  rr(c, hx - 5, hy - 13, 3, 6, 1.2); rr(c, hx - 1.5, hy - 14, 3, 6, 1.2); rr(c, hx + 2, hy - 13, 3, 6, 1.2);
  const gems = ['#e040fb', '#448aff', '#ff5252', '#ffab40', '#69f0ae'];
  gems.forEach((g, i) => { c.fillStyle = g; circ(c, hx - 4 + i * 2, hy - 6.5, 1.1); });
  c.fillStyle = '#ffeb3b'; circ(c, hx, hy - 1.5, 2.4);
  if (glow > 0) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(hx, hy - 12, 0, hx, hy - 12, 30 * glow + 6);
    g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(1, 'rgba(255,200,60,0)');
    c.fillStyle = g; circ(c, hx, hy - 12, 30 * glow + 6);
    c.restore();
  }
}

function drawBoss(b) {
  if (b.gone) return;
  const d = b.def, S = 1.45;
  shadow(b.x, b.y, b.r * 1.15, 0.35);
  // orbiting shield, back half
  const orbs = [];
  if (b.orbs && !b.down) {
    for (let i = 0; i < b.orbs; i++) {
      const a = b.orbA + (i / b.orbs) * TAU;
      orbs.push({ x: b.x + Math.cos(a) * ORB_R, y: b.y + Math.sin(a) * ORB_R, front: Math.sin(a) > 0 });
    }
  }
  const drawOrb = (o) => at(o.x, o.y, 30, (c) => {
    c.fillStyle = 'rgba(255,138,80,0.25)'; circ(c, 0, 0, 20);
    c.fillStyle = '#ffab70'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < 16; i++) { const r = i % 2 ? 7 : 16; c.lineTo(Math.cos((i / 16) * TAU + b.t) * r, Math.sin((i / 16) * TAU + b.t) * r); }
    c.closePath(); c.fill(); c.stroke();
  });
  orbs.filter((o) => !o.front).forEach(drawOrb);

  if (b.mode === 'charge') {
    at(b.x, b.y, 0, (c) => {
      c.scale(b.face, 1);
      c.fillStyle = '#9aa5ad';
      c.beginPath(); c.moveTo(-52, -6); c.lineTo(-48, -34); c.lineTo(-6, -58); c.lineTo(54, -30); c.lineTo(56, -6); c.closePath(); c.fill();
      c.fillStyle = '#263238';
      c.beginPath(); c.moveTo(-2, -52); c.lineTo(34, -35); c.lineTo(-2, -35); c.closePath(); c.fill();
      c.fillStyle = '#111'; circ(c, -30, -4, 11); circ(c, 34, -4, 11);
      c.fillStyle = '#fff'; c.fillRect(48, -26, 8, 3);
    });
  } else {
    const jit = b.hitAt !== undefined ? Math.max(0, 1 - (G.t - b.hitAt) / 0.2) : 0;
    lit(b.x + Math.sin(G.t * 95) * 5 * jit, b.y, 0, 190, 190, (c) => {
      if (b.flash > 0) c.scale(1.08, 0.94);
      const look = Object.assign({}, d.look, b.flash > 0 ? WHITE : null, {
        t: b.t, moving: b.moving, face: b.face, scale: S, kneel: b.down, armUp: b.charge > 0 || (b.shield && !b.down), scared: b.down || b.stun > 0, smile: d.look.smile && !b.down,
      });
      if (b.id === 'pony') look.extra = (cc, hx, hy) => drawGauntlet(cc, hx, hy, b.charge > 0 ? 1 - b.charge / 1.3 : 0);
      if (b.id === 'yiming') look.extra = (cc, hx, hy) => { cc.fillStyle = '#111'; rr(cc, hx - 3, hy - 9, 7, 12, 1.5); cc.fillStyle = '#25f4ee'; cc.fillRect(hx - 2, hy - 8, 5, 9); cc.fillStyle = '#ff2d6f'; cc.fillRect(hx - 1, hy - 6, 3, 4); };
      if (b.id === 'sam') look.extra = (cc, hx, hy) => { cc.fillStyle = 'rgba(105,240,174,0.35)'; circ(cc, hx + 2, hy - 6, 8 + Math.sin(b.t * 5) * 1.5); cc.fillStyle = '#b9f6ca'; circ(cc, hx + 2, hy - 6, 4.5); };
      if (b.id === 'elon') look.extra = (cc, hx, hy) => { cc.fillStyle = '#eceff1'; cc.beginPath(); cc.moveTo(hx + 2, hy - 16); cc.lineTo(hx + 5, hy - 4); cc.lineTo(hx - 1, hy - 4); cc.fill(); cc.fillStyle = '#ff7043'; cc.fillRect(hx, hy - 4, 4, 3 + Math.sin(b.t * 30) * 1.5); };
      if (b.id === 'dario') look.extra = (cc, hx, hy) => { cc.fillStyle = '#fff'; rr(cc, hx - 3, hy - 10, 9, 12, 1); cc.fillStyle = '#90a4ae'; for (let i = 0; i < 4; i++) cc.fillRect(hx - 2, hy - 8 + i * 2.5, 7, 1); };
      drawPerson(c, look);
    });
  }
  orbs.filter((o) => o.front).forEach(drawOrb);

  if (b.reflect > 0) {
    at(b.x, b.y, 40, (c) => {
      c.strokeStyle = `rgba(255,209,128,${0.6 + Math.sin(b.t * 20) * 0.3})`; c.lineWidth = 3;
      c.fillStyle = 'rgba(255,209,128,0.16)';
      c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.fill(); c.stroke();
    });
  }
  if (b.shield) {
    at(b.x, b.y, 40, (c) => {
      c.strokeStyle = '#ffd54f'; c.lineWidth = 5; c.globalAlpha = 0.9;
      c.beginPath(); c.arc(0, 0, 52, -Math.PI / 2, -Math.PI / 2 + TAU * (b.shield.hp / b.shield.max)); c.stroke();
      c.globalAlpha = 1; c.fillStyle = '#a5d6a7'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
      for (let i = 0; i < 6; i++) { const u = (b.t * 0.9 + i / 6) % 1; c.globalAlpha = 1 - u; c.fillText('$', Math.cos(i * 2.4) * 46 * (1 - u), -90 * (1 - u) + 30); }
      c.globalAlpha = 1;
    });
  }
  if (b.stun > 0) {
    at(b.x, b.y, 108, (c) => {
      c.fillStyle = '#ffeb3b'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
      for (let i = 0; i < 3; i++) c.fillText('✦', Math.cos(b.t * 6 + i * 2.1) * 20, Math.sin(b.t * 6 + i * 2.1) * 6);
    });
  }
  if (b.sayT > 0 && b.say) speechBubble(b.x, b.y, 122, b.say);
}
