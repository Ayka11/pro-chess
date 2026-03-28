import type { NodeData } from "./parityLoader";
import type { Piece, PieceColor, PieceType } from "./types";
import {
  SECTOR_COUNT,
  sectorCenterAngle,
  sectorIndexFromCoords,
  normalizedAngularDifference
} from "./sector";

const PLAYER_COLORS: PieceColor[] = ["red1", "yellow1", "green1", "red2", "yellow2", "green2"];
const BACK_ROW_ORDER: PieceType[] = [
  "castle",
  "officer",
  "horse",
  "king",
  "vizier",
  "horse",
  "officer",
  "castle"
];
const WARRIOR_COUNT = 7;
const REQUIRED_PER_SECTOR = BACK_ROW_ORDER.length + WARRIOR_COUNT;

type Candidate = {
  node: NodeData;
  radius: number;
  offset: number;
};

function buildCandidates(nodes: NodeData[], sectorId: number): Candidate[] {
  const center = sectorCenterAngle(sectorId);
  return nodes
    .map((node) => {
      const radius = Math.hypot(node.x ?? 0, node.z ?? 0);
      const angle = Math.atan2(node.z ?? 0, node.x ?? 0);
      return {
        node,
        radius,
        offset: normalizedAngularDifference(angle, center)
      };
    })
    .sort((a, b) => {
      if (Math.abs(b.radius - a.radius) > 1e-6) {
        return b.radius - a.radius;
      }
      return a.offset - b.offset;
    });
}

export function generateInitialPieces(nodes: NodeData[], numPlayers = 6): Piece[] {
  const players = Math.min(Math.max(2, numPlayers), SECTOR_COUNT);
  const nodesBySector = new Map<number, NodeData[]>();
  for (const node of nodes) {
    const sector = sectorIndexFromCoords(node.x ?? 0, node.z ?? 0);
    if (!nodesBySector.has(sector)) {
      nodesBySector.set(sector, []);
    }
    nodesBySector.get(sector)?.push(node);
  }

  const pieces: Piece[] = [];

  for (let sectorId = 0; sectorId < players; sectorId += 1) {
    const sectorNodes = nodesBySector.get(sectorId) ?? [];
    if (sectorNodes.length === 0) continue;
    const candidates = buildCandidates(sectorNodes, sectorId);
    if (candidates.length < REQUIRED_PER_SECTOR) {
      continue;
    }

    const backRow = candidates
      .slice(0, BACK_ROW_ORDER.length)
      .sort((a, b) => a.offset - b.offset);
    const warriorRow = candidates
      .slice(BACK_ROW_ORDER.length, REQUIRED_PER_SECTOR)
      .sort((a, b) => a.offset - b.offset);

    const playerColor = PLAYER_COLORS[sectorId % PLAYER_COLORS.length];
    const counts: Record<PieceType, number> = {
      king: 0,
      vizier: 0,
      castle: 0,
      officer: 0,
      horse: 0,
      warrior: 0
    };

    backRow.forEach((candidate, index) => {
      const type = BACK_ROW_ORDER[index];
      const id = `${playerColor}-${type}-${counts[type]}`;
      counts[type] += 1;
      pieces.push({
        id,
        type,
        color: playerColor,
        nodeId: candidate.node.id
      });
    });

    warriorRow.forEach((candidate) => {
      const id = `${playerColor}-warrior-${counts.warrior}`;
      counts.warrior += 1;
      pieces.push({
        id,
        type: "warrior",
        color: playerColor,
        nodeId: candidate.node.id
      });
    });
  }

  return pieces;
}
