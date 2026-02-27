import type { Move, Piece, PieceColor, PieceType } from "./types";
import type { NodeData, ParityData } from "./parityLoader";

const COLOR_BY_ENUM: Record<number, PieceColor> = {
  0: "red1",
  1: "green1",
  2: "yellow1",
  3: "red2",
  4: "green2",
  5: "yellow2"
};

const TYPE_BY_ENUM: Record<number, PieceType> = {
  1: "king",
  2: "vizier",
  3: "castle",
  4: "officer",
  5: "horse",
  6: "warrior"
};

export class GameState {
  public selectedPieceId: string | null = null;
  private readonly data: ParityData;
  private readonly nodes: NodeData[];
  private readonly pieces = new Map<string, Piece>();
  private readonly pieceByNode = new Map<string, string>();

  constructor(data: ParityData) {
    this.data = data;
    this.nodes = data.nodes;
    this.initializePiecesFromUnityLayout();
  }

  public getNodes(): NodeData[] {
    return this.nodes;
  }

  public getPieces(): Piece[] {
    return Array.from(this.pieces.values());
  }

  public getNodeById(id: string): NodeData | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  public getPieceAtNode(nodeId: string): Piece | null {
    const pieceId = this.pieceByNode.get(nodeId);
    if (!pieceId) return null;
    return this.pieces.get(pieceId) ?? null;
  }

  public getSelectedPiece(): Piece | null {
    if (!this.selectedPieceId) return null;
    return this.pieces.get(this.selectedPieceId) ?? null;
  }

  public selectPieceAtNode(nodeId: string): void {
    const piece = this.getPieceAtNode(nodeId);
    this.selectedPieceId = piece ? piece.id : null;
  }

  public getMovesForSelected(): Move[] {
    const selected = this.getSelectedPiece();
    if (!selected) return [];
    return this.getMovesForPiece(selected);
  }

  public getMovesForPieceId(pieceId: string): Move[] {
    const piece = this.pieces.get(pieceId);
    if (!piece) return [];
    return this.getMovesForPiece(piece);
  }

  public snapshotInitialMoves(): Record<string, string[]> {
    const output: Record<string, string[]> = {};
    for (const piece of this.getPieces()) {
      output[piece.id] = this.getMovesForPiece(piece)
        .map((m) => m.nodeId)
        .sort((a, b) => a.localeCompare(b));
    }
    return output;
  }

  public tryMoveSelected(
    targetNodeId: string
  ): { pieceId: string; fromNodeId: string; toNodeId: string } | null {
    const selected = this.getSelectedPiece();
    if (!selected) return null;
    if (this.pieceByNode.has(targetNodeId)) return null;

    const legal = this.getMovesForPiece(selected).some((m) => m.nodeId === targetNodeId);
    if (!legal) return null;

    const fromNodeId = selected.nodeId;
    this.pieceByNode.delete(selected.nodeId);
    selected.nodeId = targetNodeId;
    this.pieceByNode.set(targetNodeId, selected.id);
    this.selectedPieceId = null;
    return {
      pieceId: selected.id,
      fromNodeId,
      toNodeId: targetNodeId
    };
  }

  private initializePiecesFromUnityLayout(): void {
    for (const node of this.nodes) {
      if (node.eBoardCaseType <= 0) continue;
      const type = TYPE_BY_ENUM[node.eBoardCaseType];
      const color = COLOR_BY_ENUM[node.eColor];
      if (!type || !color) continue;

      const piece: Piece = {
        id: `piece-${node.id}`,
        type,
        color,
        nodeId: node.id
      };
      this.pieces.set(piece.id, piece);
      this.pieceByNode.set(piece.nodeId, piece.id);
    }
  }

  private getMovesForPiece(piece: Piece): Move[] {
    const raySet = this.getRaySetForPiece(piece.type);
    const maxDistance = this.getMaxDistanceForPiece(piece.type);
    const hitsPerDirection = this.getHitCountLimit(piece.type);

    const nodeRays = this.data.raysByNode[piece.nodeId];
    if (!nodeRays) return [];

    const moves: Move[] = [];
    for (const dirId of raySet) {
      const hits = (nodeRays[dirId] ?? []).filter((h) => h.distance <= maxDistance);

      if (piece.type === "king" || piece.type === "warrior") {
        const first = hits[0];
        if (first && !this.pieceByNode.has(first.id)) {
          moves.push({ nodeId: first.id });
        }
        continue;
      }

      if (piece.type === "horse") {
        for (let i = 0; i < hits.length && i < hitsPerDirection; i += 1) {
          const hit = hits[i];
          if (!this.pieceByNode.has(hit.id)) {
            moves.push({ nodeId: hit.id });
          }
        }
        continue;
      }

      for (const hit of hits) {
        if (this.pieceByNode.has(hit.id)) {
          break;
        }
        moves.push({ nodeId: hit.id });
      }
    }

    // Unity code stores possible positions in list and avoids duplicates.
    const unique = new Set<string>();
    const deduped: Move[] = [];
    for (const move of moves) {
      if (unique.has(move.nodeId)) continue;
      unique.add(move.nodeId);
      deduped.push(move);
    }
    return deduped;
  }

  private getRaySetForPiece(type: PieceType): string[] {
    switch (type) {
      case "castle":
        return this.data.sets.castle;
      case "officer":
        return this.data.sets.officer;
      case "warrior":
        return this.data.sets.warrior;
      case "king":
      case "vizier":
      case "horse":
      default:
        return this.data.sets.vizierKingHorse;
    }
  }

  private getMaxDistanceForPiece(type: PieceType): number {
    switch (type) {
      case "king":
      case "warrior":
        return 10;
      case "horse":
        return 30;
      case "vizier":
      case "castle":
      case "officer":
      default:
        return 100;
    }
  }

  private getHitCountLimit(type: PieceType): number {
    if (type === "horse") {
      return 3;
    }
    return Number.POSITIVE_INFINITY;
  }
}
