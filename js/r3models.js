'use strict';
// ---------- 3D renderer: the model library ----------
// Characters, trees, rocks, buildings and props come from free CC0 packs (see CREDITS.md),
// shipped inside assets/models.js as base64 GLBs so the game still runs from a single file.
// Until they have finished decoding, and if they ever fail to, the hand-built shapes are used.
R3.models = null;
const SKIN_TONES = ['#f6d3b3', '#eec3a2', '#dfae86', '#c9966c', '#a9744f'];
const CHAR_K = 74 / 3.33; // model units -> world units, so everyone stands about 74 tall
const RIVAL_MODELS = ['Casual_Female', 'Casual2_Male', 'Casual3_Male', 'Casual3_Female', 'Worker_Male', 'Casual_Male'];
// The five bosses: a body from the pack, recoloured, plus the features people know them by.
// cols maps the model's material names to new colours; hair: null hides the model's own hair.
const BOSS_LOOK = {
  pony: { model: 'Suit_Male', sc: 1.4, skin: '#f0c8a0', hair: '#15151a', cols: { Black: '#243357', Shirt: '#ffffff', Details: '#2f6fd6' }, glasses: 'rimless' },
  yiming: { model: 'Casual2_Male', sc: 1.36, skin: '#f0c8a0', hair: '#141418', cols: { Shirt: '#7f8b99', Pants: '#20232b' }, glasses: 'square' },
  elon: { model: 'Suit_Male', sc: 1.6, skin: '#f2d2b6', hair: '#3b2a1e', cols: { Black: '#17171a', Shirt: '#0e0e10', Details: '#0e0e10', Belt: '#0b0b0d' } },
  sam: { model: 'Casual2_Male', sc: 1.34, skin: '#f4d6bc', hair: '#a07a52', cols: { Shirt: '#6e7f78', Pants: '#3a4a6b' } },
  dario: { model: 'Suit_Male', sc: 1.46, skin: '#eec6a4', hair: null, cols: { Black: '#3d4350', Shirt: '#dfe7f2', Details: '#dfe7f2' }, glasses: 'round', curls: '#3a2718' },
};

R3.loadModels = function (done) {
  if (!this.ok || typeof MODEL_B64 === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
  const loader = new THREE.GLTFLoader(), names = Object.keys(MODEL_B64), lib = {};
  // The stock loader turns each embedded texture into a blob: URL and fetch()es it, which a hosted page's
  // content policy can forbid. Decode the image bytes directly instead: remember which blob each URL was
  // made from, and hand the loader a texture loader that reads the blob without touching the network.
  const blobs = new Map(), mkUrl = URL.createObjectURL;
  URL.createObjectURL = function (b) { const u = mkUrl.call(URL, b); blobs.set(u, b); return u; };
  const restore = () => { URL.createObjectURL = mkUrl; };
  const direct = {
    isImageBitmapLoader: true,
    load(url, onLoad, onProgress, onError) {
      const b = blobs.get(url);
      if (!b) return onError(new Error('no image data'));
      const viaImage = () => { // older browsers: a data: URL in an <img>
        const fr = new FileReader();
        fr.onload = () => { const im = new Image(); im.onload = () => onLoad(im); im.onerror = onError; im.src = fr.result; };
        fr.onerror = onError; fr.readAsDataURL(b);
      };
      if (window.createImageBitmap) createImageBitmap(b).then(onLoad, viaImage); else viaImage();
    },
  };
  loader.register((parser) => { parser.textureLoader = direct; return { name: 'INLINE_TEXTURES' }; });
  let left = names.length, failed = false;
  const fin = () => {
    if (--left) return;
    restore();
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
function rigChar(name, sc = 1, skin, look) {
  const src = R3.models[name], g = new THREE.Group(), c = cloneModel(src, true), inner = c.o;
  inner.scale.multiplyScalar(CHAR_K);
  inner.position.y = -src.userData.min.y * CHAR_K;
  const tone = skin || pick(SKIN_TONES);
  for (const m of c.mats) {
    if (m.name === 'Skin') m.color.set(tone);
    else if (look && m.name === 'Hair') { if (look.hair) m.color.set(look.hair); else m.visible = false; }
    else if (look && look.cols[m.name]) m.color.set(look.cols[m.name]);
  }
  selfLit(c.mats);
  g.add(inner);
  g.scale.setScalar(sc);
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  for (const k in R3.clips) actions[k] = mixer.clipAction(R3.clips[k]);
  // a holder that follows the right fist (see aimWeapon) for whatever they're carrying
  const fist = inner.getObjectByName('FistR'), hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  g.add(hand);
  const R = { g, inner, by: inner.position.y, mixer, actions, curA: null, key: null, mats: c.mats, hand, fist, sc, person: true, model: true, w: null };
  if (look && (look.glasses || look.curls)) headwear(R, look);
  return R;
}
// Glasses and hair that ride on the head bone. Built around the bone's resting place, in the rig's own
// units: the eyes sit 10.9 up and 10.7 forward of it, 5.2 either side, and the skull is about 11 across.
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hs = new THREE.Vector3();
function headLocal(R) { return _hm.copy(R.g.matrixWorld).invert().multiply(R.headBone.matrixWorld); }
function headwear(R, look) {
  const acc = (R.acc = new THREE.Group()), mats = [];
  R.headBone = R.inner.getObjectByName('Head');
  R.g.add(acc);
  R.g.updateMatrixWorld(true);
  headLocal(R).decompose(acc.position, _hq, _hs);
  R.headRest = _hq.clone().invert();
  if (look.glasses) {
    const thin = look.glasses === 'rimless', sq = look.glasses !== 'round', wide = thin ? 1.2 : 1.08, tall = thin ? 0.62 : 0.86;
    const fm = std(thin ? 0x8d98a3 : 0x17171b, { roughness: 0.35, metalness: thin ? 0.5 : 0.1 }), r = sq ? 4.3 : 3.6;
    mats.push(fm);
    for (const sx0 of [-1, 1]) {
      const ring = mesh(acc, new THREE.TorusGeometry(r, thin ? 0.38 : 0.75, 6, sq ? 4 : 20), fm, sx0 * 5.3, 10.9, 11.9, false);
      if (sq) { ring.rotation.z = Math.PI / 4; ring.scale.set(wide, tall, 1); }
      const lens = mesh(acc, new THREE.CircleGeometry(sq ? r * 0.78 : r, sq ? 4 : 18), new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: thin ? 0.3 : 0.22, depthWrite: false }), sx0 * 5.3, 10.9, 11.8, false);
      if (sq) { lens.rotation.z = Math.PI / 4; lens.scale.set(wide, tall, 1); }
      mesh(acc, new THREE.BoxGeometry(0.7, 0.7, 11), fm, sx0 * 9.6, 11.2, 6.4, false);
    }
    mesh(acc, new THREE.BoxGeometry(3, 0.7, 0.7), fm, 0, 11.4, 11.9, false);
  }
  if (look.curls) {
    // a head of curls: balls scattered over the scalp, leaving the face clear
    const cm = std(look.curls, { roughness: 1 }), geo = new THREE.SphereGeometry(1, 8, 6);
    mats.push(cm);
    for (let i = 0, n = 64; i < n; i++) {
      const y = 1 - (i / n) * 1.35, rr = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * 2.39996, x = Math.cos(ph) * rr, z = Math.sin(ph) * rr;
      if (z > 0.38 && y < 0.5) continue;
      const b = mesh(acc, geo, cm, x * 10.6, 11.9 + y * 10.4, -0.4 + z * 10.6, false);
      b.scale.setScalar(3.5 + ((i * 7) % 5) * 0.28);
    }
  }
  selfLit(mats);
  for (const m of mats) R.mats.push(m);
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
  if (R.acc) { headLocal(R).decompose(R.acc.position, R.acc.quaternion, _hs); R.acc.quaternion.multiply(R.headRest); }
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
