import {
  add,
  clamp,
  distance,
  dot,
  fromAngle,
  normalize,
  rightFromFacing,
  saturate,
  scale,
  sub,
} from "../math/Vec2";
import { frontCenter, orientedBoxesOverlap, type OrientedBox } from "../math/Geometry";
import type { Rng } from "../math/Rng";
import { SIM_CONFIG } from "./SimConfig";
import type { ContactLane, Engagement, Formation, SimEvent } from "./SimTypes";
import type { TerrainField } from "./TerrainField";
import { SpatialGrid } from "./SpatialGrid";
import type { IntentSystem } from "./IntentSystem";
import type { TelemetryCollector } from "./Telemetry";

export class EngagementSystem {
  private readonly grid = new SpatialGrid();
  private readonly engagements = new Map<string, Engagement>();

  all(): Engagement[] {
    return [...this.engagements.values()];
  }

  update(
    formations: Formation[],
    terrain: TerrainField,
    rng: Rng,
    time: number,
    dt: number,
    events: SimEvent[],
    intentSystem?: IntentSystem,
    telemetry?: TelemetryCollector,
  ): void {
    const activeIds = new Set<string>();

    for (const formation of formations) {
      formation.currentEngagementIds = [];
      formation.flankThreat = 0;
    }

    for (const [a, b] of this.grid.potentialEnemyPairs(formations)) {
      if (a.state === "routing" && b.state === "routing") {
        continue;
      }

      const id = engagementId(a.id, b.id);
      const near = this.areCloseEnough(a, b);
      if (!near) {
        continue;
      }

      activeIds.add(id);
      const engagement = this.engagements.get(id) ?? this.createEngagement(id, a, b, time, rng);
      engagement.contactLanes = this.buildContactLanes(engagement, a, b, terrain);
      this.updateEngagementPhase(engagement, a, b, rng, time, dt, events, intentSystem, telemetry);
      this.engagements.set(id, engagement);
      a.currentEngagementIds.push(id);
      b.currentEngagementIds.push(id);
    }

    for (const [id, engagement] of this.engagements.entries()) {
      if (!activeIds.has(id)) {
        this.engagements.delete(id);
        events.push({
          time,
          kind: "engagement",
          message: `${engagement.id}: contact broke`,
        });
      }
    }
  }

  private createEngagement(id: string, a: Formation, b: Formation, time: number, rng: Rng): Engagement {
    return {
      id,
      aFormationId: a.id,
      bFormationId: b.id,
      contactLanes: [],
      phase: "approach",
      phaseStartedAt: time,
      nextSurgeAt: time + rng.range(2.2, 4.5),
      pressureA: 0,
      pressureB: 0,
      localAdvantageA: 0,
      localAdvantageB: 0,
      consecutiveLossesA: 0,
      consecutiveLossesB: 0,
    };
  }

  private areCloseEnough(a: Formation, b: Formation): boolean {
    const aBox = formationBox(a);
    const bBox = formationBox(b);
    if (orientedBoxesOverlap(aBox, bBox, SIM_CONFIG.engagementContactPadding)) {
      return true;
    }
    return distance(a.center, b.center) < SIM_CONFIG.engagementNearDistance + a.depth * 0.5 + b.depth * 0.5;
  }

  private buildContactLanes(
    engagement: Engagement,
    a: Formation,
    b: Formation,
    terrain: TerrainField,
  ): ContactLane[] {
    const normalAtoB = normalize(sub(b.center, a.center));
    const lateral = { x: normalAtoB.y, y: -normalAtoB.x };
    const laneCount = 8;
    const contactCenter = scale(add(frontCenter(formationBox(a)), frontCenter(formationBox(b))), 0.5);
    const laneWidth = Math.min(a.width, b.width) / laneCount;
    const flankA = flankFactor(a, normalAtoB);
    const flankB = flankFactor(b, scale(normalAtoB, -1));
    a.flankThreat = Math.max(a.flankThreat, flankA);
    b.flankThreat = Math.max(b.flankThreat, flankB);
    a.lastThreatDirection = normalAtoB;
    b.lastThreatDirection = scale(normalAtoB, -1);

    const lanes: ContactLane[] = [];
    for (let index = 0; index < laneCount; index += 1) {
      const sideOffset = (index - (laneCount - 1) * 0.5) * laneWidth;
      const worldPos = add(contactCenter, scale(lateral, sideOffset));
      const sample = terrain.sampleVec(worldPos);
      const densityNoise = 0.92 + Math.sin(index * 1.73 + engagement.phaseStartedAt) * 0.08;
      const aDensity = clamp((a.rankCount / 9) * (1 - flankA * 0.18) * densityNoise, 0.35, 1.45);
      const bDensity = clamp((b.rankCount / 9) * (1 - flankB * 0.18) * (2 - densityNoise), 0.35, 1.45);
      const terrainFactor = clamp(1 - sample.slope * 0.28, 0.62, 1.12);
      lanes.push({
        index,
        worldPos,
        normal: normalAtoB,
        width: laneWidth,
        aDensity,
        bDensity,
        aCohesion: a.cohesion,
        bCohesion: b.cohesion,
        flankFactorA: flankA,
        flankFactorB: flankB,
        terrainFactor,
        intensity: clamp(
          0.3 +
            (a.pressure + b.pressure) * 0.22 +
            (1 - a.cohesion + 1 - b.cohesion) * 0.22 +
            Math.max(flankA, flankB) * 0.24,
          0,
          1.35,
        ),
      });
    }
    return lanes;
  }

  private updateEngagementPhase(
    engagement: Engagement,
    a: Formation,
    b: Formation,
    rng: Rng,
    time: number,
    dt: number,
    events: SimEvent[],
    intentSystem?: IntentSystem,
    telemetry?: TelemetryCollector,
  ): void {
    const inContact =
      orientedBoxesOverlap(formationBox(a), formationBox(b), SIM_CONFIG.engagementContactPadding) ||
      distance(a.center, b.center) <
        SIM_CONFIG.engagementNearDistance + a.depth * 0.5 + b.depth * 0.5;
    const lanePressure = average(engagement.contactLanes.map((lane) => lane.intensity));
    engagement.pressureA = lanePressure * (1 + b.discipline * 0.25 + a.flankThreat * 0.35);
    engagement.pressureB = lanePressure * (1 + a.discipline * 0.25 + b.flankThreat * 0.35);
    const intentA = intentSystem?.getInfluenceForFormation(a.side, a.center);
    const intentB = intentSystem?.getInfluenceForFormation(b.side, b.center);
    const pressureA = intentA?.pressureStrength ?? 0;
    const pressureB = intentB?.pressureStrength ?? 0;

    if (engagement.phase === "approach" && inContact) {
      this.transition(engagement, "standoff", time, events, "lines locked");
      telemetry?.record({ time, kind: "engagement_phase", message: "approach->standoff", data: { engagement: engagement.id } });
    }

    if (engagement.phase === "approach") {
      a.pressure = clamp(a.pressure + dt * 0.006, 0, 1.4);
      b.pressure = clamp(b.pressure + dt * 0.006, 0, 1.4);
      return;
    }

    if (engagement.phase === "standoff") {
      a.pressure = clamp(a.pressure + dt * SIM_CONFIG.standoffPressureRate * (1 + a.flankThreat), 0, 1.4);
      b.pressure = clamp(b.pressure + dt * SIM_CONFIG.standoffPressureRate * (1 + b.flankThreat), 0, 1.4);
      a.fatigue = clamp(a.fatigue + dt * (0.018 + pressureA * 0.018), 0, 1);
      b.fatigue = clamp(b.fatigue + dt * (0.018 + pressureB * 0.018), 0, 1);
      a.cohesion = clamp(a.cohesion - dt * (0.01 + pressureA * 0.006) * (1 + a.flankThreat), 0, 1);
      b.cohesion = clamp(b.cohesion - dt * (0.01 + pressureB * 0.006) * (1 + b.flankThreat), 0, 1);
      const pressureHaste = Math.max(pressureA, pressureB) * 1.2;
      if (time >= engagement.nextSurgeAt - pressureHaste) {
        this.resolveSurge(engagement, a, b, rng, time, events, pressureA, pressureB, telemetry);
      }
      return;
    }

    if (engagement.phase === "surge" && time - engagement.phaseStartedAt > 1.15) {
      this.applySurgeOutcome(engagement, a, b, time, events, telemetry);
      return;
    }

    if (engagement.phase === "recoil" && time - engagement.phaseStartedAt > 0.9) {
      engagement.nextSurgeAt = time + rng.range(2.5, 4.8);
      this.transition(engagement, "standoff", time, events, "line recovered");
      telemetry?.record({ time, kind: "engagement_phase", message: "recoil->standoff", data: { engagement: engagement.id } });
      return;
    }

    if (engagement.phase === "rupture" && time - engagement.phaseStartedAt > 1.2) {
      const loser = engagement.loserFormationId === a.id ? a : b;
      if (loser.state === "routing") {
        this.transition(engagement, "pursuit", time, events, "rout opened");
        telemetry?.record({ time, kind: "engagement_phase", message: "rupture->pursuit", data: { engagement: engagement.id } });
      } else {
        engagement.nextSurgeAt = time + rng.range(2.5, 4.5);
        this.transition(engagement, "standoff", time, events, "rupture contained");
        telemetry?.record({ time, kind: "engagement_phase", message: "rupture->standoff", data: { engagement: engagement.id } });
      }
      return;
    }

    if (engagement.phase === "pursuit") {
      const loser = engagement.loserFormationId === a.id ? a : b;
      loser.pressure = clamp(loser.pressure + dt * 0.08, 0, 1.4);
      loser.panic = clamp(loser.panic + dt * 0.06, 0, 1.2);
    }
  }

  private resolveSurge(
    engagement: Engagement,
    a: Formation,
    b: Formation,
    rng: Rng,
    time: number,
    events: SimEvent[],
    pressureA: number,
    pressureB: number,
    telemetry?: TelemetryCollector,
  ): void {
    let scoreA = 0;
    let scoreB = 0;
    for (const lane of engagement.contactLanes) {
      scoreA += surgePower(a, lane.aDensity, lane.flankFactorA, lane.terrainFactor, rng, pressureA);
      scoreB += surgePower(b, lane.bDensity, lane.flankFactorB, lane.terrainFactor, rng, pressureB);
    }
    engagement.localAdvantageA = scoreA / Math.max(0.001, scoreB);
    engagement.localAdvantageB = scoreB / Math.max(0.001, scoreA);

    const aWon = scoreA >= scoreB;
    const winner = aWon ? a : b;
    const loser = aWon ? b : a;
    const margin = Math.abs(scoreA - scoreB) / Math.max(scoreA, scoreB, 0.001);

    engagement.lastWinnerId = winner.id;
    engagement.loserFormationId = loser.id;
    engagement.surgeOutcome = shouldRupture(loser, margin, loser.flankThreat) ? "rupture" : "recoil";
    engagement.consecutiveLossesA = aWon ? 0 : engagement.consecutiveLossesA + 1;
    engagement.consecutiveLossesB = aWon ? engagement.consecutiveLossesB + 1 : 0;

    winner.pressure = clamp(winner.pressure - 0.04, 0, 1.4);
    loser.pressure = clamp(loser.pressure + 0.12 + margin * 0.18, 0, 1.4);
    loser.cohesion = clamp(loser.cohesion - 0.06 - margin * 0.12 - loser.flankThreat * 0.06, 0, 1);
    loser.morale = clamp(loser.morale - 0.035 - margin * 0.08 - loser.flankThreat * 0.06, 0, 1);
    loser.panic = clamp(loser.panic + 0.06 + margin * 0.12 + loser.flankThreat * 0.12, 0, 1.2);

    this.transition(
      engagement,
      "surge",
      time,
      events,
      `${winner.name} wins surge, ${loser.name} ${engagement.surgeOutcome}`,
    );
    telemetry?.record({
      time,
      kind: "engagement_phase",
      message: "surge resolved",
      data: { engagement: engagement.id, winner: winner.id, loser: loser.id, outcome: engagement.surgeOutcome },
    });
  }

  private applySurgeOutcome(
    engagement: Engagement,
    a: Formation,
    b: Formation,
    time: number,
    events: SimEvent[],
    telemetry?: TelemetryCollector,
  ): void {
    const loser = engagement.loserFormationId === a.id ? a : b;
    const winner = loser === a ? b : a;
    const pushDirection = normalize(sub(loser.center, winner.center));

    if (engagement.surgeOutcome === "rupture") {
      loser.state = "rupturing";
      loser.cohesion = clamp(loser.cohesion - 0.18 - loser.flankThreat * 0.08, 0, 1);
      loser.morale = clamp(loser.morale - 0.12 - loser.flankThreat * 0.1, 0, 1);
      loser.panic = clamp(loser.panic + 0.22 + loser.flankThreat * 0.18, 0, 1.2);
      loser.center = add(loser.center, scale(pushDirection, 1.25));
      if (routeRisk(loser) > 0.28) {
        loser.state = "routing";
        loser.routeDirection = pushDirection;
        telemetry?.record({ time, kind: "rout", message: `${loser.id} routed`, data: { formation: loser.id } });
      }
      this.transition(engagement, "rupture", time, events, `${loser.name} rupture`);
      telemetry?.record({ time, kind: "rupture", message: `${loser.id} ruptured`, data: { formation: loser.id } });
      return;
    }

    loser.state = "recoiling";
    loser.center = add(loser.center, scale(pushDirection, 0.8));
    loser.cohesion = clamp(loser.cohesion - 0.055, 0, 1);
    loser.pressure = clamp(loser.pressure + 0.06, 0, 1.4);
    this.transition(engagement, "recoil", time, events, `${loser.name} recoils`);
    telemetry?.record({ time, kind: "recoil", message: `${loser.id} recoiled`, data: { formation: loser.id } });
  }

  private transition(
    engagement: Engagement,
    phase: Engagement["phase"],
    time: number,
    events: SimEvent[],
    message: string,
  ): void {
    engagement.phase = phase;
    engagement.phaseStartedAt = time;
    events.push({ time, kind: "engagement", message });
  }
}

function engagementId(aId: string, bId: string): string {
  return [aId, bId].sort().join(":");
}

function formationBox(formation: Formation): OrientedBox {
  return {
    center: formation.center,
    width: formation.width,
    depth: formation.depth,
    facing: formation.facing,
  };
}

function flankFactor(formation: Formation, normalToThreat: { x: number; y: number }): number {
  const facing = fromAngle(formation.facing);
  const exposure = dot(facing, normalToThreat);
  if (exposure > 0.38) return 0;
  if (exposure < -0.38) return 1;
  return 0.55;
}

function surgePower(
  formation: Formation,
  density: number,
  flankFactorValue: number,
  terrainFactor: number,
  rng: Rng,
  pressureIntent = 0,
): number {
  const troopQuality = 0.78 + formation.discipline * 0.42;
  const cohesionFactor = 0.42 + formation.cohesion * 0.88;
  const moraleFactor = 0.48 + formation.morale * 0.72 - formation.panic * 0.24;
  const densityFactor = 0.75 + density * 0.2;
  const depthSupportFactor = 0.82 + formation.rankCount * 0.025;
  const facingFactor = 1 - flankFactorValue * 0.36;
  const localSupportFactor = 0.92 + formation.formationIntegrity * 0.18;
  const randomNoise = rng.range(0.9, 1.12);
  const fatiguePenalty = formation.fatigue * 0.36;
  const pressurePenalty = saturate(formation.pressure / 1.4) * 0.28;
  const flankExposurePenalty = flankFactorValue * 0.3;
  const pressureBonus = 1 + pressureIntent * 0.12;
  return (
    troopQuality *
      cohesionFactor *
      moraleFactor *
      densityFactor *
      depthSupportFactor *
      terrainFactor *
      facingFactor *
      localSupportFactor *
      pressureBonus *
      randomNoise -
    fatiguePenalty -
    pressurePenalty -
    flankExposurePenalty
  );
}

function shouldRupture(loser: Formation, margin: number, flankFactorValue: number): boolean {
  const localCollapse =
    (1 - loser.morale) * 0.55 +
    (1 - loser.cohesion) * 0.7 +
    loser.panic * 0.65 +
    loser.pressure * 0.34 +
    flankFactorValue * 0.5 +
    margin * 0.65 -
    loser.discipline * 0.55;
  return localCollapse > 0.52;
}

function routeRisk(formation: Formation): number {
  return (
    formation.panic +
    formation.pressure * 0.6 +
    formation.flankThreat * 0.8 -
    formation.discipline -
    formation.morale
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
