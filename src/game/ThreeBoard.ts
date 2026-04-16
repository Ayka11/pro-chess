import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { NodeData } from "./parityLoader";
import { ProgressiveChessBoard, type ProgressiveBoardNode } from "./ProgressiveChessBoard";
import type { Piece, PieceType, PortalColor, PortalState } from "./types";
type PieceMove = {
  pieceId: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsed: number;
  duration: number;
};

type BoundaryEdge = {
  key: string;
  startKey: string;
  endKey: string;
  coords: [number, number, number, number, number, number];
  length: number;
};



export class ThreeBoard {
      // --- Animation and camera helpers ---
      private moves: PieceMove[] = [];
      private visible: boolean = true;
      private time: number = 0;
      private timeUniform: { value: number } = { value: 0 };
      private pan: THREE.Vector2 = new THREE.Vector2(0, 0);
      private distance: number = 128;
      private yaw: number = Math.PI * 0.25;
      private pitch: number = 1.12;
      private pointer: THREE.Vector2 = new THREE.Vector2();
      private raycaster: THREE.Raycaster = new THREE.Raycaster();
      private pieceSharedGeometries: Map<string, THREE.BufferGeometry> = new Map();
      private pieceGlowMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial();
      private tileBorderMaterial: THREE.LineBasicMaterial = new THREE.LineBasicMaterial();
      private engagementZoneNodeIds: string[] = [];
      private selectedNodeIds: string[] = [];
      private highlightNodeIds: string[] = [];
      private engagementZonePulseActive: boolean = false;

      public clearPortals(): void {
        this.portals = [];
        this.progressiveBoard?.clearPortals();
        this.updateTournamentBanner();
      }

      public updateIdleAnimation(deltaMs: number): void {
        const dt = deltaMs * 0.001;
        for (const mapped of this.pieceMap.values()) {
          const obj = mapped.object as THREE.Group;
          if (!obj || obj.userData.breathPhase === undefined) continue;
          obj.userData.breathPhase += dt * 1.1;
          obj.scale.setScalar(obj.userData.baseScale * (1 + 0.025 * Math.sin(obj.userData.breathPhase)));
          obj.position.y = obj.userData.baseWorldY + 0.022 * Math.sin(obj.userData.breathPhase * 0.7);
          if (mapped.glow) (mapped.glow as THREE.Group).position.y = obj.position.y;
        }
      }
    // Board color palette for buckets
    private boardBucketPalette: Record<"neutral" | "red" | "green" | "yellow", number> = {
      neutral: 0xcccccc,
      red: 0xff6666,
      green: 0x66ff66,
      yellow: 0xffff66
    };
  private isTournamentMode: boolean = false;
  // Tournament and portal UI/logic
  private tournamentBanner: HTMLDivElement | null = null;
  private portalTooltip: HTMLDivElement | null = null;
  private portals: PortalState[] = [];
  private portalGroup: THREE.Group = new THREE.Group();
  private boardContainer: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private container: HTMLElement | null = null;

  // --- Missing fields for board and rendering ---
  private scene: THREE.Scene = new THREE.Scene();
  private root: THREE.Group = new THREE.Group();
  private pieceRoot: THREE.Group = new THREE.Group();
  private lightGroup: THREE.Group = new THREE.Group();
  private camera: THREE.PerspectiveCamera | null = null;

  // --- Board topology and mesh fields ---
  private nodeById: Map<string, NodeData> = new Map();
  private nodeIndexById: Map<string, number> = new Map();
  private nodeIdByIndex: Map<number, string> = new Map();
  private nodeWorld: Map<string, THREE.Vector3> = new Map();
  private boardCenter: THREE.Vector2 = new THREE.Vector2();

  /**
   * Public getter for boardCenter (for external access)
   */
  public getBoardCenter(): THREE.Vector2 {
    return this.boardCenter;
  }

  public init(container: HTMLElement, size: { w: number; h: number }): void {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(size.w, size.h, false);
    container.appendChild(this.renderer.domElement);
    this.progressiveBoard?.setViewportSize(size.w, size.h);
    Object.assign(this.renderer.domElement.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%",
      pointerEvents: "none", zIndex: "2"
    });
    this.scene.add(this.root);
    this.root.add(this.pieceRoot);
    this.root.add(this.lightGroup);

    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(18, 38, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 200;
    key.shadow.camera.left = -60;
    key.shadow.camera.right = 60;
    key.shadow.camera.top = 60;
    key.shadow.camera.bottom = -60;
    key.shadow.bias = -0.0003;
    this.lightGroup.add(key);

    const fill = new THREE.DirectionalLight(0x7ab8ff, 0.55);
    fill.position.set(-14, 18, -10);
    this.lightGroup.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, 6, -30);
    this.lightGroup.add(rim);

    this.lightGroup.add(new THREE.AmbientLight(0xffffff, 0.45));

    this.camera = new THREE.PerspectiveCamera(55, size.w / size.h, 0.5, 800);
    this.updateCameraFraming(size.w, size.h);
    this.applyCameraTransform();
  }

  /**
   * Set the board topology (nodes, positions, etc.)
   * @param nodes Array of NodeData
   */
  public setBoardTopology(nodes: NodeData[]): void {
    this.nodeById.clear();
    this.nodeIndexById.clear();
    this.nodeIdByIndex.clear();
    this.nodeWorld.clear();
    const snappedWorld = this.snapNodeWorldPositions(nodes);
    nodes.forEach((node, idx) => {
      this.nodeById.set(node.id, node);
      this.nodeIndexById.set(node.id, idx);
      this.nodeIdByIndex.set(idx, node.id);
      this.nodeWorld.set(node.id, snappedWorld.get(node.id) ?? new THREE.Vector3(node.x, 0, node.z));
    });
    // Compute board center
    if (nodes.length > 0) {
      let sumX = 0, sumZ = 0;
      for (const node of nodes) {
        const snapped = this.nodeWorld.get(node.id);
        if (!snapped) continue;
        sumX += snapped.x;
        sumZ += snapped.z;
      }
      this.boardCenter.set(sumX / nodes.length, sumZ / nodes.length);
    }
    this.syncBoardMetrics(Array.from(this.nodeWorld.values()));
    this.buildBoardMeshes(nodes);
    this.syncProgressiveBoard();
    this.forceLargeEngagementZone();
  }

  public addPortal(id: string, position: THREE.Vector3, color?: number): void {
    const nodeId = this.findNearestNodeId(position);
    if (!nodeId) return;

    const portal: PortalState = {
      id,
      nodeId,
      color: this.portalColorFromNumber(color),
      label: `Portal ${this.portals.length + 1}`,
      active: true
    };
    const existingIndex = this.portals.findIndex((entry) => entry.id === id);
    if (existingIndex >= 0) {
      this.portals[existingIndex] = portal;
    } else {
      this.portals.push(portal);
    }
    this.progressiveBoard?.setPortals(this.portals);
    this.updateTournamentBanner();
  }

  public setPortalActive(id: string, active: boolean): void {
    const portal = this.portals.find((entry) => entry.id === id);
    if (!portal) return;
    portal.active = active;
    this.progressiveBoard?.setPortals(this.portals);
    this.updateTournamentBanner();
  }
  private boardMesh: THREE.InstancedMesh | null = null;
  private progressiveBoard: ProgressiveChessBoard | null = null;
  private boardVisualMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private boardBorderMesh: THREE.LineSegments | null = null;
  private boardFrameGroup: THREE.Group | null = null;
  private boardDecorMesh: THREE.Mesh | null = null;
  private engagementZoneOutline: LineSegments2 | null = null;
  private highlightMesh: THREE.InstancedMesh | null = null;
  private tileSide: number = 1;
  private tileHeight: number = 1;
  private tileMaterial: THREE.Material = new THREE.MeshBasicMaterial();
  private boardVisualMaterials: Map<string, THREE.Material> = new Map();
  private boardHighlightAttr: THREE.InstancedBufferAttribute | null = null;

  // --- Piece and animation helpers ---
  private pieceBuffer: Map<string, Piece[]> = new Map();
  private tmpSeenPieces: Set<string> = new Set();
  private pieceMap: Map<string, any> = new Map();

  // --- Temporary math objects ---
  private tmpPos: THREE.Vector3 = new THREE.Vector3();
  private tmpQuat: THREE.Quaternion = new THREE.Quaternion();
  private tmpScale: THREE.Vector3 = new THREE.Vector3();
  private tmpMat: THREE.Matrix4 = new THREE.Matrix4();
  private yAxis: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  public setTournamentMode(active: boolean): void {
    this.isTournamentMode = active;
    this.progressiveBoard?.setTournamentMode(active);
    this.syncBoardPresentation();
    this.updateTournamentBanner();
  }




  public setPieces(pieces: Piece[]): void {
    this.pieceBuffer.clear();
    this.tmpSeenPieces.clear();

    for (const piece of pieces) {
      if (!this.pieceBuffer.has(piece.type)) {
        this.pieceBuffer.set(piece.type, []);
      }
      this.pieceBuffer.get(piece.type)?.push(piece);
      this.tmpSeenPieces.add(piece.id);
    }

    for (const piece of pieces) {
      const existing = this.pieceMap.get(piece.id);
      const p = this.nodeWorld.get(piece.nodeId);
      if (!p) continue;
      const node = this.nodeById.get(piece.nodeId);
      const isOnWhiteField = node?.isColored === 0;
      if (!existing) {
        const object = this.createPieceObjectForField(piece.type, piece.color, isOnWhiteField);
        const glow = this.createPieceGlow(piece.type);
        glow.visible = false;
        this.pieceRoot.add(glow);
        this.pieceRoot.add(object);
        this.pieceMap.set(piece.id, {
          type: piece.type,
          nodeId: piece.nodeId,
          isOnWhiteField,
          object,
          glow,
          materials: this.collectPieceMaterials(object)
        });
      }
      const mapped = this.pieceMap.get(piece.id);
      if (!mapped) continue;
      mapped.isOnWhiteField = isOnWhiteField;
      mapped.object.userData.baseWorldY = 0.64;
      mapped.object.userData.baseScale = mapped.object.scale.x;
      mapped.object.position.set(p.x, 0.64, p.z);
      mapped.glow.position.copy(mapped.object.position);
    }
    for (const pieceId of Array.from(this.pieceMap.keys())) {
      if (!this.tmpSeenPieces.has(pieceId)) {
        const mapped = this.pieceMap.get(pieceId);
        if (!mapped) continue;
        this.pieceRoot.remove(mapped.object);
        this.pieceRoot.remove(mapped.glow);
        this.disposePieceObject(mapped.object);
        this.disposePieceObject(mapped.glow);
        this.pieceMap.delete(pieceId);
      }
    }
  }

  public animateMove(pieceId: string, toNodeId: string, durationMs = 260): void {
    const mapping = this.pieceMap.get(pieceId);
    if (!mapping) return;
    const fromNode = this.nodeWorld.get(mapping.nodeId);
    const toNode = this.nodeWorld.get(toNodeId);
    if (!fromNode || !toNode) return;
    mapping.nodeId = toNodeId;
    this.moves.push({
      pieceId,
      from: fromNode.clone().setY(0.64),
      to: toNode.clone().setY(0.64),
      elapsed: 0,
      duration: Math.max(durationMs, 1)
    });
  }

  /**
   * Set the central engagement zone (call this from your GameState with the 96 nodes)
   */
  public setEngagementZoneNodes(nodeIds: string[], active = false): void {
    this.engagementZoneNodeIds = [...nodeIds];
    this.engagementZonePulseActive = active;
    this.updateEngagementZoneOutline();
    this.updateEngagementZoneMaterial();
    this.progressiveBoard?.setEngagementZoneNodes(this.engagementZoneNodeIds, active);
  }

  // Automatically force the large engagement zone like in ba.jpg
  private forceLargeEngagementZone(): void {
    const allIds = Array.from(this.nodeWorld.keys());
    const center = this.boardCenter.clone();
    const zoneNodes: string[] = [];

    for (const id of allIds) {
      const pos = this.nodeWorld.get(id)!;
      const dx = pos.x - center.x;
      const dz = pos.z - center.y;

      const hexDist = Math.max(
        Math.abs(dx),
        Math.abs(dz),
        Math.abs(dx + dz)
      ) / (this.tileSide * 1.085);

      if (hexDist <= 5.8) {
        zoneNodes.push(id);
      }
    }

    console.log(`[Force Large Zone] ${zoneNodes.length} nodes selected`);
    this.setEngagementZoneNodes(zoneNodes, false);
  }

  // ────────────────────── Update Method ──────────────────────
  public update(deltaMs: number): void {
    if (!this.visible) return;

    this.time += deltaMs * 0.001;
    this.timeUniform.value = this.time;
    this.updateEngagementZoneMaterial();

    this.updateIdleAnimation(deltaMs);
    this.progressiveBoard?.update(deltaMs);

    // Existing move animation logic...
    for (let i = this.moves.length - 1; i >= 0; i--) {
      const move = this.moves[i];
      const map = this.pieceMap.get(move.pieceId);
      if (!map) {
        this.moves.splice(i, 1);
        continue;
      }
      if (!map.object || !map.glow) {
        this.moves.splice(i, 1);
        continue;
      }
      move.elapsed += deltaMs;
      const t = Math.min(move.elapsed / move.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.tmpPos.copy(move.from).lerp(move.to, eased);
      this.tmpPos.y += Math.sin(eased * Math.PI) * 0.32;
      map.object.position.copy(this.tmpPos);
      map.glow.position.copy(this.tmpPos);
      if (t >= 1) {
        this.moves.splice(i, 1);
      }
    }

    if (this.renderer && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.renderer) {
      this.renderer.domElement.style.display = visible ? "block" : "none";
      if (!visible) {
        this.renderer.clear(true, true, true);
      }
    }
    if (this.tournamentBanner) {
      this.tournamentBanner.style.display = visible && this.isTournamentMode ? "flex" : "none";
    }
  }

  public setHighlightedNodes(selectedNodeId: string | null, legalNodeIds: string[]): void {
    if (!this.boardHighlightAttr) return;
    this.boardHighlightAttr.array.fill(0);
    this.selectedNodeIds.length = 0;
    this.highlightNodeIds.length = 0;
    if (selectedNodeId) {
      const idx = this.nodeIndexById.get(selectedNodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 1);
      }
      this.selectedNodeIds.push(selectedNodeId);
    }
    for (const nodeId of legalNodeIds) {
      const idx = this.nodeIndexById.get(nodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 0.7);
      }
      this.highlightNodeIds.push(nodeId);
    }
    this.boardHighlightAttr.needsUpdate = true;
    this.progressiveBoard?.setSelectedNodeIds(this.selectedNodeIds);
    this.progressiveBoard?.setHighlightedNodes(this.highlightNodeIds);
    this.updateHighlightMesh();
  }

  public setSelectedPieceIds(pieceIds: string[]): void {
    for (const mapped of this.pieceMap.values()) {
      mapped.glow.visible = false;
      for (const material of mapped.materials) {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
      }
    }
    for (const pieceId of pieceIds) {
      const mapping = this.pieceMap.get(pieceId);
      if (!mapping) continue;
      mapping.glow.visible = true;
      for (const material of mapping.materials) {
        material.emissive.setHex(0x4488ff);
        material.emissiveIntensity = 0.32;
      }
    }
  }

  public setTrainingHighlights(highlights: Array<{ nodeId: string; type: string }>): void {
    const moveNodeIds = highlights
      .filter((highlight) => highlight.type === "move" || highlight.type === "strategic")
      .map((highlight) => highlight.nodeId);
    const captureNodeIds = highlights
      .filter((highlight) => highlight.type === "capture")
      .map((highlight) => highlight.nodeId);
    const blockedNodeIds = highlights
      .filter((highlight) => highlight.type === "blocked")
      .map((highlight) => highlight.nodeId);
    this.setSelectedPieceIds([]);
    this.progressiveBoard?.setSelectedNodeIds([]);
    this.progressiveBoard?.setHighlightedNodes(moveNodeIds);
    this.progressiveBoard?.setCaptureHighlightedNodes(captureNodeIds);
    this.progressiveBoard?.setBlockedHighlightedNodes(blockedNodeIds);
  }

  public raycast(pointer: { x: number; y: number }, viewport: { w: number; h: number }): string | null {
    if (!this.camera || !this.boardMesh) return null;
    this.pointer.set((pointer.x / viewport.w) * 2 - 1, -(pointer.y / viewport.h) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.boardMesh, false);
    if (hits.length === 0) return null;
    const first = hits[0];
    if (first.instanceId === undefined) return null;
    return this.nodeIdByIndex.get(first.instanceId) ?? null;
  }

  public panBy(dx: number, dy: number): void {
    if (!this.camera) return;
    const scale = this.distance * 0.0028;
    const rightX = -Math.sin(this.yaw);
    const rightZ = Math.cos(this.yaw);
    const forwardX = -Math.cos(this.yaw);
    const forwardZ = -Math.sin(this.yaw);

    this.pan.x += (-dx * rightX + dy * forwardX) * scale;
    this.pan.y += (-dx * rightZ + dy * forwardZ) * scale;
    this.applyCameraTransform();
  }

  public zoomBy(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance - delta * 34, 26, 165);
    this.applyCameraTransform();
  }

  public resetCamera(): void {
    this.pan.set(0, 0);
    this.distance = 128;
    this.yaw = Math.PI * 0.75;
    this.pitch = 1.12;
    this.applyCameraTransform();
  }

  public orbitBy(deltaYaw: number, deltaPitch: number): void {
    this.yaw -= deltaYaw * 0.0055;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitch * 0.0045, 0.2, 1.53);
    this.applyCameraTransform();
  }

  public setViewPreset(view: "iso" | "top" | "side"): void {
    if (view === "top") {
      this.pitch = 1.53;
      this.distance = 90;
      this.yaw = Math.PI * 0.5;
    } else if (view === "side") {
      this.pitch = 0.35;
      this.distance = 96;
      this.yaw = Math.PI * 0.5;
    } else {
      this.pitch = 1.12;
      this.distance = 128;
      this.yaw = Math.PI * 0.75;
    }
    this.applyCameraTransform();
  }

  public resize(size: { w: number; h: number }): void {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(size.w, size.h, false);
    this.updateCameraFraming(size.w, size.h);
    this.updateEngagementZoneResolution(size.w, size.h);
    this.progressiveBoard?.setViewportSize(size.w, size.h);
    this.applyCameraTransform();
  }

  // ────────────────────── Cleanup ──────────────────────
  public dispose(): void {
    if (this.debugAutoStepInterval) {
      clearInterval(this.debugAutoStepInterval);
      this.debugAutoStepInterval = null;
    }
    window.removeEventListener("keydown", this.boundHandleDebugKey);
    this.clearPortals();

    for (const mapped of this.pieceMap.values()) {
      this.pieceRoot.remove(mapped.object);
      this.pieceRoot.remove(mapped.glow);
      this.disposePieceObject(mapped.object);
      this.disposePieceObject(mapped.glow);
    }
    this.pieceMap.clear();
    if (this.boardMesh) {
      this.boardMesh.geometry.dispose();
      this.root.remove(this.boardMesh);
      this.boardMesh = null;
    }
    if (this.progressiveBoard) {
      this.root.remove(this.progressiveBoard);
      this.progressiveBoard.dispose();
      this.progressiveBoard = null;
    }
    for (const mesh of this.boardVisualMeshes.values()) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (!Array.isArray(mat)) {
        mat.dispose();
      }
    }
    this.boardVisualMeshes.clear();
    if (this.boardBorderMesh) {
      this.boardBorderMesh.geometry.dispose();
      const borderMaterial = this.boardBorderMesh.material;
      if (Array.isArray(borderMaterial)) {
        borderMaterial.forEach((material) => material.dispose());
      } else {
        borderMaterial.dispose();
      }
      this.root.remove(this.boardBorderMesh);
      this.boardBorderMesh = null;
    }
    if (this.boardFrameGroup) {
      this.root.remove(this.boardFrameGroup);
      this.boardFrameGroup = null;
    }
    if (this.boardDecorMesh) {
      this.root.remove(this.boardDecorMesh);
      // dispose texture if present
      const mat = this.boardDecorMesh.material as THREE.Material;
      if (!Array.isArray(mat)) {
        const anyMat = mat as any;
        if (anyMat.map && typeof anyMat.map.dispose === 'function') anyMat.map.dispose();
        mat.dispose();
      }
      this.boardDecorMesh.geometry.dispose();
      this.boardDecorMesh = null;
    }
    if (this.highlightMesh) {
      this.highlightMesh.geometry.dispose();
      const m = this.highlightMesh.material;
      if (!Array.isArray(m)) {
        m.dispose();
      }
      this.root.remove(this.highlightMesh);
      this.highlightMesh = null;
    }
    if (this.engagementZoneOutline) {
      this.engagementZoneOutline.geometry.dispose();
      const m = this.engagementZoneOutline.material;
      if (!Array.isArray(m)) {
        m.dispose();
      }
      this.root.remove(this.engagementZoneOutline);
      this.engagementZoneOutline = null;
    }
    this.boardHighlightAttr = null;
    for (const geometry of this.pieceSharedGeometries.values()) {
      geometry.dispose();
    }
    this.pieceSharedGeometries.clear();
    this.pieceGlowMaterial.dispose();
    this.tileMaterial.dispose();
    this.tileBorderMaterial.dispose();
    if (this.tournamentBanner?.parentElement) {
      this.tournamentBanner.parentElement.removeChild(this.tournamentBanner);
    }
    this.tournamentBanner = null;
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    this.renderer = null;
    this.camera = null;
  }

  // Allow external visual layers (e.g. helper groups) to be added to the board root.
  public addVisualLayer(obj: THREE.Object3D): void {
    this.root.add(obj);
  }

  public removeVisualLayer(obj: THREE.Object3D): void {
    this.root.remove(obj);
  }

  private applyCameraTransform(): void {
    if (!this.camera) return;
    const targetX = this.boardCenter.x + this.pan.x;
    const targetZ = this.boardCenter.y + this.pan.y;
    const cosPitch = Math.cos(this.pitch);
    const x = targetX + this.distance * cosPitch * Math.cos(this.yaw);
    const y = this.distance * Math.sin(this.pitch);
    const z = targetZ + this.distance * cosPitch * Math.sin(this.yaw);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(targetX, 0, targetZ);
    this.camera.updateProjectionMatrix();
  }

  private updateCameraFraming(width: number, height: number): void {
    if (!this.camera) return;
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    this.camera.aspect = aspect;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }

  private buildBoardMeshes(nodes: NodeData[]): void {
    // Remove old board meshes
    if (this.boardMesh) {
      this.root.remove(this.boardMesh);
      this.boardMesh.geometry.dispose();
      this.boardMesh = null;
    }
    for (const mesh of this.boardVisualMeshes.values()) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    this.boardVisualMeshes.clear();
    for (const mat of this.boardVisualMaterials.values()) mat.dispose();
    this.boardVisualMaterials.clear();
    if (this.highlightMesh) {
      this.root.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh = null;
    }
    if (this.engagementZoneOutline) {
      this.root.remove(this.engagementZoneOutline);
      this.engagementZoneOutline.geometry.dispose();
      const material = this.engagementZoneOutline.material;
      if (!Array.isArray(material)) {
        material.dispose();
      }
      this.engagementZoneOutline = null;
    }
    if (this.boardFrameGroup) { this.root.remove(this.boardFrameGroup); this.boardFrameGroup = null; }
    if (this.boardDecorMesh) { this.root.remove(this.boardDecorMesh); this.boardDecorMesh.geometry.dispose(); this.boardDecorMesh = null; }
    if (nodes.length === 0) return;

    const n = nodes.length;
    // circumradius of equilateral triangle with side = tileSide
    const R = this.tileSide / Math.sqrt(3);

    // ── Invisible rayhit mesh for picking ──
    const hitGeo = new THREE.CircleGeometry(R, 3);
    hitGeo.rotateX(-Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.boardMesh = new THREE.InstancedMesh(hitGeo, hitMat, n);
    this.boardMesh.renderOrder = 0;
    nodes.forEach((node, idx) => {
      const p = this.nodeWorld.get(node.id);
      if (!p) return;
      this.tmpPos.set(p.x, 0.01, p.z);
      this.tmpQuat.setFromAxisAngle(this.yAxis, this.boardYawForNode(node));
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.boardMesh!.setMatrixAt(idx, this.tmpMat);
    });
    this.boardMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.boardMesh);

    // ── Visual tile meshes per color bucket ──
    const buckets: Array<"neutral" | "red" | "green" | "yellow"> = ["neutral", "red", "green", "yellow"];
    const bucketEntries = new Map<string, Array<{ node: NodeData; p: THREE.Vector3 }>>();
    for (const b of buckets) bucketEntries.set(b, []);
    for (const node of nodes) {
      const p = this.nodeWorld.get(node.id);
      if (!p) continue;
      bucketEntries.get(this.boardBucketForNode(node))!.push({ node, p });
    }
    const tileR = R * 0.96;
    for (const bucket of buckets) {
      const entries = bucketEntries.get(bucket)!;
      if (entries.length === 0) continue;
      const visMat = new THREE.MeshStandardMaterial({
        color: this.boardBucketColor(bucket),
        roughness: bucket === "neutral" ? 0.42 : 0.28,
        metalness: bucket === "neutral" ? 0.02 : 0.08,
      });
      this.boardVisualMaterials.set(bucket, visMat);
      const tileGeo = new THREE.CircleGeometry(tileR, 3);
      tileGeo.rotateX(-Math.PI / 2);
      const visMesh = new THREE.InstancedMesh(tileGeo, visMat, entries.length);
      visMesh.renderOrder = 2;
      visMesh.receiveShadow = true;
      entries.forEach(({ node, p }, i) => {
        this.tmpPos.set(p.x, 0.0, p.z);
        this.tmpQuat.setFromAxisAngle(this.yAxis, this.boardYawForNode(node));
        this.tmpScale.set(1, 1, 1);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        visMesh.setMatrixAt(i, this.tmpMat);
      });
      visMesh.instanceMatrix.needsUpdate = true;
      this.boardVisualMeshes.set(bucket, visMesh);
      this.root.add(visMesh);
    }

    // ── Highlight overlay mesh ──
    const hlGeo = new THREE.CircleGeometry(R, 3);
    hlGeo.rotateX(-Math.PI / 2);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0x55aaff, transparent: true, opacity: 0.55, depthTest: false
    });
    this.highlightMesh = new THREE.InstancedMesh(hlGeo, hlMat, n);
    this.highlightMesh.frustumCulled = false;
    this.highlightMesh.count = 0;
    this.highlightMesh.renderOrder = 15;
    this.root.add(this.highlightMesh);
    const hlData = new Float32Array(n);
    this.boardHighlightAttr = new THREE.InstancedBufferAttribute(hlData, 1);
    this.updateHighlightMesh();
    this.updateEngagementZoneOutline();
    this.updateEngagementZoneMaterial();

    // ── Board frame and decorative background ──
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const node of nodes) {
      const p = this.nodeWorld.get(node.id);
      if (!p) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    this.boardDecorMesh = this.createBoardDecor(minX, maxX, minZ, maxZ);
    this.root.add(this.boardDecorMesh);
    this.syncBoardPresentation();
    this.applyCameraTransform();
  }

  private syncProgressiveBoard(): void {
    if (this.nodeById.size === 0) return;
    if (!this.progressiveBoard) {
      this.progressiveBoard = new ProgressiveChessBoard();
      this.root.add(this.progressiveBoard);
    }

    const nodes = Array.from(this.nodeById.values()).map((node) => this.toProgressiveNode(node));
    this.progressiveBoard.setNodes(nodes);
    if (this.renderer) {
      const viewport = new THREE.Vector2();
      this.renderer.getSize(viewport);
      this.progressiveBoard.setViewportSize(viewport.x, viewport.y);
    }
    this.progressiveBoard.setEngagementZoneNodes(this.engagementZoneNodeIds, this.engagementZonePulseActive);
    this.progressiveBoard.setSelectedNodeIds(this.selectedNodeIds);
    this.progressiveBoard.setHighlightedNodes(this.highlightNodeIds);
    this.progressiveBoard.setPortals(this.portals);
    this.progressiveBoard.setTournamentMode(this.isTournamentMode);
    this.syncBoardPresentation();
  }

  private updateHighlightMesh(): void {
    if (!this.highlightMesh) return;

    let index = 0;
    for (const nodeId of this.highlightNodeIds) {
      const node = this.nodeById.get(nodeId);
      const position = this.nodeWorld.get(nodeId);
      if (!node || !position) continue;
      this.composeOverlayMatrix(position, node, 0.035, 0.8);
      this.highlightMesh.setMatrixAt(index, this.tmpMat);
      index += 1;
    }

    for (const nodeId of this.selectedNodeIds) {
      const node = this.nodeById.get(nodeId);
      const position = this.nodeWorld.get(nodeId);
      if (!node || !position) continue;
      this.composeOverlayMatrix(position, node, 0.04, 0.96);
      this.highlightMesh.setMatrixAt(index, this.tmpMat);
      index += 1;
    }

    this.highlightMesh.count = index;
    this.highlightMesh.instanceMatrix.needsUpdate = true;
  }

  private composeOverlayMatrix(position: THREE.Vector3, node: NodeData, y: number, scale: number): void {
    this.tmpPos.set(position.x, y, position.z);
    this.tmpQuat.setFromAxisAngle(this.yAxis, this.boardYawForNode(node));
    this.tmpScale.set(scale, scale, scale);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
  }

  private syncBoardPresentation(): void {
    for (const mesh of this.boardVisualMeshes.values()) {
      mesh.visible = !this.isTournamentMode;
    }
    if (this.boardDecorMesh) {
      this.boardDecorMesh.visible = !this.isTournamentMode;
    }
    if (this.engagementZoneOutline) {
      this.engagementZoneOutline.visible = true; // Always show the blue border
    }
    if (this.highlightMesh) {
      this.highlightMesh.visible = !this.isTournamentMode;
    }
    if (this.progressiveBoard) {
      this.progressiveBoard.visible = this.isTournamentMode;
    }
  }

  private toProgressiveNode(node: NodeData): ProgressiveBoardNode {
    const position = this.nodeWorld.get(node.id) ?? new THREE.Vector3(node.x, 0, node.z);
    return {
      id: node.id,
      x: position.x,
      z: position.z,
      isColored: node.isColored,
      colorKey: this.boardBucketForNode(node),
      pointsUp: this.boardYawForNode(node) < 0
    };
  }

  private findNearestNodeId(position: THREE.Vector3): string | null {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [nodeId, world] of this.nodeWorld.entries()) {
      const distance = world.distanceToSquared(position);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      bestId = nodeId;
    }

    return bestId;
  }

  private updateEngagementZoneOutline(): void {
    // Remove old outline
    if (this.engagementZoneOutline) {
      this.root.remove(this.engagementZoneOutline);
      this.engagementZoneOutline.geometry.dispose();
      (this.engagementZoneOutline.material as THREE.Material).dispose();
      this.engagementZoneOutline = null;
    }

    if (this.engagementZoneNodeIds.length === 0) return;

    const y = 0.16;
    const radius = (this.tileSide / Math.sqrt(3)) * 1.025;
    const hullInput: Array<{ x: number; z: number }> = [];

    // Collect all triangle vertices, then build a single convex hull for the outer contour.
    for (const nodeId of this.engagementZoneNodeIds) {
      const center = this.nodeWorld.get(nodeId);
      const node = this.nodeById.get(nodeId);
      if (!center || !node) continue;

      const vertices = this.buildTriangleVertices(center, this.tileYawForNode(node), radius, y);
      for (const vertex of vertices) {
        hullInput.push({ x: vertex.x, z: vertex.z });
      }
    }

    const hull = this.computeConvexHull(hullInput);
    const positions: number[] = [];

    for (let i = 0; i < hull.length; i += 1) {
      const start = hull[i];
      const end = hull[(i + 1) % hull.length];
      positions.push(start.x, y, start.z, end.x, y, end.z);
    }

    if (positions.length === 0) return;

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);

    const material = new LineMaterial({
      color: 0x278dff,
      transparent: true,
      opacity: 0.93,
      depthTest: false,
      depthWrite: false,
      linewidth: 6.5,
      worldUnits: false,
    });

    if (this.renderer) {
      const viewport = new THREE.Vector2();
      this.renderer.getSize(viewport);
      material.resolution.set(viewport.x, viewport.y);
    }

    this.engagementZoneOutline = new LineSegments2(geometry, material);
    this.engagementZoneOutline.computeLineDistances();
    this.engagementZoneOutline.renderOrder = 14;
    this.engagementZoneOutline.visible = true;
    this.root.add(this.engagementZoneOutline);
  }

  private computeConvexHull(points: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
    if (points.length <= 1) {
      return points;
    }

    const unique = new Map<string, { x: number; z: number }>();
    for (const point of points) {
      unique.set(`${point.x.toFixed(3)}:${point.z.toFixed(3)}`, point);
    }

    const sorted = Array.from(unique.values()).sort((left, right) => {
      if (left.x !== right.x) return left.x - right.x;
      return left.z - right.z;
    });

    const cross = (origin: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
      return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
    };

    const lower: Array<{ x: number; z: number }> = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }

    const upper: Array<{ x: number; z: number }> = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const point = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  private updateEngagementZoneMaterial(): void {
    if (!this.engagementZoneOutline || Array.isArray(this.engagementZoneOutline.material)) {
      return;
    }

    const material = this.engagementZoneOutline.material;
    if (!(material instanceof LineMaterial)) {
      return;
    }

    material.opacity = 0.85;
    material.color.setHex(0x278dff);
    material.needsUpdate = true;
  }

  private updateEngagementZoneResolution(width: number, height: number): void {
    if (!this.engagementZoneOutline || Array.isArray(this.engagementZoneOutline.material)) {
      return;
    }

    const material = this.engagementZoneOutline.material;
    if (!(material instanceof LineMaterial)) {
      return;
    }

    material.resolution.set(width, height);
  }

  private buildTriangleVertices(center: THREE.Vector3, yaw: number, radius: number, y: number): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const localX = Math.cos(angle) * radius;
      const localZ = -Math.sin(angle) * radius;
      vertices.push(
        new THREE.Vector3(
          center.x + localX * cosYaw + localZ * sinYaw,
          y,
          center.z - localX * sinYaw + localZ * cosYaw
        )
      );
    }

    return vertices;
  }

  private collectLargestBoundaryEdges(boundaryEdges: Map<string, BoundaryEdge>): BoundaryEdge[] {
    if (boundaryEdges.size === 0) {
      return [];
    }

    const edgesByVertex = new Map<string, BoundaryEdge[]>();
    for (const edge of boundaryEdges.values()) {
      const startEdges = edgesByVertex.get(edge.startKey) ?? [];
      startEdges.push(edge);
      edgesByVertex.set(edge.startKey, startEdges);

      const endEdges = edgesByVertex.get(edge.endKey) ?? [];
      endEdges.push(edge);
      edgesByVertex.set(edge.endKey, endEdges);
    }

    const visited = new Set<string>();
    let bestEdges: BoundaryEdge[] = [];
    let bestLength = -1;

    for (const edge of boundaryEdges.values()) {
      if (visited.has(edge.key)) {
        continue;
      }

      const stack = [edge];
      const component: BoundaryEdge[] = [];
      let componentLength = 0;

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current.key)) {
          continue;
        }

        visited.add(current.key);
        component.push(current);
        componentLength += current.length;

        for (const vertexKey of [current.startKey, current.endKey]) {
          for (const nextEdge of edgesByVertex.get(vertexKey) ?? []) {
            if (!visited.has(nextEdge.key)) {
              stack.push(nextEdge);
            }
          }
        }
      }

      if (componentLength > bestLength) {
        bestLength = componentLength;
        bestEdges = component;
      }
    }

    return bestEdges;
  }

  private buildVertexKey(vertex: THREE.Vector3): string {
    return `${vertex.x.toFixed(4)}:${vertex.z.toFixed(4)}`;
  }

  private buildEdgeKey(startKey: string, endKey: string): string {
    return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
  }

  private portalColorFromNumber(color?: number): PortalColor {
    if (color === 0xff5560 || color === 0xff6666) return "red";
    if (color === 0x29d67d || color === 0x66ff66) return "green";
    if (color === 0xffe052 || color === 0xffff66) return "yellow";
    return "neutral";
  }

  private updateTournamentBanner(): void {
    if (!this.container) return;

    if (!this.tournamentBanner) {
      const banner = document.createElement("div");
      banner.style.cssText = [
        "position:absolute",
        "top:18px",
        "right:18px",
        "display:none",
        "align-items:center",
        "gap:12px",
        "padding:10px 14px",
        "border-radius:14px",
        "background:rgba(9,16,28,0.86)",
        "border:1px solid rgba(129,188,255,0.45)",
        "box-shadow:0 14px 40px rgba(0,0,0,0.28)",
        "backdrop-filter:blur(10px)",
        "font-family:'Segoe UI',system-ui,sans-serif",
        "color:#eef6ff",
        "z-index:3",
        "pointer-events:none"
      ].join(";");
      this.container.appendChild(banner);
      this.tournamentBanner = banner;
    }

    if (!this.isTournamentMode || !this.visible) {
      this.tournamentBanner.style.display = "none";
      return;
    }

    this.tournamentBanner.style.display = "flex";
    const activePortal = this.portals.find((portal) => portal.id === "center-portal") ?? this.portals[0];
    const portalText = activePortal
      ? activePortal.active === false
        ? "Center portal on standby"
        : "Center portal active"
      : "No portal loaded";
    this.tournamentBanner.innerHTML = `
      <span style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#93afd2;">Tournament Arena</span>
      <span style="width:1px;height:22px;background:rgba(143,179,219,0.28);"></span>
      <span style="font-size:15px;font-weight:600;">${portalText}</span>
    `;
  }

  private syncBoardMetrics(positions: THREE.Vector3[]): void {
    if (positions.length < 6) {
      return;
    }
    const firstRing = [...positions]
      .map((pos) => Math.hypot(pos.x - this.boardCenter.x, pos.z - this.boardCenter.y))
      .sort((a, b) => a - b)
      .slice(0, 6);
    const averageRadius = firstRing.reduce((sum, value) => sum + value, 0) / firstRing.length;
    if (!Number.isFinite(averageRadius) || averageRadius <= 0) {
      return;
    }
    this.tileSide = averageRadius * Math.sqrt(3);
    this.tileHeight = (Math.sqrt(3) / 2) * this.tileSide;
  }

  private createPieceObject(type: PieceType, playerColor: Piece["color"]): THREE.Group {
    return this.createPieceObjectForField(type, playerColor, false);
  }

  private createPieceObjectForField(type: PieceType, playerColor: Piece["color"], isOnWhiteField: boolean): THREE.Group {
    const group = new THREE.Group();
    group.renderOrder = 25;

    const bodyColor = this.colorForPieceOwner(playerColor);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.48,
      metalness: 0.12
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd9b3,
      roughness: 0.65,
      metalness: 0.05
    });
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: isOnWhiteField ? 0xf0f0f0 : 0x1a1a1a,
      roughness: isOnWhiteField ? 0.55 : 0.78,
      metalness: 0.08
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe8a3,
      roughness: 0.25,
      metalness: 0.65
    });

    const addMesh = (
      geometryKey: string,
      geometryFactory: () => THREE.BufferGeometry,
      material: THREE.MeshStandardMaterial,
      position: [number, number, number],
      scale: [number, number, number] = [1, 1, 1],
      rotation: [number, number, number] = [0, 0, 0]
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.sharedGeometry(geometryKey, geometryFactory), material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    addMesh("piece-base", () => new THREE.CylinderGeometry(0.44, 0.49, 0.18, 8), baseMaterial, [0, 0.09, 0]);

    switch (type) {
      case "king":
        addMesh("king-torso", () => new THREE.CylinderGeometry(0.355, 0.285, 1.12, 8), bodyMaterial, [0, 0.76, 0]);
        addMesh("king-cloak", () => new THREE.CylinderGeometry(0.44, 0.32, 0.52, 8), bodyMaterial, [0, 1.22, 0]);
        addMesh("king-neck", () => new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8), skinMaterial, [0, 1.58, 0]);
        addMesh("king-head", () => new THREE.SphereGeometry(0.26, 16, 16), skinMaterial, [0, 1.78, 0]);
        addMesh("king-beard", () => new THREE.SphereGeometry(0.19, 12, 12), bodyMaterial, [0, 1.68, 0], [1, 0.45, 0.9]);
        addMesh("king-crown-base", () => new THREE.CylinderGeometry(0.27, 0.27, 0.16, 8), detailMaterial, [0, 2.02, 0]);
        addMesh("king-crown", () => new THREE.ConeGeometry(0.31, 0.52, 8), detailMaterial, [0, 2.28, 0]);
        addMesh("king-cross-v", () => new THREE.BoxGeometry(0.09, 0.55, 0.09), detailMaterial, [0, 2.58, 0]);
        addMesh("king-cross-h", () => new THREE.BoxGeometry(0.32, 0.09, 0.09), detailMaterial, [0, 2.54, 0]);
        group.scale.setScalar(0.76);
        break;
      case "vizier":
        addMesh("vizier-torso", () => new THREE.CylinderGeometry(0.33, 0.26, 1.02, 8), bodyMaterial, [0, 0.71, 0]);
        addMesh("vizier-robe", () => new THREE.ConeGeometry(0.4, 0.78, 8), bodyMaterial, [0, 1.12, 0], [1, 1, 1], [0.1, 0, 0]);
        addMesh("vizier-neck", () => new THREE.CylinderGeometry(0.13, 0.13, 0.16, 8), skinMaterial, [0, 1.55, 0]);
        addMesh("vizier-head", () => new THREE.SphereGeometry(0.24, 16, 16), skinMaterial, [0, 1.74, 0]);
        addMesh("vizier-turban", () => new THREE.ConeGeometry(0.29, 0.68, 8), bodyMaterial, [0, 1.95, 0], [1, 1, 1], [-0.2, 0, 0]);
        group.scale.setScalar(0.7);
        break;
      case "castle":
        addMesh("castle-tower", () => new THREE.CylinderGeometry(0.37, 0.37, 1.38, 8), bodyMaterial, [0, 0.84, 0]);
        for (let i = 0; i < 5; i += 1) {
          const angle = (i / 5) * Math.PI * 2;
          addMesh(
            "castle-battlement",
            () => new THREE.BoxGeometry(0.16, 0.32, 0.16),
            bodyMaterial,
            [Math.cos(angle) * 0.33, 1.62, Math.sin(angle) * 0.33]
          );
        }
        group.scale.setScalar(0.74);
        break;
      case "officer":
        addMesh("officer-torso", () => new THREE.CylinderGeometry(0.335, 0.275, 1.05, 8), bodyMaterial, [0, 0.72, 0]);
        addMesh("officer-armor", () => new THREE.CylinderGeometry(0.39, 0.3, 0.45, 8), bodyMaterial, [0, 1.15, 0]);
        addMesh("officer-neck", () => new THREE.CylinderGeometry(0.135, 0.135, 0.17, 8), skinMaterial, [0, 1.57, 0]);
        addMesh("officer-head", () => new THREE.SphereGeometry(0.245, 16, 16), skinMaterial, [0, 1.77, 0]);
        addMesh("officer-helmet", () => new THREE.ConeGeometry(0.26, 0.36, 8), bodyMaterial, [0, 1.95, 0]);
        addMesh(
          "officer-staff",
          () => new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8),
          detailMaterial,
          [0.22, 1.35, 0],
          [1, 1, 1],
          [0.7, 0, 0.9]
        );
        group.scale.setScalar(0.69);
        break;
      case "horse":
        addMesh("princess-torso", () => new THREE.CylinderGeometry(0.31, 0.24, 0.95, 8), bodyMaterial, [0, 0.7, 0]);
        addMesh("princess-gown", () => new THREE.ConeGeometry(0.385, 1.18, 8), bodyMaterial, [0, 1.05, 0], [1, 1, 1], [0.15, 0, 0]);
        addMesh("princess-neck", () => new THREE.CylinderGeometry(0.13, 0.13, 0.15, 8), skinMaterial, [0, 1.58, 0]);
        addMesh("princess-head", () => new THREE.SphereGeometry(0.23, 16, 16), skinMaterial, [0, 1.76, 0]);
        addMesh("princess-tiara", () => new THREE.ConeGeometry(0.24, 0.35, 8), detailMaterial, [0, 1.98, 0]);
        group.scale.setScalar(0.71);
        break;
      case "warrior":
      default:
        addMesh("warrior-torso", () => new THREE.CylinderGeometry(0.31, 0.255, 0.82, 8), bodyMaterial, [0, 0.59, 0]);
        addMesh("warrior-armor", () => new THREE.CylinderGeometry(0.37, 0.29, 0.48, 8), bodyMaterial, [0, 0.92, 0]);
        addMesh("warrior-neck", () => new THREE.CylinderGeometry(0.135, 0.135, 0.16, 8), skinMaterial, [0, 1.32, 0]);
        addMesh("warrior-head", () => new THREE.SphereGeometry(0.23, 16, 16), skinMaterial, [0, 1.51, 0]);
        addMesh("warrior-helmet", () => new THREE.ConeGeometry(0.255, 0.38, 8), bodyMaterial, [0, 1.72, 0]);
        addMesh("warrior-shield", () => new THREE.BoxGeometry(0.19, 0.62, 0.09), bodyMaterial, [0.43, 0.78, 0], [1, 1, 1], [0, 0.68, 0]);
        addMesh("warrior-sword", () => new THREE.BoxGeometry(0.055, 0.78, 0.055), detailMaterial, [-0.39, 0.88, 0], [1, 1, 1], [0, 0, 1.15]);
        group.scale.setScalar(0.68);
        break;
    }

    group.position.y = 0.14;
    group.userData = {
      type,
      ownerColor: bodyColor,
      isOnWhiteField,
      breathPhase: Math.random() * Math.PI * 2,
      baseScale: group.scale.x,
      baseWorldY: 0.64
    };
    return group;
  }

  private createPieceGlow(type: PieceType): THREE.Group {
    const glow = new THREE.Group();
    const mesh = new THREE.Mesh(this.glowGeometryForType(type), this.pieceGlowMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    glow.add(mesh);
    glow.renderOrder = 30;
    return glow;
  }

  private glowGeometryForType(type: PieceType): THREE.BufferGeometry {
    switch (type) {
      case "king":
        return this.sharedGeometry("glow-king", () => new THREE.CylinderGeometry(0.54, 0.68, 2.4, 8));
      case "vizier":
        return this.sharedGeometry("glow-vizier", () => new THREE.CylinderGeometry(0.5, 0.58, 2.12, 8));
      case "castle":
        return this.sharedGeometry("glow-castle", () => new THREE.CylinderGeometry(0.58, 0.64, 2.02, 8));
      case "officer":
        return this.sharedGeometry("glow-officer", () => new THREE.CylinderGeometry(0.48, 0.56, 1.98, 8));
      case "horse":
        return this.sharedGeometry("glow-horse", () => new THREE.CylinderGeometry(0.5, 0.56, 1.9, 8));
      case "warrior":
      default:
        return this.sharedGeometry("glow-warrior", () => new THREE.CylinderGeometry(0.46, 0.54, 1.7, 8));
    }
  }

  private sharedGeometry(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const existing = this.pieceSharedGeometries.get(key);
    if (existing) return existing;
    const geometry = factory();
    this.pieceSharedGeometries.set(key, geometry);
    return geometry;
  }

  private collectPieceMaterials(object: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const materials: THREE.MeshStandardMaterial[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) return;
      if (child.material instanceof THREE.MeshStandardMaterial) {
        materials.push(child.material);
      }
    });
    return materials;
  }

  private disposePieceObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    });
  }

  private colorForPieceOwner(color: Piece["color"]): number {
    switch (color) {
      case "red1":
        return 0xd94b57;
      case "red2":
        return 0x8a2633;
      case "green1":
        return 0x34b56a;
      case "green2":
        return 0x1b6a3f;
      case "yellow1":
        return 0xd6a93e;
      case "yellow2":
      default:
        return 0x8e6f1f;
    }
  }

  private snapNodeWorldPositions(nodes: NodeData[]): Map<string, THREE.Vector3> {
    const xBands = this.clusterCoordinateBands(nodes.map((node) => node.x), 0.08);
    const zBands = this.clusterCoordinateBands(nodes.map((node) => node.z), 0.08);
    const snapped = new Map<string, THREE.Vector3>();

    for (const node of nodes) {
      const x = this.snapCoordinateToBand(node.x, xBands);
      const z = this.snapCoordinateToBand(node.z, zBands);
      snapped.set(node.id, new THREE.Vector3(x, 0, z));
    }

    return snapped;
  }

  private clusterCoordinateBands(values: number[], epsilon: number): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const bands: Array<{ sum: number; count: number; mean: number }> = [];

    for (const value of sorted) {
      const band = bands[bands.length - 1];
      if (!band || Math.abs(value - band.mean) > epsilon) {
        bands.push({ sum: value, count: 1, mean: value });
        continue;
      }
      band.sum += value;
      band.count += 1;
      band.mean = band.sum / band.count;
    }

    return bands.map((band) => band.mean);
  }

  private snapCoordinateToBand(value: number, bands: number[]): number {
    let best = value;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const band of bands) {
      const distance = Math.abs(value - band);
      if (distance >= bestDistance) continue;
      best = band;
      bestDistance = distance;
    }

    return best;
  }

  private boardYawForNode(node: NodeData): number {
    // The reference board image is oriented with the red sector at the top.
    // With the adjusted top-view camera yaw, screen-up aligns to world -Z.
    // CircleGeometry starts with its apex on +X, so rotate colored tiles to -Z
    // and neutral tiles to +Z to reproduce the interlocking lattice.
    return node.isColored === 1 ? -Math.PI * 0.5 : Math.PI * 0.5;
  }

  private tileYawForNode(node: NodeData): number {
    return this.boardYawForNode(node);
  }

  private pointsUpFromNode(node: NodeData): boolean {
    if (typeof node.row === "number" && typeof node.col === "number") {
      return ((node.row + node.col) & 1) === 0;
    }
    return node.z <= this.boardCenter.y;
  }
  private boardBucketForNode(node: NodeData): "neutral" | "red" | "green" | "yellow" {
    if (node.isColored === 0) {
      return "neutral";
    }
    switch (node.eColor) {
      case 0:
      case 3:
        return "red";
      case 1:
      case 4:
        return "green";
      case 2:
      case 5:
      default:
        return "yellow";
    }
  }
  private boardBucketColor(bucket: "neutral" | "red" | "green" | "yellow"): number {
    switch (bucket) {
      case "red":
        return 0xff1d25;
      case "green":
        return 0x1fb14a;
      case "yellow":
        return 0xe3d40f;
      case "neutral":
      default:
        return 0xffffff;
    }
  }
  private createBoardDecor(minX: number, maxX: number, minZ: number, maxZ: number): THREE.Mesh {
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const radius = Math.max(
      (maxX - minX) * 0.5 + this.tileSide * 0.52,
      (maxZ - minZ) * 0.5 + this.tileHeight * 0.54
    );
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (i === 0) {
        shape.moveTo(x, z);
      } else {
        shape.lineTo(x, z);
      }
    }
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x242833,
      roughness: 0.9,
      metalness: 0.0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.8,
      reflectivity: 0.02,
      transparent: true,
      opacity: 0.08
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotateX(-Math.PI / 2);
    mesh.position.set(0, -0.03, 0);
    mesh.receiveShadow = true;
    mesh.renderOrder = -10;
    return mesh;
  }

  // === FIXED & IMPROVED ENGAGEMENT ZONE DEBUG ===
  private debugEngagementRadius: number = 5.5;   // start near the sweet spot for your board
  private debugAutoStepInterval: NodeJS.Timeout | null = null;
  private debugCurrentNodeCount: number = 0;

  private boundHandleDebugKey = this.handleDebugKey.bind(this);

  public enableEngagementZoneDebug(): void {
    console.log("%c[ThreeBoard Debug] ENGAGEMENT ZONE DEBUGGER ENABLED", "color:#278dff; font-weight:bold; font-size:14px");
    console.log("Controls:");
    console.log("  E → toggle auto-stepper");
    console.log("  + / - → adjust radius manually");
    console.log("  R → reset to 5.5");
    console.log("  C → print current node count");
    window.addEventListener("keydown", this.boundHandleDebugKey);
    this.debugRecomputeEngagementZone();
  }

  private debugRecomputeEngagementZone(): void {
    if (this.nodeWorld.size === 0) return;

    const allIds = Array.from(this.nodeWorld.keys());
    const centerNodeId = this.findNearestNodeId(new THREE.Vector3(this.boardCenter.x, 0, this.boardCenter.y));
    if (!centerNodeId) return;
    const center = this.nodeWorld.get(centerNodeId);
    if (!center) return;
    let zoneNodes: string[] = [];
    // Try a range of thresholds to find exactly 96 nodes
    let best = { count: 0, nodes: [] as string[], threshold: 0 };
    for (let threshold = 2.0; threshold <= 6.0; threshold += 0.01) {
      const nodes: string[] = [];
      for (const id of allIds) {
        const pos = this.nodeWorld.get(id)!;
        const dx = pos.x - center.x;
        const dz = pos.z - center.z;
        const hexDist = Math.max(
          Math.abs(dx),
          Math.abs(dz),
          Math.abs(dx + dz)
        ) / (this.tileSide * 1.085);
        if (hexDist <= threshold) nodes.push(id);
      }
      if (nodes.length === 96) {
        zoneNodes = nodes;
        best = { count: 96, nodes, threshold };
        break;
      }
      if (nodes.length > best.count && nodes.length < 96) {
        best = { count: nodes.length, nodes, threshold };
      }
    }
    if (zoneNodes.length !== 96 && best.count > 0) {
      zoneNodes = best.nodes;
      console.warn(`[EngagementZone] Could not find exactly 96 nodes, using closest (${best.count}) at threshold=${best.threshold}`);
    }
    this.setEngagementZoneNodes(zoneNodes, true);

    console.log(`[Debug] Radius=${this.debugEngagementRadius.toFixed(2)} | Nodes=${zoneNodes.length} | TileSide≈${this.tileSide.toFixed(2)}`);
  }

  private handleDebugKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();

    if (k === "e") {
      if (this.debugAutoStepInterval) {
        clearInterval(this.debugAutoStepInterval);
        this.debugAutoStepInterval = null;
        console.log("%c[Debug] Auto-stepper STOPPED", "color:#ffaa00");
      } else {
        this.debugAutoStepInterval = setInterval(() => {
          this.debugEngagementRadius += 0.25;
          if (this.debugEngagementRadius > 9.5) this.debugEngagementRadius = 3.0;
          this.debugRecomputeEngagementZone();
        }, 650);
        console.log("%c[Debug] Auto-stepper STARTED", "color:#00ff88");
      }
    } 
    else if (k === "+" || k === "=") {
      this.debugEngagementRadius += 0.15;
      this.debugRecomputeEngagementZone();
    } 
    else if (k === "-") {
      this.debugEngagementRadius = Math.max(2.0, this.debugEngagementRadius - 0.15);
      this.debugRecomputeEngagementZone();
    } 
    else if (k === "r") {
      this.debugEngagementRadius = 5.5;
      this.debugRecomputeEngagementZone();
    } 
    else if (k === "c") {
      console.log(`Current zone has ${this.debugCurrentNodeCount} nodes (target ~72–96)`);
    }
  }
}
