/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ContinuousAction,
  EnvironmentConfig,
  Observation,
  RewardBreakdown,
  StepResult,
  VehicleConfig,
  VehicleState,
} from '../types/truck';
import {
  DEFAULT_VEHICLE_CONFIG,
  createInitialVehicleState,
  stepVehicleDynamics,
} from '../physics/vehicleDynamics';
import {
  GeneratedTrack,
  computeTrackErrors,
  computePointCrossTrackDistance,
  extractLookaheadPoints,
  findClosestWaypointIndex,
  generateTrack,
} from '../track/trackGenerator';
import { discreteToAction, TOTAL_DISCRETE_ACTIONS } from './actionSpace';

export const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  dt: 0.02, // 50 Hz physics simulation rate
  maxEpisodeSteps: 1200,
  w1: 0.25, // weight for cross_track_error^2
  w2: 2.8, // weight for |LTR|
  w3: 0.75, // weight for |roll_rate|
  terminalPenalty: -1000,
  lookaheadCount: 6,
  lookaheadSpacing: 6.0,
  trackType: 'narrow_ridge',
  vehicle: { ...DEFAULT_VEHICLE_CONFIG },
};

export interface EnvRenderData {
  vehicleState: VehicleState;
  track: GeneratedTrack;
  closestWaypointIndex: number;
  lookaheadPoints: Observation['lookahead'];
  observation: Observation;
  lastRewardBreakdown: RewardBreakdown;
  stepCount: number;
  totalCumulativeReward: number;
}

/**
 * HeavyTruckEnv
 * Modular Reinforcement Learning Environment for Heavy Truck Mountain Simulation
 * Implements standard Gym / Gymnasium lifecycle: Reset, Step, Observation, Action, Reward, Render.
 */
export class HeavyTruckEnv {
  private config: EnvironmentConfig;
  private track: GeneratedTrack;
  private vehicleState: VehicleState;
  private currentStep: number = 0;
  private closestWpIndex: number = 0;
  private totalCumulativeReward: number = 0;
  private distanceCovered: number = 0;
  private lastRewardBreakdown: RewardBreakdown = {
    progressReward: 0,
    crossTrackPenalty: 0,
    ltrPenalty: 0,
    rollRatePenalty: 0,
    terminalPenalty: 0,
    totalStepReward: 0,
  };

  public readonly actionSpace = {
    type: 'discrete',
    n: TOTAL_DISCRETE_ACTIONS,
    description: '35 combinations of Steering [-1 to +1] and Throttle/Brake [-1 to +1]',
  };

  public readonly observationSpace = {
    type: 'box',
    shape: [32],
    description: 'Continuous 32-dimensional state vector (errors, dynamics, CoM, preview waypoints)',
  };

  constructor(initialConfig?: Partial<EnvironmentConfig>) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...initialConfig };
    this.track = generateTrack(this.config.trackType);
    const startWp = this.track.waypoints[0];
    const nextWp = this.track.waypoints.length > 1 ? this.track.waypoints[1] : startWp;
    const dx = nextWp.x - startWp.x;
    const dy = nextWp.y - startWp.y;
    const dz = nextWp.z - startWp.z;
    const distHoriz = Math.hypot(dx, dz);
    const startGrade = distHoriz > 0.001 ? Math.atan2(dy, distHoriz) : (startWp.gradeAngle ?? 0);
    const startBank = startWp.bankAngle ?? 0;

    this.vehicleState = createInitialVehicleState(
      startWp.x,
      startWp.y,
      startWp.z,
      startWp.heading,
      startGrade,
      startBank,
      this.config.vehicle
    );
  }

  /**
   * Resets environment to start a new episode.
   * Can accept optional partial config to vary track, mass, or CoM offsets.
   */
  public reset(configUpdate?: Partial<EnvironmentConfig>): Observation {
    if (configUpdate) {
      this.config = {
        ...this.config,
        ...configUpdate,
        vehicle: {
          ...this.config.vehicle,
          ...(configUpdate.vehicle || {}),
        },
      };
      if (configUpdate.trackType && configUpdate.trackType !== this.track.type) {
        this.track = generateTrack(configUpdate.trackType);
      }
    }

    this.currentStep = 0;
    this.closestWpIndex = 0;
    this.totalCumulativeReward = 0;
    this.distanceCovered = 0;

    const startWp = this.track.waypoints[0];
    const nextWp = this.track.waypoints.length > 1 ? this.track.waypoints[1] : startWp;
    const dx = nextWp.x - startWp.x;
    const dy = nextWp.y - startWp.y;
    const dz = nextWp.z - startWp.z;
    const distHoriz = Math.hypot(dx, dz);
    const startGrade = distHoriz > 0.001 ? Math.atan2(dy, distHoriz) : (startWp.gradeAngle ?? 0);
    const startBank = startWp.bankAngle ?? 0;

    this.vehicleState = createInitialVehicleState(
      startWp.x,
      startWp.y,
      startWp.z,
      startWp.heading,
      startGrade,
      startBank,
      this.config.vehicle
    );

    this.lastRewardBreakdown = {
      progressReward: 0,
      crossTrackPenalty: 0,
      ltrPenalty: 0,
      rollRatePenalty: 0,
      terminalPenalty: 0,
      totalStepReward: 0,
    };

    return this.buildObservation();
  }

  /**
   * Advances simulation by one timestep dt
   * @param action Discrete action index (0-34) OR ContinuousAction { steer, throttle }
   */
  public step(action: number | ContinuousAction): StepResult {
    this.currentStep++;

    const continuousAction: ContinuousAction =
      typeof action === 'number' ? discreteToAction(action) : action;

    // 1. Locate closest waypoint & current track properties
    this.closestWpIndex = findClosestWaypointIndex(
      this.track.waypoints,
      this.vehicleState.x,
      this.vehicleState.z,
      this.closestWpIndex
    );

    const currentWp = this.track.waypoints[this.closestWpIndex];
    const roadFriction = currentWp.friction;
    const roadBankAngle = currentWp.bankAngle;
    const roadGradeAngle = currentWp.gradeAngle;
    const roadElevation = currentWp.y;

    // 2. Physics integration
    const oldX = this.vehicleState.x;
    const oldZ = this.vehicleState.z;

    this.vehicleState = stepVehicleDynamics(
      this.vehicleState,
      continuousAction,
      roadFriction,
      roadBankAngle,
      roadGradeAngle,
      roadElevation,
      this.config.dt,
      this.config.vehicle
    );

    const stepDist = Math.hypot(this.vehicleState.x - oldX, this.vehicleState.z - oldZ);
    this.distanceCovered += stepDist;

    // 3. Compute Track Errors
    const { crossTrackError, headingError, roadSurfaceY } = computeTrackErrors(
      this.track.waypoints,
      this.closestWpIndex,
      this.vehicleState.x,
      this.vehicleState.z,
      this.vehicleState.yaw
    );
    this.vehicleState.roadElevation = roadSurfaceY;

    // 4. Strict 4-Wheel Track Boundary & Rollover Checks:
    // If ANY of the 4 wheels slips past the track edge, the truck has fallen off the cliff!
    const L = this.config.vehicle.wheelbase;
    const w = this.config.vehicle.trackWidth;
    const a = L / 2 - this.config.vehicle.comOffsetX;
    const b = L / 2 + this.config.vehicle.comOffsetX;
    const halfW = w / 2;

    const cosYaw = Math.cos(this.vehicleState.yaw);
    const sinYaw = Math.sin(this.vehicleState.yaw);

    const wheelDefs = [
      { key: 'fl' as const, name: 'Front-Left', dx: a, dz: -halfW },
      { key: 'fr' as const, name: 'Front-Right', dx: a, dz: halfW },
      { key: 'rl' as const, name: 'Rear-Left', dx: -b, dz: -halfW },
      { key: 'rr' as const, name: 'Rear-Right', dx: -b, dz: halfW },
    ];

    let anyWheelOffTrack = false;
    let firstOffTrackWheelName: string | undefined;

    const wheelDeviations: {
      fl: { dist: number; maxAllowed: number; isOff: boolean };
      fr: { dist: number; maxAllowed: number; isOff: boolean };
      rl: { dist: number; maxAllowed: number; isOff: boolean };
      rr: { dist: number; maxAllowed: number; isOff: boolean };
    } = {
      fl: { dist: 0, maxAllowed: 0, isOff: false },
      fr: { dist: 0, maxAllowed: 0, isOff: false },
      rl: { dist: 0, maxAllowed: 0, isOff: false },
      rr: { dist: 0, maxAllowed: 0, isOff: false },
    };

    for (const wDef of wheelDefs) {
      // Calculate wheel contact position in world coordinates
      const wx = this.vehicleState.x + wDef.dx * cosYaw - wDef.dz * sinYaw;
      const wz = this.vehicleState.z + wDef.dx * sinYaw + wDef.dz * cosYaw;

      const wpIdx = findClosestWaypointIndex(this.track.waypoints, wx, wz, this.closestWpIndex, 15);
      const { distFromCenterline, wp } = computePointCrossTrackDistance(this.track.waypoints, wpIdx, wx, wz);
      // Strict condition: distance from centerline exceeds road half-width (staging pad has extra 2m width)
      const isStagingZone = wpIdx === 0 || wpIdx >= this.track.waypoints.length - 2;
      const allowedHalfWidth = isStagingZone ? (wp.width + 2.0) / 2 : wp.width / 2;
      const isThisWheelOff = distFromCenterline > allowedHalfWidth;

      this.vehicleState.wheels[wDef.key].worldX = wx;
      this.vehicleState.wheels[wDef.key].worldZ = wz;
      this.vehicleState.wheels[wDef.key].distFromCenterline = distFromCenterline;
      this.vehicleState.wheels[wDef.key].isOffTrack = isThisWheelOff;

      wheelDeviations[wDef.key] = {
        dist: distFromCenterline,
        maxAllowed: allowedHalfWidth,
        isOff: isThisWheelOff,
      };

      if (isThisWheelOff) {
        anyWheelOffTrack = true;
        if (!firstOffTrackWheelName) {
          firstOffTrackWheelName = wDef.name;
        }
      }
    }

    this.vehicleState.isOffTrack = anyWheelOffTrack;
    this.vehicleState.offTrackWheel = firstOffTrackWheelName;

    const isGoalReached = this.closestWpIndex >= this.track.waypoints.length - 2;
    this.vehicleState.isGoalReached = isGoalReached;

    // 5. Reward Function Formulation:
    // R = (v_x * cos(heading_error))
    //     - w1 * (cross_track_error ** 2)
    //     - w2 * (|LTR|)
    //     - w3 * (|roll_rate|)
    //     - Terminal_Penalty (-1000) on rollover or cliff breach
    const progressReward = this.vehicleState.vx * Math.cos(headingError);
    const crossTrackPenalty = -this.config.w1 * (crossTrackError * crossTrackError);
    const ltrPenalty = -this.config.w2 * Math.abs(this.vehicleState.ltr);
    const rollRatePenalty = -this.config.w3 * Math.abs(this.vehicleState.rollRate);

    let terminalPenalty = 0;
    let terminated = false;
    let terminationReason: 'rollover' | 'cliff_breach' | 'max_steps' | 'goal_reached' | undefined;

    if (this.vehicleState.isRolledOver) {
      terminated = true;
      terminalPenalty = this.config.terminalPenalty;
      terminationReason = 'rollover';
    } else if (this.vehicleState.isOffTrack) {
      // Immediate termination: any wheel is off the track, truck has fallen!
      terminated = true;
      terminalPenalty = this.config.terminalPenalty;
      terminationReason = 'cliff_breach';
    } else if (isGoalReached) {
      terminated = true;
      terminalPenalty = 500; // goal bonus
      terminationReason = 'goal_reached';
    }

    const truncated = this.currentStep >= this.config.maxEpisodeSteps;
    if (truncated && !terminated) {
      terminationReason = 'max_steps';
    }

    const totalStepReward = progressReward + crossTrackPenalty + ltrPenalty + rollRatePenalty + terminalPenalty;
    this.totalCumulativeReward += totalStepReward;

    this.lastRewardBreakdown = {
      progressReward,
      crossTrackPenalty,
      ltrPenalty,
      rollRatePenalty,
      terminalPenalty,
      totalStepReward,
    };

    const observation = this.buildObservation(crossTrackError, headingError, currentWp);

    return {
      observation,
      reward: totalStepReward,
      rewardBreakdown: this.lastRewardBreakdown,
      terminated,
      truncated,
      info: {
        terminationReason,
        offTrackWheel: this.vehicleState.offTrackWheel,
        speedKmh: this.vehicleState.vx * 3.6,
        ltr: this.vehicleState.ltr,
        rollDeg: (this.vehicleState.roll * 180) / Math.PI,
        crossTrackError,
        stepCount: this.currentStep,
        distanceCovered: this.distanceCovered,
        wheelDeviations,
      },
    };
  }

  /**
   * Constructs Observation object and normalized flat vector
   */
  private buildObservation(
    providedCrossTrackError?: number,
    providedHeadingError?: number,
    providedWp?: GeneratedTrack['waypoints'][0]
  ): Observation {
    const currentWp = providedWp || this.track.waypoints[this.closestWpIndex];
    let crossTrackError = providedCrossTrackError;
    let headingError = providedHeadingError;

    if (crossTrackError === undefined || headingError === undefined) {
      const errors = computeTrackErrors(
        this.track.waypoints,
        this.closestWpIndex,
        this.vehicleState.x,
        this.vehicleState.z,
        this.vehicleState.yaw
      );
      crossTrackError = errors.crossTrackError;
      headingError = errors.headingError;
    }

    const lookahead = extractLookaheadPoints(
      this.track.waypoints,
      this.closestWpIndex,
      this.vehicleState.x,
      this.vehicleState.y,
      this.vehicleState.z,
      this.vehicleState.yaw,
      this.config.lookaheadCount,
      3
    );

    // Build normalized continuous vector for RL network input:
    // Scale features sensibly around [-1, 1]
    const vector: number[] = [
      crossTrackError / 3.0, // normalized cte
      headingError / Math.PI, // normalized heading error
      this.vehicleState.vx / 30.0, // normalized speed (up to ~108 km/h)
      this.vehicleState.vy / 5.0, // lateral speed
      this.vehicleState.yawRate / 1.5, // yaw rate
      this.vehicleState.pitch / 0.35, // pitch angle
      this.vehicleState.roll / 0.52, // roll angle relative to critical
      this.vehicleState.rollRate / 1.5, // roll angular rate
      this.vehicleState.ltr, // LTR [0, 1]
      (this.vehicleState.totalMass - 9000) / 23000, // normalized cargo mass [0, 1]
      this.config.vehicle.comOffsetX / 0.8,
      this.config.vehicle.comOffsetY / 0.5,
      this.config.vehicle.comOffsetZ / 1.0,
      currentWp.friction,
      currentWp.bankAngle / 0.35,
      (currentWp.width / 2) / 3.5,
    ];

    // Append 6 lookahead points (relative X, relative Z, heading diff = 3 floats * 6 = 18)
    for (let i = 0; i < this.config.lookaheadCount; i++) {
      if (i < lookahead.length) {
        vector.push(lookahead[i].relX / 40.0);
        vector.push(lookahead[i].relZ / 10.0);
        vector.push(lookahead[i].headingDiff / Math.PI);
      } else {
        vector.push(1.0, 0.0, 0.0);
      }
    }

    return {
      crossTrackError,
      headingError,
      vx: this.vehicleState.vx,
      vy: this.vehicleState.vy,
      yawRate: this.vehicleState.yawRate,
      pitch: this.vehicleState.pitch,
      roll: this.vehicleState.roll,
      rollRate: this.vehicleState.rollRate,
      ltr: this.vehicleState.ltr,
      totalMass: this.vehicleState.totalMass,
      comOffsetX: this.config.vehicle.comOffsetX,
      comOffsetY: this.config.vehicle.comOffsetY,
      comOffsetZ: this.config.vehicle.comOffsetZ,
      currentFriction: currentWp.friction,
      currentBankAngle: currentWp.bankAngle,
      trackHalfWidth: currentWp.width / 2,
      lookahead,
      vector,
    };
  }

  /**
   * Retrieves current observation vector
   */
  public getObservationVector(): number[] {
    return this.buildObservation().vector;
  }

  /**
   * Retrieves full observation object
   */
  public getObservation(): Observation {
    return this.buildObservation();
  }

  /**
   * Exports full render state payload for 2D/3D visualization hooks
   */
  public render(): EnvRenderData {
    const obs = this.buildObservation();
    return {
      vehicleState: { ...this.vehicleState },
      track: this.track,
      closestWaypointIndex: this.closestWpIndex,
      lookaheadPoints: obs.lookahead,
      observation: obs,
      lastRewardBreakdown: { ...this.lastRewardBreakdown },
      stepCount: this.currentStep,
      totalCumulativeReward: this.totalCumulativeReward,
    };
  }

  public getTrack(): GeneratedTrack {
    return this.track;
  }

  public getVehicleState(): VehicleState {
    return this.vehicleState;
  }

  public getConfig(): EnvironmentConfig {
    return this.config;
  }

  public setConfig(update: Partial<EnvironmentConfig>) {
    this.config = {
      ...this.config,
      ...update,
      vehicle: {
        ...this.config.vehicle,
        ...(update.vehicle || {}),
      },
    };
    if (update.trackType && update.trackType !== this.track.type) {
      this.track = generateTrack(update.trackType);
      this.reset();
    }
  }
}
