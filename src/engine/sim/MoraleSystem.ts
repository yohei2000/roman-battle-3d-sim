import { clamp, distance, normalize, scale } from "../math/Vec2";
import { SIM_CONFIG } from "./SimConfig";
import type { Engagement, Formation, SimEvent } from "./SimTypes";

export class MoraleSystem {
  update(formations: Formation[], engagements: Engagement[], dt: number, time: number, events: SimEvent[]): void {
    for (const formation of formations) {
      if (formation.state === "routing") {
        formation.morale = clamp(formation.morale - dt * 0.012, 0, 1);
        formation.panic = clamp(formation.panic + dt * 0.025, 0, 1.2);
        continue;
      }

      const nearbyRoutingAllies = formations.filter(
        (candidate) =>
          candidate.side === formation.side &&
          candidate.id !== formation.id &&
          candidate.state === "routing" &&
          distance(candidate.center, formation.center) < SIM_CONFIG.routingContagionRadius,
      ).length;

      if (nearbyRoutingAllies > 0) {
        formation.panic = clamp(formation.panic + dt * nearbyRoutingAllies * 0.08, 0, 1.2);
        formation.morale = clamp(formation.morale - dt * nearbyRoutingAllies * 0.045, 0, 1);
      }

      const currentlyInPursuit = engagements.some(
        (engagement) =>
          engagement.phase === "pursuit" &&
          (engagement.aFormationId === formation.id || engagement.bFormationId === formation.id),
      );

      const routeRisk =
        formation.panic +
        formation.pressure * 0.6 +
        formation.flankThreat * 0.8 +
        nearbyRoutingAllies * 0.7 +
        (currentlyInPursuit ? 0.35 : 0) -
        formation.discipline -
        formation.morale;

      if (routeRisk > 0.35 || formation.morale < 0.12 || formation.cohesion < 0.1) {
        formation.state = "routing";
        formation.intent = "retreat";
        formation.selected = false;
        formation.routeDirection = normalize(scale(formation.lastThreatDirection, -1));
        if (Math.hypot(formation.routeDirection.x, formation.routeDirection.y) < 0.01) {
          formation.routeDirection = { x: formation.side === "rome" ? -1 : 1, y: 0 };
        }
        events.push({
          time,
          kind: "morale",
          formationId: formation.id,
          message: `${formation.name}: ROUTING`,
        });
      }
    }
  }
}
