import type { InteractionMode, InteractionPreview, Move, Piece, PieceColor, PieceType } from "./types";
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

const ENGAGEMENT_ZONE_DEPTH = 6;

export class GameState {
  public selectedPieceId: string | null = null;
  private readonly data: ParityData | null;
  private readonly nodes: NodeData[];
  private readonly pieces = new Map<string, Piece>();
  private readonly pieceByNode = new Map<string, string>();
  private readonly engagementZoneNodeIds: string[];
  private readonly engagementZoneNodeSet: Set<string>;

  constructor(dataOrNodes: ParityData | NodeData[], initialPieces?: Piece[]) {
    if (Array.isArray(dataOrNodes)) {
      this.data = null;
      this.nodes = dataOrNodes;
      this.engagementZoneNodeIds = this.buildEngagementZoneNodeIds();
      this.engagementZoneNodeSet = new Set(this.engagementZoneNodeIds);
      if (initialPieces) {
        this.addPieces(initialPieces);
      }
      return;
    }
    this.data = dataOrNodes;
    this.nodes = dataOrNodes.nodes;
    this.engagementZoneNodeIds = this.buildEngagementZoneNodeIds();
    this.engagementZoneNodeSet = new Set(this.engagementZoneNodeIds);
    if (initialPieces) {
      this.addPieces(initialPieces);
    } else {
      this.initializePiecesFromUnityLayout();
    }
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

  public getEngagementZoneNodeIds(): string[] {
    return [...this.engagementZoneNodeIds];
  }

  public isNodeInEngagementZone(nodeId: string): boolean {
    return this.engagementZoneNodeSet.has(nodeId);
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

  public loadTrainingPosition(pieces: Piece[]): void {
    this.pieces.clear();
    this.pieceByNode.clear();
    this.selectedPieceId = null;
    this.addPieces(
      pieces
        .map((piece) => {
          const resolvedNodeId = this.resolveNodeId(piece.nodeId);
          if (!resolvedNodeId) return null;
          return { ...piece, nodeId: resolvedNodeId };
        })
        .filter((piece): piece is Piece => piece !== null)
    );
  }

  public resolveNodeId(nodeId: string): string | null {
    if (this.getNodeById(nodeId)) {
      return nodeId;
    }

    const index = Number(nodeId);
    if (!Number.isInteger(index)) {
      return null;
    }

    const exact = this.nodes[index];
    if (exact) {
      return exact.id;
    }

    const oneBased = this.nodes[index - 1];
    if (oneBased) {
      return oneBased.id;
    }

    return null;
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
      return { legalMoves: [], restrictedNodeIds: [], mode: "movement" };
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
    const mode = this.getInteractionModeForNode(piece.nodeId);
    if (!this.data) return { legalMoves: [], restrictedNodeIds: [], mode };
    const raySet = this.getRaySetForPiece(piece.type);
    const maxDistance = this.getMaxDistanceForPiece(piece.type);
    const hitsPerDirection = this.getHitCountLimit(piece.type);

    const nodeRays = this.data.raysByNode[piece.nodeId];
    if (!nodeRays) return { legalMoves: [], restrictedNodeIds: [], mode };

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
      restrictedNodeIds: Array.from(new Set(restrictedNodeIds)),
      mode
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
    const fromNode = this.getNodeById(piece.nodeId);
    const targetNode = this.getNodeById(targetNodeId);
    if (!fromNode || !targetNode) {
      return false;
    }
    if (!this.isNodeInEngagementZone(fromNode.id) || !this.isNodeInEngagementZone(targetNode.id)) {
      return false;
    }
    return this.getAreaType(fromNode) === this.getAreaType(targetNode);
  }

  private getInteractionModeForNode(nodeId: string): InteractionMode {
    return this.isNodeInEngagementZone(nodeId) ? "combat" : "movement";
  }

  private getAreaType(node: NodeData): "colored" | "colorless" {
    return node.isColored === 0 ? "colorless" : "colored";
  }

  private buildEngagementZoneNodeIds(): string[] {
    if (this.nodes.length === 0) {
      return [];
    }

    const edgeLength = this.estimateEdgeLength();
    const adjacency = this.buildAdjacency(edgeLength);
    const seedNodeIds = this.findCenterSeedNodeIds(edgeLength);
    if (seedNodeIds.length === 0) {
      return [];
    }

    const visited = new Set<string>(seedNodeIds);
    const queue = seedNodeIds.map((id) => ({ id, depth: 0 }));

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (current.depth >= ENGAGEMENT_ZONE_DEPTH) {
        continue;
      }

      for (const neighborId of adjacency.get(current.id) ?? []) {
        if (visited.has(neighborId)) {
          continue;
        }
        visited.add(neighborId);
        queue.push({ id: neighborId, depth: current.depth + 1 });
      }
    }

    return this.nodes.filter((node) => visited.has(node.id)).map((node) => node.id);
  }

  private estimateEdgeLength(): number {
    const nearestDistances: number[] = [];

    for (let index = 0; index < this.nodes.length; index += 1) {
      const source = this.nodes[index];
      let nearest = Number.POSITIVE_INFINITY;
      for (let otherIndex = 0; otherIndex < this.nodes.length; otherIndex += 1) {
        if (index === otherIndex) {
          continue;
        }
        const target = this.nodes[otherIndex];
        const distance = Math.hypot(target.x - source.x, target.z - source.z);
        if (distance < nearest) {
          nearest = distance;
        }
      }
      if (Number.isFinite(nearest)) {
        nearestDistances.push(nearest);
      }
    }

    if (nearestDistances.length === 0) {
      return 0;
    }

    nearestDistances.sort((left, right) => left - right);
    return nearestDistances[Math.floor(nearestDistances.length / 2)];
  }

  private buildAdjacency(edgeLength: number): Map<string, string[]> {
    const adjacency = new Map<string, string[]>();
    for (const node of this.nodes) {
      adjacency.set(node.id, []);
    }
    if (edgeLength <= 0) {
      return adjacency;
    }

    const tolerance = Math.max(edgeLength * 0.06, 0.08);
    for (let index = 0; index < this.nodes.length; index += 1) {
      const source = this.nodes[index];
      for (let otherIndex = index + 1; otherIndex < this.nodes.length; otherIndex += 1) {
        const target = this.nodes[otherIndex];
        const distance = Math.hypot(target.x - source.x, target.z - source.z);
        if (Math.abs(distance - edgeLength) > tolerance) {
          continue;
        }
        adjacency.get(source.id)?.push(target.id);
        adjacency.get(target.id)?.push(source.id);
      }
    }

    return adjacency;
  }

  private findCenterSeedNodeIds(edgeLength: number): string[] {
    let minRadius = Number.POSITIVE_INFINITY;
    for (const node of this.nodes) {
      const radius = Math.hypot(node.x, node.z);
      if (radius < minRadius) {
        minRadius = radius;
      }
    }

    if (!Number.isFinite(minRadius)) {
      return [];
    }

    const tolerance = Math.max(edgeLength * 0.12, 0.16);
    return this.nodes
      .filter((node) => Math.hypot(node.x, node.z) <= minRadius + tolerance)
      .map((node) => node.id);
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
