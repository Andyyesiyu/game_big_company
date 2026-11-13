'use strict';
// The 3D renderer, part 4: the buildings. Modern offices built in code: glass curtain walls whose
// windows light up towards evening, a lobby with a canopy and the company sign, rooftop plant, and
// one silhouette per company. Field offices are small glass pavilions.

const OFFICE = {
  pony: { glass: '#3f8fd0', frame: '#e3ecf4', accent: '#8fe8ff', dark: '#1d3350' },
  yiming: { glass: '#2e3656', frame: '#14161f', accent: '#ff5c93', accent2: '#3df2ea', dark: '#151826' },
  elon: { glass: '#30333a', frame: '#0e0f12', accent: '#ff6a3a', dark: '#141518' },
  sam: { glass: '#74c9b0', frame: '#f5f8f6', accent: '#c9ffe6', dark: '#24584a' },
  dario: { glass: '#c58a5c', frame: '#f3e6d2', accent: '#ffae7a', dark: '#6a4028' },
  shed: { glass: '#7db4d4', frame: '#f4f4f0', accent: '#ffb347', dark: '#34495a' },
};
const PANE_W = 36, FLOOR_H = 50, FACADE = {};

// One tile of curtain wall, 8 panes by 8 floors, and a matching map of which panes have the lights on.
function facade(key) {
  if (FACADE[key]) return FACADE[key];
  const st = OFFICE[key], N = 8, C = 64, base = new THREE.Color(st.glass);
  let seed = key.length * 7919 + key.charCodeAt(0) * 131;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tone = (k) => `rgb(${[base.r, base.g, base.b].map((v) => Math.round(clamp(v * k, 0, 1) * 255)).join(',')})`;
  const lit = [];
  const map = canvasTex(512, 512, (g) => {
    for (let fy = 0; fy < N; fy++) for (let fx = 0; fx < N; fx++) {
      const x = fx * C, y = fy * C, v = 0.86 + rnd() * 0.24;
      const gr = g.createLinearGradient(0, y, 0, y + C);
      gr.addColorStop(0, tone(1.55 * v)); gr.addColorStop(0.8, tone(1.0 * v));
      g.fillStyle = gr; g.fillRect(x, y, C, C);
      g.fillStyle = tone(0.6); g.fillRect(x, y + C - 13, C, 13); // the band that hides the floor slab
      if (rnd() < 0.32) { g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(x + 8, y + C - 14); g.lineTo(x + 28, y + 2); g.lineTo(x + 42, y + 2); g.lineTo(x + 22, y + C - 14); g.fill(); }
      lit.push(rnd() < 0.4 ? 0.45 + rnd() * 0.55 : 0);
    }
    g.fillStyle = st.frame;
    for (let i = 0; i <= N; i++) { g.fillRect(i * C - 2, 0, 4, 512); g.fillRect(0, i * C - 1.5, 512, 3); }
  }, true);
  const emis = canvasTex(512, 512, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    lit.forEach((a, i) => { if (a) { g.fillStyle = `rgba(255,${205 + (i % 5) * 9},${140 + (i % 7) * 12},${a})`; g.fillRect((i % N) * C + 3, Math.floor(i / N) * C + 2, C - 6, C - 17); } });
  }, true);
  map.userData.shared = emis.userData.shared = true;
  return (FACADE[key] = { map, emis });
}

// A glass material for a wall `w` wide and `h` tall, so panes stay the same size on every building.
R3.glass = function (key, w, h) {
  const rw = Math.max(0.25, Math.round((w / PANE_W) * 2) / 16), rh = Math.max(0.125, Math.round(h / FLOOR_H) / 8), id = key + ':' + rw + ':' + rh;
  let m = this.glassCache.get(id);
  if (m) return m;
  const f = facade(key), a = f.map.clone(), b = f.emis.clone();
  a.repeat.set(rw, rh); b.repeat.set(rw, rh); a.needsUpdate = b.needsUpdate = true;
  m = std(0xffffff, { map: a, emissiveMap: b, emissive: 0xffd9a0, emissiveIntensity: 0.12, roughness: 0.26, metalness: 0.12 });
  this.glassCache.set(id, m); this.glassMats.push(m);
  return m;
};
R3.solid = function (color, o) {
  const id = color + JSON.stringify(o || 0);
  let m = this.glassCache.get(id);
  if (!m) { m = std(color, o); this.glassCache.set(id, m); }
  return m;
};

R3.office = function (W, ob) {
  const key = ob.bld || 'shed', st = OFFICE[key], g = new THREE.Group(), self = this, M = this.models;
  g.position.set(ob.x + ob.w / 2, 0, ob.y + ob.d / 2);
  const front = ob.d / 2 - 2;
  const cap = this.solid('#8b929b', { roughness: 0.9 }), frame = this.solid(st.frame, { roughness: 0.6 }), dark = this.solid(st.dark, { roughness: 0.5, metalness: 0.2 });
  const steel = this.solid('#aeb6bf', { roughness: 0.4, metalness: 0.5 });
  const neon = (c) => this.solid(c, { emissive: c, emissiveIntensity: 1.1, roughness: 0.4 });
  const box = (w, h, d, x, y0, z, mat, cast = true) => mesh(g, new THREE.BoxGeometry(w, h, d), mat, x, y0 + h / 2, z, cast);
  // a glass block standing on y0, with a flat roof
  const tower = (w, h, d, x, y0, z, k = key) => {
    const fm = self.glass(k, w, h), sm = self.glass(k, d, h);
    const m = mesh(g, new THREE.BoxGeometry(w, h, d), [sm, sm, cap, cap, fm, fm], x, y0 + h / 2, z);
    box(w + 6, 5, d + 6, x, y0 + h, z, frame, false); // parapet
    return m;
  };
  const plant = (x, y, z, n = 2) => {
    for (let i = 0; i < n; i++) box(26 + i * 8, 14 + i * 4, 22, x + (i - (n - 1) / 2) * 44, y + 5, z + (i % 2) * 14 - 7, cap);
  };
  const mast = (x, y, z, h = 70) => {
    box(3, h, 3, x, y, z, steel, false);
    mesh(g, new THREE.SphereGeometry(4, 8, 6), neon('#ff3b30'), x, y + h + 3, z, false);
  };
  // the way in: a lobby of tall panes, glass doors under a canopy, and the name over the door
  const lobby = (w, x = 0, h = 104) => {
    const d = 96, z = front - d / 2;
    tower(w, h, d, x, 0, z);
    box(120, 86, 4, x, 0, front + 1, dark, false);
    for (const dx of [-30, 0, 30]) box(2.5, 86, 5, x + dx, 0, front + 1.5, steel, false);
    box(176, 6, 44, x, 90, front + 18, frame);
    box(176, 3, 3, x, 87, front + 39, neon(st.accent), false);
    box(190, 4, 30, x, 0, front + 12, cap, false);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    box(300, 50, 6, x, 104, front + 1, dark, false);
    mesh(g, new THREE.PlaneGeometry(290, 290 * (96 / 512)), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), x, 129, front + 4.6, false).receiveShadow = false;
    self.signs.push({ c, tex, id: key, neon: st.accent, bare: true });
    return tex;
  };
  // the same name again, up on the crown of the tallest block
  const crown = (tex, w, x, y, z) => {
    mesh(g, new THREE.PlaneGeometry(w, w * (96 / 512)), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), x, y, z, false).receiveShadow = false;
  };
  const lampAt = (x, z) => {
    if (M && M.streetlight) {
      const k = 132 / M.streetlight.userData.size.y, c = self.place(g, 'streetlight', x, z, k, x < 0 ? 0 : Math.PI);
      c.g.position.set(x, 0, z);
      const hx = x + (x < 0 ? 1 : -1) * M.streetlight.userData.size.x * k * 0.42;
      mesh(g, new THREE.SphereGeometry(6, 10, 8), self.lampMat, hx, 124, z, false);
      self.lamps.push({ x: g.position.x + hx, y: g.position.z + z, h: 120 });
    } else {
      box(3, 60, 3, x, 0, z, steel);
      mesh(g, new THREE.SphereGeometry(7, 10, 8), self.lampMat, x, 64, z, false);
      self.lamps.push({ x: g.position.x + x, y: g.position.z + z, h: 60 });
    }
  };
  const car = (name, x, z, rot) => {
    if (!M || !M[name]) return;
    const c = self.place(g, name, x, z, 176 / M[name].userData.size.z, rot);
    c.g.position.set(x, 0, z);
  };

  if (key === 'shed') {
    // a field office: one glass room under a flat roof that overhangs
    tower(ob.w * 0.86, 72, ob.d * 0.8, 0, 0, 0);
    box(ob.w * 1.04, 7, ob.d * 1.08, 0, 74, 4, frame);
    box(ob.w * 1.04, 4, 2.5, 0, 70, ob.d * 0.54 + 4, neon(st.accent), false);
    box(30, 58, 3, 0, 0, ob.d * 0.4 + 1, dark, false);
    box(26, 16, 20, ob.w * 0.25, 81, -8, cap);
    lampAt(-ob.w / 2 - 4, ob.d / 2 + 12);
  } else if (key === 'pony') {
    // twin towers joined by three sky bridges
    const tex = lobby(460);
    tower(200, 720, 170, -142, 0, -42); tower(200, 590, 170, 142, 0, -42);
    for (const y of [170, 330, 480]) {
      box(90, 46, 120, 0, y, -42, self.glass(key, 90, 50));
      box(92, 4, 124, 0, y - 4, -42, frame, false); box(92, 4, 124, 0, y + 46, -42, frame, false);
      box(84, 3, 2.5, 0, y + 20, 19, neon(st.accent), false);
    }
    plant(-142, 725, -60); plant(142, 595, -60); mast(-190, 725, -90, 90); mast(100, 595, -90, 50);
    crown(tex, 176, -142, 680, 44);
  } else if (key === 'yiming') {
    // floors stacked like a feed, each slab slid sideways from the one below, with a neon edge
    const tex = lobby(440);
    [[480, 170, -10], [420, 160, 34], [350, 160, -34], [250, 150, 28]].reduce((y, [w, h, x], i) => {
      tower(w, h, 196, x, y, -38);
      box(w + 14, 8, 210, x, y + h, -38, frame, false);
      box(w + 14, 4, 2.5, x, y + h + 2, 68, neon(i % 2 ? st.accent2 : st.accent), false);
      return y + h + 8;
    }, 0);
    plant(28, 668, -50); mast(-60, 668, -80, 80);
    crown(tex, 220, 28, 628, 61);
  } else if (key === 'elon') {
    // a tapering black monolith, a hangar, and something on the pad that is definitely launching this year
    const tex = lobby(300, -96);
    const h = 700, fm = self.glass(key, 190 * 4, h);
    const t = mesh(g, new THREE.CylinderGeometry(104, 160, h, 4, 1), [fm, cap, cap], -96, h / 2, -36);
    t.rotation.y = Math.PI / 4;
    box(150, 5, 150, -96, h, -36, frame, false);
    mast(-96, h + 5, -36, 110);
    box(152, 4, 2.5, -96, h - 60, 39, neon(st.accent), false);
    tower(250, 130, 200, 170, 0, -40);
    const white = self.solid('#eef1f4', { roughness: 0.35, metalness: 0.2 }), red = self.solid(st.accent, { roughness: 0.5 });
    const rk = new THREE.Group();
    rk.position.set(214, 0, 100);
    mesh(rk, new THREE.CylinderGeometry(19, 19, 210, 16), white, 0, 125, 0);
    mesh(rk, new THREE.ConeGeometry(19, 52, 16), red, 0, 256, 0);
    mesh(rk, new THREE.CylinderGeometry(19.6, 19.6, 10, 16), dark, 0, 150, 0, false);
    mesh(rk, new THREE.CylinderGeometry(14, 22, 20, 12), dark, 0, 10, 0);
    for (let i = 0; i < 3; i++) { const f = mesh(rk, new THREE.BoxGeometry(3, 54, 30), red, Math.sin((i * TAU) / 3) * 28, 44, Math.cos((i * TAU) / 3) * 28); f.rotation.y = (i * TAU) / 3 + Math.PI / 2; }
    g.add(rk);
    box(10, 250, 10, 262, 0, 100, steel);
    for (const y of [70, 150, 228]) box(40, 5, 6, 244, y, 100, steel, false);
    crown(tex, 130, -96, h - 26, 31);
  } else if (key === 'sam') {
    // a round tower banded in white, with a ring on top
    const tex = lobby(400), h = 660, r = 122;
    mesh(g, new THREE.CylinderGeometry(r, r, h, 40, 1), [self.glass(key, TAU * r, h), cap, cap], 0, h / 2, -24);
    for (let y = 150; y <= h; y += 150) mesh(g, new THREE.CylinderGeometry(r + 5, r + 5, 9, 40), frame, 0, y, -24, false);
    mesh(g, new THREE.SphereGeometry(r * 0.78, 28, 12, 0, TAU, 0, Math.PI / 2), frame, 0, h, -24).scale.y = 0.45;
    const ringM = mesh(g, new THREE.TorusGeometry(40, 5, 10, 36), neon(st.accent), 0, h + 80, -24, false);
    ringM.rotation.y = 0.3;
    for (const sx0 of [-1, 1]) { tower(150, 200, 170, sx0 * 232, 0, -44); plant(sx0 * 232, 205, -50, 1); }
    crown(tex, 150, 0, h - 40, -24 + r + 1.5);
  } else {
    // warm stone fins over bronze glass, and a garden on the lower roof
    const tex = lobby(450);
    tower(270, 440, 190, -110, 0, -44); tower(230, 300, 190, 160, 0, -44);
    for (let x = -241; x <= 21; x += 52.4) box(7, 440, 12, x, 0, 54, frame);
    for (let x = 49; x <= 272; x += 55.5) box(7, 300, 12, x, 0, 54, frame);
    const green = self.solid('#5d9a4a', { roughness: 0.95 });
    box(210, 6, 170, 160, 305, -44, green, false);
    for (const [x, z, s] of [[90, -80, 16], [130, -20, 12], [200, -70, 18], [235, -10, 13]]) mesh(g, new THREE.SphereGeometry(s, 10, 8), green, x, 311 + s * 0.6, z);
    plant(-110, 445, -60); mast(-210, 445, -100, 60);
    box(270, 4, 2.5, -110, 400, 52, neon(st.accent), false);
    crown(tex, 200, -110, 418, 61);
  }
  if (ob.bld) {
    lampAt(-ob.w / 2 + 8, ob.d / 2 + 16); lampAt(ob.w / 2 - 8, ob.d / 2 + 16);
    const cars = ['car_sedan', 'car_taxi', 'car_hatchback'], n = Object.keys(OFFICE).indexOf(key);
    if (key === 'pony' || key === 'yiming') car(cars[n % 3], ob.w / 2 - 44, 52, 0.06);
    if (key !== 'sam') car(cars[(n + 1) % 3], -ob.w / 2 + 44, 56, -0.05);
  }
  W.add(g);
  this.bld.push({ ob, g, mats: [], a: 1, sy: 1 });
};
