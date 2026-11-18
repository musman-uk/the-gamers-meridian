import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

import earthAtmosUrl from './textures/earth_atmos.jpg';
import earthNormalUrl from './textures/earth_normal.jpg';
import earthSpecularUrl from './textures/earth_specular.jpg';
import earthCloudsUrl from './textures/earth_clouds.png';

let scene, camera, renderer, controls;
let earthTiltGroup, globeMesh, cloudMesh, sunLight, ambientLight;
const pinObjects = [];
let locationsData = [];

let lastUserInteraction = 0;
let pointerDownPos = { x: 0, y: 0 };
let activePointerId = null;
let isModalOpenState = false;
let globeMode = 'drift'; // 'drift' (Classic) | 'realtime' (Live)
let lastSolarUpdate = 0;

// -PI / 2 rotates Longitude 0° (London / Prime Meridian) directly toward +Z (front camera)
const UK_CENTER_ROTATION_Y = -Math.PI / 2;
const CLASSIC_TILT_RAD = THREE.MathUtils.degToRad(-23.44);

const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function getLiveSolarPosition(radius = 260) {
  const now = new Date();
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear;
  const dayOfYear = Math.floor(diff / 86400000);

  const declination = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));

  const utcHours =
    now.getUTCHours() +
    now.getUTCMinutes() / 60 +
    now.getUTCSeconds() / 3600;
  let subsolarLng = (12 - utcHours) * 15;
  if (subsolarLng > 180) subsolarLng -= 360;
  if (subsolarLng < -180) subsolarLng += 360;

  return {
    vector: latLngToVector3(declination, subsolarLng, radius),
    declination,
    subsolarLng
  };
}

function applySolarLighting() {
  if (!sunLight || !ambientLight) return null;

  // Balanced ratio: crisp orbital daylight + legible nocturnal continents
  sunLight.intensity = 2.0;
  ambientLight.intensity = 0.65;

  if (globeMode === 'realtime') {
    const solar = getLiveSolarPosition(260);
    // Align the sun to the classic 23.44° tilt plane facing the front noon meridian (+Z),
    // shifted slightly north/south by the live seasonal declination
    const decRad = THREE.MathUtils.degToRad(solar.declination);
    const sunDir = new THREE.Vector3(
      -Math.sin(CLASSIC_TILT_RAD) * Math.sin(decRad),
      Math.cos(CLASSIC_TILT_RAD) * Math.sin(decRad),
      Math.cos(decRad)
    ).normalize().multiplyScalar(260);

    sunLight.position.copy(sunDir);
    return solar;
  } else {
    // Classic: place the sun perpendicular to Earth's 23.44° tilted axis
    const sunX = Math.cos(CLASSIC_TILT_RAD) * 260;
    const sunY = Math.sin(CLASSIC_TILT_RAD) * 260;
    sunLight.position.set(sunX, sunY, 60);
    return null;
  }
}

function isPointerOverGlobe(event) {
  if (!globeMesh || !camera) return false;
  mouseVector.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseVector.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseVector, camera);
  return raycaster.intersectObject(globeMesh).length > 0;
}

function recordInteraction(e) {
  if (!e || isPointerOverGlobe(e)) {
    lastUserInteraction = Date.now();
  }
}

export function initGlobe(locations, onSelectLocation) {
  locationsData = locations;

  const container = document.getElementById('webgl-container');
  container.innerHTML = '';

  const markersContainer = document.getElementById('markers-container');
  if (markersContainer) markersContainer.innerHTML = '';

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.001);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  camera.position.set(0, 0, aspect < 1 ? 220 / aspect : 220);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 115;
  controls.maxDistance = 420;
  controls.rotateSpeed = 0.8;
  controls.mouseButtons.RIGHT = null;

  // Lighter cool slate fill ensures all night-side continents & coastlines stay clearly visible
  ambientLight = new THREE.AmbientLight(0x64748b, 0.65);
  scene.add(ambientLight);

  // Pure orbital white sunlight
  sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  scene.add(sunLight);

  applySolarLighting();

  const fillGlow = new THREE.PointLight(0xd4af37, 0.45, 420);
  fillGlow.position.set(-150, -100, -150);
  scene.add(fillGlow);

  createStarfield();

  // Fixed desk-globe axial tilt (23.44° bottom-left to top-right)
  earthTiltGroup = new THREE.Group();
  earthTiltGroup.rotation.z = CLASSIC_TILT_RAD;
  scene.add(earthTiltGroup);

  const textureLoader = new THREE.TextureLoader();
  const earthMap = textureLoader.load(earthAtmosUrl);
  const specularMap = textureLoader.load(earthSpecularUrl);
  const normalMap = textureLoader.load(earthNormalUrl);
  const cloudMap = textureLoader.load(earthCloudsUrl);

  const earthGeo = new THREE.SphereGeometry(80, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthMap,
    normalMap: normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    specularMap: specularMap,
    specular: new THREE.Color(0x333333),
    shininess: 15
  });
  globeMesh = new THREE.Mesh(earthGeo, earthMat);
  globeMesh.rotation.y = UK_CENTER_ROTATION_Y;
  earthTiltGroup.add(globeMesh);

  createMeridianRing();

  const cloudGeo = new THREE.SphereGeometry(80.8, 64, 64);
  const cloudMat = new THREE.MeshPhongMaterial({
    map: cloudMap,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.rotation.y = UK_CENTER_ROTATION_Y;
  earthTiltGroup.add(cloudMesh);

  createAtmosphereGlow();
  buildPins(onSelectLocation);

  window.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) {
      activePointerId = e.pointerId;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }
    recordInteraction(e);
  });

  window.addEventListener('pointermove', (e) => {
    if (e.buttons > 0) recordInteraction(e);
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === activePointerId) {
      activePointerId = null;
    }
  });

  window.addEventListener('resize', onResize);

  animate();

  return {
    flyToAndOpenLocation,
    setModalState: (open) => {
      isModalOpenState = open;
      // Gently pull back to full-globe distance when closing a card, keeping the current region & classic tilt centered
      if (!open && camera && controls) {
        const aspect = window.innerWidth / window.innerHeight;
        const homeDist = aspect < 1 ? 220 / aspect : 220;
        const currentDir = camera.position.clone().normalize();

        gsap.killTweensOf([camera.position]);
        camera.up.set(0, 1, 0);

        gsap.to(camera.position, {
          x: currentDir.x * homeDist,
          y: currentDir.y * homeDist,
          z: currentDir.z * homeDist,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => controls.update()
        });
      }
    },
    setGlobeMode,
    setPinVisibility
  };
}

export function setGlobeMode(mode) {
  globeMode = mode === 'realtime' ? 'realtime' : 'drift';
  const solar = applySolarLighting();
  lastSolarUpdate = Date.now();

  if (!globeMesh || !camera || !controls || !earthTiltGroup) return;

  gsap.killTweensOf([camera.position, controls.target, globeMesh.rotation, cloudMesh.rotation]);
  controls.enabled = true;
  camera.up.set(0, 1, 0);

  const aspect = window.innerWidth / window.innerHeight;
  const homeDist = aspect < 1 ? 220 / aspect : 220;

  if (globeMode === 'realtime' && solar) {
    // Rotate the globe around its tilted polar axis so the live subsolar meridian faces +Z
    const rawTargetRotY = -Math.PI / 2 - THREE.MathUtils.degToRad(solar.subsolarLng);
    const currentRotY = globeMesh.rotation.y;
    const shortestDeltaY = Math.atan2(Math.sin(rawTargetRotY - currentRotY), Math.cos(rawTargetRotY - currentRotY));
    const finalGlobeRotY = currentRotY + shortestDeltaY;

    const subsolarPos = latLngToVector3(solar.declination * 0.65, solar.subsolarLng, 84.0);
    subsolarPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), finalGlobeRotY);
    subsolarPos.applyAxisAngle(new THREE.Vector3(0, 0, 1), CLASSIC_TILT_RAD);
    const noonCamPos = subsolarPos.normalize().multiplyScalar(homeDist);

    gsap.to(globeMesh.rotation, {
      y: finalGlobeRotY,
      duration: 1.2,
      ease: 'power2.inOut'
    });

    gsap.to(cloudMesh.rotation, {
      y: finalGlobeRotY,
      duration: 1.2,
      ease: 'power2.inOut'
    });

    gsap.to(camera.position, {
      x: noonCamPos.x,
      y: noonCamPos.y,
      z: noonCamPos.z,
      duration: 1.35,
      ease: 'power2.inOut',
      onUpdate: () => controls.update()
    });

    gsap.to(controls.target, {
      x: 0,
      y: 0,
      z: 0,
      duration: 1.35,
      ease: 'power2.inOut'
    });
  } else {
    // Return to UK & Europe centered with classic 23.44° desk-globe tilt
    const currentRotY = globeMesh.rotation.y;
    const shortestDeltaY = Math.atan2(Math.sin(UK_CENTER_ROTATION_Y - currentRotY), Math.cos(UK_CENTER_ROTATION_Y - currentRotY));
    const finalUkRotY = currentRotY + shortestDeltaY;

    gsap.to(globeMesh.rotation, {
      y: finalUkRotY,
      duration: 1.2,
      ease: 'power2.inOut'
    });

    gsap.to(cloudMesh.rotation, {
      y: finalUkRotY,
      duration: 1.2,
      ease: 'power2.inOut'
    });

    gsap.to(camera.position, {
      x: 0,
      y: 0,
      z: homeDist,
      duration: 1.35,
      ease: 'power2.inOut',
      onUpdate: () => controls.update()
    });

    gsap.to(controls.target, {
      x: 0,
      y: 0,
      z: 0,
      duration: 1.35,
      ease: 'power2.inOut'
    });
  }
}

export function setPinVisibility(locId, visible) {
  const loc = locationsData.find(l => l.id === locId);
  if (!loc) return;
  loc.isPinVisible = visible;
  if (loc.pinMesh) loc.pinMesh.visible = visible;
  if (loc.domElement) {
    loc.domElement.classList.toggle('is-hidden-pin', !visible);
  }
}

function createMeridianRing() {
  const points = [];
  const radius = 80.2;
  const segments = 256;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = -radius * Math.sin(angle);
    const y = radius * Math.cos(angle);
    points.push(new THREE.Vector3(x, y, 0));
  }

  const curve = new THREE.CatmullRomCurve3(points, true);
  const geometry = new THREE.TubeGeometry(curve, 256, 0.14, 6, true);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd4af37,
    transparent: true,
    opacity: 0.72
  });

  globeMesh.add(new THREE.Mesh(geometry, material));
}

function createAtmosphereGlow() {
  const geometry = new THREE.SphereGeometry(88, 64, 64);
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(0.35, 0.62, 0.96, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true
  });
  scene.add(new THREE.Mesh(geometry, material));
}

function createStarfield() {
  // Crisp bright core with a tight, subtle halo so they read as sharp pinpoints
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 32;
  starCanvas.height = 32;
  const ctx = starCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const starTexture = new THREE.CanvasTexture(starCanvas);
  const starPalette = [
    new THREE.Color(0xffffff), // Pure white
    new THREE.Color(0xffffff), // Pure white (weighted higher)
    new THREE.Color(0xdbeafe), // Cool blue-white
    new THREE.Color(0xfef3c7)  // Subtle warm gold
  ];

  const buildStarLayer = (count, size, opacity) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = 460 + Math.random() * 290;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      const tint = starPalette[Math.floor(Math.random() * starPalette.length)];
      colors[i3] = tint.r;
      colors[i3 + 1] = tint.g;
      colors[i3 + 2] = tint.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size,
      map: starTexture,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false // Prevents space fog from dimming distant stars
    });

    scene.add(new THREE.Points(geometry, material));
  };

  buildStarLayer(1500, 2.2, 0.85); // Fine distant starfield
  buildStarLayer(350, 3.8, 0.98);  // Brighter primary stars
}

function buildPins(onSelectLocation) {
  const container = document.getElementById('markers-container');
  const gemGeo = new THREE.OctahedronGeometry(1.6, 0);

  locationsData.forEach(loc => {
    loc.isPinVisible = true;
    const pos = latLngToVector3(loc.coordinates.lat, loc.coordinates.lng, 81.5);
    const gemMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(loc.color),
      emissive: new THREE.Color(loc.color),
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8
    });

    const pinMesh = new THREE.Mesh(gemGeo, gemMat);
    pinMesh.position.copy(pos);
    pinMesh.userData = { basePos: pos.clone(), offset: Math.random() * 10 };

    globeMesh.add(pinMesh);
    loc.pinMesh = pinMesh;
    pinObjects.push(pinMesh);

    const elem = document.createElement('div');
    elem.id = `marker-${loc.id}`;
    elem.className = 'absolute city-pin-overlay pointer-events-auto cursor-pointer flex flex-col items-center group';

    elem.onclick = (e) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 20) return;
      const defaultSubId = loc.isRegion && loc.subLocations?.length ? loc.subLocations[0].id : null;
      flyToAndOpenLocation(loc.id, defaultSubId, onSelectLocation);
    };

    elem.innerHTML = `
      <div class="micro-badge">
        <span class="w-2 h-2 rounded-full shrink-0 shadow-sm" style="background-color: ${loc.color}"></span>
        <span class="text-[11px] font-bold font-postcard-type tracking-tight text-stone-900">${loc.city}</span>
      </div>
      <div class="w-0.5 h-2 bg-amber-300/80 mx-auto"></div>
    `;

    container.appendChild(elem);
    loc.domElement = elem;
  });
}

export function flyToAndOpenLocation(locId, subId = null, callback = null) {
  const loc = locationsData.find(l => l.id === locId);
  if (!loc || !loc.pinMesh) return;

  if (loc.isPinVisible === false) {
    setPinVisibility(loc.id, true);
  }

  gsap.killTweensOf([camera.position, controls.target, globeMesh.rotation, cloudMesh.rotation]);
  lastUserInteraction = Date.now();

  const effectiveSubId = subId || (loc.isRegion && loc.subLocations?.length ? loc.subLocations[0].id : null);
  const subLoc = effectiveSubId && loc.subLocations
    ? loc.subLocations.find(s => s.id === effectiveSubId)
    : null;

  const targetCoords = (subLoc && subLoc.coordinates) ? subLoc.coordinates : loc.coordinates;

  // 1. Rotate Earth around its tilted polar axis so targetCoords.lng faces directly forward (+Z)
  const rawTargetRotY = -Math.PI / 2 - THREE.MathUtils.degToRad(targetCoords.lng);
  const currentRotY = globeMesh.rotation.y;
  const shortestDeltaY = Math.atan2(Math.sin(rawTargetRotY - currentRotY), Math.cos(rawTargetRotY - currentRotY));
  const finalGlobeRotY = currentRotY + shortestDeltaY;

  // 2. Compute the pin's exact world position once globeMesh.rotation.y = finalGlobeRotY
  const localPinPos = latLngToVector3(targetCoords.lat, targetCoords.lng, 84.0);
  localPinPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), finalGlobeRotY);
  localPinPos.applyAxisAngle(new THREE.Vector3(0, 0, 1), CLASSIC_TILT_RAD);

  const aspect = window.innerWidth / window.innerHeight;
  const targetDist = Math.min(controls.maxDistance, Math.max(controls.minDistance, aspect < 1 ? 150 / aspect : 150));
  const targetCamPos = localPinPos.clone().normalize().multiplyScalar(targetDist);

  camera.up.set(0, 1, 0);
  controls.enabled = false;

  gsap.timeline({
    onComplete: () => {
      controls.enabled = true;
      if (callback) callback(loc, effectiveSubId);
    }
  })
  .to(globeMesh.rotation, {
    y: finalGlobeRotY,
    duration: 1.6,
    ease: 'power2.inOut'
  }, 0)
  .to(cloudMesh.rotation, {
    y: finalGlobeRotY,
    duration: 1.6,
    ease: 'power2.inOut'
  }, 0)
  .to(camera.position, {
    x: targetCamPos.x,
    y: targetCamPos.y,
    z: targetCamPos.z,
    duration: 1.6,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  }, 0)
  .to(controls.target, { x: 0, y: 0, z: 0, duration: 1.6, ease: 'power2.inOut' }, 0);
}

function updateScreenBadges() {
  if (globeMesh) globeMesh.updateWorldMatrix(true, false);
  const tempV = new THREE.Vector3();
  const visiblePositions = [];

  locationsData.forEach(loc => {
    if (!loc.pinMesh || !loc.domElement || loc.isPinVisible === false) return;

    tempV.copy(loc.pinMesh.userData.basePos);
    globeMesh.localToWorld(tempV);

    const pinNormal = tempV.clone().normalize();
    const cameraDir = camera.position.clone().normalize();
    const dot = pinNormal.dot(cameraDir);

    const opacity = Math.max(0, Math.min(1, (dot - 0.01) * 6));
    if (dot < 0.01) {
      loc.domElement.style.display = 'none';
      return;
    }

    tempV.project(camera);
    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(tempV.y * 0.5) + 0.5) * window.innerHeight;
    visiblePositions.push({ loc, x, y, opacity });
  });

  for (let i = 0; i < visiblePositions.length; i++) {
    for (let j = i + 1; j < visiblePositions.length; j++) {
      const p1 = visiblePositions[i];
      const p2 = visiblePositions[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 14 && dist > 0) {
        const overlap = (14 - dist) / 2;
        p1.x -= (dx / dist) * overlap;
        p1.y -= (dy / dist) * overlap;
        p2.x += (dx / dist) * overlap;
        p2.y += (dy / dist) * overlap;
      }
    }
  }

  visiblePositions.forEach(({ loc, x, y, opacity }) => {
    loc.domElement.style.display = 'flex';
    loc.domElement.style.opacity = opacity;
    loc.domElement.style.transform = `translate3d(-50%, -100%, 0) translate3d(${x}px, ${y}px, 0)`;
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  const currentDist = Math.min(controls.maxDistance, Math.max(controls.minDistance, camera.position.length()));
  camera.position.setLength(currentDist);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();

  if (globeMode === 'drift') {
    if (!isModalOpenState && (Date.now() - lastUserInteraction > 4000)) {
      if (globeMesh) globeMesh.rotation.y += 0.0008;
      if (cloudMesh) cloudMesh.rotation.y += 0.0012;
    }
  } else {
    if (cloudMesh) cloudMesh.rotation.y += 0.00035;
    if (Date.now() - lastSolarUpdate > 15000) {
      applySolarLighting();
      lastSolarUpdate = Date.now();
    }
  }

  locationsData.forEach(loc => {
    if (loc.pinMesh && loc.pinMesh.visible) {
      loc.pinMesh.rotation.y += 0.015;
      // Subtle hover (±0.12 units) right above the cloud layer
      const bob = Math.sin(elapsedTime * 1.8 + loc.pinMesh.userData.offset) * 0.12;
      const basePos = loc.pinMesh.userData.basePos;
      const norm = basePos.clone().normalize();
      loc.pinMesh.position.copy(basePos).addScaledVector(norm, bob);
    }
  });

  controls.update();
  updateScreenBadges();
  renderer.render(scene, camera);
}
