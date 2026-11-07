import React from 'react';
import { Rocket, Globe, Shield, Activity, Download, Volume2, VolumeX } from 'lucide-react';

interface NavigationProps {
  activeTab: 'flight' | 'planetary' | 'telemetry' | 'export';
  setActiveTab: (tab: 'flight' | 'planetary' | 'telemetry' | 'export') => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onTriggerFlight: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  audioEnabled,
  onToggleAudio,
  onTriggerFlight
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      {/* Zone 1: Single text element wordmark in display face */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('flight');
          }}
          className="text-lg font-bold tracking-tight text-white font-display flex items-center gap-2 whitespace-nowrap"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span>Antigravity Global</span>
        </a>
      </div>

      {/* Zone 2: 4-5 clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('flight')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'flight' ? 'text-cyan-400' : ''
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>Flight Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab('planetary')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'planetary' ? 'text-cyan-400' : ''
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Planetary Mesh</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'telemetry' ? 'text-cyan-400' : ''
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Multi-Cloud Health</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'export' ? 'text-cyan-400' : ''
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Standalone Game HTML</span>
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleAudio}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
          title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
          aria-label={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
        >
          {audioEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>

        <button
          onClick={onTriggerFlight}
          className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-indigo-600 rounded-lg hover:from-sky-400 hover:to-indigo-500 transition-all shadow-md shadow-indigo-500/20 whitespace-nowrap flex items-center gap-2"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Engage Flight</span>
        </button>
      </div>
    </header>
  );
};
