/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VehicleConfig, VehicleState, WheelState, ContinuousAction } from '../types/truck';
import { computeCombinedTireForces, DEFAULT_TRUCK_PACEJKA } from './pacejka';

const GRAVITY = 9.81;

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassisMass: 9000, // 9 metric tons unladen truck
  cargoMass: 14000, // 14 tons payload (total 23 tons)
  wheelbase: 4.6, // 4.6 m wheelbase
  trackWidth: 2.45, // 2.45 m track width
  comBaseHeight: 1.25, // 1.25 m baseline CoM height
  comOffsetX: 0.0, // centered
  comOffsetY: 0.0, // centered
  comOffsetZ: 0.45, // elevated cargo mass (total h = 1.7m)
  suspensionStiffness: 140000, // N/m per corner
  suspensionDamping: 18000, // N*s/m per corner
  maxSteerAngle: 0.58, // ~33.2 deg
  maxDriveForce: 38000, // N
  maxBrakeForce: 65000, // N
  tirePacejkaB: DEFAULT_TRUCK_PACEJKA.B,
  tirePacejkaC: DEFAULT_TRUCK_PACEJKA.C,
  tirePacejkaD: DEFAULT_TRUCK_PACEJKA.D,
  tirePacejkaE: DEFAULT_TRUCK_PACEJKA.E,
  criticalRollAngle: 0.5236, // 30 degrees
  trackBoundaryTolerance: 1.0, // meters outside track width before cliff drop
};

/**
 * Creates initial vehicle state
 */
export function createInitialVehicleState(
  startX: number = 0,
  startY: number = 0,
  startZ: number = 0,
  startYaw: number = 0,
  startGradeAngle: number = 0,
  startBankAngle: number = 0,
  config: VehicleConfig = DEFAULT_VEHICLE_CONFIG
): VehicleState {
  const totalMass = config.chassisMass + config.cargoMass;
  const effectiveComHeight = config.comBaseHeight + config.comOffsetZ;

  const initialWheelState: WheelState = {
    normalForce: (totalMass * GRAVITY) / 4,
    lateralForce: 0,
    longitudinalForce: 0,
    slipAngle: 0,
    slipRatio: 0,
    suspensionCompression: (totalMass * GRAVITY) / (4 * config.suspensionStiffness),
    isAirborne: false,
    isOffTrack: false,
  };

  return {
    x: startX,
    y: startY + effectiveComHeight,
    z: startZ,
    roadElevation: startY,
    yaw: startYaw,
    pitch: startGradeAngle,
    roll: startBankAngle,
    yawRate: 0,
    pitchRate: 0,
    rollRate: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    ax: 0,
    ay: 0,
    az: 0,
    steeringAngle: 0,
    throttle: 0,
    ltr: 0,
    deltaFzLat: 0,
    deltaFzLong: 0,
    wheels: {
      fl: { ...initialWheelState },
      fr: { ...initialWheelState },
      rl: { ...initialWheelState },
      rr: { ...initialWheelState },
    },
    totalMass,
    effectiveComHeight,
    isRolledOver: false,
    isOffTrack: false,
    isGoalReached: false,
  };
}

/**
 * Simulates one physics integration step dt for the heavy truck
 */
export function stepVehicleDynamics(
  state: VehicleState,
  action: ContinuousAction,
  roadFriction: number,
  roadBankAngle: number,
  roadGradeAngle: number,
  roadElevation: number,
  dt: number,
  config: VehicleConfig
): VehicleState {
  // If already rolled over or breached, freeze physics or let tumble
  if (state.isRolledOver || state.isOffTrack) {
    return { ...state };
  }

  const totalMass = config.chassisMass + config.cargoMass;
  const h = config.comBaseHeight + config.comOffsetZ; // CoM height
  const w = config.trackWidth;
  const L = config.wheelbase;

  // Longitudinal distance from CoM to front and rear axles
  const a = Math.max(0.5, L / 2 - config.comOffsetX);
  const b = Math.max(0.5, L / 2 + config.comOffsetX);

  // Moments of inertia for heavy truck box model
  const Izz = (1 / 12) * totalMass * (L * L + w * w);
  const Ixx = (1 / 12) * totalMass * (w * w + (h * 1.5) * (h * 1.5)) + totalMass * (h * h);
  const Iyy = (1 / 12) * totalMass * (L * L + (h * 1.5) * (h * 1.5));

  // Map control inputs with realistic actuator slew rates
  const targetSteering = Math.max(-1, Math.min(1, action.steer)) * config.maxSteerAngle;
  const maxSteerSpeed = 1.6; // rad/s
  const steerDelta = targetSteering - state.steeringAngle;
  const steeringAngle = state.steeringAngle + Math.sign(steerDelta) * Math.min(Math.abs(steerDelta), maxSteerSpeed * dt);

  const targetThrottle = Math.max(-1, Math.min(1, action.throttle));
  const throttle = state.throttle + (targetThrottle - state.throttle) * Math.min(1, 10 * dt);

  // Longitudinal Drive or Brake force
  let driveForce = 0;
  let brakeForce = 0;
  if (throttle >= 0) {
    driveForce = throttle * config.maxDriveForce;
  } else {
    brakeForce = -throttle * config.maxBrakeForce;
  }

  // Current velocities in body frame: truck is forward-facing in Drive (D) transmission
  const vx = Math.max(0, state.vx);
  const vy = state.vy;
  const r = state.yawRate;

  // Slip angles at front and rear axles
  // Front wheel direction has steering angle delta
  const frontVy = vy + a * r;
  const rearVy = vy - b * r;
  const vxRef = Math.max(vx, 0.8);

  const alphaF = Math.atan2(frontVy, vxRef) - steeringAngle;
  const alphaR = Math.atan2(rearVy, vxRef);

  // Slip ratio kappa for braking/traction:
  // Forward drive torque generates positive traction slip
  const wheelDriveSlip = throttle > 0 ? (driveForce / Math.max(totalMass * GRAVITY, 1)) * 0.15 : 0;
  // Brakes only retard forward motion (vx > 0). When vehicle is stopped, brakes lock wheels at 0 (never accelerate in reverse).
  const brakeEffectiveness = Math.max(0, Math.min(1.0, vx / 0.5));
  const wheelBrakeSlip = throttle < 0 ? (brakeForce / Math.max(totalMass * GRAVITY, 1)) * -0.2 * brakeEffectiveness : 0;
  const kappaF = wheelBrakeSlip; // front wheels steer & brake
  const kappaR = wheelDriveSlip + wheelBrakeSlip; // rear wheels drive & brake

  // 1. Static Load Distribution considering mass and CoM lateral/longitudinal offsets
  const staticFzFront = (totalMass * GRAVITY * b) / (2 * L);
  const staticFzRear = (totalMass * GRAVITY * a) / (2 * L);
  const staticLatShiftFront = ((totalMass * GRAVITY * config.comOffsetY) / w) * (b / L);
  const staticLatShiftRear = ((totalMass * GRAVITY * config.comOffsetY) / w) * (a / L);

  const staticFL = Math.max(0, staticFzFront - staticLatShiftFront);
  const staticFR = Math.max(0, staticFzFront + staticLatShiftFront);
  const staticRL = Math.max(0, staticFzRear - staticLatShiftRear);
  const staticRR = Math.max(0, staticFzRear + staticLatShiftRear);

  // 2. Dynamic Load Transfer:
  // Lateral load transfer: Delta F_z_lat = (M * a_y * h) / w
  // Longitudinal load transfer: Delta F_z_long = (M * a_x * h) / (2 * L)
  const ayCurrent = state.ay;
  const axCurrent = state.ax;

  const deltaFzLat = (totalMass * ayCurrent * h) / w;
  const deltaFzLong = (totalMass * axCurrent * h) / (2 * L);

  // Wheel load distribution:
  // FL / RL are Left, FR / RR are Right
  // Lateral transfer moves weight from inside to outside wheel:
  // (Left loses weight during right turn where ay > 0; right gains weight)
  let fzFL = staticFL - deltaFzLat * (b / L) - deltaFzLong;
  let fzFR = staticFR + deltaFzLat * (b / L) - deltaFzLong;
  let fzRL = staticRL - deltaFzLat * (a / L) + deltaFzLong;
  let fzRR = staticRR + deltaFzLat * (a / L) + deltaFzLong;

  // Unilateral ground contact constraint: normal force cannot be negative
  const isFlAirborne = fzFL <= 0;
  const isFrAirborne = fzFR <= 0;
  const isRlAirborne = fzRL <= 0;
  const isRrAirborne = fzRR <= 0;

  fzFL = Math.max(0, fzFL);
  fzFR = Math.max(0, fzFR);
  fzRL = Math.max(0, fzRL);
  fzRR = Math.max(0, fzRR);

  // Rollover stability metric: Lateral Transfer Ratio (LTR)
  // LTR = |F_z_left - F_z_right| / (F_z_left + F_z_right)
  const fzLeft = fzFL + fzRL;
  const fzRight = fzFR + fzRR;
  const totalNormalForce = fzLeft + fzRight;
  const ltr = totalNormalForce > 1 ? Math.abs(fzLeft - fzRight) / totalNormalForce : 1.0;

  // 3. Compute Tire Forces via Pacejka Magic Formula with combined slip and road friction
  const pacejka = {
    B: config.tirePacejkaB,
    C: config.tirePacejkaC,
    D: config.tirePacejkaD,
    E: config.tirePacejkaE,
  };

  const tireFL = computeCombinedTireForces(alphaF, kappaF, fzFL, roadFriction, pacejka);
  const tireFR = computeCombinedTireForces(alphaF, kappaF, fzFR, roadFriction, pacejka);
  const tireRL = computeCombinedTireForces(alphaR, kappaR, fzRL, roadFriction, pacejka);
  const tireRR = computeCombinedTireForces(alphaR, kappaR, fzRR, roadFriction, pacejka);

  // Resolve front wheel forces into vehicle body coordinate frame (rotating by steering angle)
  const cosSteer = Math.cos(steeringAngle);
  const sinSteer = Math.sin(steeringAngle);

  // Wheel forces in wheel frame: fx is longitudinal, fy is lateral
  // When steer > 0, front wheels turn left (or right based on sign convention)
  const frontBodyFxFL = tireFL.fx * cosSteer - (-tireFL.fy) * sinSteer;
  const frontBodyFyFL = tireFL.fx * sinSteer + (-tireFL.fy) * cosSteer;

  const frontBodyFxFR = tireFR.fx * cosSteer - (-tireFR.fy) * sinSteer;
  const frontBodyFyFR = tireFR.fx * sinSteer + (-tireFR.fy) * cosSteer;

  const rearBodyFxRL = tireRL.fx;
  const rearBodyFyRL = -tireRL.fy;

  const rearBodyFxRR = tireRR.fx;
  const rearBodyFyRR = -tireRR.fy;

  // Total forces along body X (longitudinal) and body Y (lateral)
  const totalTireFx = frontBodyFxFL + frontBodyFxFR + rearBodyFxRL + rearBodyFxRR;
  const totalTireFy = frontBodyFyFL + frontBodyFyFR + rearBodyFyRL + rearBodyFyRR;

  // Aerodynamic drag & Rolling resistance
  const airDragCoeff = 0.5 * 1.225 * 0.7 * 8.5; // 0.5 * rho * Cd * Area (Cd=0.7, A=8.5m^2 for truck)
  const aeroDrag = Math.sign(vx) * airDragCoeff * vx * vx;
  const rollingResistance = totalMass * GRAVITY * 0.012 * Math.sign(vx);

  // Gravity forces along road grade (incline) and road bank (camber)
  const gradeGravityForce = totalMass * GRAVITY * Math.sin(roadGradeAngle);
  const bankGravityForce = totalMass * GRAVITY * Math.sin(roadBankAngle);

  // Net accelerations in body frame:
  // dv_x/dt = Fx/M + vy * r - g * sin(grade) - drag
  const ax = (totalTireFx - aeroDrag - rollingResistance) / totalMass + vy * r - gradeGravityForce / totalMass;
  // dv_y/dt = Fy/M - vx * r + g * sin(bank)
  const ay = totalTireFy / totalMass - vx * r + bankGravityForce / totalMass;

  // Yaw angular acceleration: d_r/dt = Torque_z / I_zz
  const torqueZ = (frontBodyFyFL + frontBodyFyFR) * a - (rearBodyFyRL + rearBodyFyRR) * b;
  const dYawRate = torqueZ / Izz;

  // 4. Body Roll & Pitch Dynamics:
  // Roll equation: I_xx * d2_phi/dt2 = M * ay * h * cos(phi) + M * g * h * sin(phi) - K_roll * phi - C_roll * d_phi/dt
  // Total roll stiffness from 4 suspension springs: K_roll = 2 * (k_susp * (w/2)^2)
  const kRoll = 2 * config.suspensionStiffness * Math.pow(w / 2, 2);
  const cRoll = 2 * config.suspensionDamping * Math.pow(w / 2, 2);

  const rollMoment = totalMass * ay * h * Math.cos(state.roll) + totalMass * GRAVITY * h * Math.sin(state.roll);
  const restoringRollMoment = kRoll * (state.roll - roadBankAngle) + cRoll * state.rollRate;
  const dRollRate = (rollMoment - restoringRollMoment) / Ixx;

  // Pitch equation from longitudinal acceleration & road grade
  const kPitch = 2 * config.suspensionStiffness * Math.pow(L / 2, 2);
  const cPitch = 2 * config.suspensionDamping * Math.pow(L / 2, 2);
  const pitchMoment = -totalMass * ax * h;
  const restoringPitchMoment = kPitch * (state.pitch - roadGradeAngle) + cPitch * state.pitchRate;
  const dPitchRate = (pitchMoment - restoringPitchMoment) / Iyy;

  // Numerical Integration (Semi-implicit Euler for stability)
  const newRollRate = state.rollRate + dRollRate * dt;
  const newRoll = state.roll + newRollRate * dt;

  const newPitchRate = state.pitchRate + dPitchRate * dt;
  const newPitch = state.pitch + newPitchRate * dt;

  const newYawRate = state.yawRate + dYawRate * dt;
  const newYaw = state.yaw + newYawRate * dt;

  const rawNewVx = state.vx + ax * dt;
  // In forward Drive transmission, braking near stop locks wheels at 0 without backward roll:
  const newVx = (throttle < 0 && rawNewVx < 0.1) ? 0 : Math.max(0, rawNewVx);
  const newVy = state.vy + ay * dt;

  // World coordinates integration
  // Three.js coordinates: Y is UP, X and Z are horizontal ground plane
  // Facing direction yaw: 0 points towards +Z or +X; let's use:
  // dx/dt = vx * cos(yaw) - vy * sin(yaw)
  // dz/dt = vx * sin(yaw) + vy * cos(yaw)
  const newX = state.x + (newVx * Math.cos(newYaw) - newVy * Math.sin(newYaw)) * dt;
  const newZ = state.z + (newVx * Math.sin(newYaw) + newVy * Math.cos(newYaw)) * dt;
  const newY = roadElevation + h;

  // Suspension compressions
  const compFL = fzFL / config.suspensionStiffness;
  const compFR = fzFR / config.suspensionStiffness;
  const compRL = fzRL / config.suspensionStiffness;
  const compRR = fzRR / config.suspensionStiffness;

  // Rollover condition: LTR >= 1.0 or roll angle exceeds critical threshold (e.g. 30 deg)
  const isRolledOver = ltr >= 0.999 || Math.abs(newRoll) >= config.criticalRollAngle;

  const nextWheels = {
    fl: {
      normalForce: fzFL,
      lateralForce: frontBodyFyFL,
      longitudinalForce: frontBodyFxFL,
      slipAngle: alphaF,
      slipRatio: kappaF,
      suspensionCompression: compFL,
      isAirborne: isFlAirborne,
      isOffTrack: state.wheels.fl.isOffTrack,
    },
    fr: {
      normalForce: fzFR,
      lateralForce: frontBodyFyFR,
      longitudinalForce: frontBodyFxFR,
      slipAngle: alphaF,
      slipRatio: kappaF,
      suspensionCompression: compFR,
      isAirborne: isFrAirborne,
      isOffTrack: state.wheels.fr.isOffTrack,
    },
    rl: {
      normalForce: fzRL,
      lateralForce: rearBodyFyRL,
      longitudinalForce: rearBodyFxRL,
      slipAngle: alphaR,
      slipRatio: kappaR,
      suspensionCompression: compRL,
      isAirborne: isRlAirborne,
      isOffTrack: state.wheels.rl.isOffTrack,
    },
    rr: {
      normalForce: fzRR,
      lateralForce: rearBodyFyRR,
      longitudinalForce: rearBodyFxRR,
      slipAngle: alphaR,
      slipRatio: kappaR,
      suspensionCompression: compRR,
      isAirborne: isRrAirborne,
      isOffTrack: state.wheels.rr.isOffTrack,
    },
  };

  return {
    x: newX,
    y: newY,
    z: newZ,
    roadElevation,
    yaw: newYaw,
    pitch: newPitch,
    roll: newRoll,
    yawRate: newYawRate,
    pitchRate: newPitchRate,
    rollRate: newRollRate,
    vx: newVx,
    vy: newVy,
    vz: 0,
    ax,
    ay,
    az: 0,
    steeringAngle,
    throttle,
    ltr,
    deltaFzLat,
    deltaFzLong,
    wheels: nextWheels,
    totalMass,
    effectiveComHeight: h,
    isRolledOver,
    isOffTrack: state.isOffTrack,
    offTrackWheel: state.offTrackWheel,
    isGoalReached: state.isGoalReached,
  };
}
