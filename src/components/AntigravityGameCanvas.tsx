import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { audioSynth } from '../utils/audio';
import { polluxVoice } from '../services/voiceAssistant';
import {
  Zap,
  Play,
  RotateCcw,
  Crosshair,
  Volume2,
  Target,
  Award,
  ArrowRight,
  X,
  VolumeX,
  Sliders,
  HardDrive,
  Mic,
  MicOff,
  HelpCircle,
  Radio
} from 'lucide-react';

interface AntigravityGameCanvasProps {
  onScoreUpdate?: (score: number, distance: number, nearMisses: number) => void;
  isFullscreen?: boolean;
  onOpenCopilot?: () => void;
  onSaveToDrive?: () => void;
}

// Scratch math helpers outside the animation loop to ensure 0 GC allocations
const _vec3 = new THREE.Vector3();
const _pullDir = new THREE.Vector3();
const _toShip = new THREE.Vector3();
const _planeIntersect = new THREE.Vector3();
const _planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _mouse = new THREE.Vector2();

interface LaserBolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  alive: boolean;
  life: number;
}

interface ExplosionDebris {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

interface WellObject {
  id: string;
  type: 'standard' | 'pulsing' | 'binary' | 'tutorial_target';
  group: THREE.Group;
  core: THREE.Mesh;
  disk: THREE.Mesh;
  particles?: THREE.Points;
  core1?: THREE.Mesh;
  core2?: THREE.Mesh;
  orbitRadius?: number;
  orbitAngle?: number;
  pulsePhase?: number;
  pulseSpeed?: number;
  mass: number;
  health: number;
  maxHealth: number;
  passed: boolean;
  nearMissTriggered: boolean;
  rotationSpeed: number;
}

export const AntigravityGameCanvas: React.FC<AntigravityGameCanvasProps> = ({
  onScoreUpdate,
  isFullscreen = false,
  onOpenCopilot,
  onSaveToDrive
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
  const [edgeFlash, setEdgeFlash] = useState<'near-miss' | 'danger' | 'shield' | 'laser' | null>(null);

  // Audio settings panel
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [masterVol, setMasterVol] = useState(0.8);
  const [musicVol, setMusicVol] = useState(0.55);
  const [sfxVol, setSfxVol] = useState(0.75);

  // Tutorial state
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [tutorialProgress, setTutorialProgress] = useState(0);

  // Voice Comms state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [polluxVoiceReply, setPolluxVoiceReply] = useState<string | null>(null);
  const [voiceBadge, setVoiceBadge] = useState<string | null>(null);
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);

  const handleToggleVoice = useCallback(() => {
    const isNowActive = polluxVoice.toggleComms();
    setIsVoiceActive(isNowActive);
    if (!isNowActive) {
      setVoiceTranscript('');
      setPolluxVoiceReply(null);
      setVoiceBadge(null);
    }
  }, []);

  // Mutable refs for 60fps loop
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
    cameraShake: 0,
    // Tutorial tracking
    isTutorial: false,
    tutorialStep: 1,
    tutorialProgress: 0,
    tutorialTargetsDestroyed: 0,
    steerLeftDone: false,
    steerRightDone: false,
    shieldHoldTime: 0
  });

  const shipTargetRef = useRef(new THREE.Vector3(0, 0, 3));
  const fireLaserRef = useRef<() => void>(() => {});
  const triggerRestartRef = useRef<(isTut?: boolean) => void>(() => {});

  // Wire Voice System with game state & speech events
  useEffect(() => {
    polluxVoice.setTelemetryProvider(() => ({
      score: stateRef.current.score,
      distance: stateRef.current.distance,
      nearMisses: stateRef.current.nearMisses,
      shieldEnergy: stateRef.current.shieldEnergy,
      speed: stateRef.current.scrollSpeed,
      difficultyTier: stateRef.current.difficultyTier,
      isGameOver: !stateRef.current.running
    }));

    polluxVoice.setActionHandlers({
      onFireLasers: () => {
        fireLaserRef.current();
      },
      onTriggerShield: (active: boolean) => {
        if (active) {
          if (!stateRef.current.shieldDepleted && stateRef.current.shieldEnergy > 0) {
            stateRef.current.shieldActive = true;
            setShieldActive(true);
          }
        } else {
          stateRef.current.shieldActive = false;
          setShieldActive(false);
        }
      },
      onRelaunchGame: () => {
        triggerRestartRef.current(false);
      },
      onSaveToDrive: () => {
        if (onSaveToDrive) onSaveToDrive();
      },
      onToggleAudio: () => {
        audioSynth.toggle();
      }
    });

    const unsubListening = polluxVoice.onListeningChange((listening) => {
      setIsVoiceActive(listening);
    });

    const unsubSpeaking = polluxVoice.onSpeakingChange((speaking) => {
      setIsVoiceSpeaking(speaking);
    });

    const unsubTranscript = polluxVoice.onTranscript((text) => {
      setVoiceTranscript(text);
    });

    const unsubReply = polluxVoice.onPolluxReply((reply, badge) => {
      setPolluxVoiceReply(reply);
      if (badge) setVoiceBadge(badge);
      // Auto clear reply banner after 8s
      setTimeout(() => {
        setPolluxVoiceReply((prev) => (prev === reply ? null : prev));
        setVoiceBadge((prev) => (prev === badge ? null : prev));
      }, 8000);
    });

    return () => {
      unsubListening();
      unsubSpeaking();
      unsubTranscript();
      unsubReply();
    };
  }, [onSaveToDrive]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

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
    renderer.toneMappingExposure = 1.25;
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
    const starCount = 1500;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 90;
      starPositions[i * 3 + 1] = (Math.random() - 0.2) * 45;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;

      const r = Math.random();
      if (r < 0.45) {
        starColors[i * 3] = 0.4; starColors[i * 3 + 1] = 0.8; starColors[i * 3 + 2] = 1.0;
      } else if (r < 0.75) {
        starColors[i * 3] = 0.8; starColors[i * 3 + 1] = 0.45; starColors[i * 3 + 2] = 1.0;
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

    // 5. Composite Procedural Ship Model (8 distinct parts)
    const shipGroup = new THREE.Group();

    // Hull (Fuselage)
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

    // Aerodynamic Wings
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

    // Dual Plasma Blaster Cannons mounted on wingtips
    const blasterGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8);
    blasterGeom.rotateX(Math.PI / 2);
    const blasterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.6,
      metalness: 0.9
    });

    const rBlaster = new THREE.Mesh(blasterGeom, blasterMat);
    rBlaster.position.set(1.4, 0, -0.2);
    shipGroup.add(rBlaster);

    const lBlaster = new THREE.Mesh(blasterGeom, blasterMat);
    lBlaster.position.set(-1.4, 0, -0.2);
    shipGroup.add(lBlaster);

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

    // Physics State
    const gravVelocity = new THREE.Vector3(0, 0, 0);

    // Lasers and Explosions
    const activeLasers: LaserBolt[] = [];
    const activeExplosions: ExplosionDebris[] = [];
    const gravityWells: WellObject[] = [];

    // Laser Factory
    const laserGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8);
    laserGeom.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      blending: THREE.AdditiveBlending
    });

    const fireLasers = () => {
      if (!stateRef.current.running) return;

      audioSynth.playLaserShot();
      setEdgeFlash('laser');
      setTimeout(() => setEdgeFlash(null), 80);

      // Create twin laser bolts from left and right blasters
      [-1.4, 1.4].forEach((xOffset) => {
        const mesh = new THREE.Mesh(laserGeom, laserMat);
        mesh.position.set(shipGroup.position.x + xOffset, shipGroup.position.y, shipGroup.position.z - 0.8);
        scene.add(mesh);

        activeLasers.push({
          mesh,
          velocity: new THREE.Vector3(0, 0, -48.0), // Fast projectile speed
          alive: true,
          life: 0
        });
      });

      // Tutorial Step 4 progression check
      if (stateRef.current.isTutorial && stateRef.current.tutorialStep === 4) {
        stateRef.current.tutorialProgress = Math.min(100, stateRef.current.tutorialProgress + 15);
        setTutorialProgress(stateRef.current.tutorialProgress);
      }
    };

    fireLaserRef.current = fireLasers;

    // Explosion Particle Factory
    function createExplosion(pos: THREE.Vector3, colorHex: number = 0x38bdf8) {
      const pCount = 60;
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(pCount * 3);
      const velocities = new Float32Array(pCount * 3);

      for (let i = 0; i < pCount; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = 4.0 + Math.random() * 9.0;

        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[i * 3 + 1] = Math.cos(phi) * speed * 0.4;
        velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      }

      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.28,
        color: colorHex,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
      });

      const points = new THREE.Points(geom, mat);
      scene.add(points);

      activeExplosions.push({
        points,
        velocities,
        life: 0,
        maxLife: 0.65
      });
    }

    // Well Creation
    function createWell(type: 'standard' | 'pulsing' | 'binary' | 'tutorial_target', x: number, z: number): WellObject {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const wellId = 'well_' + Math.random().toString(36).substring(2, 9);

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
          id: wellId,
          type: 'binary',
          group,
          core: core1,
          disk,
          core1,
          core2,
          orbitRadius,
          orbitAngle: 0,
          mass: 1.5,
          health: 5,
          maxHealth: 5,
          passed: false,
          nearMissTriggered: false,
          rotationSpeed: 3.0
        };
      }

      // Standard / Pulsing / Tutorial Target
      const coreRadius = type === 'tutorial_target' ? 1.2 : 1.0;
      const coreGeom = new THREE.SphereGeometry(coreRadius, 20, 20);
      const coreColor = type === 'tutorial_target' ? 0x064e3b : 0x000000;
      const coreMat = new THREE.MeshBasicMaterial({ color: coreColor });
      const core = new THREE.Mesh(coreGeom, coreMat);
      group.add(core);

      const rimGeom = new THREE.RingGeometry(coreRadius - 0.02, coreRadius + 0.1, 32);
      rimGeom.rotateX(-Math.PI / 2);
      const rimColor = type === 'tutorial_target' ? 0x10b981 : 0xf43f5e;
      const rimMat = new THREE.MeshBasicMaterial({
        color: rimColor,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const rim = new THREE.Mesh(rimGeom, rimMat);
      group.add(rim);

      let diskColor = 0x818cf8;
      if (type === 'pulsing') diskColor = 0xf59e0b;
      if (type === 'tutorial_target') diskColor = 0x34d399;

      const diskGeom = new THREE.RingGeometry(coreRadius + 0.15, coreRadius + 2.4, 32);
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
        id: wellId,
        type,
        group,
        core,
        disk,
        mass: type === 'tutorial_target' ? 0.7 : 1.0,
        health: type === 'pulsing' ? 4 : (type === 'tutorial_target' ? 2 : 3),
        maxHealth: type === 'pulsing' ? 4 : (type === 'tutorial_target' ? 2 : 3),
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

        // Tutorial Step 1 Steering verification
        if (stateRef.current.isTutorial && stateRef.current.tutorialStep === 1) {
          if (shipTargetRef.current.x < -3.0) stateRef.current.steerLeftDone = true;
          if (shipTargetRef.current.x > 3.0) stateRef.current.steerRightDone = true;

          let prog = 0;
          if (stateRef.current.steerLeftDone) prog += 50;
          if (stateRef.current.steerRightDone) prog += 50;
          stateRef.current.tutorialProgress = prog;
          setTutorialProgress(prog);

          if (prog >= 100) {
            audioSynth.playStepChime();
            stateRef.current.tutorialStep = 2;
            stateRef.current.tutorialProgress = 0;
            setTutorialStep(2);
            setTutorialProgress(0);
            // Spawn a tutorial well straight ahead
            gravityWells.push(createWell('standard', 0, -45.0));
          }
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (stateRef.current.running) handlePointerMove(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!stateRef.current.running) return;
      if (e.button === 0) { // Left click to shoot
        fireLasers();
      }
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
      if (e.code === 'KeyF' || e.code === 'KeyZ') {
        fireLasers();
      }
      if (e.code === 'KeyV' && !e.repeat) {
        handleToggleVoice();
      }
      if (e.code === 'KeyM') {
        audioSynth.toggle();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        stateRef.current.shieldActive = false;
        setShieldActive(false);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Restart / Start Game Function
    const restart = (isTut: boolean = false) => {
      for (const well of gravityWells) scene.remove(well.group);
      gravityWells.length = 0;
      for (const laser of activeLasers) scene.remove(laser.mesh);
      activeLasers.length = 0;
      for (const exp of activeExplosions) scene.remove(exp.points);
      activeExplosions.length = 0;

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
        scrollSpeed: isTut ? 10.0 : 14.0,
        gravityG: isTut ? 20.0 : 32.0,
        spawnTimer: 0,
        spawnInterval: 2.2,
        lastSurgeTime: 0,
        highScore: stateRef.current.highScore,
        cameraShake: 0,
        isTutorial: isTut,
        tutorialStep: 1,
        tutorialProgress: 0,
        tutorialTargetsDestroyed: 0,
        steerLeftDone: false,
        steerRightDone: false,
        shieldHoldTime: 0
      };

      shipGroup.position.set(0, 0, 3);
      shipTargetRef.current.set(0, 0, 3);
      gravVelocity.set(0, 0, 0);
      shipGroup.rotation.set(0, 0, 0);

      setIsGameOver(false);
      setIsPlaying(true);
      setIsTutorialActive(isTut);
      setTutorialStep(1);
      setTutorialProgress(0);
      setScore(0);
      setDistance(0);
      setNearMisses(0);
      setShieldEnergy(1.0);
      setShieldActive(false);
      setShieldDepleted(false);
      setEdgeFlash(null);

      audioSynth.init();

      if (isTut) {
        audioSynth.playStepChime();
      }
    };

    triggerRestartRef.current = restart;

    // Render Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;

    const tick = () => {
      const delta = Math.min(clock.getDelta(), 0.08);
      const s = stateRef.current;

      if (!s.running) {
        // Idle floating
        const time = clock.getElapsedTime();
        shipGroup.position.y = Math.sin(time * 2.0) * 0.15;
        shipGroup.rotation.z = Math.sin(time * 1.5) * 0.05;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(tick);
        return;
      }

      s.gameTime += delta;
      s.distance += (s.scrollSpeed * delta) / 100;

      // 1. Difficulty Curve (Every 15s in regular play)
      if (!s.isTutorial && s.gameTime - s.lastSurgeTime >= 15.0) {
        s.lastSurgeTime = s.gameTime;
        s.difficultyTier += 1;
        s.gravityG *= 1.10;
        s.scrollSpeed *= 1.05;
        s.spawnInterval = Math.max(1.1, s.spawnInterval * 0.92);

        const surgeText = `GRAVITATIONAL SURGE TIER ${s.difficultyTier}`;
        setBannerText(surgeText);
        setTimeout(() => setBannerText(null), 3000);
        audioSynth.playReroutePulse();
      }

      // 2. Shield Dynamics
      if (s.shieldActive) {
        s.shieldEnergy = Math.max(0, s.shieldEnergy - 0.20 * delta); // 20%/s drain
        if (s.shieldEnergy <= 0) {
          s.shieldActive = false;
          s.shieldDepleted = true;
          setShieldActive(false);
          setShieldDepleted(true);
          audioSynth.playShieldDepleted();
        }

        // Tutorial Step 3: Shield holding check
        if (s.isTutorial && s.tutorialStep === 3) {
          s.shieldHoldTime += delta;
          const prog = Math.min(100, Math.round((s.shieldHoldTime / 2.0) * 100));
          s.tutorialProgress = prog;
          setTutorialProgress(prog);

          if (prog >= 100) {
            audioSynth.playStepChime();
            s.tutorialStep = 4;
            s.tutorialProgress = 0;
            setTutorialStep(4);
            setTutorialProgress(0);
            // Spawn 2 tutorial shootable target planets ahead!
            gravityWells.push(createWell('tutorial_target', -3.5, -45.0));
            gravityWells.push(createWell('tutorial_target', 3.5, -55.0));
          }
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

      // Shield 3D Mesh
      if (s.shieldActive) {
        shieldSphere.material.opacity = 0.45 + Math.sin(clock.getElapsedTime() * 15.0) * 0.15;
        shieldAura.material.opacity = 0.55;
      } else {
        shieldSphere.material.opacity = 0.0;
        shieldAura.material.opacity = 0.0;
      }

      // 3. Ship Lateral Movement & Aerodynamic Banking
      const prevX = shipGroup.position.x;
      shipGroup.position.x = THREE.MathUtils.lerp(shipGroup.position.x, shipTargetRef.current.x, 6.0 * delta);
      shipGroup.position.z = THREE.MathUtils.lerp(shipGroup.position.z, shipTargetRef.current.z, 6.0 * delta);

      const lateralVelocity = (shipGroup.position.x - prevX) / delta;
      const targetRoll = -THREE.MathUtils.clamp(lateralVelocity * 0.08, -0.65, 0.65);
      shipGroup.rotation.z = THREE.MathUtils.lerp(shipGroup.rotation.z, targetRoll, 10.0 * delta);

      // Dynamic Audio for Ship Acceleration & Banking
      audioSynth.updateShipAudio(s.scrollSpeed, lateralVelocity);

      // Thruster pulse
      const tScale = 1.0 + Math.random() * 0.25;
      rPlume.scale.set(tScale, tScale, tScale);
      lPlume.scale.set(tScale, tScale, tScale);

      // 4. Background and Grid Motion
      starField.position.z += s.scrollSpeed * delta * 0.4;
      if (starField.position.z > 50) starField.position.z = 0;

      gridHelper.position.z += s.scrollSpeed * delta;
      if (gridHelper.position.z > 2) gridHelper.position.z -= 2;

      // Spawning wells (in non-tutorial mode)
      if (!s.isTutorial) {
        s.spawnTimer += delta;
        if (s.spawnTimer >= s.spawnInterval) {
          s.spawnTimer = 0;
          spawnNextWell();
        }
      }

      // 5. Update Lasers & Planet Collisions
      for (let i = activeLasers.length - 1; i >= 0; i--) {
        const laser = activeLasers[i];
        laser.mesh.position.addScaledVector(laser.velocity, delta);
        laser.life += delta;

        // Check laser collision with gravity wells / planetary cores
        let hit = false;
        for (let j = gravityWells.length - 1; j >= 0; j--) {
          const well = gravityWells[j];
          const distToLaser = laser.mesh.position.distanceTo(well.group.position);

          if (distToLaser <= 2.2) { // Laser hit target
            hit = true;
            well.health -= 1;
            audioSynth.playPlanetHit();

            // Flash accretion disk white briefly
            const diskMat = well.disk.material as THREE.MeshBasicMaterial;
            const origColor = diskMat.color ? diskMat.color.getHex() : 0x818cf8;
            if (diskMat.color) diskMat.color.setHex(0xffffff);
            setTimeout(() => {
              if (well.disk && (well.disk.material as THREE.MeshBasicMaterial).color) {
                (well.disk.material as THREE.MeshBasicMaterial).color.setHex(origColor);
              }
            }, 60);

            // Destroyed planet / well
            if (well.health <= 0) {
              audioSynth.playPlanetExplosion();
              createExplosion(well.group.position, origColor);
              s.score += 5; // Extra points for shooting planet!
              s.cameraShake = Math.min(s.cameraShake + 0.35, 0.7);

              // Tutorial Target destroyed check
              if (s.isTutorial && s.tutorialStep === 4) {
                s.tutorialTargetsDestroyed += 1;
                s.tutorialProgress = Math.min(100, s.tutorialTargetsDestroyed * 50);
                setTutorialProgress(s.tutorialProgress);

                if (s.tutorialTargetsDestroyed >= 2) {
                  audioSynth.playStepChime();
                  s.tutorialStep = 5;
                  setTutorialStep(5);
                }
              }

              scene.remove(well.group);
              gravityWells.splice(j, 1);
            }
            break;
          }
        }

        // Remove laser if hit or expired
        if (hit || laser.life > 1.2 || laser.mesh.position.z < -65) {
          scene.remove(laser.mesh);
          activeLasers.splice(i, 1);
        }
      }

      // Update Explosions
      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const exp = activeExplosions[i];
        exp.life += delta;
        const positions = exp.points.geometry.attributes.position.array as Float32Array;

        for (let j = 0; j < exp.velocities.length / 3; j++) {
          positions[j * 3] += exp.velocities[j * 3] * delta;
          positions[j * 3 + 1] += exp.velocities[j * 3 + 1] * delta;
          positions[j * 3 + 2] += exp.velocities[j * 3 + 2] * delta;
        }
        exp.points.geometry.attributes.position.needsUpdate = true;
        (exp.points.material as THREE.PointsMaterial).opacity = 1 - (exp.life / exp.maxLife);

        if (exp.life >= exp.maxLife) {
          scene.remove(exp.points);
          activeExplosions.splice(i, 1);
        }
      }

      // 6. Gravitational Physics Computation
      const totalPull = _vec3.set(0, 0, 0);
      let closestWellDist = 999.0;

      for (let i = gravityWells.length - 1; i >= 0; i--) {
        const well = gravityWells[i];
        well.group.position.z += s.scrollSpeed * delta;
        well.disk.rotation.z += well.rotationSpeed * delta;

        // Dynamics for pulsing or binary
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
        if (dist < closestWellDist) closestWellDist = dist;

        // Antigravity Repulsion vs Gravitational Pull
        if (s.shieldActive && dist <= 5.0) {
          _pullDir.subVectors(well.group.position, shipGroup.position).normalize();
          _pullDir.y = 0;
          const repelMag = (1 - dist / 5.0) * 24.0;
          well.group.position.addScaledVector(_pullDir, repelMag * delta);
        } else {
          if (dist > 0.05) {
            let forceMag = (s.gravityG * effectiveMass) / (dist * dist);
            forceMag = Math.min(forceMag, 18.0);
            _pullDir.subVectors(well.group.position, shipGroup.position).normalize();
            totalPull.addScaledVector(_pullDir, forceMag);
          }
        }

        // Collision Check: core radius <= 1.0
        if (dist <= 1.0 && !s.isTutorial) {
          s.running = false;
          setIsPlaying(false);
          setIsGameOver(true);
          audioSynth.playExplosion();
          s.cameraShake = 0.8;
          setEdgeFlash('danger');
          setTimeout(() => setEdgeFlash(null), 500);
          return;
        }

        // Tutorial Step 2: near-miss or dodge verification
        if (s.isTutorial && s.tutorialStep === 2) {
          if (dist <= 3.5) {
            s.tutorialProgress = Math.min(100, s.tutorialProgress + 35 * delta);
            setTutorialProgress(Math.round(s.tutorialProgress));
          }
        }

        // Near-Miss Bonus (radius <= 2.0 without collision)
        if (dist <= 2.0 && !well.nearMissTriggered) {
          well.nearMissTriggered = true;
          s.score += 1;
          s.nearMisses += 1;
          audioSynth.playNearMiss();
          s.cameraShake = 0.25;
          setEdgeFlash('near-miss');
          setTimeout(() => setEdgeFlash(null), 250);

          if (s.isTutorial && s.tutorialStep === 2) {
            audioSynth.playStepChime();
            s.tutorialStep = 3;
            s.tutorialProgress = 0;
            setTutorialStep(3);
            setTutorialProgress(0);
            // Spawn another well nearby for shield practice
            gravityWells.push(createWell('standard', 0.5, -35.0));
          }
        }

        // Passed behind camera
        if (well.group.position.z > 12.0 && !well.passed) {
          well.passed = true;
          s.score += 1;
          scene.remove(well.group);
          gravityWells.splice(i, 1);

          if (s.isTutorial && s.tutorialStep === 2) {
            audioSynth.playStepChime();
            s.tutorialStep = 3;
            s.tutorialProgress = 0;
            setTutorialStep(3);
            setTutorialProgress(0);
            gravityWells.push(createWell('standard', 0.5, -35.0));
          }
        }
      }

      // Update low-frequency cosmic gravitational pull audio
      audioSynth.updateGravityPullAudio(closestWellDist);

      // Gravitational velocity integration
      gravVelocity.addScaledVector(totalPull, delta);
      gravVelocity.multiplyScalar(Math.exp(-2.5 * delta));
      shipGroup.position.addScaledVector(gravVelocity, delta);

      // Clamp ship bounds
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
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', handleResize);

      for (const well of gravityWells) scene.remove(well.group);
      for (const laser of activeLasers) scene.remove(laser.mesh);
      for (const exp of activeExplosions) scene.remove(exp.points);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [onScoreUpdate]);

  const handleStartGame = useCallback((isTutorial: boolean = false) => {
    triggerRestartRef.current(isTutorial);
  }, []);

  const handleSkipTutorial = useCallback(() => {
    triggerRestartRef.current(false);
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
      {edgeFlash === 'laser' && (
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_60px_10px_rgba(56,189,248,0.3)] transition-opacity duration-75" />
      )}

      {/* Surge Banner */}
      {bannerText && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-slate-900/90 border border-sky-400/50 text-sky-400 px-6 py-2 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg shadow-sky-500/20 backdrop-blur-sm">
            {bannerText}
          </div>
        </div>
      )}

      {/* Primary HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none p-5 flex flex-col justify-between z-20">
        {/* Top HUD Metrics Bar */}
        <div className="flex justify-between items-start gap-4">
          <div className="flex gap-2.5">
            <div className="bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2 min-w-[95px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Score</div>
              <div className="text-2xl font-bold font-mono-num text-white leading-tight">{score}</div>
            </div>

            <div className="bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2 min-w-[95px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distance</div>
              <div className="text-2xl font-bold font-mono-num text-white leading-tight">
                {distance.toFixed(1)}<span className="text-xs text-slate-500 font-sans ml-1">AU</span>
              </div>
            </div>

            <div className="bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2 min-w-[95px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Near Misses</div>
              <div className="text-2xl font-bold font-mono-num text-emerald-400 leading-tight">{nearMisses}</div>
            </div>
          </div>

          {/* Right Top Action & Shield Cluster */}
          <div className="flex items-center gap-2.5">
            {/* Audio Settings Button */}
            <button
              onClick={() => setShowAudioSettings(!showAudioSettings)}
              className="pointer-events-auto p-2 rounded-xl bg-slate-900/85 border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors shadow-md cursor-pointer"
              title="Sound & Music Settings"
            >
              <Sliders className="w-4 h-4 text-cyan-400" />
            </button>

            {/* In-Flight Voice Comms Toggle Button */}
            <button
              onClick={handleToggleVoice}
              className={`pointer-events-auto px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                isVoiceActive
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-cyan-500/30'
                  : 'bg-slate-900/85 border-white/10 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
              title={isVoiceActive ? 'Voice Comms: ACTIVE (Press V to mute)' : 'Enable In-Flight Voice Comms (Press V)'}
            >
              {isVoiceActive ? (
                <div className="relative">
                  <Mic className={`w-3.5 h-3.5 ${isVoiceSpeaking ? 'text-indigo-400' : 'text-cyan-400'} animate-pulse`} />
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
              ) : (
                <MicOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="hidden sm:inline font-mono">{isVoiceActive ? 'VOICE: ON [V]' : 'VOICE [V]'}</span>
            </button>

            {/* Pollux AI Copilot Button */}
            {onOpenCopilot && (
              <button
                onClick={onOpenCopilot}
                className="pointer-events-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 border border-cyan-400/40 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-500/20 hover:from-cyan-500 hover:to-indigo-500 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-200" />
                <span className="hidden sm:inline">POLLUX AI</span>
              </button>
            )}

            {/* Antigravity Shield Gauge */}
            <div className="bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-1.5 min-w-[170px] sm:min-w-[200px]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Shield</span>
                <span className={`text-xs font-bold font-mono-num ${shieldDepleted ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {Math.round(shieldEnergy * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-indigo-500/30">
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
        </div>

        {/* In-Flight Cockpit Voice Comms Overlay */}
        {isVoiceActive && (
          <div className="self-center bg-slate-950/90 border border-cyan-500/50 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md max-w-xl w-full flex items-center justify-between gap-3 pointer-events-auto transition-all animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center shrink-0">
                <Mic className={`w-4 h-4 ${isVoiceSpeaking ? 'text-indigo-400' : 'text-cyan-400'} animate-pulse`} />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>

              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400 font-display">
                    POLLUX COMMS LINK
                  </span>
                  {voiceBadge && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {voiceBadge}
                    </span>
                  )}
                  {isVoiceSpeaking ? (
                    <span className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 animate-pulse">
                      <Radio className="w-3 h-3 animate-spin" />
                      <span>SPEAKING...</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-mono">LISTENING</span>
                  )}
                </div>
                <div className="text-xs text-white truncate font-medium">
                  {polluxVoiceReply ? (
                    <span className="text-cyan-200">Pollux: "{polluxVoiceReply}"</span>
                  ) : voiceTranscript ? (
                    <span className="text-slate-300 italic">Pilot: "{voiceTranscript}"</span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">
                      Say <strong className="text-cyan-300">"Fire"</strong>, <strong className="text-cyan-300">"Shield"</strong>, <strong className="text-cyan-300">"Status report"</strong>, or ask tactical questions
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowVoiceHelp(true)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Voice Commands List"
              >
                <HelpCircle className="w-4 h-4 text-cyan-400" />
              </button>
              <button
                onClick={handleToggleVoice}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                title="Mute Comms"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tutorial Active Overlay Banner */}
        {isTutorialActive && (
          <div className="self-center bg-slate-950/90 border border-cyan-500/40 rounded-2xl p-4 max-w-xl w-full shadow-2xl backdrop-blur-md pointer-events-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-950 text-cyan-400 border border-cyan-700">
                  Tutorial Step {tutorialStep} / 4
                </span>
                <span className="text-xs font-bold text-white">
                  {tutorialStep === 1 && "Steering & Banking"}
                  {tutorialStep === 2 && "Gravity Well Evasion"}
                  {tutorialStep === 3 && "Antigravity Repulsion Shield"}
                  {tutorialStep === 4 && "Plasma Blaster Weapons"}
                  {tutorialStep === 5 && "Flight Certification Complete"}
                </span>
              </div>
              <button
                onClick={handleSkipTutorial}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                Skip Tutorial
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              {tutorialStep === 1 && "Move your mouse or drag touch left and right. Notice the aerodynamic lateral roll of your starcraft."}
              {tutorialStep === 2 && "A gravity well is drifting toward you! Keep away from its fatal core (radius 1.0) to gain near-miss bonuses."}
              {tutorialStep === 3 && "Hold Spacebar (or touch Shield button) to activate your antigravity repulsion field and push wells outward!"}
              {tutorialStep === 4 && "Click Left Mouse (or press F / tap FIRE button) to shoot plasma lasers at the incoming target planet cores!"}
              {tutorialStep === 5 && "Outstanding piloting! All flight systems and weaponry are certified. Ready to enter deep space?"}
            </p>

            {tutorialStep < 5 ? (
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-150"
                  style={{ width: `${tutorialProgress}%` }}
                />
              </div>
            ) : (
              <button
                onClick={() => handleStartGame(false)}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>ENGAGE FREE FLIGHT</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="flex justify-between items-end">
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 bg-slate-900/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl pointer-events-auto">
            <span><strong className="text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">Mouse / Touch</strong> Steer</span>
            <span><strong className="text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">Left Click / F</strong> Shoot</span>
            <span><strong className="text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/15">Spacebar</strong> Shield</span>
            <span><strong className="text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-700">V</strong> Voice Comms</span>
          </div>

          {/* Mobile On-Screen Action Buttons */}
          <div className="flex sm:hidden gap-2.5 pointer-events-auto">
            <button
              onClick={handleToggleVoice}
              className={`w-13 h-13 rounded-full border-2 flex items-center justify-center text-xs font-bold shadow-lg transition-all ${
                isVoiceActive
                  ? 'bg-cyan-500 border-cyan-300 text-slate-950 shadow-cyan-500/50 scale-95'
                  : 'bg-slate-900/90 border-slate-700 text-slate-400'
              }`}
              title="Voice Comms"
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              onClick={() => fireLaserRef.current()}
              className="w-13 h-13 rounded-full bg-cyan-500/90 border-2 border-cyan-300 text-slate-950 font-bold text-xs uppercase shadow-lg shadow-cyan-500/40 flex items-center justify-center active:scale-90 transition-all"
            >
              FIRE
            </button>

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
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xs font-bold uppercase tracking-wider text-white border-2 transition-all ${
                shieldActive
                  ? 'bg-indigo-500 border-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.9)] scale-95'
                  : 'bg-indigo-600/90 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.6)]'
              }`}
            >
              SHIELD
            </button>
          </div>
        </div>
      </div>

      {/* Audio & Synthwave Settings Modal Drawer */}
      {showAudioSettings && (
        <div className="absolute top-20 right-6 z-40 w-72 bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
            <h4 className="text-xs font-bold text-white flex items-center gap-2 font-display uppercase tracking-wider">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sound & Music Engine</span>
            </h4>
            <button
              onClick={() => setShowAudioSettings(false)}
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Master Volume</span>
                <span className="font-mono-num">{Math.round(masterVol * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={masterVol}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMasterVol(val);
                  audioSynth.setMasterVolume(val);
                }}
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Synthwave BGM</span>
                <span className="font-mono-num">{Math.round(musicVol * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVol}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMusicVol(val);
                  audioSynth.setMusicVolume(val);
                }}
                className="w-full accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Combat & Physics SFX</span>
                <span className="font-mono-num">{Math.round(sfxVol * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sfxVol}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setSfxVol(val);
                  audioSynth.setSfxVolume(val);
                }}
                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Start / Intro Screen */}
      {!isPlaying && !isGameOver && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-30 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-900/95 border border-sky-500/30 rounded-2xl p-8 text-center shadow-2xl shadow-sky-500/10">
            <h2 className="text-3xl font-black font-display tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 mb-2 uppercase">
              Antigravity
            </h2>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Navigate an experimental neon starcraft through procedural gravity wells.
              Activate your antigravity shield to repel vortexes or blast planetary cores with plasma lasers.
            </p>

            <div className="grid grid-cols-2 gap-3 text-left mb-6 text-xs">
              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="font-bold text-sky-400 mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  <span>Shoot Planets / Wells</span>
                </div>
                <div className="text-slate-400">Left-Click or F key fires dual plasma bolts to disintegrate cores.</div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 p-3 rounded-xl">
                <div className="font-bold text-indigo-400 mb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Antigravity Repel</span>
                </div>
                <div className="text-slate-400">Spacebar repels wells in radius 5. Drains 20%/s, regens 5%/s.</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleStartGame(true)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>FLIGHT TUTORIAL</span>
              </button>

              <button
                onClick={() => handleStartGame(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>ENGAGE FREE FLIGHT</span>
              </button>
            </div>
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

            <div className="flex gap-3">
              <button
                onClick={() => handleStartGame(true)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Award className="w-4 h-4" />
                <span>TUTORIAL</span>
              </button>

              <button
                onClick={() => handleStartGame(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RELAUNCH</span>
              </button>
            </div>

            {onSaveToDrive && (
              <button
                onClick={onSaveToDrive}
                className="w-full mt-3 py-2.5 px-4 rounded-xl font-bold text-xs text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-cyan-950"
              >
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>SAVE FLIGHT TELEMETRY TO GOOGLE DRIVE</span>
              </button>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-cyan-400/80 font-mono flex items-center justify-center gap-2">
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              <span>Voice commands active: Say "Relaunch" or "Save to Drive"</span>
            </div>
          </div>
        </div>
      )}

      {/* Voice Commands Guide Modal */}
      {showVoiceHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-700 text-cyan-300">
                  <Mic className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base font-display">Pollux Voice Commands</h3>
                  <div className="text-[11px] text-slate-400">Hands-Free Flight Copilot Controls (Press V to toggle)</div>
                </div>
              </div>
              <button
                onClick={() => setShowVoiceHelp(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">"Fire" / "Shoot"</span>
                <span className="text-slate-300">Fires dual plasma blasters instantly at incoming wells.</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">"Shield" / "Repel"</span>
                <span className="text-slate-300">Engages your antigravity repulsion shield (say "Shield Down" to drop).</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">"Status Report"</span>
                <span className="text-slate-300">Pollux speaks your shields, distance, near misses, and tier aloud.</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">"Relaunch" / "Restart"</span>
                <span className="text-slate-300">Relaunches the AGP-1 starcraft without touching the mouse.</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">"Save to Drive"</span>
                <span className="text-slate-300">Exports your live flight telemetry to your Google Drive account.</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-start gap-3">
                <span className="font-mono text-cyan-400 font-bold shrink-0">Tactical Questions</span>
                <span className="text-slate-300">Ask "What are binary wells?", "Optimal flight speed?", and Pollux speaks back!</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  handleToggleVoice();
                  setShowVoiceHelp(false);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isVoiceActive
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold'
                }`}
              >
                {isVoiceActive ? 'Mute Voice Comms' : 'Enable Voice Comms Now'}
              </button>

              <button
                onClick={() => setShowVoiceHelp(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
