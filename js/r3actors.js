'use strict';
// ---------- 3D renderer: characters, creatures, effects, and the 2D overlay drawn on top ----------
const GEO = {};

R3.initActors = function () {
  const sh = (g) => { g.userData.shared = true; return g; };
  Object.assign(GEO, {
    leg: sh(new THREE.CapsuleGeometry(4.4, 14, 4, 10)), shoe: sh(new THREE.CapsuleGeometry(4.4, 6, 4, 8)),
    torso: sh(new THREE.CapsuleGeometry(11.5, 9, 6, 16)), head: sh(new THREE.SphereGeometry(11.8, 20, 16)),
    hair: sh(new THREE.SphereGeometry(12.5, 20, 12, 0, TAU, 0, Math.PI * 0.56)), spike: sh(new THREE.ConeGeometry(3.4, 9, 6)),
    curl: sh(new THREE.SphereGeometry(4.6, 8, 6)), back: sh(new THREE.BoxGeometry(18, 20, 6)),
    eye: sh(new THREE.SphereGeometry(1.7, 8, 6)), arm: sh(new THREE.CapsuleGeometry(3.4, 14, 4, 10)), hand: sh(new THREE.SphereGeometry(3.6, 8, 6)),
    band: sh(new THREE.TorusGeometry(11.9, 1.9, 6, 20)), glass: sh(new THREE.TorusGeometry(3.6, 0.7, 5, 12)),
    pack: sh(new THREE.CapsuleGeometry(7, 9, 4, 10)), badge: sh(new THREE.BoxGeometry(5, 6.5, 0.8)), tie: sh(new THREE.BoxGeometry(3.4, 12, 0.8)),
    box: sh(new THREE.BoxGeometry(1, 1, 1)), ball: sh(new THREE.SphereGeometry(1, 14, 10)), cone: sh(new THREE.ConeGeometry(1, 1, 10)),
    cyl: sh(new THREE.CylinderGeometry(1, 1, 1, 14)), disc: sh(new THREE.CircleGeometry(1, 44)), plane: sh(new THREE.PlaneGeometry(1, 1)),
    ringThin: sh(new THREE.RingGeometry(0.9, 1, 56)), octa: sh(new THREE.OctahedronGeometry(1, 0)), torus: sh(new THREE.TorusGeometry(1, 0.18, 6, 22)),
  });
  this.arc = {};
  this.eyeMat = std(0x1b1b1b, { roughness: 0.3 }); this.eyeMat.userData.shared = true;
  this.shoeMat = std(0x3d2a1f); this.shoeMat.userData.shared = true;
  // particles: one point cloud
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(800 * 3), 3));
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(800 * 3), 3));
  this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false }));
  this.points.frustumCulled = false;
  this.dyn.add(this.points);
  // fireflies: a small cloud that follows you around
  const fg = new THREE.BufferGeometry(), fp = new Float32Array(70 * 3);
  this.fly = [];
  for (let i = 0; i < 70; i++) this.fly.push({ x: rand(-700, 700), y: rand(-600, 500), h: rand(20, 150), ph: rand(TAU) });
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  this.flies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 7, color: 0xeaffa0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  this.flies.frustumCulled = false;
  this.dyn.add(this.flies);
  this.colCache = {};
};
R3.color = function (s) { return this.colCache[s] || (this.colCache[s] = new THREE.Color(s)); };
// sectors for swing trails and warning wedges, cached by half-angle
R3.sector = function (half, inner) {
  const k = Math.round(Math.min(half, Math.PI) * 20) + (inner ? 'r' : 'c');
  if (!this.arc[k]) {
    const h = Math.min(half, Math.PI);
    const g = inner ? new THREE.RingGeometry(0.4, 1, 36, 1, -h, h * 2) : new THREE.CircleGeometry(1, 30, -h, h * 2);
    g.userData.shared = true;
    this.arc[k] = g;
  }
  return this.arc[k];
};
R3.get = function (kind, make) {
  const P = this.pool[kind] || (this.pool[kind] = { items: [], n: 0 });
  let it = P.items[P.n];
  if (!it) { it = make(); P.items.push(it); this.dyn.add(it); }
  P.n++;
  it.visible = true;
  return it;
};
const flat = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; return m; };
const glowMat = (c, o) => basic(c, Object.assign({ blending: THREE.AdditiveBlending, side: THREE.DoubleSide }, o));

// ---------- things you hold ----------
function weaponMesh(id) {
  const g = new THREE.Group(), b = GEO.box;
  const part = (mat, sx0, sy0, sz0, x, y, z) => { const m = mesh(g, b, mat, x, y, z); m.scale.set(sx0, sy0, sz0); return m; };
  if (id === 'stapler') { part(std(0xe5484d), 8, 20, 7, 0, -9, 0); part(std(0xc9d3dc, { metalness: 0.6 }), 6, 18, 3, 0, -9, 4); }
  else if (id === 'fan') {
    const f = mesh(g, new THREE.CircleGeometry(30, 14, Math.PI * 1.15, Math.PI * 0.7), std(0xfdfdf8, { side: THREE.DoubleSide, roughness: 0.6 }), 0, 0, 0);
    f.rotation.y = Math.PI / 2;
    part(std(0xe5484d), 3, 9, 3, 0, -3, 0);
  } else if (id === 'keyboard') { part(std(0x4b5672), 15, 48, 4, 0, -24, 0); part(std(0xf4f1ea), 11, 42, 1.5, 0, -24, 2.6); }
  else if (id === 'board') { part(std(0x8d99b3, { metalness: 0.5 }), 3, 20, 3, 0, -8, 0); part(std(0xfdfdf8, { roughness: 0.4 }), 34, 44, 3, 0, -38, 0); part(std(0x58a6ff), 22, 2, 0.6, 0, -30, 1.8); }
  else if (id === 'book') { part(std(0xc0392b), 22, 30, 8, 0, -15, 0); part(std(0xffd54f, { metalness: 0.4 }), 23, 4, 8.5, 0, -3, 0); }
  else { const p = mesh(g, GEO.cyl, std(0x3b3550, { metalness: 0.5, roughness: 0.4 }), 0, -24, 0); p.scale.set(12, 4, 12); p.rotation.x = Math.PI / 2; part(std(0x6b4a35), 3, 16, 3, 0, -8, 0); }
  return g;
}

// ---------- people ----------
function rigPerson(look, sc = 1) {
  const g = new THREE.Group(), mats = [];
  const m = (c, o) => { const q = std(c, o); mats.push(q); return q; };
  const skin = m(look.skin), top = m(look.top), bot = m(look.bottom || '#3b4a6b'), hair = m(look.hair || '#222');
  const legL = new THREE.Group(), legR = new THREE.Group(), body = new THREE.Group();
  legL.position.set(-5, 23, 0); legR.position.set(5, 23, 0);
  g.add(legL, legR, body);
  for (const l of [legL, legR]) { mesh(l, GEO.leg, bot, 0, -11, 0); const sh2 = mesh(l, GEO.shoe, R3.shoeMat, 0, -20.5, 2.5); sh2.rotation.x = Math.PI / 2; }
  mesh(body, GEO.torso, top, 0, 36, 0);
  if (look.shirt) { const s = mesh(body, GEO.box, m(look.shirt), 0, 42, 10.2, false); s.scale.set(7, 12, 1.5); }
  if (look.tie) mesh(body, GEO.tie, m(look.tie), 0, 41, 11.4, false);
  if (look.badge) mesh(body, GEO.badge, m('#ffffff'), 3, 36, 11.6, false);
  if (look.pack) mesh(body, GEO.pack, m(look.pack), 0, 38, -13);
  const head = new THREE.Group();
  head.position.set(0, 59, 0);
  body.add(head);
  mesh(head, GEO.head, skin);
  const hs = look.hairStyle || 'short';
  if (hs !== 'bald') {
    const cap = mesh(head, GEO.hair, hair, 0, 1.2, -0.6);
    cap.rotation.x = -0.22;
    if (hs === 'messy') for (let i = 0; i < 7; i++) { const s = mesh(head, GEO.spike, hair, Math.cos(i * 0.9) * 7, 11.5, Math.sin(i * 0.9) * 6 - 1); s.rotation.set(Math.sin(i * 0.9) * 0.5, 0, -Math.cos(i * 0.9) * 0.5); }
    else if (hs === 'curly') for (let i = 0; i < 10; i++) mesh(head, GEO.curl, hair, Math.cos(i * 0.63) * 10.5, 5 + (i % 3) * 3, Math.sin(i * 0.63) * 10 - 2);
    else if (hs === 'long') mesh(head, GEO.back, hair, 0, -7, -9);
    else if (hs === 'side') { const s = mesh(head, GEO.curl, hair, -6, 10, 6); s.scale.set(1.9, 0.9, 1.3); }
  }
  for (const ex of [-4.2, 4.2]) mesh(head, GEO.eye, R3.eyeMat, ex, 0.5, 11, false);
  if (look.glasses) for (const ex of [-4.2, 4.2]) mesh(head, GEO.glass, m(look.glasses), ex, 0.5, 11.6, false);
  if (look.band) { const b = mesh(head, GEO.band, m(look.band), 0, 5.5, 0); b.rotation.x = Math.PI / 2; }
  const armL = new THREE.Group(), armR = new THREE.Group(), hand = new THREE.Group();
  armL.position.set(-15, 46, 0); armR.position.set(15, 46, 0);
  body.add(armL, armR);
  for (const a of [armL, armR]) { mesh(a, GEO.arm, top, 0, -10, 0); mesh(a, GEO.hand, skin, 0, -21.5, 0); }
  hand.position.set(0, -22, 0);
  armR.add(hand);
  g.scale.setScalar(sc);
  return { g, body, legL, legR, armL, armR, hand, head, mats, sc, person: true, w: null };
}
function setWeapon(R, id) {
  if (R.w === id) return;
  R.w = id;
  if (R.wm) { R.hand.remove(R.wm); disposeTree(R.wm); }
  R.wm = id ? weaponMesh(id) : null;
  if (R.wm) R.hand.add(R.wm);
}
// o: t, moving, pace, swing (0..1 or null), dir, armUp, kneel
function poseRig(R, o) {
  const w = o.moving ? Math.sin(o.t * (o.pace || 11)) : 0;
  R.legL.rotation.x = w * 0.8; R.legR.rotation.x = -w * 0.8;
  R.body.position.y = o.moving ? Math.abs(w) * 1.8 : Math.sin(o.t * 2.5) * 0.5;
  R.body.rotation.x = o.moving ? 0.12 : 0;
  R.armL.rotation.x = -w * 0.7;
  if (o.kneel) {
    R.legL.rotation.x = R.legR.rotation.x = -1.5; R.body.position.y = -14; R.body.rotation.x = 0.35;
    R.armR.rotation.set(-0.3, 0, 0); R.armL.rotation.x = -0.3;
  } else if (o.swing != null) {
    const k = clamp(o.swing * 1.5, 0, 1), d = o.dir || 1;
    R.armR.rotation.set(lerp(-2.7, 0.2, k), 0, lerp(0.9, -0.5, k) * d);
    R.body.rotation.y = lerp(-0.95, 0.95, k) * d;
    R.body.rotation.x = 0.22;
  } else if (o.armUp) { R.armR.rotation.set(-2.9, 0, 0.1); R.body.rotation.y = 0; }
  else { R.armR.rotation.set(-0.6 + w * 0.35, 0, 0); R.body.rotation.y = 0; }
}

// ---------- creatures ----------
function rigCreature(type) {
  const g = new THREE.Group(), mats = [];
  const m = (c, o) => { const q = std(c, o); mats.push(q); return q; };
  const part = (geo, mat, sx0, sy0, sz0, x, y, z) => { const me = mesh(g, geo, mat, x, y, z); me.scale.set(sx0, sy0, sz0); return me; };
  const R = { g, mats, type };
  if (type === 'penguin') {
    part(GEO.ball, m(0x2b2d3a), 13, 17, 12, 0, 17, 0); part(GEO.ball, m(0xfafafa), 9, 12.5, 6, 0, 14, 7.5);
    part(GEO.cone, m(0xf5a623), 3.5, 8, 3.5, 0, 22, 13).rotation.x = Math.PI / 2;
    for (const x of [-5, 5]) { part(GEO.ball, m(0xffffff), 3.2, 3.2, 2, x, 27, 9.5); part(GEO.ball, R3.eyeMat, 1.5, 1.5, 1.5, x, 27, 11.3); part(GEO.box, m(0xf5a623), 7, 2.5, 10, x, 1.3, 3); }
    R.fl = [part(GEO.ball, m(0x2b2d3a), 3, 10, 6, -13.5, 17, 0), part(GEO.ball, m(0x2b2d3a), 3, 10, 6, 13.5, 17, 0)];
    part(GEO.torus, m(0xe5484d), 9.5, 9.5, 14, 0, 24, 0).rotation.x = Math.PI / 2;
  } else if (type === 'drone') {
    part(GEO.box, m(0x7a8aa3, { metalness: 0.5, roughness: 0.4 }), 26, 14, 26, 0, 0, 0);
    part(GEO.ball, m(0xff3030, { emissive: 0xff2020, emissiveIntensity: 1.6 }), 4, 4, 4, 0, 0, 13.5);
    R.rot = [];
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) R.rot.push(part(GEO.box, m(0x2a2438), 18, 1.2, 3, x, 10, z));
  } else if (type === 'agent') {
    part(GEO.box, m(0x2fd3b5, { roughness: 0.4 }), 18, 13, 22, 0, 12, 0); part(GEO.box, m(0x0f3d36), 12, 6, 1.5, 0, 14, 11.2);
    part(GEO.ball, m(0xd6fff2, { emissive: 0x9dffe0, emissiveIntensity: 1.4 }), 1.8, 1.8, 1.2, 2, 14, 12);
    for (const x of [-9.5, 9.5]) for (const z of [-7, 7]) part(GEO.cyl, m(0x2a2438), 4.5, 3, 4.5, x, 4.5, z).rotation.z = Math.PI / 2;
    part(GEO.box, m(0x2a2438), 1, 9, 1, -5, 23, -4); part(GEO.ball, m(0xffe14d, { emissive: 0xffe14d, emissiveIntensity: 1.2 }), 2, 2, 2, -5, 28, -4);
  } else if (type === 'doubao') {
    part(GEO.ball, m(0xfff6e6, { roughness: 0.6 }), 16, 14, 16, 0, 13, 0); part(GEO.ball, m(0xb06a3a), 2.8, 2.4, 2.8, 0, 27, 0);
    for (const x of [-5, 5]) { part(GEO.ball, R3.eyeMat, 1.7, 2.3, 1.2, x, 14, 15); part(GEO.ball, m(0xff9a9a), 2.6, 1.8, 1, x * 1.9, 10.5, 14); }
    part(GEO.torus, m(0x4f8df0), 16, 16, 9, 0, 16, 0).rotation.y = Math.PI / 2;
    part(GEO.box, m(0x4f8df0), 5, 9, 6, -17, 14, 0); part(GEO.ball, m(0x4f8df0), 2, 2, 2, -9, 7, 14);
  } else if (type === 'crab') {
    part(GEO.box, m(0xd97757, { roughness: 0.6 }), 30, 13, 20, 0, 12, 0);
    for (const x of [-4.5, 4.5]) part(GEO.box, R3.eyeMat, 3, 6.5, 1, x, 13, 10.4);
    R.claws = [part(GEO.ball, m(0xd97757), 6, 6, 6, -19, 19, 7), part(GEO.ball, m(0xd97757), 6, 6, 6, 19, 19, 7)];
    R.legs = [];
    for (const x of [-1, 1]) for (const z of [-5, 5]) R.legs.push(part(GEO.box, m(0xb95f42), 9, 3, 3, x * 17, 5, z));
  } else {
    part(GEO.box, m(0xf7f7f2, { roughness: 0.35 }), 25, 28, 19, 0, 19, 0); part(GEO.box, m(0x0f3d33), 17, 15, 1.5, 0, 22, 9.6);
    R.ring = part(GEO.torus, m(0x3ddc97, { emissive: 0x3ddc97, emissiveIntensity: 1.5 }), 4.2, 4.2, 4, 0, 22, 10.6);
    for (const x of [-7, 7]) part(GEO.box, m(0x2a2438), 7, 5, 9, x, 2.5, 0);
    part(GEO.box, m(0x2a2438), 1, 8, 1, 0, 37, 0); part(GEO.ball, m(0x3ddc97, { emissive: 0x3ddc97, emissiveIntensity: 1.5 }), 2.4, 2.4, 2.4, 0, 42, 0);
  }
  return R;
}
function poseCreature(R, t, moving) {
  if (R.fl) { R.fl[0].rotation.z = 0.5 + Math.sin(t * 14) * 0.4; R.fl[1].rotation.z = -0.5 - Math.sin(t * 14) * 0.4; }
  if (R.rot) R.rot.forEach((r, i) => { r.rotation.y = t * 40 + i; });
  if (R.claws) R.claws.forEach((c, i) => { c.position.y = 19 + Math.abs(Math.sin(t * 9 + i * 1.5)) * 4; });
  if (R.legs) R.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 14 + i * 1.6) * (moving ? 0.5 : 0.1); });
  if (R.ring) R.ring.rotation.z = t * 1.5;
}
function rigFlash(R, on, sq) {
  if (R.fl2 !== on) { R.fl2 = on; for (const m of R.mats) { if (on) { m.userData.e = m.emissive.getHex(); m.userData.ei = m.emissiveIntensity; m.emissive.set(0xffffff); m.emissiveIntensity = 0.85; } else if (m.userData.e !== undefined) { m.emissive.setHex(m.userData.e); m.emissiveIntensity = m.userData.ei; } } }
  const s = R.sc || 1;
  R.g.scale.set(s * (on && sq ? 1.2 : 1), s * (on && sq ? 0.84 : 1), s * (on && sq ? 1.2 : 1));
}

R3.makeEnemyRig = function (e) {
  const M = this.models;
  if (e.type === 'rival') return M ? rigChar(e._m || (e._m = pick(RIVAL_MODELS))) : rigPerson(e.look);
  if (e.type === 'hr') return M ? rigChar('Suit_Female') : rigPerson(HR_LOOK);
  if (e.type === 'manager') return M ? rigChar('Suit_Male', 1.3) : rigPerson(MGR_LOOK, 1.35);
  if (M && e.type === 'agent') return rigRobot(34, '#2fd3b5');
  if (M && e.type === 'gpt') return rigRobot(50, '#f2f2ec');
  return rigCreature(e.type);
};
// The player's body language for each move. The clip moves the arms; this leans, twists, hops and rolls
// the whole body and carries the weapon through its arc.
const ease = (x) => x * x * (3 - 2 * x);
function posePlayer(R, p, dt) {
  const I = R.inner, m = p.mv, sw = p.swingT > 0 && m ? clamp(1 - p.swingT / p.swingMax, 0, 1) : -1, lv = chargeLevel(p.charge);
  let rx = 0, ry = 0, hop = 0, tilt = 0.85, sweep = 0.25, roll = 0, push = 0;
  const punch = () => animSet(R, 'Punch', { once: true, key: p.swingN, speed: 0.75 / (p.swingMax * 1.3), fade: 0.04 });
  if (p.dashT > 0 && p.dashKind === 'd') { roll = clamp(1 - p.dashT / 0.22, 0, 1) * TAU; animSet(R, 'Idle'); tilt = 0.2; }
  else if (p.dashT > 0) { rx = 0.5; tilt = 0.05; sweep = 0; animSet(R, 'Walk', { speed: 3.2 }); }
  else if (p.castT > 0 && p.castKind === 'spin') {
    ry = (1 - p.castT / (p.castMax || 0.18)) * TAU * (p.castMax > 0.25 ? 2 : 1); tilt = 0.08; sweep = 1.5; rx = 0.12;
    animSet(R, 'Punch', { once: true, key: 'spin', speed: 3 });
  } else if (sw >= 0) {
    const k = m.kind, at = m.at, pre = clamp(sw / at, 0, 1), post = clamp((sw - at) / (1 - at), 0, 1), cut = Math.min(1, post * 3.2);
    if (k === 'sweep') { punch(); ry = p.swingDir * lerp(-0.6, 0.6, ease(sw)); rx = 0.1; tilt = lerp(1.2, 0.1, sw); sweep = p.swingDir * lerp(-1.35, 1.35, ease(sw)); }
    else if (k === 'thrust') { punch(); rx = 0.36; ry = lerp(-0.7, 0, ease(pre)); tilt = 0.04; sweep = 0; push = sw < at ? -8 * pre : 20 * (1 - post); }
    else {
      // big overhead moves: arms go up for the wind-up, then come down with the blow
      if (sw < at) animSet(R, 'Victory', { key: 'w' + p.swingN, speed: 2.2, fade: 0.06 }); else punch();
      sweep = 0;
      if (k === 'chop') { tilt = sw < at ? lerp(1.2, 2.05, ease(pre)) : lerp(2.05, -0.35, cut); rx = sw < at ? -0.22 * pre : lerp(-0.22, 0.5, cut); hop = Math.sin(pre * Math.PI) * 8; }
      else if (k === 'upper') { tilt = sw < at ? lerp(0.4, -0.7, ease(pre)) : lerp(-0.7, 2.05, cut); rx = sw < at ? 0.4 * pre : lerp(0.4, -0.3, cut); hop = sw < at ? -4 * pre : Math.sin(Math.min(1, post * 1.5) * Math.PI) * 18; if (sw >= at) animSet(R, 'Victory', { key: 'u' + p.swingN, speed: 2.4, fade: 0.05 }); }
      else { hop = Math.sin(clamp(sw / (at + 0.03), 0, 1) * Math.PI) * 56; tilt = sw < at * 0.8 ? lerp(1.0, 2.15, ease(sw / (at * 0.8))) : lerp(2.15, -0.45, clamp((sw - at * 0.8) / (at * 0.22), 0, 1)); rx = sw < at * 0.8 ? -0.32 * pre : sw < at ? 0.6 : lerp(0.6, 0.15, post); }
    }
  } else if (p.charge > 0.3) { animSet(R, 'Victory', { speed: 1.6 }); tilt = 1.75; sweep = -0.5; rx = -0.12; ry = -0.45; hop = -3 - lv; }
  else if (p.castT > 0) animSet(R, 'Victory', { speed: 1.6 });
  else if (p.moving) { animSet(R, 'Walk', { speed: 2.1 }); rx = 0.12; }
  else animSet(R, 'Idle');
  I.rotation.set(roll || rx, ry, 0);
  const h = 32;
  I.position.set(0, R.by + (roll ? h - h * Math.cos(roll) : hop), roll ? -h * Math.sin(roll) : 0);
  R.mixer.update(dt);
  aimWeapon(R, tilt, sweep);
  R.hand.position.z += push;
}
const yaw = (a) => Math.PI / 2 - a; // world angle -> three rotation about Y for a rig that faces +z
R3.rigFor = function (e, make) {
  let R = this.ents.get(e);
  if (!R) { R = make(); this.ents.set(e, R); this.dyn.add(R.g); }
  R.seen = this.frameNo;
  return R;
};

// ---------- per-frame sync of everything that moves ----------
R3.syncActors = function (dt) {
  const p = G.player, t = G.t, play = G.state !== 'menu', cx0 = View.cam.x, cy0 = View.cam.y;
  const near = (x, y, r = 1500) => Math.abs(x - cx0) < r && y - cy0 < 700 && cy0 - y < r + 600;
  const jit = (o) => (o.hitAt !== undefined ? Math.max(0, 1 - (t - o.hitAt) / 0.2) : 0);

  // --- you ---
  if (play && p.hp > 0) {
    const R = this.playerRig || (this.playerRig = (() => { const q = this.models ? rigChar('Casual_Male', 1, '#f6d3b3') : rigPerson(PLAYER_LOOK); this.dyn.add(q.g); return q; })());
    R.g.visible = !(p.inv > 0 && p.dashT <= 0 && Math.floor(p.t * 22) % 2);
    setWeapon(R, p.weapon);
    R.g.position.set(p.x, 0, p.y);
    R.g.rotation.y = yaw(p.dashT > 0 && p.dashKind === 'd' && R.model ? Math.atan2(p.dashDir.y, p.dashDir.x) : p.swingT > 0 ? p.swingA : p.aim);
    if (R.model) {
      posePlayer(R, p, dt);
    } else poseRig(R, { t: p.t, moving: p.moving, pace: 15, swing: p.swingT > 0 ? 1 - p.swingT / p.swingMax : null, dir: p.swingDir, armUp: p.castT > 0 || p.charge > 0.3 });
    for (const m of R.mats) { m.transparent = p.hidden; m.opacity = p.hidden ? 0.6 : 1; }
    if (p.charge > 0.2) {
      // the ring shows how far the release will reach; it steps out and changes colour at each charge level
      const lv = chargeLevel(p.charge), ring = this.get('charge', () => flat(GEO.ringThin, glowMat(0xffe08a)));
      ring.position.set(p.x, 2.6, p.y); ring.scale.setScalar([100, 125, 155, 195][lv] * (1 + p.chargeFlash * 1.2));
      ring.material.color.setHex(lv === 3 ? 0xff8a3a : lv === 2 ? 0xffc04a : 0xffe08a);
      ring.material.opacity = lv ? 0.7 + Math.sin(p.t * (14 + lv * 6)) * 0.3 : 0.3;
    }
  } else if (this.playerRig) this.playerRig.g.visible = false;

  // --- rivals and minions ---
  for (const e of G.enemies) {
    if (!near(e.x, e.y)) continue;
    const rival = e.type === 'rival', personish = rival || e.type === 'hr' || e.type === 'manager';
    const R = this.rigFor(e, () => this.makeEnemyRig(e));
    const rise = e.spawnT > 0 ? e.spawnT / 0.6 : 0, j = jit(e);
    R.g.position.set(e.x + Math.sin(t * 95) * 5 * j, (e.z || 0) + rise * 40, e.y);
    R.g.rotation.y = yaw(rival ? (e.wind > 0 ? e.windA : e.aim) : angTo(e.x, e.y, p.x, p.y));
    R.g.rotation.z = e.stun > 0 ? Math.sin(t * 18) * 0.16 : 0;
    // snapped back by a blow: lean away, then recover
    if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 3.2);
    if (R.inner) R.inner.rotation.x = -(e.recoil || 0) * 0.85;
    if (rival && R.person) setWeapon(R, e.w);
    if (R.model) {
      const wdt = dt * (G.slowT > 0 ? 0.28 : 1);
      if (R.robot) animSet(R, e.asleep ? 'Idle' : e.type === 'agent' ? 'Running' : 'Walking');
      else if (e.stun > 0) animSet(R, 'RecieveHit', { speed: 1.3 });
      else if (e.wind > 0) { if (!R.winding) { R.winding = true; R.wk = (R.wk || 0) + 1; } animSet(R, 'Punch', { once: true, key: R.wk, speed: 0.34 / e.windMax, fade: 0.05 }); }
      else if (rival ? e.moving : !e.asleep) animSet(R, 'Walk', { speed: rival ? 1.8 : 1.3 });
      else animSet(R, 'Idle');
      if (!(e.wind > 0)) R.winding = false;
      R.mixer.update(wdt);
      if (R.person) aimWeapon(R, e.wind > 0 ? 1.45 : 0.85, 0.25);
    } else if (personish) poseRig(R, { t: e.t, moving: rival ? e.moving : !e.asleep && e.stun <= 0, pace: 13, armUp: e.wind > 0, swing: null });
    else poseCreature(R, e.t, !e.asleep);
    rigFlash(R, e.flash > 0, true);
    if (rival && e.wind > 0) {
      // red wedge: where this swing is about to land
      const w = WEAPONS[e.w], k = 1 - e.wind / e.windMax, wd = this.get('wedge', () => flat(GEO.disc, basic(0xff3232, { side: THREE.DoubleSide })));
      wd.geometry = this.sector(w.arc, false);
      wd.position.set(e.x, 2.2, e.y); wd.scale.setScalar(w.reach + 6); wd.rotation.z = -e.windA;
      wd.material.opacity = 0.2 + 0.4 * k;
    } else if (rival && e.dashWind > 0) {
      const ln = this.get('dashwarn', () => flat(GEO.plane, basic(0xff3232, { side: THREE.DoubleSide })));
      ln.position.set(e.x + Math.cos(e.dashA) * 125, 2.2, e.y + Math.sin(e.dashA) * 125); ln.scale.set(250, 40, 1); ln.rotation.z = -e.dashA;
      ln.material.opacity = 0.25 + 0.4 * (1 - e.dashWind / 0.5);
    }
  }
  // --- whoever you just sent flying ---
  for (const c of G.corpses) {
    const R = this.ents.get(c.e);
    if (!R) continue;
    R.seen = this.frameNo;
    R.g.position.set(c.x, c.z + 26, c.y);
    R.g.rotation.set(c.rot * 0.6, R.g.rotation.y, c.rot);
    rigFlash(R, c.t < 0.1, false);
    if (R.model) { animSet(R, R.robot ? 'Death' : 'Defeat', { once: true, speed: 2.5 }); R.mixer.update(dt); }
  }

  // --- the bosses ---
  for (const b of G.bosses) {
    if (!near(b.x, b.y, 1900)) continue;
    const R = this.rigFor(b, () => this.makeBossRig(b));
    const j = jit(b), charging = b.mode === 'charge';
    R.g.visible = !b.gone;
    R.g.position.set(b.x + Math.sin(t * 95) * 5 * j, 0, b.y);
    const intro = G.cine && G.cine.b === b;
    R.g.rotation.y = yaw(intro ? Math.PI / 2 : charging ? b.data.ca : angTo(b.x, b.y, p.x, p.y));
    R.g.rotation.z = b.stun > 0 ? Math.sin(t * 16) * 0.14 : 0;
    if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - dt * 3.2);
    if (R.inner) R.inner.rotation.x = -(b.recoil || 0) * 0.4;
    if (R.model) {
      if (intro) animSet(R, G.cine.t < 1.5 ? 'Idle' : 'Victory', { speed: 0.9 });
      else if (b.down) animSet(R, 'SitDown', { once: true });
      else if (b.topple > 1.2) animSet(R, 'Defeat', { once: true, speed: 2.6 });
      else if (b.topple > 0) animSet(R, 'StandUp', { once: true, speed: 1.15 });
      else if (b.stun > 0) animSet(R, 'RecieveHit');
      else if (b.charge > 0 || b.shield) animSet(R, 'Victory', { speed: 1.4 });
      else if (b.moving) animSet(R, 'Walk', { speed: 1.3 });
      else animSet(R, 'Idle');
      R.mixer.update(dt * (G.slowT > 0 ? 0.28 : 1));
      aimWeapon(R, b.charge > 0 || b.shield ? 1.5 : 1.0, 0);
    } else poseRig(R, { t: b.t, moving: b.moving, pace: 10, armUp: b.charge > 0 || !!b.shield, kneel: b.down, swing: null });
    rigFlash(R, b.flash > 0, false);
    R.truck.visible = charging;
    if (R.glow) R.glow.material.emissiveIntensity = 0.4 + (b.charge > 0 ? (1 - b.charge / 1.3) * 5 : 0);
    if (b.orbs && !b.down && !b.gone) {
      for (let i = 0; i < b.orbs; i++) {
        const a = b.orbA + (i / b.orbs) * TAU, o = this.get('orb', () => { const q = new THREE.Mesh(GEO.octa, std(0xffab70, { emissive: 0xff8a50, emissiveIntensity: 1.6 })); q.castShadow = true; return q; });
        o.position.set(b.x + Math.cos(a) * ORB_R, 32, b.y + Math.sin(a) * ORB_R); o.scale.setScalar(17); o.rotation.set(t * 2, t * 3, 0);
      }
    }
    if (b.reflect > 0) { const s = this.get('bubble', () => new THREE.Mesh(GEO.ball, glowMat(0xffd180, { opacity: 0.3 }))); s.position.set(b.x, 46, b.y); s.scale.setScalar(58); }
    if (b.shield) { const s = this.get('raise', () => flat(GEO.ringThin, glowMat(0xffd54f))); s.position.set(b.x, 3, b.y); s.scale.setScalar(56 * (0.4 + 0.6 * (b.shield.hp / b.shield.max))); s.material.opacity = 0.9; }
  }

  // --- sidekicks ---
  for (const q of G.pets) {
    const R = this.rigFor(q, () => (this.models && q.type === 'gpt' ? rigRobot(48, '#f2f2ec') : rigCreature(q.type)));
    R.g.position.set(q.x, q.type === 'doubao' ? Math.abs(Math.sin(q.t * 5)) * 6 : 0, q.y);
    R.g.rotation.y = yaw(q.face > 0 ? 0 : Math.PI);
    if (R.model) { animSet(R, q.moving ? 'Running' : 'Idle'); R.mixer.update(dt); } else poseCreature(R, q.t, q.moving);
    const ring = this.get('petring', () => flat(GEO.ringThin, basic(0x5df09a, { side: THREE.DoubleSide })));
    ring.position.set(q.x, 2.4, q.y); ring.scale.setScalar(18); ring.material.opacity = 0.8;
  }
  for (const [e, R] of this.ents) if (R.seen !== this.frameNo) { this.dyn.remove(R.g); disposeTree(R.g); this.ents.delete(e); }

  // --- loot on the ground ---
  for (const k of G.pickups) {
    if (!near(k.x, k.y, 1100)) continue;
    const tier = k.kind === 'val' ? k.tier : k.kind === 'weapon' ? WEAPONS[k.id].tier : k.kind === 'armor' ? 2 : 1, key = 'pk_' + k.kind + (k.id || k.key || '');
    const g = this.get(key, () => {
      const q = new THREE.Group();
      let it;
      if (k.kind === 'weapon') { it = weaponMesh(k.id); it.position.y = 20; it.rotation.z = 0.6; }
      else if (k.kind === 'tea') { it = new THREE.Group(); const c = mesh(it, GEO.cyl, std(0xf8e1c4), 0, 0, 0); c.scale.set(8, 20, 8); const l = mesh(it, GEO.cyl, std(0xff9aa2), 0, 11, 0); l.scale.set(9, 3, 9); }
      else if (k.kind === 'armor') { it = new THREE.Group(); const c = mesh(it, GEO.box, std(0xe5484d), 0, 0, 0); c.scale.set(22, 20, 8); }
      else { it = new THREE.Group(); const c = mesh(it, GEO.octa, std(TIER[tier], { emissive: TIER[tier], emissiveIntensity: tier >= 3 ? 1.1 : 0.35, metalness: 0.3, roughness: 0.3 }), 0, 0, 0); c.scale.set(11, 14, 11); }
      q.add(it); q.userData.it = it;
      const r = flat(GEO.ringThin, basic(TIER[tier], { side: THREE.DoubleSide, opacity: 0.9 })); r.scale.setScalar(20); r.position.y = 2.4; q.add(r);
      if (tier >= 3) { const b = mesh(q, GEO.cyl, glowMat(TIER[tier], { opacity: 0.35 }), 0, 130, 0, false); b.scale.set(5, 260, 5); }
      return q;
    });
    g.position.set(k.x, 0, k.y);
    g.userData.it.position.y = k.z + 26 + (k.z <= 0 ? Math.sin(k.t * 4) * 4 : 0) + (k.kind === 'weapon' ? 20 : 0);
    g.userData.it.rotation.y = k.t * 2;
  }

  // --- projectiles ---
  for (const b of G.bullets) {
    const m = this.get('b_' + b.id, () => {
      if (b.id === 'pan') return weaponMesh('pan');
      const q = new THREE.Mesh(b.id === 'claw' ? GEO.torus : GEO.box, std(b.id === 'claw' ? 0xd97757 : 0x3ddc97, { emissive: b.id === 'claw' ? 0xd97757 : 0x3ddc97, emissiveIntensity: 0.9 }));
      q.scale.setScalar(b.id === 'claw' ? 8 : 11);
      return q;
    });
    m.position.set(b.x, b.z + (b.id === 'pan' ? 24 : 0), b.y);
    if (b.id === 'pan') { m.rotation.set(Math.PI / 2, 0, b.t * 24); m.scale.setScalar(1.5); } else m.rotation.set(b.t * 8, b.t * 11, 0);
  }
  const EB = { env: [0xe5484d, 16, 12, 3], mail: [0xfdfdf8, 16, 11, 3], invite: [0x3b8ef0, 14, 14, 3], staple: [0xffd0d0, 14, 4, 4], chip: [0x8cf04a, 14, 14, 4] };
  for (const b of G.ebullets) {
    if (!near(b.x, b.y, 1000)) continue;
    const s = b.shape, bx = EB[s];
    const m = this.get('eb_' + s, () => {
      const q = new THREE.Mesh(bx ? GEO.box : s === 'spark' || s === 'note' ? GEO.octa : GEO.ball, std(bx ? bx[0] : 0xffffff, { emissive: bx ? bx[0] : 0xffffff, emissiveIntensity: bx ? 0.55 : 1.3 }));
      q.castShadow = true;
      return q;
    });
    m.position.set(b.x, b.z, b.y);
    if (bx) { m.scale.set(bx[1], bx[3], bx[2]); m.rotation.set(0, yaw(Math.atan2(b.vy, b.vx)) + Math.PI / 2, s === 'chip' ? b.t * 5 : 0); }
    else { const c = this.color(b.color); m.material.color.copy(c); m.material.emissive.copy(c); m.scale.setScalar(b.r * (s === 'orb' ? 1 : 1.3)); m.rotation.set(b.t * 3, b.t * 4, 0); }
  }

  // --- boss telegraphs on the ground ---
  const ZC = { snap: 0xffbe28, rocket: 0xff6432, feed: 0xff2d6f, delay: 0xff2d6f, grid: 0xff783c, red: 0xff4646 };
  for (const z of G.zones) {
    const u = clamp(z.t / z.delay, 0, 1), c = ZC[z.look] || ZC.red, k = z.done ? 1 - (z.t - z.delay) / z.linger : 0;
    if (z.kind === 'circle') {
      const a = this.get('zc', () => flat(GEO.disc, basic(0xffffff))), b2 = this.get('zc2', () => flat(GEO.disc, basic(0xffffff))), e = this.get('zce', () => flat(GEO.ringThin, basic(0xffffff, { side: THREE.DoubleSide })));
      a.position.set(z.x, 1.8, z.y); a.scale.setScalar(z.r); a.material.color.setHex(c); a.material.opacity = z.done ? 0.65 * k : 0.2 + 0.16 * u;
      b2.position.set(z.x, 2, z.y); b2.scale.setScalar(Math.max(1, z.r * u)); b2.material.color.setHex(c); b2.material.opacity = z.done ? 0 : 0.36;
      e.position.set(z.x, 2.2, z.y); e.scale.setScalar(z.r); e.material.color.setHex(c); e.material.opacity = z.done ? 0 : 0.95;
      if (z.look === 'rocket' && !z.done) {
        const r = this.get('rocket', () => { const q = new THREE.Group(); const b3 = mesh(q, GEO.cyl, std(0xfdfdf8), 0, 0, 0); b3.scale.set(7, 40, 7); const n = mesh(q, GEO.cone, std(0xe5484d), 0, 28, 0); n.scale.set(7, 16, 7); const f = mesh(q, GEO.cone, glowMat(0xff7043), 0, -30, 0, false); f.scale.set(6, 22, 6); f.rotation.x = Math.PI; return q; });
        r.position.set(z.x, (1 - u) * (1 - u) * 900 + 26, z.y); r.rotation.x = Math.PI;
      }
    } else {
      const a = this.get('zr', () => flat(GEO.plane, basic(0xffffff, { side: THREE.DoubleSide })));
      a.position.set(z.x + z.w / 2, 1.8, z.y + z.h / 2); a.scale.set(z.w, z.h, 1); a.material.color.setHex(c);
      a.material.opacity = z.done ? 0.6 * k : 0.16 + 0.2 * u + (u > 0.7 ? Math.sin(z.t * 40) * 0.05 : 0);
      if (z.done && z.look === 'feed') {
        // a wall of short videos streaking past
        for (let i = 0; i < 6; i++) {
          const q = (i / 6 + (z.t - z.delay) * 2.4) % 1, card = this.get('card', () => new THREE.Mesh(GEO.box, std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8 }))), horiz = z.w > z.h;
          card.material.color.setHex(i % 2 ? 0x25f4ee : 0xff2d6f); card.material.emissive.setHex(i % 2 ? 0x25f4ee : 0xff2d6f);
          card.position.set(horiz ? z.x + q * z.w : z.x + z.w / 2, 36, horiz ? z.y + z.h / 2 : z.y + q * z.h);
          card.scale.set(horiz ? 46 : z.w * 0.6, 60, horiz ? z.h * 0.6 : 46);
        }
      }
    }
  }
  for (const l of G.lasers) {
    const active = l.t >= l.tele, w = active ? l.width : l.width * (0.2 + 0.8 * (l.t / l.tele));
    const m = this.get('laser', () => new THREE.Mesh(GEO.box, glowMat(0xffffff)));
    m.position.set(l.x + Math.cos(l.a) * l.len / 2, active && l.look !== 'warn' ? 22 : 2.5, l.y + Math.sin(l.a) * l.len / 2);
    m.scale.set(l.len, active && l.look !== 'warn' ? 30 : 1, w); m.rotation.y = -l.a;
    m.material.color.setHex(l.look === 'flame' ? 0xff7043 : l.look === 'warn' ? 0xff4646 : 0xfff3e0);
    m.material.opacity = l.look === 'warn' ? 0.3 + 0.15 * Math.sin(l.t * 30) : active ? (l.look === 'flame' ? 0.55 : 0.8) : 0.22;
  }

  // --- combat effects ---
  for (const s of G.slashes) {
    const u = s.t / s.life;
    if (s.line) {
      const m = this.get('streak', () => new THREE.Mesh(GEO.box, glowMat(0x8fe8ff)));
      m.position.set(s.x + Math.cos(s.a) * s.reach / 2, 26, s.y + Math.sin(s.a) * s.reach / 2); m.scale.set(s.reach, 34 * (1 - u), 34 * (1 - u)); m.rotation.y = -s.a; m.material.opacity = (1 - u) * 0.8;
      continue;
    }
    const m = this.get('slash', () => flat(GEO.disc, glowMat(0xffffff)));
    m.geometry = this.sector(s.half * Math.min(1, u * 3.2 + 0.45), true);
    m.position.set(s.x, s.half >= 3 ? 6 : 30, s.y); m.scale.setScalar(s.reach * (1 + u * 0.1)); m.rotation.z = -s.a;
    m.material.color.copy(this.color('#ffffff')).lerp(this.color(s.col), u * 0.8); m.material.opacity = (1 - u) * (s.fin ? 1 : 0.85);
  }
  for (const s of G.sparks) {
    const u = s.t / s.life;
    if (s.star) { const m = this.get('star', () => new THREE.Mesh(GEO.octa, glowMat(0xffffff))); m.position.set(s.x, s.z, s.y); m.scale.setScalar(s.len * 0.45 * (0.5 + u)); m.rotation.set(s.rot, s.rot * 2, 0); m.material.opacity = 1 - u * u; continue; }
    const m = this.get('spark', () => new THREE.Mesh(GEO.box, glowMat(0xffffff))), d = s.len * (0.3 + u * 0.8);
    m.position.set(s.x + Math.cos(s.a) * d, s.z + u * 14, s.y + Math.sin(s.a) * d); m.scale.set(s.len * 0.5 * (1 - u * 0.5), s.w, s.w); m.rotation.y = -s.a;
    m.material.color.copy(this.color(s.col)); m.material.opacity = 1 - u * u;
  }
  for (const r of G.rings) {
    const u = r.t / r.life, m = this.get('ring', () => flat(GEO.ringThin, glowMat(0xffffff)));
    m.position.set(r.x, 3, r.y); m.scale.setScalar(r.r * (0.4 + 0.6 * u)); m.material.color.copy(this.color(r.color)); m.material.opacity = 1 - u;
  }
  for (const u of G.ults) {
    const k = clamp(u.t / u.delay, 0, 1), mk = this.get('ultmark', () => flat(GEO.disc, basic(0xffcf4a))), bk = this.get('ultbook', () => { const q = new THREE.Group(); const b = mesh(q, GEO.box, std(0xc0392b, { roughness: 0.5 }), 0, 0, 0); b.scale.set(150, 46, 190); const s = mesh(q, GEO.box, std(0xffd54f, { metalness: 0.5, emissive: 0x7a5a00 }), -62, 0, 0); s.scale.set(22, 48, 192); return q; });
    mk.position.set(u.x, 2, u.y); mk.scale.setScalar(u.r); mk.material.opacity = u.done ? 0.5 * (1 - (u.t - u.delay) / 0.45) : 0.18 + 0.2 * k;
    bk.position.set(u.x, u.done ? 24 : (1 - k) * (1 - k) * 1100 + 24, u.y); bk.rotation.set(0, 0.3, u.done ? 0.06 : (1 - k) * 2);
  }
  const lk = p.lock;
  if (lk && G.state === 'play') { const m = this.get('lock', () => flat(GEO.ringThin, basic(0xffcf4a, { side: THREE.DoubleSide }))); m.position.set(lk.x, 2.8, lk.y); m.scale.setScalar(lk.r + 10 + Math.sin(t * 8) * 2); m.material.opacity = 0.95; }

  // --- particles and fireflies ---
  const pa = this.points.geometry.attributes.position, ca = this.points.geometry.attributes.color, n = Math.min(G.parts.length, 800);
  for (let i = 0; i < n; i++) { const q = G.parts[i], c = this.color(q.color); pa.setXYZ(i, q.x, q.z + 3, q.y); ca.setXYZ(i, c.r, c.g, c.b); }
  this.points.geometry.setDrawRange(0, n); pa.needsUpdate = ca.needsUpdate = true;
  const fa = this.flies.geometry.attributes.position;
  this.fly.forEach((f, i) => {
    // wrap around the camera so there are always some nearby, but each one stays put in the world
    const wx = cx0 + ((((f.x - cx0) % 1400) + 2100) % 1400) - 700, wy = cy0 + ((((f.y - cy0) % 1200) + 1800) % 1200) - 700;
    fa.setXYZ(i, wx + Math.sin(t * 0.6 + f.ph) * 14, f.h + Math.sin(t * 0.9 + f.ph * 2) * 10, wy + Math.cos(t * 0.5 + f.ph) * 14);
  });
  fa.needsUpdate = true;
  this.flies.material.opacity = 0.45 + G.day * 0.5;

  for (const k in this.pool) { const P = this.pool[k]; for (let i = P.n; i < P.items.length; i++) P.items[i].visible = false; P.n = 0; }
};

R3.makeBossRig = function (b) {
  const L = BOSS_LOOK[b.id], R = this.models ? rigChar(L.model, L.sc, L.skin, L) : rigPerson(b.def.look, 1.45), gold = std(0xd4a017, { metalness: 0.7, roughness: 0.3, emissive: 0xffc94a, emissiveIntensity: 0.4 });
  R.mats.push(gold);
  const part = (parent, geo, mat, s, x, y, z) => { const m = mesh(parent, geo, mat, x, y, z); m.scale.set(s[0], s[1], s[2]); R.mats.includes(mat) || R.mats.push(mat); return m; };
  if (b.id === 'pony') { R.glow = part(R.hand, GEO.box, gold, [10, 13, 10], 0, -2, 0); ['#e040fb', '#448aff', '#ff5252', '#ffab40', '#69f0ae'].forEach((c, i) => part(R.hand, GEO.ball, std(c, { emissive: c, emissiveIntensity: 1.5 }), [1.6, 1.6, 1.6], -4 + i * 2, -2, 5.4)); }
  else if (b.id === 'yiming') { part(R.hand, GEO.box, std(0x111111), [7, 13, 1.5], 0, -4, 3); part(R.hand, GEO.box, std(0x25f4ee, { emissive: 0x25f4ee, emissiveIntensity: 1.2 }), [5.5, 10, 0.6], 0, -4, 4); }
  else if (b.id === 'elon') { part(R.hand, GEO.cyl, std(0xeceff1), [2.6, 16, 2.6], 0, -8, 0); part(R.hand, GEO.cone, std(0xe5484d), [2.6, 6, 2.6], 0, -19, 0).rotation.x = Math.PI; }
  else if (b.id === 'sam') part(R.hand, GEO.ball, std(0xb9f6ca, { emissive: 0x69f0ae, emissiveIntensity: 1.6 }), [5.5, 5.5, 5.5], 0, -4, 0);
  else part(R.hand, GEO.box, std(0xffffff), [9, 12, 1], 0, -6, 2);
  // the very angular truck, only shown while charging
  const tr = (R.truck = new THREE.Group());
  const steel = std(0x9aa5ad, { metalness: 0.85, roughness: 0.3 });
  const bodyM = mesh(tr, new THREE.CylinderGeometry(30, 38, 110, 3, 1), steel, 0, 34, 0); bodyM.rotation.set(Math.PI / 2, 0, Math.PI); bodyM.scale.set(1.25, 1, 0.9);
  for (const x of [-34, 34]) for (const z of [-34, 34]) { const w = mesh(tr, GEO.cyl, std(0x111111), x, 13, z); w.scale.set(13, 10, 13); w.rotation.z = Math.PI / 2; }
  tr.scale.setScalar(1 / R.sc); tr.visible = false;
  R.g.add(tr);
  return R;
};

// ---------- the overlay: text and markers that belong to things in the 3D world ----------
// Drawn on the HUD canvas, positioned by projecting world points through the camera.
R3.overlay = function () {
  const p = G.player, t = G.t, u = clamp(Math.min(View.W, View.H) / 720, 0.72, 1.25);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const e of G.enemies) {
    if (e.dead || Math.abs(e.x - p.x) > 900 || Math.abs(e.y - p.y) > 900) continue;
    const rival = e.type === 'rival';
    if (!rival && !(e.type === 'manager' && e.hp < e.maxhp) && !e.asleep && !(e.stun > 0)) continue;
    const s = this.project(e.x, e.y, (e.z || 0) + (e.type === 'manager' ? 96 : 78));
    if (!s.ok) continue;
    if (rival) hudText(rivalName(e), s.x, s.y - 8 * u, 11 * u, LVL_COL[e.lvl], 'center');
    else if (e.asleep) hudText('z', s.x + 10, s.y - 6 - ((t * 14) % 14), 13 * u, '#fff', 'center');
    if (e.stun > 0) for (let i = 0; i < 3; i++) hudText('✦', s.x + Math.cos(t * 7 + i * 2.1) * 16 * u, s.y - 22 * u + Math.sin(t * 7 + i * 2.1) * 5, 13 * u, '#ffe14d', 'center');
    if (e.hp < e.maxhp && (rival || e.type === 'manager')) { const w = 42 * u; ctx.fillStyle = INK; ctx.fillRect(s.x - w / 2 - 1.5, s.y + 2, w + 3, 7); ctx.fillStyle = '#ff5a5f'; ctx.fillRect(s.x - w / 2, s.y + 3.5, w * clamp(e.hp / e.maxhp, 0, 1), 4); }
  }
  for (const b of G.bosses) {
    if (b.gone) continue;
    if (b.sayT > 0 && b.say) { const s = this.project(b.x, b.y, 118); if (s.ok) bubbleAt(s.x, s.y, b.say); }
    if (b.stun > 0) { const s = this.project(b.x, b.y, 112); for (let i = 0; i < 3; i++) hudText('✦', s.x + Math.cos(t * 6 + i * 2.1) * 22, s.y + Math.sin(t * 6 + i * 2.1) * 6, 16 * u, '#ffeb3b', 'center'); }
  }
  for (const z of G.zones) if (z.look === 'delay' && !z.done) { const s = this.project(z.x, z.y, 4); if (s.ok) hudText(Math.max(0, z.delay - z.t).toFixed(1), s.x, s.y, 18 * u, '#fff', 'center'); }
  const lk = p.lock;
  if (lk && G.state === 'play') {
    const s = this.project(lk.x, lk.y, (lk.z || 0) + (lk.def.attacks ? 134 : 100)), y = s.y + Math.sin(t * 8) * 4;
    ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x - 9 * u, y - 12 * u); ctx.lineTo(s.x + 9 * u, y - 12 * u); ctx.lineTo(s.x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  for (const fl of G.floats) {
    const s = this.project(fl.x, fl.y, fl.z);
    if (!s.ok) continue;
    ctx.globalAlpha = clamp((fl.life - fl.t) * 3, 0, 1);
    ctx.font = `900 ${Math.round(fl.size * u * 1.15 * (1 + Math.max(0, 0.12 - fl.t) * 7))}px ${FONT}`;
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.strokeText(fl.text, s.x, s.y); ctx.fillStyle = fl.color; ctx.fillText(fl.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;
};
