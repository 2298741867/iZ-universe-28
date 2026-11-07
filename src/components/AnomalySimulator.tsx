import React from 'react';
import { CloudNode } from '../types/cloud';
import { AlertCircle, Zap, CheckCircle2, ShieldAlert } from 'lucide-react';
import { audioSynth } from '../utils/audio';

interface AnomalySimulatorProps {
  nodes: CloudNode[];
  onTriggerGlobalRebalance: () => void;
  onSimulateOutage: (nodeId: string) => void;
}

export const AnomalySimulator: React.FC<AnomalySimulatorProps> = ({
  nodes,
  onTriggerGlobalRebalance,
  onSimulateOutage
}) => {
  const degradedCount = nodes.filter(n => n.status === 'degraded' || n.status === 'failing').length;
  const totalThroughput = nodes.reduce((sum, n) => sum + n.throughputGbps, 0);
  const avgLatency = Math.round(nodes.reduce((sum, n) => sum + n.latencyMs, 0) / nodes.length);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            <span>Antigravity Global Orchestration Engine</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous multi-cloud load rebalancing using inverse gravitational field routing.
          </p>
        </div>

        <button
          onClick={() => {
            audioSynth.playReroutePulse();
            onTriggerGlobalRebalance();
          }}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 cursor-pointer whitespace-nowrap self-start md:self-auto"
        >
          <Zap className="w-4 h-4" />
          <span>Execute Global Graviton Rebalance</span>
        </button>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-400 mb-1">Global Active Throughput</div>
          <div className="text-2xl font-bold font-mono-num text-white">
            {(totalThroughput / 1000).toFixed(2)} <span className="text-xs font-sans text-slate-500 font-normal">Tbps</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-400 mb-1">Global Mesh Latency</div>
          <div className="text-2xl font-bold font-mono-num text-cyan-400">
            {avgLatency} <span className="text-xs font-sans text-slate-500 font-normal">ms</span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] font-medium text-slate-400 mb-1">Gravitational Flux Alerts</div>
          <div className={`text-2xl font-bold font-mono-num ${degradedCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {degradedCount > 0 ? `${degradedCount} Degraded` : 'Zero Anomalies'}
          </div>
        </div>
      </div>

      {/* Scenario Stress-Test Buttons */}
      <div className="border-t border-slate-800/80 pt-5">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Simulate Multi-Cloud Gravitational Outages:
        </h4>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onSimulateOutage('aws-us-east1')}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-950 border border-amber-500/30 text-amber-300 hover:bg-amber-950/30 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>AWS us-east-1 Blackout Spike</span>
          </button>

          <button
            onClick={() => onSimulateOutage('gcp-europe-west1')}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-950 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/30 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>GCP europe-west1 Fiber Cut</span>
          </button>

          <button
            onClick={() => onSimulateOutage('azure-australiaeast')}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-950 border border-blue-500/30 text-blue-300 hover:bg-blue-950/30 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Azure Sydney Subsea Cable Surge</span>
          </button>
        </div>
      </div>
    </div>
  );
};
