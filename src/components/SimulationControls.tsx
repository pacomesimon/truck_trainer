/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraViewMode } from '../rendering/Truck3DScene';
import { Play, Pause, StepForward, RotateCcw, Video, Zap, Bot, User, Flame, BrainCircuit, Settings, Eye, Activity, Sparkles, Database, Sliders } from 'lucide-react';
import { ContinuousAction } from '../types/truck';
import { RLHyperparameters } from '../agents/rlAgent';

export type DriverMode = 'manual' | 'safe_agent' | 'aggressive_agent' | 'rl_eval' | 'rl_train';

export interface PretrainMetrics {
  isPretrained: boolean;
  pretrainSource: string | null;
  demonstrationsCount: number;
  epsilon: number;
}

interface SimulationControlsProps {
  driverMode: DriverMode;
  onDriverModeChange: (mode: DriverMode) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepOnce: () => void;
  onReset: () => void;
  speedMultiplier: number;
  onSpeedMultiplierChange: (multiplier: number) => void;
  cameraView: CameraViewMode;
  onCameraViewChange: (mode: CameraViewMode) => void;
  manualAction: ContinuousAction;
  onManualActionChange: (action: ContinuousAction) => void;
  onOpenConfig: () => void;
  onToggleObservation: () => void;
  onOpenTireModal: () => void;
  onFastTrainEpisodes: (episodes: number) => void;
  isTrainingFast: boolean;
  // Demonstration Pre-training Props
  isPretrainingActive: boolean;
  onTogglePretraining: () => void;
  pretrainMetrics: PretrainMetrics;
  onPretrainFromSafeGovernor: (episodes?: number) => void;
  onResetRLModel: () => void;
  // RL Hyperparameter tuning
  hyperparameters?: RLHyperparameters;
  onOpenHyperparameters?: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  driverMode,
  onDriverModeChange,
  isPlaying,
  onTogglePlay,
  onStepOnce,
  onReset,
  speedMultiplier,
  onSpeedMultiplierChange,
  cameraView,
  onCameraViewChange,
  manualAction,
  onManualActionChange,
  onOpenConfig,
  onToggleObservation,
  onOpenTireModal,
  onFastTrainEpisodes,
  isTrainingFast,
  isPretrainingActive,
  onTogglePretraining,
  pretrainMetrics,
  onPretrainFromSafeGovernor,
  onResetRLModel,
  hyperparameters,
  onOpenHyperparameters,
}) => {
  return (
    <div className="flex flex-col gap-2.5 text-xs select-none">
      {/* Top Controller Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-700/70 rounded-xl p-2.5 backdrop-blur-md shadow-xl">
        {/* Playback Transport */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer shadow-sm ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            onClick={onStepOnce}
            disabled={isPlaying}
            title="Step 1 physics frame (dt = 0.02s)"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <StepForward className="w-4 h-4" />
          </button>

          <button
            onClick={onReset}
            title="Reset environment episode"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-medium">Reset</span>
          </button>

          {/* Speed Multiplier */}
          <div className="flex items-center ml-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                onClick={() => onSpeedMultiplierChange(spd)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                  speedMultiplier === spd ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Driver / Agent Mode Buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto">
          <button
            onClick={() => onDriverModeChange('manual')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              driverMode === 'manual' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Manual (WASD)</span>
          </button>

          <button
            onClick={() => onDriverModeChange('safe_agent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              driverMode === 'safe_agent' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Safe Governor</span>
          </button>

          <button
            onClick={() => onDriverModeChange('aggressive_agent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              driverMode === 'aggressive_agent' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Demon (Rollover)</span>
          </button>

          <button
            onClick={() => onDriverModeChange('rl_eval')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              driverMode === 'rl_eval' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>RL Eval Policy</span>
          </button>

          <button
            onClick={() => onDriverModeChange('rl_train')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              driverMode === 'rl_train' ? 'bg-purple-600 text-white shadow animate-pulse' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Live RL Train</span>
          </button>
        </div>

        {/* Camera Views & Tools */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {(['chase', 'cabin', 'orbit'] as CameraViewMode[]).map((cam) => (
              <button
                key={cam}
                onClick={() => onCameraViewChange(cam)}
                className={`px-2 py-1 rounded text-[11px] capitalize font-medium transition-colors cursor-pointer ${
                  cameraView === cam ? 'bg-slate-700 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cam}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenTireModal}
            title="Inspect Pacejka tire traction curve"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <Activity className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleObservation}
            title="Inspect 32-dim RL observation vector"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
          </button>

          {onOpenHyperparameters && (
            <button
              onClick={onOpenHyperparameters}
              title="Tune RL Hyperparameters (learning rate, discount factor, exploration, batch size, buffer)"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-purple-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenConfig}
            title="Tune physics, tracks, mass, CoM offsets, and reward weights"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Driver Mode Specific Sub-bars */}

      {/* 1. Manual Mode: Keyboard Controls + Demonstration Pre-training Toggle */}
      {driverMode === 'manual' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-[11px] text-slate-300 backdrop-blur-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sky-400">KEYBOARD:</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">W / ↑</kbd> Throttle</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">S / ↓</kbd> Brake</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">A / D / ← / →</kbd> Steer</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Pre-training Demonstration Toggle */}
            <button
              onClick={onTogglePretraining}
              title="When enabled, your driving states & actions are directly used to train the RL neural network"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all cursor-pointer shadow-sm ${
                isPretrainingActive
                  ? 'bg-rose-600/90 hover:bg-rose-500 text-white ring-1 ring-rose-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isPretrainingActive ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
              <span>{isPretrainingActive ? 'PRE-TRAIN: RECORDING ON' : 'PRE-TRAIN: OFF'}</span>
            </button>

            {isPretrainingActive && (
              <span className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>{pretrainMetrics.demonstrationsCount} demos stored</span>
              </span>
            )}

            <div className="flex items-center gap-2.5 font-mono text-[10px] pl-2 border-l border-slate-800">
              <div>
                <span className="text-slate-400 mr-1">Steer:</span>
                <span className="text-white font-bold">{manualAction.steer.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400 mr-1">Throttle:</span>
                <span className="text-white font-bold">{manualAction.throttle.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Safe Governor Mode: Autonomous Cruise + Demonstration Pre-training */}
      {driverMode === 'safe_agent' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-3 py-2 text-[11px] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-emerald-200">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Safe Governor: Curvature preview speed control + dynamic rollover damping</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Pre-train Toggle */}
            <button
              onClick={onTogglePretraining}
              title="When enabled, Safe Governor trajectory states & actions are directly used to train the RL neural network"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all cursor-pointer shadow-sm ${
                isPretrainingActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-1 ring-emerald-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isPretrainingActive ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
              <span>{isPretrainingActive ? 'RECORD & PRE-TRAIN: ON' : 'PRE-TRAIN: OFF'}</span>
            </button>

            {isPretrainingActive && (
              <span className="text-[10px] font-mono text-emerald-300 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>{pretrainMetrics.demonstrationsCount} demos stored</span>
              </span>
            )}

            {/* Quick 10 Episodes Pre-training Batch Button */}
            <button
              onClick={() => onPretrainFromSafeGovernor(10)}
              disabled={isTrainingFast}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-lg border border-emerald-500 transition-colors cursor-pointer text-[10px]"
              title="Batch-run 10 safe episodes in background and seed the RL model with expert baseline prior"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{isTrainingFast ? 'Pre-training Model...' : 'Auto Pre-train 10 Ep'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Demon Mode: Rollover Stress Test */}
      {driverMode === 'aggressive_agent' && (
        <div className="flex items-center justify-between gap-3 bg-rose-950/40 border border-rose-800/60 rounded-xl px-3 py-2 text-[11px] backdrop-blur-sm text-rose-200">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Demon Mode: Maximum throttle aggression into sharp curves to test rollover and tire slip thresholds.</span>
          </div>
        </div>
      )}

      {/* 4. RL Training / Evaluation Mode: Showing Prior Knowledge from Pre-training */}
      {(driverMode === 'rl_train' || driverMode === 'rl_eval') && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-purple-950/40 border border-purple-800/60 rounded-xl px-3 py-2 text-[11px] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-purple-200">
            <BrainCircuit className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span>{driverMode === 'rl_train' ? 'Live RL Training:' : 'RL Policy Evaluation:'}</span>
              {pretrainMetrics.isPretrained ? (
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-mono text-[10px] flex items-center gap-1 font-bold shadow-sm">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>
                    Residual DQN: Safe Governor Prior (ε={(pretrainMetrics.epsilon * 100).toFixed(1)}% local explore)
                  </span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono text-[10px]">
                  Safe Governor Baseline (ε={(pretrainMetrics.epsilon * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenHyperparameters && (
              <button
                onClick={onOpenHyperparameters}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-900/60 hover:bg-purple-800/80 border border-purple-500/50 text-purple-200 hover:text-white rounded-lg font-bold text-[10px] transition-all shadow-sm cursor-pointer"
                title="Tune Residual DQN learning rate, discount factor, localized exploration, batch size, and buffer capacity"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-300" />
                <span>Hyperparameters</span>
                {hyperparameters && (
                  <span className="font-mono text-[9px] text-purple-300 bg-purple-950/80 px-1 py-0.5 rounded border border-purple-700/50 hidden sm:inline">
                    α={hyperparameters.learningRate} γ={hyperparameters.gamma} B={hyperparameters.batchSize}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onResetRLModel}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title="Reset residual weights to zero (restores pure Safe Governor baseline)"
            >
              Reset Residuals (Restore Baseline)
            </button>

            {driverMode === 'rl_train' && (
              <button
                onClick={() => onFastTrainEpisodes(25)}
                disabled={isTrainingFast}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg border border-purple-400 transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isTrainingFast ? 'Training Batch...' : 'Quick-Train 25 Episodes'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
