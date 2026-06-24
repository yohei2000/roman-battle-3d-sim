import { clamp, distance, normalize, scale } from "../math/Vec2";
import { SIM_CONFIG } from "./SimConfig";
import type { BattleDoctrine, Engagement, Formation, SimEvent } from "./SimTypes";
import type { TelemetryCollector } from "./Telemetry";
import { doctrineTraits, roleTraits } from "./ComplexityModel";

export class MoraleSystem {
  update(
    formations: Formation[],
    engagements: Engagement[],
    dt: number,
    time: number,
    events: SimEvent[],
    telemetry?: TelemetryCollector,
    commandFocusRatio = 1,
    doctrine: BattleDoctrine = "flexible_reserve",
  ): void {
    const doctrineDefensive = doctrineTraits(doctrine).defensivePanic;
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
        const contagion = roleTraits(formation.role).contagion * (1 - formation.standardInfluence * 0.4 - formation.reserveRelief * 0.35);
        formation.panic = clamp(formation.panic + dt * nearbyRoutingAllies * 0.08 * contagion, 0, 1.2);
        formation.morale = clamp(formation.morale - dt * nearbyRoutingAllies * 0.045 * contagion, 0, 1);
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
        formation.standardInfluence * 0.5 -
        formation.reserveRelief * 0.45 -
        formation.objectiveSupport * 0.5 -
        roleTraits(formation.role).pressureResistance * 0.45 -
        (formation.side === "rome" ? doctrineDefensive : 0) +
        (formation.side === "rome" && commandFocusRatio < 0.18 ? 0.22 : 0) -
        formation.discipline -
        formation.morale;

      if (routeRisk > 0.35 || formation.morale < 0.12 || formation.cohesion < 0.1) {
        formation.collapseReason = collapseReason(formation, nearbyRoutingAllies, currentlyInPursuit, commandFocusRatio);
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
        telemetry?.record({
          time,
          kind: "collapse_reason_recorded",
          message: formation.collapseReason,
          data: { formation: formation.id },
        });
      }
    }
  }
}

function collapseReason(
  formation: Formation,
  nearbyRoutingAllies: number,
  currentlyInPursuit: boolean,
  commandFocusRatio: number,
): string {
  if (formation.flankThreat > 0.68) return "flank pressure";
  if (formation.fatigue > 0.78) return "fatigue";
  if (nearbyRoutingAllies > 0) return "rout cascade";
  if (commandFocusRatio < 0.18) return "low commandFocus";
  if (formation.reserveRelief <= 0.02 && formation.side === "rome") return "no reserve";
  if (currentlyInPursuit) return "pursuit panic";
  if (formation.standardInfluence <= 0.02) return "no standard support";
  return "morale collapse";
}
