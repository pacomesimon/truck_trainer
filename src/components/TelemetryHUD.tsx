/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VehicleState, Observation } from '../types/truck';
import { AlertTriangle, Gauge, Compass, ShieldAlert, Truck } from 'lucide-react';

interface TelemetryHUDProps {
  vehicleState: VehicleState;
  observation: Observation;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ vehicleState, observation }) => {
  const speedKmh = Math.max(0, vehicleState.vx * 3.6);
  const lateralG = (vehicleState.ay / 9.81).toFixed(2);
  const longG = (vehicleState.ax / 9.81).toFixed(2);
  const rollDeg = (vehicleState.roll * 180 / Math.PI).toFixed(1);
  const pitchDeg = (vehicleState.pitch * 180 / Math.PI).toFixed(1);
  const ltr = Math.min(1.0, Math.max(0, vehicleState.ltr));

  // Wheel normal forces in kN
  const flKn = (vehicleState.wheels.fl.normalForce / 1000).toFixed(1);
  const frKn = (vehicleState.wheels.fr.normalForce / 1000).toFixed(1);
  const rlKn = (vehicleState.wheels.rl.normalForce / 1000).toFixed(1);
  const rrKn = (vehicleState.wheels.rr.normalForce / 1000).toFixed(1);

  // Rollover danger levels
  const isLtrHigh = ltr >= 0.75;
  const isLtrCritical = ltr >= 0.92;
  const isRollWarning = Math.abs(vehicleState.roll) > 0.35; // ~20 deg

  return (
    <div className="flex flex-col gap-2.5 text-xs select-none bg-slate-900/90 border border-slate-700/70 rounded-xl p-3 backdrop-blur-md shadow-xl text-slate-200">
      {/* Top Banner if Rollover / Off-Track */}
      {vehicleState.isRolledOver && (
        <div className="bg-red-600/95 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 animate-bounce border border-red-400 shadow-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <span className="block font-black tracking-wide text-xs">CATASTROPHIC ROLLOVER TRIGGERED</span>
            <span className="text-[10px] font-normal text-red-100 block">LTR ≥ 1.0 or roll angle &gt; 30°.</span>
          </div>
        </div>
      )}

      {vehicleState.isOffTrack && !vehicleState.isRolledOver && (
        <div className="bg-red-600/95 text-white px-3 py-2 rounded-lg font-bold flex items-center gap-2 border border-red-400 shadow-xl animate-bounce">
          <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0" />
          <div className="min-w-0">
            <span className="block font-black tracking-wide text-xs">TRUCK FALLEN: WHEEL OFF TRACK!</span>
            <span className="text-[10px] font-normal text-red-100 block truncate">
              {vehicleState.offTrackWheel ? `${vehicleState.offTrackWheel} wheel crossed the edge.` : 'A wheel crossed the track edge.'} Episode ended (-1000).
            </span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-100 text-[11px] tracking-wide">
          <Truck className="w-4 h-4 text-amber-400" />
          <span>VEHICLE TELEMETRY</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <span>Mass: <strong className="text-amber-400">{(vehicleState.totalMass / 1000).toFixed(1)}t</strong></span>
          <span>•</span>
          <span>CoM: <strong className="text-rose-400">{vehicleState.effectiveComHeight.toFixed(2)}m</strong></span>
        </div>
      </div>

      {/* Primary Metrics: Clean 2x2 Layout with Vertically Stacked Sub-rows */}
      <div className="grid grid-cols-2 gap-2">
        {/* 1. Speed Card */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="flex items-center gap-1 font-semibold text-slate-300 text-[11px]">
              <Gauge className="w-3.5 h-3.5 text-sky-400" /> SPEED
            </span>
            <span className="text-[10px] text-slate-500 font-mono">v_x</span>
          </div>
          <div className="flex items-baseline justify-between font-mono my-0.5">
            <span className="text-2xl font-black text-white tracking-tight">{speedKmh.toFixed(1)}</span>
            <span className="text-sky-400 font-bold text-xs">km/h</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-900">
            <span>Velocity:</span>
            <span className="text-slate-300 font-semibold">{vehicleState.vx.toFixed(1)} m/s</span>
          </div>
        </div>

        {/* 2. LTR Rollover Ratio Gauge */}
        <div className={`border rounded-lg p-2.5 flex flex-col justify-between transition-colors ${
          isLtrCritical
            ? 'border-red-500 bg-red-950/40 text-red-200'
            : isLtrHigh
            ? 'border-amber-500 bg-amber-950/30'
            : 'border-slate-800/80 bg-slate-950/60'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
              <span className={`w-2 h-2 rounded-full ${isLtrCritical ? 'bg-red-500 animate-pulse' : isLtrHigh ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>LTR STABILITY</span>
            </span>
            <span className="text-[11px] font-mono text-white font-bold">{ltr.toFixed(3)}</span>
          </div>

          {/* Progress bar with threshold indicator */}
          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden relative border border-slate-700/80 my-1">
            <div
              className={`h-full transition-all duration-75 ${
                isLtrCritical ? 'bg-red-500' : isLtrHigh ? 'bg-amber-400' : 'bg-sky-400'
              }`}
              style={{ width: `${ltr * 100}%` }}
            />
            {/* 0.8 critical threshold line */}
            <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-red-400" title="Critical rollover boundary (0.80)" />
          </div>

          <div className="flex justify-between text-[9px] text-slate-400 font-mono">
            <span>0.0 (Safe)</span>
            <span className="text-red-400 font-bold">1.0 (Rollover)</span>
          </div>
        </div>

        {/* 3. Lateral & Longitudinal Acceleration (Vertically Stacked Sub-rows) */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="flex items-center gap-1 font-semibold text-slate-300 text-[11px]">
              <Compass className="w-3.5 h-3.5 text-amber-400" /> ACCEL (G)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">a_y / a_x</span>
          </div>

          <div className="flex flex-col gap-1 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Lateral (a_y):</span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                Math.abs(Number(lateralG)) > 0.4
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'text-slate-200'
              }`}>
                {lateralG} g
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Longit. (a_x):</span>
              <span className="font-bold text-slate-300 text-[10px] px-1.5 py-0.2">
                {longG} g
              </span>
            </div>
          </div>
        </div>

        {/* 4. Body Tilt Angles (Roll & Pitch Vertically Stacked Sub-rows) */}
        <div className={`border rounded-lg p-2.5 flex flex-col justify-between transition-colors ${
          isRollWarning ? 'border-red-500/80 bg-red-950/30' : 'border-slate-800/80 bg-slate-950/60'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="flex items-center gap-1 font-semibold text-slate-300 text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> BODY TILT
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Roll / Pitch</span>
          </div>

          <div className="flex flex-col gap-1 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Roll (φ):</span>
              <span className={`font-bold text-[10px] px-1.5 py-0.2 rounded ${
                isRollWarning
                  ? 'bg-red-900/60 text-red-200 border border-red-500'
                  : 'text-slate-200'
              }`}>
                {rollDeg}°
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">Pitch (θ):</span>
              <span className="font-bold text-slate-300 text-[10px] px-1.5 py-0.2">
                {pitchDeg}°
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4-Wheel Load Transfer & Ground Clearance Grid */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
        <div className="flex items-center justify-between text-slate-400 mb-2 font-medium">
          <span className="text-[10px] font-semibold text-slate-300 tracking-wide">
            DYNAMIC 4-WHEEL GROUND STATUS (F_z / CLIFF CHECK)
          </span>
          <span className="text-[9px] text-slate-500 font-mono">1 Wheel Off = Fallen</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center font-mono">
          {/* Front Left */}
          <div className={`p-2 rounded-lg border flex flex-col justify-between transition-colors ${
            vehicleState.wheels.fl.isOffTrack
              ? 'border-red-500 bg-red-950/90 text-red-200 animate-pulse'
              : vehicleState.wheels.fl.isAirborne
              ? 'border-amber-500 bg-amber-950/40 text-amber-300'
              : 'border-slate-800 bg-slate-900/60'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span className="font-semibold text-slate-300">FL (Front Left)</span>
              <span className={`w-1.5 h-1.5 rounded-full ${vehicleState.wheels.fl.isOffTrack ? 'bg-red-500' : vehicleState.wheels.fl.isAirborne ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </div>
            <span className="text-sm font-bold text-white my-0.5">
              {vehicleState.wheels.fl.isOffTrack ? 'FALLEN!' : vehicleState.wheels.fl.isAirborne ? 'LIFT OFF' : `${flKn} kN`}
            </span>
            {vehicleState.wheels.fl.distFromCenterline !== undefined && (
              <span className="text-[9px] text-slate-400">
                dev: {vehicleState.wheels.fl.distFromCenterline.toFixed(2)}m
              </span>
            )}
          </div>

          {/* Front Right */}
          <div className={`p-2 rounded-lg border flex flex-col justify-between transition-colors ${
            vehicleState.wheels.fr.isOffTrack
              ? 'border-red-500 bg-red-950/90 text-red-200 animate-pulse'
              : vehicleState.wheels.fr.isAirborne
              ? 'border-amber-500 bg-amber-950/40 text-amber-300'
              : 'border-slate-800 bg-slate-900/60'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span className="font-semibold text-slate-300">FR (Front Right)</span>
              <span className={`w-1.5 h-1.5 rounded-full ${vehicleState.wheels.fr.isOffTrack ? 'bg-red-500' : vehicleState.wheels.fr.isAirborne ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </div>
            <span className="text-sm font-bold text-white my-0.5">
              {vehicleState.wheels.fr.isOffTrack ? 'FALLEN!' : vehicleState.wheels.fr.isAirborne ? 'LIFT OFF' : `${frKn} kN`}
            </span>
            {vehicleState.wheels.fr.distFromCenterline !== undefined && (
              <span className="text-[9px] text-slate-400">
                dev: {vehicleState.wheels.fr.distFromCenterline.toFixed(2)}m
              </span>
            )}
          </div>

          {/* Rear Left */}
          <div className={`p-2 rounded-lg border flex flex-col justify-between transition-colors ${
            vehicleState.wheels.rl.isOffTrack
              ? 'border-red-500 bg-red-950/90 text-red-200 animate-pulse'
              : vehicleState.wheels.rl.isAirborne
              ? 'border-amber-500 bg-amber-950/40 text-amber-300'
              : 'border-slate-800 bg-slate-900/60'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span className="font-semibold text-slate-300">RL (Rear Left)</span>
              <span className={`w-1.5 h-1.5 rounded-full ${vehicleState.wheels.rl.isOffTrack ? 'bg-red-500' : vehicleState.wheels.rl.isAirborne ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </div>
            <span className="text-sm font-bold text-white my-0.5">
              {vehicleState.wheels.rl.isOffTrack ? 'FALLEN!' : vehicleState.wheels.rl.isAirborne ? 'LIFT OFF' : `${rlKn} kN`}
            </span>
            {vehicleState.wheels.rl.distFromCenterline !== undefined && (
              <span className="text-[9px] text-slate-400">
                dev: {vehicleState.wheels.rl.distFromCenterline.toFixed(2)}m
              </span>
            )}
          </div>

          {/* Rear Right */}
          <div className={`p-2 rounded-lg border flex flex-col justify-between transition-colors ${
            vehicleState.wheels.rr.isOffTrack
              ? 'border-red-500 bg-red-950/90 text-red-200 animate-pulse'
              : vehicleState.wheels.rr.isAirborne
              ? 'border-amber-500 bg-amber-950/40 text-amber-300'
              : 'border-slate-800 bg-slate-900/60'
          }`}>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
              <span className="font-semibold text-slate-300">RR (Rear Right)</span>
              <span className={`w-1.5 h-1.5 rounded-full ${vehicleState.wheels.rr.isOffTrack ? 'bg-red-500' : vehicleState.wheels.rr.isAirborne ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </div>
            <span className="text-sm font-bold text-white my-0.5">
              {vehicleState.wheels.rr.isOffTrack ? 'FALLEN!' : vehicleState.wheels.rr.isAirborne ? 'LIFT OFF' : `${rrKn} kN`}
            </span>
            {vehicleState.wheels.rr.distFromCenterline !== undefined && (
              <span className="text-[9px] text-slate-400">
                dev: {vehicleState.wheels.rr.distFromCenterline.toFixed(2)}m
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

