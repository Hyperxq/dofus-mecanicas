import * as THREE from "three";

const COLORS = {
  range: "#3a3fb8",
  rangeNoLos: "#9298dc",
  move: "#7dff8a",
  path: "#8ef08f",
  zone: "#f2662a",
  portalTarget: "#46d8e4",
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grassTexture(seed, base, repeat) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const blobs = [
    ["#86b04a", 0.18], ["#5d8a33", 0.2], ["#9cc25a", 0.12], ["#4f7a2c", 0.16],
  ];
  for (let i = 0; i < 260; i++) {
    const [col, a] = blobs[i % blobs.length];
    const x = r() * size, y = r() * size, rad = 10 + r() * 46;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grad.addColorStop(0, col);
      grad.addColorStop(1, "transparent");
      g.globalAlpha = a;
      g.fillStyle = grad;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 2200; i++) {
    const x = r() * size, y = r() * size;
    g.strokeStyle = r() > 0.5 ? "#a8cf63" : "#476f27";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
    g.stroke();
  }
  g.globalAlpha = 0.9;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = ["#f4e9a8", "#f7f7f2", "#e9a6c8"][i % 3];
    g.beginPath();
    g.arc(r() * size, r() * size, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(170,250,255,0.75)");
  grad.addColorStop(1, "rgba(70,216,228,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PORTAL_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Flat turquoise disc filling the cell, pale centre and bright rim, like the in-game Eliotrope portal.
const PORTAL_FRAG = `
uniform float uTime; uniform float uOpen; uniform float uFlash;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float body = 1.0 - smoothstep(0.86, 1.0, r);
  float rim = smoothstep(0.7, 0.88, r) * (1.0 - smoothstep(0.92, 1.0, r));
  float swirl = 0.5 + 0.5 * sin(a * 3.0 - r * 8.0 + uTime * 1.7);
  vec3 inner = vec3(0.80, 0.99, 0.97);
  vec3 outer = vec3(0.30, 0.84, 0.90);
  vec3 col = mix(inner, outer, smoothstep(0.1, 0.9, r));
  col = mix(col, vec3(1.0), rim * 0.55 + swirl * 0.14 * body + uFlash * 0.6);
  float alpha = (body * (0.72 + 0.1 * swirl) + rim * 0.25) * uOpen;
  gl_FragColor = vec4(col, alpha);
}`;

const HALO_FRAG = `
uniform float uOpen; uniform float uFlash;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float alpha = (1.0 - smoothstep(0.55, 1.0, r)) * (0.35 + uFlash) * uOpen;
  gl_FragColor = vec4(vec3(0.35, 0.9, 0.95) * alpha, alpha);
}`;

const RIBBON_FRAG = `
uniform float uTime; uniform float uLen; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float across = abs(vUv.y * 2.0 - 1.0);
  float core = 1.0 - smoothstep(0.18, 0.55, across);
  float halo = (1.0 - across) * 0.4;
  float dash = step(0.42, fract(vUv.x * uLen * 2.2 - uTime * 2.4));
  float alpha = core * (0.45 + 0.55 * dash) + halo;
  gl_FragColor = vec4(uColor * alpha, alpha);
}`;

export function createWorld({ canvas, overlay, cols, rows }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x24331f, 48, 80);

  // Dofus-style 2:1 dimetric view: 45° yaw, 30° elevation, orthographic.
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const D = 40;
  camera.position.set(D, Math.SQRT2 * D * Math.tan(Math.PI / 6), D);
  camera.lookAt(0, 0, 0);
  const START_ZOOM = 1.12;
  let zoom = START_ZOOM, baseU = 1;
  const pan = { x: 0, y: 0 };
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };

  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x4a3b22, 2.4));
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.4);
  sun.position.set(-10, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const wx = (c) => c.x - cols / 2 + 0.5;
  const wz = (c) => c.y - rows / 2 + 0.5;
  const toWorld = (c, h = 0) => new THREE.Vector3(wx(c), h, wz(c));

  // Ground and decoration outside the combat area.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ map: grassTexture(7, "#7fae4a", 14), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rockMat = new THREE.MeshStandardMaterial({ color: "#8d8676", roughness: 0.95, flatShading: true });
  const mossMat = new THREE.MeshStandardMaterial({ color: "#7d9b4a", roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 1, flatShading: true });
  const leafMats = ["#4d8a3a", "#5f9e3f", "#3f7a36"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));

  function rock(r, scale = 1) {
    const g = new THREE.Group();
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const s = (0.22 + r() * 0.2) * scale;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i === 0 && r() > 0.5 ? mossMat : rockMat);
      m.position.set((r() - 0.5) * 0.35 * scale, s * 0.7, (r() - 0.5) * 0.35 * scale);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.scale.y = 0.8 + r() * 0.5;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  function tree(r) {
    const g = new THREE.Group();
    const h = 0.9 + r() * 0.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, h, 6), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const s = 0.55 - i * 0.1 + r() * 0.15;
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leafMats[i % 3]);
      leaf.position.set((r() - 0.5) * 0.4, h + i * 0.32, (r() - 0.5) * 0.4);
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }

  {
    const r = rng(42);
    const deco = new THREE.Group();
    for (let i = 0; i < 140; i++) {
      const x = (r() - 0.5) * 50, z = (r() - 0.5) * 50;
      if (Math.abs(x) < cols / 2 + 1.2 && Math.abs(z) < rows / 2 + 1.2) continue;
      // Keep tall props off the camera-facing side so they never hide the grid.
      if (x + z > -2 && Math.abs(x - z) < cols + 4) continue;
      const o = r() > 0.35 ? tree(r) : rock(r, 1.4);
      o.position.set(x, 0, z);
      o.rotation.y = r() * Math.PI * 2;
      o.scale.setScalar(0.9 + r() * 0.7);
      deco.add(o);
    }
    scene.add(deco);
  }

  // Combat grid: subtle checker plus thin lines, like the Dofus 3 tactical overlay.
  const board = new THREE.Group();
  scene.add(board);
  {
    const checker = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false }),
      Math.ceil((cols * rows) / 2),
    );
    const o = new THREE.Object3D();
    let i = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if ((x + y) % 2 === 0) continue;
      o.position.set(wx({ x, y }), 0.004, wz({ x, y }));
      o.updateMatrix();
      checker.setMatrixAt(i++, o.matrix);
    }
    checker.count = i;
    board.add(checker);

    const pts = [];
    for (let i = 0; i <= cols; i++) pts.push(i - cols / 2, 0.012, -rows / 2, i - cols / 2, 0.012, rows / 2);
    for (let j = 0; j <= rows; j++) pts.push(-cols / 2, 0.012, j - rows / 2, cols / 2, 0.012, j - rows / 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    board.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 })));

    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(cols + 0.5, rows + 0.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2410, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    edge.position.y = 0.002;
    board.add(edge);
  }

  // Highlight layers.
  const tileGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
  const tmp = new THREE.Object3D();
  function layer(color, opacity, y) {
    const m = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), cols * rows);
    m.count = 0;
    // Instance bounds are cached on first render; culling would hide later highlights.
    m.frustumCulled = false;
    m.position.y = y;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  }
  const layers = {
    move: layer(COLORS.move, 0.42, 0.016),
    path: layer(COLORS.path, 0.55, 0.018),
    range: layer(COLORS.range, 0.6, 0.016),
    rangeNoLos: layer(COLORS.rangeNoLos, 0.3, 0.016),
    zone: layer(COLORS.zone, 0.55, 0.02),
    flash: layer("#fff1b8", 0, 0.024),
  };
  function fill(m, cells) {
    cells.forEach((c, i) => {
      tmp.position.set(wx(c), 0, wz(c));
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.count = cells.length;
    m.instanceMatrix.needsUpdate = true;
  }

  const hover = new THREE.Group();
  {
    const h = 0.47;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 0, -h), new THREE.Vector3(h, 0, h), new THREE.Vector3(-h, 0, h),
    ]);
    hover.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xffffff })));
    hover.add(new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false })));
    hover.position.y = 0.03;
    hover.visible = false;
    hover.renderOrder = 3;
    scene.add(hover);
  }

  // Terrain inside the grid: walls are raised stone blocks (they cut sight), holes are dark pits (sight passes over).
  const obstacles = new THREE.Group();
  scene.add(obstacles);
  const wallMats = ["#8c8677", "#7f7a6c", "#979080"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
  const wallTop = new THREE.MeshStandardMaterial({ color: "#aaa392", roughness: 0.9, flatShading: true });
  const holeRim = new THREE.MeshBasicMaterial({ color: "#2b2418" });
  const holeVoid = new THREE.MeshBasicMaterial({ color: "#07090a" });
  const holeRimGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const holeVoidGeo = new THREE.PlaneGeometry(0.84, 0.84).rotateX(-Math.PI / 2);
  function setTerrain(blocked, holes = []) {
    obstacles.clear();
    for (const k of blocked) {
      const [x, y] = k.split(",").map(Number);
      const r = rng(x * 131 + y * 17 + 3);
      const h = 0.62 + r() * 0.3;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.96, h, 0.96), [wallMats[0], wallMats[1], wallTop, wallMats[2], wallMats[1], wallMats[0]]);
      block.position.copy(toWorld({ x, y }, h / 2));
      block.castShadow = block.receiveShadow = true;
      obstacles.add(block);
    }
    for (const k of holes) {
      const [x, y] = k.split(",").map(Number);
      const rim = new THREE.Mesh(holeRimGeo, holeRim);
      rim.position.copy(toWorld({ x, y }, 0.014));
      const pit = new THREE.Mesh(holeVoidGeo, holeVoid);
      pit.position.copy(toWorld({ x, y }, 0.015));
      rim.renderOrder = pit.renderOrder = 1;
      obstacles.add(rim, pit);
    }
  }

  // Route preview: glowing ground ribbons with flowing dashes, a chevron per leg and an impact marker.
  // WebGL ignores line widths, so legs are drawn as flat quads instead of lines.
  const preview = new THREE.Group();
  scene.add(preview);
  const previewUniforms = [];
  let impactMarker = null;
  const chevron = new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(0.2, 0), new THREE.Vector2(-0.12, 0.16), new THREE.Vector2(-0.04, 0), new THREE.Vector2(-0.12, -0.16),
  ])).rotateX(-Math.PI / 2);
  const impactGeo = new THREE.RingGeometry(0.4, 0.5, 4, 1).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);

  function ribbon(a, b, color) {
    const p = toWorld(a, 0.06), q = toWorld(b, 0.06);
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const angle = Math.atan2(-dz, dx);
    const uniforms = { uTime: { value: 0 }, uLen: { value: len }, uColor: { value: new THREE.Color(color) } };
    previewUniforms.push(uniforms);
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(len, 0.2).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: RIBBON_FRAG, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    band.position.set((p.x + q.x) / 2, 0.06, (p.z + q.z) / 2);
    band.rotation.y = angle;
    band.renderOrder = 6;
    const tip = new THREE.Mesh(chevron, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    tip.position.set(q.x - (dx / len) * 0.42, 0.07, q.z - (dz / len) * 0.42);
    tip.rotation.y = angle;
    tip.renderOrder = 7;
    preview.add(band, tip);
  }

  function setPreview(segments, { landing = null, ok = true } = {}) {
    for (const m of preview.children) {
      if (m.geometry !== chevron && m.geometry !== impactGeo) m.geometry.dispose();
      m.material.dispose();
    }
    preview.clear();
    previewUniforms.length = 0;
    impactMarker = null;
    if (!segments) return;
    segments.forEach(([a, b], i) => {
      const last = i === segments.length - 1;
      const color = !ok && last ? "#ff5a3c" : i === 0 ? "#f5b941" : last && segments.length > 1 ? "#72f59a" : "#46d8e4";
      ribbon(a, b, color);
    });
    if (landing) {
      impactMarker = new THREE.Mesh(impactGeo, new THREE.MeshBasicMaterial({ color: ok ? "#fff0b8" : "#ff5a3c", transparent: true, depthTest: false, depthWrite: false }));
      impactMarker.position.copy(toWorld(landing, 0.07));
      impactMarker.renderOrder = 7;
      preview.add(impactMarker);
    }
  }

  // Portals.
  const glow = glowTexture();
  const portals = new Map();
  const clock = new THREE.Clock();

  function makePortal(p) {
    const group = new THREE.Group();
    group.position.copy(toWorld(p));
    const uniforms = { uTime: { value: 0 }, uOpen: { value: 0 }, uFlash: { value: 0 } };
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.35).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.position.y = 0.03;
    halo.renderOrder = 4;
    const disk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms, vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, transparent: true, depthWrite: false }),
    );
    disk.position.y = 0.035;
    disk.renderOrder = 5;
    group.add(halo, disk);

    const N = 8;
    const seeds = Array.from({ length: N }, (_, i) => ({ phase: i / N, ang: Math.random() * Math.PI * 2, rad: 0.12 + Math.random() * 0.26 }));
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    const points = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: glow, size: 4, sizeAttenuation: false, color: 0xd8ffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(points);

    const light = new THREE.PointLight(0x46d8e4, 0, 2.4, 1.6);
    light.position.y = 0.45;
    group.add(light);

    const label = document.createElement("div");
    label.className = "portal-label";
    overlay.appendChild(label);

    scene.add(group);
    const rec = { id: p.id, cell: { x: p.x, y: p.y }, group, uniforms, points, seeds, light, label, closing: false };
    portals.set(p.id, rec);
    tween(450, (k) => { uniforms.uOpen.value = k; light.intensity = 1.4 * k; group.scale.setScalar(0.4 + 0.6 * easeOut(k)); });
    return rec;
  }

  function removePortal(rec) {
    rec.closing = true;
    portals.delete(rec.id);
    rec.label.remove();
    return tween(380, (k) => {
      rec.uniforms.uOpen.value = 1 - k;
      rec.light.intensity = 1.4 * (1 - k);
      rec.group.scale.setScalar(1 - 0.6 * k);
    }).then(() => scene.remove(rec.group));
  }

  function setPortals(list) {
    for (const rec of [...portals.values()]) {
      const p = list.find((q) => q.id === rec.id);
      if (!p || p.x !== rec.cell.x || p.y !== rec.cell.y) removePortal(rec);
    }
    list.forEach((p, i) => {
      const rec = portals.get(p.id) || makePortal(p);
      rec.label.innerHTML = `<b>${p.id}</b><i>${i + 1}</i>`;
    });
  }

  function flashPortal(id) {
    const rec = portals.get(id);
    if (!rec) return Promise.resolve();
    return tween(320, (k) => { rec.uniforms.uFlash.value = Math.sin(k * Math.PI) * 1.2; });
  }

  // Entities: the caster token and training dummies.
  const actors = new Map();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const creature = {
    body: std("#e4e8ea"),
    hood: std("#1f7f98"),
    trim: std("#e3d3a8"),
    tuft: std("#d6ccad", { flatShading: true }),
    feet: std("#e5832a"),
    eyeRing: new THREE.MeshBasicMaterial({ color: "#1a1a1a" }),
    iris: new THREE.MeshBasicMaterial({ color: "#e6d29c" }),
    pupil: new THREE.MeshBasicMaterial({ color: "#2fc4e8" }),
  };
  const burlap = new THREE.MeshStandardMaterial({ color: "#c9a46a", roughness: 1, flatShading: true });
  const post = new THREE.MeshStandardMaterial({ color: "#6b4a2b", roughness: 1 });

  function teamRing(color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.33, 0.43, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    ring.position.y = 0.022;
    ring.renderOrder = 3;
    return ring;
  }

  // Creature-mode Selatrop: round pale body, big ringed eyes, teal hood with a cream band, orange feet.
  function makeCaster() {
    const g = new THREE.Group();
    g.add(teamRing("#3d8cff"));
    const c = new THREE.Group();
    c.name = "creature";
    c.rotation.y = Math.PI / 4;
    const add = (geo, mat, [x, y, z], rot = [0, 0, 0], scale = [1, 1, 1]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(...rot);
      m.scale.set(...scale);
      m.castShadow = true;
      c.add(m);
      return m;
    };
    add(new THREE.SphereGeometry(0.27, 24, 18), creature.body, [0, 0.26, 0], [0, 0, 0], [1, 0.9, 0.95]);
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.108, 0.22, 0.232);
      eye.rotation.y = s * 0.28;
      const disc = (r, mat, z, sy = 1, dx = 0) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat);
        m.position.set(dx, 0, z);
        m.scale.y = sy;
        eye.add(m);
      };
      disc(0.1, creature.eyeRing, 0, 1.1);
      disc(0.08, creature.iris, 0.002, 1.1);
      disc(0.052, creature.pupil, 0.006, 1.5, -s * 0.01);
      c.add(eye);
    }
    const capGeo = new THREE.SphereGeometry(0.28, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45);
    add(capGeo, creature.hood, [0, 0.36, -0.03], [-0.32, 0, 0], [1.02, 0.95, 1.06]);
    add(new THREE.TorusGeometry(0.255, 0.036, 10, 36), creature.trim, [0, 0.385, -0.01], [Math.PI / 2 - 0.32, 0, 0]);
    add(new THREE.TorusGeometry(0.065, 0.013, 6, 20, Math.PI * 1.7), creature.trim, [0, 0.56, 0.1], [-0.95, 0, 0.4]);
    for (const s of [-1, 1]) {
      add(new THREE.ConeGeometry(0.075, 0.2, 8), creature.hood, [s * 0.19, 0.56, -0.05], [0, 0, -s * 0.7]);
      add(new THREE.ConeGeometry(0.032, 0.07, 6), creature.trim, [s * 0.255, 0.64, -0.05], [0, 0, -s * 0.7]);
    }
    add(new THREE.ConeGeometry(0.09, 0.24, 8), creature.hood, [0, 0.44, -0.27], [-1.95, 0, 0]);
    for (const [x, y, z, r] of [[0.17, 0.27, -0.16, 0.7], [0.2, 0.2, -0.1, 1.1], [0.12, 0.33, -0.2, 0.4]]) {
      add(new THREE.ConeGeometry(0.045, 0.14, 5), creature.tuft, [x, y, z], [-0.6, 0, -r]);
    }
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.075, 14, 10), creature.feet, [s * 0.11, 0.04, 0.12], [0, 0, 0], [1, 0.55, 1.3]);
    g.add(c);
    return g;
  }

  function makeDummy() {
    const g = new THREE.Group();
    const ring = teamRing("#e0402e");
    g.add(ring);
    const skin = burlap.clone();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), post);
    stick.position.y = 0.45;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.42, 8), skin);
    body.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
    head.position.y = 0.85;
    const arms = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), post);
    arms.position.y = 0.62;
    for (const m of [stick, body, head, arms]) { m.castShadow = true; g.add(m); }
    g.userData = { ring, skin };
    return g;
  }

  // Dofus marks the creatures a spell would hit: orange while aiming, a red flash on impact.
  function tint(a, color, strength) {
    const { ring, skin } = a.group.userData;
    if (!ring) return;
    ring.material.color.set(strength > 0 ? color : "#e0402e");
    skin.emissive.set(color);
    skin.emissiveIntensity = strength;
  }
  let targeted = new Set();
  function setTargets(ids) {
    targeted = new Set(ids);
    for (const [id, a] of actors) if (id !== "caster") tint(a, "#ff7a1a", targeted.has(id) ? 0.55 : 0);
  }
  function flashHit(a) {
    return tween(520, (k) => tint(a, "#ff2a12", Math.sin(k * Math.PI) * 0.9)).then(() => tint(a, "#ff7a1a", 0));
  }

  function setActors(caster, entities) {
    const wanted = new Map([["caster", caster], ...entities.map((e) => [e.id, e])]);
    for (const [id, a] of actors) if (!wanted.has(id)) { scene.remove(a.group); a.label?.remove(); actors.delete(id); }
    for (const [id, c] of wanted) {
      if (!c) continue;
      let a = actors.get(id);
      if (!a) {
        a = { group: id === "caster" ? makeCaster() : makeDummy(), cell: c };
        if (id !== "caster") {
          a.label = document.createElement("div");
          a.label.className = "actor-label";
          a.label.textContent = c.name || id;
          overlay.appendChild(a.label);
        }
        scene.add(a.group);
        actors.set(id, a);
      }
      a.cell = { x: c.x, y: c.y };
      a.group.position.copy(toWorld(c));
      a.group.scale.setScalar(1);
    }
  }

  // Tweens and transient effects.
  const tweens = [];
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  function tween(ms, fn) {
    return new Promise((resolve) => tweens.push({ start: performance.now(), ms, fn, resolve }));
  }
  const wait = (ms) => tween(ms, () => {});

  const sparkMat = new THREE.SpriteMaterial({ map: glow, color: 0xbff8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const effects = new THREE.Group();
  scene.add(effects);

  function burst(pos, color = 0xbff8ff, n = 14) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(sparkMat.clone());
      s.material.color = new THREE.Color(color);
      s.position.copy(pos);
      s.scale.setScalar(0.25);
      const a = (i / n) * Math.PI * 2;
      parts.push({ s, v: new THREE.Vector3(Math.cos(a) * 1.6, 1 + Math.random(), Math.sin(a) * 1.6) });
      effects.add(s);
    }
    return tween(520, (k) => {
      for (const p of parts) {
        p.s.position.copy(pos).addScaledVector(p.v, k * 0.5);
        p.s.material.opacity = 1 - k;
      }
    }).then(() => parts.forEach((p) => effects.remove(p.s)));
  }

  function makeOrb() {
    const orb = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe9feff }));
    const halo = new THREE.Sprite(sparkMat.clone());
    halo.scale.setScalar(0.8);
    const light = new THREE.PointLight(0x7fefff, 4, 3, 1.5);
    orb.add(core, halo, light);
    effects.add(orb);
    return orb;
  }

  async function fly(orb, a, b, ms, arc) {
    const trail = [];
    await tween(ms, (k) => {
      orb.position.lerpVectors(a, b, k);
      orb.position.y += Math.sin(k * Math.PI) * arc;
      const s = new THREE.Sprite(sparkMat.clone());
      s.position.copy(orb.position);
      s.scale.setScalar(0.35);
      effects.add(s);
      trail.push({ s, born: performance.now() });
    });
    fadeTrail(trail);
  }

  function fadeTrail(trail) {
    tween(400, (k) => trail.forEach((t) => { t.s.material.opacity = 1 - k; t.s.scale.setScalar(0.35 * (1 - k * 0.7)); }))
      .then(() => trail.forEach((t) => effects.remove(t.s)));
  }

  function floatText(cell, text, kind) {
    const el = document.createElement("div");
    el.className = `float-text ${kind}`;
    el.textContent = text;
    overlay.appendChild(el);
    floats.push({ el, pos: toWorld(cell, 1.25), start: performance.now() });
  }
  const floats = [];

  function flashCells(cells) {
    fill(layers.flash, cells);
    return tween(500, (k) => { layers.flash.material.opacity = 0.8 * (1 - k); }).then(() => { layers.flash.count = 0; });
  }

  async function playCast(res, names) {
    const orb = makeOrb();
    const [s0] = res.segments || [[null, null]];
    const start = toWorld(s0[0], 0.85);
    try {
      if (res.projected || res.route) {
        await fly(orb, start, toWorld(res.entry, 0.2), 380, 0.9);
        flashPortal(res.entry.id);
        const hops = res.route.order;
        for (let i = 1; i < hops.length; i++) {
          await fly(orb, toWorld(hops[i - 1], 0.2), toWorld(hops[i], 0.2), Math.min(420, 80 + 26 * (Math.abs(hops[i].x - hops[i - 1].x) + Math.abs(hops[i].y - hops[i - 1].y))), 0.15);
          flashPortal(hops[i].id);
        }
        if (!res.ok) {
          const ex = toWorld(res.route.exit, 0.2);
          const dir = res.landing ? toWorld(res.landing, 0.6).sub(ex).normalize().multiplyScalar(1.2).add(ex) : ex;
          await fly(orb, ex, dir, 260, 0.4);
          await burst(orb.position.clone(), 0xffb0a0, 10);
          return;
        }
        await fly(orb, toWorld(res.route.exit, 0.2), toWorld(res.landing, 0.25), 380, 0.9);
      } else {
        await fly(orb, start, toWorld(res.landing, 0.25), 420, 1.1);
      }
    } finally {
      effects.remove(orb);
    }
    burst(toWorld(res.landing, 0.3));
    await flashCells(res.zone);

    for (const id of res.hits) {
      const a = actors.get(id);
      if (!a) continue;
      flashHit(a);
      shake(a.group);
    }

    let n = 1;
    for (const m of res.moves) {
      const a = actors.get(m.id);
      if (!a) continue;
      if (res.moves.length > 1) floatText(m.from, `${n++}º`, "order");
      await moveActor(m.id, m.path, m.teleported);
      if (m.collided) { floatText(m.to, "¡Choque!", "bump"); shake(a.group); }
    }
  }

  function shake(group) {
    const base = group.position.clone();
    return tween(320, (k) => {
      group.position.x = base.x + Math.sin(k * 40) * 0.06 * (1 - k);
      group.position.z = base.z + Math.cos(k * 37) * 0.06 * (1 - k);
    }).then(() => group.position.copy(base));
  }

  async function moveActor(id, path, teleportedTo) {
    const a = actors.get(id);
    if (!a) return;
    for (let i = 0; i < path.length; i++) {
      const to = path[i];
      const isTeleportHop = teleportedTo && i === path.length - 1;
      const from = a.group.position.clone();
      if (isTeleportHop) {
        await tween(200, (k) => a.group.scale.setScalar(1 - k));
        burst(from.clone().setY(0.4), 0x9ff6ff, 10);
        a.group.position.copy(toWorld(to));
        burst(toWorld(to, 0.4), 0x9ff6ff, 10);
        flashPortal(teleportedTo);
        await tween(240, (k) => a.group.scale.setScalar(k));
      } else {
        const target = toWorld(to);
        await tween(150, (k) => {
          a.group.position.lerpVectors(from, target, k);
          a.group.position.y = Math.sin(k * Math.PI) * 0.08;
        });
      }
      a.cell = { x: to.x, y: to.y };
    }
  }

  // Picking and camera fitting.
  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pickCell(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(groundPlane, hit)) return null;
    const c = { x: Math.floor(hit.x + cols / 2), y: Math.floor(hit.z + rows / 2) };
    return c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows ? c : null;
  }

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const boardW = (cols + rows) / Math.SQRT2;
    const boardH = boardW / 2 + 1.4;
    const innerW = Math.max(120, w - insets.left - insets.right);
    const innerH = Math.max(120, h - insets.top - insets.bottom);
    const u = Math.max((boardW * 1.06) / innerW, (boardH * 1.08) / innerH);
    baseU = u;
    const limit = boardW * 0.6;
    pan.x = Math.max(-limit, Math.min(limit, pan.x));
    pan.y = Math.max(-limit, Math.min(limit, pan.y));
    // The orthographic camera zooms around the frustum centre, so panning shifts that centre in camera space.
    const cx = (-(insets.left - insets.right) / 2) * u + pan.x;
    const cy = (-(insets.bottom - insets.top) / 2) * u + 0.35 + pan.y;
    camera.left = cx - (w / 2) * u;
    camera.right = cx + (w / 2) * u;
    camera.top = cy + (h / 2) * u;
    camera.bottom = cy - (h / 2) * u;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  function zoomAt(factor, clientX, clientY) {
    const next = Math.min(3.2, Math.max(0.8, zoom * factor));
    if (clientX !== undefined) {
      const r = canvas.getBoundingClientRect();
      const ox = clientX - r.left - r.width / 2, oy = clientY - r.top - r.height / 2;
      const diff = baseU / zoom - baseU / next;
      pan.x += ox * diff;
      pan.y -= oy * diff;
    }
    zoom = next;
    fit();
  }

  function panBy(dxPx, dyPx) {
    const u = baseU / zoom;
    pan.x -= dxPx * u;
    pan.y += dyPx * u;
    fit();
  }
  new ResizeObserver(fit).observe(canvas);

  const v = new THREE.Vector3();
  function place(el, pos) {
    v.copy(pos).project(camera);
    el.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * canvas.clientWidth}px, ${(-v.y * 0.5 + 0.5) * canvas.clientHeight}px)`;
  }

  function frame(now) {
    const t = clock.getElapsedTime();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.start) / tw.ms);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    for (const rec of portals.values()) {
      rec.uniforms.uTime.value = t;
      const arr = rec.points.geometry.attributes.position.array;
      rec.seeds.forEach((s, i) => {
        const life = (t * 0.32 + s.phase) % 1;
        const ang = s.ang + t * 0.8;
        arr[i * 3] = Math.cos(ang) * s.rad;
        arr[i * 3 + 1] = 0.04 + life * 0.4;
        arr[i * 3 + 2] = Math.sin(ang) * s.rad;
      });
      rec.points.geometry.attributes.position.needsUpdate = true;
      rec.points.material.opacity = rec.uniforms.uOpen.value;
      place(rec.label, rec.group.position.clone().setY(0.55));
    }
    for (const [id, a] of actors) {
      if (id === "caster") {
        const c = a.group.getObjectByName("creature");
        const bob = Math.sin(t * 3.2);
        c.position.y = Math.max(0, bob) * 0.025;
        c.scale.set(1 + bob * 0.015, 1 - bob * 0.02, 1 + bob * 0.015);
      } else if (a.label) place(a.label, a.group.position.clone().setY(1.12));
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      const k = (now - f.start) / 1300;
      if (k >= 1) { f.el.remove(); floats.splice(i, 1); continue; }
      place(f.el, f.pos.clone().setY(f.pos.y + k * 0.6));
      f.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
    for (const u of previewUniforms) u.uTime.value = t;
    if (impactMarker) impactMarker.scale.setScalar(0.92 + Math.sin(t * 5) * 0.08);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setTerrain,
    setTargets,
    setPortals,
    setActors,
    setPreview,
    setHighlights({ move = [], path = [], range = [], rangeNoLos = [], zone = [] } = {}) {
      fill(layers.move, move);
      fill(layers.path, path);
      fill(layers.range, range);
      fill(layers.rangeNoLos, rangeNoLos);
      fill(layers.zone, zone);
    },
    setHover(cell) {
      hover.visible = !!cell;
      if (cell) hover.position.set(wx(cell), 0.03, wz(cell));
    },
    setInsets(next) { insets = next; fit(); },
    zoomAt,
    panBy,
    resetView() { zoom = START_ZOOM; pan.x = 0; pan.y = 0; fit(); },
    pickCell,
    playCast,
    moveActor,
    floatText,
    flashPortal,
    burst: (cell) => burst(toWorld(cell, 0.4), 0x9ff6ff, 12),
    wait,
  };
}
