import * as THREE from "three";
const PI = Math.PI;
function texture(kind = "marble", seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d");
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  c.fillStyle =
    kind === "wood" ? "#705138" : kind === "art" ? "#e2c69c" : "#bfb5a6";
  c.fillRect(0, 0, 512, 512);
  if (kind === "art") {
    for (let i = 0; i < 40; i++) {
      c.fillStyle = ["#183b49", "#b48243", "#faf1df", "#3a827e", "#943e3f"][
        i % 5
      ];
      c.globalAlpha = 0.65;
      c.beginPath();
      c.ellipse(
        rand() * 512,
        rand() * 512,
        rand() * 190 + 15,
        rand() * 150 + 10,
        rand() * PI,
        0,
        2 * PI,
      );
      c.fill();
    }
    c.globalAlpha = 1;
  } else if (kind === "wood") {
    for (let y = 0; y < 512; y += 32) {
      c.strokeStyle = "#34261e";
      c.strokeRect(0, y, 512, 32);
      for (let j = 0; j < 15; j++) {
        c.strokeStyle = `rgba(221,184,132,${rand() * 0.2})`;
        c.beginPath();
        c.moveTo(0, y + rand() * 32);
        c.bezierCurveTo(
          150,
          y + rand() * 32,
          300,
          y + rand() * 32,
          512,
          y + rand() * 32,
        );
        c.stroke();
      }
    }
  } else {
    for (let i = 0; i < 110; i++) {
      c.strokeStyle = `rgba(79,76,72,${rand() * 0.15})`;
      c.lineWidth = rand() * 2 + 0.4;
      c.beginPath();
      const x = rand() * 512;
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 80, 160, x - 80, 320, x + rand() * 140 - 70, 512);
      c.stroke();
    }
    c.strokeStyle = "#857f7466";
    c.strokeRect(0, 0, 512, 512);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (kind !== "art") {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
  }
  return tex;
}
function buildRoom(scene, theme) {
  const gold = new THREE.MeshStandardMaterial({
      color: 0xb88a43,
      metalness: 0.78,
      roughness: 0.28,
    }),
    stone = new THREE.MeshStandardMaterial({
      color: 0xc8bdad,
      roughness: 0.45,
    }),
    dark = new THREE.MeshStandardMaterial({ color: 0x29251e, roughness: 0.55 }),
    white = new THREE.MeshStandardMaterial({ color: 0xece4d7, roughness: 0.8 }),
    floorMat = new THREE.MeshStandardMaterial({
      map: texture(theme === "suite" ? "wood" : "marble"),
      roughness: 0.25,
      metalness: 0.15,
    });
  const box = (w, h, d, x, y, z, mat = stone) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  const cylinder = (r1, r2, h, x, y, z, mat = gold) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 48), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const sphere = (r, x, y, z, mat = gold) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  scene.background = new THREE.Color(
    theme === "courtyard" ? 0x86bdd1 : 0xb6a592,
  );
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x75664f, 2.1));
  const sun = new THREE.DirectionalLight(0xffe5be, 3.6);
  sun.position.set(8, 15, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -20,
    right: 20,
    top: 20,
    bottom: -20,
    near: 1,
    far: 50,
  });
  sun.shadow.bias = -0.001;
  scene.add(sun);
  box(28, 0.1, 30, 0, -0.05, 0, floorMat);
  if (theme === "courtyard") {
    const green = new THREE.MeshStandardMaterial({
      color: 0x527444,
      roughness: 1,
    });
    for (const x of [-9, 9])
      for (const z of [-9, -1, 7]) {
        box(5, 0.6, 5, x, 0.3, z, dark);
        box(4.8, 0.1, 4.8, x, 0.65, z, green);
        cylinder(0.18, 0.3, 3, x, 2, z, dark);
        sphere(1.8, x, 4, z, green);
        sphere(1.4, x + 1, 4.3, z, green);
      }
    box(28, 4, 0.3, 0, 2, -14, stone);
    for (let i = 0; i < 6; i++) {
      box(2.5, 1, 1, -10 + i * 4, 1, -11, dark);
      sphere(0.65, -10 + i * 4, 2.1, -11, stone);
    }
    cylinder(3, 3, 0.4, 0, 0.2, -5, stone);
    const water = new THREE.MeshStandardMaterial({
      color: 0x459aaf,
      metalness: 0.4,
      roughness: 0.08,
    });
    cylinder(2.7, 2.7, 0.08, 0, 0.44, -5, water);
    sphere(1, 0, 2, -5, gold);
    return;
  }
  box(28, 8, 0.35, 0, 4, -14);
  box(0.35, 8, 30, -14, 4, 0);
  box(0.35, 1, 30, 14, 0.5, 0);
  box(28, 0.2, 30, 0, 8, 0, white);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x96c7d3,
    metalness: 0.35,
    roughness: 0.12,
    emissive: 0x264758,
    emissiveIntensity: 0.5,
  });
  for (let z = -11; z < 14; z += 5) {
    box(0.15, 6.4, 4.7, 13.95, 4.1, z, windowMat);
    box(0.2, 7, 0.12, 13.8, 4, z - 2.45, gold);
    box(0.2, 0.12, 4.9, 13.8, 4.2, z, gold);
  }
  for (let i = 0; i < 14; i++) {
    const h = 1 + ((i * 7) % 11) * 0.32;
    box(
      0.3,
      h,
      1,
      14.2,
      1 + h / 2,
      -13 + i * 2,
      new THREE.MeshStandardMaterial({ color: 0x809bb0, roughness: 1 }),
    );
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd29b });
  for (const x of [-12, 12]) {
    box(0.1, 0.06, 27, x, 7.7, 0, glow);
    box(0.08, 0.08, 27, x, 0.12, 0, gold);
  }
  for (const z of [-11, 0, 10]) {
    box(24, 0.06, 0.1, 0, 7.7, z, glow);
  }
  for (const x of [-9.5, 9.5])
    for (const z of [-10, -2, 7]) {
      cylinder(0.4, 0.45, 7.8, x, 4, z, stone);
      cylinder(0.56, 0.56, 0.16, x, 0.15, z, gold);
      cylinder(0.56, 0.56, 0.18, x, 7.75, z, gold);
    }
  const art = (x, z, seed) => {
    const panel = box(0.15, 3, 2.4, x, 3, z, gold);
    const mat = new THREE.MeshStandardMaterial({
      map: texture("art", seed),
      roughness: 0.85,
    });
    box(0.18, 2.7, 2.1, x + 0.1, 3, z, mat);
  };
  for (let i = 0; i < 5; i++) art(-13.7, -10 + i * 5, i + 3);
  if (theme === "suite") {
    const fabric = new THREE.MeshStandardMaterial({
      color: 0xb7a48b,
      roughness: 1,
    });
    box(
      9,
      0.04,
      12,
      0,
      0.05,
      -3,
      new THREE.MeshStandardMaterial({ color: 0x6e7778, roughness: 1 }),
    );
    box(6, 0.7, 5, 0, 0.45, -6, dark);
    box(6, 0.5, 5, 0, 1.05, -6, white);
    box(6.4, 2.5, 0.35, 0, 1.75, -8.5, fabric);
    box(6, 0.14, 3.5, 0, 1.4, -5.3, fabric);
    for (const x of [-1.65, 1.65]) {
      const pillow = box(2.4, 0.35, 1.3, x, 1.55, -7.5, white);
      pillow.rotation.x = 0.12;
    }
    for (const x of [-4.3, 4.3]) {
      box(1.4, 0.7, 1.4, x, 0.8, -7, dark);
      cylinder(0.07, 0.07, 0.9, x, 1.6, -7, gold);
      cylinder(0.55, 0.35, 0.7, x, 2.25, -7, white);
      const lamp = new THREE.PointLight(0xffbe6a, 15, 6);
      lamp.position.set(x, 2.3, -7);
      scene.add(lamp);
    }
    box(2, 0.6, 5, 9, 0.7, 2, fabric);
    box(0.3, 1.2, 5, 10, 1.1, 2, fabric);
    box(2, 1, 0.3, 9, 1, 4.5, fabric);
    box(2, 1, 0.3, 9, 1, -0.5, fabric);
    cylinder(1.2, 1.2, 0.12, 6, 0.7, 2, dark);
    cylinder(0.08, 0.08, 0.65, 6, 0.35, 2, gold);
    sphere(0.35, 6, 1.1, 2, gold);
    const backArt = box(
      4,
      2.2,
      0.18,
      0,
      4.5,
      -13.7,
      new THREE.MeshStandardMaterial({ map: texture("art", 15), roughness: 1 }),
    );
    return;
  }
  if (theme === "museum") {
    for (const x of [-11.5, 11.5]) {
      box(5, 0.2, 29, x, 4.7, 0, stone);
      box(0.13, 0.12, 29, x + (x > 0 ? -2.4 : 2.4), 5.8, 0, gold);
      for (let z = -13; z <= 13; z += 1)
        box(0.06, 1.1, 0.06, x + (x > 0 ? -2.4 : 2.4), 5.25, z, gold);
    }
    cylinder(2.5, 2.8, 0.35, 0, 0.2, -6, dark);
    cylinder(2.2, 2.3, 0.55, 0, 0.65, -6, gold);
    const center = new THREE.Vector3(0, 2.7, -6);
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.045, 10, 100),
        gold,
      );
      ring.position.copy(center);
      ring.rotation.set(i * 0.5, i * 0.75, i * 0.26);
      scene.add(ring);
    }
    sphere(0.3, 0, 2.7, -6, gold);
    cylinder(0.07, 0.07, 2, 0, 1.6, -6, gold);
  } else {
    for (let i = 0; i < 3; i++) {
      cylinder(1, 1, 1.2, -6 + i * 6, 0.6, -7, dark);
      sphere(0.9, -6 + i * 6, 2, -7, stone);
    }
  }
  for (const x of [-10, 10])
    for (const z of [-8, 1, 9]) {
      const light = new THREE.PointLight(0xffca8d, 16, 12);
      light.position.set(x, 6, z);
      scene.add(light);
    }
}
export function createViewer(
  host,
  {
    scene: definition,
    panorama,
    yaw = 0,
    pitch = 0,
    fov = 70,
    showHotspots = true,
    auto = false,
  },
  callbacks,
) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    host.innerHTML =
      '<p class="notice">WebGL unavailable. Scene editing, navigation and image tools remain available.</p>';
    return {
      dispose() {},
      update() {},
      state: () => ({ yaw: 0, pitch: 0, fov: 70 }),
      capture: () => null,
    };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x0b1c28);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 150);
  camera.position.set(0, 1.7, 5);
  const state = { yaw, pitch, fov, auto, showHotspots };
  let panoTexture = null;
  if (panorama) {
    camera.position.set(0, 0, 0);
    const geo = new THREE.SphereGeometry(50, 80, 40);
    geo.scale(-1, 1, 1);
    panoTexture = new THREE.Texture(panorama);
    panoTexture.colorSpace = THREE.SRGBColorSpace;
    panoTexture.needsUpdate = true;
    scene.add(
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: panoTexture })),
    );
  } else buildRoom(scene, definition.theme);
  const overlay = document.createElement("div");
  overlay.className = "hotspot-layer";
  host.appendChild(overlay);
  const buttons = definition.hotspots.map((h) => {
    const b = document.createElement("button");
    b.className = "hotspot " + (h.kind === "info" ? "information" : "");
    b.setAttribute("aria-label", h.label);
    b.title = h.label;
    b.textContent = h.kind === "info" ? "i" : "↗";
    b.onclick = (e) => {
      e.stopPropagation();
      callbacks.hotspot(h);
    };
    overlay.appendChild(b);
    return { h, b };
  });
  const degrees = PI / 180;
  const look = () => {
    const y = state.yaw * degrees,
      p = state.pitch * degrees;
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(
      camera.position
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(y) * Math.cos(p),
            Math.sin(p),
            -Math.cos(y) * Math.cos(p),
          ),
        ),
    );
  };
  let down = null,
    last = null,
    moved = false;
  const pointerdown = (e) => {
    down = [e.clientX, e.clientY];
    last = down;
    moved = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const pointermove = (e) => {
    if (!down) return;
    const dx = e.clientX - last[0],
      dy = e.clientY - last[1];
    state.yaw -= dx * 0.13;
    state.pitch = Math.max(-70, Math.min(70, state.pitch + dy * 0.13));
    last = [e.clientX, e.clientY];
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) moved = true;
    look();
  };
  const pointerup = (e) => {
    if (!down) return;
    if (!moved && callbacks.place) {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector3(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        0.5,
      )
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      callbacks.place({
        yaw: Math.atan2(ndc.x, -ndc.z) / degrees,
        pitch: Math.asin(ndc.y) / degrees,
      });
    }
    down = null;
    callbacks.view?.({ ...state });
  };
  const wheel = (e) => {
    e.preventDefault();
    state.fov = Math.max(35, Math.min(100, state.fov + e.deltaY * 0.03));
    look();
    callbacks.view?.({ ...state });
  };
  renderer.domElement.addEventListener("pointerdown", pointerdown);
  renderer.domElement.addEventListener("pointermove", pointermove);
  renderer.domElement.addEventListener("pointerup", pointerup);
  renderer.domElement.addEventListener("wheel", wheel, { passive: false });
  const resize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    look();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let lastFrame = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.auto && !down) {
      state.yaw += dt * 7;
      look();
    }
    buttons.forEach(({ h, b }) => {
      const y = h.yaw * degrees,
        p = h.pitch * degrees,
        v = new THREE.Vector3(
          Math.sin(y) * Math.cos(p),
          Math.sin(p),
          -Math.cos(y) * Math.cos(p),
        )
          .multiplyScalar(8)
          .add(camera.position),
        pos = v.project(camera);
      const visible =
        state.showHotspots &&
        pos.z < 1 &&
        pos.z > 0 &&
        Math.abs(pos.x) < 0.95 &&
        Math.abs(pos.y) < 0.9;
      b.hidden = !visible;
      if (visible) {
        b.style.left = (pos.x * 0.5 + 0.5) * 100 + "%";
        b.style.top = (-pos.y * 0.5 + 0.5) * 100 + "%";
      }
    });
    renderer.render(scene, camera);
  });
  return {
    state: () => ({ ...state }),
    update(next) {
      Object.assign(state, next);
      look();
    },
    capture: () => renderer.domElement.toDataURL("image/png"),
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", pointerdown);
      renderer.domElement.removeEventListener("pointermove", pointermove);
      renderer.domElement.removeEventListener("pointerup", pointerup);
      renderer.domElement.removeEventListener("wheel", wheel);
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          for (const value of Object.values(o.material))
            if (value?.isTexture) value.dispose();
          o.material.dispose();
        }
      });
      panoTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
