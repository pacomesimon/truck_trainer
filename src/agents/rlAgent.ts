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
  // Pre-training Demonstration Tracking
  isPretrained: boolean;
  pretrainSource: string | null;
  demonstrationsCount: number;
}

/**
 * Lightweight In-Browser Neural Q-Network with Replay Buffer & Imitation Pre-training
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
  public epsilon: number = 0.85; // Initial exploration (lowered on pre-training)
  public minEpsilon: number = 0.05;
  public epsilonDecay: number = 0.995;
  public gamma: number = 0.98; // Discount factor
  public learningRate: number = 0.003;

  // Pre-training & Demonstration State
  public isPretrained: boolean = false;
  public pretrainSource: string | null = null;
  public demonstrationsCount: number = 0;

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
    isPretrained: false,
    pretrainSource: null,
    demonstrationsCount: 0,
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
   * Supervised Imitation / Behavioral Cloning step (DQfD Large Margin Supervised Loss)
   * Boosts the Q-value for the expert demonstrated action and penalizes violating non-expert actions.
   */
  public imitationStep(state: number[], expertAction: number): number {
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

    // Output Q-values
    const qValues = new Float32Array(this.outputDim);
    for (let o = 0; o < this.outputDim; o++) {
      let sum = this.b2[o];
      const rowOffset = o * this.hiddenDim;
      for (let h = 0; h < this.hiddenDim; h++) {
        sum += this.w2[rowOffset + h] * hidden[h];
      }
      qValues[o] = sum;
    }

    // Find max Q among other actions
    let maxOtherQ = -Infinity;
    for (let o = 0; o < this.outputDim; o++) {
      if (o !== expertAction && qValues[o] > maxOtherQ) {
        maxOtherQ = qValues[o];
      }
    }

    // Expert action target has a margin boost over best alternative
    const targetQ = Math.max(qValues[expertAction], maxOtherQ) + 1.5;
    const expertError = targetQ - qValues[expertAction];
    const clippedExpertError = Math.max(-5, Math.min(5, expertError));

    // Gradient step on expert action output weights
    const w2Offset = expertAction * this.hiddenDim;
    for (let h = 0; h < this.hiddenDim; h++) {
      this.w2[w2Offset + h] += this.learningRate * 1.5 * clippedExpertError * hidden[h];
    }
    this.b2[expertAction] += this.learningRate * 1.5 * clippedExpertError;

    // Slightly suppress any competitor action that exceeds margin
    let loss = expertError * expertError;
    for (let o = 0; o < this.outputDim; o++) {
      if (o !== expertAction && qValues[o] > qValues[expertAction] - 0.5) {
        const suppressError = (qValues[expertAction] - 0.5) - qValues[o];
        const clippedSup = Math.max(-2, Math.min(2, suppressError));
        const oOffset = o * this.hiddenDim;
        for (let h = 0; h < this.hiddenDim; h++) {
          this.w2[oOffset + h] += this.learningRate * 0.5 * clippedSup * hidden[h];
        }
        this.b2[o] += this.learningRate * 0.5 * clippedSup;
        loss += suppressError * suppressError;
      }
    }

    // Backprop to hidden layer
    for (let h = 0; h < this.hiddenDim; h++) {
      if (hidden[h] > 0) {
        const deltaHidden = clippedExpertError * this.w2[w2Offset + h];
        const w1Offset = h * this.inputDim;
        for (let i = 0; i < this.inputDim; i++) {
          this.w1[w1Offset + i] += this.learningRate * 0.3 * deltaHidden * (state[i] || 0);
        }
        this.b1[h] += this.learningRate * 0.3 * deltaHidden;
      }
    }

    return loss;
  }

  /**
   * Directly stores a demonstration from Manual (WASD) or Safe Governor
   * and immediately trains the model via Behavioral Cloning + Q-learning updates
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

    // Run imitation step for instant supervised learning
    this.imitationStep(state, action);

    // Run replay batch update
    if (this.replayBuffer.length >= 16) {
      this.trainStep(16);
    }

    // Pre-training seeds the model with prior knowledge:
    // Decays exploration epsilon so live RL training begins with guided exploitation (0.25)
    // rather than blind random flailing (0.85).
    this.epsilon = Math.max(0.20, Math.min(this.epsilon, 0.85 * Math.pow(0.998, this.demonstrationsCount)));

    this.metrics.isPretrained = true;
    this.metrics.pretrainSource = source;
    this.metrics.demonstrationsCount = this.demonstrationsCount;
    this.metrics.epsilon = this.epsilon;
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
    this.isPretrained = false;
    this.pretrainSource = null;
    this.demonstrationsCount = 0;
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
      isPretrained: false,
      pretrainSource: null,
      demonstrationsCount: 0,
    };
  }
}
