import { describe, expect, it } from "vitest";
import { GameState } from "./logic";
import baseline from "./moveBaseline.json";
import parity from "./unityParityData.json";
import type { ParityData } from "./parityLoader";
import type { Piece } from "./types";

const OUTSIDE_ZONE_ATTACKER = "62315823471607254";
const OUTSIDE_ZONE_CAPTURE_TARGET = "5247767319544810135";
const INSIDE_ZONE_ATTACKER = "213313211780819488";
const INSIDE_ZONE_CAPTURE_TARGET = "7475480187108796015";
const OUTSIDE_ZONE_KING_TARGET = "1932410986942928220";

function createState(pieces: Piece[]): GameState {
  return new GameState(parity as ParityData, pieces);
}

describe("GameState Unity Parity", () => {
  it("loads exact initial piece counts", () => {
    const state = new GameState(parity as ParityData);
    const pieces = state.getPieces();
    expect(pieces).toHaveLength(90);

    const counts = pieces.reduce<Record<string, number>>((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.king).toBe(6);
    expect(counts.vizier).toBe(6);
    expect(counts.castle).toBe(12);
    expect(counts.officer).toBe(12);
    expect(counts.horse).toBe(12);
    expect(counts.warrior).toBe(42);
  });

  it("matches move baseline for every piece at initial state", () => {
    const state = new GameState(parity as ParityData);
    const snapshot = state.snapshotInitialMoves();
    expect(snapshot).toEqual(baseline);
  });

  it("classifies the engagement zone as the center polygon spanning the colored area", () => {
    const state = new GameState(parity as ParityData, []);

    expect(state.isNodeInEngagementZone(INSIDE_ZONE_ATTACKER)).toBe(true);
    expect(state.isNodeInEngagementZone(INSIDE_ZONE_CAPTURE_TARGET)).toBe(true);
    expect(state.isNodeInEngagementZone(OUTSIDE_ZONE_ATTACKER)).toBe(false);
    expect(state.isNodeInEngagementZone(OUTSIDE_ZONE_CAPTURE_TARGET)).toBe(false);

    const zoneNodes = state.getEngagementZoneNodeIds();
    expect(zoneNodes.length).toBe(96);
    console.log(`Engagement zone size: ${zoneNodes.length} nodes`);
  });

  it("blocks captures outside the engagement zone even on the same area type", () => {
    const state = createState([
      { id: "attacker", type: "vizier", color: "red1", nodeId: OUTSIDE_ZONE_ATTACKER },
      { id: "enemy", type: "warrior", color: "green1", nodeId: OUTSIDE_ZONE_CAPTURE_TARGET }
    ]);

    state.selectPieceAtNode(OUTSIDE_ZONE_ATTACKER);
    const preview = state.getInteractionHintsForSelected();

    expect(preview.mode).toBe("movement");
    expect(preview.legalMoves.some((move) => move.nodeId === OUTSIDE_ZONE_CAPTURE_TARGET)).toBe(false);
    expect(preview.restrictedNodeIds).toContain(OUTSIDE_ZONE_CAPTURE_TARGET);
  });

  it("keeps normal movement available outside the engagement zone", () => {
    const state = createState([
      { id: "attacker", type: "vizier", color: "red1", nodeId: OUTSIDE_ZONE_ATTACKER }
    ]);

    state.selectPieceAtNode(OUTSIDE_ZONE_ATTACKER);
    const preview = state.getInteractionHintsForSelected();

    expect(preview.mode).toBe("movement");
    expect(preview.legalMoves.length).toBeGreaterThan(0);
    expect(preview.legalMoves.some((move) => move.kind === "move")).toBe(true);
  });

  it("allows captures inside the engagement zone when area types match", () => {
    const state = createState([
      { id: "attacker", type: "vizier", color: "red1", nodeId: INSIDE_ZONE_ATTACKER },
      { id: "enemy", type: "warrior", color: "green1", nodeId: INSIDE_ZONE_CAPTURE_TARGET }
    ]);

    state.selectPieceAtNode(INSIDE_ZONE_ATTACKER);
    const preview = state.getInteractionHintsForSelected();

    expect(preview.mode).toBe("combat");
    expect(preview.legalMoves).toContainEqual({ nodeId: INSIDE_ZONE_CAPTURE_TARGET, kind: "capture" });
  });

  it("removes the king capture bypass outside the engagement zone", () => {
    const state = createState([
      { id: "king", type: "king", color: "red1", nodeId: OUTSIDE_ZONE_ATTACKER },
      { id: "enemy", type: "warrior", color: "green1", nodeId: OUTSIDE_ZONE_KING_TARGET }
    ]);

    state.selectPieceAtNode(OUTSIDE_ZONE_ATTACKER);
    const preview = state.getInteractionHintsForSelected();

    expect(preview.mode).toBe("movement");
    expect(preview.legalMoves.some((move) => move.kind === "capture")).toBe(false);
    expect(preview.restrictedNodeIds).toContain(OUTSIDE_ZONE_KING_TARGET);
  });
});
