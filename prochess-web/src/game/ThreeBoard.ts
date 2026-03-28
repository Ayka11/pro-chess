import * as THREE from "three";
import type { NodeData } from "./parityLoader";
import type { Piece, PieceType } from "./types";

type PieceMove = {
  pieceId: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsed: number;
  duration: number;
};

export class ThreeBoard {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera | null = null;
  private lightGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement | null = null;
  private root = new THREE.Group();
  private boardMesh: THREE.InstancedMesh | null = null;
  private boardVisualMeshes = new Map<string, THREE.InstancedMesh>();
  private boardBorderMesh: THREE.LineSegments | null = null;
  private boardFrameGroup: THREE.Group | null = null;
  private boardDecorMesh: THREE.Mesh | null = null;
  private highlightMesh: THREE.InstancedMesh | null = null;
  private timeUniform: { value: number } = { value: 0 };
  private boardHighlightAttr: THREE.InstancedBufferAttribute | null = null;
  private nodeById = new Map<string, NodeData>();
  private nodeIndexById = new Map<string, number>();
  private nodeIdByIndex = new Map<number, string>();
  private nodeWorld = new Map<string, THREE.Vector3>();
  private pieceMeshes = new Map<PieceType, THREE.InstancedMesh>();
  private pieceGlowMeshes = new Map<PieceType, THREE.InstancedMesh>();
  private pieceCapacity = new Map<PieceType, number>();
  private pieceSelectedAttr = new Map<PieceType, THREE.InstancedBufferAttribute>();
  private pieceMap = new Map<string, { type: PieceType; instanceIndex: number; nodeId: string }>();
  private pieceBuffer = new Map<PieceType, Piece[]>();
  private moves: PieceMove[] = [];
  private time = 0;
  private pointer = new THREE.Vector2();
  private tileMaterial: THREE.MeshBasicMaterial;
  private tileBorderMaterial: THREE.MeshBasicMaterial;
  private pieceMaterialByType = new Map<PieceType, THREE.MeshStandardMaterial>();
  private pieceGlowMaterialByType = new Map<PieceType, THREE.ShaderMaterial>();
  private pan = new THREE.Vector2(0, 0);
  private distance = 84;
  private yaw = Math.PI * 0.25;
  private pitch = 1.0;
  private visible = false;
  private boardCenter = new THREE.Vector2(0, 0);
  private tileSide = 5;
  private tileHeight = (Math.sqrt(3) / 2) * 5;
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3(1, 1, 1);
  private readonly glowScale = new THREE.Vector3(1.03, 1.03, 1.03);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly tmpSeenPieces = new Set<string>();
  private readonly highlightNodeIds: string[] = [];
  private readonly boardVisualMaterials = new Map<"neutral" | "red" | "green" | "yellow", THREE.MeshBasicMaterial>();
  private readonly boardBucketPalette: Record<"neutral" | "red" | "green" | "yellow", number> = {
    neutral: 0xf7f4ee,
    red: 0xff1d25,
    green: 0x1fb14a,
    yellow: 0xe3d40f
  };

  constructor() {
    this.scene.background = null;
    this.tileMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });

    this.tileBorderMaterial = new THREE.MeshBasicMaterial({
      color: 0xb6b6b6,
      transparent: true,
      opacity: 0.9
    });
  }

  public init(container: HTMLElement, size: { w: number; h: number }): void {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(size.w, size.h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.pointerEvents = "none";
    this.renderer.domElement.style.display = "none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    const aspect = size.w / size.h;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 520);
    this.camera.position.set(0, 64, 64);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.scene.add(this.root);
    this.lightGroup.clear();
    const ambient = new THREE.AmbientLight(0xffffff, 1.05);
    const key = new THREE.DirectionalLight(0xfff3df, 2.4);
    key.position.set(70, 150, 55);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 260;
    key.shadow.camera.left = -95;
    key.shadow.camera.right = 95;
    key.shadow.camera.top = 95;
    key.shadow.camera.bottom = -95;

    const fill = new THREE.DirectionalLight(0xbddcff, 0.8);
    fill.position.set(-80, 60, -55);
    const rim = new THREE.DirectionalLight(0xffffff, 0.42);
    rim.position.set(0, 80, -120);
    this.lightGroup.add(ambient, key, fill, rim);
    this.scene.add(this.lightGroup);
  }

  public setBoardTopology(nodes: NodeData[]): void {
    this.nodeById.clear();
    this.nodeIndexById.clear();
    this.nodeIdByIndex.clear();
    this.nodeWorld.clear();
    this.syncBoardMetrics(nodes);

    nodes.forEach((node, idx) => {
      this.nodeById.set(node.id, node);
      this.nodeIndexById.set(node.id, idx);
      this.nodeIdByIndex.set(idx, node.id);
      this.nodeWorld.set(node.id, new THREE.Vector3(node.x, 0, node.z));
    });

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.z < minZ) minZ = node.z;
      if (node.z > maxZ) maxZ = node.z;
    }

    if (nodes.length > 0) {
      this.boardCenter.set((minX + maxX) * 0.5, (minZ + maxZ) * 0.5);
      this.applyCameraTransform();
    }

    if (this.boardMesh) {
      this.root.remove(this.boardMesh);
      this.boardMesh.geometry.dispose();
      this.boardMesh = null;
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
      this.root.remove(this.boardBorderMesh);
      this.boardBorderMesh.geometry.dispose();
      const borderMaterial = this.boardBorderMesh.material;
      if (Array.isArray(borderMaterial)) {
        borderMaterial.forEach((material) => material.dispose());
      } else {
        borderMaterial.dispose();
      }
      this.boardBorderMesh = null;
    }
    if (this.boardFrameGroup) {
      this.root.remove(this.boardFrameGroup);
      this.boardFrameGroup = null;
    }
    if (this.boardDecorMesh) {
      this.root.remove(this.boardDecorMesh);
      this.boardDecorMesh = null;
    }
    if (this.highlightMesh) {
      this.root.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      const m = this.highlightMesh.material;
      if (!Array.isArray(m)) {
        m.dispose();
      }
      this.highlightMesh = null;
    }
    // Build the board directly on the X/Z plane so the battle surface matches the original flat board.
    const createTriangleGeometry = (size = this.tileSide) => {
      const h = Math.sqrt(3) / 2 * size;
      const vertices = [
        0, 0, (2 * h) / 3,
        -size / 2, 0, -h / 3,
        size / 2, 0, -h / 3
      ];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex([0, 1, 2]);
      geometry.computeVertexNormals();
      return geometry;
    };

    const triangleOutline = [
      new THREE.Vector3(0, 0, (2 * this.tileHeight) / 3),
      new THREE.Vector3(-this.tileSide / 2, 0, -this.tileHeight / 3),
      new THREE.Vector3(this.tileSide / 2, 0, -this.tileHeight / 3)
    ];

    const mesh = new THREE.InstancedMesh(createTriangleGeometry(), this.tileMaterial, nodes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length * 3), 3);
    mesh.count = nodes.length;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = -100;
    mesh.material.depthWrite = false;
    mesh.material.depthTest = false;
    mesh.material.colorWrite = false;

    const borderPoints: number[] = [];
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x6a6a6a,
      transparent: true,
      opacity: 0.95
    });

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const p = this.nodeWorld.get(node.id);
      if (!p) continue;

      // Determine orientation
      // Position and rotate
      this.tmpPos.set(p.x, 0.02, p.z);
      this.tmpQuat.setFromAxisAngle(this.yAxis, this.boardYawForNode(node));
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      mesh.setMatrixAt(i, this.tmpMat);

      const transformed = triangleOutline.map((vertex) =>
        vertex
          .clone()
          .applyQuaternion(this.tmpQuat)
          .add(new THREE.Vector3(p.x, 0.04, p.z))
      );
      for (let edge = 0; edge < 3; edge += 1) {
        const a = transformed[edge];
        const b = transformed[(edge + 1) % 3];
        borderPoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    this.boardHighlightAttr = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1);
    for (let i = 0; i < nodes.length; i += 1) {
      this.boardHighlightAttr.setX(i, 0);
    }
    mesh.geometry.setAttribute("instanceHighlight", this.boardHighlightAttr);
    mesh.instanceMatrix.needsUpdate = true;
    this.boardMesh = mesh;
    this.root.add(mesh);

    const bucketNodes = new Map<"neutral" | "red" | "green" | "yellow", NodeData[]>();
    for (const node of nodes) {
      const bucket = this.boardBucketForNode(node);
      if (!bucketNodes.has(bucket)) {
        bucketNodes.set(bucket, []);
      }
      bucketNodes.get(bucket)?.push(node);
    }
    for (const material of this.boardVisualMaterials.values()) {
      material.dispose();
    }
    this.boardVisualMaterials.clear();
    for (const [bucket, list] of bucketNodes.entries() as IterableIterator<
      ["neutral" | "red" | "green" | "yellow", NodeData[]]
    >) {
      const material = new THREE.MeshBasicMaterial({
        color: this.boardBucketPalette[bucket],
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      this.boardVisualMaterials.set(bucket, material);
      const bucketMesh = new THREE.InstancedMesh(
        createTriangleGeometry(),
        material,
        Math.max(list.length, 1)
      );
      bucketMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bucketMesh.count = list.length;
      for (let j = 0; j < list.length; j += 1) {
        const node = list[j];
        const p = this.nodeWorld.get(node.id);
        if (!p) continue;
        this.tmpPos.set(p.x, 0.01, p.z);
        this.tmpQuat.setFromAxisAngle(this.yAxis, this.boardYawForNode(node));
        this.tmpScale.set(1, 1, 1);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        bucketMesh.setMatrixAt(j, this.tmpMat);
      }
      bucketMesh.instanceMatrix.needsUpdate = true;
      bucketMesh.renderOrder = bucket === "neutral" ? 2 : 3;
      bucketMesh.castShadow = false;
      bucketMesh.receiveShadow = true;
      this.boardVisualMeshes.set(bucket, bucketMesh);
      this.root.add(bucketMesh);
    }

    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute("position", new THREE.Float32BufferAttribute(borderPoints, 3));
    this.boardBorderMesh = new THREE.LineSegments(borderGeo, lineMat);
    this.boardBorderMesh.renderOrder = 8;
    this.root.add(this.boardBorderMesh);
    this.boardFrameGroup = null;

    const highlightGeo = new THREE.CylinderGeometry(this.tileSide * 0.58, this.tileSide * 0.58, 0.08, 3);
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0x4f9dff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    const highlight = new THREE.InstancedMesh(highlightGeo, highlightMat, nodes.length);
    highlight.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    highlight.count = 0;
    highlight.renderOrder = 20;
    this.highlightMesh = highlight;
    this.root.add(highlight);
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

    const allTypes: PieceType[] = ["king", "vizier", "castle", "officer", "horse", "warrior"];
    for (const type of allTypes) {
      const arr = this.pieceBuffer.get(type) ?? [];
      let mesh = this.pieceMeshes.get(type);
      let glowMesh = this.pieceGlowMeshes.get(type);
      let capacity = this.pieceCapacity.get(type) ?? 0;
      if (!mesh) {
        capacity = Math.max(arr.length, 4);
        const geometry = this.geometryForType(type);
        const material = this.materialForType(type);
        mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        this.pieceMeshes.set(type, mesh);

        const glowMaterial = this.glowMaterialForType(type);
        glowMesh = new THREE.InstancedMesh(geometry, glowMaterial, capacity);
        glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        glowMesh.renderOrder = 30;
        this.root.add(glowMesh);
        this.pieceGlowMeshes.set(type, glowMesh);

        const selected = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
        geometry.setAttribute("instanceSelected", selected);
        this.pieceSelectedAttr.set(type, selected);
        this.pieceCapacity.set(type, capacity);
      } else if (arr.length > capacity) {
        const nextCapacity = Math.max(arr.length, Math.ceil(capacity * 1.6), 4);
        if (mesh) {
          this.root.remove(mesh);
          const oldGlow = this.pieceGlowMeshes.get(type);
          if (oldGlow) {
            this.root.remove(oldGlow);
          }
          mesh.geometry.dispose();
        }
        const geometry = this.geometryForType(type);
        const material = this.materialForType(type);
        mesh = new THREE.InstancedMesh(geometry, material, nextCapacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        this.pieceMeshes.set(type, mesh);

        const glowMaterial = this.glowMaterialForType(type);
        glowMesh = new THREE.InstancedMesh(geometry, glowMaterial, nextCapacity);
        glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        glowMesh.renderOrder = 30;
        this.root.add(glowMesh);
        this.pieceGlowMeshes.set(type, glowMesh);

        const selected = new THREE.InstancedBufferAttribute(new Float32Array(nextCapacity), 1);
        geometry.setAttribute("instanceSelected", selected);
        this.pieceSelectedAttr.set(type, selected);
        this.pieceCapacity.set(type, nextCapacity);
      }
      if (!mesh) continue;
      if (!glowMesh) continue;
      mesh.count = arr.length;
      glowMesh.count = arr.length;

      for (let i = 0; i < arr.length; i += 1) {
        const piece = arr[i];
        const p = this.nodeWorld.get(piece.nodeId);
        if (!p) continue;
        this.tmpPos.set(p.x, 0.6, p.z);
        this.tmpQuat.identity();
        this.tmpScale.set(1, 1, 1);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        mesh.setMatrixAt(i, this.tmpMat);

        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.glowScale);
        glowMesh.setMatrixAt(i, this.tmpMat);
        this.pieceMap.set(piece.id, { type, instanceIndex: i, nodeId: piece.nodeId });
      }
      mesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
    }
    for (const pieceId of Array.from(this.pieceMap.keys())) {
      if (!this.tmpSeenPieces.has(pieceId)) {
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
      from: fromNode.clone().setY(0.6),
      to: toNode.clone().setY(0.6),
      elapsed: 0,
      duration: Math.max(durationMs, 1)
    });
  }

  public update(deltaMs: number): void {
    if (!this.visible) {
      return;
    }
    this.time += deltaMs * 0.001;
    this.timeUniform.value = this.time;
    for (let i = this.moves.length - 1; i >= 0; i -= 1) {
      const move = this.moves[i];
      const map = this.pieceMap.get(move.pieceId);
      if (!map) {
        this.moves.splice(i, 1);
        continue;
      }
      const mesh = this.pieceMeshes.get(map.type);
      const glowMesh = this.pieceGlowMeshes.get(map.type);
      if (!mesh || !glowMesh) {
        this.moves.splice(i, 1);
        continue;
      }
      move.elapsed += deltaMs;
      const t = Math.min(move.elapsed / move.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.tmpPos.copy(move.from).lerp(move.to, eased);
      this.tmpPos.y += Math.sin(eased * Math.PI) * 0.25;
      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      mesh.setMatrixAt(map.instanceIndex, this.tmpMat);
      mesh.instanceMatrix.needsUpdate = true;

      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.glowScale);
      glowMesh.setMatrixAt(map.instanceIndex, this.tmpMat);
      glowMesh.instanceMatrix.needsUpdate = true;
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
  }

  public setHighlightedNodes(selectedNodeId: string | null, legalNodeIds: string[]): void {
    if (!this.boardHighlightAttr) return;
    this.boardHighlightAttr.array.fill(0);
    this.highlightNodeIds.length = 0;
    if (selectedNodeId) {
      const idx = this.nodeIndexById.get(selectedNodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 1);
      }
      this.highlightNodeIds.push(selectedNodeId);
    }
    for (const nodeId of legalNodeIds) {
      const idx = this.nodeIndexById.get(nodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 0.7);
      }
      this.highlightNodeIds.push(nodeId);
    }
    this.boardHighlightAttr.needsUpdate = true;

    if (!this.highlightMesh) return;
    let outIdx = 0;
    for (const nodeId of this.highlightNodeIds) {
      const p = this.nodeWorld.get(nodeId);
      const node = this.nodeById.get(nodeId);
      if (!p || !node) continue;
      this.tmpPos.set(p.x, 0.08, p.z);
      this.tmpQuat.setFromAxisAngle(this.yAxis, this.tileYawForNode(node));
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.highlightMesh.setMatrixAt(outIdx, this.tmpMat);
      outIdx += 1;
    }
    this.highlightMesh.count = outIdx;
    this.highlightMesh.instanceMatrix.needsUpdate = true;
  }

  public setSelectedPieceIds(pieceIds: string[]): void {
    for (const attr of this.pieceSelectedAttr.values()) {
      attr.array.fill(0);
      attr.needsUpdate = true;
    }
    for (const pieceId of pieceIds) {
      const mapping = this.pieceMap.get(pieceId);
      if (!mapping) continue;
      const attr = this.pieceSelectedAttr.get(mapping.type);
      if (!attr) continue;
      attr.setX(mapping.instanceIndex, 1);
      attr.needsUpdate = true;
    }
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
    this.yaw = Math.PI * 0.25;
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
      this.yaw = 0;
    } else if (view === "side") {
      this.pitch = 0.35;
      this.distance = 96;
    } else {
      this.pitch = 1.12;
      this.distance = 128;
      this.yaw = Math.PI * 0.25;
    }
    this.applyCameraTransform();
  }

  public resize(size: { w: number; h: number }): void {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(size.w, size.h, false);
    this.camera.aspect = size.w / size.h;
    this.applyCameraTransform();
  }

  public dispose(): void {
    for (const mesh of this.pieceMeshes.values()) {
      mesh.geometry.dispose();
      this.root.remove(mesh);
    }
    this.pieceMeshes.clear();
    for (const glowMesh of this.pieceGlowMeshes.values()) {
      this.root.remove(glowMesh);
    }
    this.pieceGlowMeshes.clear();
    this.pieceCapacity.clear();
    this.pieceSelectedAttr.clear();
    if (this.boardMesh) {
      this.boardMesh.geometry.dispose();
      this.root.remove(this.boardMesh);
      this.boardMesh = null;
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
    this.boardHighlightAttr = null;
    for (const mat of this.pieceMaterialByType.values()) {
      mat.dispose();
    }
    this.pieceMaterialByType.clear();
    for (const mat of this.pieceGlowMaterialByType.values()) {
      mat.dispose();
    }
    this.pieceGlowMaterialByType.clear();
    this.tileMaterial.dispose();
    this.tileBorderMaterial.dispose();
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

  private syncBoardMetrics(nodes: NodeData[]): void {
    if (nodes.length < 6) {
      return;
    }
    const firstRing = [...nodes]
      .map((node) => Math.hypot(node.x, node.z))
      .sort((a, b) => a - b)
      .slice(0, 6);
    const averageRadius = firstRing.reduce((sum, value) => sum + value, 0) / firstRing.length;
    if (!Number.isFinite(averageRadius) || averageRadius <= 0) {
      return;
    }
    this.tileSide = averageRadius * Math.sqrt(3);
    this.tileHeight = (Math.sqrt(3) / 2) * this.tileSide;
  }

  private geometryForType(type: PieceType): THREE.BufferGeometry {
    switch (type) {
      case "king":
        return new THREE.ConeGeometry(0.62, 1.25, 8);
      case "vizier":
        return new THREE.CylinderGeometry(0.5, 0.6, 1.1, 8);
      case "castle":
        return new THREE.BoxGeometry(1.05, 1.0, 1.05);
      case "officer":
        return new THREE.OctahedronGeometry(0.66, 0);
      case "horse":
        return new THREE.DodecahedronGeometry(0.68, 0);
      case "warrior":
      default:
        return new THREE.SphereGeometry(0.39, 10, 10);
    }
  }

  private materialForType(type: PieceType): THREE.MeshStandardMaterial {
    const cached = this.pieceMaterialByType.get(type);
    if (cached) return cached;
    const color: Record<PieceType, number> = {
      king: 0xf0c97f,
      vizier: 0x8bb9ff,
      castle: 0xff8e8e,
      officer: 0x88f0c8,
      horse: 0xdca3ff,
      warrior: 0x7f8ea0
    };
    const material = new THREE.MeshStandardMaterial({
      color: color[type],
      roughness: 0.55,
      metalness: 0.12
    });
    this.pieceMaterialByType.set(type, material);
    return material;
  }

  private glowMaterialForType(type: PieceType): THREE.ShaderMaterial {
    const cached = this.pieceGlowMaterialByType.get(type);
    if (cached) return cached;
    const glowColor = new THREE.Color(0xffd76b);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uGlowColor: { value: glowColor },
        uMaxAlpha: { value: 0.35 },
        uTime: this.timeUniform
      },
      vertexShader: `
attribute float instanceSelected;
varying float vSelected;
varying vec3 vNormalW;
varying vec3 vViewDirW;
void main() {
  vSelected = instanceSelected;
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vNormalW = n;
  vViewDirW = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,
      fragmentShader: `
uniform vec3 uGlowColor;
uniform float uMaxAlpha;
uniform float uTime;
varying float vSelected;
varying vec3 vNormalW;
varying vec3 vViewDirW;
void main() {
  if (vSelected < 0.5) discard;
  float ndotv = max(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0);
  float rim = 1.0 - ndotv;
  float soft = smoothstep(0.18, 0.85, rim);
  float pulse = 0.85 + 0.15 * sin(uTime * 6.0);
  float alpha = soft * uMaxAlpha * pulse;
  gl_FragColor = vec4(uGlowColor, alpha);
}
`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    this.pieceGlowMaterialByType.set(type, material);
    return material;
  }

  private boardYawForNode(node: NodeData): number {
    // The visual board uses a single global triangular lattice:
    // colored cells face one way and neutral cells face the other,
    // which matches the flat reference board art more closely than
    // Unity's per-sector object rotations.
    return node.isColored === 1 ? 0 : Math.PI;
  }

  private tileYawForNode(node: NodeData): number {
    return this.boardYawForNode(node) - Math.PI * 0.5;
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
  private createBoardFrame(minX: number, maxX: number, minZ: number, maxZ: number): THREE.Group {
    const group = new THREE.Group();
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const radius = Math.max(
      (maxX - minX) * 0.5 + this.tileSide * 0.55,
      (maxZ - minZ) * 0.5 + this.tileHeight * 0.56
    );

    const buildRing = (r: number): THREE.BufferGeometry => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        points.push(new THREE.Vector3(cx + Math.cos(angle) * r, 0.06, cz + Math.sin(angle) * r));
      }
      return new THREE.BufferGeometry().setFromPoints(points);
    };

    const outer = new THREE.Line(
      buildRing(radius),
      new THREE.LineBasicMaterial({ color: 0x7d8690, transparent: true, opacity: 0.92 })
    );
    const inner = new THREE.Line(
      buildRing(radius - 0.12),
      new THREE.LineBasicMaterial({ color: 0xcfd6de, transparent: true, opacity: 0.42 })
    );
    group.add(outer, inner);
    return group;
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
}
