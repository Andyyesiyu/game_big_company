'use strict';
// ---------- lighting pass ----------
// The world is drawn with Canvas 2D, then run through one WebGL fragment shader that
// gives the flat picture its surfaces and its air: procedural grass and dirt texture,
// pools of dappled sunlight, drifting mist, sun shafts, bloom, soft focus in the distance,
// film grain and a noon-to-dusk colour grade.
// If WebGL is missing (or the player turns it off) the 2D picture is shown as-is.
const Post = {
  gl: null, ok: false, cv: null, u: {},
  VS: 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }',
  FS: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec3 uCam;   // camera x, camera y, pixels per world unit
uniform float uYK;   // vertical squash of the ground plane
uniform float uTime;
uniform float uDay;  // 0 = noon, 1 = dusk
uniform float uSlow; // 1 while a perfect dodge has slowed the world
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s / 0.875;
}

void main() {
  vec2 uv = vUv;
  vec3 src = texture2D(uTex, uv).rgb;

  // where this pixel sits on the ground plane, in world units
  vec2 sp = vec2(uv.x - 0.5, 0.5 - uv.y) * uRes;
  vec2 wp = vec2(sp.x / uCam.z + uCam.x, sp.y / (uCam.z * uYK) + uCam.y);

  // soft focus: one ring of taps gives both the bloom and a blurred copy for the distance
  vec3 glow = vec3(0.0), blur = vec3(0.0);
  float px = uRes.y / 720.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996, r = (4.0 + float(i) * 2.2) * px;
    vec3 c = texture2D(uTex, uv + vec2(cos(a), sin(a)) * r / uRes).rgb;
    glow += max(c - vec3(0.90), 0.0);
    blur += c;
  }
  blur /= 12.0;
  float far = smoothstep(0.80, 1.0, uv.y), near = smoothstep(0.08, 0.0, uv.y);
  vec3 col = mix(src, blur, clamp(far * 0.5 + near * 0.5, 0.0, 0.7));

  // what kind of surface is this? (read from the base colours)
  float grass = smoothstep(0.05, 0.20, src.g - max(src.r, src.b));
  float water = smoothstep(0.06, 0.18, src.b - src.g) * step(src.r, 0.5);
  float dirt = smoothstep(0.10, 0.24, src.r - src.b) * step(src.b, src.g) * step(src.g, src.r) * (1.0 - grass);

  // surface texture: clumps and blade streaks in the grass, grit in the dirt, grain on the rest
  float n1 = fbm(wp * 0.021), n2 = noise(wp * vec2(0.62, 0.17) + n1 * 3.0), n3 = noise(wp * 0.33);
  col *= 1.0 + grass * ((n1 - 0.5) * 0.60 + (n2 - 0.5) * 0.34);
  col = mix(col, col * vec3(0.86, 0.80, 0.52), grass * smoothstep(0.58, 0.78, fbm(wp * 0.0042 + 3.0)) * 0.6);
  col *= 1.0 + dirt * ((n3 - 0.5) * 0.42 + (n1 - 0.5) * 0.34);
  col *= 1.0 + (1.0 - grass) * (1.0 - water) * (1.0 - dirt) * (noise(wp * 0.7) - 0.5) * 0.09;

  // wind: bright bands rolling through the grass and the leaves
  float gust = sin(wp.x * 0.011 + wp.y * 0.019 - uTime * 1.5 + n1 * 5.0);
  col += grass * smoothstep(0.74, 1.0, gust) * vec3(0.07, 0.09, 0.03);

  // water: slow swell plus sharp glints
  float swell = noise(wp * 0.02 + vec2(uTime * 0.25, -uTime * 0.18));
  float glint = noise(wp * 0.07 + vec2(-uTime * 0.7, uTime * 0.45)) * noise(wp * 0.11 + uTime * 0.6);
  col += water * (swell * 0.12 - 0.05);
  col += water * smoothstep(0.42, 0.62, glint) * vec3(0.50, 0.55, 0.48);

  // light: pools of sun between the trees, under slow cloud shadow
  float dapple = smoothstep(0.40, 0.62, fbm(wp * 0.0072 + vec2(sin(uTime * 0.25) * 0.12, uTime * 0.015)));
  float cloud = smoothstep(0.46, 0.70, fbm(wp * 0.0011 + vec2(uTime * 0.013, uTime * 0.007)));
  float sun = dapple * (1.0 - cloud * 0.75);
  vec3 sunCol = mix(vec3(1.12, 1.06, 0.88), vec3(1.22, 0.92, 0.62), uDay);
  col *= mix(vec3(0.64, 0.69, 0.78), sunCol, sun);

  col += glow / 12.0 * mix(1.8, 2.4, uDay);

  // grade: deeper, slightly cooler shadows; warm highlights; filmic contrast
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.06);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.38);
  col *= mix(vec3(0.84, 0.96, 0.98), vec3(1.04, 1.0, 0.92), smoothstep(0.10, 0.75, l));
  col *= mix(1.04, 0.90, uDay);

  // mist: thicker with distance, drifting in layers
  float depth = smoothstep(0.20, 1.0, uv.y);
  float mist = fbm(vec2(uv.x * 2.4 + uTime * 0.018, uv.y * 4.6 - uTime * 0.010) + wp * 0.0007);
  vec3 fogCol = mix(vec3(0.74, 0.84, 0.70), vec3(0.98, 0.76, 0.52), uDay);
  col = mix(col, fogCol, clamp(depth * 0.07 + mist * (0.04 + depth * 0.22), 0.0, 0.4));

  // sun shafts fanning in from the upper-left, catching the mist
  vec2 q = uv - vec2(-0.12, 1.18);
  float rays = smoothstep(0.50, 1.0, sin(atan(q.y, q.x) * 17.0 + uTime * 0.12) * 0.5 + 0.5) * smoothstep(1.6, 0.2, length(q));
  col += rays * (0.5 + mist) * mix(vec3(0.10, 0.095, 0.06), vec3(0.17, 0.10, 0.04), uDay);

  // perfect dodge: the world drains to a cold blue
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * vec3(0.72, 0.92, 1.20), uSlow * 0.55);

  float v = smoothstep(1.22, 0.40, length((uv - 0.5) * vec2(1.1, 1.0)));
  col *= mix(0.62 - uSlow * 0.15, 1.0, v);
  col += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.028;
  gl_FragColor = vec4(col, 1.0);
}`,
  init(cv) {
    this.cv = cv;
    try {
      const gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
      if (!gl) return;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, this.VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, this.FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      for (const n of ['uRes', 'uCam', 'uYK', 'uTime', 'uDay', 'uSlow']) this.u[n] = gl.getUniformLocation(prog, n);
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
      this.gl = gl; this.ok = true;
    } catch (e) {
      this.ok = false;
      if (window.console) console.warn('Lighting pass unavailable, showing the plain picture:', e.message);
    }
  },
  // src: the 2D canvas holding this frame's world
  draw(src, camX, camY, pxPerUnit, yk, time, day, slow) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform2f(u.uRes, this.cv.width, this.cv.height);
    gl.uniform3f(u.uCam, camX, camY, pxPerUnit);
    gl.uniform1f(u.uYK, yk);
    gl.uniform1f(u.uTime, time % 4000);
    gl.uniform1f(u.uDay, day);
    gl.uniform1f(u.uSlow, slow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  },
};
