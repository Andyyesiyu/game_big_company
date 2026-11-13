'use strict';
// ---------- 3D renderer: scene, static world, camera, light, post ----------
// The simulation lives on a flat plane: world (x, y) with height z. Three.js is y-up,
// so anything at world (x, y, z) is drawn at three (x, z, y). The camera sits to the
// south looking north, so "up" on screen is still -y and the controls don't change.
const R3 = {
  on: false, ok: false, r: null, cv: null, scene: null, cam: null, world: null, dyn: null,
  pool: {}, ents: new Map(), frameNo: 0, uTime: { value: 0 }, signs: [], lang: null,
  occl: [], bld: [], desks: new Map(), conts: new Map(), exits: [], lamps: [], lampLights: [],
};
const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0 }, o));
const basic = (color, o) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, depthWrite: false }, o));
function mesh(parent, geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// Push the vertices of a smooth shape around a little so it reads as a rock or a clump of leaves.
function lumpy(geo, amt, freq = 3) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // a few octaves of smooth wobble, a function of position only, so neighbouring vertices agree and the surface stays smooth
    const k = 1 + (Math.sin(x * freq + y * 1.7) * Math.cos(z * freq * 1.3 - y) + Math.sin(y * freq * 2.1 + z * 2.3) * 0.5 + Math.sin(x * freq * 2.7 - z * 1.9) * 0.35) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  // the seam of a UV sphere: copy the first column's normals onto the last so no crease shows
  if (geo.parameters && geo.parameters.widthSegments) {
    const w = geo.parameters.widthSegments + 1;
    for (let r = 0; r <= geo.parameters.heightSegments; r++) n.setXYZ(r * w + w - 1, n.getX(r * w), n.getY(r * w), n.getZ(r * w));
  }
  return geo;
}
// Hand-painted style surface textures, generated once.
const TEX = {};
function surfaceTextures() {
  if (TEX.leaf) return;
  const dabs = (g, n, cols, w, h, rot) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, w * (0.6 + Math.random()), h * (0.6 + Math.random()), rot === undefined ? Math.random() * 3.14 : rot, 0, 6.3); g.fill(); } };
  TEX.leaf = canvasTex(256, 256, (g) => { g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 256, 256); dabs(g, 700, ['#9a9a9a', '#c4c4c4', '#ffffff', '#b0b0b0', '#dcdcdc', '#f2f2f2', '#888888'], 9, 5); }, true);
  TEX.leaf.repeat.set(3, 2);
  TEX.bark = canvasTex(128, 256, (g) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 128, 256); dabs(g, 260, ['#5a5a5a', '#c4c4c4', '#787878', '#e0e0e0'], 2.5, 22, 0); }, true);
  TEX.rock = canvasTex(256, 256, (g) => { g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 256); dabs(g, 380, ['#bcbcbc', '#e4e4e4', '#cfcfcf', '#f4f4f4', '#aaaaaa'], 12, 8); dabs(g, 26, ['#9aa88a'], 16, 9); }, true);
  TEX.rock.repeat.set(2, 2);
  TEX.wood = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = `rgb(${190 + (x * 7) % 50},${190 + (x * 7) % 50},${190 + (x * 7) % 50})`; g.fillRect(x, 0, 30, 256); }
    dabs(g, 220, ['rgba(60,60,60,0.25)', 'rgba(255,255,255,0.25)'], 1.5, 26, 1.57);
    g.fillStyle = 'rgba(30,30,30,0.5)'; for (let x = 30; x < 256; x += 32) g.fillRect(x, 0, 2.5, 256);
  }, true);
  TEX.roof = canvasTex(256, 256, (g) => {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) {
      const v = 150 + Math.random() * 90 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.roundRect(x + 1, y + 1, 46, 34, [0, 0, 12, 12]); g.fill();
      g.strokeStyle = 'rgba(20,20,20,0.45)'; g.lineWidth = 2; g.stroke();
    }
  }, true);
  for (const k in TEX) TEX[k].userData.shared = true;
}
function canvasTex(w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// Grass that leans with the wind: applied to instanced blades.
function swayMaterial(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = R3.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sw = (sin(uTime * 1.7 + ip.x * 0.021 + ip.z * 0.017) + sin(uTime * 0.9 + ip.z * 0.03) * 0.6) * ${amp.toFixed(3)} * position.y * position.y;
      transformed.x += sw; transformed.z += sw * 0.45;
      #endif`);
  };
  return mat;
}

R3.init = function (canvas) {
  if (!window.THREE) return;
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r; this.cv = canvas;
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.FogExp2(0xa8c2a4, 0.00052);
    scene.background = new THREE.Color(0xa8c2a4);
    this.cam = new THREE.PerspectiveCamera(38, 1, 20, 9000);
    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0x55663a, 0.5);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 1.0));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -820; sc.right = 820; sc.top = 820; sc.bottom = -820; sc.near = 100; sc.far = 3600;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 2.5;
    scene.add(this.hemi, sun, sun.target);
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 520, 1.6); scene.add(l); this.lampLights.push(l); }
    this.dyn = new THREE.Group();
    scene.add(this.dyn);
    // the world renders to an off-screen target first, then one full-screen pass adds glow, sun shafts and the grade
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tD: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: this.uTime, uDay: { value: 0 }, uSlow: { value: 0 }, uOut: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float;
        uniform sampler2D tD; uniform vec2 uRes; uniform float uTime, uDay, uSlow, uOut;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          vec2 uv = vUv;
          vec3 col = min(texture2D(tD, uv).rgb, vec3(3.0));
          // bloom: bright things (lanterns, sparks, sunlit edges) bleed a soft glow
          vec3 glow = vec3(0.0);
          float px = uRes.y / 720.0;
          for (int i = 0; i < 14; i++) {
            float a = float(i) * 2.39996, r = (3.0 + float(i) * 2.3) * px;
            glow += clamp(texture2D(tD, uv + vec2(cos(a), sin(a)) * r / uRes).rgb - vec3(0.92), 0.0, 1.5);
          }
          col += glow / 14.0 * mix(1.6, 2.2, uDay);
          // sun shafts fanning in from the upper-left, broken up by drifting haze
          vec2 q = uv - vec2(-0.10, 1.16);
          float haze = noise(uv * vec2(3.0, 2.0) + vec2(uTime * 0.02, 0.0));
          float rays = smoothstep(0.52, 1.0, sin(atan(q.y, q.x) * 16.0 + uTime * 0.1) * 0.5 + 0.5) * smoothstep(1.55, 0.25, length(q));
          col += rays * (0.45 + haze) * mix(vec3(0.085, 0.08, 0.055), vec3(0.16, 0.09, 0.035), uDay);
          // grade: cool the shadows, warm the light, add a little contrast
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.08);
          col *= mix(vec3(0.90, 0.97, 1.04), vec3(1.04, 1.0, 0.93), smoothstep(0.1, 0.7, l));
          col = clamp(col / (1.0 + max(col - 0.82, 0.0)), 0.0, 1.0);   // soft shoulder for anything over-bright
          col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
          // outside the circle: everything sickens towards purple
          col = mix(col, vec3(l) * vec3(0.95, 0.6, 1.15), uOut * 0.35);
          // perfect dodge: the world drains to a cold blue
          col = mix(col, vec3(l) * vec3(0.72, 0.92, 1.20), uSlow * 0.55);
          float v = smoothstep(1.22, 0.42, length((uv - 0.5) * vec2(1.1, 1.0)));
          col *= mix(0.60 - uSlow * 0.15, 1.0, v);
          col += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.022;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.col = new THREE.Color();
    this.initActors();
    this.ok = true;
  } catch (e) {
    this.ok = false;
    if (window.console) console.warn('3D renderer unavailable, staying in 2D:', e.message);
  }
};

R3.resize = function (w, h, dpr) {
  if (!this.ok) return;
  const pr = Math.min(dpr, 1.5);
  this.r.setPixelRatio(pr);
  this.r.setSize(w, h, false);
  this.rt.setSize(Math.round(w * pr), Math.round(h * pr));
  this.postMat.uniforms.uRes.value.set(w * pr, h * pr);
  this.cam.aspect = w / h;
  this.cam.fov = w < h ? 50 : 38;
  this.cam.updateProjectionMatrix();
};

// ---------- building the static world for the current map ----------
function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of ms) { if (m.map && !m.map.userData.shared) m.map.dispose(); if (m.emissiveMap && !m.emissiveMap.userData.shared) m.emissiveMap.dispose(); if (!m.userData.shared) m.dispose(); }
  });
}

R3.build = function () {
  if (!this.ok || !G.map) return;
  surfaceTextures();
  if (this.world) { this.scene.remove(this.world); disposeTree(this.world); }
  for (const [, R] of this.ents) this.dyn.remove(R.g);
  this.ents.clear();
  if (this.playerRig) this.dyn.remove(this.playerRig.g);
  this.playerRig = null;
  this.signs = []; this.bld = []; this.exits = []; this.lamps = []; this.occl = [];
  this.desks = new Map(); this.conts = new Map();
  const W = (this.world = new THREE.Group()), M = G.map, m4 = this.m4, col = this.col;
  this.scene.add(W);

  // --- ground: a painted colour map for the big shapes, multiplied by a tiling detail texture up close ---
  const pad = 600, size = ARENA.w + pad * 2;
  const colour = canvasTex(2048, 2048, (g) => {
    const k = 2048 / size;
    g.fillStyle = '#b3a474'; g.fillRect(0, 0, 2048, 2048);
    g.setTransform(k, 0, 0, k, pad * k, pad * k);
    g.fillStyle = '#47803a'; g.beginPath(); g.roundRect(0, 0, ARENA.w, ARENA.h, 140); g.fill();
    for (const q of M.blobs) { g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [['#41602f', 110], ['#5a4a34', 82], ['#7b6545', 60]]) {
      g.strokeStyle = pass[0]; g.lineWidth = pass[1];
      for (const p of M.paths) { g.beginPath(); for (const q of p) g.lineTo(q[0], q[1]); g.stroke(); }
    }
    for (const q of M.grass) { g.fillStyle = '#3b7630'; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); }
    for (const o of M.ponds) { g.fillStyle = '#5f5a40'; g.beginPath(); g.arc(o.x, o.y, o.r + 26, 0, TAU); g.fill(); }
  });
  const detail = canvasTex(256, 256, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const v = 60 + Math.random() * 150 | 0;
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.8 + Math.random() * 1.2;
      const x = Math.random() * 256, y = Math.random() * 256, a = -Math.PI / 2 + (Math.random() - 0.5);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke();
    }
  }, true);
  const gmat = std(0xffffff, { map: colour, roughness: 1 });
  gmat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = 'varying vec2 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D uDetail; varying vec2 vWp;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= 0.30 + 0.66 * texture2D(uDetail, vWp * 0.011).r + 0.50 * texture2D(uDetail, vWp * 0.041 + 0.37).r;`);
  };
  const ground = mesh(W, new THREE.PlaneGeometry(size, size), gmat, ARENA.w / 2, 0, ARENA.h / 2, false);
  ground.rotation.x = -Math.PI / 2;
  const sea = mesh(W, new THREE.PlaneGeometry(30000, 30000), std(0x3a7fa8, { roughness: 0.25, metalness: 0.2 }), ARENA.w / 2, -10, ARENA.h / 2, false);
  sea.rotation.x = -Math.PI / 2;

  // --- plazas: paved floors ---
  const tileTex = {};
  for (const pl of M.plazas) {
    const th = THEMES[pl.theme];
    const tex = tileTex[pl.theme] || (tileTex[pl.theme] = canvasTex(256, 256, (g) => {
      g.fillStyle = th.floorA; g.fillRect(0, 0, 256, 256);
      g.fillStyle = th.floorB; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
      g.strokeStyle = 'rgba(30,30,40,0.35)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128);
    }, true));
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(pl.w / 200, pl.h / 200);
    const f = mesh(W, new THREE.BoxGeometry(pl.w + 28, 4, pl.h + 28), std(0xffffff, { map: t, roughness: 0.9 }), pl.x + pl.w / 2, -0.8, pl.y + pl.h / 2, false);
    f.material.polygonOffset = true; f.material.polygonOffsetFactor = -1;
  }

  // --- flagstones along the dirt tracks ---
  if (M.stones.length) {
    const st = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.12, 1, 12), std(0xffffff, { roughness: 0.95, map: TEX.rock }), M.stones.length);
    st.receiveShadow = true;
    M.stones.forEach((s, i) => {
      m4.compose(this.v.set(s.x, 1.2, s.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), s.rot), this.v2.set(s.rx, 5, s.ry));
      st.setMatrixAt(i, m4); st.setColorAt(i, col.set(s.moss ? '#77866a' : s.c));
    });
    W.add(st);
  }

  // --- ponds ---
  for (const o of M.ponds) {
    const w = mesh(W, new THREE.CircleGeometry(o.r, 48), std(0x2f86ad, { roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.9 }), o.x, 1.4, o.y, false);
    w.rotation.x = -Math.PI / 2;
  }

  // --- trees: one instanced trunk and a handful of instanced leaf clusters each ---
  const trees = G.obstacles.filter((o) => o.k === 'tree'), CL = 9, useM = !!this.models;
  this.trees = trees; this.leaf = null; this.treeInst = null;
  if (trees.length && !useM) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(5, 10, 78, 10), std(0x8a6444, { roughness: 1, map: TEX.bark }), trees.length);
    const leaf = new THREE.InstancedMesh(lumpy(new THREE.SphereGeometry(1, 16, 12), 0.13), std(0xffffff, { roughness: 0.95, map: TEX.leaf }), trees.length * CL);
    trunk.castShadow = leaf.castShadow = true; trunk.receiveShadow = leaf.receiveShadow = true;
    trees.forEach((o, i) => {
      m4.makeTranslation(o.x, 37, o.y); trunk.setMatrixAt(i, m4);
      o._leaf = []; o._hide = 0;
      for (let k = 0; k < CL; k++) {
        const q = o.cl[k * 1 % o.cl.length], R = o.cr, dz = (((i * 31 + k * 17) % 11) / 11 - 0.5) * 1.3;
        const s = (k === 0 ? 0.74 : q.r * 1.2) * R;
        const pos = k === 0 ? [o.x, 72 + R * 0.75, o.y] : [o.x + q.dx * R * 1.1, 72 + R * 0.75 - q.dy * R * 0.95, o.y + dz * R];
        o._leaf.push({ p: pos, s });
        o._leaf[k].q = new THREE.Quaternion().setFromEuler(new THREE.Euler(k * 1.3, i * 0.7 + k * 2.1, k * 0.9));
        m4.compose(this.v.set(pos[0], pos[1], pos[2]), o._leaf[k].q, this.v2.set(s, s * 0.86, s));
        leaf.setMatrixAt(i * CL + k, m4);
        const hgt = clamp(0.5 - q.dy * 0.7, 0, 1);
        leaf.setColorAt(i * CL + k, col.set(o.pal[1]).lerp(new THREE.Color(hgt > 0.5 ? o.pal[2] : o.pal[0]), Math.abs(hgt - 0.5) * 1.1));
      }
    });
    W.add(trunk, leaf);
    this.trees = trees; this.leaf = leaf; this.CL = CL;
  }

  // --- rocks ---
  const rocks = G.obstacles.filter((o) => o.k === 'rock');
  if (useM) this.modelNature(W, trees, rocks);
  if (rocks.length && !useM) {
    const rk = new THREE.InstancedMesh(lumpy(new THREE.SphereGeometry(1, 14, 10), 0.16, 2.2), std(0xffffff, { roughness: 0.95, map: TEX.rock }), rocks.length);
    rk.castShadow = rk.receiveShadow = true;
    rocks.forEach((o, i) => {
      m4.compose(this.v.set(o.x, o.r * 0.45, o.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), o.x * 0.01), this.v2.set(o.r * 1.05, o.r * 0.85, o.r * 0.95));
      rk.setMatrixAt(i, m4); rk.setColorAt(i, col.set(['#8f8f88', '#7c7e78', '#9a978c'][i % 3]));
    });
    W.add(rk);
  }

  // --- grass: tufts everywhere, tall blades in the hiding patches ---
  {
    const g = new THREE.BufferGeometry(), pos = [], nor = [];
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI + 0.3, dx = Math.cos(a) * 0.16, dz = Math.sin(a) * 0.16, lx = Math.cos(a * 2.3) * 0.22, lz = Math.sin(a * 1.7) * 0.22, h = 0.7 + (b % 3) * 0.15;
      pos.push(-dx + lx * 0.2, 0, -dz + lz * 0.2, dx + lx * 0.2, 0, dz + lz * 0.2, lx, h, lz, dx + lx * 0.2, 0, dz + lz * 0.2, -dx + lx * 0.2, 0, -dz + lz * 0.2, lx, h, lz);
      for (let q = 0; q < 6; q++) nor.push(0, 1, 0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const spots = [];
    for (let i = 0; i < 16000; i++) {
      const x = rand(30, ARENA.w - 30), y = rand(30, ARENA.h - 30);
      if (inPlaza(x, y, 10) || M.ponds.some((o) => dist(x, y, o.x, o.y) < o.r + 8)) continue;
      spots.push([x, y, rand(14, 26), pick(['#4a8a3c', '#5c9c44', '#3f7a36', '#6aa64a'])]);
    }
    for (const q of M.grass) for (let i = 0; i < 190; i++) {
      const a = rand(TAU), d = Math.sqrt(rand()) * q.r;
      spots.push([q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, rand(38, 58), pick(['#3b8232', '#519c40', '#6fb854'])]);
    }
    const gm = new THREE.InstancedMesh(g, swayMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.16), spots.length);
    gm.receiveShadow = true;
    spots.forEach((s, i) => {
      m4.compose(this.v.set(s[0], 0, s[1]), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), i * 1.7), this.v2.set(s[2], s[2], s[2]));
      gm.setMatrixAt(i, m4); gm.setColorAt(i, col.set(s[3]));
    });
    W.add(gm);
  }

  // --- buildings (the five HQs and the field offices: see r3office.js), desks, containers, shuttle stops ---
  this.glassMats = []; this.glassCache = new Map();
  this.lampMat = std(0xffb347, { emissive: 0xffa040, emissiveIntensity: 1.2 });
  for (const ob of G.obstacles) {
    if (ob.k !== 'box') continue;
    if (ob.desk) { this.desks.set(ob, useM ? this.modelDesk(W, ob) : this.makeDesk(W, ob)); continue; }
    this.office(W, ob);
  }
  this.lang = null;
  for (const k of G.containers) this.conts.set(k, useM ? this.modelContainer(W, k) : this.makeContainer(W, k));
  for (const e of G.exits) {
    const g = new THREE.Group();
    g.position.set(e.x, 0, e.y);
    const pad2 = mesh(g, new THREE.RingGeometry(e.r - 9, e.r, 56), basic(0xffffff, { opacity: 0.7, side: THREE.DoubleSide }), 0, 2.2, 0, false);
    pad2.rotation.x = -Math.PI / 2;
    const fill = mesh(g, new THREE.CircleGeometry(e.r - 9, 48), basic(0x50e68c, { opacity: 0.16 }), 0, 2, 0, false);
    fill.rotation.x = -Math.PI / 2;
    const beam = mesh(g, new THREE.CylinderGeometry(7, 7, 900, 10, 1, true), basic(0x50e68c, { opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 0, 450, 0, false);
    const bus = new THREE.Group();
    bus.position.set(0, 0, -e.r - 44);
    mesh(bus, new THREE.BoxGeometry(150, 52, 58), std(0xffcf3f, { roughness: 0.5 }), 0, 44, 0);
    mesh(bus, new THREE.BoxGeometry(134, 20, 60), std(0x9fd4ef, { roughness: 0.2, metalness: 0.3 }), 0, 52, 0, false);
    for (const wx of [-46, 46]) for (const wz of [-28, 28]) { const w = mesh(bus, new THREE.CylinderGeometry(13, 13, 9, 14), std(0x2a2438), wx, 13, wz); w.rotation.x = Math.PI / 2; }
    g.add(bus);
    W.add(g);
    this.exits.push({ e, ring: pad2, fill, beam });
  }

  // --- the optimization circle: a curtain of purple light, and the dashed line of the next one ---
  this.storm = mesh(W, new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), basic(0xc060ff, { opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 0, 0, 0, false);
  this.stormOut = mesh(W, new THREE.RingGeometry(1, 400, 96), basic(0x7a2aa8, { opacity: 0.34, side: THREE.DoubleSide }), 0, 3, 0, false);
  this.stormOut.rotation.x = -Math.PI / 2;
  this.nextRing = mesh(W, new THREE.RingGeometry(0.992, 1, 128), basic(0xffffff, { opacity: 0.75, side: THREE.DoubleSide }), 0, 3.4, 0, false);
  this.nextRing.rotation.x = -Math.PI / 2;
};

R3.makeDesk = function (W, ob) {
  const g = new THREE.Group(), th = THEMES[ob.theme];
  g.position.set(ob.x + ob.w / 2, 0, ob.y + ob.d / 2);
  mesh(g, new THREE.BoxGeometry(ob.w, 6, ob.d), std(0xe9dfc8, { roughness: 0.6 }), 0, ob.h - 3, 0);
  mesh(g, new THREE.BoxGeometry(ob.w - 10, ob.h - 6, ob.d - 10), std(0xb9a888), 0, (ob.h - 6) / 2, 0);
  const n = Math.max(1, Math.floor(ob.w / 90));
  for (let i = 0; i < n; i++) {
    const mx = -ob.w / 2 + ((i + 0.5) * ob.w) / n;
    mesh(g, new THREE.BoxGeometry(5, 12, 5), std(0x2a2438), mx, ob.h + 6, -4);
    mesh(g, new THREE.BoxGeometry(44, 28, 4), std(0x2a2438), mx, ob.h + 24, -4);
    mesh(g, new THREE.BoxGeometry(38, 22, 1), std(th.screen, { emissive: th.screen, emissiveIntensity: 0.7, roughness: 0.3 }), mx, ob.h + 24, -1.6, false);
  }
  W.add(g);
  return g;
};
R3.makeContainer = function (W, k) {
  const g = new THREE.Group();
  g.position.set(k.x, 0, k.y);
  let lid;
  if (k.kind === 'crate') {
    mesh(g, new THREE.BoxGeometry(36, 26, 30), std(0xc9975a), 0, 13, 0);
    lid = mesh(g, new THREE.BoxGeometry(38, 5, 32), std(0xe2bd86), 0, 28, 0);
    mesh(g, new THREE.BoxGeometry(8, 27, 31), std(0xf2e6c8), 0, 13.5, 0, false);
  } else if (k.kind === 'locker') {
    mesh(g, new THREE.BoxGeometry(34, 58, 22), std(0x8fa3c4, { metalness: 0.5, roughness: 0.5 }), 0, 29, 0);
    lid = mesh(g, new THREE.BoxGeometry(16, 54, 2), std(0xa9bbd8, { metalness: 0.5, roughness: 0.45 }), 8.5, 29, 12);
    mesh(g, new THREE.BoxGeometry(16, 54, 2), std(0xa9bbd8, { metalness: 0.5, roughness: 0.45 }), -8.5, 29, 12, false);
  } else {
    mesh(g, new THREE.BoxGeometry(44, 40, 36), std(0x514c6b, { metalness: 0.6, roughness: 0.4 }), 0, 20, 0);
    lid = mesh(g, new THREE.CylinderGeometry(9, 9, 4, 16), std(0xffcf4a, { metalness: 0.8, roughness: 0.3, emissive: 0x7a5a00, emissiveIntensity: 0.5 }), 0, 21, 19);
    lid.rotation.x = Math.PI / 2;
  }
  const spark = mesh(g, new THREE.SphereGeometry(3, 8, 6), basic(0xffffff, { opacity: 0.9, blending: THREE.AdditiveBlending }), 0, k.kind === 'locker' ? 74 : 52, 0, false);
  W.add(g);
  return { g, lid, spark, open: false };
};

// ---------- camera and screen mapping ----------
R3.project = function (x, y, z = 0) {
  const v = this.v.set(x, z, y).project(this.cam);
  return { x: (v.x * 0.5 + 0.5) * View.W, y: (-v.y * 0.5 + 0.5) * View.H, ok: v.z > -1 && v.z < 1 };
};
// the point on the plane at height z under a screen pixel
R3.unproject = function (px, py, z = 0) {
  const o = this.cam.position, d = this.v.set((px / View.W) * 2 - 1, -(py / View.H) * 2 + 1, 0.5).unproject(this.cam).sub(o);
  const t = d.y < -1e-4 ? (z - o.y) / d.y : 4000 / (d.length() || 1);
  return { x: o.x + d.x * t, y: o.z + d.z * t };
};
R3.updateCamera = function () {
  const zoom = 1 - View.zk * 1.6, portrait = View.W < View.H;
  const D = (portrait ? 700 : 540) * zoom, pitch = 0.56;
  const tx = View.cam.x - View.kx * 1.4 + rand(-1, 1) * View.shake * 0.9, ty = View.cam.y - View.ky * 2 + rand(-1, 1) * View.shake * 0.9;
  this.cam.position.set(tx, D * Math.sin(pitch), ty + D * Math.cos(pitch));
  this.cam.lookAt(tx, 34, ty - 110);
  this.cam.updateMatrixWorld();
};

// ---------- light and atmosphere for this moment of the day ----------
R3.light = function () {
  const d = G.day, c = this.col, p = G.player, out = G.state === 'play' && p.outside ? 1 : 0;
  const tx = View.cam.x, ty = View.cam.y;
  // the sun sits to the upper-left and behind the camera; lower and redder towards dusk
  const el = lerp(1.0, 0.42, d);
  this.sun.position.set(tx - 780 * Math.cos(el), 1500 * Math.sin(el), ty + 520 * Math.cos(el) - 300);
  this.sun.target.position.set(tx, 0, ty);
  this.sun.color.set(0xfff1d6).lerp(c.set(0xff9a4a), d * 0.85);
  this.sun.intensity = lerp(0.86, 0.8, d);
  this.hemi.intensity = lerp(0.5, 0.4, d);
  this.hemi.color.set(0xd6ecff).lerp(c.set(0xffc9a0), d);
  const fog = this.scene.fog;
  fog.color.set(0xa8c2a4).lerp(c.set(0xd9a070), d).lerp(c.set(0x8a4aa8), out * 0.5);
  fog.density = lerp(0.0005, 0.0007, d);
  this.scene.background.copy(fog.color);
  for (const m of this.glassMats) m.emissiveIntensity = 0.1 + clamp((d - 0.2) * 1.7, 0, 1.15); // office lights come on towards evening
  this.lampMat.emissiveIntensity = 1.0 + d * 1.6;
  // only the three lanterns nearest you actually cast light
  if (this.frameNo % 20 === 0 && this.lamps.length) {
    const near = this.lamps.slice().sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty));
    this.lampLights.forEach((l, i) => { const q = near[i]; if (q) l.position.set(q.x, q.h, q.y + 10); });
  }
  for (const l of this.lampLights) l.intensity = 0.35 + d * 1.5;
  const u = this.postMat.uniforms;
  u.uDay.value = d; u.uSlow.value = clamp(G.slowT * 2, 0, 1); u.uOut.value = lerp(u.uOut.value, out, 0.1);
};

// ---------- things in the world that change: signs, doors, shuttles, the circle, what blocks your view ----------
R3.syncWorld = function (dt) {
  const p = G.player, z = G.zone, t = G.t;
  if (this.lang !== LANG.zh) {
    this.lang = LANG.zh;
    for (const s of this.signs) {
      const g = s.c.getContext('2d');
      g.clearRect(0, 0, 512, 96);
      if (!s.bare) { g.fillStyle = '#231d33'; g.beginPath(); g.roundRect(4, 8, 504, 80, 22); g.fill(); }
      g.font = '900 52px "Trebuchet MS", "PingFang SC", "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = s.neon; g.fillText(T('fl_' + s.id), 256, 50, 480);
      s.tex.needsUpdate = true;
    }
  }
  // buildings between you and the camera turn glassy; trees there shrink out of the way
  for (const b of this.bld) {
    const ob = b.ob, hide = G.state === 'play' && p.y < ob.y + ob.d && p.y > ob.y - 420 && p.x > ob.x - 70 && p.x < ob.x + ob.w + 70;
    b.a = lerp(b.a, hide ? 0.22 : 1, 0.15);
    if (b.sy) b.g.scale.y = b.sy * (0.06 + 0.94 * (b.a - 0.22) / 0.78); // model buildings sink out of the way, like the trees
    else for (const m of b.mats) { m.opacity = b.a; m.depthWrite = b.a > 0.9; }
  }
  if (this.trees && this.treeInst) {
    // model trees: the ones in your way squash down out of the shot
    for (const o of this.trees) {
      const hide = G.state === 'play' && p.y < o.y + 30 && p.y > o.y - 480 && Math.abs(p.x - o.x) < o.cr * 1.5 ? 1 : 0;
      if (Math.abs(o._hide - hide) < 0.01) continue;
      o._hide = lerp(o._hide, hide, 0.2);
      const q = o._ti, k = 1 - o._hide * 0.78;
      for (const im of this.treeInst[q.t]) {
        this.m4.compose(this.v.set(q.x, 0, q.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), q.rot), this.v2.set(q.s, q.s * k, q.s)).multiply(im.userData.local);
        im.setMatrixAt(q.idx, this.m4); im.instanceMatrix.needsUpdate = true;
      }
    }
  }
  if (this.trees && this.leaf) {
    let dirty = false;
    for (let i = 0; i < this.trees.length; i++) {
      const o = this.trees[i], hide = G.state === 'play' && p.y < o.y + 30 && p.y > o.y - 480 && Math.abs(p.x - o.x) < o.cr * 1.5 ? 1 : 0;
      if (Math.abs(o._hide - hide) < 0.01) continue;
      o._hide = lerp(o._hide, hide, 0.2); dirty = true;
      const k = 1 - o._hide * 0.72;
      o._leaf.forEach((q, n) => {
        this.m4.compose(this.v.set(q.p[0], q.p[1], q.p[2]), q.q, this.v2.set(q.s * k, q.s * 0.86 * k, q.s * k));
        this.leaf.setMatrixAt(i * this.CL + n, this.m4);
      });
    }
    if (dirty) this.leaf.instanceMatrix.needsUpdate = true;
  }
  if (this.frameNo % 15 === 0) for (const [ob, g] of this.desks) g.visible = G.obstacles.includes(ob);
  for (const [k, c] of this.conts) {
    if (k.opened && !c.open) {
      c.open = true; c.spark.visible = false;
      if (c.model) { if (c.lid) c.lid.rotation.x -= 1.15; else for (const m of c.mats) m.color.multiplyScalar(0.55); }
      else if (k.kind === 'crate') { c.lid.rotation.x = -1.1; c.lid.position.set(0, 34, -18); }
      else if (k.kind === 'locker') { c.lid.rotation.y = -1.3; c.lid.position.x = 20; c.lid.position.z = 18; }
      else { c.lid.material.emissiveIntensity = 0; c.lid.material.color.set(0x2a2438); }
    }
    if (!k.opened) c.spark.position.y = c.model ? c.spark.userData.h * (1 + Math.sin(t * 3 + k.x) * 0.07) : (k.kind === 'locker' ? 74 : 52) + Math.sin(t * 3 + k.x) * 4;
  }
  for (const x of this.exits) {
    x.ring.material.color.set(x.e.open ? 0x3fe08a : 0xffffff);
    x.ring.rotation.z = t * 0.5;
    x.fill.visible = x.beam.visible = x.e.open;
  }
  const r = Math.max(z.r, 0.5);
  this.storm.scale.set(r, 520, r); this.storm.position.set(z.x, 260, z.y);
  this.storm.material.opacity = 0.26 + Math.sin(t * 5) * 0.06;
  this.stormOut.scale.set(r, r, 1); this.stormOut.position.set(z.x, 3, z.y);
  this.nextRing.visible = z.mode !== 'done' && z.nr > 0;
  this.nextRing.scale.set(z.nr, z.nr, 1); this.nextRing.position.set(z.nx, 3.4, z.ny);
};

// ---------- one frame ----------
R3.frame = function (dt) {
  if (!this.ok) return;
  this.frameNo++;
  this.uTime.value = G.t % 4000;
  this.updateCamera();
  this.light();
  this.syncWorld(dt);
  this.syncActors(G.hitstop > 0 ? 0 : dt); // animations freeze with the world on a hit
  this.r.setRenderTarget(this.rt);
  this.r.render(this.scene, this.cam);
  this.r.setRenderTarget(null);
  this.r.render(this.postScene, this.postCam);
};
