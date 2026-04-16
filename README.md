# ProChess Web (Phaser + TypeScript)

Browser-first rewrite of your Unity game into a full code workflow that runs from VS Code.

## App Overview

ProChess Web is a browser-based tactical board game built around a triangular board graph exported from the original Unity project. The app combines a Phaser HUD and menu system with a Three.js board renderer so the game can run as a desktop or mobile-friendly web experience.

The current project includes:

- A Unity-parity board layout and starting piece setup.
- A local battle flow with piece selection, move highlighting, and animated movement.
- A tournament presentation mode with a shared center portal and dedicated arena UI.
- Early online room flows for creating, joining, and starting matches.
- A visible AI duel entry point that currently reuses the battle flow while broader AI integration is being restored.

## Stack

- TypeScript
- Phaser 3
- Vite
- Vitest (parity regression tests)
- PWA-ready static app

## Run

```powershell
cd "C:\Users\User\Desktop\Projet And Test Builds\prochess-web"
npm install
npm run generate:parity
npm run generate:baseline
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`).

## Build

```powershell
npm run build
npm run preview
```

## Test

```powershell
npm run test
```

## Controls

- Main menu: click `Battle` to start.
- Select piece: click a piece node.
- Move: click a highlighted legal node.
- Camera: drag to pan, wheel to zoom.
- Mobile camera buttons: `+`, `-`, `R` (reset).
- `Home` returns to menu.

## Game Rules

ProChess does not use a standard square chessboard. Movement runs on a Unity-derived node graph made of triangular cells, and every legal move is resolved against that graph.

- Each piece occupies a named board node instead of a square.
- Selecting a piece shows only its legal destination nodes.
- A move is completed by clicking one of the highlighted nodes.
- Captures happen by moving onto an occupied legal destination.
- Movement restrictions are determined by the exported board topology and the game logic in `src/game/logic.ts`.
- The project preserves the custom piece roster from the Unity version: king, vizier, castle, officer, horse, and warrior.

At a high level, play is currently centered around positional control on the triangular board, legal-node movement, and capture resolution on the shared board graph.

## Game Modes

### Battle

The default playable mode. This starts the standard board view, loads the Unity-parity topology, places all pieces, and enables local piece movement with the main camera controls.

### Tournament

Tournament mode switches the presentation to the arena-style board and enables the shared center portal visual. The tournament menu also includes the online room actions used to create, join, and start a room-based match.

### AI Duel

AI Duel is exposed from the tournament page as a quick solo entry point. Right now it launches the battle flow with AI-facing UI text while the larger server-side AI path is still being restored.

### Online Room

The online room flow allows a player to:

- Create a room.
- Join an existing room by code.
- Start a match once a room is ready.

This flow is already connected to the socket client and server scaffolding, but the project is still in the middle of restoring the full server-authoritative online rules path.

## Mapping from Unity

- `King` -> `king`
- `Vizier` -> `vizier`
- `Castle` -> `castle`
- `Officer` -> `officer`
- `Princess` -> `princess`
- `Warrior` -> `warrior`

This rewrite keeps the named piece system and non-capturing move style from your existing scripts, and now runs against the Unity-derived board graph and initial setup.

## Exact Unity parity source

Topology + starting layout are generated from:

- `Assets/Resources/Prefabs/GameBoard.prefab`
- `Assets/Resources/Prefabs/RaycasterGroup.prefab`

Generator:

```powershell
npm run generate:parity
```

This writes `src/game/unityParityData.json`, which the game uses directly for movement rays and initial piece placement.

Move regression baseline generator:

```powershell
npm run generate:baseline
```

This writes `src/game/moveBaseline.json`, which `npm run test` checks against current move generation.

## PWA

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js`

Install prompts depend on browser rules and HTTPS (or localhost).

## Deploy

- Netlify config: `netlify.toml`
- Vercel config: `vercel.json`

## Piece Design & Animation

### Creating Custom Piece Models

Each of the six piece types (King, Vizier, Castle, Officer, Horse, Warrior) can be redesigned with custom 3D models while maintaining animation compatibility.

#### Model Requirements

- **Format**: GLB (binary glTF) - ensures portability and embedded textures/materials
- **Rigging**: Optional but recommended for animated pieces
  - If rigging: Create an Armature with named bones for skeletal animation
  - If static: Export as-is without skeleton
- **Materials**: Include PBR materials (BaseColor, Normal, Metallic, Roughness)
- **Textures**: Embed all textures in GLB to avoid external dependencies
- **Scale**: Model should be ~1 unit in height at default scale
- **Pivot Point**: Center piece at origin (0,0,0) for rotation

#### Model File Locations

Place redesigned GLB models in the `public/models/` directory with names matching piece types:
- `public/models/king.glb`
- `public/models/vizier.glb`
- `public/models/castle.glb`
- `public/models/officer.glb`
- `public/models/horse.glb`
- `public/models/warrior.glb`

The app automatically loads these models on startup and caches them for performance.

### Animation System

#### Supported Animations

The animation system uses Three.js AnimationMixer and supports:

- **Skeletal Animations**: Bone-based animations stored in the GLB file
- **Smooth Crossfading**: Animations blend together over a configurable fade time (default 0.3s)
- **Loop Control**: Animations can play once or loop continuously
- **Per-Piece Updates**: Each piece has its own animation mixer for independent control

#### Creating Animations

When modeling pieces in Blender (or your 3D tool):

1. **Create Armature**: Set up a skeleton for your piece
2. **Name Animation Actions**: Each animation needs a distinct name (e.g., "idle", "attack", "move", "die")
3. **Export as GLB**: Use glTF 2.0 export with animations included
   - Blender: Uncheck "NLA Strips", check "Animation"
   - Ensure "All Geometry" and "All Armature" are selected
4. **Embed Textures**: Export with textures embedded in GLB

#### Animation Naming Convention

Recommended animation names for consistent gameplay:

- `idle` - Default loop when piece is not selected
- `breathe` - Subtle breathing effect for idle pieces
- `select` - Play when piece is clicked/selected
- `move` - Play during movement to destination
- `attack` - Play when capturing an opponent piece
- `capture` - Play when piece is captured/removed

#### Playing Animations in Code

Animations are triggered from `src/game/pieceManager.ts`:

```typescript
// Play an animation
pieceManager.playAnimation(piece, 'move', false, 0.3);

// Parameters:
// - piece: The piece object
// - 'move': Animation name (must match GLB animation name)
// - false: Loop (true = loop continuously, false = play once)
// - 0.3: Fade-in time in seconds

// Stop current animation
pieceManager.stopAnimation(piece);

// Update animations each frame (called automatically in ThreeBoard.ts)
pieceManager.updateAnimations(deltaMs);
```

#### Animation Events Integration

For interactive animations tied to game events:

1. **Piece Selected**: `playAnimation(piece, 'select', false, 0.3)`
2. **Piece Moving**: `playAnimation(piece, 'move', false, 0.4)`
3. **Capture Triggered**: `playAnimation(attackingPiece, 'attack', false, 0.3)` + `playAnimation(capturedPiece, 'capture', false, 0.2)`
4. **Piece Removed**: Fade out with final animation

### Workflow: Adding a New Animated Piece

1. **Model in Blender**:
   - Create armature with bones
   - Animate all desired actions (idle, move, attack, etc.)
   - Each action becomes an animation in the GLB

2. **Export**:
   ```
   File > Export > glTF 2.0 (.glb)
   ✓ Animation
   ✓ All Geometry
   ✓ All Armature
   ✓ Embed All Textures
   ```

3. **Place File**:
   - Copy `piece_name.glb` to `public/models/`
   - Restart the dev server (animation loading happens at startup)

4. **Test in Game**:
   - Pieces should now render with your custom model
   - Animations play automatically on game events
   - Check browser console for any GLB load errors

5. **Fallback Rendering**:
   - If model fails to load, game displays procedural fallback geometry
   - Check console error messages and verify GLB file path

### Performance Optimization

- **Model Caching**: Models are loaded once and cloned for each piece instance
- **Instanced Rendering**: Board tiles use GPU instancing (not affected by model changes)
- **Animation Mixers**: One mixer per piece, updates only during active animations
- **LOD Support**: Consider adding Level-of-Detail (LOD) models for distant pieces (future enhancement)

### Debugging Model/Animation Issues

Check these when pieces don't render or animate:

1. **File Path**: Verify GLB files are in `public/models/` with correct names
2. **GLB Validation**: Use [glTF Validator](https://github.khronos.org/glTF-Validator/) to check file integrity
3. **Console Errors**: Open DevTools (F12) and check for load errors
4. **Animation Names**: Verify animation names in code match exactly with GLB animation names (case-sensitive)
5. **Restart Dev Server**: Animation loading happens at startup; restart with `npm run dev`