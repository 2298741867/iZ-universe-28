import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { audioSynth } from '../utils/audio';
import { Zap, Play, RotateCcw, Crosshair } from 'lucide-react';

interface AntigravityGameCanvasProps {
  onScoreUpdate?: (score: number, distance: number, nearMisses: number) => void;
  isFullscreen?: boolean;
}

// Pre-allocated vectors to prevent GC allocations in tick loop
const _vec3 = new THREE.Vector3();
const _pullDir = new THREE.Vector3();
const _toShip = new THREE.Vector3();
const _planeIntersect = new THREE.Vector3();
const _planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _mouse = new THREE.Vector2();

export const AntigravityGameCanvas: React.FC<AntigravityGameCanvasProps> = ({
  onScoreUpdate,
  isFullscreen = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // React state for HUD
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [shieldEnergy, setShieldEnergy] = useState(1.0);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldDepleted, setShieldDepleted] = useState(false);
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [edgeFlash, setEdgeFlash] = useState<'near-miss' | 'danger' | 'shield' | null>(null);

  // Mutable refs to decouple Three.js 60fps loop from React re-renders
  const stateRef = useRef({
    running: false,
    score: 0,
    distance: 0,
    nearMisses: 0,
    shieldEnergy: 1.0,
    shieldActive: false,
    shieldDepleted: false,
    gameTime: 0,
    difficultyTier: 1,
    scrollSpeed: 14.0,
    gravityG: 32.0,
    spawnTimer: 0,
    spawnInterval: 2.2,
    lastSurgeTime: 0,
    highScore: 0,
    cameraShake: 0
  });

  const shipTargetRef = useRef(new THREE.Vector3(0, 0, 3));
  const triggerRestartRef = useRef<() => void>(() => {});

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Detect software WebGL
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030612, 0.016);

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 150);
    const originalCameraPos = new THREE.Vector3(0, 7.5, 11);
    camera.position.copy(originalCameraPos);
    camera.lookAt(0, 0, -2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    // 2. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    keyLight.position.set(5, 15, 8);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xa855f7, 1.4);
    rimLight.position.set(-6, -5, -10);
    scene.add(rimLight);

    // 3. Procedural Starfield
    const starCount = 1400;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 80;
      starPositions[i * 3 + 1] = (Math.random() - 0.2) * 45;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;

      const r = Math.random();
      if (r < 0.4) {
        starColors[i * 3] = 0.4; starColors[i * 3 + 1] = 0.8; starColors[i * 3 + 2] = 1.0;
      } else if (r < 0.7) {
        starColors[i * 3] = 0.8; starColors[i * 3 + 1] = 0.5; starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    // 4. Warping Flight Floor Grid on Y = -2
    const gridHelper = new THREE.GridHelper(90, 45, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -2;
    if (gridHelper.material instanceof THREE.Material) {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.35;
    }
    scene.add(gridHelper);

    // 5. Composite Procedural Ship Model (6+ parts)
    const shipGroup = new THREE.Group();

    // Hull
    const fuselageGeom = new THREE.ConeGeometry(0.55, 2.2, 5);
    fuselageGeom.rotateX(Math.PI / 2);
    fuselageGeom.scale(1, 0.45, 1);
    const fuselageMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25
    });
    const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
    shipGroup.add(fuselage);

    // Cockpit
    const canopyGeom = new THREE.SphereGeometry(0.28, 16, 16);
    canopyGeom.scale(0.8, 0.55, 1.5);
    canopyGeom.translate(0, 0.15, -0.2);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.9
    });
    const canopy = new THREE.Mesh(canopyGeom, canopyMat);
    shipGroup.add(canopy);

    // Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.5);
    wingShape.lineTo(1.8, 0.6);
    wingShape.lineTo(1.6, 0.9);
    wingShape.lineTo(0, 0.3);
    wingShape.closePath();

    const extrudeSettings = { depth: 0.06, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 };
    const wingGeom = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
    wingGeom.rotateX(Math.PI / 2);
    wingGeom.center();

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.2
    });

    const rightWing = new THREE.Mesh(wingGeom, wingMat);
    rightWing.position.set(0.9, 0, 0.2);
    shipGroup.add(rightWing);

    const leftWing = new THREE.Mesh(wingGeom, wingMat);
    leftWing.position.set(-0.9, 0, 0.2);
    leftWing.scale.x = -1;
    shipGroup.add(leftWing);

    // Thruster Cones
    const thrusterGeom = new THREE.CylinderGeometry(0.14, 0.2, 0.45, 12);
    thrusterGeom.rotateX(Math.PI / 2);
    const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });

    const rThruster = new THREE.Mesh(thrusterGeom, thrusterMat);
    rThruster.position.set(0.35, 0, 1.05);
    shipGroup.add(rThruster);

    const lThruster = new THREE.Mesh(thrusterGeom, thrusterMat);
    lThruster.position.set(-0.35, 0, 1.05);
    shipGroup.add(lThruster);

    // Thruster Plumes
    const plumeGeom = new THREE.ConeGeometry(0.12, 0.9, 8);
    plumeGeom.rotateX(-Math.PI / 2);
    plumeGeom.translate(0, 0, 0.45);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });

    const rPlume = new THREE.Mesh(plumeGeom, plumeMat);
    rPlume.position.set(0.35, 0, 1.25);
    shipGroup.add(rPlume);

    const lPlume = new THREE.Mesh(plumeGeom, plumeMat);
    lPlume.position.set(-0.35, 0, 1.25);
    shipGroup.add(lPlume);

    // Antigravity Shield Sphere (radius 5.0)
    const shieldSphereGeom = new THREE.SphereGeometry(5.0, 28, 20);
    const shieldSphereMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const shieldSphere = new THREE.Mesh(shieldSphereGeom, shieldSphereMat);
    shipGroup.add(shieldSphere);

    // Inner shield glow
    const shieldAuraGeom = new THREE.SphereGeometry(1.6, 20, 16);
    const shieldAuraMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const shieldAura = new THREE.Mesh(shieldAuraGeom, shieldAuraMat);
    shipGroup.add(shieldAura);

    scene.add(shipGroup);
    shipGroup.position.set(0, 0, 3);

    // Ship Physics State
    const gravVelocity = new THREE.Vector3(0, 0, 0);

    // Gravity Wells Array
    interface WellObject {
      type: 'standard' | 'pulsing' | 'binary';
      group: THREE.Group;
      disk: THREE.Mesh;
      particles?: THREE.Points;
      core1?: THREE.Mesh;
      core2?: THREE.Mesh;
      orbitRadius?: number;
      orbitAngle?: number;
      pulsePhase?: number;
      pulseSpeed?: number;
      mass: number;
      passed: boolean;
      nearMissTriggered: boolean;
      rotationSpeed: number;
    }
    const gravityWells: WellObject[] = [];

    function createWell(type: 'standard' | 'pulsing' | 'binary', x: number, z: number): WellObject {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      if (type === 'binary') {
        const orbitRadius = 1.6;
        const coreGeom = new THREE.SphereGeometry(0.85, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

        const core1 = new THREE.Mesh(coreGeom, coreMat);
        core1.position.x = orbitRadius;
        group.add(core1);

        const core2 = new THREE.Mesh(coreGeom, coreMat);
        core2.position.x = -orbitRadius;
        group.add(core2);

        const diskGeom = new THREE.RingGeometry(0.8, 3.8, 32);
        diskGeom.rotateX(-Math.PI / 2);
        const diskMat = new THREE.MeshBasicMaterial({
          color: 0xec4899,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending
        });
        const disk = new THREE.Mesh(diskGeom, diskMat);
        group.add(disk);

        scene.add(group);
        return {
          type: 'binary',
          group,
          disk,
          core1,
          core2,
          orbitRadius,
          orbitAngle: 0,
          mass: 1.5,
          passed: false,
          nearMissTriggered: false,
          rotationSpeed: 3.0
        };
      }

      // Standard or Pulsing
      const coreGeom = new THREE.SphereGeometry(1.0, 20, 20);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const core = new THREE.Mesh(coreGeom, coreMat);
      group.add(core);

      const rimGeom = new THREE.RingGeometry(0.98, 1.08, 32);
      rimGeom.rotateX(-Math.PI / 2);
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const rim = new THREE.Mesh(rimGeom, rimMat);
      group.add(rim);

      const diskColor = type === 'pulsing' ? 0xf59e0b : 0x818cf8;
      const diskGeom = new THREE.RingGeometry(1.15, 3.4, 32);
      diskGeom.rotateX(-Math.PI / 2);
      const diskMat = new THREE.MeshBasicMaterial({
        color: diskColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      const disk = new THREE.Mesh(diskGeom, diskMat);
      group.add(disk);

      scene.add(group);
      return {
        type,
        group,
        disk,
        mass: 1.0,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 4.0,
        passed: false,
        nearMissTriggered: false,
        rotationSpeed: 2.2 + Math.random() * 1.5
      };
    }

    function spawnNextWell() {
      const spawnZ = -55.0;
      const spawnX = (Math.random() - 0.5) * 14.0;
      const curScore = stateRef.current.score;

      let type: 'standard' | 'pulsing' | 'binary' = 'standard';
      if (curScore >= 50 && Math.random() < 0.4) {
        type = 'binary';
      } else if (curScore >= 10 && Math.random() < 0.45) {
        type = 'pulsing';
      }

      const well = createWell(type, spawnX, spawnZ);
      gravityWells.push(well);
    }

    // Input Raycaster onto Y=0 Plane
    const raycaster = new THREE.Raycaster();

    const handlePointerMove = (clientX: number, clientY: number) => {
      const rect = mount.getBoundingClientRect();
      _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_mouse, camera);
      if (raycaster.ray.intersectPlane(_planeY0, _planeIntersect)) {
        shipTargetRef.current.x = THREE.MathUtils.clamp(_planeIntersect.x, -8.0, 8.0);
        shipTargetRef.current.z = THREE.MathUtils.clamp(_planeIntersect.z, -4.0, 6.0);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (stateRef.current.running) handlePointerMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (stateRef.current.running && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!stateRef.current.shieldDepleted && stateRef.current.shieldEnergy > 0) {
          stateRef.current.shieldActive = true;
          setShieldActive(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        stateRef.current.shieldActive = false;
        setShieldActive(false);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Camera Shake Trigger
    const triggerShake = (amount: number) => {
      stateRef.current.cameraShake = Math.min(stateRef.current.cameraShake + amount, 0.85);
    };

    // Restart Function
    const restart = () => {
      for (const well of gravityWells) {
        scene.remove(well.group);
      }
      gravityWells.length = 0;

      stateRef.current = {
        running: true,
        score: 0,
        distance: 0,
        nearMisses: 0,
        shieldEnergy: 1.0,
        shieldActive: false,
        shieldDepleted: false,
        gameTime: 0,
        difficultyTier: 1,
        scrollSpeed: 14.0,
        gravityG: 32.0,
        spawnTimer: 0,
        spawnInterval: 2.2,
        lastSurgeTime: 0,
        highScore: stateRef.current.highScore,
        cameraShake: 0
      };

      shipGroup.position.set(0, 0, 3);
      shipTargetRef.current.set(0, 0, 3);
      gravVelocity.set(0, 0, 0);
      shipGroup.rotation.set(0, 0, 0);

      setIsGameOver(false);
      setIsPlaying(true);
      setScore(0);
      setDistance(0);
      setNearMisses(0);
      setShieldEnergy(1.0);
      setShieldActive(false);
      setShieldDepleted(false);
      setEdgeFlash(null);

      audioSynth.init();
    };

    triggerRestartRef.current = restart;

    // Render / Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;

    const tick = () => {
      const delta = Math.min(clock.getDelta(), 0.08);
      const s = stateRef.current;

      if (!s.running) {
        // Idle ship hovering
        const time = clock.getElapsedTime();
        shipGroup.position.y = Math.sin(time * 2.0) * 0.15;
        shipGroup.rotation.z = Math.sin(time * 1.5) * 0.05;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(tick);
        return;
      }

      s.gameTime += delta;
      s.distance += (s.scrollSpeed * delta) / 100;

      // 1. Difficulty Progression: Every 15 seconds
      if (s.gameTime - s.lastSurgeTime >= 15.0) {
        s.lastSurgeTime = s.gameTime;
        s.difficultyTier += 1;
        s.gravityG *= 1.10; // +10% pull
        s.scrollSpeed *= 1.05; // +5% scroll
        s.spawnInterval = Math.max(1.1, s.spawnInterval * 0.92);

        const surgeText = `GRAVITATIONAL SURGE TIER ${s.difficultyTier}`;
        setBannerText(surgeText);
        setTimeout(() => setBannerText(null), 3000);
        audioSynth.playReroutePulse();
      }

      // 2. Shield Logic
      if (s.shieldActive) {
        s.shieldEnergy = Math.max(0, s.shieldEnergy - 0.20 * delta); // 20%/s drain
        if (s.shieldEnergy <= 0) {
          s.shieldActive = false;
          s.shieldDepleted = true;
          setShieldActive(false);
          setShieldDepleted(true);
        }
      } else {
        if (s.shieldEnergy < 1.0) {
          s.shieldEnergy = Math.min(1.0, s.shieldEnergy + 0.05 * delta); // 5%/s regen
          if (s.shieldDepleted && s.shieldEnergy >= 0.25) {
            s.shieldDepleted = false;
            setShieldDepleted(false);
          }
        }
      }

      audioSynth.setShieldHum(s.shieldActive, s.shieldEnergy);

      // Visual shield mesh updates
      if (s.shieldActive) {
        shieldSphere.material.opacity = 0.45 + Math.sin(clock.getElapsedTime() * 15.0) * 0.15;
        shieldAura.material.opacity = 0.55;
      } else {
        shieldSphere.material.opacity = 0.0;
        shieldAura.material.opacity = 0.0;
      }

      // 3. Ship Lateral Movement & Banking
      const prevX = shipGroup.position.x;
      shipGroup.position.x = THREE.MathUtils.lerp(shipGroup.position.x, shipTargetRef.current.x, 6.0 * delta);
      shipGroup.position.z = THREE.MathUtils.lerp(shipGroup.position.z, shipTargetRef.current.z, 6.0 * delta);

      const lateralVelocity = (shipGroup.position.x - prevX) / delta;
      const targetRoll = -THREE.MathUtils.clamp(lateralVelocity * 0.08, -0.65, 0.65);
      shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, targetRoll, 10.0 * delta);

      // Thruster pulse
      const tScale = 1.0 + Math.random() * 0.25;
      rPlume.scale.set(tScale, tScale, tScale);
      lPlume.scale.set(tScale, tScale, tScale);

      // 4. Background and Grid Motion
      starField.position.z += s.scrollSpeed * delta * 0.4;
      if (starField.position.z > 50) starField.position.z = 0;

      gridHelper.position.z += s.scrollSpeed * delta;
      if (gridHelper.position.z > 2) gridHelper.position.z -= 2;

      // Spawning wells
      s.spawnTimer += delta;
      if (s.spawnTimer >= s.spawnInterval) {
        s.spawnTimer = 0;
        spawnNextWell();
      }

      // 5. Gravitational Physics Computation
      const totalPull = _vec3.set(0, 0, 0);

      for (let i = gravityWells.length - 1; i >= 0; i--) {
        const well = gravityWells[i];
        well.group.position.z += s.scrollSpeed * delta;
        well.disk.rotation.z += well.rotationSpeed * delta;

        // Specialized well dynamics
        let effectiveMass = well.mass;
        if (well.type === 'pulsing' && well.pulsePhase !== undefined) {
          well.pulsePhase += (well.pulseSpeed || 4) * delta;
          const pulse = (Math.sin(well.pulsePhase) + 1) * 0.5;
          effectiveMass = well.mass * (0.6 + pulse * 1.0);
          well.disk.scale.set(1.0 + pulse * 0.35, 1.0 + pulse * 0.35, 1);
        } else if (well.type === 'binary' && well.core1 && well.core2 && well.orbitRadius) {
          well.orbitAngle = (well.orbitAngle || 0) + well.rotationSpeed * delta;
          well.core1.position.x = Math.cos(well.orbitAngle) * well.orbitRadius;
          well.core1.position.z = Math.sin(well.orbitAngle) * well.orbitRadius;
          well.core2.position.x = -Math.cos(well.orbitAngle) * well.orbitRadius;
          well.core2.position.z = -Math.sin(well.orbitAngle) * well.orbitRadius;
        }

        _toShip.subVectors(shipGroup.position, well.group.position);
        _toShip.y = 0;
        const dist = _toShip.length();

        // Repulsion vs Gravitational Pull
        if (s.shieldActive && dist <= 5.0) {
          // Repel outward
          _pullDir.subVectors(well.group.position, shipGroup.position).normalize();
          _pullDir.y = 0;
          const repelMag = (1 - dist / 5.0) * 24.0;
          well.group.position.addScaledVector(_pullDir, repelMag * delta);
        } else {
          // F = G * M / d²
          if (dist > 0.05) {
            let forceMag = (s.gravityG * effectiveMass) / (dist * dist);
            forceMag = Math.min(forceMag, 18.0); // Cap max force
            _pullDir.subVectors(well.group.position, shipGroup.position).normalize();
            totalPull.addScaledVector(_pullDir, forceMag);
          }
        }

        // Collision Check: core radius <= 1.0
        if (dist <= 1.0) {
          s.running = false;
          setIsPlaying(false);
          setIsGameOver(true);
          audioSynth.playExplosion();
          triggerShake(0.8);
          setEdgeFlash('danger');
          setTimeout(() => setEdgeFlash(null), 500);
          return;
        }

        // Near-Miss Bonus: radius <= 2.0 without collision
        if (dist <= 2.0 && !well.nearMissTriggered) {
          well.nearMissTriggered = true;
          s.score += 1;
          s.nearMisses += 1;
          audioSynth.playNearMiss();
          triggerShake(0.25);
          setEdgeFlash('near-miss');
          setTimeout(() => setEdgeFlash(null), 250);
        }

        // Well passed behind camera (Z > 12)
        if (well.group.position.z > 12.0 && !well.passed) {
          well.passed = true;
          s.score += 1;
          scene.remove(well.group);
          gravityWells.splice(i, 1);
        }
      }

      // Gravitational velocity integration & drag
      gravVelocity.addScaledVector(totalPull, delta);
      gravVelocity.multiplyScalar(Math.exp(-2.5 * delta));
      shipGroup.position.addScaledVector(gravVelocity, delta);

      // Clamp ship to spatial flight boundary
      shipGroup.position.x = THREE.MathUtils.clamp(shipGroup.position.x, -8.0, 8.0);
      shipGroup.position.z = THREE.MathUtils.clamp(shipGroup.position.z, -4.0, 6.0);

      // Camera Shake
      if (s.cameraShake > 0) {
        camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * s.cameraShake;
        camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * s.cameraShake;
        camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * s.cameraShake;
        s.cameraShake = Math.max(0, s.cameraShake - 1.8 * delta);
      } else {
        camera.position.copy(originalCameraPos);
      }

      // Periodic React HUD Sync
      setScore(s.score);
      setDistance(parseFloat(s.distance.toFixed(1)));
      setNearMisses(s.nearMisses);
      setShieldEnergy(s.shieldEnergy);

      if (onScoreUpdate) {
        onScoreUpdate(s.score, s.distance, s.nearMisses);
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    // Resize Handler
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);

      for (const well of gravityWells) {
        scene.remove(well.group);
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [onScoreUpdate]);

  const handleStartGame = useCallback(() => {
    triggerRestartRef.current();
  }, []);

  return (
    <div className={`relative w-full overflow-hidden bg-slate-950 ${isFullscreen ? 'h-screen' : 'h-[620px] rounded-2xl border border-slate-800'}`}>
      {/* Three.js Isolated Canvas Mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

      {/* Screen Edge Flash Overlay */}
      {edgeFlash === 'near-miss' && (
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_40px_rgba(52,211,153,0.7)] transition-opacity" />
      )}
      {edgeFlash === 'danger' && (
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_140px_50px_rgba(244,63,94,0.85)] transition-opacity" />
      )}

      {/* Surge Banner */}
      {bannerText && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-slate-900/90 border border-sky-400/50 text-sky-400 px-6 py-2 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg shadow-sky-500/20 backdrop-blur-sm">
            {bannerText}
          </div>
        </div>
      )}

      {/* HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between z-20">
        {/* Top HUD Metrics Bar */}
        <div className="flex justify-between items-start gap-4">
          <div className="flex gap-3">
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 min-w-[100px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Wells Evaded</div>
              <div className="text-2xl font-bold font-mono-num text-white leading-tight">{score}</div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 min-w-[100px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distance</div>
              <div className="text-2xl font-bold font-mono-num text-white leading-tight">
                {distance.toFixed(1)}<span className="text-xs text-slate-500 font-sans ml-1">AU</span>
              </div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 min-w-[100px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Near Misses</div>
              <div className="text-2xl font-bold font-mono-num text-emerald-400 leading-tight">{nearMisses}</div>
            </div>
          </div>

          {/* Antigravity Shield Gauge */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 min-w-[220px]">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Antigravity Shield</span>
              <span className={`text-xs font-bold font-mono-num ${shieldDepleted ? 'text-rose-400' : 'text-indigo-400'}`}>
                {Math.round(shieldEnergy * 100)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-indigo-500/30">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  shieldDepleted
                    ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                    : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 shadow-[0_0_12px_rgba(99,102,241,0.7)]'
                }`}
                style={{ width: `${shieldEnergy * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Hint / Controls */}
        <div className="flex justify-between items-end">
          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400 bg-slate-900/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl pointer-events-auto">
            <span><strong className="text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">Mouse / Touch</strong> Steer</span>
            <span><strong className="text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">Spacebar</strong> Antigravity Repel (Radius 5)</span>
          </div>

          {/* Mobile Tap-and-Hold Button */}
          <button
            onMouseDown={() => {
              if (!shieldDepleted && shieldEnergy > 0) {
                stateRef.current.shieldActive = true;
                setShieldActive(true);
              }
            }}
            onMouseUp={() => {
              stateRef.current.shieldActive = false;
              setShieldActive(false);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              if (!shieldDepleted && shieldEnergy > 0) {
                stateRef.current.shieldActive = true;
                setShieldActive(true);
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stateRef.current.shieldActive = false;
              setShieldActive(false);
            }}
            className={`pointer-events-auto sm:hidden w-16 h-16 rounded-full flex items-center justify-center text-xs font-bold uppercase tracking-wider text-white border-2 transition-all ${
              shieldActive
                ? 'bg-cyan-500 border-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.9)] scale-95'
                : 'bg-indigo-600/90 border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.6)]'
            }`}
          >
            Shield
          </button>
        </div>
      </div>

      {/* Start / Intro Screen */}
      {!isPlaying && !isGameOver && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-30 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900/95 border border-sky-500/30 rounded-2xl p-8 text-center shadow-2xl shadow-sky-500/10">
            <h2 className="text-3xl font-black font-display tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 mb-2 uppercase">
              Antigravity
            </h2>
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              Pilot an experimental neon starcraft through endless procedural gravity wells.
              Activate your antigravity repulsion shield to defy catastrophic spatial collapse.
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-6 text-xs">
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="font-bold text-sky-400 mb-1 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Raycast Steering</span>
                </div>
                <div className="text-slate-400">Cursor projects onto flight plane; craft banks laterally with momentum.</div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="font-bold text-indigo-400 mb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Antigravity Repel</span>
                </div>
                <div className="text-slate-400">Hold Spacebar to repel wells within radius 5.0. Drains 20%/s, regens 5%/s.</div>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>ENGAGE ENGINES</span>
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {isGameOver && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-30 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-8 text-center shadow-2xl shadow-rose-500/20">
            <h3 className="text-2xl font-extrabold font-display tracking-wider text-rose-500 mb-1 uppercase">
              Singularity Collapse
            </h3>
            <p className="text-xs text-slate-400 mb-6">Your craft crossed the event horizon and collapsed.</p>

            <div className="grid grid-cols-2 gap-3 text-left mb-6">
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Wells Evaded</div>
                <div className="text-2xl font-bold font-mono-num text-white">{score}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Distance</div>
                <div className="text-2xl font-bold font-mono-num text-white">
                  {distance.toFixed(1)}<span className="text-xs font-sans text-slate-400 ml-1">AU</span>
                </div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Near Misses</div>
                <div className="text-2xl font-bold font-mono-num text-emerald-400">{nearMisses}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Surge Tier</div>
                <div className="text-2xl font-bold font-mono-num text-sky-400">T-{stateRef.current.difficultyTier}</div>
              </div>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RELAUNCH SPACECRAFT</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
