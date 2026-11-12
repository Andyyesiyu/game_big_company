'use strict';
// ---------- 3D renderer: the model library ----------
// Characters, trees, rocks, buildings and props come from free CC0 packs (see CREDITS.md),
// shipped inside assets/models.js as base64 GLBs so the game still runs from a single file.
// Until they have finished decoding, and if they ever fail to, the hand-built shapes are used.
R3.models = null;
const SKIN_TONES = ['#f6d3b3', '#eec3a2', '#dfae86', '#c9966c', '#a9744f'];
const CHAR_K = 74 / 3.33; // model units -> world units, so everyone stands about 74 tall
const RIVAL_MODELS = ['Casual_Female', 'Casual2_Male', 'Casual3_Male', 'Casual3_Female', 'Worker_Male', 'Casual_Male'];
const BOSS_MODELS = { pony: 'Suit_Male', yiming: 'Casual2_Male', elon: 'Casual_Bald', sam: 'Casual3_Male', dario: 'OldClassy_Male' };
const HQ_MODELS = { pony: 'building_castle_blue', yiming: 'building_tavern_red', elon: 'building_blacksmith_red', sam: 'building_market_green', dario: 'building_church_yellow' };
const SHED_MODELS = ['building_home_A_yellow', 'building_home_B_blue', 'building_home_A_green', 'building_home_B_red'];

R3.loadModels = function (done) {
  if (!this.ok || typeof MODEL_B64 === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
  const loader = new THREE.GLTFLoader(), names = Object.keys(MODEL_B64), lib = {};
  let left = names.length, failed = false;
  const fin = () => {
    if (--left) return;
    if (failed || !lib.Casual_Male || !lib.Robot) return;
    try { this.prepModels(lib); this.models = lib; done(); } catch (e) { if (window.console) console.warn('Models unusable, keeping the built-in shapes:', e.message); }
  };
  for (const n of names) {
    const s = atob(MODEL_B64[n]), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    loader.parse(u.buffer, '', (g) => { lib[n] = g; fin(); }, () => { failed = true; fin(); });
  }
};
R3.prepModels = function (lib) {
  for (const n in lib) {
    const g = lib[n], leafy = /Tree|Pine|Bush/.test(n);
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.geometry.userData.shared = true;
      for (const mt of [].concat(m.material)) {
        if (mt.userData.shared) continue;
        mt.userData.shared = true;
        // the rest of the scene is lit in display space, so bring glTF's linear colours over to match
        mt.color.convertLinearToSRGB();
        mt.metalness = 0; mt.roughness = 0.85;
        if (mt.map && n === 'Bush_Common') mt.map = greened(mt.map); // the pack's bush is autumn red; ours is a summer meadow
        if (mt.map) { mt.map.encoding = THREE.LinearEncoding; mt.map.userData.shared = true; mt.map.needsUpdate = true; }
        if (leafy) { mt.alphaTest = 0.4; mt.transparent = false; mt.side = THREE.DoubleSide; }
      }
    });
    const b = new THREE.Box3().setFromObject(g.scene);
    g.userData.size = b.getSize(new THREE.Vector3()); g.userData.min = b.min.clone(); g.userData.center = b.getCenter(new THREE.Vector3());
  }
  this.clips = {}; for (const a of lib.Casual_Male.animations) this.clips[a.name] = a;
  this.robotClips = {}; for (const a of lib.Robot.animations) this.robotClips[a.name] = a;
};
// the same texture with red and green swapped
function greened(map) {
  const im = map.image, cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext('2d');
  c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const r = a[i]; a[i] = a[i + 1] * 0.8; a[i + 1] = Math.min(255, r * 1.05); }
  c.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  return t;
}
// a private copy of a model: its own materials so it can flash or fade without touching the others
function cloneModel(src, skinned) {
  const o = skinned ? THREE.SkeletonUtils.clone(src.scene) : src.scene.clone(true), mats = [];
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone(); m.material.userData = {};
    mats.push(m.material);
    if (skinned) m.frustumCulled = false;
  });
  return { o, mats };
}

// ---------- animated people ----------
function rigChar(name, sc = 1, skin) {
  const src = R3.models[name], g = new THREE.Group(), c = cloneModel(src, true), inner = c.o;
  inner.scale.multiplyScalar(CHAR_K);
  inner.position.y = -src.userData.min.y * CHAR_K;
  const tone = skin || pick(SKIN_TONES);
  for (const m of c.mats) if (m.name === 'Skin') m.color.set(tone);
  selfLit(c.mats);
  g.add(inner);
  g.scale.setScalar(sc);
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  for (const k in R3.clips) actions[k] = mixer.clipAction(R3.clips[k]);
  // a holder that follows the right fist (see aimWeapon) for whatever they're carrying
  const fist = inner.getObjectByName('FistR'), hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  g.add(hand);
  return { g, inner, mixer, actions, curA: null, key: null, mats: c.mats, hand, fist, sc, person: true, model: true, w: null };
}
// The sun is nearly overhead, so faces turned to the camera sit in shade; a little of their own colour lifts them.
function selfLit(mats) {
  for (const m of mats) if (!m.map) { m.emissive.copy(m.color); m.emissiveIntensity = 0.24; }
}
// Keep the held item on the fist, pointing ahead of the character: tilt raises it, sweep swings it sideways.
const _wv = new THREE.Vector3();
function aimWeapon(R, tilt, sweep) {
  if (!R.fist) return;
  R.g.updateMatrixWorld(true);
  R.hand.position.copy(R.g.worldToLocal(_wv.setFromMatrixPosition(R.fist.matrixWorld)));
  R.hand.rotation.set(-(Math.PI / 2 + tilt), sweep, 0);
}
function rigRobot(height, tint) {
  const src = R3.models.Robot, g = new THREE.Group(), c = cloneModel(src, true), k = height / src.userData.size.y;
  c.o.scale.multiplyScalar(k);
  c.o.position.y = -src.userData.min.y * k;
  for (const m of c.mats) if (m.name === 'Main') m.color.set(tint);
  selfLit(c.mats);
  g.add(c.o);
  const mixer = new THREE.AnimationMixer(c.o), actions = {};
  for (const n in R3.robotClips) actions[n] = mixer.clipAction(R3.robotClips[n]);
  return { g, inner: c.o, mixer, actions, curA: null, key: null, mats: c.mats, sc: 1, model: true, robot: true };
}
// Switch a rig to an animation. `key` restarts the same clip (each new swing is a new key).
function animSet(R, name, o = {}) {
  const a = R.actions[name];
  if (!a) return;
  const key = name + (o.key === undefined ? '' : ':' + o.key);
  if (R.key !== key) {
    const prev = R.curA;
    a.reset();
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = true;
    a.fadeIn(o.fade === undefined ? 0.12 : o.fade).play();
    if (prev && prev !== a) prev.fadeOut(0.12);
    R.curA = a; R.key = key;
  }
  a.timeScale = o.speed || 1;
}

// ---------- the static world, built from models ----------
R3.fit = function (name, w, h, d) {
  const s = this.models[name].userData.size;
  return Math.min(w / s.x, h / s.y, d / s.z);
};
// Put a model at a spot with its base on the ground; returns { o, mats }.
R3.place = function (W, name, x, y, scale, rotY = 0, cx = true) {
  const src = this.models[name], c = cloneModel(src, false), g = new THREE.Group();
  const sv = typeof scale === 'number' ? [scale, scale, scale] : scale;
  c.o.position.set(cx ? -src.userData.center.x : 0, -src.userData.min.y, cx ? -src.userData.center.z : 0);
  g.add(c.o);
  g.scale.set(sv[0], sv[1], sv[2]); g.rotation.y = rotY; g.position.set(x, 0, y);
  W.add(g);
  c.g = g;
  return c;
};
// Many copies of one model as instanced meshes. items: [{ x, y, s, rot }]; returns the instanced meshes.
R3.scatter = function (W, name, items, cast = true) {
  const src = this.models[name], out = [], m4 = this.m4, base = new THREE.Matrix4().makeTranslation(-src.userData.center.x, -src.userData.min.y, -src.userData.center.z);
  src.scene.traverse((m) => {
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, items.length), local = base.clone().multiply(m.matrixWorld);
    im.castShadow = cast; im.receiveShadow = true;
    im.userData.local = local;
    items.forEach((q, i) => {
      m4.compose(this.v.set(q.x, 0, q.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), q.rot || 0), this.v2.set(q.s, q.s * (q.sy || 1), q.s)).multiply(local);
      im.setMatrixAt(i, m4);
    });
    W.add(im);
    out.push(im);
  });
  return out;
};
R3.modelNature = function (W, trees, rocks) {
  const M = this.models, TT = ['CommonTree_3', 'CommonTree_5', 'Pine_1'], by = {};
  this.treeInst = {};
  trees.forEach((o, i) => {
    const t = TT[(i * 7 + (o.cr | 0)) % TT.length], list = by[t] || (by[t] = []);
    o._ti = { t, idx: list.length, x: o.x, y: o.y, s: (150 + o.cr * 1.7) / M[t].userData.size.y, rot: i * 2.4 };
    o._hide = 0;
    list.push(o._ti);
  });
  for (const t in by) this.treeInst[t] = this.scatter(W, t, by[t]);
  const RK = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], rb = {};
  rocks.forEach((o, i) => { const t = RK[i % 3]; (rb[t] || (rb[t] = [])).push({ x: o.x, y: o.y, s: (o.r * 2.2) / M[t].userData.size.x, rot: i * 1.9 }); });
  for (const t in rb) this.scatter(W, t, rb[t]);
  // bushes: just for the look, no collision
  const bushes = [];
  for (let i = 0; i < 400 && bushes.length < 150; i++) {
    const x = rand(80, ARENA.w - 80), y = rand(80, ARENA.h - 80);
    if (!isClear(x, y, 26)) continue;
    bushes.push({ x, y, s: rand(18, 30), rot: i * 1.3 });
  }
  this.scatter(W, 'Bush_Common', bushes, false);
};
R3.modelBuilding = function (W, ob) {
  const hq = !!ob.bld, name = hq ? HQ_MODELS[ob.bld] : SHED_MODELS[Math.abs(Math.round(ob.x + ob.y)) % SHED_MODELS.length];
  const s = hq ? this.fit(name, ob.w * 0.6, 600, ob.d * 1.1) : this.fit(name, ob.w * 1.15, 200, ob.d * 1.5);
  const c = this.place(W, name, ob.x + ob.w / 2, ob.y + ob.d / 2, s);
  if (hq) {
    // two annexes so the headquarters fills its lot
    [-1, 1].forEach((sd, i) => {
      const an = SHED_MODELS[(Object.keys(HQ_MODELS).indexOf(ob.bld) + i) % SHED_MODELS.length];
      const a = this.place(W, an, ob.x + ob.w / 2 + sd * ob.w * 0.36, ob.y + ob.d * 0.58, this.fit(an, ob.w * 0.3, 240, ob.d * 0.8), sd * -0.25);
      this.bld.push({ ob, g: a.g, mats: a.mats, a: 1, sy: a.g.scale.y });
    });
  }
  const g = new THREE.Group();
  g.position.set(ob.x + ob.w / 2, 0, ob.y + ob.d / 2);
  for (const sx0 of [-1, 1]) {
    const lamp = mesh(g, new THREE.SphereGeometry(7, 10, 8), this.lampMat, sx0 * (ob.w / 2 - 6), 46, ob.d / 2 + 14, false);
    mesh(g, new THREE.BoxGeometry(3, 46, 3), std(0x4a3320), sx0 * (ob.w / 2 - 6), 23, ob.d / 2 + 14);
    this.lamps.push({ x: g.position.x + lamp.position.x, y: g.position.z + lamp.position.z, h: 46 });
  }
  if (hq) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    const post = std(0x4a3320);
    for (const px of [-118, 118]) mesh(g, new THREE.BoxGeometry(7, 96, 7), post, px, 48, ob.d / 2 + 26);
    mesh(g, new THREE.PlaneGeometry(260, 49), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), 0, 96, ob.d / 2 + 31, false);
    this.signs.push({ c: cv, tex, id: ob.bld, neon: THEMES[ob.bld].neon });
  }
  W.add(g);
  this.bld.push({ ob, g: c.g, mats: c.mats, a: 1, sy: c.g.scale.y });
};
R3.modelDesk = function (W, ob) {
  const sz = this.models.table_medium_long.userData.size, th = THEMES[ob.theme];
  const c = this.place(W, 'table_medium_long', ob.x + ob.w / 2, ob.y + ob.d / 2, [ob.w / sz.x, ob.h / sz.y, ob.d / sz.z]);
  const g = new THREE.Group(), n = Math.max(1, Math.floor(ob.w / 90));
  g.position.set(ob.x + ob.w / 2, 0, ob.y + ob.d / 2);
  for (let i = 0; i < n; i++) {
    const mx = -ob.w / 2 + ((i + 0.5) * ob.w) / n;
    mesh(g, new THREE.BoxGeometry(5, 12, 5), std(0x2a2438), mx, ob.h + 6, -4);
    mesh(g, new THREE.BoxGeometry(44, 28, 4), std(0x2a2438), mx, ob.h + 24, -4);
    mesh(g, new THREE.BoxGeometry(38, 22, 1), std(th.screen, { emissive: th.screen, emissiveIntensity: 0.7, roughness: 0.3 }), mx, ob.h + 24, -1.6, false);
  }
  W.add(g);
  g.add(c.g);
  c.g.position.set(0, 0, 0);
  return g;
};
R3.modelContainer = function (W, k) {
  const name = k.kind === 'crate' ? 'box_large' : k.kind === 'locker' ? 'cabinet_medium' : 'chest', sz = this.models[name].userData.size;
  const scale = k.kind === 'crate' ? 34 / sz.x : k.kind === 'locker' ? [40 / sz.x, 52 / sz.y, 26 / sz.z] : 44 / sz.x;
  const c = this.place(W, name, k.x, k.y, scale, (k.x * 0.37) % 0.6 - 0.3);
  const lid = c.o.getObjectByName('chest_lid') || null;
  const spark = mesh(c.g, new THREE.SphereGeometry(3, 8, 6), basic(0xffffff, { opacity: 0.9, blending: THREE.AdditiveBlending }), 0, 60, 0, false);
  const inv = 1 / (typeof scale === 'number' ? scale : scale[1]);
  spark.scale.setScalar(inv); spark.userData.h = (k.kind === 'locker' ? 70 : 54) * inv; spark.position.y = spark.userData.h;
  return { g: c.g, lid, spark, open: false, model: true, mats: c.mats };
};
