'use strict';
// The 3D renderer, part 6: the papercraft look (the default). Everything is built from a few large flat faces,
// like a folded paper model: chibi people with big faceted heads, wedge-shaped locks of hair and big painted
// eyes; trees whose crowns are twenty-sided lumps; rocks cut from a dozen faces.
//
// A person is assembled from primitive shapes, but those are then merged into six meshes (head, body, two arms,
// two legs) that share one material, with the colours on the vertices: six draw calls instead of forty.
// The rigs have the same fields as every other kind, so the posing code does not care which it has been given.

const POLY = {}, POLYGEO = new Map();
function polyShapes() {
  if (POLY.ico0) return;
  const sh = (g) => { g.userData.shared = true; return g; };
  Object.assign(POLY, {
    ico0: sh(new THREE.IcosahedronGeometry(1, 0)), ico1: sh(new THREE.IcosahedronGeometry(1, 1)), dode: sh(new THREE.DodecahedronGeometry(1, 0)),
    box: sh(new THREE.BoxGeometry(1, 1, 1)), spike: sh(new THREE.ConeGeometry(1, 1, 4)), wedge: sh(new THREE.ConeGeometry(1, 1, 3)),
    cyl5: sh(new THREE.CylinderGeometry(1, 1, 1, 5)), cyl6: sh(new THREE.CylinderGeometry(1, 1, 1, 6)),
    cap: sh(new THREE.SphereGeometry(1, 7, 3, 0, TAU, 0, 1.78)), eye7: sh(new THREE.CircleGeometry(1, 7)), eye4: sh(new THREE.CircleGeometry(1, 4)),
    ring6: sh(new THREE.TorusGeometry(1, 0.13, 4, 6)), band8: sh(new THREE.TorusGeometry(1, 0.1, 4, 8)),
    cone5: sh(new THREE.ConeGeometry(1, 1, 5)), cone6: sh(new THREE.ConeGeometry(1, 1, 6)), torus8: sh(new THREE.TorusGeometry(1, 0.18, 4, 8)),
  });
  // a head with a chin: the lower half of the lump is pinched in
  const head = new THREE.IcosahedronGeometry(1, 1), p = head.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const k = 1 + y * 0.3; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  POLY.head = sh(head);
}

// ---------- merging ----------
// parts: [geometry, colour, x, y, z, sx, sy, sz, rx, ry, rz]. Returns one un-indexed geometry with a colour per
// vertex; each triangle's colour is nudged a little lighter or darker, which is what makes the folds read.
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _pv = new THREE.Vector3(), _ps = new THREE.Vector3(), _pc = new THREE.Color();
function mergeParts(parts) {
  let n = 0;
  const flat = parts.map((pt) => { const g = pt[0].index ? pt[0].toNonIndexed() : pt[0]; n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  parts.forEach((pt, k) => {
    const src = flat[k].attributes.position, [, c, x = 0, y = 0, z = 0, sx0 = 1, sy0 = 1, sz0 = 1, rx = 0, ry = 0, rz = 0] = pt;
    _pm.compose(_pv.set(x, y, z), _pq.setFromEuler(_pe.set(rx, ry, rz)), _ps.set(sx0, sy0, sz0));
    _pc.set(c);
    for (let i = 0; i < src.count; i++) {
      _pv.fromBufferAttribute(src, i).applyMatrix4(_pm);
      const tri = (o + i - (i % 3)) / 3, f = pt[11] === false ? 1 : 0.94 + (((tri * 2654435761) >>> 0) % 1000) / 1000 * 0.12;
      pos[(o + i) * 3] = _pv.x; pos[(o + i) * 3 + 1] = _pv.y; pos[(o + i) * 3 + 2] = _pv.z;
      col[(o + i) * 3] = Math.min(1, _pc.r * f); col[(o + i) * 3 + 1] = Math.min(1, _pc.g * f); col[(o + i) * 3 + 2] = Math.min(1, _pc.b * f);
    }
    o += src.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  return g;
}
const dim = (hex, k) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');

// ---------- people ----------
function personParts(look) {
  const P = POLY, skin = look.skin || '#f0c8a0', hair = look.hair || '#2a2233', top = look.top || '#4f7bf0', bot = look.bottom || '#3b4a6b', hs = look.hairStyle || 'short';
  const ink0 = '#241c2c', head = [], body = [], arm = [], leg = [];
  // head: a big faceted lump with a chin, ears, hair in wedges, and large painted eyes
  head.push([P.head, skin, 0, 15, 0, 16.5, 16, 15.2]);
  for (const s of [-1, 1]) head.push([P.ico0, skin, s * 15.8, 12, -1, 2.6, 3.8, 2.2]);
  if (hs !== 'bald') {
    head.push([P.cap, hair, 0, 15.8, -1, 17.7, 17.4, 16.9, -0.2]);
    const lock = (x, y, z, len, wid, th, rx, rz) => head.push([P.spike, hair, x, y, z, wid, len, th, rx, 0, rz]);
    if (hs === 'short') { lock(-7.5, 24.5, 13.2, 8, 5, 3, 0.25, Math.PI + 0.2); lock(0, 25, 14, 8.5, 5.4, 3, 0.3, Math.PI); lock(7.5, 24.5, 13.2, 8, 5, 3, 0.25, Math.PI - 0.2); }
    else if (hs === 'side') { lock(-1, 25.5, 13.6, 17, 7, 3.4, 0.25, -2.0); lock(-9, 24.5, 12.4, 9, 5, 3, 0.25, Math.PI + 0.25); lock(11.5, 22, 11, 8, 4, 3, 0.2, Math.PI - 0.5); }
    else if (hs === 'messy') {
      for (let i = 0; i < 7; i++) { const a = i * 0.9 - 0.3, r = 9.5; lock(Math.cos(a) * r, 29 + (i % 2) * 2, Math.sin(a) * r * 0.9 - 1, 11, 5, 4.2, Math.sin(a) * 0.55, -Math.cos(a) * 0.6); }
      lock(-6, 24.5, 13.4, 8, 5, 3, 0.25, Math.PI + 0.3); lock(5, 25, 13.6, 9, 5.5, 3, 0.3, Math.PI - 0.15);
    } else if (hs === 'curly') {
      for (let i = 0; i < 11; i++) { const a = i * 0.62, up = i % 3; head.push([P.ico0, hair, Math.cos(a) * (13.5 - up * 2.4), 23 + up * 3.6, Math.sin(a) * (12.5 - up * 2.2) - 1.5, 5.6, 5.6, 5.6, i, i * 2, 0]); }
      for (const x of [-6, 0, 6]) head.push([P.ico0, hair, x, 26, 12.4, 4.6, 4.2, 3.6, x, 1, 0]);
    } else if (hs === 'long') {
      lock(-7, 24.5, 13.2, 8, 5, 3, 0.25, Math.PI + 0.2); lock(0, 25, 14, 8, 5, 3, 0.3, Math.PI); lock(7, 24.5, 13.2, 8, 5, 3, 0.25, Math.PI - 0.2);
      for (const s of [-1, 1]) lock(s * 15.4, 9, 2.5, 22, 5.2, 4.4, 0, Math.PI - s * 0.06);
      head.push([P.box, hair, 0, 5, -12.6, 25, 26, 5, 0.14]);
    }
  }
  if (look.band) head.push([P.band8, look.band, 0, 20, -0.6, 17.3, 17.3, 17.3, Math.PI / 2 - 0.12]);
  const iris = look.eye || '#3f78a8';
  for (const s of [-1, 1]) {
    const ex = s * 6.5, ry = s * 0.3, ez = 14.35;
    head.push([P.eye7, '#ffffff', ex, 12.6, ez, 3.5, 4.4, 1, 0, ry, 0, false]);
    head.push([P.eye7, iris, ex + s * 0.2, 12.2, ez + 0.3, 2.75, 3.6, 1, 0, ry, 0, false]);
    head.push([P.eye7, ink0, ex + s * 0.2, 12.0, ez + 0.55, 1.35, 1.9, 1, 0, ry, 0, false]);
    head.push([P.eye4, '#ffffff', ex - 0.9, 14.0, ez + 0.85, 1.05, 1.05, 1, 0, ry, 0.5, false]);
    head.push([P.eye4, '#ffffff', ex + 1.0, 10.6, ez + 0.85, 0.5, 0.5, 1, 0, ry, 0.5, false]);
    head.push([P.box, ink0, ex, 17.3, ez + 0.2, 6.6, 0.9, 0.6, 0, ry, -s * 0.1, false]);
    if (look.bags) head.push([P.box, dim(skin, 0.8), ex, 7.6, ez + 0.3, 5.4, 0.9, 0.5, 0, ry, 0, false]);
  }
  head.push([P.box, '#8f4a3c', 0, 5.3, 14.6, look.smile ? 4.2 : 2.2, 0.9, 0.6, 0, 0, 0, false]);
  if (look.glasses) {
    for (const s of [-1, 1]) { head.push([P.ring6, look.glasses, s * 6.5, 12.6, 16.2, 4.9, 4.9, 4.9, 0, s * 0.3, Math.PI / 6, false]); head.push([P.box, look.glasses, s * 12.6, 13.4, 9.5, 0.8, 0.8, 13, 0, 0, 0, false]); }
    head.push([P.box, look.glasses, 0, 13.2, 16.9, 3.4, 0.8, 0.8, 0, 0, 0, false]);
  }
  // body: a six-sided tunic that flares out, a belt, and whatever they wear over it
  body.push([POLY.tunic, top, 0, 23, 0, 1, 1, 1, 0, Math.PI / 6]);
  body.push([P.cyl6, dim(bot, 0.72), 0, 15.6, 0, 10.5, 2.8, 10.5, 0, Math.PI / 6]);
  body.push([P.box, '#f2c14a', 0, 15.6, 9.3, 3.2, 2.8, 0.9, 0, 0, 0, false]);
  if (look.shirt) body.push([P.wedge, look.shirt, 0, 27.6, 7.3, 4.6, 9.5, 1.4, 0.06, 0, Math.PI]);
  if (look.tie) { body.push([P.box, look.tie, 0, 25.8, 8.4, 2.1, 8.4, 0.9, 0.08]); body.push([P.box, look.tie, 0, 30.6, 7.8, 2.8, 2, 1, 0.08]); }
  if (look.badge) { body.push([P.box, look.badge, 4.2, 24.4, 8.6, 2.8, 3.4, 0.8, 0.08, 0, 0, false]); body.push([P.box, ink0, 2.4, 28.5, 7.6, 0.6, 6.5, 0.5, 0.08, 0, 0.5, false]); }
  if (look.logo) for (const r of [-0.78, 0.78]) body.push([P.box, '#eceff1', 0, 25.6, 8.3, 0.9, 7, 0.6, 0.08, 0, r, false]);
  if (look.pack) { body.push([P.box, look.pack, 0, 25, -9.6, 12, 13, 6.5, -0.06]); body.push([P.box, dim(look.pack, 0.75), 0, 28, -13, 8, 5, 1.6, -0.06]); }
  // arm: a tapering sleeve and a faceted fist; leg: a short trouser leg into a chunky boot
  arm.push([POLY.sleeve, top, 0, -6, 0]); arm.push([P.ico0, skin, 0, -13.4, 0, 3.4, 3.4, 3.4]);
  leg.push([POLY.shin, bot, 0, -4, 0]); leg.push([P.box, '#5a3a26', 0, -10.8, 1.5, 7.6, 5.4, 10.2]); leg.push([P.box, '#3d281a', 0, -13, 1.5, 8, 1.2, 10.8]);
  return { head, body, arm, leg };
}
function rigPersonPoly(look, sc = 1) {
  polyShapes();
  if (!POLY.tunic) { const sh = (g) => { g.userData.shared = true; return g; }; POLY.tunic = sh(new THREE.CylinderGeometry(6.6, 10.4, 20, 6)); POLY.sleeve = sh(new THREE.CylinderGeometry(2.5, 3.2, 12, 5)); POLY.shin = sh(new THREE.CylinderGeometry(4, 3.4, 8, 5)); }
  const key = [look.top, look.shirt, look.bottom, look.skin, look.hair, look.hairStyle, look.glasses, look.tie, look.badge, look.band, look.smile, look.bags, look.pack, look.eye, !!look.logo].join('|');
  let G4 = POLYGEO.get(key);
  if (!G4) { const pp = personParts(look); G4 = { head: mergeParts(pp.head), body: mergeParts(pp.body), arm: mergeParts(pp.arm), leg: mergeParts(pp.leg) }; POLYGEO.set(key, G4); }
  const mat = charMaterial(), g = new THREE.Group(), inner = new THREE.Group();
  const legL = new THREE.Group(), legR = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group(), hand = new THREE.Group();
  g.add(inner);
  inner.add(legL, legR, body);
  legL.position.set(-4.5, 13.6, 0); legR.position.set(4.5, 13.6, 0);
  mesh(legL, G4.leg, mat); mesh(legR, G4.leg, mat);
  mesh(body, G4.body, mat);
  head.position.set(0, 33, 0);
  body.add(head);
  mesh(head, G4.head, mat);
  armL.position.set(-9.8, 31, 0); armR.position.set(9.8, 31, 0);
  body.add(armL, armR);
  mesh(armL, G4.arm, mat); mesh(armR, G4.arm, mat);
  hand.position.set(0, -14, 0);
  armR.add(hand);
  g.scale.setScalar(sc);
  return { g, inner, body, legL, legR, armL, armR, hand, head, mats: [mat], sc, person: true, block: true, w: null };
}

// ---------- creatures ----------
// The round originals from r3actors.js, rebuilt from the faceted shapes above and shaded flat.
function rigCreaturePoly(type) {
  polyShapes();
  const swap = { ball: POLY.ico1, cone: POLY.cone5, cyl: POLY.cyl6, torus: POLY.torus8 }, keep = {};
  for (const k in swap) { keep[k] = GEO[k]; GEO[k] = swap[k]; }
  let R;
  try { R = rigCreatureSmooth(type); } finally { Object.assign(GEO, keep); }
  for (const m of R.mats) { m.flatShading = true; if (m.emissive.getHex() === 0) { m.emissive.copy(m.color); m.emissiveIntensity = 0.2; } m.needsUpdate = true; }
  return R;
}

// ---------- trees, bushes and rocks ----------
R3.polyNature = function (W, trees, rocks) {
  polyShapes();
  const sh = (g) => { g.userData.shared = true; return g; };
  const M = (o) => std(0xffffff, Object.assign({ flatShading: true, roughness: 1 }, o));
  const leafM = M(), barkM = M({ color: 0x7a5236 }), rockM = M(), mossM = M({ color: 0x6f9a54 });
  const lump = (r, sy0) => { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, sy0, 1); return sh(g); };
  const cone = (r, h) => sh(new THREE.ConeGeometry(r, h, 6));
  // a broadleaf: a few big lumps on a five-sided trunk; a conifer: three stacked cones
  const kinds = [[], []];
  this.treeInst = true;
  trees.forEach((o, i) => {
    const kind = (i * 7 + (o.cr | 0)) % 3 === 0 ? 1 : 0;
    o._ti = { x: o.x, y: o.y, s: clamp(o.cr * (kind ? 0.62 : 0.72), 26, 52), rot: i * 2.4, col: o.pal[1] };
    o._hide = 0;
    kinds[kind].push(o._ti);
  });
  const trunk = sh(new THREE.CylinderGeometry(0.16, 0.3, 2, 5));
  const broad = [{ geo: trunk, mat: barkM, at: [0, 1, 0] }, { geo: lump(1.25, 0.86), mat: leafM, at: [0, 2.7, 0], tint: true }, { geo: lump(0.85, 0.85), mat: leafM, at: [0.75, 3.35, 0.3], tint: true, shade: 1.12 }, { geo: lump(0.7, 0.85), mat: leafM, at: [-0.8, 2.45, 0.55], tint: true, shade: 0.88 }];
  const fir = [{ geo: sh(new THREE.CylinderGeometry(0.14, 0.24, 1.4, 5)), mat: barkM, at: [0, 0.7, 0] }, { geo: cone(1.25, 1.7), mat: leafM, at: [0, 1.9, 0], tint: true, shade: 0.86 }, { geo: cone(0.98, 1.5), mat: leafM, at: [0, 2.9, 0], tint: true }, { geo: cone(0.68, 1.35), mat: leafM, at: [0, 3.85, 0], tint: true, shade: 1.14 }];
  if (kinds[0].length) this.scatterBlocks(W, broad, kinds[0], 240);
  if (kinds[1].length) this.scatterBlocks(W, fir, kinds[1], 260);
  if (rocks.length) {
    const big = new THREE.DodecahedronGeometry(1, 0); big.scale(1.15, 0.72, 0.95);
    const small = new THREE.DodecahedronGeometry(0.55, 0); small.scale(1, 0.8, 1);
    const cap = new THREE.IcosahedronGeometry(0.6, 0); cap.scale(1.3, 0.18, 1.1);
    const items = rocks.map((o, i) => ({ x: o.x, y: o.y, s: o.r * 0.98, rot: i * 1.9, col: ['#9a9a94', '#86888a', '#a6a296'][i % 3] }));
    this.scatterBlocks(W, [{ geo: sh(big), mat: rockM, at: [0, 0.5, 0], tint: true }, { geo: sh(small), mat: rockM, at: [0.85, 0.3, 0.45], tint: true, shade: 0.9 }, { geo: sh(cap), mat: mossM, at: [-0.1, 1.12, 0] }], items, 90);
  }
  // bushes: just for the look, no collision
  const bushes = [];
  for (let i = 0; i < 420 && bushes.length < 150; i++) {
    const x = rand(80, ARENA.w - 80), y = rand(80, ARENA.h - 80);
    if (!isClear(x, y, 26)) continue;
    bushes.push({ x, y, s: rand(13, 22), rot: i * 1.3, col: pick(['#3f8a3a', '#4f9c44', '#357a34', '#5aa64a']) });
  }
  this.scatterBlocks(W, [{ geo: lump(1, 0.75), mat: leafM, at: [0, 0.6, 0], tint: true }, { geo: lump(0.62, 0.8), mat: leafM, at: [0.8, 0.45, 0.3], tint: true, shade: 1.12 }], bushes, 60, 2100);
};

// ---------- which look ----------
// 'poly' (this file), 'block' (r3blocks.js) or 'model' (r3models.js, chosen by whoever calls these).
const rigPersonSmooth = rigPerson, rigCreatureSmooth = rigCreature; // the capsule-and-sphere originals in r3actors.js
rigPerson = (look, sc) => (Settings.style === 'block' ? rigPersonBlock(look, sc) : rigPersonPoly(look, sc));
rigCreature = (type) => (Settings.style === 'block' ? rigCreatureBlock(type) : rigCreaturePoly(type));
