import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CloudNode, NetworkConnection } from '../types/cloud';

interface PlanetaryMeshCanvasProps {
  nodes: CloudNode[];
  connections: NetworkConnection[];
  selectedNodeId: string | null;
  onSelectNode: (node: CloudNode) => void;
}

// Convert Lat/Lng to 3D Sphere Vector3
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export const PlanetaryMeshCanvas: React.FC<PlanetaryMeshCanvasProps> = ({
  nodes,
  connections,
  selectedNodeId,
  onSelectNode
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const onSelectNodeRef = useRef(onSelectNode);

  nodesRef.current = nodes;
  selectedNodeIdRef.current = selectedNodeId;
  onSelectNodeRef.current = onSelectNode;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 550;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030712, 0.02);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Planetary Group
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const globeRadius = 3.6;

    // 1. Globe Core (dark obsidian sphere)
    const globeGeom = new THREE.SphereGeometry(globeRadius, 48, 48);
    const globeMat = new THREE.MeshBasicMaterial({
      color: 0x050b1a,
      wireframe: false
    });
    const globe = new THREE.Mesh(globeGeom, globeMat);
    earthGroup.add(globe);

    // 2. Holographic Latitude & Longitude Wireframe
    const wireframeGeom = new THREE.WireframeGeometry(new THREE.SphereGeometry(globeRadius + 0.02, 24, 24));
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0x1e3a8a,
      transparent: true,
      opacity: 0.35
    });
    const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat);
    earthGroup.add(wireframe);

    // 3. Atmosphere Glow Outer Shell
    const atmoGeom = new THREE.SphereGeometry(globeRadius * 1.12, 32, 32);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const atmo = new THREE.Mesh(atmoGeom, atmoMat);
    earthGroup.add(atmo);

    // 4. Dot Cloud Continents (procedural spatial dots)
    const dotCount = 2200;
    const dotGeom = new THREE.BufferGeometry();
    const dotPos = new Float32Array(dotCount * 3);
    for (let i = 0; i < dotCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = globeRadius + 0.05;
      dotPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      dotPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      dotPos[i * 3 + 2] = r * Math.cos(phi);
    }
    dotGeom.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    const dotMat = new THREE.PointsMaterial({
      size: 0.035,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55
    });
    const dotPoints = new THREE.Points(dotGeom, dotMat);
    earthGroup.add(dotPoints);

    // 5. Cloud Node Markers & Interactive Raycasting Layer
    const nodeMeshes: { id: string; mesh: THREE.Mesh; ring: THREE.Mesh }[] = [];
    const interactiveRaycastTargets: THREE.Object3D[] = [];

    nodesRef.current.forEach((node) => {
      const pos = latLngToVector3(node.lat, node.lng, globeRadius + 0.1);

      // Provider colors: GCP (Cyan), AWS (Amber), Azure (Blue), Sovereign Edge (Emerald)
      let color = 0x38bdf8;
      if (node.provider === 'AWS') color = 0xf59e0b;
      else if (node.provider === 'Azure') color = 0x60a5fa;
      else if (node.provider === 'Edge') color = 0x34d399;

      if (node.status === 'degraded' || node.status === 'failing') {
        color = 0xf43f5e;
      }

      // Center Beacon
      const beaconGeom = new THREE.SphereGeometry(0.12, 16, 16);
      const beaconMat = new THREE.MeshBasicMaterial({ color });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.copy(pos);
      beacon.userData = { nodeId: node.id };
      earthGroup.add(beacon);
      interactiveRaycastTargets.push(beacon);

      // Pulsing Base Ring
      const ringGeom = new THREE.RingGeometry(0.16, 0.24, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0); // Face outward
      earthGroup.add(ring);

      nodeMeshes.push({ id: node.id, mesh: beacon, ring });
    });

    // 6. Network Arc Lines
    const nodePositionsMap = new Map<string, THREE.Vector3>();
    nodesRef.current.forEach((n) => {
      nodePositionsMap.set(n.id, latLngToVector3(n.lat, n.lng, globeRadius + 0.1));
    });

    connections.forEach((conn) => {
      const posA = nodePositionsMap.get(conn.fromId);
      const posB = nodePositionsMap.get(conn.toId);
      if (!posA || !posB) return;

      // Arc calculation with elevation
      const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
      const distance = posA.distanceTo(posB);
      midPoint.setLength(globeRadius + 0.1 + distance * 0.22); // Arc loft height

      const curve = new THREE.QuadraticBezierCurve3(posA, midPoint, posB);
      const points = curve.getPoints(24);
      const curveGeom = new THREE.BufferGeometry().setFromPoints(points);

      const curveMat = new THREE.LineBasicMaterial({
        color: conn.active ? 0x6366f1 : 0x475569,
        transparent: true,
        opacity: conn.active ? 0.45 : 0.2
      });
      const arcLine = new THREE.Line(curveGeom, curveMat);
      earthGroup.add(arcLine);
    });

    // Mouse Interaction: Drag to Rotate & Click to Select Node
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        earthGroup.rotation.y += deltaX * 0.005;
        earthGroup.rotation.x += deltaY * 0.005;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onPointerUp = (e: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;

      // Check if this was a click rather than a large drag
      const moved = Math.hypot(e.clientX - prevMouseX, e.clientY - prevMouseY);
      if (moved < 5) {
        const rect = mount.getBoundingClientRect();
        mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouseVec, camera);

        const intersects = raycaster.intersectObjects(interactiveRaycastTargets);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const hitId = hit.userData?.nodeId;
          const found = nodesRef.current.find((n) => n.id === hitId);
          if (found) {
            onSelectNodeRef.current(found);
          }
        }
      }
    };

    mount.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    // Animation Loop
    let frameId = 0;
    const clock = new THREE.Clock();

    const tick = () => {
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Continuous subtle planetary autorotation
      if (!isDragging) {
        earthGroup.rotation.y += delta * 0.08;
      }

      // Node ring pulse animation
      nodeMeshes.forEach((item) => {
        const isSelected = item.id === selectedNodeIdRef.current;
        const scale = isSelected ? 1.4 + Math.sin(time * 6) * 0.3 : 1.0 + Math.sin(time * 3) * 0.15;
        item.ring.scale.set(scale, scale, 1);
      });

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
      mount.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [connections]);

  return (
    <div className="relative w-full h-full min-h-[520px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Subtle UI Guide */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md border border-white/10 px-3.5 py-1.5 rounded-lg text-xs text-slate-400 pointer-events-none flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400" />
        <span>Drag to rotate planet · Click any cloud node to inspect telemetry</span>
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        <span className="px-2.5 py-1 rounded bg-slate-900/90 border border-cyan-500/30 text-[11px] text-cyan-300">
          GCP Nodes
        </span>
        <span className="px-2.5 py-1 rounded bg-slate-900/90 border border-amber-500/30 text-[11px] text-amber-300">
          AWS Nodes
        </span>
        <span className="px-2.5 py-1 rounded bg-slate-900/90 border border-blue-500/30 text-[11px] text-blue-300">
          Azure Nodes
        </span>
        <span className="px-2.5 py-1 rounded bg-slate-900/90 border border-emerald-500/30 text-[11px] text-emerald-300">
          Sovereign Edge
        </span>
      </div>
    </div>
  );
};
