import type { NodeData } from "./parityLoader";
import { sectorIndexFromCoords, colorIndexForSector } from "./sector";

// Starting outline from the spec: 24 rows that describe the broad fan shape. The helper below
// trims them from the edges until the total triangle count is exactly 384.
const BASE_ROW_LENGTHS = [
  16, 20, 24, 28, 32, 36, 40, 44,
  48, 48, 44, 40, 36, 32, 28, 24,
  20, 16, 12,  8,  4,  4,  4,  4
];

const MIN_ROW_LENGTH = 4;

function buildEdgeTrimOrder(count: number): number[] {
  const order: number[] = [];
  for (let offset = 0; offset < count / 2; offset += 1) {
    order.push(offset);
    order.push(count - 1 - offset);
  }
  if (count % 2 === 1) {
    order.push(Math.floor(count / 2));
  }
  return order;
}

function adjustRowLengths(base: number[], target: number): number[] {
  const lengths = [...base];
  let total = lengths.reduce((sum, len) => sum + len, 0);
  if (total <= target) {
    return lengths;
  }

  const order = buildEdgeTrimOrder(lengths.length);
  let pointer = 0;
  while (total > target) {
    const index = order[pointer % order.length];
    if (lengths[index] > MIN_ROW_LENGTH) {
      lengths[index] -= 1;
      total -= 1;
    }
    pointer += 1;
    if (pointer > 200000) {
      break;
    }
  }
  return lengths;
}

/**
 * Procedurally generates the triangular hex board used in the ProChess concept. The layout mirrors
 * the attached art by trimming the canonical row lengths down to 384 tiles, alternating triangle
 * orientations, and coloring the odd-parity triangles according to the pinwheel.
 */
export function generateHexGrid(_radius = 0, size = 1, exactCount = 384): NodeData[] {
  const rowLengths = adjustRowLengths(BASE_ROW_LENGTHS, exactCount);
  const rowCount = rowLengths.length;
  const centerRow = (rowCount - 1) / 2;
  const maxRowLen = Math.max(...rowLengths);
  const sqrt3 = Math.sqrt(3);
  const nodes: NodeData[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    const rowLen = rowLengths[row];
    const xOffset = (maxRowLen - rowLen) / 2;
    for (let col = 0; col < rowLen; col += 1) {
      const pointsUp = ((row + col) & 1) === 0;
      const isColorTriangle = !pointsUp;
      const x = (col + xOffset - maxRowLen / 2) * size;
      const z = (row - centerRow) * (size * sqrt3 / 2);
      const sectorIndex = sectorIndexFromCoords(x, z);
      const eColor = colorIndexForSector(sectorIndex);

      nodes.push({
        id: `tri-${row}-${col}`,
        name: `tri-${row}-${col}`,
        x: Number(x.toFixed(4)),
        z: Number(z.toFixed(4)),
        eColor,
        isColored: isColorTriangle ? 1 : 0,
        eBoardCaseType: 0,
        row,
        col
      });
    }
  }

  return nodes;
}
