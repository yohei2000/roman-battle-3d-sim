import {
  angleOf,
  clamp,
  distance,
  fromAngle,
  moveAngleToward,
  normalize,
  scale,
  sub,
} from "../math/Vec2";
import { SIM_CONFIG } from "./SimConfig";
import type { TerrainField } from "./TerrainField";
import type { Formation } from "./SimTypes";

export class MovementSystem {
  update(formations: Formation[], terrain: TerrainField, dt: number): void {
    for (const formation of formations) {
      const terrainSample = terrain.sampleVec(formation.center);
      const isPinned =
        formation.currentEngagementIds.length > 0 &&
        formation.state !== "routing" &&
        formation.intent !== "retreat";

      if (formation.state === "routing") {
        const routeTarget = {
          x: formation.center.x + formation.routeDirection.x * 60,
          y: formation.center.y + formation.routeDirection.y * 60,
        };
        this.moveToward(formation, routeTarget, dt, terrainSample.moveCost, true);
        formation.targetFacing = angleOf(formation.routeDirection);
        formation.fatigue = clamp(formation.fatigue + dt * 0.055, 0, 1);
        formation.pressure = clamp(formation.pressure - dt * 0.035, 0, 1.4);
        continue;
      }

      if (isPinned) {
        formation.fatigue = clamp(formation.fatigue + dt * 0.025, 0, 1);
        formation.pressure = clamp(formation.pressure + dt * 0.012, 0, 1.4);
        formation.state = "engaged";
        continue;
      }

      const remainingDistance = distance(formation.center, formation.targetCenter);
      const wantsToMove = remainingDistance > 0.75 && formation.intent !== "hold" && formation.intent !== "reform";

      if (wantsToMove) {
        this.moveToward(formation, formation.targetCenter, dt, terrainSample.moveCost, false);
        formation.state = formation.intent === "advance" ? "moving" : "moving";
        formation.fatigue = clamp(formation.fatigue + dt * (0.02 + terrainSample.moveCost * 0.012), 0, 1);
        formation.cohesion = clamp(formation.cohesion - terrainSample.cohesionCost * dt, 0, 1);
      } else {
        const recoveryScale = formation.intent === "reform" ? 1.8 : 1;
        formation.state = formation.intent === "reform" ? "reforming" : formation.intent === "hold" ? "holding" : "idle";
        formation.cohesion = clamp(
          formation.cohesion + SIM_CONFIG.cohesionRecoveryRate * recoveryScale * dt,
          0,
          1,
        );
        formation.fatigue = clamp(formation.fatigue - SIM_CONFIG.fatigueRecoveryRate * recoveryScale * dt, 0, 1);
        formation.pressure = clamp(formation.pressure - 0.04 * recoveryScale * dt, 0, 1.4);
        formation.panic = clamp(formation.panic - 0.025 * recoveryScale * dt, 0, 1.2);
      }

      const facingStep = formation.turnRate * dt * (wantsToMove ? 0.75 : 1);
      const oldFacing = formation.facing;
      formation.facing = moveAngleToward(formation.facing, formation.targetFacing, facingStep);
      const turnAmount = Math.abs(oldFacing - formation.facing);
      if (turnAmount > 0.002 && wantsToMove) {
        formation.cohesion = clamp(formation.cohesion - turnAmount * 0.035, 0, 1);
      }

      formation.formationIntegrity = clamp(
        formation.cohesion * 0.58 + formation.morale * 0.28 + (1 - formation.panic) * 0.14,
        0,
        1,
      );
    }
  }

  private moveToward(
    formation: Formation,
    target: { x: number; y: number },
    dt: number,
    moveCost: number,
    routing: boolean,
  ): void {
    const offset = sub(target, formation.center);
    const remaining = Math.hypot(offset.x, offset.y);
    if (remaining < 0.05) {
      return;
    }
    const direction = normalize(offset);
    const speedScale = routing
      ? SIM_CONFIG.routingSpeedScale
      : 1 - formation.fatigue * 0.32 + formation.cohesion * 0.18;
    const maxStep = (formation.speed * speedScale * dt) / moveCost;
    const step = Math.min(maxStep, remaining);
    const delta = scale(direction, step);
    formation.center = {
      x: formation.center.x + delta.x,
      y: formation.center.y + delta.y,
    };
    formation.targetFacing = angleOf(direction);
  }
}
