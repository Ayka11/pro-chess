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
}
