/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Observation } from '../types/truck';
import { Eye, Copy, Check } from 'lucide-react';

interface ObservationInspectorProps {
  observation: Observation;
}

export const ObservationInspector: React.FC<ObservationInspectorProps> = ({ observation }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyVector = () => {
    navigator.clipboard.writeText(JSON.stringify(observation.vector, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3 text-xs backdrop-blur-md shadow-xl text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
        <div className="flex items-center gap-2 font-bold text-sky-400">
          <Eye className="w-4 h-4" />
          <span>RL OBSERVATION SPACE INSPECTOR ({observation.vector.length}-DIM CONTINUOUS VECTOR)</span>
        </div>
        <button
          onClick={handleCopyVector}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied JSON' : 'Copy Vector'}</span>
        </button>
      </div>

      {/* Semantic Key-Value Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 font-mono text-[11px]">
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Cross-Track Error (e_ct):</span>
          <span className="text-emerald-300 font-bold">{observation.crossTrackError.toFixed(3)} m</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Heading Error (e_ψ):</span>
          <span className="text-sky-300 font-bold">{observation.headingError.toFixed(3)} rad ({(observation.headingError * 180 / Math.PI).toFixed(1)}°)</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Velocities (v_x, v_y):</span>
          <span className="text-amber-300 font-bold">{observation.vx.toFixed(2)} m/s, {observation.vy.toFixed(2)} m/s</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Yaw & Roll Rate:</span>
          <span className="text-purple-300 font-bold">{observation.yawRate.toFixed(2)} r/s, {observation.rollRate.toFixed(2)} r/s</span>
        </div>

        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Pitch & Roll Angle:</span>
          <span className="text-rose-300 font-bold">{(observation.pitch * 180 / Math.PI).toFixed(1)}°, {(observation.roll * 180 / Math.PI).toFixed(1)}°</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Lateral Transfer Ratio (LTR):</span>
          <span className="text-orange-300 font-bold">{observation.ltr.toFixed(3)}</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Total Mass & CoM Offsets:</span>
          <span className="text-indigo-300 font-bold">{(observation.totalMass / 1000).toFixed(1)}t [x:{observation.comOffsetX.toFixed(2)}, y:{observation.comOffsetY.toFixed(2)}, z:{observation.comOffsetZ.toFixed(2)}]</span>
        </div>
        <div className="bg-slate-950/70 p-2 rounded border border-slate-800">
          <span className="text-slate-400 block text-[10px]">Track Friction & Half-Width:</span>
          <span className="text-cyan-300 font-bold">μ={observation.currentFriction.toFixed(2)}, W/2={observation.trackHalfWidth.toFixed(1)}m</span>
        </div>
      </div>

      {/* Lookahead Points Preview */}
      <div className="mb-2.5">
        <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block mb-1">
          Lookahead Waypoint Preview (Vehicle Body Relative Coordinates Δx_rel, Δz_rel, Δy_rel):
        </span>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 font-mono text-[10px]">
          {observation.lookahead.map((pt, idx) => (
            <div key={idx} className="bg-slate-950/80 p-1.5 rounded border border-slate-800/80 text-center">
              <span className="text-sky-400 font-bold block">WP +{idx + 1}</span>
              <span className="text-slate-300">X: {pt.relX.toFixed(1)}m</span>
              <span className="text-slate-400 block">Z: {pt.relZ.toFixed(1)}m</span>
            </div>
          ))}
        </div>
      </div>

      {/* Raw Normalized Float Vector Grid */}
      <div>
        <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block mb-1">
          Raw Normalized Float Tensor Array (Input to Neural Net Policy):
        </span>
        <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[10px] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {observation.vector.map((val, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-sky-200"
              title={`Dimension [${idx}]`}
            >
              [{idx}] {val.toFixed(3)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
