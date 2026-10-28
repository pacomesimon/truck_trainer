/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContinuousAction, DiscreteActionDefinition } from '../types/truck';

export const STEERING_LEVELS = [-1.0, -0.67, -0.33, 0.0, 0.33, 0.67, 1.0];
export const THROTTLE_LEVELS = [-1.0, -0.5, 0.0, 0.5, 1.0];

export const TOTAL_DISCRETE_ACTIONS = STEERING_LEVELS.length * THROTTLE_LEVELS.length; // 35

/**
 * Creates list of all 35 discrete actions with human-readable labels
 */
export function buildDiscreteActionTable(): DiscreteActionDefinition[] {
  const table: DiscreteActionDefinition[] = [];
  let index = 0;

  for (let s = 0; s < STEERING_LEVELS.length; s++) {
    const steer = STEERING_LEVELS[s];
    let steerLabel = 'Center';
    if (steer < -0.5) steerLabel = 'Hard Left';
    else if (steer < 0) steerLabel = 'Soft Left';
    else if (steer > 0.5) steerLabel = 'Hard Right';
    else if (steer > 0) steerLabel = 'Soft Right';

    for (let t = 0; t < THROTTLE_LEVELS.length; t++) {
      const throttle = THROTTLE_LEVELS[t];
      let throttleLabel = 'Coast';
      if (throttle === -1.0) throttleLabel = 'Max Brake';
      else if (throttle === -0.5) throttleLabel = 'Mod Brake';
      else if (throttle === 0.5) throttleLabel = 'Mod Throttle';
      else if (throttle === 1.0) throttleLabel = 'Full Throttle';

      table.push({
        index,
        steerNormalized: steer,
        throttleNormalized: throttle,
        label: `${steerLabel} + ${throttleLabel}`,
      });
      index++;
    }
  }

  return table;
}

export const DISCRETE_ACTIONS = buildDiscreteActionTable();

/**
 * Maps a discrete action index (0 to 34) into continuous control values
 */
export function discreteToAction(actionIndex: number): ContinuousAction {
  const safeIdx = Math.max(0, Math.min(TOTAL_DISCRETE_ACTIONS - 1, Math.floor(actionIndex)));
  const def = DISCRETE_ACTIONS[safeIdx];
  return {
    steer: def.steerNormalized,
    throttle: def.throttleNormalized,
  };
}

/**
 * Finds the closest discrete action index for given continuous steer and throttle values
 */
export function continuousToDiscrete(steer: number, throttle: number): number {
  let closestIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < DISCRETE_ACTIONS.length; i++) {
    const a = DISCRETE_ACTIONS[i];
    const ds = a.steerNormalized - steer;
    const dt = a.throttleNormalized - throttle;
    const dist = ds * ds + dt * dt;
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }

  return closestIdx;
}
