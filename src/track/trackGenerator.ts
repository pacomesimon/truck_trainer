/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Waypoint, TrackProfileType, LookaheadPoint } from '../types/truck';

export interface GeneratedTrack {
  type: TrackProfileType;
  name: string;
  description: string;
  waypoints: Waypoint[];
  totalLength: number;
}

/**
 * Normalizes angle to [-PI, PI]
 */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * 1. Narrow Ridge / Cliff Edge Track Profile
 * High mountain ridge, narrow width (4.2m), deep sheer vertical drop cliffs on both sides!
 */
export function generateNarrowRidgeTrack(numPoints: number = 250, stepSize: number = 2.5): GeneratedTrack {
  const waypoints: Waypoint[] = [];
  let currentX = 0;
  let currentZ = 0;
  let currentY = 150; // high elevation ridge
  let currentHeading = 0; // facing +X (or along path)

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    // Gentle winding along a treacherous mountain crest
    const curvature = 0.012 * Math.sin(t * 8 * Math.PI) + 0.008 * Math.cos(t * 3 * Math.PI);
    currentHeading += curvature * stepSize;

    currentX += Math.cos(currentHeading) * stepSize;
    currentZ += Math.sin(currentHeading) * stepSize;
    // Slight rolling elevation
    currentY = 150 + 8 * Math.sin(t * 4 * Math.PI);

    // Narrow width: 4.4 meters (tight for a 2.45m truck!)
    const width = 4.4;
    // Standard asphalt/dirt mix with consistent friction
    const friction = 0.78;

    waypoints.push({
      x: currentX,
      y: currentY,
      z: currentZ,
      heading: currentHeading,
      bankAngle: 0.03 * Math.sin(t * 6 * Math.PI), // subtle crown
      gradeAngle: 0.04 * Math.cos(t * 4 * Math.PI),
      width,
      friction,
      hasLeftCliff: true,
      hasRightCliff: true,
      leftCliffDepth: 180,
      rightCliffDepth: 210,
    });
  }

  return {
    type: 'narrow_ridge',
    name: "Death's Ridge (Narrow Mountain Crest)",
    description: 'A 4.4m razor-thin mountain ridge surrounded by sheer 200m vertical drop-offs. High penalty for any lateral deviation.',
    waypoints,
    totalLength: (numPoints - 1) * stepSize,
  };
}

/**
 * 2. Banked Curves Track Profile
 * High-speed winding mountain pass with aggressive banking camber (up to 20 degrees)
 * Tests high lateral g-forces, rollover limits, and side-slip mechanics.
 */
export function generateBankedCurvesTrack(numPoints: number = 280, stepSize: number = 2.5): GeneratedTrack {
  const waypoints: Waypoint[] = [];
  let currentX = 0;
  let currentZ = 0;
  let currentY = 80;
  let currentHeading = 0;

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    // Series of hairpins and sweeping fast bends
    const curveAmp = 0.038 * Math.sin(t * 10 * Math.PI) + 0.025 * Math.sin(t * 4 * Math.PI);
    currentHeading += curveAmp * stepSize;

    currentX += Math.cos(currentHeading) * stepSize;
    currentZ += Math.sin(currentHeading) * stepSize;
    currentY = 80 + 20 * Math.sin(t * 2 * Math.PI);

    // Bank angle aligns with curve direction: banked into the turn!
    // Camber up to ~18 degrees (0.31 rad)
    const bankAngle = Math.max(-0.32, Math.min(0.32, curveAmp * 9.0));
    const width = 6.2; // wider mountain road
    const friction = 0.88; // grippy mountain asphalt

    waypoints.push({
      x: currentX,
      y: currentY,
      z: currentZ,
      heading: currentHeading,
      bankAngle,
      gradeAngle: 0.06 * Math.cos(t * 2 * Math.PI),
      width,
      friction,
      hasLeftCliff: i % 40 < 20,
      hasRightCliff: i % 40 >= 20,
      leftCliffDepth: 120,
      rightCliffDepth: 95,
    });
  }

  return {
    type: 'banked_curves',
    name: 'Alpine Hairpins (Banked Curves)',
    description: 'High-speed mountain switchbacks with up to 18° banking. Generates severe lateral g-forces testing suspension compression and rollover limits.',
    waypoints,
    totalLength: (numPoints - 1) * stepSize,
  };
}

/**
 * 3. Rough / Sloped Surface Track Profile
 * Mountain incline with steep gradients (up to 16%), undulating bumps,
 * and dynamic surface friction zones (asphalt, gravel, mud, black ice).
 */
export function generateRoughInclineTrack(numPoints: number = 260, stepSize: number = 2.5): GeneratedTrack {
  const waypoints: Waypoint[] = [];
  let currentX = 0;
  let currentZ = 0;
  let currentY = 40;
  let currentHeading = 0;

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    // Winding uphill mountain climb
    const curvature = 0.02 * Math.sin(t * 6 * Math.PI);
    currentHeading += curvature * stepSize;

    currentX += Math.cos(currentHeading) * stepSize;
    currentZ += Math.sin(currentHeading) * stepSize;

    // Steep elevation rise + high frequency rough bumps
    const baseSlope = 0.12; // 12% grade uphill
    const roughBumps = 0.8 * Math.sin(i * 0.9) + 0.4 * Math.cos(i * 1.8);
    currentY += (baseSlope * stepSize) + (roughBumps * 0.1);

    // Variable friction zones:
    // Zone 1 (0 - 25%): Dry Packed Mountain Gravel (mu = 0.65)
    // Zone 2 (25% - 50%): Deep Mud & Slurry (mu = 0.35)
    // Zone 3 (50% - 75%): Glacial Black Ice Patch (mu = 0.15)
    // Zone 4 (75% - 100%): Rocky Asphalt (mu = 0.82)
    let friction = 0.65;
    if (t >= 0.25 && t < 0.5) {
      friction = 0.35; // Mud!
    } else if (t >= 0.5 && t < 0.72) {
      friction = 0.16; // Black ice!
    } else if (t >= 0.72) {
      friction = 0.82; // Asphalt
    }

    const width = 5.2;

    waypoints.push({
      x: currentX,
      y: currentY,
      z: currentZ,
      heading: currentHeading,
      bankAngle: 0.06 * Math.sin(i * 0.3), // uneven camber
      gradeAngle: baseSlope,
      width,
      friction,
      hasLeftCliff: t > 0.4,
      hasRightCliff: t <= 0.4,
      leftCliffDepth: 140,
      rightCliffDepth: 110,
    });
  }

  return {
    type: 'rough_incline',
    name: 'Glacial Pass (Rough & Sloped Terrain)',
    description: 'Uneven mountain climb with up to 14% grade, undulating bumps, and treacherous surface patches: Packed Gravel, Deep Mud (μ=0.35), and Glacial Black Ice (μ=0.16).',
    waypoints,
    totalLength: (numPoints - 1) * stepSize,
  };
}

/**
 * Master track generator router
 */
export function generateTrack(type: TrackProfileType): GeneratedTrack {
  switch (type) {
    case 'narrow_ridge':
      return generateNarrowRidgeTrack();
    case 'banked_curves':
      return generateBankedCurvesTrack();
    case 'rough_incline':
      return generateRoughInclineTrack();
    default:
      return generateNarrowRidgeTrack();
  }
}

/**
 * Finds nearest waypoint along the track to vehicle position (x, z)
 */
export function findClosestWaypointIndex(
  waypoints: Waypoint[],
  x: number,
  z: number,
  hintIndex: number = 0,
  searchWindow: number = 40
): number {
  if (waypoints.length === 0) return 0;

  // Local window search for high performance
  const start = Math.max(0, hintIndex - 10);
  const end = Math.min(waypoints.length - 1, hintIndex + searchWindow);

  let closestIdx = hintIndex;
  let minDistSq = Infinity;

  for (let i = start; i <= end; i++) {
    const wp = waypoints[i];
    const dx = wp.x - x;
    const dz = wp.z - z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestIdx = i;
    }
  }

  // If near window boundary or minimum is high, check full track
  if (minDistSq > 900) {
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dx = wp.x - x;
      const dz = wp.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }
  }

  return closestIdx;
}

/**
 * Calculates cross-track error and heading error
 * crossTrackError: signed perpendicular distance to track tangent (positive = right of track)
 * headingError: difference between vehicle yaw and road tangent (rad, [-PI, PI])
 */
export function computeTrackErrors(
  waypoints: Waypoint[],
  closestIdx: number,
  vehicleX: number,
  vehicleZ: number,
  vehicleYaw: number
): { crossTrackError: number; headingError: number; targetWp: Waypoint; roadSurfaceY: number } {
  const currentWp = waypoints[closestIdx];
  const nextIdx = Math.min(waypoints.length - 1, closestIdx + 1);
  const nextWp = waypoints[nextIdx];

  // Path tangent vector
  let tangentX = nextWp.x - currentWp.x;
  let tangentZ = nextWp.z - currentWp.z;
  const tangentLen = Math.hypot(tangentX, tangentZ);

  let s = 0;
  if (tangentLen > 0.001) {
    tangentX /= tangentLen;
    const segDx = vehicleX - currentWp.x;
    const segDz = vehicleZ - currentWp.z;
    const rawS = (segDx * (nextWp.x - currentWp.x) + segDz * (nextWp.z - currentWp.z)) / (tangentLen * tangentLen);
    // Allow s to extrapolate along start staging pad (down to -2.5) or finish pad (up to 2.5)
    s = Math.max(-2.5, Math.min(2.5, rawS));
  } else {
    tangentX = Math.cos(currentWp.heading);
    tangentZ = Math.sin(currentWp.heading);
  }

  // Normal vector to path (90 deg clockwise)
  const normalX = -tangentZ;
  const normalZ = tangentX;

  // Vector from waypoint to vehicle
  const dx = vehicleX - currentWp.x;
  const dz = vehicleZ - currentWp.z;

  // Signed cross-track error: projection onto normal vector
  const crossTrackError = dx * normalX + dz * normalZ;

  // Target path heading
  const pathHeading = Math.atan2(tangentZ, tangentX);
  const headingError = normalizeAngle(vehicleYaw - pathHeading);

  // Exact interpolated road elevation and banking
  const centerY = currentWp.y + s * (nextWp.y - currentWp.y);
  const bankAngle = currentWp.bankAngle + s * (nextWp.bankAngle - currentWp.bankAngle);
  // Elevation on the banked road surface directly beneath vehicle (normal distance)
  const roadSurfaceY = centerY + crossTrackError * Math.sin(bankAngle);

  return {
    crossTrackError,
    headingError,
    targetWp: currentWp,
    roadSurfaceY,
  };
}

/**
 * Calculates perpendicular cross-track distance from any 2D point (e.g. wheel contact)
 * to the track centerline at the given waypoint section.
 */
export function computePointCrossTrackDistance(
  waypoints: Waypoint[],
  closestIdx: number,
  px: number,
  pz: number
): { distFromCenterline: number; signedDist: number; wp: Waypoint } {
  const currentWp = waypoints[closestIdx];
  const nextIdx = Math.min(waypoints.length - 1, closestIdx + 1);
  const nextWp = waypoints[nextIdx];

  let tangentX = nextWp.x - currentWp.x;
  let tangentZ = nextWp.z - currentWp.z;
  const tangentLen = Math.hypot(tangentX, tangentZ);

  if (tangentLen > 0.001) {
    tangentX /= tangentLen;
    tangentZ /= tangentLen;
  } else {
    tangentX = Math.cos(currentWp.heading);
    tangentZ = Math.sin(currentWp.heading);
  }

  const normalX = -tangentZ;
  const normalZ = tangentX;

  const dx = px - currentWp.x;
  const dz = pz - currentWp.z;

  const signedDist = dx * normalX + dz * normalZ;

  return {
    distFromCenterline: Math.abs(signedDist),
    signedDist,
    wp: currentWp,
  };
}

/**
 * Extracts N lookahead preview waypoints in vehicle body coordinates
 */
export function extractLookaheadPoints(
  waypoints: Waypoint[],
  startIndex: number,
  vehicleX: number,
  vehicleY: number,
  vehicleZ: number,
  vehicleYaw: number,
  count: number = 6,
  indexStride: number = 3
): LookaheadPoint[] {
  const lookaheads: LookaheadPoint[] = [];
  const cosYaw = Math.cos(-vehicleYaw);
  const sinYaw = Math.sin(-vehicleYaw);

  for (let k = 1; k <= count; k++) {
    const targetIdx = Math.min(waypoints.length - 1, startIndex + k * indexStride);
    const wp = waypoints[targetIdx];

    // Global delta
    const dx = wp.x - vehicleX;
    const dz = wp.z - vehicleZ;
    const dy = wp.y - vehicleY;

    // Transform to vehicle body coordinates:
    // relX: forward along vehicle heading
    // relZ: lateral offset perpendicular to vehicle heading
    const relX = dx * Math.cos(vehicleYaw) + dz * Math.sin(vehicleYaw);
    const relZ = -dx * Math.sin(vehicleYaw) + dz * Math.cos(vehicleYaw);

    const headingDiff = normalizeAngle(wp.heading - vehicleYaw);

    lookaheads.push({
      relX,
      relZ,
      relY: dy,
      headingDiff,
      curvature: (wp.heading - waypoints[Math.max(0, targetIdx - 1)].heading) / 2.5,
    });
  }

  return lookaheads;
}
