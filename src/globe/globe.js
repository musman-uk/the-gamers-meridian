import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

import earthAtmosUrl from './textures/earth_atmos.jpg';
import earthNormalUrl from './textures/earth_normal.jpg';
import earthSpecularUrl from './textures/earth_specular.jpg';
import earthCloudsUrl from './textures/earth_clouds.png';

let scene, camera, renderer, controls;
let globeMesh, cloudMesh;
const pinObjects = [];
let locationsData = [];

let lastUserInteraction = 0;
let pointerDownPos = { x: 0, y: 0 };
let isModalOpenState = false;

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
  
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.001);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  const aspect = window.innerWidth / window.innerHeight;
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  const fillGlow = new THREE.PointLight(0x38bdf8, 0.8, 400);
  fillGlow.position.set(-150, -100, -150);
  scene.add(fillGlow);

  createStarfield();

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
  scene.add(globeMesh);

  const cloudGeo = new THREE.SphereGeometry(80.8, 64, 64);
  const cloudMat = new THREE.MeshPhongMaterial({
    map: cloudMap,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  scene.add(cloudMesh);

  createAtmosphereGlow();
  buildPins(onSelectLocation);

  window.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
    recordInteraction(e);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.buttons > 0) recordInteraction(e);
  });
  window.addEventListener('resize', onResize);

  animate();

  return {
    flyToAndOpenLocation,
    setModalState: (open) => { isModalOpenState = open; }
  };
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
        gl_FragColor = vec4(0.3, 0.65, 1.0, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true
  });
  scene.add(new THREE.Mesh(geometry, material));
}

function createStarfield() {
  const geometry = new THREE.BufferGeometry();
  const count = 1800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 900;
    positions[i + 1] = (Math.random() - 0.5) * 900;
    positions[i + 2] = (Math.random() - 0.5) * 900;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ size: 1.2, color: 0x38bdf8, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(geometry, material));
}

function buildPins(onSelectLocation) {
  const container = document.getElementById('markers-container');
  const gemGeo = new THREE.OctahedronGeometry(1.6, 0);

  locationsData.forEach(loc => {
    const pos = latLngToVector3(loc.coordinates.lat, loc.coordinates.lng, 84.0);
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
      flyToAndOpenLocation(loc.id, null, onSelectLocation);
    };

    elem.innerHTML = `
      <div class="micro-badge">
        <span class="w-2 h-2 rounded-full shrink-0 shadow-sm" style="background-color: ${loc.color}"></span>
        <span class="text-[11px] font-bold font-postcard-type tracking-tight text-slate-900">${loc.city}</span>
      </div>
      <div class="w-0.5 h-2 bg-amber-200 mx-auto opacity-75"></div>
    `;

    container.appendChild(elem);
    loc.domElement = elem;
  });
}

export function flyToAndOpenLocation(locId, subId = null, callback = null) {
  const loc = locationsData.find(l => l.id === locId);
  if (!loc || !loc.pinMesh) return;

  lastUserInteraction = Date.now();
  const targetWorldPos = new THREE.Vector3();
  loc.pinMesh.getWorldPosition(targetWorldPos);
  
  const aspect = window.innerWidth / window.innerHeight;
  const baseDist = 150;
  const targetDist = aspect < 1 ? baseDist / aspect : baseDist;
  const targetCamPos = targetWorldPos.clone().normalize().multiplyScalar(targetDist);

  controls.enabled = false;

  gsap.timeline({
    onComplete: () => {
      controls.enabled = true;
      if (callback) callback(loc, subId);
    }
  })
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
  const tempV = new THREE.Vector3();
  const visiblePositions = [];

  locationsData.forEach(loc => {
    if (!loc.pinMesh || !loc.domElement) return;

    loc.pinMesh.getWorldPosition(tempV);
    const pinNormal = tempV.clone().normalize();
    const cameraDir = camera.position.clone().normalize();
    const dot = pinNormal.dot(cameraDir);

    const opacity = Math.max(0, Math.min(1, (dot - 0.01) * 6));
    if (dot < 0.01) {
      loc.domElement.style.display = 'none';
      return;
    }

    tempV.project(camera);
    let x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-(tempV.y * 0.5) + 0.5) * window.innerHeight;
    visiblePositions.push({ loc, x, y, opacity });
  });

  for (let i = 0; i < visiblePositions.length; i++) {
    for (let j = i + 1; j < visiblePositions.length; j++) {
      const p1 = visiblePositions[i];
      const p2 = visiblePositions[j];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 32 && dist > 0) {
        const overlap = (32 - dist) / 2;
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
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.position.setLength(aspect < 1 ? 220 / aspect : 220);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();

  if (!isModalOpenState && (Date.now() - lastUserInteraction > 4000)) {
    if (globeMesh) globeMesh.rotation.y += 0.0008;
    if (cloudMesh) cloudMesh.rotation.y += 0.0012;
  }

  locationsData.forEach(loc => {
    if (loc.pinMesh) {
      loc.pinMesh.rotation.y += 0.02;
      const bob = Math.sin(elapsedTime * 2.5 + loc.pinMesh.userData.offset) * 0.8;
      const basePos = loc.pinMesh.userData.basePos;
      const norm = basePos.clone().normalize();
      loc.pinMesh.position.copy(basePos).addScaledVector(norm, bob);
    }
  });

  controls.update();
  updateScreenBadges();
  renderer.render(scene, camera);
}
