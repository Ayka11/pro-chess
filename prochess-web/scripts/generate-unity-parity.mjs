import fs from "node:fs";
import path from "node:path";

const BOARD_SCRIPT_GUID = "275ddb520be7ba646a3af7593b56a402";
const RAYCASTER_SCRIPT_GUID = "c822764435d134e4f8fff7fa2217b63e";
const RADIUS = 1.3;
const EPSILON = 1e-4;

function parsePrefabDocuments(content) {
  const lines = content.split(/\r?\n/);
  const docs = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i].match(/^--- !u!(\d+) &([-\d]+)$/);
    if (!header) {
      i += 1;
      continue;
    }
    const type = Number(header[1]);
    const id = header[2];
    i += 1;
    const start = i;
    while (i < lines.length && !lines[i].startsWith("--- !u!")) {
      i += 1;
    }
    docs.push({ type, id, lines: lines.slice(start, i) });
  }
  return docs;
}

function parseVector3(line) {
  const m = line.match(/\{x: ([^,]+), y: ([^,]+), z: ([^}]+)\}/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) };
}

function parseQuaternion(line) {
  const m = line.match(/\{x: ([^,]+), y: ([^,]+), z: ([^,]+), w: ([^}]+)\}/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), w: Number(m[4]) };
}

function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

function quatConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function quatRotate(q, v) {
  const p = { x: v.x, y: v.y, z: v.z, w: 0 };
  const qr = quatMul(quatMul(q, p), quatConjugate(q));
  return { x: qr.x, y: qr.y, z: qr.z };
}

function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecLen(v) {
  return Math.sqrt(vecDot(v, v));
}

function vecNorm(v) {
  const len = vecLen(v);
  if (len < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function parseGameBoard(prefabPath) {
  const docs = parsePrefabDocuments(fs.readFileSync(prefabPath, "utf8"));

  const gameObjects = new Map();
  const transforms = new Map();
  const boardMono = new Map();
  const colliders = new Map();

  for (const doc of docs) {
    if (doc.type === 1) {
      const nameLine = doc.lines.find((l) => l.startsWith("  m_Name: "));
      if (nameLine) {
        gameObjects.set(doc.id, nameLine.slice("  m_Name: ".length));
      }
    } else if (doc.type === 4) {
      let gameObject = null;
      let localPosition = null;
      let localRotation = null;
      let father = "0";
      for (const line of doc.lines) {
        if (line.startsWith("  m_GameObject: ")) {
          gameObject = line.match(/\{fileID: ([^}]+)\}/)?.[1] ?? null;
        } else if (line.startsWith("  m_LocalPosition: ")) {
          localPosition = parseVector3(line);
        } else if (line.startsWith("  m_LocalRotation: ")) {
          localRotation = parseQuaternion(line);
        } else if (line.startsWith("  m_Father: ")) {
          father = line.match(/\{fileID: ([^}]+)\}/)?.[1] ?? "0";
        }
      }
      if (gameObject && localPosition && localRotation) {
        transforms.set(doc.id, { gameObject, localPosition, localRotation, father });
      }
    } else if (doc.type === 114) {
      const scriptLine = doc.lines.find((l) => l.startsWith("  m_Script: "));
      const scriptGuid = scriptLine?.match(/guid: ([a-f0-9]+)/)?.[1];
      if (scriptGuid === BOARD_SCRIPT_GUID) {
        const go = doc.lines
          .find((l) => l.startsWith("  m_GameObject: "))
          ?.match(/\{fileID: ([^}]+)\}/)?.[1];
        const eColor = Number(
          doc.lines.find((l) => l.startsWith("  eColor: "))?.split(": ")[1] ?? -1
        );
        const isColored = Number(
          doc.lines.find((l) => l.startsWith("  isColored: "))?.split(": ")[1] ?? 0
        );
        const eBoardCaseType = Number(
          doc.lines.find((l) => l.startsWith("  eBoardCaseType: "))?.split(": ")[1] ?? 0
        );
        if (go) {
          boardMono.set(go, { eColor, isColored, eBoardCaseType });
        }
      }
    } else if (doc.type === 135) {
      const go = doc.lines
        .find((l) => l.startsWith("  m_GameObject: "))
        ?.match(/\{fileID: ([^}]+)\}/)?.[1];
      const centerLine = doc.lines.find((l) => l.startsWith("  m_Center: "));
      const center = centerLine ? parseVector3(centerLine) : null;
      if (go && center) {
        colliders.set(go, center);
      }
    }
  }

  const goToTransform = new Map();
  for (const [tId, t] of transforms.entries()) {
    goToTransform.set(t.gameObject, tId);
  }

  const worldCache = new Map();
  function computeWorld(transformId) {
    if (worldCache.has(transformId)) {
      return worldCache.get(transformId);
    }
    const t = transforms.get(transformId);
    if (!t) throw new Error(`Missing transform ${transformId}`);
    let result;
    if (!t.father || t.father === "0") {
      result = {
        pos: t.localPosition,
        rot: t.localRotation
      };
    } else {
      const parent = computeWorld(t.father);
      result = {
        pos: vecAdd(parent.pos, quatRotate(parent.rot, t.localPosition)),
        rot: quatMul(parent.rot, t.localRotation)
      };
    }
    worldCache.set(transformId, result);
    return result;
  }

  const nodes = [];
  for (const [goId, meta] of boardMono.entries()) {
    const tId = goToTransform.get(goId);
    if (!tId) continue;
    const tWorld = computeWorld(tId);
    const col = colliders.get(goId) ?? { x: 0, y: 0, z: 0 };
    const sphereCenter = vecAdd(tWorld.pos, quatRotate(tWorld.rot, col));
    nodes.push({
      id: goId,
      name: gameObjects.get(goId) ?? "",
      position: tWorld.pos,
      rotation: tWorld.rot,
      sphereCenter,
      eColor: meta.eColor,
      isColored: meta.isColored,
      eBoardCaseType: meta.eBoardCaseType
    });
  }

  return nodes;
}

function parseRaycasterTemplate(prefabPath) {
  const docs = parsePrefabDocuments(fs.readFileSync(prefabPath, "utf8"));
  const transformRot = new Map();
  const transformGo = new Map();
  const goName = new Map();
  let sets = null;

  for (const doc of docs) {
    if (doc.type === 1) {
      const nameLine = doc.lines.find((l) => l.startsWith("  m_Name: "));
      if (nameLine) {
        goName.set(doc.id, nameLine.slice("  m_Name: ".length));
      }
    } else if (doc.type === 4) {
      const go = doc.lines
        .find((l) => l.startsWith("  m_GameObject: "))
        ?.match(/\{fileID: ([^}]+)\}/)?.[1];
      const rotLine = doc.lines.find((l) => l.startsWith("  m_LocalRotation: "));
      const rot = rotLine ? parseQuaternion(rotLine) : null;
      if (go && rot) {
        transformGo.set(doc.id, go);
        transformRot.set(doc.id, rot);
      }
    } else if (doc.type === 114) {
      const scriptLine = doc.lines.find((l) => l.startsWith("  m_Script: "));
      const scriptGuid = scriptLine?.match(/guid: ([a-f0-9]+)/)?.[1];
      if (scriptGuid === RAYCASTER_SCRIPT_GUID) {
        const readSet = (key) => {
          const idx = doc.lines.findIndex((l) => l.trim() === `${key}:`);
          if (idx < 0) return [];
          const ids = [];
          for (let i = idx + 1; i < doc.lines.length; i += 1) {
            const line = doc.lines[i];
            if (!line.startsWith("  - ")) break;
            const id = line.match(/\{fileID: ([^}]+)\}/)?.[1];
            if (id) ids.push(id);
          }
          return ids;
        };
        sets = {
          warrior: readSet("WarriorsRayDirection"),
          vizierKingHorse: readSet("VizierKingHorseRayDirection"),
          castle: readSet("CastleRayDirection"),
          officer: readSet("OfficerRayDirection")
        };
      }
    }
  }

  if (!sets) {
    throw new Error("Could not parse raycaster sets.");
  }

  const localDirections = {};
  for (const ids of Object.values(sets)) {
    for (const id of ids) {
      if (localDirections[id]) continue;
      const go = transformGo.get(id);
      const name = go ? goName.get(go) ?? id : id;
      const rot = transformRot.get(id);
      if (!rot) continue;
      localDirections[id] = {
        id,
        name,
        rot
      };
    }
  }

  return { sets, localDirections };
}

function raySphereHit(origin, dir, center, radius) {
  const oc = vecSub(origin, center);
  const b = vecDot(oc, dir);
  const c = vecDot(oc, oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = -b - root;
  const t2 = -b + root;
  if (t1 > EPSILON) return t1;
  if (t2 > EPSILON) return t2;
  return null;
}

function buildTopology(nodes, rayTemplate) {
  const raysByNode = {};
  for (const node of nodes) {
    const nodeRays = {};
    for (const [dirId, dirDef] of Object.entries(rayTemplate.localDirections)) {
      const dirWorld = vecNorm(
        quatRotate(quatMul(node.rotation, dirDef.rot), { x: 0, y: 0, z: 1 })
      );
      const hits = [];
      for (const target of nodes) {
        if (target.id === node.id) continue;
        const t = raySphereHit(node.sphereCenter, dirWorld, target.sphereCenter, RADIUS);
        if (t === null) continue;
        hits.push({ id: target.id, distance: t });
      }
      hits.sort((a, b) => a.distance - b.distance);
      nodeRays[dirId] = hits;
    }
    raysByNode[node.id] = nodeRays;
  }

  return {
    sets: rayTemplate.sets,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      x: n.position.x,
      z: n.position.z,
      eColor: n.eColor,
      isColored: n.isColored,
      eBoardCaseType: n.eBoardCaseType
    })),
    raysByNode
  };
}

function main() {
  const webRoot = process.cwd();
  const unityRoot = path.resolve(
    webRoot,
    "..",
    "Unity 2021.3.2f1 project",
    "GameBoard - yayayay3"
  );

  const boardPath = path.join(unityRoot, "Assets", "Resources", "Prefabs", "GameBoard.prefab");
  const rayPath = path.join(
    unityRoot,
    "Assets",
    "Resources",
    "Prefabs",
    "RaycasterGroup.prefab"
  );

  if (!fs.existsSync(boardPath) || !fs.existsSync(rayPath)) {
    throw new Error("Unity prefab files were not found. Run this script from prochess-web.");
  }

  const nodes = parseGameBoard(boardPath);
  const rayTemplate = parseRaycasterTemplate(rayPath);
  const topology = buildTopology(nodes, rayTemplate);

  const outPath = path.join(webRoot, "src", "game", "unityParityData.json");
  fs.writeFileSync(outPath, JSON.stringify(topology, null, 2));
  console.log(`Wrote ${topology.nodes.length} nodes to ${outPath}`);
}

main();
