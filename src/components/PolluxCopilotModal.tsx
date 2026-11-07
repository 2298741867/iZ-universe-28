import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, X, Minimize2, Maximize2, Shield, Radio, Terminal, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { audioSynth } from '../utils/audio';
import { polluxVoice } from '../services/voiceAssistant';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

interface PolluxCopilotProps {
  isOpen: boolean;
  onClose: () => void;
  flightTelemetry?: {
    score: number;
    distance: number;
    shieldEnergy: number;
    difficultyTier: number;
    speed: number;
  };
}

export const PolluxCopilotModal: React.FC<PolluxCopilotProps> = ({
  isOpen,
  onClose,
  flightTelemetry
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Greetings, Commander. I am Pollux, your cybernetic flight copilot and planetary defense tactician. All telemetry streams are synchronized. Spacecraft blasters, repulsion shields, and multi-cloud quantum mesh are primed. How may I assist your flight?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isDictating, setIsDictating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const startDictation = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => {
        setIsDictating(true);
        audioSynth.playRadioChirp(true);
      };
      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        if (text) {
          setInput(text);
          sendMessage(text);
        }
      };
      rec.onerror = () => {
        setIsDictating(false);
      };
      rec.onend = () => {
        setIsDictating(false);
      };
      rec.start();
    } catch {
      setIsDictating(false);
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/pollux/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          flightTelemetry,
        }),
      });

      const data = await response.json();
      audioSynth.playStepChime();
      const reply = data.reply || "Pollux: Signal nominal. Maintaining spatial vector.";

      if (voiceOutputEnabled) {
        polluxVoice.speak(reply, "🤖 POLLUX");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      const fallback = "Pollux: Telemetry frequency interference. Shields and flight thrusters remain operational.";
      if (voiceOutputEnabled) {
        polluxVoice.speak(fallback, "🤖 POLLUX");
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fallback,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "Combat strategy for destroying gravity wells?",
    "How does the Antigravity repulsion field work?",
    "Explain multi-cloud data gravity neutralization",
    "Flight maneuvers for near-miss bonuses",
  ];

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isMinimized
          ? 'bottom-24 right-6 w-72'
          : 'bottom-20 right-6 w-96 max-w-[calc(100vw-2rem)]'
      }`}
    >
      <div className="bg-slate-900/95 border border-cyan-500/30 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col border-cyan-500/40 shadow-cyan-950/50">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/30">
                <Bot className="w-4 h-4" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5 font-display tracking-wider">
                <span>POLLUX AI COPILOT</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  ONLINE
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono-num flex items-center gap-2">
                <span>Latency: 12ms</span>
                <span>·</span>
                <span>Tier: {flightTelemetry?.difficultyTier || 1}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400">
            <button
              onClick={() => {
                const next = !voiceOutputEnabled;
                setVoiceOutputEnabled(next);
                if (!next) polluxVoice.stopSpeaking();
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                voiceOutputEnabled
                  ? 'text-cyan-400 hover:text-cyan-300 hover:bg-slate-800'
                  : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800'
              }`}
              title={voiceOutputEnabled ? 'Pollux Voice: ACTIVE (Click to mute)' : 'Pollux Voice: MUTED (Click to unmute)'}
            >
              {voiceOutputEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title={isMinimized ? 'Expand Copilot' : 'Minimize Copilot'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Close Copilot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        {!isMinimized && (
          <>
            {/* Scrollable Chat Area */}
            <div
              ref={scrollRef}
              className="p-4 space-y-3.5 overflow-y-auto max-h-[340px] min-h-[220px] text-xs font-sans"
            >
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 px-1">
                    <span>{msg.role === 'user' ? 'Pilot' : 'Pollux AI'}</span>
                    <span>·</span>
                    <span>{msg.time}</span>
                  </div>
                  <div
                    className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white rounded-tr-xs'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-xs shadow-inner'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-cyan-400 bg-slate-800/60 p-2.5 rounded-xl border border-cyan-500/20 w-fit">
                  <Radio className="w-3.5 h-3.5 animate-spin" />
                  <span>Pollux calculating optimal flight vector...</span>
                </div>
              )}
            </div>

            {/* Quick Tactical Prompt Chips */}
            <div className="px-3 py-2 bg-slate-950/50 border-t border-slate-800/80 flex gap-1.5 overflow-x-auto no-scrollbar">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-slate-800 text-slate-300 hover:text-cyan-300 hover:bg-slate-700 whitespace-nowrap transition-colors border border-slate-700 cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isDictating ? "Listening to your voice..." : "Ask Pollux for tactical flight advice..."}
                className={`flex-1 bg-slate-900 border rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  isDictating ? 'border-rose-500/80 bg-rose-950/20' : 'border-slate-700 focus:border-cyan-400'
                }`}
              />
              <button
                type="button"
                onClick={startDictation}
                disabled={loading}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isDictating
                    ? 'bg-rose-500/30 border-rose-400 text-rose-300 animate-pulse'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40'
                }`}
                title="Voice Input (Dictate question)"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-indigo-500 transition-all cursor-pointer shadow-md shadow-cyan-500/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
