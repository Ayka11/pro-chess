# ProChess Web (Phaser + TypeScript)

Browser-first rewrite of your Unity game into a full code workflow that runs from VS Code.

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

## Mapping from Unity

- `King` -> `king`
- `Vizier` -> `vizier`
- `Castle` -> `castle`
- `Officer` -> `officer`
- `Horse` -> `horse`
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
