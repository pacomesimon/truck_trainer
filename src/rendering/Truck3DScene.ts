/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VehicleState, Waypoint, LookaheadPoint } from '../types/truck';
import { GeneratedTrack } from '../track/trackGenerator';

export type CameraViewMode = 'chase' | 'cabin' | 'orbit';

export class Truck3DScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private animFrameId: number = 0;

  // Truck Group & Sub-assemblies
  private truckRootGroup: THREE.Group;
  private chassisGroup: THREE.Group;
  private cabinGroup: THREE.Group;
  private cargoGroup: THREE.Group;
  private comGizmoGroup: THREE.Group;

  // Suspension & Wheels
  private wheelFL: THREE.Group;
  private wheelFR: THREE.Group;
  private wheelRL: THREE.Group;
  private wheelRR: THREE.Group;
  private springFL: THREE.Mesh;
  private springFR: THREE.Mesh;
  private springRL: THREE.Mesh;
  private springRR: THREE.Mesh;

  // Lights & Visual Cues
  private brakeLightL: THREE.Mesh;
  private brakeLightR: THREE.Mesh;
  private brakeLightMat: THREE.MeshStandardMaterial;

  // Ground Contact Shadows
  private tireShadowFL!: THREE.Mesh;
  private tireShadowFR!: THREE.Mesh;
  private tireShadowRL!: THREE.Mesh;
  private tireShadowRR!: THREE.Mesh;
  private underbodyShadow!: THREE.Mesh;

  // Track & Environment
  private trackMeshGroup: THREE.Group;
  private cliffMeshGroup: THREE.Group;
  private stagingZonesGroup: THREE.Group;
  private trajectoryLine: THREE.Line;
  private lookaheadGroup: THREE.Group;
  private animatedFlags: { mesh: THREE.Mesh; origPositions: Float32Array; freq: number; amp: number }[] = [];

  // Particles
  private dustParticles!: THREE.Points;
  private dustGeom!: THREE.BufferGeometry;
  private dustPositions!: Float32Array;
  private dustOpacities!: Float32Array;
  private dustCount: number = 180;

  // State
  private viewMode: CameraViewMode = 'chase';
  private targetCameraPos = new THREE.Vector3();
  private targetCameraLookAt = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.container = container;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Initialize Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    // Scene & Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1726); // Moody alpine mountain atmosphere
    this.scene.fog = new THREE.FogExp2(0x0e1726, 0.0035);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.2,
      1200
    );
    this.camera.position.set(0, 15, 25);

    // Orbit Controls for free inspection
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 180;
    this.controls.minDistance = 3.5;
    this.controls.enabled = false; // enabled when viewMode === 'orbit'

    // Studio Environment lighting
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    this.setupLighting();

    // Build Procedural Truck
    this.truckRootGroup = new THREE.Group();
    this.chassisGroup = new THREE.Group();
    this.cabinGroup = new THREE.Group();
    this.cargoGroup = new THREE.Group();
    this.comGizmoGroup = new THREE.Group();

    // Wheels & suspension placeholders
    this.wheelFL = new THREE.Group();
    this.wheelFR = new THREE.Group();
    this.wheelRL = new THREE.Group();
    this.wheelRR = new THREE.Group();
    this.springFL = new THREE.Mesh();
    this.springFR = new THREE.Mesh();
    this.springRL = new THREE.Mesh();
    this.springRR = new THREE.Mesh();

    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0x440000,
      emissive: 0x220000,
      roughness: 0.2,
    });
    this.brakeLightL = new THREE.Mesh();
    this.brakeLightR = new THREE.Mesh();

    this.buildTruckModel();
    this.scene.add(this.truckRootGroup);

    // Track & Staging Groups
    this.trackMeshGroup = new THREE.Group();
    this.cliffMeshGroup = new THREE.Group();
    this.stagingZonesGroup = new THREE.Group();
    this.lookaheadGroup = new THREE.Group();
    this.scene.add(this.trackMeshGroup);
    this.scene.add(this.cliffMeshGroup);
    this.scene.add(this.stagingZonesGroup);
    this.scene.add(this.lookaheadGroup);

    // Trajectory Centerline
    const lineGeom = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    this.trajectoryLine = new THREE.Line(lineGeom, lineMat);
    this.scene.add(this.trajectoryLine);

    // Dust particles
    this.setupDustParticles();

    // Window resize handler
    window.addEventListener('resize', this.onResize);

    // Start render loop
    this.tick();
  }

  private setupLighting() {
    // Warm Sun Key Light
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(40, 70, 30);
    keyLight.castShadow = !this.isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 160;
      const d = 25;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0004;
    }
    this.scene.add(keyLight);

    // Cool Sky / Mountain Fill
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1f2937, 1.1);
    this.scene.add(hemiLight);

    // Subtle Rim Light
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.9);
    rimLight.position.set(-30, 20, -40);
    this.scene.add(rimLight);
  }

  /**
   * Procedural Composite Heavy Truck (3-12 parts)
   */
  private buildTruckModel() {
    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.5,
      metalness: 0.8,
    });
    const cabPaintMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Safety industrial amber/orange
      roughness: 0.25,
      metalness: 0.4,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x111e2e,
      roughness: 0.1,
      metalness: 0.9,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.12,
      metalness: 0.95,
    });
    const cargoMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Heavy corrugated steel container
      roughness: 0.6,
      metalness: 0.3,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.85,
      metalness: 0.1,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.85,
    });
    const springMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red racing/heavy suspension springs
      roughness: 0.4,
      metalness: 0.7,
    });

    // Contact Shadows on the road surface
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(8, 12, 20, 0.85)');
    sGrad.addColorStop(0.5, 'rgba(8, 12, 20, 0.45)');
    sGrad.addColorStop(1, 'rgba(8, 12, 20, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;

    const tireShadowGeom = new THREE.PlaneGeometry(0.7, 0.95);
    tireShadowGeom.rotateX(-Math.PI / 2);
    const createShadowMesh = () =>
      new THREE.Mesh(
        tireShadowGeom,
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        })
      );

    this.tireShadowFL = createShadowMesh();
    this.tireShadowFR = createShadowMesh();
    this.tireShadowRL = createShadowMesh();
    this.tireShadowRR = createShadowMesh();

    const underbodyGeom = new THREE.PlaneGeometry(2.5, 5.8);
    underbodyGeom.rotateX(-Math.PI / 2);
    this.underbodyShadow = new THREE.Mesh(
      underbodyGeom,
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.underbodyShadow.position.set(0, 0.015, 0);

    this.truckRootGroup.add(
      this.underbodyShadow,
      this.tireShadowFL,
      this.tireShadowFR,
      this.tireShadowRL,
      this.tireShadowRR
    );

    // 1. Chassis Frame (2 Long Steel I-Beams, resting on suspension above wheels)
    const beamGeom = new THREE.BoxGeometry(0.18, 0.24, 5.8);
    const leftBeam = new THREE.Mesh(beamGeom, chassisMat);
    leftBeam.position.set(-0.55, 0.95, 0);
    leftBeam.castShadow = true;
    this.chassisGroup.add(leftBeam);

    const rightBeam = new THREE.Mesh(beamGeom, chassisMat);
    rightBeam.position.set(0.55, 0.95, 0);
    rightBeam.castShadow = true;
    this.chassisGroup.add(rightBeam);

    // Fuel Tank (Cylindrical tank mounted on right side)
    const fuelTankGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.4, 16);
    fuelTankGeom.rotateZ(Math.PI / 2);
    const fuelTank = new THREE.Mesh(fuelTankGeom, chromeMat);
    fuelTank.position.set(0.85, 0.90, -0.4);
    fuelTank.castShadow = true;
    this.chassisGroup.add(fuelTank);

    // Battery / Tool Box (Left side)
    const toolBoxGeom = new THREE.BoxGeometry(0.45, 0.35, 1.0);
    const toolBox = new THREE.Mesh(toolBoxGeom, chassisMat);
    toolBox.position.set(-0.85, 0.90, -0.4);
    this.chassisGroup.add(toolBox);

    // Front Heavy Bumper & Tow Hooks
    const bumperGeom = new THREE.BoxGeometry(2.35, 0.32, 0.35);
    const bumper = new THREE.Mesh(bumperGeom, chromeMat);
    bumper.position.set(0, 0.88, 2.85);
    bumper.castShadow = true;
    this.chassisGroup.add(bumper);

    // 2. Heavy Hauler Cabin (sits on chassis frame)
    const cabBaseGeom = new THREE.BoxGeometry(2.2, 1.7, 1.9);
    const cabBase = new THREE.Mesh(cabBaseGeom, cabPaintMat);
    cabBase.position.set(0, 1.92, 1.85);
    cabBase.castShadow = true;
    this.cabinGroup.add(cabBase);

    // Windshield (Angled dark glass)
    const windshieldGeom = new THREE.BoxGeometry(1.95, 0.7, 0.08);
    windshieldGeom.rotateX(0.15);
    const windshield = new THREE.Mesh(windshieldGeom, glassMat);
    windshield.position.set(0, 2.25, 2.75);
    this.cabinGroup.add(windshield);

    // Side Windows
    const sideWinGeom = new THREE.BoxGeometry(0.06, 0.55, 0.95);
    const sideWinL = new THREE.Mesh(sideWinGeom, glassMat);
    sideWinL.position.set(-1.11, 2.17, 1.95);
    const sideWinR = new THREE.Mesh(sideWinGeom, glassMat);
    sideWinR.position.set(1.11, 2.17, 1.95);
    this.cabinGroup.add(sideWinL, sideWinR);

    // Chrome Radiator Grille
    const grilleGeom = new THREE.BoxGeometry(1.4, 0.85, 0.08);
    const grille = new THREE.Mesh(grilleGeom, chromeMat);
    grille.position.set(0, 1.62, 2.82);
    this.cabinGroup.add(grille);

    // Headlights
    const lightGeom = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff0aa,
      roughness: 0.1,
    });
    const lightL = new THREE.Mesh(lightGeom, lightMat);
    lightL.position.set(-0.85, 0.95, 2.9);
    const lightR = new THREE.Mesh(lightGeom, lightMat);
    lightR.position.set(0.85, 0.95, 2.9);
    this.cabinGroup.add(lightL, lightR);

    // Dual Chrome Vertical Exhaust Stacks
    const exhaustGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12);
    const exhaustL = new THREE.Mesh(exhaustGeom, chromeMat);
    exhaustL.position.set(-1.05, 2.47, 0.75);
    exhaustL.castShadow = true;
    const exhaustR = new THREE.Mesh(exhaustGeom, chromeMat);
    exhaustR.position.set(1.05, 2.47, 0.75);
    exhaustR.castShadow = true;
    this.cabinGroup.add(exhaustL, exhaustR);

    // 3. Cargo Container / Box
    const containerGeom = new THREE.BoxGeometry(2.35, 1.85, 3.4);
    const container = new THREE.Mesh(containerGeom, cargoMat);
    container.position.set(0, 2.00, -1.05);
    container.castShadow = true;
    this.cargoGroup.add(container);

    // Container Ribbing Accents
    for (let r = -4; r <= 4; r++) {
      const ribGeom = new THREE.BoxGeometry(2.38, 1.87, 0.06);
      const rib = new THREE.Mesh(ribGeom, chassisMat);
      rib.position.set(0, 2.00, -1.05 + r * 0.35);
      this.cargoGroup.add(rib);
    }

    // Brake Lights (attached to rear of container/chassis)
    const brakeGeom = new THREE.BoxGeometry(0.28, 0.16, 0.08);
    this.brakeLightL = new THREE.Mesh(brakeGeom, this.brakeLightMat);
    this.brakeLightL.position.set(-0.95, 1.07, -2.85);
    this.brakeLightR = new THREE.Mesh(brakeGeom, this.brakeLightMat);
    this.brakeLightR.position.set(0.95, 1.07, -2.85);
    this.cargoGroup.add(this.brakeLightL, this.brakeLightR);

    // 4. Dynamic Center of Mass (CoM) Visualizer Gizmo
    const comSphereGeom = new THREE.SphereGeometry(0.18, 16, 16);
    const comSphereMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff2222,
      roughness: 0.2,
      metalness: 0.6,
    });
    const comSphere = new THREE.Mesh(comSphereGeom, comSphereMat);
    this.comGizmoGroup.add(comSphere);

    // Ring around CoM
    const ringGeom = new THREE.RingGeometry(0.22, 0.26, 24);
    ringGeom.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    this.comGizmoGroup.add(ring);

    // CoM height connector rod down to chassis
    const stemGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
    const stemMat = new THREE.MeshBasicMaterial({ color: 0xf87171 });
    const stem = new THREE.Mesh(stemGeom, stemMat);
    stem.position.y = -0.4;
    this.comGizmoGroup.add(stem);

    // 5. Wheels & Spring Assemblies (Wheels placed at Y = 0.58 so tire bottom touches ground at Y = 0)
    const createWheelAssembly = (isFront: boolean, isLeft: boolean) => {
      const wheelGroup = new THREE.Group();

      // Tire (Cylinder oriented along X axis)
      const tireRadius = 0.58;
      const tireWidth = 0.38;
      const tireGeom = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 24);
      tireGeom.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeom, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      // Steel Rim
      const rimGeom = new THREE.CylinderGeometry(0.36, 0.36, tireWidth + 0.02, 16);
      rimGeom.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      wheelGroup.add(rim);

      // Lug nuts
      for (let i = 0; i < 6; i++) {
        const nutGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6);
        nutGeom.rotateZ(Math.PI / 2);
        const nut = new THREE.Mesh(nutGeom, chromeMat);
        const ang = (i * Math.PI) / 3;
        nut.position.set(isLeft ? -0.2 : 0.2, Math.sin(ang) * 0.22, Math.cos(ang) * 0.22);
        wheelGroup.add(nut);
      }

      return wheelGroup;
    };

    // Front Wheels
    this.wheelFL = createWheelAssembly(true, true);
    this.wheelFR = createWheelAssembly(true, false);
    // Rear Wheels
    this.wheelRL = createWheelAssembly(false, true);
    this.wheelRR = createWheelAssembly(false, false);

    // Spring Meshes (connect chassis at ~0.95m down to wheel hub at 0.58m)
    const springGeom = new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12);
    this.springFL = new THREE.Mesh(springGeom, springMat);
    this.springFR = new THREE.Mesh(springGeom, springMat);
    this.springRL = new THREE.Mesh(springGeom, springMat);
    this.springRR = new THREE.Mesh(springGeom, springMat);

    // Assemble Hierarchy:
    // Springs are mounted to the chassis; Wheels are grounded in truckRootGroup
    this.chassisGroup.add(this.springFL, this.springFR, this.springRL, this.springRR);
    this.chassisGroup.add(this.cabinGroup);
    this.chassisGroup.add(this.cargoGroup);
    this.chassisGroup.add(this.comGizmoGroup);

    this.truckRootGroup.add(this.chassisGroup);
    this.truckRootGroup.add(this.wheelFL, this.wheelFR, this.wheelRL, this.wheelRR);
  }

  /**
   * Setup dust particles for tire skid & wheel slip effects
   */
  private setupDustParticles() {
    this.dustGeom = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustOpacities = new Float32Array(this.dustCount);

    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions[i * 3] = 0;
      this.dustPositions[i * 3 + 1] = -100;
      this.dustPositions[i * 3 + 2] = 0;
      this.dustOpacities[i] = 0;
    }

    this.dustGeom.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const dustMat = new THREE.PointsMaterial({
      color: 0xd6cbb0, // mountain dirt/sand
      size: 0.6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.dustParticles = new THREE.Points(this.dustGeom, dustMat);
    this.scene.add(this.dustParticles);
  }

  /**
   * Builds 3D Mountain Track Geometry, Asphalt Road, Centerline, and Cliff Drop-offs
   */
  public updateTrack(track: GeneratedTrack) {
    // Clear existing track & cliff meshes
    while (this.trackMeshGroup.children.length > 0) {
      const obj = this.trackMeshGroup.children[0];
      this.trackMeshGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
    while (this.cliffMeshGroup.children.length > 0) {
      const obj = this.cliffMeshGroup.children[0];
      this.cliffMeshGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const waypoints = track.waypoints;
    if (waypoints.length < 2) return;

    // 1. Build Centerline Trajectory Line
    const linePoints: THREE.Vector3[] = [];
    for (const wp of waypoints) {
      linePoints.push(new THREE.Vector3(wp.x, wp.y + 0.025, wp.z));
    }
    this.trajectoryLine.geometry.dispose();
    this.trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

    // 2. Build Extruded Road Ribbon Mesh
    const numSegments = waypoints.length - 1;
    const roadVertices: number[] = [];
    const roadNormals: number[] = [];
    const roadUVs: number[] = [];
    const roadIndices: number[] = [];

    // Cliff Wall Vertices (left and right sheer vertical drops)
    const leftCliffVertices: number[] = [];
    const rightCliffVertices: number[] = [];

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const halfW = wp.width / 2;

      // Normal vector in X-Z ground plane
      const nx = -Math.sin(wp.heading);
      const nz = Math.cos(wp.heading);

      // Banking rotation around path tangent
      const bank = wp.bankAngle;
      const bankDy = Math.sin(bank) * halfW;

      // Left edge of road
      const lx = wp.x - nx * halfW;
      const ly = wp.y - bankDy;
      const lz = wp.z - nz * halfW;

      // Right edge of road
      const rx = wp.x + nx * halfW;
      const ry = wp.y + bankDy;
      const rz = wp.z + nz * halfW;

      roadVertices.push(lx, ly, lz);
      roadNormals.push(0, 1, 0);
      roadUVs.push(0, i * 0.4);

      roadVertices.push(rx, ry, rz);
      roadNormals.push(0, 1, 0);
      roadUVs.push(1, i * 0.4);

      // Cliff wall vertices
      if (wp.hasLeftCliff) {
        leftCliffVertices.push(lx, ly, lz);
        leftCliffVertices.push(lx - nx * 8.0, ly - wp.leftCliffDepth, lz - nz * 8.0);
      }
      if (wp.hasRightCliff) {
        rightCliffVertices.push(rx, ry, rz);
        rightCliffVertices.push(rx + nx * 8.0, ry - wp.rightCliffDepth, rz + nz * 8.0);
      }

      if (i < numSegments) {
        const base = i * 2;
        // Two triangles for quad segment
        roadIndices.push(base, base + 1, base + 2);
        roadIndices.push(base + 1, base + 3, base + 2);
      }
    }

    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeom.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeom.setIndex(roadIndices);
    roadGeom.computeVertexNormals();

    // Road Material with subtle asphalt roughness
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x272c35,
      roughness: 0.8,
      metalness: 0.1,
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = !this.isSoftwareGl;
    this.trackMeshGroup.add(roadMesh);

    // Left Cliff Mesh
    if (leftCliffVertices.length >= 6) {
      const leftCliffGeom = new THREE.BufferGeometry();
      leftCliffGeom.setAttribute('position', new THREE.Float32BufferAttribute(leftCliffVertices, 3));
      const cliffIndices: number[] = [];
      const numCliffSeg = leftCliffVertices.length / 6 - 1;
      for (let s = 0; s < numCliffSeg; s++) {
        const b = s * 2;
        cliffIndices.push(b, b + 2, b + 1);
        cliffIndices.push(b + 1, b + 2, b + 3);
      }
      leftCliffGeom.setIndex(cliffIndices);
      leftCliffGeom.computeVertexNormals();

      const cliffMat = new THREE.MeshStandardMaterial({
        color: 0x161b22,
        roughness: 0.95,
        metalness: 0.05,
      });
      const leftCliffMesh = new THREE.Mesh(leftCliffGeom, cliffMat);
      this.cliffMeshGroup.add(leftCliffMesh);
    }

    // Right Cliff Mesh
    if (rightCliffVertices.length >= 6) {
      const rightCliffGeom = new THREE.BufferGeometry();
      rightCliffGeom.setAttribute('position', new THREE.Float32BufferAttribute(rightCliffVertices, 3));
      const cliffIndices: number[] = [];
      const numCliffSeg = rightCliffVertices.length / 6 - 1;
      for (let s = 0; s < numCliffSeg; s++) {
        const b = s * 2;
        cliffIndices.push(b, b + 1, b + 2);
        cliffIndices.push(b + 1, b + 3, b + 2);
      }
      rightCliffGeom.setIndex(cliffIndices);
      rightCliffGeom.computeVertexNormals();

      const cliffMat = new THREE.MeshStandardMaterial({
        color: 0x1a202c,
        roughness: 0.95,
        metalness: 0.05,
      });
      const rightCliffMesh = new THREE.Mesh(rightCliffGeom, cliffMat);
      this.cliffMeshGroup.add(rightCliffMesh);
    }

    // 3. Build Shaded Start & Finish Staging Areas and Flagpoles
    this.buildStagingZones(track);
  }

  /**
   * Constructs shaded staging areas at the beginning and end with flags
   */
  private buildStagingZones(track: GeneratedTrack) {
    while (this.stagingZonesGroup.children.length > 0) {
      const obj = this.stagingZonesGroup.children[0];
      this.stagingZonesGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
    this.animatedFlags = [];

    const waypoints = track.waypoints;
    if (waypoints.length < 2) return;

    // --- Procedural Textures ---
    // 1. Start Staging Pad Texture
    const startCanvas = document.createElement('canvas');
    startCanvas.width = 512;
    startCanvas.height = 512;
    const sCtx = startCanvas.getContext('2d')!;
    sCtx.fillStyle = '#1e242d'; // Shaded dark anthracite asphalt
    sCtx.fillRect(0, 0, 512, 512);

    // Hazard caution borders on outer 10%
    const curbW = 46;
    for (let y = 0; y < 512; y += 28) {
      const isYellow = Math.floor(y / 28) % 2 === 0;
      sCtx.fillStyle = isYellow ? '#eab308' : '#111827';
      sCtx.fillRect(0, y, curbW, 28);
      sCtx.fillRect(512 - curbW, y, curbW, 28);
    }

    // White starting line across track at s = 0 (near top edge)
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(curbW + 4, 488, 512 - (curbW * 2 + 8), 16);

    // Starting grid box outline
    sCtx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    sCtx.lineWidth = 6;
    sCtx.strokeRect(curbW + 24, 80, 512 - (curbW * 2 + 48), 340);

    // Staging text
    sCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    sCtx.font = 'bold 32px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('START / STAGING', 256, 230);
    sCtx.font = 'bold 20px sans-serif';
    sCtx.fillStyle = 'rgba(250, 204, 21, 0.9)';
    sCtx.fillText('▲ PIT DEPARTURE ▲', 256, 280);

    const startPadTex = new THREE.CanvasTexture(startCanvas);
    startPadTex.colorSpace = THREE.SRGBColorSpace;
    startPadTex.wrapS = THREE.ClampToEdgeWrapping;
    startPadTex.wrapT = THREE.ClampToEdgeWrapping;

    // 2. Finish Goal Pad Texture
    const finishCanvas = document.createElement('canvas');
    finishCanvas.width = 512;
    finishCanvas.height = 512;
    const fCtx = finishCanvas.getContext('2d')!;
    fCtx.fillStyle = '#1e242d';
    fCtx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 28) {
      const isYellow = Math.floor(y / 28) % 2 === 0;
      fCtx.fillStyle = isYellow ? '#eab308' : '#111827';
      fCtx.fillRect(0, y, curbW, 28);
      fCtx.fillRect(512 - curbW, y, curbW, 28);
    }

    // Checkered Finish Ribbon (4 rows of 16 squares) at y = 0 to 48 (at s = 0 entry)
    const checkRows = 4;
    const checkCols = 16;
    const checkH = 14;
    const roadInnerW = 512 - curbW * 2;
    const sqW = roadInnerW / checkCols;
    for (let r = 0; r < checkRows; r++) {
      for (let c = 0; c < checkCols; c++) {
        fCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#09090b';
        fCtx.fillRect(curbW + c * sqW, r * checkH, sqW, checkH);
      }
    }

    fCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    fCtx.font = 'bold 36px sans-serif';
    fCtx.textAlign = 'center';
    fCtx.textBaseline = 'middle';
    fCtx.fillText('🏁 FINISH LINE 🏁', 256, 240);
    fCtx.font = 'bold 22px sans-serif';
    fCtx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    fCtx.fillText('OFF-ROAD STAGE COMPLETE', 256, 295);

    const finishPadTex = new THREE.CanvasTexture(finishCanvas);
    finishPadTex.colorSpace = THREE.SRGBColorSpace;

    // 3. Green Start Flag Texture
    const greenFlagCanvas = document.createElement('canvas');
    greenFlagCanvas.width = 256;
    greenFlagCanvas.height = 160;
    const gCtx = greenFlagCanvas.getContext('2d')!;
    gCtx.fillStyle = '#059669'; // Emerald green
    gCtx.fillRect(0, 0, 256, 160);
    gCtx.lineWidth = 10;
    gCtx.strokeStyle = '#ffffff';
    gCtx.strokeRect(6, 6, 244, 148);
    gCtx.fillStyle = '#ffffff';
    gCtx.font = 'bold 42px sans-serif';
    gCtx.textAlign = 'center';
    gCtx.textBaseline = 'middle';
    gCtx.fillText('START', 128, 80);
    const greenFlagTex = new THREE.CanvasTexture(greenFlagCanvas);
    greenFlagTex.colorSpace = THREE.SRGBColorSpace;

    // 4. Checkered Finish Flag Texture
    const checkFlagCanvas = document.createElement('canvas');
    checkFlagCanvas.width = 256;
    checkFlagCanvas.height = 160;
    const cfCtx = checkFlagCanvas.getContext('2d')!;
    const cfRows = 5;
    const cfCols = 8;
    const cellW = 256 / cfCols;
    const cellH = 160 / cfRows;
    for (let r = 0; r < cfRows; r++) {
      for (let c = 0; c < cfCols; c++) {
        cfCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0a0a0a';
        cfCtx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    const checkFlagTex = new THREE.CanvasTexture(checkFlagCanvas);
    checkFlagTex.colorSpace = THREE.SRGBColorSpace;

    // Materials
    const startPadMat = new THREE.MeshStandardMaterial({
      map: startPadTex,
      roughness: 0.85,
      metalness: 0.1,
    });
    const finishPadMat = new THREE.MeshStandardMaterial({
      map: finishPadTex,
      roughness: 0.85,
      metalness: 0.1,
    });
    const foundationMat = new THREE.MeshStandardMaterial({
      color: 0x161b22,
      roughness: 0.95,
      metalness: 0.05,
    });
    const chromePoleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.2,
    });
    const goldFinialMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.85,
      roughness: 0.25,
    });

    // Helper: builds flagpole with fluttering cloth banner
    const addFlagPole = (
      x: number,
      y: number,
      z: number,
      bannerTex: THREE.CanvasTexture,
      angle: number,
      freq: number
    ) => {
      const poleGroup = new THREE.Group();
      poleGroup.position.set(x, y, z);
      poleGroup.rotation.y = angle;

      // Base Pedestal
      const baseGeom = new THREE.CylinderGeometry(0.22, 0.26, 0.18, 16);
      baseGeom.translate(0, 0.09, 0);
      poleGroup.add(new THREE.Mesh(baseGeom, foundationMat));

      // Chrome Pole (Height 4.5m)
      const poleGeom = new THREE.CylinderGeometry(0.045, 0.055, 4.5, 16);
      poleGeom.translate(0, 2.25, 0);
      poleGroup.add(new THREE.Mesh(poleGeom, chromePoleMat));

      // Gold Finial Sphere
      const finialGeom = new THREE.SphereGeometry(0.1, 16, 16);
      finialGeom.translate(0, 4.5, 0);
      poleGroup.add(new THREE.Mesh(finialGeom, goldFinialMat));

      // Cloth Flag Banner
      const flagGeom = new THREE.PlaneGeometry(1.5, 0.9, 14, 8);
      flagGeom.translate(0.75, 0, 0); // extend outward from pole
      const origPositions = new Float32Array(flagGeom.attributes.position.array);

      const flagMat = new THREE.MeshStandardMaterial({
        map: bannerTex,
        roughness: 0.45,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const flagMesh = new THREE.Mesh(flagGeom, flagMat);
      flagMesh.position.set(0.05, 3.8, 0);
      poleGroup.add(flagMesh);

      this.animatedFlags.push({
        mesh: flagMesh,
        origPositions,
        freq,
        amp: 0.22,
      });

      this.stagingZonesGroup.add(poleGroup);
    };

    // ==========================================
    // 1. BUILD START STAGING PAD & GREEN FLAGS
    // ==========================================
    const p0 = waypoints[0];
    const p1 = waypoints[1];
    const dx0 = p1.x - p0.x;
    const dy0 = p1.y - p0.y;
    const dz0 = p1.z - p0.z;
    const len0 = Math.hypot(dx0, dz0) || 1;
    const tx0 = dx0 / len0;
    const ty0 = dy0 / len0;
    const tz0 = dz0 / len0;
    const nx0 = -tz0;
    const nz0 = tx0;
    const bank0 = p0.bankAngle;
    const startHalfW = (p0.width + 2.0) / 2;
    const startLen = 16.0; // 16 meters back from p0

    const numStartSegs = 6;
    const startVerts: number[] = [];
    const startNorms: number[] = [];
    const startUvs: number[] = [];
    const startIndices: number[] = [];
    const startSkirtVerts: number[] = [];
    const startSkirtIndices: number[] = [];

    for (let i = 0; i <= numStartSegs; i++) {
      const u = i / numStartSegs;
      // from s = -startLen to s = +0.25 (seamlessly joins road mesh)
      const s = -startLen + (startLen + 0.25) * u;
      const cx = p0.x + tx0 * s;
      const cy = p0.y + ty0 * s;
      const cz = p0.z + tz0 * s;
      const dyBank = Math.sin(bank0) * startHalfW;

      const lx = cx - nx0 * startHalfW;
      const ly = cy - dyBank;
      const lz = cz - nz0 * startHalfW;

      const rx = cx + nx0 * startHalfW;
      const ry = cy + dyBank;
      const rz = cz + nz0 * startHalfW;

      startVerts.push(lx, ly, lz, rx, ry, rz);
      startNorms.push(0, 1, 0, 0, 1, 0);
      startUvs.push(0, u, 1, u);

      if (i < numStartSegs) {
        const b = i * 2;
        startIndices.push(b, b + 1, b + 2);
        startIndices.push(b + 1, b + 3, b + 2);
      }

      // Foundation cliff skirt under start pad
      startSkirtVerts.push(lx, ly, lz, lx, ly - 10, lz);
      startSkirtVerts.push(rx, ry, rz, rx, ry - 10, rz);
    }

    const startGeom = new THREE.BufferGeometry();
    startGeom.setAttribute('position', new THREE.Float32BufferAttribute(startVerts, 3));
    startGeom.setAttribute('normal', new THREE.Float32BufferAttribute(startNorms, 3));
    startGeom.setAttribute('uv', new THREE.Float32BufferAttribute(startUvs, 2));
    startGeom.setIndex(startIndices);
    startGeom.computeVertexNormals();

    const startMesh = new THREE.Mesh(startGeom, startPadMat);
    startMesh.receiveShadow = !this.isSoftwareGl;
    this.stagingZonesGroup.add(startMesh);

    // Foundation cliff skirt under start pad
    const skirtGeom = new THREE.BufferGeometry();
    skirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(startSkirtVerts, 3));
    for (let i = 0; i < numStartSegs; i++) {
      const b = i * 4;
      startSkirtIndices.push(b, b + 1, b + 4);
      startSkirtIndices.push(b + 1, b + 5, b + 4);
      startSkirtIndices.push(b + 2, b + 6, b + 3);
      startSkirtIndices.push(b + 3, b + 6, b + 7);
    }
    skirtGeom.setIndex(startSkirtIndices);
    skirtGeom.computeVertexNormals();
    this.stagingZonesGroup.add(new THREE.Mesh(skirtGeom, foundationMat));

    // Place Green Start Flags at s = 0 (left and right curbs)
    const dyBank0 = Math.sin(bank0) * startHalfW;
    const startLeftX = p0.x - nx0 * startHalfW;
    const startLeftY = p0.y - dyBank0;
    const startLeftZ = p0.z - nz0 * startHalfW;

    const startRightX = p0.x + nx0 * startHalfW;
    const startRightY = p0.y + dyBank0;
    const startRightZ = p0.z + nz0 * startHalfW;

    const trackHeading0 = Math.atan2(tz0, tx0);
    addFlagPole(startLeftX, startLeftY, startLeftZ, greenFlagTex, trackHeading0 + Math.PI / 4, 1.8);
    addFlagPole(startRightX, startRightY, startRightZ, greenFlagTex, trackHeading0 - Math.PI / 4, 2.1);

    // ==========================================
    // 2. BUILD FINISH GOAL PAD & CHECKERED FLAGS
    // ==========================================
    const plast = waypoints[waypoints.length - 1];
    const pprev = waypoints[waypoints.length - 2];
    const fdx = plast.x - pprev.x;
    const fdy = plast.y - pprev.y;
    const fdz = plast.z - pprev.z;
    const flen = Math.hypot(fdx, fdz) || 1;
    const ftx = fdx / flen;
    const fty = fdy / flen;
    const ftz = fdz / flen;
    const fnx = -ftz;
    const fnz = ftx;
    const fbank = plast.bankAngle;
    const finishHalfW = (plast.width + 2.0) / 2;
    const finishLen = 18.0; // 18m run-off after goal line

    const numFinishSegs = 6;
    const finishVerts: number[] = [];
    const finishNorms: number[] = [];
    const finishUvs: number[] = [];
    const finishIndices: number[] = [];
    const finishSkirtVerts: number[] = [];
    const finishSkirtIndices: number[] = [];

    for (let i = 0; i <= numFinishSegs; i++) {
      const u = i / numFinishSegs;
      // from s = -0.25 to s = +finishLen
      const s = -0.25 + (finishLen + 0.25) * u;
      const cx = plast.x + ftx * s;
      const cy = plast.y + fty * s;
      const cz = plast.z + ftz * s;
      const fdyBank = Math.sin(fbank) * finishHalfW;

      const lx = cx - fnx * finishHalfW;
      const ly = cy - fdyBank;
      const lz = cz - fnz * finishHalfW;

      const rx = cx + fnx * finishHalfW;
      const ry = cy + fdyBank;
      const rz = cz + fnz * finishHalfW;

      finishVerts.push(lx, ly, lz, rx, ry, rz);
      finishNorms.push(0, 1, 0, 0, 1, 0);
      finishUvs.push(0, u, 1, u);

      if (i < numFinishSegs) {
        const b = i * 2;
        finishIndices.push(b, b + 1, b + 2);
        finishIndices.push(b + 1, b + 3, b + 2);
      }

      finishSkirtVerts.push(lx, ly, lz, lx, ly - 10, lz);
      finishSkirtVerts.push(rx, ry, rz, rx, ry - 10, rz);
    }

    const finishGeom = new THREE.BufferGeometry();
    finishGeom.setAttribute('position', new THREE.Float32BufferAttribute(finishVerts, 3));
    finishGeom.setAttribute('normal', new THREE.Float32BufferAttribute(finishNorms, 3));
    finishGeom.setAttribute('uv', new THREE.Float32BufferAttribute(finishUvs, 2));
    finishGeom.setIndex(finishIndices);
    finishGeom.computeVertexNormals();

    const finishMesh = new THREE.Mesh(finishGeom, finishPadMat);
    finishMesh.receiveShadow = !this.isSoftwareGl;
    this.stagingZonesGroup.add(finishMesh);

    // Foundation cliff skirt under finish pad
    const fskirtGeom = new THREE.BufferGeometry();
    fskirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(finishSkirtVerts, 3));
    for (let i = 0; i < numFinishSegs; i++) {
      const b = i * 4;
      finishSkirtIndices.push(b, b + 1, b + 4);
      finishSkirtIndices.push(b + 1, b + 5, b + 4);
      finishSkirtIndices.push(b + 2, b + 6, b + 3);
      finishSkirtIndices.push(b + 3, b + 6, b + 7);
    }
    fskirtGeom.setIndex(finishSkirtIndices);
    fskirtGeom.computeVertexNormals();
    this.stagingZonesGroup.add(new THREE.Mesh(fskirtGeom, foundationMat));

    // Place Checkered Finish Flags at s = 0 (plast) on left and right borders
    const fdyBank0 = Math.sin(fbank) * finishHalfW;
    const finishLeftX = plast.x - fnx * finishHalfW;
    const finishLeftY = plast.y - fdyBank0;
    const finishLeftZ = plast.z - fnz * finishHalfW;

    const finishRightX = plast.x + fnx * finishHalfW;
    const finishRightY = plast.y + fdyBank0;
    const finishRightZ = plast.z + fnz * finishHalfW;

    const trackHeadingLast = Math.atan2(ftz, ftx);
    addFlagPole(finishLeftX, finishLeftY, finishLeftZ, checkFlagTex, trackHeadingLast + Math.PI / 4, 2.0);
    addFlagPole(finishRightX, finishRightY, finishRightZ, checkFlagTex, trackHeadingLast - Math.PI / 4, 2.3);
  }

  /**
   * Updates Lookahead preview waypoints visualizer
   */
  public updateLookaheadMarkers(lookaheads: LookaheadPoint[], vehicleState: VehicleState) {
    // Clear old preview markers
    while (this.lookaheadGroup.children.length > 0) {
      const obj = this.lookaheadGroup.children[0];
      this.lookaheadGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const sphereGeom = new THREE.SphereGeometry(0.22, 16, 16);
    const roadY = vehicleState.roadElevation ?? 0;

    for (let i = 0; i < lookaheads.length; i++) {
      const pt = lookaheads[i];
      // pt is in vehicle coordinates:
      // relX: forward along heading, relZ: lateral offset
      const cosYaw = Math.cos(vehicleState.yaw);
      const sinYaw = Math.sin(vehicleState.yaw);

      const worldX = vehicleState.x + (pt.relX * cosYaw - pt.relZ * sinYaw);
      const worldZ = vehicleState.z + (pt.relX * sinYaw + pt.relZ * cosYaw);
      const worldY = roadY + pt.relY;

      // Color from cyan (closest) to deep blue (furthest)
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x22d3ee : i === 1 ? 0x38bdf8 : 0x818cf8,
      });
      const marker = new THREE.Mesh(sphereGeom, mat);
      // Sit flush on road ribbon (radius 0.22 so center is at worldY + 0.22)
      marker.position.set(worldX, worldY + 0.22, worldZ);
      this.lookaheadGroup.add(marker);
    }
  }

  /**
   * Main sync method called every simulation step
   */
  public syncVehicle(vehicleState: VehicleState, dt: number) {
    // 1. Truck Root Position in World Space
    // Grounding: root group placed directly at road elevation
    const roadY = vehicleState.roadElevation ?? 0;
    const airborneOffset = Math.max(0, vehicleState.y - (roadY + vehicleState.effectiveComHeight));
    let displayY = roadY + airborneOffset;
    let displayRoll = -vehicleState.roll;

    if (vehicleState.isOffTrack) {
      const isRightOff = vehicleState.wheels.fr.isOffTrack || vehicleState.wheels.rr.isOffTrack;
      const isLeftOff = vehicleState.wheels.fl.isOffTrack || vehicleState.wheels.rl.isOffTrack;
      if (isRightOff) {
        displayRoll -= 0.55; // roll right into cliff abyss
      } else if (isLeftOff) {
        displayRoll += 0.55; // roll left into cliff abyss
      }
      displayY -= 1.4;
    }

    this.truckRootGroup.position.set(vehicleState.x, displayY, vehicleState.z);

    // 2. Realistic Tangent Orientation:
    // Rotate entire truck (wheels, chassis, cab, cargo, shadows) in YXZ order
    // to match the 3D surface tangent and slope:
    const yawAngle = -vehicleState.yaw + Math.PI / 2;
    this.truckRootGroup.rotation.set(-vehicleState.pitch, yawAngle, displayRoll, 'YXZ');
    this.chassisGroup.rotation.set(0, 0, 0);

    // 3. Update Dynamic CoM Gizmo position
    this.comGizmoGroup.position.set(
      0,
      vehicleState.effectiveComHeight - 0.4,
      0
    );

    // 4. Update Wheels & Suspension Compression
    const L = 4.6;
    const W = 2.45;
    const a = L / 2;
    const b = L / 2;
    const halfW = W / 2;
    const tireRadius = 0.58;

    // Resting hub Y is tireRadius (0.58m) so tire bottom touches road at Y = 0.00m
    const baseHubY = tireRadius;

    // Suspension compression offsets (meters)
    const compFL = vehicleState.wheels.fl.suspensionCompression;
    const compFR = vehicleState.wheels.fr.suspensionCompression;
    const compRL = vehicleState.wheels.rl.suspensionCompression;
    const compRR = vehicleState.wheels.rr.suspensionCompression;

    // Wheel lift calculation when vehicle rolls heavily or wheel loses contact
    const liftFL = vehicleState.wheels.fl.normalForce <= 0 ? Math.max(0, -displayRoll * halfW - 0.05) : 0;
    const liftFR = vehicleState.wheels.fr.normalForce <= 0 ? Math.max(0, displayRoll * halfW - 0.05) : 0;
    const liftRL = vehicleState.wheels.rl.normalForce <= 0 ? Math.max(0, -displayRoll * halfW - 0.05) : 0;
    const liftRR = vehicleState.wheels.rr.normalForce <= 0 ? Math.max(0, displayRoll * halfW - 0.05) : 0;

    // Front-Left Wheel
    this.wheelFL.position.set(-halfW, baseHubY + liftFL, a);
    this.wheelFL.rotation.y = -vehicleState.steeringAngle;
    this.springFL.position.set(-halfW + 0.18, 0.76 - compFL / 2, a);
    this.springFL.scale.set(1, Math.max(0.35, 1 - compFL * 2.5), 1);

    // Front-Right Wheel
    this.wheelFR.position.set(halfW, baseHubY + liftFR, a);
    this.wheelFR.rotation.y = -vehicleState.steeringAngle;
    this.springFR.position.set(halfW - 0.18, 0.76 - compFR / 2, a);
    this.springFR.scale.set(1, Math.max(0.35, 1 - compFR * 2.5), 1);

    // Rear-Left Wheel
    this.wheelRL.position.set(-halfW, baseHubY + liftRL, -b);
    this.springRL.position.set(-halfW + 0.18, 0.76 - compRL / 2, -b);
    this.springRL.scale.set(1, Math.max(0.35, 1 - compRL * 2.5), 1);

    // Rear-Right Wheel
    this.wheelRR.position.set(halfW, baseHubY + liftRR, -b);
    this.springRR.position.set(halfW - 0.18, 0.76 - compRR / 2, -b);
    this.springRR.scale.set(1, Math.max(0.35, 1 - compRR * 2.5), 1);

    // Roll wheels based on forward speed
    const wheelRotSpeed = vehicleState.vx / tireRadius; // v / r
    this.wheelFL.rotation.x += wheelRotSpeed * dt;
    this.wheelFR.rotation.x += wheelRotSpeed * dt;
    this.wheelRL.rotation.x += wheelRotSpeed * dt;
    this.wheelRR.rotation.x += wheelRotSpeed * dt;

    // Update Contact Shadows directly on the road surface
    const shadowBaseY = 0.015;
    this.tireShadowFL.position.set(-halfW, shadowBaseY, a);
    this.tireShadowFR.position.set(halfW, shadowBaseY, a);
    this.tireShadowRL.position.set(-halfW, shadowBaseY, -b);
    this.tireShadowRR.position.set(halfW, shadowBaseY, -b);

    const isOff = vehicleState.isOffTrack;
    (this.tireShadowFL.material as THREE.MeshBasicMaterial).opacity = isOff || vehicleState.wheels.fl.isOffTrack ? 0 : Math.max(0, 0.75 - liftFL * 2.5);
    (this.tireShadowFR.material as THREE.MeshBasicMaterial).opacity = isOff || vehicleState.wheels.fr.isOffTrack ? 0 : Math.max(0, 0.75 - liftFR * 2.5);
    (this.tireShadowRL.material as THREE.MeshBasicMaterial).opacity = isOff || vehicleState.wheels.rl.isOffTrack ? 0 : Math.max(0, 0.75 - liftRL * 2.5);
    (this.tireShadowRR.material as THREE.MeshBasicMaterial).opacity = isOff || vehicleState.wheels.rr.isOffTrack ? 0 : Math.max(0, 0.75 - liftRR * 2.5);
    (this.underbodyShadow.material as THREE.MeshBasicMaterial).opacity = isOff ? 0 : Math.max(0.1, 0.55 - airborneOffset * 0.4);

    // 5. Brake Lights
    const isBraking = vehicleState.throttle < -0.1;
    if (isBraking) {
      this.brakeLightMat.color.setHex(0xff0000);
      this.brakeLightMat.emissive.setHex(0xff1111);
    } else {
      this.brakeLightMat.color.setHex(0x440000);
      this.brakeLightMat.emissive.setHex(0x110000);
    }

    // 6. Camera Follow Updates
    this.updateCamera(vehicleState);

    // 7. Emit skid/dust particles if lateral slip or braking is high
    const maxSlipAngle = Math.max(
      Math.abs(vehicleState.wheels.fl.slipAngle),
      Math.abs(vehicleState.wheels.rr.slipAngle)
    );
    if (maxSlipAngle > 0.12 && vehicleState.vx > 3) {
      this.emitDustParticle(vehicleState.x, roadY + 0.1, vehicleState.z);
    }
  }

  private emitDustParticle(x: number, y: number, z: number) {
    const idx = Math.floor(Math.random() * this.dustCount);
    this.dustPositions[idx * 3] = x + (Math.random() - 0.5) * 1.5;
    this.dustPositions[idx * 3 + 1] = y + Math.random() * 0.4;
    this.dustPositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 1.5;
    this.dustGeom.attributes.position.needsUpdate = true;
  }

  private updateCamera(vState: VehicleState) {
    const roadY = vState.roadElevation ?? 0;

    if (this.viewMode === 'orbit') {
      this.controls.target.set(vState.x, roadY + 1.3, vState.z);
      this.controls.update();
      return;
    }

    const cosYaw = Math.cos(vState.yaw);
    const sinYaw = Math.sin(vState.yaw);

    if (this.viewMode === 'chase') {
      // Dynamic camera distance expands with higher speed
      const speedDistanceBonus = Math.min(5, vState.vx * 0.18);
      const followDist = 11.0 + speedDistanceBonus;
      const followHeight = 4.2 + Math.max(0, vState.vx * 0.06);

      const targetX = vState.x - cosYaw * followDist;
      const targetZ = vState.z - sinYaw * followDist;
      const targetY = roadY + followHeight;

      // Exponential smooth damping
      this.camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.12);

      const lookAheadDist = 6.0;
      const lookAtX = vState.x + cosYaw * lookAheadDist;
      const lookAtZ = vState.z + sinYaw * lookAheadDist;
      const lookAtY = roadY + 1.2;

      this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
    } else if (this.viewMode === 'cabin') {
      // Driver cabin camera view
      const cabX = vState.x + cosYaw * 1.8;
      const cabZ = vState.z + sinYaw * 1.8;
      const cabY = roadY + 2.1;

      this.camera.position.set(cabX, cabY, cabZ);

      const lookX = vState.x + cosYaw * 20.0;
      const lookZ = vState.z + sinYaw * 20.0;
      const lookY = roadY + 1.9;

      this.camera.lookAt(lookX, lookY, lookZ);
    }
  }

  public setViewMode(mode: CameraViewMode) {
    this.viewMode = mode;
    this.controls.enabled = mode === 'orbit';
  }

  public getViewMode(): CameraViewMode {
    return this.viewMode;
  }

  private onResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private tick = () => {
    this.animFrameId = requestAnimationFrame(this.tick);
    if (this.viewMode === 'orbit') {
      this.controls.update();
    }

    // Dynamic wind ripple fluttering animation for start and finish flags
    const time = performance.now() * 0.0035;
    for (let f = 0; f < this.animatedFlags.length; f++) {
      const flag = this.animatedFlags[f];
      const posAttr = flag.mesh.geometry.attributes.position;
      const orig = flag.origPositions;
      for (let i = 0; i < posAttr.count; i++) {
        const x = orig[i * 3];
        const span = Math.max(0, x / 1.5);
        const wave = Math.sin(time * flag.freq + x * 4.2) * flag.amp * span;
        posAttr.setZ(i, orig[i * 3 + 2] + wave);
      }
      posAttr.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
