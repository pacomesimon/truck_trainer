/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Waypoint {
  x: number;
  y: number;
  z: number;
  heading: number; // yaw angle along path tangent (rad)
  bankAngle: number; // road camber/banking angle (rad)
  gradeAngle: number; // longitudinal pitch/incline (rad)
  width: number; // track width at this point (m)
  friction: number; // surface friction coefficient μ (0.1 to 1.0)
  hasLeftCliff: boolean;
  hasRightCliff: boolean;
  leftCliffDepth: number; // meters of vertical drop
  rightCliffDepth: number;
}

export type TrackProfileType = 'narrow_ridge' | 'banked_curves' | 'rough_incline';

export interface VehicleConfig {
  chassisMass: number; // kg (e.g. 9000 kg)
  cargoMass: number; // kg (e.g. 0 to 22000 kg)
  wheelbase: number; // meters (e.g. 4.5m)
  trackWidth: number; // meters (e.g. 2.4m)
  comBaseHeight: number; // meters above ground (e.g. 1.2m)
  comOffsetX: number; // meters longitudinal offset from center (-0.8 to +0.8)
  comOffsetY: number; // meters lateral offset (-0.5 to +0.5)
  comOffsetZ: number; // meters vertical offset (-0.3 to +1.2) - higher means more rollover risk!
  suspensionStiffness: number; // N/m per corner (e.g. 120000)
  suspensionDamping: number; // N*s/m per corner (e.g. 16000)
  maxSteerAngle: number; // rad (~0.6 rad = ~34.4 deg)
  maxDriveForce: number; // N (e.g. 35000 N)
  maxBrakeForce: number; // N (e.g. 50000 N)
  tirePacejkaB: number; // Pacejka stiffness factor (~9.0)
  tirePacejkaC: number; // Pacejka shape factor (~1.3)
  tirePacejkaD: number; // Pacejka peak friction multiplier (~1.0)
  tirePacejkaE: number; // Pacejka curvature factor (~ -1.0)
  criticalRollAngle: number; // rad (~0.52 rad = ~30 deg)
  trackBoundaryTolerance: number; // meters from road edge before off-track cliff fall
}

export interface WheelState {
  normalForce: number; // F_z in Newtons
  lateralForce: number; // F_y in Newtons
  longitudinalForce: number; // F_x in Newtons
  slipAngle: number; // alpha (rad)
  slipRatio: number; // kappa
  suspensionCompression: number; // meters (positive = compressed)
  isAirborne: boolean; // true if normalForce <= 0
  isOffTrack: boolean; // true if wheel center/contact has breached the track boundary
  worldX?: number;
  worldZ?: number;
  distFromCenterline?: number;
}

export interface VehicleState {
  // 3D World Transform
  x: number;
  y: number; // vertical height of CoM in Three.js (Y-up convention)
  z: number;
  roadElevation: number; // exact surface height of the road directly beneath vehicle
  // Euler Angles (rad)
  yaw: number; // rotation around Y
  pitch: number; // rotation around X (or lateral axis)
  roll: number; // rotation around Z (or longitudinal axis)
  // Angular Rates (rad/s)
  yawRate: number; // r
  pitchRate: number; // q
  rollRate: number; // p (d_roll/dt)
  // Velocities in body frame (m/s)
  vx: number; // forward
  vy: number; // lateral
  vz: number; // vertical
  // Accelerations in body frame (m/s^2)
  ax: number;
  ay: number;
  az: number;
  // Control state
  steeringAngle: number; // rad
  throttle: number; // [-1.0 to 1.0]
  // Stability & Load
  ltr: number; // Lateral Transfer Ratio [0 to 1+]
  deltaFzLat: number; // Lateral load transfer (N)
  deltaFzLong: number; // Longitudinal load transfer (N)
  wheels: {
    fl: WheelState;
    fr: WheelState;
    rl: WheelState;
    rr: WheelState;
  };
  totalMass: number;
  effectiveComHeight: number;
  isRolledOver: boolean;
  isOffTrack: boolean;
  offTrackWheel?: string; // name of wheel that went off track (e.g. 'Front-Left', 'Front-Right')
  isGoalReached: boolean;
}

export interface ContinuousAction {
  steer: number; // normalized [-1.0, 1.0] -> maps to [-maxSteerAngle, maxSteerAngle]
  throttle: number; // normalized [-1.0, 1.0] -> -1 = full brake, 1 = full throttle
}

export interface DiscreteActionDefinition {
  index: number;
  steerNormalized: number;
  throttleNormalized: number;
  label: string;
}

export interface LookaheadPoint {
  relX: number; // forward distance in vehicle frame (m)
  relZ: number; // lateral distance in vehicle frame (m)
  relY: number; // vertical elevation difference in vehicle frame (m)
  headingDiff: number; // relative heading difference (rad)
  curvature: number;
}

export interface Observation {
  crossTrackError: number; // perpendicular distance to track centerline (m)
  headingError: number; // angle relative to target path tangent (rad)
  vx: number; // forward velocity (m/s)
  vy: number; // lateral velocity (m/s)
  yawRate: number; // rad/s
  pitch: number; // rad
  roll: number; // rad
  rollRate: number; // d_roll/dt (rad/s)
  ltr: number; // Lateral Transfer Ratio
  totalMass: number; // kg
  comOffsetX: number; // m
  comOffsetY: number; // m
  comOffsetZ: number; // m
  currentFriction: number; // μ
  currentBankAngle: number; // rad
  trackHalfWidth: number; // m
  lookahead: LookaheadPoint[]; // next N points (typically 6)
  // Flattened normalized array for neural network / RL models
  vector: number[];
}

export interface RewardBreakdown {
  progressReward: number; // vx * cos(heading_error)
  crossTrackPenalty: number; // -w1 * cross_track_error^2
  ltrPenalty: number; // -w2 * |LTR|
  rollRatePenalty: number; // -w3 * |roll_rate|
  terminalPenalty: number; // -1000 if rolled over or cliff breach
  totalStepReward: number;
}

export interface StepResult {
  observation: Observation;
  reward: number;
  rewardBreakdown: RewardBreakdown;
  terminated: boolean;
  truncated: boolean;
  info: {
    terminationReason?: 'rollover' | 'cliff_breach' | 'max_steps' | 'goal_reached';
    offTrackWheel?: string;
    speedKmh: number;
    ltr: number;
    rollDeg: number;
    crossTrackError: number;
    stepCount: number;
    distanceCovered: number;
    wheelDeviations?: {
      fl: { dist: number; maxAllowed: number; isOff: boolean };
      fr: { dist: number; maxAllowed: number; isOff: boolean };
      rl: { dist: number; maxAllowed: number; isOff: boolean };
      rr: { dist: number; maxAllowed: number; isOff: boolean };
    };
  };
}

export interface EnvironmentConfig {
  dt: number; // simulation timestep (seconds, e.g. 0.02)
  maxEpisodeSteps: number; // e.g. 1500
  w1: number; // cross track error penalty weight (default 0.2)
  w2: number; // LTR rollover risk penalty weight (default 2.5)
  w3: number; // roll rate oscillation penalty weight (default 0.8)
  terminalPenalty: number; // default -1000
  lookaheadCount: number; // default 6
  lookaheadSpacing: number; // meters between preview points (default 6.0m)
  trackType: TrackProfileType;
  vehicle: VehicleConfig;
}
