/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DISCRETE_ACTIONS,
  TOTAL_DISCRETE_ACTIONS,
  continuousToDiscrete,
  discreteToAction,
} from '../environment/actionSpace';
import { ContinuousAction, LookaheadPoint, Observation } from '../types/truck';
import { computeSafeAgentAction } from './safeHeuristicAgent';

export interface Transition {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export interface TrainingMetrics {
  episodes: number;
  totalSteps: number;
  epsilon: number;
  lastLoss: number;
  lastEpisodeReward: number;
  rollingReward: number;
  rewardHistory: number[];
  rolloverCount: number;
  cliffBreachCount: number;
  goalCount: number;
  // Pre-training Demonstration Tracking
  isPretrained: boolean;
  pretrainSource: string | null;
  demonstrationsCount: number;
  // Residual Network Specifics
  averageResidualDelta: number;
  governorAgreementRate: number;
}

export interface RLHyperparameters {
  learningRate: number; // Fine-tuning step size (0.0001 - 0.005)
  gamma: number; // Discount factor (0.80 - 0.999)
  epsilon: number; // Localized exploration rate (0.0 - 0.5)
  minEpsilon: number; // Exploration floor (0.005 - 0.2)
  epsilonDecay: number; // Epsilon decay per episode (0.95 - 0.9999)
  batchSize: number; // Mini-batch sample size (8 - 128)
  maxBufferSize: number; // Experience replay capacity (1000 - 20000)
}

export const DEFAULT_RL_HYPERPARAMETERS: RLHyperparameters = {
  learningRate: 0.0005, // Gentle fine-tuning rate
  gamma: 0.98,
  epsilon: 0.08, // 8% localized neighbor exploration (not random flailing)
  minEpsilon: 0.01, // 1% exploration floor
  epsilonDecay: 0.995,
  batchSize: 32,
  maxBufferSize: 5000,
};

/**
 * Reconstructs a full Observation object from a 32-dim normalized vector
 * when replaying experiences from the replay buffer.
 */
export function stateVectorToObservation(vector: number[]): Observation {
  const crossTrackError = (vector[0] || 0) * 3.0;
  const headingError = (vector[1] || 0) * Math.PI;
  const vx = (vector[2] || 0) * 30.0;
  const vy = (vector[3] || 0) * 5.0;
  const yawRate = (vector[4] || 0) * 1.5;
  const pitch = (vector[5] || 0) * 0.35;
  const roll = (vector[6] || 0) * 0.52;
  const rollRate = (vector[7] || 0) * 1.5;
  const ltr = vector[8] || 0;
  const totalMass = (vector[9] || 0) * 23000 + 9000;
  const comOffsetX = (vector[10] || 0) * 0.8;
  const comOffsetY = (vector[11] || 0) * 0.5;
  const comOffsetZ = (vector[12] || 0) * 1.0;
  const currentFriction = vector[13] !== undefined ? vector[13] : 0.8;
  const currentBankAngle = (vector[14] || 0) * 0.35;
  const trackHalfWidth = (vector[15] || 0.5) * 3.5;

  const lookahead: LookaheadPoint[] = [];
  for (let i = 16; i + 2 < vector.length && lookahead.length < 5; i += 3) {
    lookahead.push({
      relX: (vector[i] || 0) * 40.0,
      relZ: (vector[i + 1] || 0) * 10.0,
      relY: 0,
      headingDiff: (vector[i + 2] || 0) * Math.PI,
      curvature: 0,
    });
  }

  return {
    crossTrackError,
    headingError,
    vx,
    vy,
    yawRate,
    pitch,
    roll,
    rollRate,
    ltr,
    totalMass,
    comOffsetX,
    comOffsetY,
    comOffsetZ,
    currentFriction,
    currentBankAngle,
    trackHalfWidth,
    lookahead,
    vector,
  };
}

/**
 * Residual Deep Q-Network (Safe Governor Inherited)
 *
 * Mathematical Structure:
 * Total Q-Value: Q(s, a) = Q_governor(s, a) + ΔQ_θ(s, a)
 *
 * 1. Q_governor(s, a): Analytical convex prior derived directly from the
 *    Safe Governor heuristic. The safe action receives ~0, while risky or
 *    opposing actions receive steep negative distance penalties.
 * 2. ΔQ_θ(s, a): Trainable neural network parameterized by (W1, b1, W2, b2).
 *    Output layer weights and biases (W2, b2) are initialized to EXACT ZERO.
 *    At initialization (t=0): ΔQ_θ ≡ 0  ==>  Q(s, a) = Q_governor(s, a).
 *    The network functions identically to the Safe Governor from step 1!
 * 3. Fine-Tuning: As RL trains, ΔQ_θ learns small residual offsets (e.g. ±1.5)
 *    to improve upon the governor (higher safe speeds, smoother lines) without
 *    ever destabilizing the vehicle.
 */
export class RLAgent {
  private inputDim: number = 32;
  private hiddenDim: number = 48;
  private outputDim: number = TOTAL_DISCRETE_ACTIONS; // 35

  // Layer 1 weights & biases: [hiddenDim, inputDim]
  private w1: Float32Array;
  private b1: Float32Array;
  // Layer 2 weights & biases: [outputDim, hiddenDim] (Zero-initialized for exact Safe Governor start)
  private w2: Float32Array;
  private b2: Float32Array;

  // Replay Buffer
  private replayBuffer: Transition[] = [];
  public maxBufferSize: number = DEFAULT_RL_HYPERPARAMETERS.maxBufferSize;
  public batchSize: number = DEFAULT_RL_HYPERPARAMETERS.batchSize;

  // Fine-tuning Hyperparameters
  public epsilon: number = DEFAULT_RL_HYPERPARAMETERS.epsilon;
  public minEpsilon: number = DEFAULT_RL_HYPERPARAMETERS.minEpsilon;
  public epsilonDecay: number = DEFAULT_RL_HYPERPARAMETERS.epsilonDecay;
  public gamma: number = DEFAULT_RL_HYPERPARAMETERS.gamma;
  public learningRate: number = DEFAULT_RL_HYPERPARAMETERS.learningRate;

  // Pre-training & Demonstration State
  public isPretrained: boolean = true; // Inherently pre-trained by architecture
  public pretrainSource: string | null = 'Safe Governor (Architecture Inherited)';
  public demonstrationsCount: number = 0;

  // Running diagnostic tracking
  private recentResidualMagnitudes: number[] = [];
  private recentGovernorMatches: number[] = [];

  public metrics: TrainingMetrics = {
    episodes: 0,
    totalSteps: 0,
    epsilon: DEFAULT_RL_HYPERPARAMETERS.epsilon,
    lastLoss: 0,
    lastEpisodeReward: 0,
    rollingReward: 0,
    rewardHistory: [],
    rolloverCount: 0,
    cliffBreachCount: 0,
    goalCount: 0,
    isPretrained: true,
    pretrainSource: 'Safe Governor (Architecture Inherited)',
    demonstrationsCount: 0,
    averageResidualDelta: 0,
    governorAgreementRate: 100,
  };

  constructor() {
    this.w1 = new Float32Array(this.hiddenDim * this.inputDim);
    this.b1 = new Float32Array(this.hiddenDim);
    this.w2 = new Float32Array(this.outputDim * this.hiddenDim);
    this.b2 = new Float32Array(this.outputDim);

    this.initializeWeights();
  }

  /**
   * Initializes Layer 1 with small stable weights, and initializes Layer 2
   * to EXACT ZERO so ΔQ_θ(s, a) = 0 at start, making the network behave
   * identically to the Safe Governor.
   */
  private initializeWeights() {
    // Layer 1: small He/Xavier uniform scaling
    const scale1 = Math.sqrt(2.0 / this.inputDim) * 0.1;
    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] = (Math.random() * 2 - 1) * scale1;
    }
    for (let i = 0; i < this.b1.length; i++) {
      this.b1[i] = 0;
    }

    // Layer 2: EXACT ZERO initialization guarantees zero residual initially
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] = 0.0;
    }
    for (let i = 0; i < this.b2.length; i++) {
      this.b2[i] = 0.0;
    }
  }

  /**
   * Resolves state into an Observation object
   */
  private resolveObservation(stateOrObs: number[] | Observation): Observation {
    if (Array.isArray(stateOrObs)) {
      return stateVectorToObservation(stateOrObs);
    }
    return stateOrObs;
  }

  /**
   * Computes the Safe Governor analytical Q-value prior for all 35 discrete actions.
   * Actions closer to the governor recommendation receive ~0 penalty, while actions
   * contrary to safety or driving trajectory receive steep negative penalties.
   */
  public computeGovernorPriorQValues(obs: Observation): {
    priorQValues: Float32Array;
    governorAction: ContinuousAction;
    governorDiscreteIndex: number;
  } {
    const governorAction = computeSafeAgentAction(obs);
    const governorDiscreteIndex = continuousToDiscrete(
      governorAction.steer,
      governorAction.throttle
    );

    const priorQValues = new Float32Array(this.outputDim);
    const K_steer = 6.0;
    const K_throttle = 8.0;

    for (let i = 0; i < this.outputDim; i++) {
      const act = DISCRETE_ACTIONS[i];
      const dSteer = act.steerNormalized - governorAction.steer;
      const dThrottle = act.throttleNormalized - governorAction.throttle;

      // Distance penalty from safe governor
      const distPenalty = K_steer * (dSteer * dSteer) + K_throttle * (dThrottle * dThrottle);
      priorQValues[i] = -distPenalty;
    }

    return { priorQValues, governorAction, governorDiscreteIndex };
  }

  /**
   * Computes forward pass:
   * Total Q(s, a) = Q_governor(s, a) + ΔQ_residual(s, a)
   */
  public predictQValues(stateOrObs: number[] | Observation): {
    totalQValues: Float32Array;
    governorQValues: Float32Array;
    residualQValues: Float32Array;
    governorDiscreteIndex: number;
    governorAction: ContinuousAction;
  } {
    const obs = this.resolveObservation(stateOrObs);
    const stateVector = obs.vector || (Array.isArray(stateOrObs) ? stateOrObs : []);

    const { priorQValues, governorAction, governorDiscreteIndex } =
      this.computeGovernorPriorQValues(obs);

    // 1. Forward pass through Residual Neural Network (ΔQ_θ)
    const hidden = new Float32Array(this.hiddenDim);
    for (let h = 0; h < this.hiddenDim; h++) {
      let sum = this.b1[h];
      const rowOffset = h * this.inputDim;
      for (let i = 0; i < this.inputDim; i++) {
        sum += this.w1[rowOffset + i] * (stateVector[i] || 0);
      }
      hidden[h] = Math.max(0, sum); // ReLU activation
    }

    const residualQValues = new Float32Array(this.outputDim);
    for (let o = 0; o < this.outputDim; o++) {
      let sum = this.b2[o];
      const rowOffset = o * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        sum += this.w2[rowOffset + h] * hidden[h];
      }
      // Soft clamp on residual offsets: prevents the residual network from
      // overwhelming the safety governor without sustained evidence
      residualQValues[o] = Math.max(-6.0, Math.min(6.0, sum));
    }

    // 2. Total Q = Governor Prior + Residual Offset
    const totalQValues = new Float32Array(this.outputDim);
    for (let o = 0; o < this.outputDim; o++) {
      totalQValues[o] = priorQValues[o] + residualQValues[o];
    }

    return {
      totalQValues,
      governorQValues: priorQValues,
      residualQValues,
      governorDiscreteIndex,
      governorAction,
    };
  }

  /**
   * Action selection with Localized Neighbor Exploration:
   * Instead of uniform random action flailing, exploration perturbs by ±1 grid bin
   * around the safe action. This prevents catastrophic reverse driving or immediate cliff falls.
   */
  public selectAction(
    stateOrObs: number[] | Observation,
    isEvaluating: boolean = false
  ): {
    actionIndex: number;
    continuousAction: ContinuousAction;
    qValues: Float32Array;
    governorIndex: number;
    isGovernorMatched: boolean;
  } {
    const obs = this.resolveObservation(stateOrObs);
    const {
      totalQValues,
      residualQValues,
      governorDiscreteIndex,
      governorAction,
    } = this.predictQValues(obs);

    let chosenActionIndex = governorDiscreteIndex;

    // Safety-Critical Shield:
    // If the truck is in severe rollover danger (LTR > 0.75 or roll > 0.35),
    // strictly enforce the Safe Governor's defensive emergency maneuver.
    const isSafetyCritical = Math.abs(obs.ltr) > 0.75 || Math.abs(obs.roll) > 0.35;

    if (isSafetyCritical) {
      chosenActionIndex = governorDiscreteIndex;
    } else if (!isEvaluating && Math.random() < this.epsilon) {
      // Localized Neighbor Exploration:
      // Deconstruct governor's discrete action into steering & throttle bin indices
      const govSteerBin = Math.floor(governorDiscreteIndex / 5); // 0 to 6
      const govThrottleBin = governorDiscreteIndex % 5; // 0 to 4

      // Perturb by ±1 bin
      const steerDeltas = [-1, 0, 1];
      const throttleDeltas = [-1, 0, 1];
      const dS = steerDeltas[Math.floor(Math.random() * steerDeltas.length)];
      const dT = throttleDeltas[Math.floor(Math.random() * throttleDeltas.length)];

      const exploredSteerBin = Math.max(0, Math.min(6, govSteerBin + dS));
      const exploredThrottleBin = Math.max(0, Math.min(4, govThrottleBin + dT));

      chosenActionIndex = exploredSteerBin * 5 + exploredThrottleBin;
    } else {
      // Exploitation: argmax over Total Q
      let maxQ = -Infinity;
      for (let i = 0; i < this.outputDim; i++) {
        if (totalQValues[i] > maxQ) {
          maxQ = totalQValues[i];
          chosenActionIndex = i;
        }
      }
    }

    // Diagnostics tracking
    const isGovernorMatched = chosenActionIndex === governorDiscreteIndex;
    this.recentGovernorMatches.push(isGovernorMatched ? 1 : 0);
    if (this.recentGovernorMatches.length > 100) this.recentGovernorMatches.shift();

    let absResidualSum = 0;
    for (let i = 0; i < this.outputDim; i++) {
      absResidualSum += Math.abs(residualQValues[i]);
    }
    this.recentResidualMagnitudes.push(absResidualSum / this.outputDim);
    if (this.recentResidualMagnitudes.length > 100) this.recentResidualMagnitudes.shift();

    const avgAgreement =
      (this.recentGovernorMatches.reduce((a, b) => a + b, 0) /
        Math.max(1, this.recentGovernorMatches.length)) *
      100;
    const avgResidual =
      this.recentResidualMagnitudes.reduce((a, b) => a + b, 0) /
      Math.max(1, this.recentResidualMagnitudes.length);

    this.metrics.governorAgreementRate = Math.round(avgAgreement);
    this.metrics.averageResidualDelta = Number(avgResidual.toFixed(3));

    return {
      actionIndex: chosenActionIndex,
      continuousAction: discreteToAction(chosenActionIndex),
      qValues: totalQValues,
      governorIndex: governorDiscreteIndex,
      isGovernorMatched,
    };
  }

  /**
   * Store transition in experience replay
   */
  public storeTransition(
    state: number[],
    action: number,
    reward: number,
    nextState: number[],
    done: boolean
  ) {
    if (this.replayBuffer.length >= this.maxBufferSize) {
      this.replayBuffer.shift();
    }
    this.replayBuffer.push({ state, action, reward, nextState, done });
    this.metrics.totalSteps++;
  }

  /**
   * Performs one gradient update step on the residual network parameters (W2, b2, W1, b1)
   * using experience replay mini-batch.
   */
  public trainStep(batchSize: number = this.batchSize): number {
    const effectiveBatchSize = Math.max(1, batchSize || this.batchSize);
    if (this.replayBuffer.length < effectiveBatchSize) return 0;

    let totalLoss = 0;

    for (let b = 0; b < effectiveBatchSize; b++) {
      const idx = Math.floor(Math.random() * this.replayBuffer.length);
      const { state, action, reward, nextState, done } = this.replayBuffer[idx];

      const currentPred = this.predictQValues(state);
      const nextPred = this.predictQValues(nextState);

      let maxNextQ = -Infinity;
      for (let i = 0; i < this.outputDim; i++) {
        if (nextPred.totalQValues[i] > maxNextQ) {
          maxNextQ = nextPred.totalQValues[i];
        }
      }

      // Bellman target with discount
      const targetQ = done ? reward : reward + this.gamma * maxNextQ;
      const tdError = targetQ - currentPred.totalQValues[action];
      totalLoss += tdError * tdError;

      // Hidden activations for backprop
      const hidden = new Float32Array(this.hiddenDim);
      for (let h = 0; h < this.hiddenDim; h++) {
        let sum = this.b1[h];
        const rowOffset = h * this.inputDim;
        for (let i = 0; i < this.inputDim; i++) {
          sum += this.w1[rowOffset + i] * (state[i] || 0);
        }
        hidden[h] = Math.max(0, sum);
      }

      // Clip gradient delta to protect the safe baseline
      const deltaOutput = Math.max(-3.0, Math.min(3.0, tdError));

      // Gradient update on W2, b2
      const w2Offset = action * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        this.w2[w2Offset + h] += this.learningRate * deltaOutput * hidden[h];
        // Elastic regularizer: softly anchors residual weights to zero
        this.w2[w2Offset + h] *= 0.9999;
      }
      this.b2[action] += this.learningRate * deltaOutput;

      // Gradient backprop through hidden layer into W1, b1
      for (let h = 0; h < this.hiddenDim; h++) {
        if (hidden[h] > 0) {
          const deltaHidden = deltaOutput * this.w2[w2Offset + h];
          const w1Offset = h * this.inputDim;
          for (let i = 0; i < this.inputDim; i++) {
            this.w1[w1Offset + i] += this.learningRate * 0.4 * deltaHidden * (state[i] || 0);
          }
          this.b1[h] += this.learningRate * 0.4 * deltaHidden;
        }
      }
    }

    const avgLoss = totalLoss / effectiveBatchSize;
    this.metrics.lastLoss = avgLoss;
    return avgLoss;
  }

  /**
   * Direct human or governor demonstration storage and imitation update
   */
  public storeDemonstration(
    state: number[],
    action: number,
    reward: number,
    nextState: number[],
    done: boolean,
    source: string = 'Manual (WASD)'
  ) {
    this.storeTransition(state, action, reward, nextState, done);
    this.demonstrationsCount++;
    this.isPretrained = true;
    this.pretrainSource = source;

    if (this.replayBuffer.length >= 16) {
      this.trainStep(16);
    }

    this.metrics.isPretrained = true;
    this.metrics.pretrainSource = source;
    this.metrics.demonstrationsCount = this.demonstrationsCount;
  }

  /**
   * Called when an episode finishes to update metrics and decay epsilon
   */
  public onEpisodeEnd(totalReward: number, terminationReason?: string) {
    this.metrics.episodes++;
    this.metrics.lastEpisodeReward = totalReward;
    this.metrics.rewardHistory.push(totalReward);
    if (this.metrics.rewardHistory.length > 50) {
      this.metrics.rewardHistory.shift();
    }

    const sum = this.metrics.rewardHistory.reduce((a, b) => a + b, 0);
    this.metrics.rollingReward = sum / this.metrics.rewardHistory.length;

    if (terminationReason === 'rollover') {
      this.metrics.rolloverCount++;
    } else if (terminationReason === 'cliff_breach') {
      this.metrics.cliffBreachCount++;
    } else if (terminationReason === 'goal_reached') {
      this.metrics.goalCount++;
    }

    // Decay exploration epsilon
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
    this.metrics.epsilon = this.epsilon;
  }

  public resetModel() {
    this.initializeWeights();
    this.replayBuffer = [];
    this.epsilon = DEFAULT_RL_HYPERPARAMETERS.epsilon;
    this.isPretrained = true;
    this.pretrainSource = 'Safe Governor (Architecture Inherited)';
    this.demonstrationsCount = 0;
    this.recentGovernorMatches = [];
    this.recentResidualMagnitudes = [];
    this.metrics = {
      episodes: 0,
      totalSteps: 0,
      epsilon: this.epsilon,
      lastLoss: 0,
      lastEpisodeReward: 0,
      rollingReward: 0,
      rewardHistory: [],
      rolloverCount: 0,
      cliffBreachCount: 0,
      goalCount: 0,
      isPretrained: true,
      pretrainSource: 'Safe Governor (Architecture Inherited)',
      demonstrationsCount: 0,
      averageResidualDelta: 0,
      governorAgreementRate: 100,
    };
  }

  public getHyperparameters(): RLHyperparameters {
    return {
      learningRate: this.learningRate,
      gamma: this.gamma,
      epsilon: this.epsilon,
      minEpsilon: this.minEpsilon,
      epsilonDecay: this.epsilonDecay,
      batchSize: this.batchSize,
      maxBufferSize: this.maxBufferSize,
    };
  }

  public setHyperparameters(params: Partial<RLHyperparameters>) {
    if (params.learningRate !== undefined) this.learningRate = params.learningRate;
    if (params.gamma !== undefined) this.gamma = params.gamma;
    if (params.epsilon !== undefined) {
      this.epsilon = params.epsilon;
      this.metrics.epsilon = params.epsilon;
    }
    if (params.minEpsilon !== undefined) this.minEpsilon = params.minEpsilon;
    if (params.epsilonDecay !== undefined) this.epsilonDecay = params.epsilonDecay;
    if (params.batchSize !== undefined) this.batchSize = params.batchSize;
    if (params.maxBufferSize !== undefined) {
      this.maxBufferSize = params.maxBufferSize;
      if (this.replayBuffer.length > this.maxBufferSize) {
        this.replayBuffer = this.replayBuffer.slice(-this.maxBufferSize);
      }
    }
  }

  public getReplayBufferSize(): number {
    return this.replayBuffer.length;
  }

  public clearReplayBuffer() {
    this.replayBuffer = [];
  }
}
