# Roman Battle 3D Sim

A deployable vertical slice of a formation-level ancient melee battle simulator built from scratch with Vite, TypeScript, three.js, and DOM/CSS HUD controls.

The simulation treats formations, contact lanes, morale, cohesion, fatigue, pressure, discipline, panic, and engagement phases as the combat authority. Soldiers are rendered as low-poly procedural instanced visuals that follow formation slots.

## Commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run eval
npm.cmd run preview
```

## Mobile Command Lens

- One tap: select a friendly formation.
- `作戦`: open the Command Lens.
- `Frontline`: draw a battle line with one finger, release to preview, then `Confirm`.
- `Pressure`: draw a pressure stroke to encourage earlier surges at extra fatigue/cohesion cost.
- `Standard`: tap a standard position, preview its morale/discipline aura, then `Confirm`.
- `Fallback`: draw a dashed fallback line for ordered retreat/reform intent.
- Preview controls: `Confirm`, `Cancel`, `Undo`.
- Two fingers: pan camera, pinch zoom, twist rotate.

## Desktop Controls

- Left click: select friendly formation.
- Drag left mouse: marquee-select friendly formations.
- Right click: move selected formations.
- F + left drag: draw a frontline preview, then press Enter or `Confirm`.
- Shift + F drag: loose spacing.
- Alt + F drag: deep formation preview.
- Ctrl + F drag: careful alignment with lower cohesion loss and reform on arrival.
- Esc: cancel active preview.
- Backspace: undo the last committed visible intent.
- Command buttons: hold, advance, reform, retreat.
- WASD: pan tactical camera.
- Mouse wheel: zoom.
- Middle drag or Q/E: rotate.
- C: toggle tactical/cinematic camera.
- D: toggle debug overlay.

## Evaluation

`npm.cmd run eval` runs a headless suite under `src/eval/` using the same public command and intent APIs as the UI. It writes:

- `reports/eval/latest.json`
- `reports/eval/latest.md`

The suite compares NoOp, Frontal Attack, Draw Frontline, Pressure, and Fallback agents across balanced, angled/flank, and disordered scenarios.

## Deployment

The GitHub Pages workflow builds with `npm ci` and deploys `dist/` through GitHub Actions. `vite.config.ts` uses `GITHUB_REPOSITORY` to set the production base path.
