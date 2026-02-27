import { describe, expect, it } from "vitest";
import { GameState } from "./logic";
import baseline from "./moveBaseline.json";
import parity from "./unityParityData.json";
import type { ParityData } from "./parityLoader";

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
});
