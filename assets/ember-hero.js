/* DealShield — "Ember Shield" hero shader
 * Self-contained WebGL2 background: domain-warped value noise producing slow
 * gold-ember blooms drifting over obsidian, with vignette + film grain.
 * No libraries. GPU-polite: pauses off-screen / hidden tab, caps DPR at 2,
 * renders a single still under prefers-reduced-motion, falls back to a static
 * CSS gradient when WebGL is unavailable.
 */
(function () {
  var canvas = document.getElementById("ember-hero-bg");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gl = canvas.getContext("webgl2", { antialias: false, alpha: true, powerPreference: "low-power" }) ||
           canvas.getContext("webgl",  { antialias: false, alpha: true });

  /* Fallback: static gradient in the same palette */
  if (!gl) {
    canvas.style.background =
      "radial-gradient(120% 90% at 70% 20%, rgba(201,162,39,0.28) 0%, rgba(138,109,31,0.12) 35%, rgba(10,14,20,0) 65%)," +
      "radial-gradient(90% 70% at 20% 85%, rgba(201,162,39,0.10) 0%, rgba(10,14,20,0) 60%), #0a0e14";
    return;
  }

  var VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

  var FRAG = [
    "precision mediump float;",
    "uniform vec2 uRes; uniform float uT;",
    // ── hash & value noise ──
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),",
    "             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);",
    "}",
    // ── palette ──
    "const vec3 OBSIDIAN = vec3(0.027, 0.039, 0.055);",
    "const vec3 OBSIDIAN2 = vec3(0.043, 0.062, 0.086);",
    "const vec3 EMBER     = vec3(0.541, 0.427, 0.121);",
    "const vec3 GOLD       = vec3(0.910, 0.760, 0.322);",
    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);",
    "  float t = uT;",
    // domain-warped flow: two noise octaves steer the field
    "  vec2 p = uv * 1.9;",
    "  float n1 = noise(p + t * 0.05);",
    "  vec2 q = p * 2.0 + vec2(n1 * 1.4, n1 * -1.1);",
    "  float n2 = noise(q - t * 0.03);",
    "  float flow = noise(p * 3.0 + n2 * 2.2 - t * 0.02);",
    // ember bloom: sparse hot regions, gold highlights on the ridges
    "  float bloom = pow(max(flow, 0.0), 3.0) * (0.55 + 0.45 * n2);",
    "  float ridge = pow(max(n2, 0.0), 6.0);",
    "  vec3 col = mix(OBSIDIAN, OBSIDIAN2, n1 * 0.8 + 0.1);",
    "  col = mix(col, EMBER, bloom * 0.9);",
    "  col = mix(col, GOLD, ridge * 0.55);",
    // gentle diagonal sheen keeps the top-left readable behind text
    "  float sheen = smoothstep(1.1, -0.6, uv.x - uv.y);",
    "  col += GOLD * 0.02 * sheen;",
    // vignette
    "  float vig = 1.0 - 0.55 * dot(uv, uv);",
    "  col *= vig;",
    // film grain (last 3%)
    "  float g = hash(gl_FragCoord.xy + fract(t) * 100.0);",
    "  col += (g - 0.5) * 0.030;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
  } catch (e) { canvas.style.background = "radial-gradient(120% 90% at 70% 20%, rgba(201,162,39,0.28), rgba(10,14,20,0) 65%), #0a0e14"; return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uRes = gl.getUniformLocation(prog, "uRes");
  var uT = gl.getUniformLocation(prog, "uT");

  var running = false, raf = 0, t0 = performance.now();

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  function frame() {
    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uT, (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() { if (!running && !reduced) { running = true; raf = requestAnimationFrame(frame); } }
  function stop()  { running = false; cancelAnimationFrame(raf); }

  if (reduced) { resize(); gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform1f(uT, 3.0); gl.drawArrays(gl.TRIANGLES, 0, 3); return; }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { threshold: 0.02 })
      .observe(canvas);
  } else start();

  document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  window.addEventListener("resize", resize, { passive: true });
})();
