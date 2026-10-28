/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TOTAL_DISCRETE_ACTIONS, discreteToAction } from '../environment/actionSpace';
import { ContinuousAction } from '../types/truck';

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
}

/**
 * Lightweight In-Browser Neural Q-Network with Replay Buffer
 * Operates on 32-dim continuous observation vector to 35 discrete action Q-values.
 */
export class RLAgent {
  private inputDim: number = 32;
  private hiddenDim: number = 48;
  private outputDim: number = TOTAL_DISCRETE_ACTIONS; // 35

  // Layer 1 weights & biases: [hiddenDim, inputDim]
  private w1: Float32Array;
  private b1: Float32Array;
  // Layer 2 weights & biases: [outputDim, hiddenDim]
  private w2: Float32Array;
  private b2: Float32Array;

  // Replay Buffer
  private replayBuffer: Transition[] = [];
  private maxBufferSize: number = 5000;

  // Hyperparameters
  public epsilon: number = 0.85; // Initial exploration
  public minEpsilon: number = 0.05;
  public epsilonDecay: number = 0.995;
  public gamma: number = 0.98; // Discount factor
  public learningRate: number = 0.003;

  public metrics: TrainingMetrics = {
    episodes: 0,
    totalSteps: 0,
    epsilon: 0.85,
    lastLoss: 0,
    lastEpisodeReward: 0,
    rollingReward: 0,
    rewardHistory: [],
    rolloverCount: 0,
    cliffBreachCount: 0,
    goalCount: 0,
  };

  constructor() {
    this.w1 = new Float32Array(this.hiddenDim * this.inputDim);
    this.b1 = new Float32Array(this.hiddenDim);
    this.w2 = new Float32Array(this.outputDim * this.hiddenDim);
    this.b2 = new Float32Array(this.outputDim);

    this.initializeWeights();
  }

  /**
   * Xavier / He weight initialization with sensible safe priors
   */
  private initializeWeights() {
    const scale1 = Math.sqrt(2.0 / this.inputDim);
    for (let i = 0; i < this.w1.length; i++) {
      this.w1[i] = (Math.random() * 2 - 1) * scale1;
    }
    const scale2 = Math.sqrt(2.0 / this.hiddenDim);
    for (let i = 0; i < this.w2.length; i++) {
      this.w2[i] = (Math.random() * 2 - 1) * scale2;
    }
  }

  /**
   * Forward pass: computes Q-values for all discrete actions
   */
  public predictQValues(state: number[]): Float32Array {
    const hidden = new Float32Array(this.hiddenDim);

    // Layer 1: hidden = ReLU(w1 * state + b1)
    for (let h = 0; h < this.hiddenDim; h++) {
      let sum = this.b1[h];
      const rowOffset = h * this.inputDim;
      for (let i = 0; i < this.inputDim; i++) {
        sum += this.w1[rowOffset + i] * (state[i] || 0);
      }
      hidden[h] = Math.max(0, sum); // ReLU
    }

    // Layer 2: q = w2 * hidden + b2
    const qValues = new Float32Array(this.outputDim);
    for (let o = 0; o < this.outputDim; o++) {
      let sum = this.b2[o];
      const rowOffset = o * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        sum += this.w2[rowOffset + h] * hidden[h];
      }
      qValues[o] = sum;
    }

    return qValues;
  }

  /**
   * Epsilon-greedy action selection
   */
  public selectAction(state: number[], isEvaluating: boolean = false): { actionIndex: number; continuousAction: ContinuousAction; qValues: Float32Array } {
    const qValues = this.predictQValues(state);

    let actionIndex = 0;
    if (!isEvaluating && Math.random() < this.epsilon) {
      // Exploration: pick random action
      actionIndex = Math.floor(Math.random() * this.outputDim);
    } else {
      // Exploitation: pick action with max Q-value
      let maxQ = -Infinity;
      for (let i = 0; i < this.outputDim; i++) {
        if (qValues[i] > maxQ) {
          maxQ = qValues[i];
          actionIndex = i;
        }
      }
    }

    return {
      actionIndex,
      continuousAction: discreteToAction(actionIndex),
      qValues,
    };
  }

  /**
   * Store transition in experience replay
   */
  public storeTransition(state: number[], action: number, reward: number, nextState: number[], done: boolean) {
    if (this.replayBuffer.length >= this.maxBufferSize) {
      this.replayBuffer.shift();
    }
    this.replayBuffer.push({ state, action, reward, nextState, done });
    this.metrics.totalSteps++;
  }

  /**
   * Performs one gradient update step using experience replay mini-batch
   */
  public trainStep(batchSize: number = 32): number {
    if (this.replayBuffer.length < batchSize) return 0;

    let totalLoss = 0;

    for (let b = 0; b < batchSize; b++) {
      const idx = Math.floor(Math.random() * this.replayBuffer.length);
      const { state, action, reward, nextState, done } = this.replayBuffer[idx];

      // Current Q
      const currentQ = this.predictQValues(state);
      // Next Q
      const nextQ = this.predictQValues(nextState);

      let maxNextQ = -Infinity;
      for (let i = 0; i < this.outputDim; i++) {
        if (nextQ[i] > maxNextQ) maxNextQ = nextQ[i];
      }

      const targetQ = done ? reward : reward + this.gamma * maxNextQ;
      const tdError = targetQ - currentQ[action];
      totalLoss += tdError * tdError;

      // Gradient update on w2, b2, w1, b1 via backprop
      // Hidden activations
      const hidden = new Float32Array(this.hiddenDim);
      for (let h = 0; h < this.hiddenDim; h++) {
        let sum = this.b1[h];
        const rowOffset = h * this.inputDim;
        for (let i = 0; i < this.inputDim; i++) {
          sum += this.w1[rowOffset + i] * (state[i] || 0);
        }
        hidden[h] = Math.max(0, sum);
      }

      // Delta for output layer
      const deltaOutput = Math.max(-10, Math.min(10, tdError)); // Gradient clipping
      const w2Offset = action * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        this.w2[w2Offset + h] += this.learningRate * deltaOutput * hidden[h];
      }
      this.b2[action] += this.learningRate * deltaOutput;

      // Delta for hidden layer
      for (let h = 0; h < this.hiddenDim; h++) {
        if (hidden[h] > 0) {
          // ReLU derivative is 1
          const deltaHidden = deltaOutput * this.w2[w2Offset + h];
          const w1Offset = h * this.inputDim;
          for (let i = 0; i < this.inputDim; i++) {
            this.w1[w1Offset + i] += this.learningRate * 0.5 * deltaHidden * (state[i] || 0);
          }
          this.b1[h] += this.learningRate * 0.5 * deltaHidden;
        }
      }
    }

    const avgLoss = totalLoss / batchSize;
    this.metrics.lastLoss = avgLoss;
    return avgLoss;
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
    this.epsilon = 0.85;
    this.metrics = {
      episodes: 0,
      totalSteps: 0,
      epsilon: 0.85,
      lastLoss: 0,
      lastEpisodeReward: 0,
      rollingReward: 0,
      rewardHistory: [],
      rolloverCount: 0,
      cliffBreachCount: 0,
      goalCount: 0,
    };
  }
}
