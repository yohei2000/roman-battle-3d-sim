import { fromAngle, rightFromFacing, type Vec2 } from "../math/Vec2";
import type { Engagement, Formation } from "./SimTypes";

export class FormationSystem {
  initializeSlots(formation: Formation): void {
    formation.slotOffsets = [];
    const fileSpacing = formation.width / formation.fileCount;
    const rankSpacing = formation.depth / formation.rankCount;

    for (let rank = 0; rank < formation.rankCount; rank += 1) {
      for (let file = 0; file < formation.fileCount; file += 1) {
        formation.slotOffsets.push({
          x: -formation.width * 0.5 + fileSpacing * (file + 0.5),
          y: formation.depth * 0.5 - rankSpacing * (rank + 0.5),
        });
      }
    }
  }

  worldSlot(formation: Formation, slot: Vec2): Vec2 {
    const right = rightFromFacing(formation.facing);
    const forward = fromAngle(formation.facing);
    return {
      x: formation.center.x + right.x * slot.x + forward.x * slot.y,
      y: formation.center.y + right.y * slot.x + forward.y * slot.y,
    };
  }

  updateVisualStates(formations: Formation[], engagements: Engagement[]): void {
    const phasesByFormation = new Map<string, string>();
    for (const engagement of engagements) {
      phasesByFormation.set(engagement.aFormationId, engagement.phase);
      phasesByFormation.set(engagement.bFormationId, engagement.phase);
    }

    for (const formation of formations) {
      const phase = phasesByFormation.get(formation.id);
      if (formation.state === "routing") {
        formation.visualState = "route";
      } else if (formation.state === "reforming") {
        formation.visualState = "reform";
      } else if (phase === "surge") {
        formation.visualState = "surge";
      } else if (phase === "recoil" || formation.state === "recoiling") {
        formation.visualState = "recoil";
      } else if (phase === "standoff" || formation.state === "engaged") {
        formation.visualState = "standoff";
      } else if (formation.state === "moving") {
        formation.visualState = "march";
      } else if (formation.state === "holding") {
        formation.visualState = "brace";
      } else {
        formation.visualState = "idle";
      }
    }
  }
}
