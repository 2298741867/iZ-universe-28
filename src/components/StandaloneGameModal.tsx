import React, { useState } from 'react';
import { Download, ExternalLink, Code, Check, Sparkles } from 'lucide-react';

export const StandaloneGameModal: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = '/antigravity_game.html';
    a.download = 'antigravity_game.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenStandalone = () => {
    window.location.href = '/antigravity_game.html';
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText('antigravity_game.html');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Single-File Interactive Deliverable</span>
          </div>
          <h2 className="text-2xl font-bold text-white font-display">antigravity_game.html</h2>
          <p className="text-sm text-slate-400 mt-1">
            Complete zero-dependency HTML5 game containing Three.js r128 CDN, procedural shaders, audio synthesizer, and spatial physics.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleDownload}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download HTML Game</span>
          </button>

          <button
            onClick={handleOpenStandalone}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors border border-slate-700 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Launch Standalone</span>
          </button>
        </div>
      </div>

      {/* Specifications Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Core Mechanics Verified:</h4>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Plane Raycasting:</strong> Mouse/touch mapped to Y=0 plane; ship banks laterally proportional to velocity.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Inverse-Square Gravity:</strong> F = G · M / d², clamped to prevent teleporting; dampening drag applied.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Antigravity Shield:</strong> Spacebar / touch hold repels wells in radius 5.0; 20%/s drain & 5%/s regen.</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Dynamic Escalation & Audio:</h4>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Difficulty Surges:</strong> Every 15s speed +5%, gravity +10%, faster spawn cadence.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Well Types:</strong> Pulsing (score ≥ 10), Binary orbiting cores (score ≥ 25 & 50).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Web Audio Synthesizer:</strong> Zero external mp3s; procedural sawtooth engine, shield hum, near-miss chime.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Live Preview Embed */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
          <span>Live Embedded Preview: /antigravity_game.html</span>
          <button
            onClick={handleCopyPath}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Code className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied Path!' : 'Copy File Name'}</span>
          </button>
        </div>
        <div className="w-full h-[480px]">
          <iframe
            src="/antigravity_game.html"
            title="Antigravity Standalone Game"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
