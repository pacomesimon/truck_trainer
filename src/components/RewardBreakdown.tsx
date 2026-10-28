/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RewardBreakdown as IRewardBreakdown } from '../types/truck';
import { Award, TrendingUp, AlertOctagon, ShieldAlert, Activity, Navigation } from 'lucide-react';

interface RewardBreakdownProps {
  breakdown: IRewardBreakdown;
  cumulativeReward: number;
  stepCount: number;
}

export const RewardBreakdown: React.FC<RewardBreakdownProps> = ({
  breakdown,
  cumulativeReward,
  stepCount,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3 text-xs backdrop-blur-md shadow-xl text-slate-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-100 text-[11px] tracking-wide">
          <Award className="w-4 h-4 text-emerald-400" />
          <span>RL REWARD FUNCTION MECHANICS</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[10px] text-slate-400">Step {stepCount}</span>
          <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
            cumulativeReward >= 0
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : 'bg-red-950/80 text-red-300 border border-red-800'
          }`}>
            Cum: {cumulativeReward.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Formula Header Banner */}
      <div className="text-[10px] font-mono text-slate-300 mb-2.5 bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800 overflow-x-auto whitespace-nowrap">
        R = <span className="text-emerald-400 font-semibold">v_x·cos(e_ψ)</span>
        {' - '}<span className="text-rose-400 font-semibold">w₁·e_ct²</span>
        {' - '}<span className="text-amber-400 font-semibold">w₂·|LTR|</span>
        {' - '}<span className="text-purple-400 font-semibold">w₃·|dφ/dt|</span>
      </div>

      {/* Stacked Metric Rows (Clean Vertical Layout) */}
      <div className="flex flex-col gap-1.5 font-mono">
        {/* Forward progress */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/25 border border-emerald-800/40 hover:bg-emerald-950/35 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-emerald-900/60 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5 flex-wrap">
                <span>Forward Progress</span>
                <span className="text-[9px] font-normal text-emerald-400/90 px-1.5 py-0.2 bg-emerald-950/80 rounded border border-emerald-800/60">
                  v_x · cos(e_ψ)
                </span>
              </div>
              <div className="text-[9px] text-slate-400 font-sans">Trajectory alignment velocity</div>
            </div>
          </div>
          <div className="text-sm font-extrabold text-emerald-300 shrink-0 ml-2">
            +{breakdown.progressReward.toFixed(2)}
          </div>
        </div>

        {/* Cross-track error */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-rose-950/25 border border-rose-800/40 hover:bg-rose-950/35 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-rose-900/60 border border-rose-700/60 flex items-center justify-center text-rose-400 shrink-0">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5 flex-wrap">
                <span>Path Deviation</span>
                <span className="text-[9px] font-normal text-rose-400/90 px-1.5 py-0.2 bg-rose-950/80 rounded border border-rose-800/60">
                  -w₁ · e_ct²
                </span>
              </div>
              <div className="text-[9px] text-slate-400 font-sans">Cross-track displacement penalty</div>
            </div>
          </div>
          <div className="text-sm font-extrabold text-rose-300 shrink-0 ml-2">
            {breakdown.crossTrackPenalty.toFixed(2)}
          </div>
        </div>

        {/* LTR Rollover Penalty */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-amber-950/25 border border-amber-800/40 hover:bg-amber-950/35 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-amber-900/60 border border-amber-700/60 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 flex-wrap">
                <span>LTR Rollover Risk</span>
                <span className="text-[9px] font-normal text-amber-400/90 px-1.5 py-0.2 bg-amber-950/80 rounded border border-amber-800/60">
                  -w₂ · |LTR|
                </span>
              </div>
              <div className="text-[9px] text-slate-400 font-sans">Dynamic load transfer instability</div>
            </div>
          </div>
          <div className="text-sm font-extrabold text-amber-300 shrink-0 ml-2">
            {breakdown.ltrPenalty.toFixed(2)}
          </div>
        </div>

        {/* Roll Rate Oscillation */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-purple-950/25 border border-purple-800/40 hover:bg-purple-950/35 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-purple-900/60 border border-purple-700/60 flex items-center justify-center text-purple-400 shrink-0">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5 flex-wrap">
                <span>Body Oscillation</span>
                <span className="text-[9px] font-normal text-purple-400/90 px-1.5 py-0.2 bg-purple-950/80 rounded border border-purple-800/60">
                  -w₃ · |dφ/dt|
                </span>
              </div>
              <div className="text-[9px] text-slate-400 font-sans">Chassis roll-rate damping penalty</div>
            </div>
          </div>
          <div className="text-sm font-extrabold text-purple-300 shrink-0 ml-2">
            {breakdown.rollRatePenalty.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Terminal penalty notice if fired */}
      {breakdown.terminalPenalty !== 0 && (
        <div className="mt-2 p-2 rounded-lg bg-red-900/80 border border-red-500 text-red-100 flex items-center justify-between font-mono text-[11px] animate-pulse">
          <span className="flex items-center gap-1.5 font-bold">
            <AlertOctagon className="w-4 h-4 text-red-300" /> Terminal Failure Penalty
          </span>
          <span className="font-black text-sm">{breakdown.terminalPenalty.toFixed(0)}</span>
        </div>
      )}

      {/* Current Step Net Total */}
      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
        <span className="text-slate-400">Current Step Net Scalar Reward:</span>
        <span className={`font-mono font-extrabold text-base ${
          breakdown.totalStepReward >= 0 ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {breakdown.totalStepReward >= 0 ? `+${breakdown.totalStepReward.toFixed(2)}` : breakdown.totalStepReward.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

