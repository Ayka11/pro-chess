import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PieceType } from './types';

// Map piece types to their model files
const PIECE_MODEL_PATHS: Record<PieceType, string> = {
  warrior: '/models/warrior.glb',
  king: '/models/king.glb',
  vizier: '/models/vizier.glb',
  castle: '/models/castle.glb',
  officer: '/models/officer.glb',
  horse: '/models/princess.glb', // Map "horse" to princess model
};

// Internal model cache with animations
interface CachedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class PieceManager {
  private loader: GLTFLoader;
  private modelCache: Map<PieceType, CachedModel> = new Map();
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;
  private animationClock = new THREE.Clock();
  private activeMixers: THREE.AnimationMixer[] = [];

  constructor() {
    this.loader = new GLTFLoader();
  }

  /**
   * Preload all piece models. Call once at startup.
   * Returns a promise that resolves when all models are loaded.
   */
  async preloadModels(): Promise<void> {
    if (this.isLoading && this.loadPromise) await this.loadPromise;
    if (this.modelCache.size > 0) return; // Already loaded

    this.isLoading = true;
    this.loadPromise = this._performPreload();
    await this.loadPromise;
    this.isLoading = false;
  }

  private async _performPreload(): Promise<void> {
    const promises = Object.entries(PIECE_MODEL_PATHS).map(([type, path]) =>
      this.loadModel(type as PieceType, path)
    );
    try {
      await Promise.all(promises);
      console.log('✓ All piece models preloaded successfully');
    } catch (error) {
      console.error('✗ Failed to preload piece models:', error);
      throw error;
    }
  }

  private async loadModel(type: PieceType, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          const animations = gltf.animations || [];
          
          // Clean up and optimize
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Ensure materials support shadows
              if (child.material instanceof THREE.MeshStandardMaterial) {
                child.material.side = THREE.FrontSide;
              }
            }
          });

          this.modelCache.set(type, { scene: model, animations });
          console.log(`  ✓ Loaded ${type} (${animations.length} animations)`);
          resolve();
        },
        undefined,
        (error) => {
          console.error(`✗ Failed to load model for ${type} at ${path}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Create an instance of a piece model for use in the scene.
   * Clones the cached model and applies position/rotation from node data.
   * Sets up animation mixer if animations are available.
   */
  createPieceInstance(
    type: PieceType,
    playerColor: string,
    isOnWhiteField: boolean,
    nodeWorldPos: THREE.Vector3,
    nodeRotationY?: number
  ): THREE.Group | null {
    const cachedModel = this.modelCache.get(type);
    if (!cachedModel) {
      console.warn(`No model loaded for piece type: ${type}`);
      return null;
    }

    // Clone the model for this instance
    const instance = cachedModel.scene.clone() as THREE.Group;

    // Apply position and rotation
    instance.position.copy(nodeWorldPos);
    instance.position.y = 0.64; // Keep your existing Y offset
    if (nodeRotationY !== undefined) {
      instance.rotation.y = nodeRotationY;
    }

    // Optional: Apply player color tint to materials
    instance.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // You can apply player-specific color tinting here if needed
        // For now, keep the model colors as-is
      }
    });

    // Setup animation mixer if animations exist
    let mixer: THREE.AnimationMixer | null = null;
    if (cachedModel.animations && cachedModel.animations.length > 0) {
      mixer = new THREE.AnimationMixer(instance);
      this.activeMixers.push(mixer);
    }

    // Store animation/state data
    instance.userData = {
      type,
      playerColor,
      isOnWhiteField,
      breathPhase: Math.random() * Math.PI * 2,
      baseScale: instance.scale.x,
      baseWorldY: 0.64,
      mixer,
      animations: cachedModel.animations,
      currentAction: null as THREE.AnimationAction | null,
    };

    // Prevent deep cloning issues
    instance.renderOrder = 25;

    return instance;
  }

  /**
   * Play a specific animation on a piece instance
   * @param piece The piece instance (THREE.Group with userData.mixer)
   * @param animationName Name of the animation to play (will match by substring)
   * @param loop Whether the animation should loop (default: true)
   * @param fadeTime Fade-in duration in seconds (default: 0.3)
   */
  playAnimation(
    piece: THREE.Group,
    animationName: string,
    loop: boolean = true,
    fadeTime: number = 0.3
  ): void {
    if (!piece.userData.mixer || !piece.userData.animations) {
      return;
    }

    const mixer = piece.userData.mixer as THREE.AnimationMixer;
    const animations = piece.userData.animations as THREE.AnimationClip[];

    // Find animation by name (case-insensitive substring match)
    const targetClip = animations.find((clip) =>
      clip.name.toLowerCase().includes(animationName.toLowerCase())
    );

    if (!targetClip) {
      console.warn(
        `Animation "${animationName}" not found for piece type ${piece.userData.type}. Available: ${animations.map((a) => a.name).join(', ')}`
      );
      return;
    }

    // Stop current animation and play new one
    if (piece.userData.currentAction) {
      piece.userData.currentAction.fadeOut(fadeTime);
    }

    const action = mixer.clipAction(targetClip);
    action.reset();
    action.clampWhenFinished = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.fadeIn(fadeTime);
    action.play();

    piece.userData.currentAction = action;
    piece.userData.currentAnimation = animationName;
  }

  /**
   * Update all animations (call this from your main update loop)
   * @param deltaMs Time delta in milliseconds
   */
  updateAnimations(deltaMs: number): void {
    const delta = deltaMs * 0.001; // Convert to seconds
    for (const mixer of this.activeMixers) {
      mixer.update(delta);
    }
  }

  /**
   * Stop animation on a specific piece
   */
  stopAnimation(piece: THREE.Group): void {
    if (piece.userData.currentAction) {
      piece.userData.currentAction.stop();
      piece.userData.currentAction = null;
    }
  }

  /**
   * Dispose all cached models (call on cleanup)
   */
  dispose(): void {
    // Dispose all mixers
    this.activeMixers.forEach((mixer) => mixer.uncacheRoot(mixer.getRoot()));
    this.activeMixers = [];

    // Dispose all models
    this.modelCache.forEach(({ scene }) => {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.modelCache.clear();
  }
}
