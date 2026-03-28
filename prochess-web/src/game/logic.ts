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

type InteractionPreview = {
  legalMoves: Move[];
  restrictedNodeIds: string[];
};

export class GameState {
  public selectedPieceId: string | null = null;
  private readonly data: ParityData | null;
  private readonly nodes: NodeData[];
  private readonly pieces = new Map<string, Piece>();
  private readonly pieceByNode = new Map<string, string>();

  constructor(dataOrNodes: ParityData | NodeData[], initialPieces?: Piece[]) {
    if (Array.isArray(dataOrNodes)) {
      this.data = null;
      this.nodes = dataOrNodes;
      if (initialPieces) {
        this.addPieces(initialPieces);
      }
      return;
    }
    this.data = dataOrNodes;
    this.nodes = dataOrNodes.nodes;
    this.initializePiecesFromUnityLayout();
  }

  public static fromNodes(nodes: NodeData[], pieces?: Piece[]): GameState {
    return new GameState(nodes, pieces);
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
    return this.getInteractionPreview(selected).legalMoves;
  }

  public getMovesForPieceId(pieceId: string): Move[] {
    const piece = this.pieces.get(pieceId);
    if (!piece) return [];
    return this.getInteractionPreview(piece).legalMoves;
  }

  public getInteractionHintsForSelected(): InteractionPreview {
    const selected = this.getSelectedPiece();
    if (!selected) {
      return { legalMoves: [], restrictedNodeIds: [] };
    }
    return this.getInteractionPreview(selected);
  }

  public snapshotInitialMoves(): Record<string, string[]> {
    const output: Record<string, string[]> = {};
    for (const piece of this.getPieces()) {
      output[piece.id] = this.getInteractionPreview(piece).legalMoves
        .map((m) => m.nodeId)
        .sort((a, b) => a.localeCompare(b));
    }
    return output;
  }

  public tryMoveSelected(
    targetNodeId: string
  ): { pieceId: string; fromNodeId: string; toNodeId: string; capturedPieceId?: string; moveKind: Move["kind"] } | null {
    const selected = this.getSelectedPiece();
    if (!selected) return null;

    const selectedMove = this.getInteractionPreview(selected).legalMoves.find((move) => move.nodeId === targetNodeId);
    if (!selectedMove) return null;

    const fromNodeId = selected.nodeId;
    let capturedPieceId: string | undefined;
    const occupyingPieceId = this.pieceByNode.get(targetNodeId);
    if (occupyingPieceId) {
      const occupyingPiece = this.pieces.get(occupyingPieceId);
      if (!occupyingPiece || occupyingPiece.color === selected.color || selectedMove.kind !== "capture") {
        return null;
      }
      this.pieces.delete(occupyingPieceId);
      this.pieceByNode.delete(targetNodeId);
      capturedPieceId = occupyingPieceId;
    }

    this.pieceByNode.delete(selected.nodeId);
    selected.nodeId = targetNodeId;
    this.pieceByNode.set(targetNodeId, selected.id);
    this.selectedPieceId = null;
    return {
      pieceId: selected.id,
      fromNodeId,
      toNodeId: targetNodeId,
      capturedPieceId,
      moveKind: selectedMove.kind
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

  private addPieces(pieces: Piece[]): void {
    for (const piece of pieces) {
      this.pieces.set(piece.id, piece);
      this.pieceByNode.set(piece.nodeId, piece.id);
    }
  }

  private getInteractionPreview(piece: Piece): InteractionPreview {
    if (!this.data) return { legalMoves: [], restrictedNodeIds: [] };
    const raySet = this.getRaySetForPiece(piece.type);
    const maxDistance = this.getMaxDistanceForPiece(piece.type);
    const hitsPerDirection = this.getHitCountLimit(piece.type);

    const nodeRays = this.data.raysByNode[piece.nodeId];
    if (!nodeRays) return { legalMoves: [], restrictedNodeIds: [] };

    const moves: Move[] = [];
    const restrictedNodeIds: string[] = [];
    for (const dirId of raySet) {
      const hits = (nodeRays[dirId] ?? []).filter((h) => h.distance <= maxDistance);

      if (piece.type === "king" || piece.type === "warrior") {
        const first = hits[0];
        if (first) {
          this.collectInteraction(piece, first.id, moves, restrictedNodeIds);
        }
        continue;
      }

      if (piece.type === "horse") {
        for (let i = 0; i < hits.length && i < hitsPerDirection; i += 1) {
          const hit = hits[i];
          this.collectInteraction(piece, hit.id, moves, restrictedNodeIds);
        }
        continue;
      }

      for (const hit of hits) {
        const shouldStop = this.collectInteraction(piece, hit.id, moves, restrictedNodeIds);
        if (shouldStop) {
          break;
        }
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
    return {
      legalMoves: deduped,
      restrictedNodeIds: Array.from(new Set(restrictedNodeIds))
    };
  }

  private collectInteraction(
    piece: Piece,
    targetNodeId: string,
    legalMoves: Move[],
    restrictedNodeIds: string[]
  ): boolean {
    const occupyingPieceId = this.pieceByNode.get(targetNodeId);
    if (!occupyingPieceId) {
      legalMoves.push({ nodeId: targetNodeId, kind: "move" });
      return false;
    }

    const occupyingPiece = this.pieces.get(occupyingPieceId);
    if (!occupyingPiece) {
      legalMoves.push({ nodeId: targetNodeId, kind: "move" });
      return false;
    }
    if (occupyingPiece.color === piece.color) {
      return true;
    }

    if (this.canCaptureAcrossArea(piece, targetNodeId)) {
      legalMoves.push({ nodeId: targetNodeId, kind: "capture" });
    } else {
      restrictedNodeIds.push(targetNodeId);
    }
    return true;
  }

  private canCaptureAcrossArea(piece: Piece, targetNodeId: string): boolean {
    if (piece.type === "king") {
      return true;
    }
    const fromNode = this.getNodeById(piece.nodeId);
    const targetNode = this.getNodeById(targetNodeId);
    if (!fromNode || !targetNode) {
      return false;
    }
    return this.getAreaType(fromNode) === this.getAreaType(targetNode);
  }

  private getAreaType(node: NodeData): "colored" | "colorless" {
    return node.isColored === 0 ? "colorless" : "colored";
  }

  private getRaySetForPiece(type: PieceType): string[] {
    if (!this.data) return [];
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
