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
  private camera: THREE.OrthographicCamera | null = null;
  private lightGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private container: HTMLElement | null = null;
  private root = new THREE.Group();
  private boardMesh: THREE.InstancedMesh | null = null;
  private boardTimeUniform: { value: number } = { value: 0 };
  private boardHighlightAttr: THREE.InstancedBufferAttribute | null = null;
  private boardPulseAttr: THREE.InstancedBufferAttribute | null = null;
  private nodeById = new Map<string, NodeData>();
  private nodeIndexById = new Map<string, number>();
  private nodeIdByIndex = new Map<number, string>();
  private nodeWorld = new Map<string, THREE.Vector3>();
  private pieceMeshes = new Map<PieceType, THREE.InstancedMesh>();
  private pieceCapacity = new Map<PieceType, number>();
  private pieceMap = new Map<string, { type: PieceType; instanceIndex: number; nodeId: string }>();
  private pieceBuffer = new Map<PieceType, Piece[]>();
  private moves: PieceMove[] = [];
  private time = 0;
  private pointer = new THREE.Vector2();
  private tileMaterial: THREE.MeshStandardMaterial;
  private pieceMaterialByType = new Map<PieceType, THREE.MeshStandardMaterial>();
  private pan = new THREE.Vector2(0, 0);
  private zoom = 1;
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3(1, 1, 1);
  private readonly tmpSeenPieces = new Set<string>();

  constructor() {
    this.scene.background = new THREE.Color(0x070b12);
    this.tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x25364a,
      roughness: 0.75,
      metalness: 0.08
    });
    this.installBoardShaderHook(this.tileMaterial);
  }

  public init(container: HTMLElement, size: { w: number; h: number }): void {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(size.w, size.h);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.pointerEvents = "none";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);

    const aspect = size.w / size.h;
    const frustum = 52;
    this.camera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.1,
      200
    );
    this.camera.position.set(0, 55, 45);
    this.camera.lookAt(0, 0, 0);
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();

    this.scene.add(this.root);
    this.lightGroup.clear();
    const hemi = new THREE.HemisphereLight(0xcde7ff, 0x1b2430, 0.95);
    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(30, 60, 10);
    this.lightGroup.add(hemi, dir);
    this.scene.add(this.lightGroup);
  }

  public setBoardTopology(nodes: NodeData[]): void {
    this.nodeById.clear();
    this.nodeIndexById.clear();
    this.nodeIdByIndex.clear();
    this.nodeWorld.clear();

    nodes.forEach((node, idx) => {
      this.nodeById.set(node.id, node);
      this.nodeIndexById.set(node.id, idx);
      this.nodeIdByIndex.set(idx, node.id);
      this.nodeWorld.set(node.id, new THREE.Vector3(node.x, 0, node.z));
    });

    if (this.boardMesh) {
      this.root.remove(this.boardMesh);
      this.boardMesh.geometry.dispose();
      this.boardMesh = null;
    }

    const tileGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.22, 12);
    const mesh = new THREE.InstancedMesh(tileGeo, this.tileMaterial, nodes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = nodes.length;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    for (let i = 0; i < nodes.length; i += 1) {
      const p = this.nodeWorld.get(nodes[i].id);
      if (!p) continue;
      this.tmpPos.set(p.x, 0, p.z);
      this.tmpQuat.identity();
      this.tmpScale.set(1, 1, 1);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      mesh.setMatrixAt(i, this.tmpMat);
    }
    this.boardHighlightAttr = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1);
    this.boardPulseAttr = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1);
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      this.boardHighlightAttr.setX(i, 0);
      this.boardPulseAttr.setX(i, node.eBoardCaseType > 0 ? 1 : 0);
    }
    tileGeo.setAttribute("instanceHighlight", this.boardHighlightAttr);
    tileGeo.setAttribute("instancePulse", this.boardPulseAttr);
    mesh.instanceMatrix.needsUpdate = true;
    this.boardMesh = mesh;
    this.root.add(mesh);
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
      let capacity = this.pieceCapacity.get(type) ?? 0;
      if (!mesh) {
        capacity = Math.max(arr.length, 4);
        const geometry = this.geometryForType(type);
        const material = this.materialForType(type);
        mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        this.pieceMeshes.set(type, mesh);
        this.pieceCapacity.set(type, capacity);
      } else if (arr.length > capacity) {
        const nextCapacity = Math.max(arr.length, Math.ceil(capacity * 1.6), 4);
        if (mesh) {
          this.root.remove(mesh);
          mesh.geometry.dispose();
        }
        const geometry = this.geometryForType(type);
        const material = this.materialForType(type);
        mesh = new THREE.InstancedMesh(geometry, material, nextCapacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        this.pieceMeshes.set(type, mesh);
        this.pieceCapacity.set(type, nextCapacity);
      }
      if (!mesh) continue;
      mesh.count = arr.length;

      for (let i = 0; i < arr.length; i += 1) {
        const piece = arr[i];
        const p = this.nodeWorld.get(piece.nodeId);
        if (!p) continue;
        this.tmpPos.set(p.x, 0.6, p.z);
        this.tmpQuat.identity();
        this.tmpScale.set(1, 1, 1);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        mesh.setMatrixAt(i, this.tmpMat);
        this.pieceMap.set(piece.id, { type, instanceIndex: i, nodeId: piece.nodeId });
      }
      mesh.instanceMatrix.needsUpdate = true;
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
    this.time += deltaMs * 0.001;
    this.boardTimeUniform.value = this.time;
    for (let i = this.moves.length - 1; i >= 0; i -= 1) {
      const move = this.moves[i];
      const map = this.pieceMap.get(move.pieceId);
      if (!map) {
        this.moves.splice(i, 1);
        continue;
      }
      const mesh = this.pieceMeshes.get(map.type);
      if (!mesh) {
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
      if (t >= 1) {
        this.moves.splice(i, 1);
      }
    }
    if (this.renderer && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public setHighlightedNodes(selectedNodeId: string | null, legalNodeIds: string[]): void {
    if (!this.boardHighlightAttr) return;
    this.boardHighlightAttr.array.fill(0);
    if (selectedNodeId) {
      const idx = this.nodeIndexById.get(selectedNodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 1);
      }
    }
    for (const nodeId of legalNodeIds) {
      const idx = this.nodeIndexById.get(nodeId);
      if (idx !== undefined) {
        this.boardHighlightAttr.setX(idx, 0.7);
      }
    }
    this.boardHighlightAttr.needsUpdate = true;
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
    this.pan.x -= dx * 0.03 / this.zoom;
    this.pan.y += dy * 0.03 / this.zoom;
    this.applyCameraTransform();
  }

  public zoomBy(delta: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom + delta, 0.55, 2.6);
    this.applyCameraTransform();
  }

  public resetCamera(): void {
    this.pan.set(0, 0);
    this.zoom = 1;
    this.applyCameraTransform();
  }

  public resize(size: { w: number; h: number }): void {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(size.w, size.h);
    const aspect = size.w / size.h;
    const frustum = 52;
    this.camera.left = (-frustum * aspect) / 2;
    this.camera.right = (frustum * aspect) / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.applyCameraTransform();
  }

  public dispose(): void {
    for (const mesh of this.pieceMeshes.values()) {
      mesh.geometry.dispose();
      this.root.remove(mesh);
    }
    this.pieceMeshes.clear();
    if (this.boardMesh) {
      this.boardMesh.geometry.dispose();
      this.root.remove(this.boardMesh);
      this.boardMesh = null;
    }
    this.boardHighlightAttr = null;
    this.boardPulseAttr = null;
    for (const mat of this.pieceMaterialByType.values()) {
      mat.dispose();
    }
    this.pieceMaterialByType.clear();
    this.tileMaterial.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
    this.renderer = null;
    this.camera = null;
  }

  private installBoardShaderHook(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.boardTimeUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute float instanceHighlight;
attribute float instancePulse;
varying float vInstanceHighlight;
varying float vInstancePulse;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vInstanceHighlight = instanceHighlight;
vInstancePulse = instancePulse;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uTime;
varying float vInstanceHighlight;
varying float vInstancePulse;`
        )
        .replace(
          "#include <dithering_fragment>",
          `float pulse = sin(uTime * 3.0 + vInstancePulse * 6.28318) * 0.09;
float highlight = vInstanceHighlight * (0.28 + 0.12 * sin(uTime * 5.0));
gl_FragColor.rgb += vec3(0.22, 0.56, 0.95) * highlight;
gl_FragColor.rgb += vec3(pulse);
#include <dithering_fragment>`
        );
    };
    material.needsUpdate = true;
  }

  private applyCameraTransform(): void {
    if (!this.camera) return;
    this.camera.zoom = this.zoom;
    this.camera.position.set(this.pan.x, 55, 45 + this.pan.y);
    this.camera.lookAt(this.pan.x, 0, this.pan.y);
    this.camera.updateProjectionMatrix();
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
        return new THREE.SphereGeometry(0.53, 10, 10);
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
      warrior: 0xffffff
    };
    const material = new THREE.MeshStandardMaterial({
      color: color[type],
      roughness: 0.45,
      metalness: 0.28
    });
    this.pieceMaterialByType.set(type, material);
    return material;
  }
}
