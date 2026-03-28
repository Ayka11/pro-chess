import * as THREE from "three";

export interface NodeData {
  id: string;
  q: number;
  r: number;
  // optional world positions (if present, they're used instead of axial->world)
  x?: number;
  z?: number;
  isColored?: number; // 0 = neutral, 1 = colored
}

export class ProgressiveChessBoard extends THREE.Group {
  private readonly TRI_SIZE = 24; // visual scale in world units (tweak to fit scene)
  private readonly HEIGHT = Math.sqrt(3) / 2 * this.TRI_SIZE;
  private materials: Record<string, THREE.Material> = {};
  private instanced: Record<string, THREE.InstancedMesh> = {};

  constructor(nodes: NodeData[] = []) {
    super();
    this.name = "ProgressiveChessBoard";
    this.createMaterials();
    this.buildInstancedMeshes(nodes);
  }

  private createMaterials(): void {
    const base = { roughness: 0.7, metalness: 0.02 };
    this.materials.neutral = new THREE.MeshStandardMaterial({ color: 0xf8f6f0, ...base });
    this.materials.red = new THREE.MeshStandardMaterial({ color: 0xff3a3a, ...base });
    this.materials.green = new THREE.MeshStandardMaterial({ color: 0x3ac95a, ...base });
    this.materials.yellow = new THREE.MeshStandardMaterial({ color: 0xffd24a, ...base });
    // subtle border frame material
    this.materials.frame = new THREE.MeshStandardMaterial({ color: 0x111217, roughness: 0.9, metalness: 0.0 });
  }

  private makeTriGeo(): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(this.TRI_SIZE * 0.58, this.TRI_SIZE * 0.58, 6, 3, 1);
    g.rotateX(Math.PI / 2);
    // center the triangle on Y so it's flat on top of the plane
    g.translate(0, 3, 0);
    return g;
  }

  private buildInstancedMeshes(nodes: NodeData[]): void {
    // prepare counts per bucket
    const buckets = { neutral: 0, red: 0, green: 0, yellow: 0 };
    const colorForNode = (n: NodeData) => (n.isColored === 0 ? "neutral" : this.getColorKey(n.q, n.r));
    nodes.forEach((n) => (buckets[colorForNode(n)] += 1));

    const triGeo = this.makeTriGeo();

    // create instanced meshes with capacity = bucket count
    for (const key of ["neutral", "red", "green", "yellow"]) {
      const count = Math.max(1, buckets[key as keyof typeof buckets]);
      const mesh = new THREE.InstancedMesh(triGeo, this.materials[key], count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.instanced[key] = mesh;
      this.add(mesh);
    }

    // place instances
    const tmp = new THREE.Object3D();
    const counters: Record<string, number> = { neutral: 0, red: 0, green: 0, yellow: 0 };
    nodes.forEach((n) => {
      const x = typeof n.x === "number" ? n.x : this.axialToWorldX(n.q, n.r);
      const z = typeof n.z === "number" ? n.z : this.axialToWorldZ(n.q, n.r);

      tmp.position.set(x, 0, z);
      // alternate triangle orientation so we get up/down pointing
      const parity = ((n.q + n.r) & 1) === 0 ? 0 : Math.PI;
      tmp.rotation.set(0, parity, 0);
      tmp.updateMatrix();

      const bucket = colorForNode(n);
      const idx = counters[bucket]++;
      const mesh = this.instanced[bucket];
      mesh.setMatrixAt(idx, tmp.matrix);
    });

    // mark matrices as updated
    for (const key of Object.keys(this.instanced)) {
      this.instanced[key].instanceMatrix.needsUpdate = true;
    }

    // optional frame around board (thin hex ring) — lightweight visual anchor
    const frameGeo = new THREE.RingGeometry(this.TRI_SIZE * 11.5, this.TRI_SIZE * 12.2, 64);
    const frame = new THREE.Mesh(frameGeo, this.materials.frame);
    frame.rotateX(-Math.PI / 2);
    frame.position.y = 1.5;
    this.add(frame);
  }

  private axialToWorldX(q: number, r: number): number {
    return q * this.TRI_SIZE + r * (this.TRI_SIZE / 2);
  }
  private axialToWorldZ(q: number, r: number): number {
    return r * this.HEIGHT;
  }

  // diagonal 3-color mapping (wraps negative safely)
  private getColorKey(q: number, r: number): "red" | "green" | "yellow" {
    const sum = q + r * 2;
    const idx = ((Math.round(sum) % 3) + 3) % 3;
    return idx === 0 ? "red" : idx === 1 ? "green" : "yellow";
  }

  // public helper to rebuild with a new node set
  public setNodes(nodes: NodeData[]): void {
    // dispose any previous instanced meshes
    for (const k of Object.keys(this.instanced)) {
      const m = this.instanced[k];
      this.remove(m);
      m.geometry.dispose();
      // don't dispose shared materials here
    }
    this.instanced = {};
    this.buildInstancedMeshes(nodes);
  }

  dispose(): void {
    for (const k of Object.keys(this.instanced)) {
      const m = this.instanced[k];
      this.remove(m);
      m.geometry.dispose();
      m.dispose();
    }
    for (const k of Object.keys(this.materials)) {
      const mat = this.materials[k];
      mat.dispose();
    }
  }
}

/* Usage example (outside this file):

import { ProgressiveChessBoard } from "./ProgressiveChessBoard";
import { generateHexGrid } from "./hexGrid";

// create a board group sized for radius 11
const nodes = generateHexGrid(11);
const boardGroup = new ProgressiveChessBoard(nodes);

// add `boardGroup` to your three.js scene root (or to an existing container/group)
scene.add(boardGroup);

// later, to update: boardGroup.setNodes(newNodes)
*/
