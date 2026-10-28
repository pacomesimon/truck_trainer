/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { VehicleState } from '../types/truck';
import { samplePacejkaCurve } from '../physics/pacejka';
import { Activity, X } from 'lucide-react';

interface TireDynamicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleState: VehicleState;
  roadFriction: number;
}

export const TireDynamicsModal: React.FC<TireDynamicsModalProps> = ({
  isOpen,
  onClose,
  vehicleState,
  roadFriction,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Padding
    const padX = 50;
    const padY = 40;
    const graphW = width - padX * 2;
    const graphH = height - padY * 2;
    const originY = padY + graphH / 2;
    const originX = padX + graphW / 2;

    // Draw Axes & Grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, originY);
    ctx.lineTo(width - padX, originY); // X axis
    ctx.moveTo(originX, padY);
    ctx.lineTo(originX, height - padY); // Y axis
    ctx.stroke();

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Slip Angle α (degrees)', originX, height - 10);
    ctx.save();
    ctx.translate(15, originY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Lateral Force F_y (kN)', 0, 0);
    ctx.restore();

    // Sample Pacejka Curve for reference average normal force
    const avgNormalForce = Math.max(10000, vehicleState.totalMass * 9.81 * 0.25);
    const curvePoints = samplePacejkaCurve(avgNormalForce, roadFriction, undefined, 20, 80);

    const maxAngleDeg = 20;
    const maxForceKn = Math.max(50, (avgNormalForce * roadFriction * 1.3) / 1000);

    const mapX = (deg: number) => originX + (deg / maxAngleDeg) * (graphW / 2);
    const mapY = (kn: number) => originY - (kn / maxForceKn) * (graphH / 2);

    // Draw Pacejka theoretical curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    curvePoints.forEach((pt, i) => {
      const px = mapX(pt.angleDeg);
      const py = mapY(pt.forceKn);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Plot individual tire current operating points
    const wheels = [
      { id: 'FL', state: vehicleState.wheels.fl, color: '#f87171' },
      { id: 'FR', state: vehicleState.wheels.fr, color: '#fb923c' },
      { id: 'RL', state: vehicleState.wheels.rl, color: '#a78bfa' },
      { id: 'RR', state: vehicleState.wheels.rr, color: '#34d399' },
    ];

    wheels.forEach((w) => {
      const angleDeg = (w.state.slipAngle * 180) / Math.PI;
      const forceKn = w.state.lateralForce / 1000;
      const px = mapX(Math.max(-maxAngleDeg, Math.min(maxAngleDeg, angleDeg)));
      const py = mapY(Math.max(-maxForceKn, Math.min(maxForceKn, forceKn)));

      // Draw point
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(` ${w.id}: ${forceKn.toFixed(1)}kN`, px + 8, py - 4);
    });
  }, [isOpen, vehicleState, roadFriction]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2 font-bold text-sky-400">
            <Activity className="w-5 h-5" />
            <span>NON-LINEAR PACEJKA 'MAGIC FORMULA' TIRE DYNAMICS</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-3">
          Live visualization of tire lateral traction saturation curve <code className="text-sky-300">F_y(α, F_z, μ)</code>.
          Notice how the outside loaded tire generates peak lateral force while the inside unloaded tire suffers loss of grip or lifts off.
        </p>

        <div className="bg-slate-950 rounded-xl p-2 border border-slate-800 flex justify-center mb-3">
          <canvas ref={canvasRef} width={500} height={240} className="w-full h-auto max-w-[500px]" />
        </div>

        {/* Tire Status Table */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-red-400 font-bold block">Front Left (FL)</span>
            <span className="text-slate-400 block">F_z: {(vehicleState.wheels.fl.normalForce / 1000).toFixed(1)} kN</span>
            <span className="text-slate-300">α: {((vehicleState.wheels.fl.slipAngle * 180) / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-amber-400 font-bold block">Front Right (FR)</span>
            <span className="text-slate-400 block">F_z: {(vehicleState.wheels.fr.normalForce / 1000).toFixed(1)} kN</span>
            <span className="text-slate-300">α: {((vehicleState.wheels.fr.slipAngle * 180) / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-purple-400 font-bold block">Rear Left (RL)</span>
            <span className="text-slate-400 block">F_z: {(vehicleState.wheels.rl.normalForce / 1000).toFixed(1)} kN</span>
            <span className="text-slate-300">α: {((vehicleState.wheels.rl.slipAngle * 180) / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-emerald-400 font-bold block">Rear Right (RR)</span>
            <span className="text-slate-400 block">F_z: {(vehicleState.wheels.rr.normalForce / 1000).toFixed(1)} kN</span>
            <span className="text-slate-300">α: {((vehicleState.wheels.rr.slipAngle * 180) / Math.PI).toFixed(1)}°</span>
          </div>
        </div>
      </div>
    </div>
  );
};
