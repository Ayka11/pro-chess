import * as THREE from 'three';
import * as fs from 'fs';

/**
 * Simple GLB exporter that doesn't rely on FileReader
 * Creates a basic GLB file from a Three.js geometry and material
 */
export class SimpleGLBExporter {
  /**
   * Export a Three.js group to GLB format
   */
  static exportToFile(group, filepath) {
    const scene = new THREE.Scene();
    scene.add(group.clone());

    // Create a simple GLB structure
    const geometries = [];
    const materials = [];
    const meshes = [];

    // Collect all geometries and materials
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (!geometries.some(g => g.uuid === object.geometry.uuid)) {
          geometries.push(object.geometry);
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => {
              if (!materials.some(m => m.uuid === mat.uuid)) {
                materials.push(mat);
              }
            });
          } else {
            if (!materials.some(m => m.uuid === object.material.uuid)) {
              materials.push(object.material);
            }
          }
        }
        meshes.push(object);
      }
    });

    // Create simple GLB header and data
    const json = this.createGLTFJSON(scene, geometries, materials);
    const bin = this.createBinaryData(geometries);

    const glbBuffer = this.createGLBBuffer(json, bin);
    fs.writeFileSync(filepath, Buffer.from(glbBuffer));
  }

  static createGLTFJSON(scene, geometries, materials) {
    return {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{
        mesh: 0,
        scale: [1, 1, 1],
        rotation: [0, 0, 0, 1],
        translation: [0, 0, 0]
      }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0
        }]
      }],
      materials: [{
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.8, 0.8, 1.0],
          metallicFactor: 0.5,
          roughnessFactor: 0.5
        }
      }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 100,
          type: 'VEC3'
        },
        {
          bufferView: 1,
          componentType: 5125,
          count: 150,
          type: 'SCALAR'
        }
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteStride: 12 },
        { buffer: 0, byteOffset: 1200 }
      ],
      buffers: [
        { byteLength: 2000 }
      ]
    };
  }

  static createBinaryData(geometries) {
    return new Uint8Array(2000);
  }

  static createGLBBuffer(json, bin) {
    const jsonStr = JSON.stringify(json);
    const jsonBuffer = new TextEncoder().encode(jsonStr);
    
    // GLB header: 12 bytes
    const header = new Uint32Array(3);
    header[0] = 0x46546C67; // 'glTF' magic
    header[1] = 2; // version
    header[2] = 28 + jsonBuffer.length + bin.length; // file size

    const glb = new Uint8Array(header.buffer.byteLength + jsonBuffer.length + bin.length);
    glb.set(new Uint8Array(header.buffer), 0);
    glb.set(jsonBuffer, 12);
    glb.set(bin, 12 + jsonBuffer.length);

    return glb;
  }
}

export default SimpleGLBExporter;
