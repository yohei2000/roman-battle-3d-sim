import { distance, dot, fromAngle, normalize, sub } from "../engine/math/Vec2";
import { SimWorld } from "../engine/sim/SimWorld";
import type { EngagementPhase, Formation } from "../engine/sim/SimTypes";
import type { EvaluationAgent } from "./EvaluationAgent";
import type { EvaluationMetrics, RunResult, ScenarioDefinition } from "./EvaluationTypes";
import { cloneFormations } from "./ScenarioSuite";

const STEP = 1 / 30;
const DURATION = 78;

export function runAgentScenario(agent: EvaluationAgent, scenario: ScenarioDefinition, seed: number): RunResult {
  const world = new SimWorld({ seed, formations: cloneFormations(scenario.createFormations(seed)) });
  const initialMorale = sideMorale(world.formations, "rome") - sideMorale(world.formations, "opposition");
  const phaseTimes = new Map<EngagementPhase, number>();
  let firstRouting: number | undefined;
  let nan = false;
  let outOfBounds = false;

  agent.start(world);
  for (let time = 0; time < DURATION; time += STEP) {
    agent.update(world, world.time);
    world.step(STEP);
    const snapshot = world.snapshot();
    for (const engagement of snapshot.engagements) {
      if (!phaseTimes.has(engagement.phase)) {
        phaseTimes.set(engagement.phase, snapshot.time);
      }
    }
    if (firstRouting === undefined && snapshot.formations.some((formation) => formation.state === "routing")) {
      firstRouting = snapshot.time;
    }
    for (const formation of snapshot.formations) {
      nan ||= !Number.isFinite(formation.center.x) || !Number.isFinite(formation.center.y) || !Number.isFinite(formation.morale);
      outOfBounds ||= Math.abs(formation.center.x) > 96 || Math.abs(formation.center.y) > 96;
    }
  }

  const telemetry = world.telemetrySnapshot();
  const final = world.snapshot();
  const finalMorale = sideMorale(final.formations, "rome") - sideMorale(final.formations, "opposition");
  const metrics: EvaluationMetrics = {
    firstContact: phaseTimes.get("standoff") ?? phaseTimes.get("surge"),
    firstSurge: phaseTimes.get("surge"),
    firstRupture: phaseTimes.get("rupture"),
    firstRouting,
    duration: DURATION,
    winner: winner(final.formations),
    commandCount: telemetry.filter((event) => event.kind === "formation_command").length,
    intentCount: telemetry.filter((event) => event.kind === "intent").length,
    lineAdherence: lineAdherence(world),
    facingAdherence: facingAdherence(world),
    flankRuptureRatio: ruptureRatio(telemetry),
    comeback: initialMorale < -0.15 && finalMorale > 0.05,
    routCascade: final.formations.filter((formation) => formation.state === "routing").length,
    casualtyProxy: casualtyProxy(final.formations),
    moraleDelta: finalMorale - initialMorale,
    stuck: (phaseTimes.get("standoff") ?? Number.POSITIVE_INFINITY) > 34,
    nan,
    outOfBounds,
  };

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    agentId: agent.id,
    agentName: agent.name,
    seed,
    metrics,
  };
}

function sideMorale(formations: Formation[], side: "rome" | "opposition"): number {
  const sideFormations = formations.filter((formation) => formation.side === side);
  return (
    sideFormations.reduce((sum, formation) => sum + formation.morale + formation.cohesion - formation.panic, 0) /
    Math.max(1, sideFormations.length)
  );
}

function winner(formations: Formation[]): "rome" | "opposition" | "draw" {
  const rome = sideMorale(formations, "rome");
  const opposition = sideMorale(formations, "opposition");
  if (Math.abs(rome - opposition) < 0.08) return "draw";
  return rome > opposition ? "rome" : "opposition";
}

function lineAdherence(world: SimWorld): number {
  const frontlines = world.intentSnapshot().committedFrontlines;
  if (frontlines.length === 0) return 0.45;
  let total = 0;
  let count = 0;
  for (const intent of frontlines) {
    for (const assignment of intent.assignments) {
      const formation = world.formations.find((candidate) => candidate.id === assignment.formationId);
      if (!formation) continue;
      total += Math.max(0, 1 - distance(formation.center, assignment.targetCenter) / 38);
      count += 1;
    }
  }
  return count === 0 ? 0.45 : total / count;
}

function facingAdherence(world: SimWorld): number {
  const frontlines = world.intentSnapshot().committedFrontlines;
  if (frontlines.length === 0) return 0.45;
  let total = 0;
  let count = 0;
  for (const intent of frontlines) {
    for (const assignment of intent.assignments) {
      const formation = world.formations.find((candidate) => candidate.id === assignment.formationId);
      if (!formation) continue;
      total += (dot(fromAngle(formation.facing), fromAngle(assignment.targetFacing)) + 1) * 0.5;
      count += 1;
    }
  }
  return count === 0 ? 0.45 : total / count;
}

function ruptureRatio(telemetry: ReturnType<SimWorld["telemetrySnapshot"]>): number {
  const ruptures = telemetry.filter((event) => event.kind === "rupture").length;
  const recoils = telemetry.filter((event) => event.kind === "recoil").length;
  return ruptures / Math.max(1, ruptures + recoils);
}

function casualtyProxy(formations: Formation[]): number {
  return formations.reduce((sum, formation) => sum + (1 - formation.morale) * 0.4 + (1 - formation.cohesion) * 0.35 + formation.panic * 0.25, 0);
}
