export interface NodeData {
  id: string;
  name: string;
  x: number;
  z: number;
  eColor: number;
  isColored: number;
  eBoardCaseType: number;
}

export interface RayHit {
  id: string;
  distance: number;
}

export type RaysByNode = Record<string, Record<string, RayHit[]>>;

export interface ParityData {
  sets: {
    warrior: string[];
    vizierKingHorse: string[];
    castle: string[];
    officer: string[];
  };
  nodes: NodeData[];
  raysByNode: RaysByNode;
}

let parityDataPromise: Promise<ParityData> | null = null;

export async function loadParityData(): Promise<ParityData> {
  if (!parityDataPromise) {
    parityDataPromise = import("./unityParityData.json").then((mod) => mod.default as ParityData);
  }
  return parityDataPromise;
}
