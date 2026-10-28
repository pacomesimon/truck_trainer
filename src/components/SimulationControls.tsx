/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraViewMode } from '../rendering/Truck3DScene';
import { Play, Pause, StepForward, RotateCcw, Video, Zap, Bot, User, Flame, BrainCircuit, Settings, Eye, Activity } from 'lucide-react';
import { ContinuousAction } from '../types/truck';

export type DriverMode = 'manual' | 'safe_agent' | 'aggressive_agent' | 'rl_eval' | 'rl_train';

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

          <button
            onClick={onOpenConfig}
            title="Tune physics, tracks, mass, CoM offsets, and reward weights"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Driver Mode Specific Bar */}
      {driverMode === 'manual' && (
        <div className="flex items-center justify-between gap-3 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-2 text-[11px] text-slate-300 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sky-400">KEYBOARD CONTROLS:</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">W / ↑</kbd> Throttle</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">S / ↓</kbd> Brake</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">A / D / ← / →</kbd> Steer</span>
          </div>

          <div className="flex items-center gap-3 font-mono">
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
      )}

      {(driverMode === 'rl_train' || driverMode === 'rl_eval') && (
        <div className="flex items-center justify-between gap-2 bg-purple-950/40 border border-purple-800/60 rounded-xl px-3 py-2 text-[11px] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-purple-200">
            <BrainCircuit className="w-4 h-4 text-purple-400" />
            <span>In-Browser Neural Q-Network with Replay Buffer &amp; Bellman TD Targets</span>
          </div>
          <button
            onClick={() => onFastTrainEpisodes(25)}
            disabled={isTrainingFast}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-lg border border-purple-400 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isTrainingFast ? 'Training Batch...' : 'Quick-Train 25 Episodes'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
