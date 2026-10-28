/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RLHyperparameters, DEFAULT_RL_HYPERPARAMETERS } from '../agents/rlAgent';
import { Sliders, X, RotateCcw, Zap, Target, Compass, Shield, Trash2 } from 'lucide-react';

interface RLHyperparametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  hyperparameters: RLHyperparameters;
  onUpdateHyperparameters: (updated: Partial<RLHyperparameters>) => void;
  currentBufferSize: number;
  onClearBuffer: () => void;
}

interface Preset {
  name: string;
  icon: React.ReactNode;
  desc: string;
  params: Partial<RLHyperparameters>;
}

export const RLHyperparametersModal: React.FC<RLHyperparametersModalProps> = ({
  isOpen,
  onClose,
  hyperparameters,
  onUpdateHyperparameters,
  currentBufferSize,
  onClearBuffer,
}) => {
  if (!isOpen) return null;

  const presets: Preset[] = [
    {
      name: 'Governor Prior (Default)',
      icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
      desc: 'Runs as Safe Governor initially with zero residual offset, fine-tuning local action deltas via RL',
      params: DEFAULT_RL_HYPERPARAMETERS,
    },
    {
      name: 'Pure Safe Governor',
      icon: <Shield className="w-3.5 h-3.5 text-emerald-400" />,
      desc: 'Zero exploration, strictly tracking the Safe Governor heuristic baseline without deviation',
      params: {
        learningRate: 0.0001,
        gamma: 0.98,
        epsilon: 0.0,
        minEpsilon: 0.0,
        epsilonDecay: 1.0,
        batchSize: 32,
      },
    },
    {
      name: 'Deep Fine-Tuning',
      icon: <Target className="w-3.5 h-3.5 text-purple-400" />,
      desc: 'Ultra-low learning rate, large batch, and low exploration for delicate high-speed trajectory polish',
      params: {
        learningRate: 0.0003,
        gamma: 0.99,
        epsilon: 0.04,
        minEpsilon: 0.008,
        epsilonDecay: 0.998,
        batchSize: 64,
      },
    },
    {
      name: 'Adaptive Explorer',
      icon: <Compass className="w-3.5 h-3.5 text-sky-400" />,
      desc: 'Mild neighbor exploration to discover faster cornering apexes while safe governor guards boundaries',
      params: {
        learningRate: 0.001,
        gamma: 0.97,
        epsilon: 0.15,
        minEpsilon: 0.02,
        epsilonDecay: 0.992,
        batchSize: 32,
      },
    },
  ];

  const bufferPercent = Math.min(100, Math.round((currentBufferSize / hyperparameters.maxBufferSize) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-700/60 text-purple-400 shadow-inner">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                RL Hyperparameters & Training Tuner
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                  Residual DQN (Governor Inherited)
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Inherits Safe Governor mechanics as baseline prior Q(s, a). Fine-tunes residual layer ΔQ with localized neighbor exploration.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          
          {/* Preset Buttons */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Quick Tuning Presets</span>
              <span className="text-[10px] lowercase text-slate-500 font-mono">1-click profile swap</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => onUpdateHyperparameters(p.params)}
                  title={p.desc}
                  className="flex flex-col items-start p-2.5 bg-slate-950/60 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-600/50 rounded-xl transition-all cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-slate-200 group-hover:text-purple-300 text-[11px]">
                    {p.icon}
                    <span>{p.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Hyperparameters Grid */}
          <div className="space-y-4">

            {/* 1. Learning Rate */}
            <div className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-xs">Learning Rate (α)</span>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/50">
                    {hyperparameters.learningRate.toFixed(4)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Range: 0.0001 - 0.0200</span>
              </div>
              <input
                type="range"
                min="0.0001"
                max="0.02"
                step="0.0002"
                value={hyperparameters.learningRate}
                onChange={(e) => onUpdateHyperparameters({ learningRate: parseFloat(e.target.value) })}
                className="w-full accent-purple-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Step size of weight updates during backpropagation. Smaller values guarantee stable convergence; larger values adapt faster to sharp curves.
              </p>
            </div>

            {/* 2. Discount Factor Gamma */}
            <div className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-xs">Discount Factor (γ)</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
                    {hyperparameters.gamma.toFixed(3)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Range: 0.80 - 0.999</span>
              </div>
              <input
                type="range"
                min="0.80"
                max="0.999"
                step="0.005"
                value={hyperparameters.gamma}
                onChange={(e) => onUpdateHyperparameters({ gamma: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Horizon importance weighting for future cumulative rewards. High values (0.98 - 0.99) incentivize the truck to slow down well ahead of upcoming steep cliffs.
              </p>
            </div>

            {/* 3. Exploration Epsilon & Decay */}
            <div className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white text-xs">Exploration Rate (ε)</span>
                  <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">
                    {(hyperparameters.epsilon * 100).toFixed(1)}% ({hyperparameters.epsilon.toFixed(3)})
                  </span>
                </div>
                {/* Quick Override Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateHyperparameters({ epsilon: 0.0 })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    title="Zero exploration: purely test safe governor baseline"
                  >
                    ε=0 (Pure Gov)
                  </button>
                  <button
                    onClick={() => onUpdateHyperparameters({ epsilon: 0.08 })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    title="Default: 8% localized neighbor exploration"
                  >
                    ε=0.08 (Default)
                  </button>
                  <button
                    onClick={() => onUpdateHyperparameters({ epsilon: 0.20 })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    title="Fine-tune with 20% localized exploration"
                  >
                    ε=0.20 (Explore)
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.01"
                value={hyperparameters.epsilon}
                onChange={(e) => onUpdateHyperparameters({ epsilon: parseFloat(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
              
              {/* Epsilon Decay & Floor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-slate-300">Min Epsilon Floor (ε_min)</span>
                    <span className="font-mono text-slate-400">{hyperparameters.minEpsilon.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.40"
                    step="0.01"
                    value={hyperparameters.minEpsilon}
                    onChange={(e) => onUpdateHyperparameters({ minEpsilon: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-slate-300">Decay Rate per Episode</span>
                    <span className="font-mono text-slate-400">{hyperparameters.epsilonDecay.toFixed(4)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.95"
                    max="0.9995"
                    step="0.0005"
                    value={hyperparameters.epsilonDecay}
                    onChange={(e) => onUpdateHyperparameters({ epsilonDecay: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 4. Mini-Batch Size & Replay Buffer */}
            <div className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-white text-xs">Mini-Batch Size (Transitions per step)</span>
                  <span className="font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50">
                    {hyperparameters.batchSize} samples
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {[8, 16, 32, 64, 128].map((size) => (
                    <button
                      key={size}
                      onClick={() => onUpdateHyperparameters({ batchSize: size })}
                      className={`flex-1 py-1 rounded-lg font-mono font-bold text-xs transition-colors cursor-pointer border ${
                        hyperparameters.batchSize === size
                          ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Larger batches smooth out stochastic gradient noise, while smaller batches yield faster iteration per simulation step.
                </p>
              </div>

              {/* Buffer Capacity & Status */}
              <div className="pt-2 border-t border-slate-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Replay Buffer Capacity</span>
                  <span className="font-mono text-slate-400">{hyperparameters.maxBufferSize.toLocaleString()} max</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="20000"
                  step="1000"
                  value={hyperparameters.maxBufferSize}
                  onChange={(e) => onUpdateHyperparameters({ maxBufferSize: parseInt(e.target.value, 10) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />

                {/* Live Buffer Fill Bar */}
                <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="flex flex-col gap-1 w-3/4">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Occupancy:</span>
                      <span className="text-slate-200">
                        {currentBufferSize.toLocaleString()} / {hyperparameters.maxBufferSize.toLocaleString()} ({bufferPercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                        style={{ width: `${bufferPercent}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={onClearBuffer}
                    title="Flush experience buffer (useful when changing track topography or cargo payload mass)"
                    className="flex items-center gap-1 px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800/60 text-rose-300 rounded-md text-[10px] font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Flush</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/80">
          <button
            onClick={() => onUpdateHyperparameters(DEFAULT_RL_HYPERPARAMETERS)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Hyperparameters</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all shadow-md cursor-pointer text-xs"
          >
            Apply & Close
          </button>
        </div>

      </div>
    </div>
  );
};
