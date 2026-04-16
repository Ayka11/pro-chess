export type PieceColor =
  | "red1"
  | "green1"
  | "yellow1"
  | "red2"
  | "green2"
  | "yellow2";

export type PieceType =
  | "king"
  | "vizier"
  | "castle"
  | "officer"
  | "horse"
  | "warrior";

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  nodeId: string;
}

export interface Move {
  nodeId: string;
  kind: "move" | "capture";
}

export type InteractionMode = "movement" | "combat";

export interface InteractionPreview {
  legalMoves: Move[];
  restrictedNodeIds: string[];
  mode: InteractionMode;
}

export type PortalColor = "red" | "green" | "yellow" | "neutral";

export interface PortalState {
  id: string;
  nodeId: string;
  label?: string;
  color: PortalColor;
  active?: boolean;
  linkedNodeId?: string;
}

export type GameMode = "local" | "online" | "ai" | "tournament";

export interface TournamentState {
  mode: "bracket" | "arena" | "portal-rush";
  roundLabel: string;
  statusText: string;
  portals: PortalState[];
}
