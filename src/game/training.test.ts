import { describe, expect, it } from "vitest";
import { GameState } from "./logic";
import { getLessonCatalog, isLessonPlayable } from "./lessons";
import type { NodeData } from "./parityLoader";
import type { Piece } from "./types";
import parity from "./unityParityData.json";

function makeNode(id: string): NodeData {
  return {
    id,
    name: id,
    x: 0,
    z: 0,
    eColor: 0,
    isColored: 0,
    eBoardCaseType: 0
  };
}

describe("training helpers", () => {
  it("replaces training pieces and clears selection", () => {
    const state = GameState.fromNodes([makeNode("a"), makeNode("b"), makeNode("c")], [
      { id: "piece-a", type: "warrior", color: "red1", nodeId: "a" }
    ]);

    state.selectPieceAtNode("a");
    expect(state.getSelectedPiece()).not.toBeNull();

    const replacement: Piece[] = [
      { id: "piece-b", type: "king", color: "green1", nodeId: "b" }
    ];
    state.loadTrainingPosition(replacement);

    expect(state.getPieces()).toHaveLength(1);
    expect(state.getPieceAtNode("a")).toBeNull();
    expect(state.getPieceAtNode("b")).toMatchObject({ id: "piece-b", type: "king", color: "green1" });
    expect(state.getSelectedPiece()).toBeNull();
  });

  it("resolves numeric lesson node ids to parity node ids", () => {
    const state = new GameState(parity);
    const resolved = state.resolveNodeId("96");

    expect(resolved).toBe(parity.nodes[96].id);

    state.loadTrainingPosition([
      { id: "piece-a", type: "warrior", color: "red1", nodeId: "96" }
    ]);

    expect(state.getPieceAtNode(parity.nodes[96].id)).toMatchObject({
      id: "piece-a",
      type: "warrior",
      color: "red1"
    });
  });

  it("marks playable lessons as ready in the catalog", () => {
    const catalog = getLessonCatalog();
    const readyLesson = catalog.find((lesson) => lesson.id === "beginner-area-barrier-101");
    const zoneControlLesson = catalog.find((lesson) => lesson.id === "06-zone-control");
    const advancedLesson = catalog.find((lesson) => lesson.id === "12-sacrifice-and-breakthrough");

    expect(readyLesson?.registryId).toBe("01-area-barrier-101");
    expect(readyLesson?.status).toBe("ready");
    expect(zoneControlLesson?.status).toBe("ready");
    expect(advancedLesson?.status).toBe("ready");
    expect(catalog.every((lesson) => lesson.status === "ready")).toBe(true);
    expect(isLessonPlayable("beginner-area-barrier-101")).toBe(true);
    expect(isLessonPlayable("01-area-barrier-101")).toBe(true);
    expect(isLessonPlayable("06-zone-control")).toBe(true);
    expect(isLessonPlayable("12-sacrifice-and-breakthrough")).toBe(true);
  });

  it("keeps lesson steps aligned with the board rules", () => {
    const selectionPattern = /^(select|choose|click)/i;
    const selectionTitlePattern = /^(meet|select)/i;

    for (const lesson of getLessonCatalog()) {
      for (const step of lesson.steps) {
        const state = new GameState(parity);
        state.loadTrainingPosition(
          step.position.map((piece) => ({
            ...piece,
            nodeId: state.resolveNodeId(piece.nodeId) ?? piece.nodeId
          }))
        );

        const pieces = state.getPieces();
        const pieceNodes = new Set(pieces.map((piece) => piece.nodeId));
        const legalNodes = new Set<string>();
        for (const piece of pieces) {
          for (const move of state.getMovesForPieceId(piece.id)) {
            legalNodes.add(move.nodeId);
          }
        }

        const resolvedCorrect = step.correctMoves.map((nodeId) => state.resolveNodeId(nodeId) ?? nodeId);
        const selectionLike = selectionPattern.test(step.instruction) || selectionTitlePattern.test(step.title);

        if (selectionLike) {
          expect(resolvedCorrect.every((nodeId) => pieceNodes.has(nodeId))).toBe(true);
        } else {
          expect(resolvedCorrect.every((nodeId) => legalNodes.has(nodeId))).toBe(true);
        }
      }
    }
  });

  it("keeps lesson hints and setups distinct across the catalog", () => {
    const hintLocations = new Map<string, string[]>();
    const stepLocations = new Map<string, string[]>();

    for (const lesson of getLessonCatalog()) {
      for (const step of lesson.steps) {
        if (step.hint) {
          const locations = hintLocations.get(step.hint) ?? [];
          locations.push(`${lesson.id}#${step.stepId}`);
          hintLocations.set(step.hint, locations);
        }

        const signature = JSON.stringify({
          instruction: step.instruction,
          explanation: step.explanation,
          position: step.position,
          correctMoves: step.correctMoves,
          highlightedNodes: step.highlightedNodes
        });
        const locations = stepLocations.get(signature) ?? [];
        locations.push(`${lesson.id}#${step.stepId}`);
        stepLocations.set(signature, locations);
      }
    }

    const duplicateHints = [...hintLocations.entries()].filter(([, locations]) => locations.length > 1);
    const duplicateSteps = [...stepLocations.entries()].filter(([, locations]) => locations.length > 1);

    expect(duplicateHints, `duplicate hints: ${JSON.stringify(duplicateHints)}`).toHaveLength(0);
    expect(duplicateSteps, `duplicate lesson setups: ${JSON.stringify(duplicateSteps)}`).toHaveLength(0);
  });
});
