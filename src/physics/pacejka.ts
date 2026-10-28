/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Non-linear Pacejka 'Magic Formula' Tire Friction Model
 * Computes lateral force F_y as a function of tire slip angle alpha,
 * normal load F_z, and surface friction coefficient mu.
 * Incorporates non-linear saturation, friction ellipse coupling with longitudinal force F_x,
 * and slip-circle boundaries.
 */

export interface PacejkaParams {
  B: number; // Stiffness factor (controls slope at zero slip)
  C: number; // Shape factor (governs peak position, typically ~1.3)
  D: number; // Peak factor (scales with mu * Fz)
  E: number; // Curvature factor (controls curve shape after peak, typically -1.0 to 1.0)
}

export const DEFAULT_TRUCK_PACEJKA: PacejkaParams = {
  B: 8.5,
  C: 1.35,
  D: 1.0,
  E: -0.85,
};

/**
 * Computes pure lateral tire force F_y (N)
 * @param slipAngle Slip angle alpha (radians)
 * @param normalForce Vertical load F_z (Newtons)
 * @param friction Surface coefficient mu (e.g. 0.8 for asphalt, 0.4 for mud, 0.15 for ice)
 * @param params Magic formula parameters
 */
export function computePacejkaLateralForce(
  slipAngle: number,
  normalForce: number,
  friction: number = 0.8,
  params: PacejkaParams = DEFAULT_TRUCK_PACEJKA
): number {
  if (normalForce <= 0) return 0;

  const muEff = Math.max(0.05, Math.min(1.2, friction));
  const D = muEff * normalForce * params.D;
  const B = params.B;
  const C = params.C;
  const E = params.E;

  const B_alpha = B * slipAngle;
  const inner = B_alpha - E * (B_alpha - Math.atan(B_alpha));
  const Fy = D * Math.sin(C * Math.atan(inner));

  return Fy;
}

/**
 * Computes pure longitudinal tire force F_x (N) given slip ratio kappa
 * @param slipRatio Slip ratio kappa (dimensionless, [-1 to 1])
 * @param normalForce Vertical load F_z (Newtons)
 * @param friction Surface coefficient mu
 */
export function computePacejkaLongitudinalForce(
  slipRatio: number,
  normalForce: number,
  friction: number = 0.8
): number {
  if (normalForce <= 0) return 0;

  const muEff = Math.max(0.05, Math.min(1.2, friction));
  const D = muEff * normalForce;
  const B = 10.0;
  const C = 1.4;
  const E = -0.5;

  const B_kappa = B * slipRatio;
  const inner = B_kappa - E * (B_kappa - Math.atan(B_kappa));
  const Fx = D * Math.sin(C * Math.atan(inner));

  return Fx;
}

/**
 * Evaluates combined slip via friction ellipse / circle constraint
 * When longitudinal force is high (hard braking or accelerating), lateral grip is diminished.
 */
export function computeCombinedTireForces(
  slipAngle: number,
  slipRatio: number,
  normalForce: number,
  friction: number = 0.8,
  params: PacejkaParams = DEFAULT_TRUCK_PACEJKA
): { fx: number; fy: number; maxGrip: number; saturationRatio: number } {
  if (normalForce <= 0) {
    return { fx: 0, fy: 0, maxGrip: 0, saturationRatio: 0 };
  }

  const maxTotalFriction = Math.max(0.05, friction) * normalForce;
  const rawFx = computePacejkaLongitudinalForce(slipRatio, normalForce, friction);
  const rawFy = computePacejkaLateralForce(slipAngle, normalForce, friction, params);

  // Friction ellipse scaling
  const fxNormalized = rawFx / Math.max(maxTotalFriction, 1);
  const fyNormalized = rawFy / Math.max(maxTotalFriction, 1);
  const combinedMagnitude = Math.sqrt(fxNormalized * fxNormalized + fyNormalized * fyNormalized);

  let finalFx = rawFx;
  let finalFy = rawFy;

  if (combinedMagnitude > 1.0) {
    // Total traction exceeds friction circle limit -> tire slides
    finalFx = rawFx / combinedMagnitude;
    finalFy = rawFy / combinedMagnitude;
  }

  return {
    fx: finalFx,
    fy: finalFy,
    maxGrip: maxTotalFriction,
    saturationRatio: combinedMagnitude,
  };
}

/**
 * Generates curve points for visualizing Pacejka Fy vs slip angle in the Telemetry HUD
 */
export function samplePacejkaCurve(
  normalForce: number,
  friction: number = 0.8,
  params: PacejkaParams = DEFAULT_TRUCK_PACEJKA,
  maxAngleDeg: number = 25,
  steps: number = 50
): { angleDeg: number; forceKn: number }[] {
  const points: { angleDeg: number; forceKn: number }[] = [];
  const maxRad = (maxAngleDeg * Math.PI) / 180;
  const step = (2 * maxRad) / steps;

  for (let i = 0; i <= steps; i++) {
    const alpha = -maxRad + i * step;
    const fy = computePacejkaLateralForce(alpha, normalForce, friction, params);
    points.push({
      angleDeg: Number(((alpha * 180) / Math.PI).toFixed(1)),
      forceKn: Number((fy / 1000).toFixed(2)),
    });
  }
  return points;
}
