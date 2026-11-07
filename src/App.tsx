import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { AntigravityGameCanvas } from './components/AntigravityGameCanvas';
import { PlanetaryMeshCanvas } from './components/PlanetaryMeshCanvas';
import { CloudNodeInspector } from './components/CloudNodeInspector';
import { AnomalySimulator } from './components/AnomalySimulator';
import { StandaloneGameModal } from './components/StandaloneGameModal';
import { PolluxCopilotModal } from './components/PolluxCopilotModal';
import { GoogleDriveWorkspace } from './components/GoogleDriveWorkspace';
import { INITIAL_CLOUD_NODES, INITIAL_NETWORK_CONNECTIONS } from './data/mockCloudMesh';
import { CloudNode } from './types/cloud';
import { audioSynth } from './utils/audio';
import { Rocket, Globe, Shield, Activity, Download, ChevronUp, ChevronDown, Bot, Music, Crosshair, Award, HardDrive } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'flight' | 'planetary' | 'telemetry' | 'drive' | 'export'>('flight');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cloudNodes, setCloudNodes] = useState<CloudNode[]>(INITIAL_CLOUD_NODES);
  const [selectedNode, setSelectedNode] = useState<CloudNode | null>(INITIAL_CLOUD_NODES[0]);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Live flight telemetry for Pollux AI Copilot
  const [telemetry, setTelemetry] = useState({
    score: 0,
    distance: 0,
    nearMisses: 0,
    shieldEnergy: 1.0,
    difficultyTier: 1,
    speed: 14.0
  });

  const handleScoreUpdate = (score: number, distance: number, nearMisses: number) => {
    setTelemetry((prev) => ({
      ...prev,
      score,
      distance,
      nearMisses
    }));
  };

  // Audio Toggle
  const handleToggleAudio = () => {
    const isNowOn = audioSynth.toggle();
    setAudioEnabled(isNowOn);
  };

  // Node Actions
  const handleSelectNode = (node: CloudNode) => {
    setSelectedNode(node);
    audioSynth.playNearMiss();
  };

  const handleActivateRepulsion = (nodeId: string) => {
    audioSynth.playReroutePulse();
    setCloudNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              repulsionShieldActive: !n.repulsionShieldActive,
              gravitonFieldStrength: 100,
              status: 'healthy',
              latencyMs: Math.max(8, n.latencyMs - 6)
            }
          : n
      )
    );
  };

  const handleInduceFailure = (nodeId: string) => {
    audioSynth.playExplosion();
    setCloudNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              status: 'failing',
              latencyMs: n.latencyMs * 4,
              gravitonFieldStrength: 22,
              repulsionShieldActive: false
            }
          : n
      )
    );
  };

  const handleRestoreNode = (nodeId: string) => {
    audioSynth.playNearMiss();
    setCloudNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              status: 'healthy',
              latencyMs: Math.round(n.latencyMs / 4),
              gravitonFieldStrength: 95
            }
          : n
      )
    );
  };

  const handleTriggerGlobalRebalance = () => {
    setCloudNodes((prev) =>
      prev.map((n) => ({
        ...n,
        status: 'healthy',
        gravitonFieldStrength: 98,
        repulsionShieldActive: true,
        latencyMs: Math.min(n.latencyMs, 25)
      }))
    );
  };

  const handleSimulateOutage = (nodeId: string) => {
    handleInduceFailure(nodeId);
    const target = cloudNodes.find((n) => n.id === nodeId);
    if (target) setSelectedNode(target);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Bar Navigation */}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        audioEnabled={audioEnabled}
        onToggleAudio={handleToggleAudio}
        onTriggerFlight={() => setActiveTab('flight')}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 pb-32">
        {/* Mode Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('flight')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'flight'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>3D Flight Simulator</span>
            </button>

            <button
              onClick={() => setActiveTab('planetary')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'planetary'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Planetary Multi-Cloud Mesh</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Graviton Telemetry</span>
            </button>

            <button
              onClick={() => setActiveTab('drive')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'drive'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Google Drive App</span>
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Standalone HTML5 Game</span>
            </button>
          </div>

          {/* Quick Copilot Launcher in Header */}
          <button
            onClick={() => setIsCopilotOpen(true)}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-950/40 cursor-pointer transition-all"
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>Pollux AI Copilot</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>
        </div>

        {/* View 1: 3D Antigravity Game Flight Simulator */}
        {activeTab === 'flight' && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white font-display">
                  Antigravity Flight Simulation
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Pilot the experimental AGP-1 starcraft. Blast rogue planetary cores with plasma blasters,
                  activate your antigravity repulsion shield, and navigate through intense gravitational distortion.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-cyan-400">Weaponry:</span>
                <span>Dual Plasma Lasers</span>
                <span className="text-slate-600">·</span>
                <span>Repulsion Radius 5.0</span>
                <span className="text-slate-600">·</span>
                <span>Synthwave Audio</span>
              </div>
            </div>

            {/* Embedded High-Performance Three.js Game */}
            <AntigravityGameCanvas
              onScoreUpdate={handleScoreUpdate}
              onOpenCopilot={() => setIsCopilotOpen(true)}
              onSaveToDrive={() => setActiveTab('drive')}
            />

            {/* Feature Highlights Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Plasma Blasters</span>
                </div>
                <div className="text-base font-bold text-white mt-1">Shoot Planets & Wells</div>
                <div className="text-xs text-slate-500 mt-0.5">Left-Click or F key to fire</div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Synthwave Audio</span>
                </div>
                <div className="text-base font-bold text-indigo-400 mt-1">124 BPM Cyberpunk BGM</div>
                <div className="text-xs text-slate-500 mt-0.5">Dynamic banking & rumble SFX</div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>Flight Academy</span>
                </div>
                <div className="text-base font-bold text-amber-400 mt-1">Step-by-Step Tutorial</div>
                <div className="text-xs text-slate-500 mt-0.5">Visual goals & skippable</div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Pollux AI Copilot</span>
                </div>
                <div className="text-base font-bold text-emerald-400 mt-1">Live Flight Companion</div>
                <div className="text-xs text-slate-500 mt-0.5">Tactical telemetry analysis</div>
              </div>
            </div>
          </section>
        )}

        {/* View 2: Planetary Multi-Cloud Mesh & Node Inspector */}
        {activeTab === 'planetary' && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white font-display">
                  Global Multi-Cloud Planetary Mesh
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Interactive real-time topology of global cloud regions (GCP, AWS, Azure, Sovereign Edge).
                  The Antigravity Protocol neutralizes data gravity barriers, allowing instant zero-inertia workload distribution.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-emerald-400">Topology:</span>
                <span>11 Global Nodes</span>
                <span className="text-slate-600">·</span>
                <span>12 Subsea Geodesics</span>
                <span className="text-slate-600">·</span>
                <span>Active Consensus</span>
              </div>
            </div>

            {/* 3D Planetary Canvas + Node Telemetry Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="lg:col-span-2 min-h-[520px]">
                <PlanetaryMeshCanvas
                  nodes={cloudNodes}
                  connections={INITIAL_NETWORK_CONNECTIONS}
                  selectedNodeId={selectedNode ? selectedNode.id : null}
                  onSelectNode={handleSelectNode}
                />
              </div>

              <div className="lg:col-span-1">
                <CloudNodeInspector
                  node={selectedNode}
                  onActivateRepulsion={handleActivateRepulsion}
                  onInduceFailure={handleInduceFailure}
                  onRestoreNode={handleRestoreNode}
                />
              </div>
            </div>

            {/* Anomaly & Chaos Simulator Strip */}
            <AnomalySimulator
              nodes={cloudNodes}
              onTriggerGlobalRebalance={handleTriggerGlobalRebalance}
              onSimulateOutage={handleSimulateOutage}
            />
          </section>
        )}

        {/* View 3: Multi-Cloud Telemetry & Graviton Metrics Table */}
        {activeTab === 'telemetry' && (
          <section className="space-y-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white font-display">
                Multi-Cloud Graviton Telemetry
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Real-time latency matrix, data repulsion field status, and workload distribution across all global edge points.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-6 py-4">Node / Region</th>
                      <th className="px-6 py-4">Provider</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Latency</th>
                      <th className="px-6 py-4">Throughput</th>
                      <th className="px-6 py-4">Graviton Shield</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono-num text-slate-300">
                    {cloudNodes.map((node) => {
                      const isFailing = node.status === 'failing' || node.status === 'degraded';
                      return (
                        <tr key={node.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4 font-sans font-medium text-white">
                            <div className="font-semibold">{node.name}</div>
                            <div className="text-[11px] text-slate-500 font-normal">{node.locationName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                              {node.provider}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                              isFailing
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {node.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-white">
                            {node.latencyMs} ms
                          </td>
                          <td className="px-6 py-4 text-white">
                            {node.throughputGbps} Gbps
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                                <div
                                  className={`h-full ${
                                    isFailing ? 'bg-rose-500' : 'bg-cyan-400'
                                  }`}
                                  style={{ width: `${node.gravitonFieldStrength}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-slate-400">{node.gravitonFieldStrength}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedNode(node);
                                setActiveTab('planetary');
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 hover:bg-cyan-900/50 transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* View 4: Google Drive Workspace App */}
        {activeTab === 'drive' && (
          <section className="space-y-6">
            <GoogleDriveWorkspace
              currentFlightTelemetry={telemetry}
              onSwitchToFlight={() => setActiveTab('flight')}
            />
          </section>
        )}

        {/* View 5: Standalone Deliverable Export */}
        {activeTab === 'export' && (
          <section className="space-y-6">
            <StandaloneGameModal />
          </section>
        )}
      </main>

      {/* Floating Pollux AI Copilot Dialog */}
      <PolluxCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        flightTelemetry={telemetry}
      />

      {/* Ergonomic Collapsible Bottom Dock (Zero Viewport Occlusion) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92vw]">
        <div className="flex justify-center -mb-2">
          <button
            onClick={() => setIsDockCollapsed(!isDockCollapsed)}
            className="px-3 py-1 rounded-t-lg bg-slate-900/90 border-t border-x border-slate-700/80 text-[11px] font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 shadow-lg backdrop-blur-md cursor-pointer"
          >
            {isDockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isDockCollapsed ? 'Show Controls Dock' : 'Collapse Dock (Cinema Mode)'}</span>
          </button>
        </div>

        {!isDockCollapsed && (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('flight')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'flight' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                Flight
              </button>
              <button
                onClick={() => setActiveTab('planetary')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'planetary' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                Planetary Mesh
              </button>
              <button
                onClick={() => setActiveTab('drive')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'drive' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <HardDrive className="w-3 h-3" />
                <span>Drive</span>
              </button>
              <button
                onClick={() => setActiveTab('export')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'export' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                HTML Game
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Pollux</span>
              </button>

              <button
                onClick={handleToggleAudio}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {audioEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}
              </button>
              <a
                href="/antigravity_game.html"
                download="antigravity_game.html"
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save HTML</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
