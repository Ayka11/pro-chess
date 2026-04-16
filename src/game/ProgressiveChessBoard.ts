import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { PortalColor, PortalState } from "./types";

export interface ProgressiveBoardNode {
  id: string;
  x: number;
  z: number;
  isColored?: number;
  colorKey?: "neutral" | "red" | "green" | "yellow";
  pointsUp?: boolean;
}

type BucketKey = "neutral" | "red" | "green" | "yellow";

type BoundaryEdge = {
  key: string;
  startKey: string;
  endKey: string;
  coords: [number, number, number, number, number, number];
  length: number;
};

export class ProgressiveChessBoard extends THREE.Group {
  private boardNodes: ProgressiveBoardNode[] = [];
  private nodeWorldById = new Map<string, THREE.Vector3>();
  private triangleRadius = 2.9;
  private materials: Record<string, THREE.Material> = {};
  private instanced: Partial<Record<BucketKey, THREE.InstancedMesh>> = {};
  private engagementZoneOutline: LineSegments2 | null = null;
  private highlightMesh: THREE.InstancedMesh | null = null;
  private captureMesh: THREE.InstancedMesh | null = null;
  private blockedMesh: THREE.InstancedMesh | null = null;
  private selectedMesh: THREE.InstancedMesh | null = null;
  private portalGroup = new THREE.Group();
  private engagementZoneNodeIds: string[] = [];
  private engagementZoneActive = false;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private selectedNodeIds: string[] = [];
  private highlightedNodeIds: string[] = [];
  private tournamentMode = false;
  private time = 0;
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpMat = new THREE.Matrix4();

  constructor(nodes: ProgressiveBoardNode[] = []) {
    super();
    this.name = "ProgressiveChessBoard";
    this.createMaterials();
    this.add(this.portalGroup);
    this.portalGroup.visible = false;
    this.setNodes(nodes);
  }

  public setNodes(nodes: ProgressiveBoardNode[]): void {
    this.boardNodes = nodes.map((node) => ({ ...node }));
    this.nodeWorldById.clear();
    for (const node of nodes) {
      this.nodeWorldById.set(node.id, new THREE.Vector3(node.x, 0, node.z));
    }
    this.triangleRadius = this.estimateTriangleRadius(nodes);
    this.rebuildBoardMeshes();
    this.setEngagementZoneNodes(this.engagementZoneNodeIds, this.engagementZoneActive);
    this.setHighlightedNodes(this.highlightedNodeIds);
    this.setSelectedNodeIds(this.selectedNodeIds);
  }

  public setEngagementZoneNodes(nodeIds: string[], active = false): void {
    this.engagementZoneNodeIds = [...nodeIds];
    this.engagementZoneActive = active;
    this.rebuildEngagementZoneOutline();
    this.updateEngagementZoneMaterial();
  }

  public setViewportSize(width: number, height: number): void {
    this.viewportWidth = Math.max(width, 1);
    this.viewportHeight = Math.max(height, 1);
    this.updateEngagementZoneResolution();
  }

  public setHighlightedNodes(nodeIds: string[]): void {
    this.highlightedNodeIds = [...nodeIds];
    this.updateOverlayMesh(this.highlightMesh, this.highlightedNodeIds, 1, 0.16);
  }

  public setCaptureHighlightedNodes(nodeIds: string[]): void {
    this.updateOverlayMesh(this.captureMesh, nodeIds, 1, 0.16);
  }

  public setBlockedHighlightedNodes(nodeIds: string[]): void {
    this.updateOverlayMesh(this.blockedMesh, nodeIds, 1, 0.14);
  }

  public setSelectedNodeIds(nodeIds: string[]): void {
    this.selectedNodeIds = [...nodeIds];
    this.updateOverlayMesh(this.selectedMesh, this.selectedNodeIds, 1, 0.24);
  }

  public setPortals(portals: PortalState[]): void {
    this.clearPortalMeshes();

    for (const portal of portals) {
      const position = this.nodeWorldById.get(portal.nodeId);
      if (!position) continue;

      const group = new THREE.Group();
      group.position.set(position.x, 0.28, position.z);
      group.userData.portalId = portal.id;

      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(this.triangleRadius * 0.42, this.triangleRadius * 0.58, 0.12, 24),
        new THREE.MeshBasicMaterial({
          color: this.portalColorHex(portal.color),
          transparent: true,
          opacity: portal.active === false ? 0.22 : 0.45,
          depthWrite: false
        })
      );
      glow.position.y = -0.12;
      group.add(glow);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(this.triangleRadius * 0.48, this.triangleRadius * 0.08, 12, 40),
        new THREE.MeshStandardMaterial({
          color: this.portalColorHex(portal.color),
          emissive: this.portalColorHex(portal.color),
          emissiveIntensity: portal.active === false ? 0.14 : 0.38,
          roughness: 0.32,
          metalness: 0.35,
          transparent: true,
          opacity: portal.active === false ? 0.48 : 0.95
        })
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(this.triangleRadius * 0.16, 20, 20),
        new THREE.MeshStandardMaterial({
          color: 0xf7fbff,
          emissive: this.portalColorHex(portal.color),
          emissiveIntensity: 0.55,
          roughness: 0.18,
          metalness: 0.08
        })
      );
      core.position.y = 0.18;
      group.add(core);

      if (portal.label) {
        group.userData.label = portal.label;
      }
      this.portalGroup.add(group);
    }
  }

  public clearPortals(): void {
    this.clearPortalMeshes();
  }

  public setTournamentMode(active: boolean): void {
    this.tournamentMode = active;
    this.portalGroup.visible = active;
  }

  public update(deltaMs: number): void {
    this.time += deltaMs * 0.001;
    this.updateEngagementZoneMaterial();
    if (!this.portalGroup.visible) return;

    for (const child of this.portalGroup.children) {
      const ring = child.children[1];
      const core = child.children[2];
      if (ring) {
        ring.rotation.z += deltaMs * 0.0014;
      }
      if (core) {
        core.position.y = 0.16 + Math.sin(this.time * 2.2) * 0.05;
      }
      child.position.y = 0.28 + Math.sin(this.time * 1.8) * 0.02;
    }
  }

  public dispose(): void {
    this.clearPortalMeshes();
    this.clearBoardMeshes();
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
  }

  private createMaterials(): void {
    const base = { roughness: 0.52, metalness: 0.08 };
    this.materials.neutral = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, ...base });
    this.materials.red = new THREE.MeshStandardMaterial({ color: 0xff3b46, ...base });
    this.materials.green = new THREE.MeshStandardMaterial({ color: 0x24bf72, ...base });
    this.materials.yellow = new THREE.MeshStandardMaterial({ color: 0xffe73b, ...base });
    this.materials.engagementZone = new LineMaterial({
      color: 0x278dff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      depthTest: false,
      linewidth: 4.5,
      worldUnits: false,
      dashed: false
    });
    this.materials.highlight = new THREE.MeshBasicMaterial({
      color: 0x6bc6ff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false
    });
    this.materials.capture = new THREE.MeshBasicMaterial({
      color: 0xff5a66,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false
    });
    this.materials.blocked = new THREE.MeshBasicMaterial({
      color: 0x7c8797,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      depthTest: false
    });
    this.materials.selected = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      depthTest: false
    });
  }

  private rebuildBoardMeshes(): void {
    this.clearBoardMeshes();
    if (this.boardNodes.length === 0) return;

    const triangleGeometry = this.createTriangleGeometry(this.triangleRadius * 0.96);
    const bucketEntries = new Map<BucketKey, ProgressiveBoardNode[]>();
    bucketEntries.set("neutral", []);
    bucketEntries.set("red", []);
    bucketEntries.set("green", []);
    bucketEntries.set("yellow", []);

    for (const node of this.boardNodes) {
      bucketEntries.get(this.bucketForNode(node))?.push(node);
    }

    for (const bucket of ["neutral", "red", "green", "yellow"] as BucketKey[]) {
      const entries = bucketEntries.get(bucket) ?? [];
      const mesh = new THREE.InstancedMesh(
        triangleGeometry,
        this.materials[bucket],
        Math.max(entries.length, 1)
      );
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      this.instanced[bucket] = mesh;
      this.add(mesh);

      entries.forEach((node, index) => {
        this.composeNodeMatrix(node, 0.01, 1);
        mesh.setMatrixAt(index, this.tmpMat);
      });
      mesh.count = entries.length;
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.highlightMesh = new THREE.InstancedMesh(
      this.createTriangleGeometry(this.triangleRadius * 0.74),
      this.materials.highlight,
      Math.max(this.boardNodes.length, 1)
    );
    this.highlightMesh.frustumCulled = false;
    this.highlightMesh.renderOrder = 18;
    this.highlightMesh.count = 0;
    this.add(this.highlightMesh);

    this.captureMesh = new THREE.InstancedMesh(
      this.createTriangleGeometry(this.triangleRadius * 0.78),
      this.materials.capture,
      Math.max(this.boardNodes.length, 1)
    );
    this.captureMesh.frustumCulled = false;
    this.captureMesh.renderOrder = 18;
    this.captureMesh.count = 0;
    this.add(this.captureMesh);

    this.blockedMesh = new THREE.InstancedMesh(
      this.createTriangleGeometry(this.triangleRadius * 0.7),
      this.materials.blocked,
      Math.max(this.boardNodes.length, 1)
    );
    this.blockedMesh.frustumCulled = false;
    this.blockedMesh.renderOrder = 16;
    this.blockedMesh.count = 0;
    this.add(this.blockedMesh);

    this.selectedMesh = new THREE.InstancedMesh(
      this.createTriangleGeometry(this.triangleRadius * 0.9),
      this.materials.selected,
      Math.max(this.boardNodes.length, 1)
    );
    this.selectedMesh.frustumCulled = false;
    this.selectedMesh.renderOrder = 19;
    this.selectedMesh.count = 0;
    this.add(this.selectedMesh);
    this.rebuildEngagementZoneOutline();
  }

  private clearBoardMeshes(): void {
    for (const mesh of Object.values(this.instanced)) {
      if (!mesh) continue;
      this.remove(mesh);
      mesh.geometry.dispose();
    }
    this.instanced = {};

    if (this.engagementZoneOutline) {
      this.remove(this.engagementZoneOutline);
      this.engagementZoneOutline.geometry.dispose();
      this.engagementZoneOutline = null;
    }
    if (this.highlightMesh) {
      this.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh = null;
    }
    if (this.captureMesh) {
      this.remove(this.captureMesh);
      this.captureMesh.geometry.dispose();
      this.captureMesh = null;
    }
    if (this.blockedMesh) {
      this.remove(this.blockedMesh);
      this.blockedMesh.geometry.dispose();
      this.blockedMesh = null;
    }
    if (this.selectedMesh) {
      this.remove(this.selectedMesh);
      this.selectedMesh.geometry.dispose();
      this.selectedMesh = null;
    }
  }

  private clearPortalMeshes(): void {
    for (const child of [...this.portalGroup.children]) {
      child.traverse((descendant) => {
        if (!(descendant instanceof THREE.Mesh)) return;
        descendant.geometry.dispose();
        if (Array.isArray(descendant.material)) {
          descendant.material.forEach((material) => material.dispose());
        } else {
          descendant.material.dispose();
        }
      });
      this.portalGroup.remove(child);
    }
  }

  private updateOverlayMesh(
    mesh: THREE.InstancedMesh | null,
    nodeIds: string[],
    scale: number,
    height: number
  ): void {
    if (!mesh) return;

    let index = 0;
    for (const nodeId of nodeIds) {
      const node = this.boardNodes.find((entry) => entry.id === nodeId);
      if (!node) continue;
      this.composeNodeMatrix(node, height, scale);
      mesh.setMatrixAt(index, this.tmpMat);
      index += 1;
    }

    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private clearOverlayMesh(mesh: THREE.InstancedMesh | null): void {
    if (!mesh) return;
    mesh.count = 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateEngagementZoneMaterial(): void {
    const material = this.materials.engagementZone;
    if (!(material instanceof LineMaterial)) {
      return;
    }

    material.opacity = 0.82;
    material.color.setHex(0x278dff);
  }

  private updateEngagementZoneResolution(): void {
    const material = this.materials.engagementZone;
    if (!(material instanceof LineMaterial)) {
      return;
    }

    material.resolution.set(this.viewportWidth, this.viewportHeight);
  }

  private rebuildEngagementZoneOutline(): void {
    if (this.engagementZoneOutline) {
      this.remove(this.engagementZoneOutline);
      this.engagementZoneOutline.geometry.dispose();
      this.engagementZoneOutline = null;
    }

    const positions = this.buildEngagementZoneOutlinePositions(this.triangleRadius, 0.12);
    if (positions.length === 0) {
      return;
    }

    const material = this.materials.engagementZone;
    if (!(material instanceof LineMaterial)) {
      return;
    }

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    this.engagementZoneOutline = new LineSegments2(geometry, material);
    this.engagementZoneOutline.computeLineDistances();
    this.engagementZoneOutline.frustumCulled = false;
    this.engagementZoneOutline.renderOrder = 17;
    this.add(this.engagementZoneOutline);
    this.updateEngagementZoneResolution();
  }

  private buildEngagementZoneOutlinePositions(radius: number, y: number): number[] {
    const boundaryEdges = new Map<string, BoundaryEdge>();

    for (const nodeId of this.engagementZoneNodeIds) {
      const node = this.boardNodes.find((entry) => entry.id === nodeId);
      if (!node) {
        continue;
      }

      const vertices = this.buildTriangleVertices(node, radius, y);
      for (const [startIndex, endIndex] of [[0, 1], [1, 2], [2, 0]] as const) {
        const start = vertices[startIndex];
        const end = vertices[endIndex];
        const startKey = this.buildVertexKey(start);
        const endKey = this.buildVertexKey(end);
        const edgeKey = this.buildEdgeKey(startKey, endKey);
        if (boundaryEdges.has(edgeKey)) {
          boundaryEdges.delete(edgeKey);
          continue;
        }
        boundaryEdges.set(edgeKey, {
          key: edgeKey,
          startKey,
          endKey,
          coords: [start.x, start.y, start.z, end.x, end.y, end.z],
          length: start.distanceTo(end)
        });
      }
    }

    const positions: number[] = [];
    for (const edge of this.collectLargestBoundaryEdges(boundaryEdges)) {
      positions.push(...edge.coords);
    }
    return positions;
  }

  private buildTriangleVertices(node: ProgressiveBoardNode, radius: number, y: number): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    const yaw = this.nodeYaw(node);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const localX = Math.cos(angle) * radius;
      const localZ = -Math.sin(angle) * radius;
      vertices.push(
        new THREE.Vector3(
          node.x + localX * cosYaw + localZ * sinYaw,
          y,
          node.z - localX * sinYaw + localZ * cosYaw
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
    return `${vertex.x.toFixed(3)}:${vertex.z.toFixed(3)}`;
  }

  private buildEdgeKey(startKey: string, endKey: string): string {
    return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
  }

  private composeNodeMatrix(node: ProgressiveBoardNode, y: number, scale: number): void {
    this.tmpPos.set(node.x, y, node.z);
    this.tmpQuat.setFromAxisAngle(this.yAxis, this.nodeYaw(node));
    this.tmpScale.set(scale, 1, scale);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
  }

  private createTriangleGeometry(radius: number): THREE.BufferGeometry {
    const geometry = new THREE.CircleGeometry(radius, 3);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  private estimateTriangleRadius(nodes: ProgressiveBoardNode[]): number {
    if (nodes.length < 2) return 2.9;
    const nearestDistances: number[] = [];

    for (let index = 0; index < nodes.length; index += 1) {
      let nearest = Number.POSITIVE_INFINITY;
      const source = nodes[index];
      for (let otherIndex = 0; otherIndex < nodes.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        const target = nodes[otherIndex];
        const distance = Math.hypot(target.x - source.x, target.z - source.z);
        if (distance < 0.2 || distance >= nearest) continue;
        nearest = distance;
      }
      if (Number.isFinite(nearest)) {
        nearestDistances.push(nearest);
      }
    }

    if (nearestDistances.length === 0) return 2.9;
    nearestDistances.sort((left, right) => left - right);
    const sample = nearestDistances.slice(0, Math.min(18, nearestDistances.length));
    return sample.reduce((sum, value) => sum + value, 0) / sample.length;
  }

  private bucketForNode(node: ProgressiveBoardNode): BucketKey {
    if (node.colorKey) return node.colorKey;
    return node.isColored === 0 ? "neutral" : "red";
  }

  private nodeYaw(node: ProgressiveBoardNode): number {
    if (typeof node.pointsUp === "boolean") {
      return node.pointsUp ? -Math.PI * 0.5 : Math.PI * 0.5;
    }
    return node.isColored === 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  }

  private portalColorHex(color: PortalColor): number {
    switch (color) {
      case "red":
        return 0xff5560;
      case "green":
        return 0x29d67d;
      case "yellow":
        return 0xffe052;
      case "neutral":
      default:
        return 0xbfd6f5;
    }
  }
}
