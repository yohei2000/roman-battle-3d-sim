import { angleOf, distance, normalize, rightFromFacing, scale, sub } from "../math/Vec2";
import type { Rng } from "../math/Rng";
import type { CommandSystem } from "./CommandSystem";
import type { Formation, SimEvent } from "./SimTypes";

export class AISystem {
  private nextThinkAt = 0.5;

  update(
    formations: Formation[],
    commandSystem: CommandSystem,
    time: number,
    rng: Rng,
    events: SimEvent[],
  ): void {
    if (time < this.nextThinkAt) {
      return;
    }

    this.nextThinkAt = time + rng.range(1.1, 1.7);
    const enemies = formations.filter((formation) => formation.side === "opposition" && formation.state !== "routing");
    const players = formations.filter((formation) => formation.side === "rome" && formation.state !== "routing");

    for (const enemy of enemies) {
      const target = nearest(enemy, players);
      if (!target || enemy.currentEngagementIds.length > 0 || enemy.pendingCommand) {
        continue;
      }

      const toTarget = normalize(sub(target.center, enemy.center));
      const distanceToTarget = distance(enemy.center, target.center);
      const right = rightFromFacing(angleOf(toTarget));
      const flankBias = enemy.id.endsWith("left") ? -10 : enemy.id.endsWith("right") ? 10 : 0;
      const press = target.state === "rupturing" || target.state === "routing" ? 7 : distanceToTarget > 32 ? -4 : 0;
      const desired = {
        x: target.center.x - toTarget.x * (enemy.depth * 0.8 + target.depth * 0.8 - press) + right.x * flankBias,
        y: target.center.y - toTarget.y * (enemy.depth * 0.8 + target.depth * 0.8 - press) + right.y * flankBias,
      };

      if (enemy.morale < 0.34 || enemy.cohesion < 0.28) {
        commandSystem.issue([enemy.id], "reform", time, rng);
        events.push({ time, kind: "ai", formationId: enemy.id, message: `${enemy.name}: reforming` });
      } else {
        commandSystem.issue([enemy.id], "advance", time, rng, desired, angleOf(toTarget));
      }
    }
  }
}

function nearest(source: Formation, candidates: Formation[]): Formation | undefined {
  let best: Formation | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateDistance = distance(source.center, candidate.center);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}
