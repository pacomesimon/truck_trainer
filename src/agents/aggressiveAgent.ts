/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContinuousAction, Observation } from '../types/truck';

/**
 * Aggressive Speed Demon Agent
 * Pushes heavy truck at high speeds without rollover or LTR awareness.
 * Used for demonstrating rollover physics, suspension bottoming out, and cliff drop-offs.
 */
export function computeAggressiveAgentAction(obs: Observation): ContinuousAction {
  let steer = 0;
  if (obs.lookahead && obs.lookahead.length > 0) {
    const targetPt = obs.lookahead[0];
    const Ld = Math.max(1.5, Math.hypot(targetPt.relX, targetPt.relZ));
    const desiredCurvature = (2 * targetPt.relZ) / (Ld * Ld);
    steer = Math.max(-1.0, Math.min(1.0, desiredCurvature * 5.0 + obs.headingError * 0.5));
  } else {
    steer = Math.max(-1.0, Math.min(1.0, -obs.crossTrackError * 0.5));
  }

  // Maintains high throttle (0.9 to 1.0) with minimal braking
  let throttle = 0.95;
  if (obs.vx > 24) {
    // only slightly tap brake if exceeding 86 km/h
    throttle = 0.3;
  }

  return { steer, throttle };
}
