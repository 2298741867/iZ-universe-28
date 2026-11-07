import React from 'react';
import { CloudNode } from '../types/cloud';
import { Server, Activity, ShieldCheck, Zap, Radio, AlertTriangle } from 'lucide-react';

interface CloudNodeInspectorProps {
  node: CloudNode | null;
  onActivateRepulsion: (nodeId: string) => void;
  onInduceFailure: (nodeId: string) => void;
  onRestoreNode: (nodeId: string) => void;
}

export const CloudNodeInspector: React.FC<CloudNodeInspectorProps> = ({
  node,
  onActivateRepulsion,
  onInduceFailure,
  onRestoreNode
}) => {
  if (!node) {
    return (
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 flex flex-col items-center justify-center min-h-[360px]">
        <Server className="w-10 h-10 mb-3 text-slate-700" />
        <h4 className="text-sm font-semibold text-slate-400 mb-1">Select a Cloud Node</h4>
        <p className="text-xs text-slate-500 max-w-xs">
          Click any regional beacon on the 3D Planetary Mesh to inspect graviton metrics, throughput, and failover status.
        </p>
      </div>
    );
  }

  const isFailing = node.status === 'failing' || node.status === 'degraded';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isFailing ? 'bg-rose-500' : 'bg-emerald-400'}`} />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{node.provider} Platform</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">{node.name}</h3>
            <p className="text-xs text-slate-400">{node.locationName} · {node.region}</p>
          </div>

          <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
            isFailing
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
          }`}>
            {node.status}
          </span>
        </div>

        {/* Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mesh Latency</span>
            </div>
            <div className="text-xl font-bold font-mono-num text-white">
              {node.latencyMs} <span className="text-xs font-sans text-slate-500 font-normal">ms</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Egress Throughput</span>
            </div>
            <div className="text-xl font-bold font-mono-num text-white">
              {node.throughputGbps} <span className="text-xs font-sans text-slate-500 font-normal">Gbps</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Graviton Field</span>
            </div>
            <div className="text-xl font-bold font-mono-num text-white">
              {node.gravitonFieldStrength}%
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mb-1">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Micro-VM Units</span>
            </div>
            <div className="text-xl font-bold font-mono-num text-white">
              {(node.activeWorkloads / 1000).toFixed(1)}k
            </div>
          </div>
        </div>

        {/* Antigravity Repulsion Shield Status */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Antigravity Repulsion Protocol</span>
            </span>
            <span className={`text-[11px] font-semibold ${node.repulsionShieldActive ? 'text-cyan-400' : 'text-slate-500'}`}>
              {node.repulsionShieldActive ? 'ACTIVE (Zero-Inertia)' : 'STANDBY'}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Neutralizes data gravity barriers across multi-cloud edge nodes. When outages or congestion occur, workloads are repelled instantaneously to adjacent provider zones.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => onActivateRepulsion(node.id)}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Zap className="w-4 h-4" />
          <span>{node.repulsionShieldActive ? 'Re-balance Repulsion Field' : 'Deploy Antigravity Repulsion'}</span>
        </button>

        {isFailing ? (
          <button
            onClick={() => onRestoreNode(node.id)}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/40 hover:bg-emerald-900/50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Restore Node to Healthy State</span>
          </button>
        ) : (
          <button
            onClick={() => onInduceFailure(node.id)}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/30 border border-rose-800/40 hover:bg-rose-900/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Simulate Gravitational Outage Spike</span>
          </button>
        )}
      </div>
    </div>
  );
};
