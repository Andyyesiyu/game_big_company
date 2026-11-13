'use strict';
// The 3D renderer, part 5: the blocky look. People are six boxes wearing a 64x64 pixel-art skin
// painted from their `look`; creatures, trees and rocks are boxes too, with 16x16 textures and no filtering.
// The rigs have the same fields as every other kind (see r3poly.js for how one is chosen), so the posing code
// does not care which it has been given.

const PX = 2.3; // one skin pixel in world units: a figure is 32 pixels, about 74 units, tall
const SKINS = new Map(), BLK = {};

function pixelTex(w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.shared = true;
  return t;
}
// a steady pseudo-random number for pixel (x, y): the same skin comes out the same every time
function grain(x, y, s) {
  let n = (Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + Math.imul(s + 3, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgb(' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',') + ')';
}

// A box w x h x d skin pixels whose six faces read from a Minecraft-style unfolded patch at (ox, oy) in the atlas.
function skinBox(w, h, d, ox, oy) {
  const g = new THREE.BoxGeometry(w * PX, h * PX, d * PX), uv = g.attributes.uv;
  //            +x (their left)        -x (their right)   +y (top)        -y (bottom)          +z (front)          -z (back)
  const R = [[ox + d + w, oy + d, d, h], [ox, oy + d, d, h], [ox + d, oy, w, d], [ox + d + w, oy, w, d], [ox + d, oy + d, w, h], [ox + d + w + d, oy + d, w, h]];
  R.forEach(([x, y, fw, fh], f) => {
    const u0 = x / 64, u1 = (x + fw) / 64, v1 = 1 - y / 64, v0 = 1 - (y + fh) / 64;
    uv.setXY(f * 4, u0, v1); uv.setXY(f * 4 + 1, u1, v1); uv.setXY(f * 4 + 2, u0, v0); uv.setXY(f * 4 + 3, u1, v0);
  });
  g.userData.shared = true;
  return g;
}
// A box in block units whose texture repeats once per block, however big the box is.
function blockGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  dims.forEach(([a, b], f) => { for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, uv.getX(f * 4 + i) * a, uv.getY(f * 4 + i) * b); });
  g.userData.shared = true;
  return g;
}

// ---------- skins ----------
function skinFor(look) {
  const key = [look.top, look.shirt, look.bottom, look.skin, look.hair, look.hairStyle, look.glasses, look.tie, look.badge, look.band, look.smile, look.bags, !!look.logo].join('|');
  let tex = SKINS.get(key);
  if (tex) return tex;
  tex = pixelTex(64, 64, (g) => {
    const seed = key.length * 7 + key.charCodeAt(3);
    const fill = (x, y, w, h, col, amt = 0.12) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { g.fillStyle = tone(col, 1 + (grain(x + i, y + j, seed) - 0.5) * amt); g.fillRect(x + i, y + j, 1, 1); } };
    const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const skin = look.skin || '#f0c8a0', hair = look.hair || '#222222', top = look.top || '#4f7bf0', bot = look.bottom || '#3b4a6b', hs = look.hairStyle || 'short';
    // head: skin all round, then hair, then the face
    for (const [x, y] of [[8, 0], [16, 0], [0, 8], [8, 8], [16, 8], [24, 8]]) fill(x, y, 8, 8, skin, 0.07);
    if (hs !== 'bald') {
      const side = hs === 'long' ? 8 : hs === 'curly' ? 5 : 3, back = hs === 'long' ? 8 : hs === 'curly' ? 6 : 5;
      fill(8, 0, 8, 8, hair, 0.22);                                  // crown
      fill(0, 8, 8, side, hair, 0.22); fill(16, 8, 8, side, hair, 0.22); // sides
      fill(24, 8, 8, back, hair, 0.22);                              // back
      fill(8, 8, 8, 2, hair, 0.22);                                  // fringe
      if (hs === 'side') { fill(8, 10, 5, 1, hair, 0.2); dot(8, 11, tone(hair, 1)); }
      else if (hs === 'messy') for (const x of [8, 10, 11, 13, 15]) dot(x, 10, tone(hair, 0.9 + grain(x, 3, seed) * 0.3));
      else if (hs === 'curly') { for (const x of [8, 9, 11, 12, 14, 15]) dot(x, 10, tone(hair, 1.1)); dot(8, 11, tone(hair, 1)); dot(15, 11, tone(hair, 1)); }
      else if (hs === 'long') { fill(8, 10, 1, 6, hair, 0.2); fill(15, 10, 1, 6, hair, 0.2); }
    }
    if (look.band) for (const x of [0, 8, 16, 24]) fill(x, 9, 8, 2, look.band, 0.1);
    dot(9, 12, '#ffffff'); dot(10, 12, '#1c1a26'); dot(13, 12, '#1c1a26'); dot(14, 12, '#ffffff');   // eyes
    dot(11, 13, tone(skin, 0.86)); dot(12, 13, tone(skin, 0.86));                                    // nose
    if (look.bags) { dot(9, 13, tone(skin, 0.78)); dot(10, 13, tone(skin, 0.78)); dot(13, 13, tone(skin, 0.78)); dot(14, 13, tone(skin, 0.78)); }
    for (let x = look.smile ? 10 : 11; x <= (look.smile ? 13 : 12); x++) dot(x, 14, '#8f4a3c');     // mouth
    if (look.smile) { dot(9, 13, tone(skin, 0.9)); dot(14, 13, tone(skin, 0.9)); }
    if (look.glasses) {
      const gl = look.glasses;
      for (const x of [9, 10, 13, 14]) { dot(x, 11, gl); dot(x, 13, gl); }
      for (const x of [8, 11, 12, 15]) dot(x, 12, gl);
      fill(0, 12, 8, 1, gl, 0); fill(16, 12, 8, 1, gl, 0);
      dot(9, 12, '#eaf6ff'); dot(14, 12, '#eaf6ff');
    }
    // torso
    for (const [x, y, w, h] of [[20, 16, 8, 4], [28, 16, 8, 4], [16, 20, 4, 12], [20, 20, 8, 12], [28, 20, 4, 12], [32, 20, 8, 12]]) fill(x, y, w, h, top);
    g.fillStyle = tone(bot, 0.78); for (const [x, w] of [[16, 4], [20, 8], [28, 4], [32, 8]]) g.fillRect(x, 31, w, 1); // belt
    if (look.shirt) { fill(23, 20, 2, 10, look.shirt, 0.05); fill(22, 20, 4, 2, look.shirt, 0.05); dot(22, 22, look.shirt); dot(25, 22, look.shirt); }
    if (look.tie) fill(23, 21, 2, 7, look.tie, 0.08);
    if (look.badge) { fill(25, 23, 2, 2, look.badge, 0); dot(24, 21, '#2a2438'); dot(25, 22, '#2a2438'); }
    if (look.logo) for (const [x, y] of [[22, 22], [25, 22], [23, 23], [24, 23], [23, 24], [24, 24], [22, 25], [25, 25]]) dot(x, y, '#eceff1');
    // arm: sleeve, then the hand
    for (const [x, y, w, h] of [[44, 16, 4, 4], [40, 20, 4, 9], [44, 20, 4, 9], [48, 20, 4, 9], [52, 20, 4, 9]]) fill(x, y, w, h, top);
    for (const [x, y, w, h] of [[48, 16, 4, 4], [40, 29, 4, 3], [44, 29, 4, 3], [48, 29, 4, 3], [52, 29, 4, 3]]) fill(x, y, w, h, skin, 0.07);
    // leg: trousers, then the shoe
    for (const [x, y, w, h] of [[4, 16, 4, 4], [0, 20, 4, 10], [4, 20, 4, 10], [8, 20, 4, 10], [12, 20, 4, 10]]) fill(x, y, w, h, bot);
    for (const [x, y, w, h] of [[8, 16, 4, 4], [0, 30, 4, 2], [4, 30, 4, 2], [8, 30, 4, 2], [12, 30, 4, 2]]) fill(x, y, w, h, '#3d2a1f', 0.1);
  });
  SKINS.set(key, tex);
  return tex;
}

// ---------- people ----------
// Returns the same rig fields as before: g, body, legL, legR, armL, armR, hand, head, mats, sc.
function rigPersonBlock(look, sc = 1) {
  if (!BLK.head) Object.assign(BLK, { head: skinBox(8, 8, 8, 0, 0), torso: skinBox(8, 12, 4, 16, 16), arm: skinBox(4, 12, 4, 40, 16), leg: skinBox(4, 12, 4, 0, 16) });
  // (the sun is high, so faces turned to the camera sit in shade: the skin glows faintly with its own colours)
  const tex = skinFor(look), g = new THREE.Group(), inner = new THREE.Group();
  const mat = std(0xffffff, { map: tex, roughness: 0.92, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 }), mats = [mat];
  const flatM = (c) => { const q = std(c, { roughness: 0.95, emissive: c, emissiveIntensity: 0.26 }); mats.push(q); return q; };
  const legL = new THREE.Group(), legR = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  const armL = new THREE.Group(), armR = new THREE.Group(), hand = new THREE.Group();
  g.add(inner);
  inner.add(legL, legR, body);
  legL.position.set(-2 * PX, 12 * PX, 0); legR.position.set(2 * PX, 12 * PX, 0);
  for (const l of [legL, legR]) mesh(l, BLK.leg, mat, 0, -6 * PX, 0);
  mesh(body, BLK.torso, mat, 0, 18 * PX, 0);
  head.position.set(0, 24 * PX, 0);
  body.add(head);
  mesh(head, BLK.head, mat, 0, 4 * PX, 0);
  // a little volume on top of the painted hair, so heads do not all share one silhouette
  const hs = look.hairStyle || 'short', hc = look.hair || '#222222';
  if (hs === 'curly') { const m = flatM(hc); mesh(head, GEO.box, m, 0, 8.6 * PX, 0).scale.set(9.4 * PX, 2.2 * PX, 9.4 * PX); for (const x of [-1, 1]) mesh(head, GEO.box, m, x * 4.4 * PX, 6.2 * PX, 0).scale.set(1.4 * PX, 3 * PX, 7 * PX); }
  else if (hs === 'messy') { const m = flatM(hc); for (const [x, z, h] of [[-2, 1, 2.2], [1.5, -1.5, 2.8], [2.5, 2, 1.8], [-1, -2.5, 2]]) mesh(head, GEO.box, m, x * PX, (8 + h / 2) * PX, z * PX).scale.set(2 * PX, h * PX, 2 * PX); }
  else if (hs === 'long') mesh(head, GEO.box, flatM(hc), 0, -1 * PX, -4.6 * PX).scale.set(8 * PX, 8 * PX, 1.4 * PX);
  else if (hs === 'side') mesh(head, GEO.box, flatM(hc), -1.2 * PX, 8.3 * PX, 1 * PX).scale.set(6 * PX, 1 * PX, 6.4 * PX);
  if (look.pack) mesh(body, GEO.box, flatM(look.pack), 0, 18 * PX, -3.4 * PX).scale.set(6.4 * PX, 8 * PX, 2.8 * PX);
  // arms hinge a pixel below the shoulder top, like the originals; the right one carries whatever is held
  armL.position.set(-6 * PX, 23 * PX, 0); armR.position.set(6 * PX, 23 * PX, 0);
  body.add(armL, armR);
  for (const a of [armL, armR]) mesh(a, BLK.arm, mat, 0, -5 * PX, 0);
  hand.position.set(0, -10.5 * PX, 0);
  armR.add(hand);
  g.scale.setScalar(sc);
  return { g, inner, body, legL, legR, armL, armR, hand, head, mats, sc, person: true, block: true, w: null };
}

// The player's blocky body through each move: the same shapes as the animated-model version, made by turning
// the body and the weapon arm. (The weapon points along the arm, so wherever the arm goes, it goes.)
function posePlayerBlock(R, p) {
  const m = p.mv, sw = p.swingT > 0 && m ? clamp(1 - p.swingT / p.swingMax, 0, 1) : -1, lv = chargeLevel(p.charge), ez = (x) => x * x * (3 - 2 * x);
  poseRig(R, { t: p.t, moving: p.moving, pace: 15, swing: null, armUp: false });
  const A = R.armR.rotation, B = R.body.rotation;
  let hop = 0, roll = 0, spin = 0;
  if (p.dashT > 0 && p.dashKind === 'd') roll = clamp(1 - p.dashT / 0.22, 0, 1) * TAU;
  else if (p.dashT > 0) { B.x = 0.5; A.set(-1.5, 0, 0); }
  else if (p.castT > 0 && p.castKind === 'spin') { spin = (1 - p.castT / (p.castMax || 0.18)) * TAU * (p.castMax > 0.25 ? 2 : 1); A.set(-1.45, 0, 0.5); B.x = 0.12; }
  else if (sw >= 0) {
    const k = m.kind, at = m.at, pre = clamp(sw / at, 0, 1), post = clamp((sw - at) / (1 - at), 0, 1), cut = Math.min(1, post * 3.2);
    if (k === 'sweep') { A.set(lerp(-2.0, -1.0, sw), 0, 0); B.y = p.swingDir * lerp(-1.0, 1.0, ez(sw)); B.x = 0.16; }
    else if (k === 'thrust') { A.set(-1.56, 0, 0); B.y = lerp(-0.7, 0, ez(pre)); B.x = 0.34; }
    else if (k === 'chop') { A.set(sw < at ? lerp(-1.4, -3.05, ez(pre)) : lerp(-3.05, -0.55, cut), 0, 0); B.x = sw < at ? -0.22 * pre : lerp(-0.22, 0.48, cut); hop = Math.sin(pre * Math.PI) * 8; }
    else if (k === 'upper') { A.set(sw < at ? lerp(-0.9, 0.35, ez(pre)) : lerp(0.35, -3.05, cut), 0, 0); B.x = sw < at ? 0.38 * pre : lerp(0.38, -0.28, cut); hop = sw < at ? -4 * pre : Math.sin(Math.min(1, post * 1.5) * Math.PI) * 18; }
    else { hop = Math.sin(clamp(sw / (at + 0.03), 0, 1) * Math.PI) * 56; A.set(sw < at * 0.8 ? lerp(-1.5, -3.1, ez(sw / (at * 0.8))) : lerp(-3.1, -0.45, clamp((sw - at * 0.8) / (at * 0.22), 0, 1)), 0, 0); B.x = sw < at * 0.8 ? -0.3 * pre : sw < at ? 0.58 : lerp(0.58, 0.15, post); }
  } else if (p.charge > 0.3) { A.set(-2.85, 0, 0.25); B.y = -0.45; B.x = -0.1; hop = -3 - lv; }
  else if (p.castT > 0) A.set(-2.9, 0, 0.1);
  const I = R.inner, h = 16 * PX;
  I.rotation.set(roll, spin, 0);
  I.position.set(0, roll ? h - h * Math.cos(roll) : hop, roll ? -h * Math.sin(roll) : 0);
}

// ---------- creatures ----------
// Same parts the posing code looks for (fl: flippers, rot: rotors, claws, legs, ring), all of them boxes.
function rigCreatureBlock(type) {
  const g = new THREE.Group(), mats = [];
  const m = (c, o) => { const q = std(c, Object.assign({ roughness: 0.9, emissive: c, emissiveIntensity: 0.22 }, o)); mats.push(q); return q; };
  const box = (mat, w, h, d, x, y, z, cast) => { const me = mesh(g, GEO.box, mat, x, y, z, cast); me.scale.set(w, h, d); return me; };
  const R = { g, mats, type }, dark = '#1c1a26';
  if (type === 'penguin') {
    const b = m('#2b2d3a'), w = m('#fafafa'), o = m('#f5a623');
    box(b, 20, 20, 16, 0, 12, 0); box(w, 14, 15, 2, 0, 11, 8.2, false);
    box(b, 17, 13, 15, 0, 28.5, 0); box(w, 13, 7, 1.6, 0, 27, 7.6, false);
    for (const x of [-3.6, 3.6]) { box(m(dark), 2.4, 3, 1.2, x, 29, 8.4, false); box(o, 7, 2.4, 10, x * 1.4, 1.2, 3); }
    box(o, 6, 3, 5, 0, 25.5, 9.5);
    R.fl = [box(b, 3, 15, 9, -11.6, 13, 0), box(b, 3, 15, 9, 11.6, 13, 0)];
    box(m('#e5484d'), 21.5, 3.6, 17.5, 0, 21.4, 0, false);
  } else if (type === 'drone') {
    box(m('#7a8aa3', { metalness: 0.5, roughness: 0.4 }), 26, 12, 26, 0, 0, 0);
    box(m('#ff3030', { emissive: 0xff2020, emissiveIntensity: 1.6 }), 6, 5, 2, 0, 0, 13.6, false);
    R.rot = [];
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { box(m('#3b4252'), 3, 5, 3, x, 8, z, false); R.rot.push(box(m('#2a2438'), 18, 1.2, 3, x, 11, z, false)); }
  } else if (type === 'agent') {
    box(m('#2fd3b5', { roughness: 0.5 }), 18, 14, 22, 0, 12, 0); box(m('#0f3d36'), 13, 7, 1.5, 0, 14, 11.2, false);
    for (const x of [-3, 3]) box(m('#d6fff2', { emissive: 0x9dffe0, emissiveIntensity: 1.4 }), 2.4, 2.4, 1, x, 14.4, 12.1, false);
    for (const x of [-10, 10]) for (const z of [-7, 7]) box(m('#2a2438'), 3, 9, 9, x, 4.5, z);
    box(m('#2a2438'), 1.4, 9, 1.4, -5, 23.5, -4, false); box(m('#ffe14d', { emissive: 0xffe14d, emissiveIntensity: 1.2 }), 3.4, 3.4, 3.4, -5, 29, -4, false);
  } else if (type === 'doubao') {
    const blue = m('#4f8df0');
    box(m('#fff6e6', { roughness: 0.7 }), 27, 24, 24, 0, 13, 0); box(m('#b06a3a'), 5, 4, 5, 0, 27, 0);
    for (const x of [-5, 5]) { box(m(dark), 3, 4.4, 1.2, x, 15, 12.3, false); box(m('#ff9a9a'), 4.6, 3, 1, x * 1.9, 10, 12.2, false); }
    box(m('#8f4a3c'), 5, 1.6, 1, 0, 9, 12.3, false);
    box(blue, 31, 4, 6, 0, 26, 0); for (const x of [-15.5, 15.5]) box(blue, 4.4, 11, 11, x, 14, 0);
    box(blue, 2.4, 2.4, 9, -13, 7, 9, false);
  } else if (type === 'crab') {
    const sh = m('#d97757', { roughness: 0.7 }), dk = m('#b95f42');
    box(sh, 30, 12, 20, 0, 12, 0);
    for (const x of [-4.5, 4.5]) { box(sh, 2.4, 6, 2.4, x, 20, 8, false); box(m(dark), 3.4, 3.4, 3, x, 23.6, 8.6, false); }
    R.claws = [box(sh, 11, 9, 9, -20, 19, 7), box(sh, 11, 9, 9, 20, 19, 7)];
    for (const x of [-25.5, 25.5]) box(dk, 3, 4, 9, x, 21, 9, false);
    R.legs = [];
    for (const x of [-1, 1]) for (const z of [-6, 0, 6]) R.legs.push(box(dk, 9, 3, 3, x * 18, 5, z));
  } else {
    const green = m('#3ddc97', { emissive: 0x3ddc97, emissiveIntensity: 1.5 });
    box(m('#f7f7f2', { roughness: 0.5 }), 25, 28, 19, 0, 19, 0); box(m('#0f3d33'), 17, 15, 1.5, 0, 22, 9.6, false);
    R.ring = box(green, 8, 8, 1.6, 0, 22, 10.6, false);
    for (const x of [-7, 7]) box(m('#2a2438'), 7, 5, 10, x, 2.5, 0);
    box(m('#2a2438'), 1.6, 8, 1.6, 0, 37, 0, false); box(green, 4.6, 4.6, 4.6, 0, 43, 0, false);
  }
  return R;
}

// ---------- trees and rocks ----------
// Block textures: 16 pixels to a block, drawn once.
function blockTextures() {
  if (BLK.leaf) return;
  const speck = (g, base, lo, hi, s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = tone(base, lo + grain(x, y, s) * (hi - lo)); g.fillRect(x, y, 1, 1); } };
  BLK.leaf = pixelTex(16, 16, (g) => { speck(g, '#ffffff', 0.72, 1.06, 5); for (let i = 0; i < 26; i++) { g.fillStyle = tone('#ffffff', 0.5); g.fillRect((grain(i, 1, 9) * 16) | 0, (grain(i, 2, 9) * 16) | 0, 1, 1); } }, true);
  BLK.log = pixelTex(16, 16, (g) => { speck(g, '#8a6444', 0.8, 1.08, 2); for (const x of [2, 6, 7, 11, 14]) for (let y = 0; y < 16; y++) if (grain(x, y, 4) > 0.25) { g.fillStyle = tone('#8a6444', 0.62); g.fillRect(x, y, 1, 1); } }, true);
  BLK.stone = pixelTex(16, 16, (g) => { speck(g, '#9a9a96', 0.82, 1.1, 7); for (let i = 0; i < 9; i++) { g.fillStyle = tone('#9a9a96', 0.66); g.fillRect((grain(i, 3, 6) * 13) | 0, (grain(i, 4, 6) * 14) | 0, 3, 1); g.fillRect((grain(i, 5, 6) * 14) | 0, (grain(i, 6, 6) * 13) | 0, 1, 2); } }, true);
  BLK.moss = pixelTex(16, 16, (g) => speck(g, '#6f9a54', 0.8, 1.1, 8), true);
}
// Instanced shapes, one instanced mesh per map cell so only what is in view is drawn (see cellsOf).
// parts: [{ geo, mat, at: [x, y, z] in block units, tint, shade }]; items: [{ x, y, s (block size), rot, col }].
R3.scatterBlocks = function (W, parts, items, tall, far) {
  const cells = cellsOf(items, far), m4 = this.m4, col = this.col;
  for (const pt of parts) {
    const local = new THREE.Matrix4().makeTranslation(pt.at[0], pt.at[1], pt.at[2]);
    pt.geo.boundingSphere = cellSphere(tall);
    for (const c of cells.values()) {
      const im = new THREE.InstancedMesh(pt.geo, pt.mat, c.items.length);
      im.castShadow = im.receiveShadow = true; im.frustumCulled = true;
      im.userData.local = local;
      im.position.set(c.x, 0, c.y);
      c.items.forEach((q, i) => {
        m4.compose(this.v.set(q.x - c.x, 0, q.y - c.y), this.q.setFromAxisAngle(this.v2.set(0, 1, 0), q.rot || 0), this.v2.set(q.s, q.s, q.s)).multiply(local);
        im.setMatrixAt(i, m4);
        if (pt.tint) im.setColorAt(i, col.set(q.col).multiplyScalar(pt.shade || 1));
      });
      W.add(im);
      c.ims.push(im);
    }
  }
};
R3.blockNature = function (W, trees, rocks) {
  blockTextures();
  const leafM = std(0xffffff, { map: BLK.leaf, roughness: 1 }), logM = std(0xffffff, { map: BLK.log, roughness: 1 });
  // two shapes of tree: a broad oak and a taller, narrower one; each tree is a whole number of blocks
  const kinds = [[], []];
  this.treeInst = true;
  trees.forEach((o, i) => {
    const kind = (i * 7 + (o.cr | 0)) % 3 === 0 ? 1 : 0;
    o._ti = { x: o.x, y: o.y, s: clamp(o.cr * (kind ? 0.44 : 0.5), 18, 34), rot: ((i * 5) % 4) * (Math.PI / 2), col: o.pal[1] };
    o._hide = 0;
    kinds[kind].push(o._ti);
  });
  const oak = [{ geo: blockGeo(0.8, 3, 0.8), mat: logM, at: [0, 1.5, 0] }, { geo: blockGeo(3, 2, 3), mat: leafM, at: [0, 4, 0], tint: true }, { geo: blockGeo(2, 1, 2), mat: leafM, at: [0, 5.5, 0], tint: true }, { geo: blockGeo(1, 1, 1), mat: leafM, at: [1.5, 3.5, 1], tint: true }];
  const tall = [{ geo: blockGeo(0.8, 4, 0.8), mat: logM, at: [0, 2, 0] }, { geo: blockGeo(3, 1, 3), mat: leafM, at: [0, 3.5, 0], tint: true }, { geo: blockGeo(2, 2, 2), mat: leafM, at: [0, 5, 0], tint: true }, { geo: blockGeo(1, 1, 1), mat: leafM, at: [0, 6.5, 0], tint: true }];
  if (kinds[0].length) this.scatterBlocks(W, oak, kinds[0], 220);
  if (kinds[1].length) this.scatterBlocks(W, tall, kinds[1], 260);
  if (rocks.length) {
    const stone = std(0xffffff, { map: BLK.stone, roughness: 1 }), moss = std(0xffffff, { map: BLK.moss, roughness: 1 });
    const items = rocks.map((o, i) => ({ x: o.x, y: o.y, s: o.r * 0.82, rot: ((i * 3) % 4) * (Math.PI / 2) }));
    this.scatterBlocks(W, [{ geo: blockGeo(2, 1, 1.6), mat: stone, at: [0, 0.5, 0] }, { geo: blockGeo(1.2, 0.7, 1), mat: stone, at: [-0.2, 1.35, 0.1] }, { geo: blockGeo(1.25, 0.14, 1.05), mat: moss, at: [-0.2, 1.77, 0.1] }], items, 90);
  }
};
