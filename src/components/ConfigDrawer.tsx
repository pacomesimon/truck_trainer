/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EnvironmentConfig, TrackProfileType } from '../types/truck';
import { Sliders, X, Mountain, ShieldAlert, Scale, RotateCcw } from 'lucide-react';

interface ConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: EnvironmentConfig;
  onConfigChange: (updated: Partial<EnvironmentConfig>) => void;
}

export const ConfigDrawer: React.FC<ConfigDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
}) => {
  if (!isOpen) return null;

  const vehicle = config.vehicle;

  const handleTrackChange = (trackType: TrackProfileType) => {
    onConfigChange({ trackType });
  };

  const handleVehicleField = (field: keyof typeof vehicle, value: number) => {
    onConfigChange({
      vehicle: {
        ...vehicle,
        [field]: value,
      },
    });
  };

  const resetDefaults = () => {
    onConfigChange({
      w1: 0.25,
      w2: 2.8,
      w3: 0.75,
      terminalPenalty: -1000,
      vehicle: {
        ...vehicle,
        cargoMass: 14000,
        comOffsetX: 0.0,
        comOffsetY: 0.0,
        comOffsetZ: 0.45,
        suspensionStiffness: 140000,
        suspensionDamping: 18000,
      },
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900/95 border-l border-slate-700/80 p-5 shadow-2xl backdrop-blur-xl flex flex-col justify-between text-xs text-slate-200 select-none overflow-y-auto">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2 font-bold text-sky-400 text-sm">
            <Sliders className="w-5 h-5" />
            <span>PHYSICS &amp; RL ENVIRONMENT CONFIG</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Track Profile Selector */}
        <div className="mb-5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Mountain className="w-4 h-4 text-emerald-400" />
            <span>Track Profile Generator</span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {[
              {
                id: 'narrow_ridge' as TrackProfileType,
                title: "Death's Ridge (Narrow Mountain Crest)",
                desc: '4.4m razor road with 200m vertical cliff drop-offs on both sides.',
              },
              {
                id: 'banked_curves' as TrackProfileType,
                title: 'Alpine Hairpins (Banked Curves)',
                desc: 'High lateral G-forces with up to 18° road banking/camber.',
              },
              {
                id: 'rough_incline' as TrackProfileType,
                title: 'Glacial Pass (Rough & Sloped)',
                desc: '14% gradient with Gravel, Mud (μ=0.35) and Black Ice (μ=0.16).',
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => handleTrackChange(t.id)}
                className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                  config.trackType === t.id
                    ? 'border-sky-500 bg-sky-950/40 text-white shadow-md'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-slate-200">{t.title}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Vehicle Mass & 3D Center of Mass (CoM) Offsets */}
        <div className="mb-5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Scale className="w-4 h-4" />
            <span>Dynamic Mass &amp; 3D Center of Mass (CoM)</span>
          </label>

          {/* Cargo Payload Mass */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Cargo Payload Mass:</span>
              <span className="font-mono font-bold text-amber-300">
                {(vehicle.cargoMass / 1000).toFixed(1)} tons (Total: {((vehicle.chassisMass + vehicle.cargoMass) / 1000).toFixed(1)}t)
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="24000"
              step="1000"
              value={vehicle.cargoMass}
              onChange={(e) => handleVehicleField('cargoMass', Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Vertical CoM Offset Δz (Elevated payload increases rollover risk) */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Vertical CoM Offset (Δz):</span>
              <span className="font-mono font-bold text-rose-400">
                +{vehicle.comOffsetZ.toFixed(2)} m (h = {(vehicle.comBaseHeight + vehicle.comOffsetZ).toFixed(2)}m)
              </span>
            </div>
            <input
              type="range"
              min="-0.2"
              max="1.2"
              step="0.05"
              value={vehicle.comOffsetZ}
              onChange={(e) => handleVehicleField('comOffsetZ', Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <span className="text-[9px] text-rose-400/90 block mt-0.5">
              Warning: Elevating CoM drastically increases Lateral Load Transfer ΔF_z = (M·a_y·h)/w and rollover risk!
            </span>
          </div>

          {/* Lateral CoM Offset Δy (Lopsided load) */}
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Lateral CoM Offset (Δy - Lopsided):</span>
              <span className="font-mono font-bold text-slate-200">
                {vehicle.comOffsetY > 0 ? `+${vehicle.comOffsetY.toFixed(2)}m (Right)` : vehicle.comOffsetY < 0 ? `${vehicle.comOffsetY.toFixed(2)}m (Left)` : '0.00m (Centered)'}
              </span>
            </div>
            <input
              type="range"
              min="-0.4"
              max="0.4"
              step="0.05"
              value={vehicle.comOffsetY}
              onChange={(e) => handleVehicleField('comOffsetY', Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Longitudinal CoM Offset Δx */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Longitudinal CoM Offset (Δx):</span>
              <span className="font-mono font-bold text-slate-200">
                {vehicle.comOffsetX.toFixed(2)} m
              </span>
            </div>
            <input
              type="range"
              min="-0.8"
              max="0.8"
              step="0.05"
              value={vehicle.comOffsetX}
              onChange={(e) => handleVehicleField('comOffsetX', Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        </div>

        {/* 3. Suspension Parameters */}
        <div className="mb-5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <label className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
            <ShieldAlert className="w-4 h-4" />
            <span>Spring-Damper Suspension</span>
          </label>

          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Spring Stiffness (k_susp):</span>
              <span className="font-mono font-bold text-slate-200">
                {(vehicle.suspensionStiffness / 1000).toFixed(0)} kN/m
              </span>
            </div>
            <input
              type="range"
              min="80000"
              max="240000"
              step="10000"
              value={vehicle.suspensionStiffness}
              onChange={(e) => handleVehicleField('suspensionStiffness', Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-400">Damper Coefficient (c_susp):</span>
              <span className="font-mono font-bold text-slate-200">
                {(vehicle.suspensionDamping / 1000).toFixed(1)} kN·s/m
              </span>
            </div>
            <input
              type="range"
              min="8000"
              max="32000"
              step="2000"
              value={vehicle.suspensionDamping}
              onChange={(e) => handleVehicleField('suspensionDamping', Number(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        </div>

        {/* 4. RL Reward Weights */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <label className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
            <Sliders className="w-4 h-4" />
            <span>Reward Formulation Weights</span>
          </label>

          <div className="mb-2">
            <div className="flex justify-between mb-0.5">
              <span className="text-slate-400">w1 (Cross-Track Penalty):</span>
              <span className="font-mono font-bold text-rose-400">{config.w1.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.5"
              step="0.05"
              value={config.w1}
              onChange={(e) => onConfigChange({ w1: Number(e.target.value) })}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>

          <div className="mb-2">
            <div className="flex justify-between mb-0.5">
              <span className="text-slate-400">w2 (LTR Rollover Penalty):</span>
              <span className="font-mono font-bold text-amber-400">{config.w2.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="6.0"
              step="0.2"
              value={config.w2}
              onChange={(e) => onConfigChange({ w2: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-0.5">
              <span className="text-slate-400">w3 (Roll Rate Oscillation):</span>
              <span className="font-mono font-bold text-purple-400">{config.w3.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.1"
              value={config.w3}
              onChange={(e) => onConfigChange({ w3: Number(e.target.value) })}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
        <button
          onClick={resetDefaults}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Defaults</span>
        </button>

        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
};
