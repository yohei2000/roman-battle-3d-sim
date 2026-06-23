# Roman Battle 3D Sim

A deployable vertical slice of a formation-level ancient melee battle simulator built from scratch with Vite, TypeScript, three.js, and DOM/CSS HUD controls.

The simulation treats formations, contact lanes, morale, cohesion, fatigue, pressure, discipline, panic, and engagement phases as the combat authority. Soldiers are rendered as low-poly procedural instanced visuals that follow formation slots.

## Commands

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
```

## Controls

- Left click: select friendly formation.
- Drag left mouse: marquee-select friendly formations.
- Right click: move selected formations.
- F + left drag: draw a frontline intent and send selected formations to it.
- Shift + F drag: loose spacing.
- Alt + F drag: deep formation preview.
- Ctrl + F drag: careful alignment with lower cohesion loss and reform on arrival.
- Esc: cancel active frontline drawing.
- Backspace: undo the last committed visible intent.
- Command buttons: hold, advance, reform, retreat.
- WASD: pan tactical camera.
- Mouse wheel: zoom.
- Middle drag or Q/E: rotate.
- C: toggle tactical/cinematic camera.
- D: toggle debug overlay.

## Deployment

The GitHub Pages workflow builds with `npm ci` and deploys `dist/` through GitHub Actions. `vite.config.ts` uses `GITHUB_REPOSITORY` to set the production base path.
