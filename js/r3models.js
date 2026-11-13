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
  if (!this.ok || this.loadingModels || typeof MODEL_B64 === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
  this.loadingModels = true;
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
    if (failed || !lib.Casual_Male || !lib.Robot) { this.modelsFailed = true; return; }
    try { this.prepModels(lib); this.models = lib; done(); } catch (e) { this.modelsFailed = true; if (window.console) console.warn('Models unusable, keeping the built-in shapes:', e.message); }
  };
  // a few models per tick, so the menu stays responsive while they decode
  let at = 0;
  const step = () => {
    for (let k = 0; k < 4 && at < names.length; k++) {
      const n = names[at++], s = atob(MODEL_B64[n]), u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      loader.parse(u.buffer, '', (g) => { lib[n] = g; fin(); }, () => { failed = true; fin(); });
    }
    if (at < names.length) setTimeout(step, 0);
  };
  step();
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
    mergeSkinned(g);
    g.scene.traverse((m) => { if (m.isSkinnedMesh && !m.geometry.attributes.normal) { m.geometry.computeVertexNormals(); m.material.flatShading = false; m.material.needsUpdate = true; } });
    const b = new THREE.Box3().setFromObject(g.scene);
    g.userData.size = b.getSize(new THREE.Vector3()); g.userData.min = b.min.clone(); g.userData.center = b.getCenter(new THREE.Vector3());
  }
  this.clips = {}; for (const a of lib.Casual_Male.animations) this.clips[a.name] = a;
  this.robotClips = {}; for (const a of lib.Robot.animations) this.robotClips[a.name] = a;
};
// A character arrives as one skinned mesh per material (skin, shirt, hair...): seven draw calls each, and seven
// more for its shadow. Join them into one mesh whose colours live on the vertices, and remember which vertices
// belonged to which material so a copy can still be given its own skin tone, hair colour or outfit.
function charMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  // faces turned to the camera sit in shade under a high sun: lift them with a little of their own colour
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.24;'); };
  m.customProgramCacheKey = () => 'char';
  m.name = 'Body';
  return m;
}
function mergeSkinned(g) {
  const parts = [];
  g.scene.traverse((m) => { if (m.isSkinnedMesh) parts.push(m); });
  if (parts.length < 2) return;
  let nv = 0, ni = 0;
  for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index.count; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), ranges = {};
  // read one component of an attribute whether or not it is interleaved or stored as normalised integers
  const read = (a, i, c) => {
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array, v = arr[a.isInterleavedBufferAttribute ? i * a.data.stride + a.offset + c : i * a.itemSize + c];
    return a.normalized ? v / (arr instanceof Uint8Array ? 255 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Int16Array ? 32767 : 1) : v;
  };
  let v0 = 0, i0 = 0;
  for (const m of parts) {
    const ge = m.geometry, P = ge.attributes.position, J = ge.attributes.skinIndex, Wt = ge.attributes.skinWeight, c = m.material.color, n = P.count;
    for (let i = 0; i < n; i++) {
      const o = v0 + i;
      for (let k = 0; k < 3; k++) pos[o * 3 + k] = read(P, i, k);
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      for (let k = 0; k < 4; k++) { si[o * 4 + k] = J.isInterleavedBufferAttribute ? J.data.array[i * J.data.stride + J.offset + k] : J.array[i * 4 + k]; sw[o * 4 + k] = read(Wt, i, k); }
    }
    const I = ge.index.array;
    for (let i = 0; i < I.length; i++) idx[i0 + i] = I[i] + v0;
    ranges[m.material.name] = { v0, v1: v0 + n, i0, i1: i0 + I.length };
    v0 += n; i0 += I.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  // The files carry no normals (they were dropped to keep the download small). Work them out here, averaged at
  // every shared vertex, so the surface is shaded smoothly instead of as visible flat faces. Vertices are only
  // shared within one material, so the seams between skin, hair and clothes stay crisp.
  geo.computeVertexNormals();
  geo.userData.shared = true;
  const mat = charMaterial();
  mat.userData.shared = true;
  const first = parts[0], one = new THREE.SkinnedMesh(geo, mat);
  one.name = 'Body'; one.castShadow = one.receiveShadow = true;
  one.position.copy(first.position); one.quaternion.copy(first.quaternion); one.scale.copy(first.scale);
  first.parent.add(one);
  one.bind(first.skeleton, first.bindMatrix);
  for (const m of parts) { m.parent.remove(m); m.geometry.dispose(); }
  g.scene.updateMatrixWorld(true);
  g.userData.ranges = ranges;
}
// Give one copy of a merged character its own colours: { Skin: '#...', Hair: '#...' or null to hide it, ... }.
// Everything but the colours (and, when something is hidden, the index) is shared with every other copy.
const _tc = new THREE.Color();
function tintChar(mesh, ranges, map) {
  const g0 = mesh.geometry, geo = new THREE.BufferGeometry(), col = g0.attributes.color.clone();
  for (const k in g0.attributes) if (k !== 'color') geo.setAttribute(k, g0.attributes[k]);
  let index = g0.index;
  for (const name in map) {
    const r = ranges[name];
    if (!r) continue;
    if (map[name] === null) { const a = index.array, out = new a.constructor(a.length - (r.i1 - r.i0)); out.set(a.subarray(0, r.i0)); out.set(a.subarray(r.i1), r.i0); index = new THREE.BufferAttribute(out, 1); continue; }
    _tc.set(map[name]);
    for (let i = r.v0; i < r.v1; i++) col.setXYZ(i, _tc.r, _tc.g, _tc.b);
  }
  geo.setAttribute('color', col); geo.setIndex(index);
  geo.userData.shared = true; // most of its buffers belong to every copy: never dispose them with one rig
  mesh.geometry = geo;
}
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
    const m0 = m.material;
    m.material = m0.clone(); m.material.userData = {};
    if (m0.customProgramCacheKey() === 'char') { m.material.onBeforeCompile = m0.onBeforeCompile; m.material.customProgramCacheKey = m0.customProgramCacheKey; }
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
  const tones = Object.assign({ Skin: skin || pick(SKIN_TONES) }, look ? look.cols : null);
  if (look) tones.Hair = look.hair;
  inner.traverse((m) => { if (m.isSkinnedMesh) tintChar(m, src.userData.ranges, tones); });
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
  c.o.traverse((m) => { if (m.isSkinnedMesh && src.userData.ranges) tintChar(m, src.userData.ranges, { Main: tint }); });
  for (const m of c.mats) if (m.name === 'Main') m.color.set(tint);
  selfLit(c.mats.filter((m) => m.name !== 'Body'));
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
// Many copies of one model as instanced meshes. items: [{ x, y, s, rot }]. The map is cut into cells with one
// instanced mesh per cell, because three culls an instanced mesh as a whole: without cells every tree on the
// map is drawn (and drawn again into the shadow map) every frame. Each item learns its cell and its slot in it.
const CELL = 600;
function cellsOf(items, far = 1e9) {
  const cells = new Map();
  for (const q of items) {
    const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL), key = cx + ',' + cy;
    let c = cells.get(key);
    if (!c) { cells.set(key, (c = { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, items: [], ims: [], vis: true, far })); R3.cells.push(c); }
    q.cell = c; q.idx = c.items.length; c.items.push(q);
  }
  return cells;
}
const cellSphere = (h) => new THREE.Sphere(new THREE.Vector3(0, h / 2, 0), CELL * 0.71 + h);
R3.scatter = function (W, name, items, cast = true, far) {
  const src = this.models[name], m4 = this.m4, base = new THREE.Matrix4().makeTranslation(-src.userData.center.x, -src.userData.min.y, -src.userData.center.z);
  const cells = cellsOf(items, far), tall = Math.max(...items.map((q) => q.s)) * src.userData.size.y;
  src.scene.traverse((m) => {
    if (!m.isMesh) return;
    const local = base.clone().multiply(m.matrixWorld);
    m.geometry.boundingSphere = cellSphere(tall); // in the cell's own space: the whole cell, not one model
    for (const c of cells.values()) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, c.items.length);
      im.castShadow = cast; im.receiveShadow = true;
      im.frustumCulled = true; // (three turns this off for instanced meshes; the cell's bounding sphere makes it safe)
      im.userData.local = local;
      im.position.set(c.x, 0, c.y);
      c.items.forEach((q, i) => {
        m4.compose(this.v.set(q.x - c.x, 0, q.y - c.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), q.rot || 0), this.v2.set(q.s, q.s * (q.sy || 1), q.s)).multiply(local);
        im.setMatrixAt(i, m4);
      });
      W.add(im);
      c.ims.push(im);
    }
  });
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
  for (const t in by) this.scatter(W, t, by[t]);
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
  this.scatter(W, 'Bush_Common', bushes, false, 2100); // decoration: not worth drawing far away
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
