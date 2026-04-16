import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, '../public/models');

// Ensure models directory exists
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log(`✓ Created ${modelsDir}`);
}

/**
 * Custom GLB builder - creates simple but valid GLB files
 */
class GLBWriter {
  static writeGLB(group, filepath) {
    const glbData = this.buildGLB(group);
    fs.writeFileSync(filepath, glbData);
  }

  static buildGLB(group) {
    // Collect all meshes
    const meshes = [];
    group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    if (meshes.length === 0) {
      throw new Error('No meshes found in group');
    }

    // Build buffer data
    const positionBuffers = [];
    const indexBuffers = [];
    let totalPositionBytes = 0;
    let totalIndexBytes = 0;

    meshes.forEach(mesh => {
      const positions = mesh.geometry.getAttribute('position');
      if (positions) {
        const posData = Buffer.from(new Float32Array(positions.array).buffer);
        positionBuffers.push(posData);
        totalPositionBytes += posData.length;
      }

      const indices = mesh.geometry.getIndex();
      if (indices) {
        const idxData = Buffer.from(new Uint32Array(indices.array).buffer);
        indexBuffers.push(idxData);
        totalIndexBytes += idxData.length;
      }
    });

    const binaryBuffer = Buffer.concat([...positionBuffers, ...indexBuffers]);

    // Create glTF JSON
    const gltfJSON = {
      asset: { version: '2.0', generator: 'ProChess GLB Generator' },
      scene: 0,
      scenes: [{ nodes: Array.from({length: meshes.length}, (_, i) => i) }],
      nodes: meshes.map((mesh, i) => ({
        mesh: i,
        translation: [mesh.position.x, mesh.position.y, mesh.position.z],
        rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w],
        scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z]
      })),
      meshes: meshes.map((mesh, i) => {
        const positions = mesh.geometry.getAttribute('position');
        const indices = mesh.geometry.getIndex();
        const primitive = {
          attributes: { POSITION: i * 2 },
          material: 0
        };
        if (indices) {
          primitive.indices = i * 2 + 1;
        }
        return { primitives: [primitive] };
      }),
      materials: [{
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.8, 0.8, 1.0],
          metallicFactor: 0.5,
          roughnessFactor: 0.5
        }
      }],
      accessors: meshes.flatMap((mesh, i) => {
        const positions = mesh.geometry.getAttribute('position');
        const indices = mesh.geometry.getIndex();
        const result = [{
          bufferView: i * 2,
          componentType: 5126,
          count: positions.count,
          type: 'VEC3'
        }];
        if (indices) {
          result.push({
            bufferView: i * 2 + 1,
            componentType: 5125,
            count: indices.count,
            type: 'SCALAR'
          });
        }
        return result;
      }),
      bufferViews: Array.from({length: meshes.length * 2}, (_, i) => ({
        buffer: 0,
        byteOffset: i * (totalPositionBytes + totalIndexBytes) / (meshes.length * 2),
        byteLength: i % 2 === 0 ? totalPositionBytes / meshes.length : totalIndexBytes / meshes.length
      })),
      buffers: [{ byteLength: binaryBuffer.length }]
    };

    const jsonStr = JSON.stringify(gltfJSON);
    const jsonBuffer = Buffer.from(jsonStr);
    
    // Pad JSON to 4-byte boundary
    const jsonPadded = Buffer.alloc(Math.ceil(jsonBuffer.length / 4) * 4);
    jsonBuffer.copy(jsonPadded);

    // GLB header
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0); // magic 'glTF'
    header.writeUInt32LE(2, 4); // version
    header.writeUInt32LE(28 + jsonPadded.length + binaryBuffer.length, 8);

    // JSON chunk header
    const jsonChunk = Buffer.alloc(8);
    jsonChunk.writeUInt32LE(jsonPadded.length, 0);
    jsonChunk.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

    // BIN chunk header
    const binChunk = Buffer.alloc(8);
    binChunk.writeUInt32LE(binaryBuffer.length, 0);
    binChunk.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

    return Buffer.concat([header, jsonChunk, jsonPadded, binChunk, binaryBuffer]);
  }
}

/**
 * Create Warrior piece - Soldiers with armor and shield
 */
function createWarrior() {
  const group = new THREE.Group();
  
  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Armor/Body
  const bodyGeom = new THREE.CylinderGeometry(0.35, 0.32, 1.0, 16);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.4, metalness: 0.8 });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.y = 0.6;
  group.add(bodyMesh);

  // Head
  const headGeom = new THREE.SphereGeometry(0.25, 16, 16);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0ad8e, roughness: 0.6 });
  const headMesh = new THREE.Mesh(headGeom, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 1.35;
  group.add(headMesh);

  // Helmet
  const helmetGeom = new THREE.ConeGeometry(0.28, 0.45, 16);
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.5, metalness: 0.9 });
  const helmetMesh = new THREE.Mesh(helmetGeom, helmetMat);
  helmetMesh.castShadow = true;
  helmetMesh.receiveShadow = true;
  helmetMesh.position.y = 1.62;
  group.add(helmetMesh);

  // Shield (left side)
  const shieldGeom = new THREE.BoxGeometry(0.25, 0.6, 0.1);
  const shieldMesh = new THREE.Mesh(shieldGeom, bodyMat);
  shieldMesh.castShadow = true;
  shieldMesh.receiveShadow = true;
  shieldMesh.position.set(-0.45, 0.6, 0);
  group.add(shieldMesh);

  // Sword (right side)
  const swordGeom = new THREE.BoxGeometry(0.08, 1.0, 0.08);
  const swordMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.95 });
  const swordMesh = new THREE.Mesh(swordGeom, swordMat);
  swordMesh.castShadow = true;
  swordMesh.receiveShadow = true;
  swordMesh.position.set(0.5, 0.85, 0);
  swordMesh.rotation.z = 0.3;
  group.add(swordMesh);

  group.scale.set(1.2, 1.2, 1.2);
  return group;
}

/**
 * Create King piece - Tall with crown and robe
 */
function createKing() {
  const group = new THREE.Group();

  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Robe (large cylinder)
  const robeGeom = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 16);
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x8b008b, roughness: 0.5 });
  const robeMesh = new THREE.Mesh(robeGeom, robeMat);
  robeMesh.castShadow = true;
  robeMesh.receiveShadow = true;
  robeMesh.position.y = 0.65;
  group.add(robeMesh);

  // Head
  const headGeom = new THREE.SphereGeometry(0.28, 16, 16);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0ad8e, roughness: 0.6 });
  const headMesh = new THREE.Mesh(headGeom, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 1.5;
  group.add(headMesh);

  // Crown - base ring
  const crownBaseGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.15, 16);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.15, metalness: 0.95 });
  const crownBaseMesh = new THREE.Mesh(crownBaseGeom, crownMat);
  crownBaseMesh.castShadow = true;
  crownBaseMesh.receiveShadow = true;
  crownBaseMesh.position.y = 1.75;
  group.add(crownBaseMesh);

  // Crown - top cone
  const crownTopGeom = new THREE.ConeGeometry(0.35, 0.6, 16);
  const crownTopMesh = new THREE.Mesh(crownTopGeom, crownMat);
  crownTopMesh.castShadow = true;
  crownTopMesh.receiveShadow = true;
  crownTopMesh.position.y = 2.15;
  group.add(crownTopMesh);

  // Crown cross - vertical
  const crossVGeom = new THREE.BoxGeometry(0.1, 0.7, 0.1);
  const crossVMesh = new THREE.Mesh(crossVGeom, crownMat);
  crossVMesh.castShadow = true;
  crossVMesh.receiveShadow = true;
  crossVMesh.position.y = 2.25;
  group.add(crossVMesh);

  // Crown cross - horizontal
  const crossHGeom = new THREE.BoxGeometry(0.35, 0.1, 0.1);
  const crossHMesh = new THREE.Mesh(crossHGeom, crownMat);
  crossHMesh.castShadow = true;
  crossHMesh.receiveShadow = true;
  crossHMesh.position.y = 2.1;
  group.add(crossHMesh);

  // Orb (sphere on top of cross)
  const orbGeom = new THREE.SphereGeometry(0.15, 12, 12);
  const orbMesh = new THREE.Mesh(orbGeom, crownMat);
  orbMesh.castShadow = true;
  orbMesh.receiveShadow = true;
  orbMesh.position.y = 2.6;
  group.add(orbMesh);

  group.scale.set(1.1, 1.15, 1.1);
  return group;
}

/**
 * Create Vizier piece - Wise advisor with turban
 */
function createVizier() {
  const group = new THREE.Group();

  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Robe (cone shape)
  const robeGeom = new THREE.ConeGeometry(0.42, 1.05, 16);
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.5 });
  const robeMesh = new THREE.Mesh(robeGeom, robeMat);
  robeMesh.castShadow = true;
  robeMesh.receiveShadow = true;
  robeMesh.position.y = 0.65;
  group.add(robeMesh);

  // Head
  const headGeom = new THREE.SphereGeometry(0.26, 16, 16);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0ad8e, roughness: 0.6 });
  const headMesh = new THREE.Mesh(headGeom, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 1.4;
  group.add(headMesh);

  // Turban - wrapped around head
  const turbanGeom = new THREE.CylinderGeometry(0.3, 0.32, 0.4, 16);
  const turbanMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, roughness: 0.4 });
  const turbanMesh = new THREE.Mesh(turbanGeom, turbanMat);
  turbanMesh.castShadow = true;
  turbanMesh.receiveShadow = true;
  turbanMesh.position.y = 1.55;
  group.add(turbanMesh);

  // Turban top - peaked cone
  const turbanTopGeom = new THREE.ConeGeometry(0.28, 0.5, 16);
  const turbanTopMesh = new THREE.Mesh(turbanTopGeom, turbanMat);
  turbanTopMesh.castShadow = true;
  turbanTopMesh.receiveShadow = true;
  turbanTopMesh.position.y = 1.95;
  turbanTopMesh.rotation.x = 0.3;
  group.add(turbanTopMesh);

  // Gem on turban (front)
  const gemGeom = new THREE.SphereGeometry(0.12, 16, 16);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0xff1493, roughness: 0.1, metalness: 0.8 });
  const gemMesh = new THREE.Mesh(gemGeom, gemMat);
  gemMesh.castShadow = true;
  gemMesh.receiveShadow = true;
  gemMesh.position.set(0, 1.45, 0.35);
  group.add(gemMesh);

  group.scale.set(1.0, 1.1, 1.0);
  return group;
}

/**
 * Create Castle/Rook piece - Tower structure
 */
function createCastle() {
  const group = new THREE.Group();

  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Main tower
  const towerGeom = new THREE.CylinderGeometry(0.38, 0.38, 1.3, 16);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.8 });
  const towerMesh = new THREE.Mesh(towerGeom, stoneMat);
  towerMesh.castShadow = true;
  towerMesh.receiveShadow = true;
  towerMesh.position.y = 0.75;
  group.add(towerMesh);

  // Battlements (top teeth of castle)
  const battlementMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.75 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const battlGeom = new THREE.BoxGeometry(0.18, 0.35, 0.18);
    const battlMesh = new THREE.Mesh(battlGeom, battlementMat);
    battlMesh.castShadow = true;
    battlMesh.receiveShadow = true;
    battlMesh.position.set(
      Math.cos(angle) * 0.4,
      1.75,
      Math.sin(angle) * 0.4
    );
    group.add(battlMesh);
  }

  // Flag pole on top
  const flagPoleGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9 });
  const flagPoleMesh = new THREE.Mesh(flagPoleGeom, poleMat);
  flagPoleMesh.castShadow = true;
  flagPoleMesh.receiveShadow = true;
  flagPoleMesh.position.y = 2.25;
  group.add(flagPoleMesh);

  // Flag
  const flagGeom = new THREE.BoxGeometry(0.3, 0.25, 0.05);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xff4500, roughness: 0.4 });
  const flagMesh = new THREE.Mesh(flagGeom, flagMat);
  flagMesh.castShadow = true;
  flagMesh.receiveShadow = true;
  flagMesh.position.set(0.2, 2.45, 0);
  group.add(flagMesh);

  group.scale.set(1.0, 1.05, 1.0);
  return group;
}

/**
 * Create Officer piece - Knight with armor
 */
function createOfficer() {
  const group = new THREE.Group();

  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Chest plate
  const chestGeom = new THREE.BoxGeometry(0.4, 0.6, 0.25);
  const armorMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.4, metalness: 0.85 });
  const chestMesh = new THREE.Mesh(chestGeom, armorMat);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  chestMesh.position.y = 0.6;
  group.add(chestMesh);

  // Head - helmet shape
  const headGeom = new THREE.BoxGeometry(0.35, 0.4, 0.3);
  const headMesh = new THREE.Mesh(headGeom, armorMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 1.35;
  group.add(headMesh);

  // Helmet crest (front)
  const crestGeom = new THREE.ConeGeometry(0.22, 0.5, 16);
  const crestMesh = new THREE.Mesh(crestGeom, armorMat);
  crestMesh.castShadow = true;
  crestMesh.receiveShadow = true;
  crestMesh.position.set(0, 1.65, 0.25);
  group.add(crestMesh);

  // Left arm with spear
  const armGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12);
  const armMesh = new THREE.Mesh(armGeom, armorMat);
  armMesh.castShadow = true;
  armMesh.receiveShadow = true;
  armMesh.position.set(-0.35, 0.85, 0);
  armMesh.rotation.z = 0.4;
  group.add(armMesh);

  // Spear tip
  const spearTipGeom = new THREE.ConeGeometry(0.1, 0.35, 12);
  const spearTipMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9 });
  const spearTipMesh = new THREE.Mesh(spearTipGeom, spearTipMat);
  spearTipMesh.castShadow = true;
  spearTipMesh.receiveShadow = true;
  spearTipMesh.position.set(-0.62, 1.25, 0);
  spearTipMesh.rotation.z = 0.4;
  group.add(spearTipMesh);

  group.scale.set(1.05, 1.12, 1.05);
  return group;
}

/**
 * Create Princess/Horse piece - Elegant character
 */
function createPrincess() {
  const group = new THREE.Group();

  // Base stand
  const baseGeom = new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  baseMesh.position.y = 0.1;
  group.add(baseMesh);

  // Gown (cone shape)
  const gownGeom = new THREE.ConeGeometry(0.45, 1.15, 16);
  const gownMat = new THREE.MeshStandardMaterial({ color: 0xff69b4, roughness: 0.45 });
  const gownMesh = new THREE.Mesh(gownGeom, gownMat);
  gownMesh.castShadow = true;
  gownMesh.receiveShadow = true;
  gownMesh.position.y = 0.65;
  group.add(gownMesh);

  // Corset
  const corsetGeom = new THREE.CylinderGeometry(0.32, 0.34, 0.5, 16);
  const corsetMat = new THREE.MeshStandardMaterial({ color: 0xff1493, roughness: 0.5 });
  const corsetMesh = new THREE.Mesh(corsetGeom, corsetMat);
  corsetMesh.castShadow = true;
  corsetMesh.receiveShadow = true;
  corsetMesh.position.y = 0.55;
  group.add(corsetMesh);

  // Head
  const headGeom = new THREE.SphereGeometry(0.26, 16, 16);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0ad8e, roughness: 0.6 });
  const headMesh = new THREE.Mesh(headGeom, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.position.y = 1.45;
  group.add(headMesh);

  // Tiara
  const tiaraGeom = new THREE.TorusGeometry(0.3, 0.08, 12, 32);
  const tiaraMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.15, metalness: 0.95 });
  const tiaraMesh = new THREE.Mesh(tiaraGeom, tiaraMat);
  tiaraMesh.castShadow = true;
  tiaraMesh.receiveShadow = true;
  tiaraMesh.position.y = 1.72;
  tiaraMesh.rotation.x = 0.3;
  group.add(tiaraMesh);

  // Crown jewel on tiara
  const jewelGeom = new THREE.SphereGeometry(0.12, 12, 12);
  const jewelMat = new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.1, metalness: 0.8 });
  const jewelMesh = new THREE.Mesh(jewelGeom, jewelMat);
  jewelMesh.castShadow = true;
  jewelMesh.receiveShadow = true;
  jewelMesh.position.y = 1.85;
  group.add(jewelMesh);

  group.scale.set(1.0, 1.08, 1.0);
  return group;
}

/**
 * Main execution
 */
async function generateAllModels() {
  console.log('🎲 Generating chess piece models...\n');

  try {
    console.log('Warrior piece...');
    GLBWriter.writeGLB(createWarrior(), path.join(modelsDir, 'warrior.glb'));
    console.log(`  ✓ Exported warrior.glb`);

    console.log('King piece...');
    GLBWriter.writeGLB(createKing(), path.join(modelsDir, 'king.glb'));
    console.log(`  ✓ Exported king.glb`);

    console.log('Vizier piece...');
    GLBWriter.writeGLB(createVizier(), path.join(modelsDir, 'vizier.glb'));
    console.log(`  ✓ Exported vizier.glb`);

    console.log('Castle piece...');
    GLBWriter.writeGLB(createCastle(), path.join(modelsDir, 'castle.glb'));
    console.log(`  ✓ Exported castle.glb`);

    console.log('Officer piece...');
    GLBWriter.writeGLB(createOfficer(), path.join(modelsDir, 'officer.glb'));
    console.log(`  ✓ Exported officer.glb`);

    console.log('Princess piece...');
    GLBWriter.writeGLB(createPrincess(), path.join(modelsDir, 'princess.glb'));
    console.log(`  ✓ Exported princess.glb`);

    console.log('\n✅ All models generated successfully!');
    console.log(`   Location: ${modelsDir}`);
    console.log('\nTo use in your game:');
    console.log('  1. Run: npm run dev');
    console.log('  2. Open your game and pieces should load automatically');
  } catch (error) {
    console.error('❌ Error generating models:', error);
    process.exit(1);
  }
}

generateAllModels();
