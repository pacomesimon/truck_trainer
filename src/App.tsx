/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HeavyTruckEnv } from './environment/HeavyTruckEnv';
import { Truck3DScene, CameraViewMode } from './rendering/Truck3DScene';
import { ContinuousAction, EnvironmentConfig, Observation, RewardBreakdown, VehicleState } from './types/truck';
import { computeSafeAgentAction } from './agents/safeHeuristicAgent';
import { computeAggressiveAgentAction } from './agents/aggressiveAgent';
import { RLAgent, RLHyperparameters, DEFAULT_RL_HYPERPARAMETERS } from './agents/rlAgent';
import { TelemetryHUD } from './components/TelemetryHUD';
import { RewardBreakdown as RewardBreakdownComponent } from './components/RewardBreakdown';
import { continuousToDiscrete } from './environment/actionSpace';
import { SimulationControls, DriverMode, PretrainMetrics } from './components/SimulationControls';
import { ObservationInspector } from './components/ObservationInspector';
import { TireDynamicsModal } from './components/TireDynamicsModal';
import { ConfigDrawer } from './components/ConfigDrawer';
import { RLHyperparametersModal } from './components/RLHyperparametersModal';
import { Truck, ShieldCheck, ChevronDown, ChevronUp, Info, Sparkles } from 'lucide-react';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Truck3DScene | null>(null);
  const envRef = useRef<HeavyTruckEnv | null>(null);
  const rlAgentRef = useRef<RLAgent | null>(null);

  // Simulation State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [driverMode, setDriverMode] = useState<DriverMode>('safe_agent');
  const [cameraView, setCameraView] = useState<CameraViewMode>('chase');

  // Pre-training from Demonstrations (Manual WASD & Safe Governor)
  const [isPretrainingActive, setIsPretrainingActive] = useState<boolean>(true);
  const [pretrainMetrics, setPretrainMetrics] = useState<PretrainMetrics>({
    isPretrained: false,
    pretrainSource: null,
    demonstrationsCount: 0,
    epsilon: 0.85,
  });

  // Live Telemetry state (polled at UI rate for smoothness)
  const [vehicleState, setVehicleState] = useState<VehicleState | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [rewardBreakdown, setRewardBreakdown] = useState<RewardBreakdown | null>(null);
  const [cumulativeReward, setCumulativeReward] = useState<number>(0);
  const [stepCount, setStepCount] = useState<number>(0);

  // Manual driving keyboard inputs
  const [manualAction, setManualAction] = useState<ContinuousAction>({ steer: 0, throttle: 0 });
  const keysDownRef = useRef<{ [key: string]: boolean }>({});
  const postTerminationFramesRef = useRef<number>(0);

  // Modals & Panels
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isObservationOpen, setIsObservationOpen] = useState<boolean>(false);
  const [isTireModalOpen, setIsTireModalOpen] = useState<boolean>(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);
  const [isTrainingFast, setIsTrainingFast] = useState<boolean>(false);
  const [isHyperparametersOpen, setIsHyperparametersOpen] = useState<boolean>(false);
  const [hyperparameters, setHyperparameters] = useState<RLHyperparameters>(DEFAULT_RL_HYPERPARAMETERS);
  const [replayBufferSize, setReplayBufferSize] = useState<number>(0);

  // Initialize Environment, RL Agent, and 3D Scene
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const env = new HeavyTruckEnv();
    envRef.current = env;

    const rlAgent = new RLAgent();
    rlAgentRef.current = rlAgent;
    setHyperparameters(rlAgent.getHyperparameters());

    const scene = new Truck3DScene(canvasMountRef.current);
    sceneRef.current = scene;

    // Load initial track geometry into 3D scene
    scene.updateTrack(env.getTrack());

    // Initial render data
    const initialObs = env.getObservation();
    const initialVState = env.getVehicleState();
    setObservation(initialObs);
    setVehicleState(initialVState);
    scene.syncVehicle(initialVState, 0.02);

    return () => {
      scene.dispose();
    };
  }, []);

  // Keyboard Event Listeners for Manual Driving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent page scrolling on arrows / space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      keysDownRef.current[e.key.toLowerCase()] = true;
      keysDownRef.current[e.key] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.key.toLowerCase()] = false;
      keysDownRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Compute Manual Action from Keys
  const updateManualControls = useCallback(() => {
    const keys = keysDownRef.current;
    let steer = 0;
    let throttle = 0;

    if (keys['a'] || keys['ArrowLeft']) steer -= 0.85;
    if (keys['d'] || keys['ArrowRight']) steer += 0.85;
    if (keys['w'] || keys['ArrowUp']) throttle += 0.95;
    if (keys['s'] || keys['ArrowDown']) throttle -= 1.0; // brake

    setManualAction({ steer, throttle });
    return { steer, throttle };
  }, []);

  // Reset Environment Callback
  const handleReset = useCallback(() => {
    if (!envRef.current || !sceneRef.current) return;
    const obs = envRef.current.reset();
    const vState = envRef.current.getVehicleState();
    setObservation(obs);
    setVehicleState(vState);
    setCumulativeReward(0);
    setStepCount(0);
    sceneRef.current.syncVehicle(vState, 0.02);
  }, []);

  // Main Simulation Loop
  useEffect(() => {
    let animId = 0;
    let lastTime = performance.now();

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);
      const dtMs = time - lastTime;
      lastTime = time;

      if (!isPlaying || !envRef.current || !sceneRef.current) return;

      const env = envRef.current;
      const scene = sceneRef.current;
      const rlAgent = rlAgentRef.current;

      // Run multiple physics sub-steps based on speedMultiplier
      const stepsToRun = speedMultiplier;

      for (let s = 0; s < stepsToRun; s++) {
        const currentObs = env.getObservation();
        const currentVState = env.getVehicleState();

        // If episode terminated (rollover or cliff breach), pause briefly so the user sees the fall
        if (currentVState.isRolledOver || currentVState.isOffTrack || currentVState.isGoalReached) {
          postTerminationFramesRef.current++;
          if (postTerminationFramesRef.current < (driverMode === 'rl_train' ? 5 : 45)) {
            // Wait to let user see fallen truck and cliff breach HUD banner
            break;
          }

          // Inform RL Agent of episode end
          if (rlAgent && (driverMode === 'rl_train' || driverMode === 'rl_eval' || isPretrainingActive)) {
            const reason = currentVState.isRolledOver
              ? 'rollover'
              : currentVState.isOffTrack
              ? 'cliff_breach'
              : 'goal_reached';
            rlAgent.onEpisodeEnd(env.render().totalCumulativeReward, reason);
          }
          postTerminationFramesRef.current = 0;
          env.reset();
          break;
        } else {
          postTerminationFramesRef.current = 0;
        }

        // Determine action based on driverMode
        let action: ContinuousAction = { steer: 0, throttle: 0 };

        if (driverMode === 'manual') {
          action = updateManualControls();
          const stepRes = env.step(action);

          // If demonstration pre-training is active, directly train the RL neural network from human actions
          if (isPretrainingActive && rlAgent) {
            const discreteAct = continuousToDiscrete(action.steer, action.throttle);
            rlAgent.storeDemonstration(
              currentObs.vector,
              discreteAct,
              stepRes.reward,
              stepRes.observation.vector,
              stepRes.terminated,
              'Manual (WASD)'
            );
          }
          continue;
        } else if (driverMode === 'safe_agent') {
          action = computeSafeAgentAction(currentObs);
          const stepRes = env.step(action);

          // If demonstration pre-training is active, directly train the RL neural network from Safe Governor
          if (isPretrainingActive && rlAgent) {
            const discreteAct = continuousToDiscrete(action.steer, action.throttle);
            rlAgent.storeDemonstration(
              currentObs.vector,
              discreteAct,
              stepRes.reward,
              stepRes.observation.vector,
              stepRes.terminated,
              'Safe Governor'
            );
          }
          continue;
        } else if (driverMode === 'aggressive_agent') {
          action = computeAggressiveAgentAction(currentObs);
        } else if (driverMode === 'rl_eval' && rlAgent) {
          const res = rlAgent.selectAction(currentObs, true);
          action = res.continuousAction;
        } else if (driverMode === 'rl_train' && rlAgent) {
          const res = rlAgent.selectAction(currentObs, false);
          action = res.continuousAction;

          // Step physics
          const stepRes = env.step(action);

          // Store transition and train
          rlAgent.storeTransition(
            currentObs.vector,
            res.actionIndex,
            stepRes.reward,
            stepRes.observation.vector,
            stepRes.terminated
          );
          rlAgent.trainStep();
          continue;
        }

        env.step(action);
      }

      // Sync 3D Scene & Update UI State
      const renderData = env.render();
      scene.syncVehicle(renderData.vehicleState, 0.02 * stepsToRun);
      scene.updateLookaheadMarkers(renderData.lookaheadPoints, renderData.vehicleState);

      setVehicleState(renderData.vehicleState);
      setObservation(renderData.observation);
      setRewardBreakdown(renderData.lastRewardBreakdown);
      setCumulativeReward(renderData.totalCumulativeReward);
      setStepCount(renderData.stepCount);

      if (rlAgent) {
        setPretrainMetrics({
          isPretrained: rlAgent.isPretrained,
          pretrainSource: rlAgent.pretrainSource,
          demonstrationsCount: rlAgent.demonstrationsCount,
          epsilon: rlAgent.epsilon,
        });
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, speedMultiplier, driverMode, isPretrainingActive, updateManualControls]);

  // Single step physics handler
  const handleStepOnce = useCallback(() => {
    if (!envRef.current || !sceneRef.current) return;
    const env = envRef.current;
    const obs = env.getObservation();
    let action: ContinuousAction = { steer: 0, throttle: 0 };
    let pretrainSource: string | null = null;

    if (driverMode === 'manual') {
      action = updateManualControls();
      pretrainSource = 'Manual (WASD)';
    } else if (driverMode === 'safe_agent') {
      action = computeSafeAgentAction(obs);
      pretrainSource = 'Safe Governor';
    } else if (driverMode === 'aggressive_agent') {
      action = computeAggressiveAgentAction(obs);
    } else if (rlAgentRef.current) {
      action = rlAgentRef.current.selectAction(obs.vector, true).continuousAction;
    }

    const stepRes = env.step(action);

    if (isPretrainingActive && pretrainSource && rlAgentRef.current) {
      const discreteAct = continuousToDiscrete(action.steer, action.throttle);
      rlAgentRef.current.storeDemonstration(
        obs.vector,
        discreteAct,
        stepRes.reward,
        stepRes.observation.vector,
        stepRes.terminated,
        pretrainSource
      );
      setPretrainMetrics({
        isPretrained: rlAgentRef.current.isPretrained,
        pretrainSource: rlAgentRef.current.pretrainSource,
        demonstrationsCount: rlAgentRef.current.demonstrationsCount,
        epsilon: rlAgentRef.current.epsilon,
      });
    }

    const renderData = env.render();
    sceneRef.current.syncVehicle(renderData.vehicleState, 0.02);
    setVehicleState(renderData.vehicleState);
    setObservation(renderData.observation);
    setRewardBreakdown(renderData.lastRewardBreakdown);
    setCumulativeReward(renderData.totalCumulativeReward);
    setStepCount(renderData.stepCount);
  }, [driverMode, isPretrainingActive, updateManualControls]);

  // Camera Mode Change
  const handleCameraChange = (mode: CameraViewMode) => {
    setCameraView(mode);
    if (sceneRef.current) sceneRef.current.setViewMode(mode);
  };

  // Environment Config Change
  const handleConfigChange = (updated: Partial<EnvironmentConfig>) => {
    if (!envRef.current || !sceneRef.current) return;
    const hadTrackChange = updated.trackType && updated.trackType !== envRef.current.getConfig().trackType;
    envRef.current.setConfig(updated);

    if (hadTrackChange) {
      sceneRef.current.updateTrack(envRef.current.getTrack());
    }
    handleReset();
  };

  // Fast Batch Training for RL
  const handleFastTrain = (episodesToTrain: number = 25) => {
    if (!envRef.current || !rlAgentRef.current) return;
    setIsTrainingFast(true);

    setTimeout(() => {
      const env = envRef.current!;
      const agent = rlAgentRef.current!;

      for (let ep = 0; ep < episodesToTrain; ep++) {
        let obs = env.reset();
        let done = false;
        let epSteps = 0;

        while (!done && epSteps < 500) {
          epSteps++;
          const act = agent.selectAction(obs.vector, false);
          const stepRes = env.step(act.actionIndex);
          agent.storeTransition(obs.vector, act.actionIndex, stepRes.reward, stepRes.observation.vector, stepRes.terminated);
          agent.trainStep();
          obs = stepRes.observation;
          done = stepRes.terminated || stepRes.truncated;
        }

        const vState = env.getVehicleState();
        const reason = vState.isRolledOver ? 'rollover' : vState.isOffTrack ? 'cliff_breach' : undefined;
        agent.onEpisodeEnd(env.render().totalCumulativeReward, reason);
      }

      setHyperparameters(agent.getHyperparameters());
      setReplayBufferSize(agent.getReplayBufferSize());
      handleReset();
      setIsTrainingFast(false);
    }, 50);
  };

  // Pre-train from Safe Governor (Autonomous Demonstration Learning)
  const handlePretrainFromSafeGovernor = (episodesToPretrain: number = 10) => {
    if (!envRef.current || !rlAgentRef.current) return;
    setIsTrainingFast(true);

    setTimeout(() => {
      const env = envRef.current!;
      const agent = rlAgentRef.current!;

      for (let ep = 0; ep < episodesToPretrain; ep++) {
        let obs = env.reset();
        let done = false;
        let epSteps = 0;

        while (!done && epSteps < 500) {
          epSteps++;
          const act = computeSafeAgentAction(obs);
          const discreteAct = continuousToDiscrete(act.steer, act.throttle);
          const stepRes = env.step(act);
          agent.storeDemonstration(
            obs.vector,
            discreteAct,
            stepRes.reward,
            stepRes.observation.vector,
            stepRes.terminated,
            'Safe Governor'
          );
          obs = stepRes.observation;
          done = stepRes.terminated || stepRes.truncated;
        }

        const vState = env.getVehicleState();
        const reason = vState.isRolledOver ? 'rollover' : vState.isOffTrack ? 'cliff_breach' : undefined;
        agent.onEpisodeEnd(env.render().totalCumulativeReward, reason);
      }

      setHyperparameters(agent.getHyperparameters());
      setReplayBufferSize(agent.getReplayBufferSize());
      setPretrainMetrics({
        isPretrained: agent.isPretrained,
        pretrainSource: agent.pretrainSource,
        demonstrationsCount: agent.demonstrationsCount,
        epsilon: agent.epsilon,
      });

      handleReset();
      setIsTrainingFast(false);
    }, 50);
  };

  // Reset RL Neural Network Model
  const handleResetRLModel = () => {
    if (!rlAgentRef.current) return;
    rlAgentRef.current.resetModel();
    setHyperparameters(rlAgentRef.current.getHyperparameters());
    setReplayBufferSize(0);
    setPretrainMetrics({
      isPretrained: false,
      pretrainSource: null,
      demonstrationsCount: 0,
      epsilon: rlAgentRef.current.epsilon,
    });
    handleReset();
  };

  // Hyperparameters Callbacks
  const handleUpdateHyperparameters = useCallback((updated: Partial<RLHyperparameters>) => {
    if (!rlAgentRef.current) return;
    rlAgentRef.current.setHyperparameters(updated);
    const current = rlAgentRef.current.getHyperparameters();
    setHyperparameters(current);
    setPretrainMetrics((prev) => ({
      ...prev,
      epsilon: current.epsilon,
    }));
  }, []);

  const handleClearBuffer = useCallback(() => {
    if (!rlAgentRef.current) return;
    rlAgentRef.current.clearReplayBuffer();
    setReplayBufferSize(0);
  }, []);

  const handleOpenHyperparameters = useCallback(() => {
    if (rlAgentRef.current) {
      setReplayBufferSize(rlAgentRef.current.getReplayBufferSize());
      setHyperparameters(rlAgentRef.current.getHyperparameters());
    }
    setIsHyperparametersOpen(true);
  }, []);

  const handleDriverModeChange = (mode: DriverMode) => {
    setDriverMode(mode);
    if (envRef.current) {
      const vState = envRef.current.getVehicleState();
      if (vState.isRolledOver || vState.isOffTrack) {
        handleReset();
      }
    }
  };

  const currentTrack = envRef.current?.getTrack();
  const currentConfig = envRef.current?.getConfig();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 3D WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 z-0 w-full h-full" />

      {/* Top Header / Spec Badge (Minimal, unobtrusive) */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Title & Status */}
        <div className="flex items-center gap-2 bg-slate-950/85 border border-slate-700/80 rounded-xl px-3.5 py-2 backdrop-blur-md shadow-lg pointer-events-auto">
          <Truck className="w-5 h-5 text-amber-500" />
          <div>
            <div className="font-extrabold tracking-tight text-white text-xs sm:text-sm flex items-center gap-2">
              <span>HEAVY TRUCK RL DYNAMICS SIMULATOR</span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800">
                Pacejka + LTR 3D
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
              <span>Track: <strong className="text-slate-200">{currentTrack?.name.split('(')[0] || 'Ridge'}</strong></span>
              <span>•</span>
              <span>Mass: <strong className="text-amber-400">{vehicleState ? `${(vehicleState.totalMass / 1000).toFixed(1)}t` : '23t'}</strong></span>
              <span>•</span>
              <span>CoM h: <strong className="text-rose-400">{vehicleState ? `${vehicleState.effectiveComHeight.toFixed(2)}m` : '1.7m'}</strong></span>
            </div>
          </div>
        </div>

        {/* Top Right Quick Badges */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-slate-950/85 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs backdrop-blur-md shadow-lg flex items-center gap-3 font-mono">
            <div>
              <span className="text-slate-400 text-[10px] mr-1">STEP:</span>
              <span className="font-bold text-sky-400">{stepCount}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] mr-1">DIST:</span>
              <span className="font-bold text-emerald-400">
                {observation ? `${(observation.crossTrackError !== undefined ? stepCount * 0.3 : 0).toFixed(0)}m` : '0m'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] mr-1">MODE:</span>
              <span className="font-bold text-amber-400 uppercase text-[11px]">{driverMode.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Telemetry & Stability Overlay (Upper Left) */}
      {!isHudCollapsed && vehicleState && observation && (
        <div className="absolute top-18 left-3 z-10 max-w-sm w-full pointer-events-auto">
          <TelemetryHUD vehicleState={vehicleState} observation={observation} />
        </div>
      )}

      {/* Floating Reward Breakdown Overlay (Upper Right) */}
      {!isHudCollapsed && rewardBreakdown && (
        <div className="absolute top-18 right-3 z-10 max-w-sm w-full pointer-events-auto hidden md:block">
          <RewardBreakdownComponent
            breakdown={rewardBreakdown}
            cumulativeReward={cumulativeReward}
            stepCount={stepCount}
          />
        </div>
      )}

      {/* Bottom Floating Control Dock (Centered, collapsible, zero center occlusion) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[96%] max-w-4xl pointer-events-auto flex flex-col items-center gap-1.5">
        {/* Toggle HUD Button */}
        <button
          onClick={() => setIsHudCollapsed(!isHudCollapsed)}
          className="flex items-center gap-1 px-3 py-1 bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold rounded-full border border-slate-700 shadow-md backdrop-blur-md cursor-pointer transition-colors"
        >
          {isHudCollapsed ? <ChevronUp className="w-3.5 h-3.5 text-sky-400" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400" />}
          <span>{isHudCollapsed ? 'SHOW TELEMETRY & METRICS' : 'HIDE HUD (CINEMATIC VIEW)'}</span>
        </button>

        {/* Main Transport & Mode Dock */}
        <div className="w-full">
          <SimulationControls
            driverMode={driverMode}
            onDriverModeChange={handleDriverModeChange}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onStepOnce={handleStepOnce}
            onReset={handleReset}
            speedMultiplier={speedMultiplier}
            onSpeedMultiplierChange={setSpeedMultiplier}
            cameraView={cameraView}
            onCameraViewChange={handleCameraChange}
            manualAction={manualAction}
            onManualActionChange={setManualAction}
            onOpenConfig={() => setIsConfigOpen(true)}
            onToggleObservation={() => setIsObservationOpen(!isObservationOpen)}
            onOpenTireModal={() => setIsTireModalOpen(true)}
            onFastTrainEpisodes={handleFastTrain}
            isTrainingFast={isTrainingFast}
            isPretrainingActive={isPretrainingActive}
            onTogglePretraining={() => setIsPretrainingActive(!isPretrainingActive)}
            pretrainMetrics={pretrainMetrics}
            onPretrainFromSafeGovernor={handlePretrainFromSafeGovernor}
            onResetRLModel={handleResetRLModel}
            hyperparameters={hyperparameters}
            onOpenHyperparameters={handleOpenHyperparameters}
          />
        </div>
      </div>

      {/* Observation Vector Modal */}
      {isObservationOpen && observation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
          <div className="max-w-2xl w-full">
            <ObservationInspector observation={observation} />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => setIsObservationOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-600 text-xs font-bold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pacejka Tire Dynamics Modal */}
      {vehicleState && (
        <TireDynamicsModal
          isOpen={isTireModalOpen}
          onClose={() => setIsTireModalOpen(false)}
          vehicleState={vehicleState}
          roadFriction={observation ? observation.currentFriction : 0.8}
        />
      )}

      {/* Configuration & Tuning Drawer */}
      {currentConfig && (
        <ConfigDrawer
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          config={currentConfig}
          onConfigChange={handleConfigChange}
          onOpenHyperparameters={handleOpenHyperparameters}
        />
      )}

      {/* RL Hyperparameters Modal */}
      <RLHyperparametersModal
        isOpen={isHyperparametersOpen}
        onClose={() => setIsHyperparametersOpen(false)}
        hyperparameters={hyperparameters}
        onUpdateHyperparameters={handleUpdateHyperparameters}
        currentBufferSize={replayBufferSize}
        onClearBuffer={handleClearBuffer}
      />
    </div>
  );
}
