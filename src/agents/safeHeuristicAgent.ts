/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContinuousAction, Observation } from '../types/truck';

/**
 * Pure Pursuit + Rollover-Aware Speed Governor
 * Computes steering to track the target waypoint while continuously monitoring
 * Lateral Transfer Ratio (LTR), roll rate, and banking to proactively throttle back and brake.
 */
export function computeSafeAgentAction(obs: Observation): ContinuousAction {
  // 1. Steering computation via Pure Pursuit towards primary lookahead waypoint
  let steer = 0;
  if (obs.lookahead && obs.lookahead.length > 0) {
    // Choose lookahead point based on speed (higher speed -> further lookahead)
    const lookaheadIdx = Math.min(obs.lookahead.length - 1, obs.vx > 15 ? 2 : 1);
    const targetPt = obs.lookahead[lookaheadIdx];

    // Lateral distance in vehicle frame: targetPt.relZ
    // Forward distance: targetPt.relX
    const Ld = Math.max(2.0, Math.hypot(targetPt.relX, targetPt.relZ));
    // Curvature kappa = 2 * delta_y / Ld^2
    const desiredCurvature = (2 * targetPt.relZ) / (Ld * Ld);

    // Also factor in heading error
    steer = desiredCurvature * 4.5 + obs.headingError * 0.6;

    // Strict edge avoidance: truck half-width is ~1.22m, keep vehicle centered
    const maxSafeOffset = Math.max(0.3, obs.trackHalfWidth - 1.22);
    const edgeThreat = Math.abs(obs.crossTrackError) / maxSafeOffset;
    if (edgeThreat > 0.5) {
      // Strong proportional centering correction to keep wheels safely on track
      steer += -Math.sign(obs.crossTrackError) * (edgeThreat - 0.5) * 1.6;
    }
    steer = Math.max(-1.0, Math.min(1.0, steer));
  } else {
    steer = -obs.crossTrackError * 0.5 - obs.headingError * 0.8;
    steer = Math.max(-1.0, Math.min(1.0, steer));
  }

  // 2. Rollover & Stability Speed Governor:
  // Base cruise target speed based on track width and friction
  let targetSpeed = 16.0; // ~58 km/h base
  if (obs.trackHalfWidth < 2.5) {
    targetSpeed = 10.5; // narrow ridge safety
  }
  if (obs.currentFriction < 0.4) {
    targetSpeed = 7.5; // mud / ice safety
  }

  // Speed reduction based on preview curvature or wheel edge proximity
  const upcomingCurve = obs.lookahead && obs.lookahead.length > 0 ? Math.abs(obs.lookahead[0].curvature) : 0;
  if (upcomingCurve > 0.02) {
    targetSpeed = Math.min(targetSpeed, 8.5);
  }
  if (Math.abs(obs.crossTrackError) > Math.max(0.3, obs.trackHalfWidth - 1.35)) {
    targetSpeed = Math.min(targetSpeed, 7.0); // slow down to avoid falling off cliff
  }

  // Aggressive speed reduction based on current rollover risk (LTR)
  // If LTR > 0.4, begin rolling back throttle; if LTR > 0.65, brake hard!
  const ltr = Math.abs(obs.ltr);
  const roll = Math.abs(obs.roll);

  let throttle = 0;
  if (ltr > 0.75 || roll > 0.35) {
    // Severe rollover emergency: slam brakes!
    throttle = -0.9;
    // Counter-steer slightly to unload suspension
    steer *= 0.6;
  } else if (ltr > 0.5) {
    // High stability risk: moderate braking
    throttle = -0.5;
  } else if (obs.vx > targetSpeed) {
    // Speed control: gentle braking
    throttle = Math.max(-0.6, -(obs.vx - targetSpeed) * 0.25);
  } else {
    // Accelerate smoothly to target speed
    const speedError = targetSpeed - obs.vx;
    throttle = Math.min(0.85, speedError * 0.2);
  }

  return { steer, throttle };
}
