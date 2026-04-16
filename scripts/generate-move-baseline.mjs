import fs from "node:fs";
import path from "node:path";
import parity from "../src/game/unityParityData.json" with { type: "json" };

const typeByEnum = {
  1: "king",
  2: "vizier",
  3: "castle",
  4: "officer",
  5: "horse",
  6: "warrior"
};

const pieceAt = new Map();
for (const node of parity.nodes) {
  if (node.eBoardCaseType > 0) {
    pieceAt.set(node.id, `piece-${node.id}`);
  }
}

function getSet(type) {
  if (type === "castle") return parity.sets.castle;
  if (type === "officer") return parity.sets.officer;
  if (type === "warrior") return parity.sets.warrior;
  return parity.sets.vizierKingHorse;
}

function maxDistance(type) {
  if (type === "horse") return 30;
  if (type === "king" || type === "warrior") return 10;
  return 100;
}

const baseline = {};

for (const node of parity.nodes) {
  if (node.eBoardCaseType <= 0) continue;
  const type = typeByEnum[node.eBoardCaseType];
  const moves = new Set();
  const rays = parity.raysByNode[node.id];
  const set = getSet(type);
  const cap = maxDistance(type);

  for (const dir of set) {
    const hits = (rays[dir] ?? []).filter((h) => h.distance <= cap);
    if (type === "king" || type === "warrior") {
      const first = hits[0];
      if (first && !pieceAt.has(first.id)) moves.add(first.id);
      continue;
    }
    if (type === "horse") {
      for (let i = 0; i < hits.length && i < 3; i += 1) {
        if (!pieceAt.has(hits[i].id)) moves.add(hits[i].id);
      }
      continue;
    }
    for (const hit of hits) {
      if (pieceAt.has(hit.id)) break;
      moves.add(hit.id);
    }
  }

  baseline[`piece-${node.id}`] = Array.from(moves).sort((a, b) => a.localeCompare(b));
}

const outPath = path.resolve("src/game/moveBaseline.json");
fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2));
console.log(`Wrote ${Object.keys(baseline).length} piece move baselines to ${outPath}`);
