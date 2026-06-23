import { pointInBox } from "../math/Geometry";
import { Rng } from "../math/Rng";
import { angleOf, clamp, distance, dot, lerp, normalize, scale, sub, type Vec2 } from "../math/Vec2";
import { createDefaultScenario } from "../../scenarios/defaultScenario";
import { AISystem } from "./AISystem";
import { CommandSystem } from "./CommandSystem";
import { EngagementSystem } from "./EngagementSystem";
import { FormationSystem } from "./FormationSystem";
import { IntentSystem } from "./IntentSystem";
import { MoraleSystem } from "./MoraleSystem";
import { MovementSystem } from "./MovementSystem";
import { ReplayRecorder } from "./ReplayRecorder";
import { SIM_CONFIG } from "./SimConfig";
import { TerrainField } from "./TerrainField";
import { TelemetryCollector, type TelemetryEvent } from "./Telemetry";
import type {
  ContingencyIntent,
  FallbackLine,
  FrontlineAssignment,
  IntentSnapshot,
  LineIntent,
  LineIntentOptions,
  PressureStroke,
  SpacingMode,
  Standard,
} from "./IntentTypes";
import type { DebugFlags, Formation, FormationIntent, SideId, SimEvent, SimSnapshot } from "./SimTypes";

export interface SimWorldOptions {
  seed?: number;
  formations?: Formation[];
}

export class SimWorld {
  readonly terrain = new TerrainField();
  readonly debugFlags: DebugFlags = {
    bounds: true,
    fronts: true,
    contactLanes: true,
    labels: true,
    pressureLabels: false,
  };

  readonly formations: Formation[];
  private readonly rng: Rng;
  private readonly commands = new CommandSystem();
  private readonly movement = new MovementSystem();
  private readonly engagements = new EngagementSystem();
  private readonly morale = new MoraleSystem();
  private readonly ai = new AISystem();
  private readonly formationSystem = new FormationSystem();
  private readonly intentSystem = new IntentSystem();
  private readonly telemetry = new TelemetryCollector();
  private readonly replay = new ReplayRecorder();
  private recentEvents: SimEvent[] = [];
  time = 0;

  constructor(options: SimWorldOptions = {}) {
    this.formations = options.formations ?? createDefaultScenario();
    this.rng = new Rng(options.seed ?? 20260623);
    for (const formation of this.formations) {
      this.formationSystem.initializeSlots(formation);
    }
    this.formations[1].selected = true;
  }

  step(dt: number): void {
    this.time += dt;
    const events: SimEvent[] = [];
    this.commands.consumeQueued(this.formations, events, this.time);
    this.commands.updateCommandDelay(this.formations, dt, events, this.time);
    this.intentSystem.clearExpired(this.time);
    this.applyIntentInfluence(dt);
    this.ai.update(this.formations, this.commands, this.time, this.rng, events);
    this.movement.update(this.formations, this.terrain, dt);
    this.engagements.update(this.formations, this.terrain, this.rng, this.time, dt, events, this.intentSystem, this.telemetry);
    this.morale.update(this.formations, this.engagements.all(), dt, this.time, events);
    this.formationSystem.updateVisualStates(this.formations, this.engagements.all());
    this.replay.push(events);
    this.recentEvents = this.replay.recent(SIM_CONFIG.maxRecentEvents);
  }

  snapshot(): SimSnapshot {
    return {
      time: this.time,
      formations: this.formations,
      engagements: this.engagements.all(),
      events: this.recentEvents,
    };
  }

  selectedFormations() {
    return this.formations.filter((formation) => formation.selected);
  }

  intentSnapshot(): IntentSnapshot {
    return this.intentSystem.getSnapshot();
  }

  telemetrySnapshot(): TelemetryEvent[] {
    return this.telemetry.snapshot();
  }

  recordTelemetry(event: Omit<TelemetryEvent, "time">): void {
    this.telemetry.record({ ...event, time: this.time });
  }

  selectAt(point: Vec2, additive = false): void {
    const picked = [...this.formations]
      .reverse()
      .find(
        (formation) =>
          formation.side === "rome" &&
          formation.state !== "routing" &&
          pointInBox(point, {
            center: formation.center,
            width: formation.width + 2,
            depth: formation.depth + 2,
            facing: formation.facing,
          }),
      );

    if (!additive) {
      for (const formation of this.formations) {
        formation.selected = false;
      }
    }

    if (picked) {
      picked.selected = additive ? !picked.selected : true;
      this.telemetry.record({
        time: this.time,
        kind: "selection",
        message: picked.selected ? `${picked.id} selected` : `${picked.id} deselected`,
        data: { formation: picked.id },
      });
    }
  }

  selectRect(a: Vec2, b: Vec2): void {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    for (const formation of this.formations) {
      formation.selected =
        formation.side === "rome" &&
        formation.center.x >= minX &&
        formation.center.x <= maxX &&
        formation.center.y >= minY &&
        formation.center.y <= maxY;
    }
    this.telemetry.record({
      time: this.time,
      kind: "selection",
      message: "selection brush",
      data: { count: this.selectedFormations().length },
    });
  }

  selectFormationIds(ids: string[]): void {
    const selected = new Set(ids);
    for (const formation of this.formations) {
      formation.selected = formation.side === "rome" && selected.has(formation.id);
    }
    this.telemetry.record({
      time: this.time,
      kind: "selection",
      message: "public selection",
      data: { count: this.selectedFormations().length },
    });
  }

  issueSelected(type: FormationIntent, target?: Vec2): void {
    const ids = this.selectedFormations()
      .filter((formation) => formation.state !== "routing")
      .map((formation) => formation.id);
    if (ids.length === 0) {
      return;
    }

    if (target) {
      const center = this.centerOfSelected();
      const facing = angleOf(normalize(sub(target, center)));
      ids.forEach((id, index) => {
        const formation = this.formations.find((candidate) => candidate.id === id);
        if (!formation) return;
        const offset = {
          x: formation.center.x - center.x,
          y: formation.center.y - center.y,
        };
        this.commands.issue(
          [id],
          type,
          this.time,
          this.rng,
          { x: target.x + offset.x, y: target.y + offset.y + index * 0.01 },
          facing,
        );
        this.telemetry.record({
          time: this.time,
          kind: "formation_command",
          message: `${id} ${type}`,
          data: { formation: id, command: type },
        });
      });
      return;
    }

    this.commands.issue(ids, type, this.time, this.rng);
    this.telemetry.record({
      time: this.time,
      kind: "formation_command",
      message: `${type} command`,
      data: { count: ids.length, command: type },
    });
  }

  advanceSelected(): void {
    for (const formation of this.selectedFormations()) {
      const nearest = this.nearestEnemy(formation.center);
      if (!nearest) continue;
      const direction = normalize(sub(nearest.center, formation.center));
      const target = {
        x: nearest.center.x - direction.x * (nearest.depth + formation.depth),
        y: nearest.center.y - direction.y * (nearest.depth + formation.depth),
      };
      this.commands.issue([formation.id], "advance", this.time, this.rng, target, angleOf(direction));
      this.telemetry.record({
        time: this.time,
        kind: "formation_command",
        message: `${formation.id} advance`,
        data: { formation: formation.id, command: "advance" },
      });
    }
  }

  issueLineFormationForSelection(points: Vec2[], options: LineIntentOptions): LineIntent | undefined {
    return this.issueLineFormation(
      this.selectedFormations().map((formation) => formation.id),
      points,
      options,
    );
  }

  issueLineFormation(
    formationIds: string[],
    points: Vec2[],
    options: LineIntentOptions,
  ): LineIntent | undefined {
    const cleanPoints = sanitizePolyline(points);
    if (cleanPoints.length < 2) {
      return undefined;
    }

    const targetFormations = formationIds
      .map((id) => this.formations.find((formation) => formation.id === id))
      .filter(
        (formation): formation is Formation =>
          !!formation && formation.side === "rome" && formation.state !== "routing",
      );

    if (targetFormations.length === 0) {
      return undefined;
    }

    const assignments = this.planLineAssignments(targetFormations, cleanPoints, options);
    if (assignments.length === 0) {
      return undefined;
    }

    const intent = this.intentSystem.addLineIntent(
      "rome",
      cleanPoints,
      targetFormations.map((formation) => formation.id),
      options,
      this.time,
      assignments,
    );

    for (const assignment of assignments) {
      this.commands.issue(
        [assignment.formationId],
        "move",
        this.time,
        this.rng,
        assignment.targetCenter,
        assignment.targetFacing,
        {
          arrivalIntent: options.alignmentMode === "careful" ? "reform" : "hold",
          careful: options.alignmentMode === "careful",
          intentId: intent.id,
        },
      );
      this.telemetry.record({
        time: this.time,
        kind: "formation_command",
        message: `${assignment.formationId} line move`,
        data: { formation: assignment.formationId, intent: intent.id },
      });
    }

    this.pushEvent({
      time: this.time,
      kind: "command",
      message: `Frontline intent committed: ${assignments.length} formations`,
    });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "frontline committed",
      data: { intent: intent.id, count: assignments.length },
    });
    return intent;
  }

  issuePressureStrokeForSelection(points: Vec2[], strength = 0.75, radius = 14): PressureStroke | undefined {
    const ids = this.selectedFormations().map((formation) => formation.id);
    const cleanPoints = sanitizePolyline(points);
    if (ids.length === 0 || cleanPoints.length < 2) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid pressure stroke" });
      return undefined;
    }
    const intent = this.intentSystem.addPressureStroke("rome", cleanPoints, radius, strength, ids, this.time);
    this.pushEvent({ time: this.time, kind: "intent", message: `Pressure intent committed: ${ids.length} formations` });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "pressure committed",
      data: { intent: intent.id, count: ids.length },
    });
    return intent;
  }

  placeStandardForSelection(position: Vec2): Standard | undefined {
    const ids = this.selectedFormations().map((formation) => formation.id);
    if (ids.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid standard placement" });
      return undefined;
    }
    const intent = this.intentSystem.addStandard("rome", position, ids, this.time);
    this.pushEvent({ time: this.time, kind: "intent", message: "Standard placed" });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "standard placed",
      data: { intent: intent.id, count: ids.length },
    });
    return intent;
  }

  issueFallbackLineForSelection(points: Vec2[]): FallbackLine | undefined {
    const ids = this.selectedFormations().map((formation) => formation.id);
    const cleanPoints = sanitizePolyline(points);
    if (ids.length === 0 || cleanPoints.length < 2) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid fallback line" });
      return undefined;
    }
    const intent = this.intentSystem.addFallbackLine("rome", cleanPoints, ids, this.time);
    this.pushEvent({ time: this.time, kind: "intent", message: `Fallback line committed: ${ids.length} formations` });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "fallback committed",
      data: { intent: intent.id, count: ids.length },
    });
    return intent;
  }

  setContingencyForSelection(): ContingencyIntent | undefined {
    const ids = this.selectedFormations().map((formation) => formation.id);
    if (ids.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid contingency" });
      return undefined;
    }
    const intent = this.intentSystem.addContingency("rome", ids, this.time);
    this.pushEvent({ time: this.time, kind: "intent", message: `Contingency set: ${ids.length} formations` });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "contingency set",
      data: { intent: intent.id, count: ids.length },
    });
    return intent;
  }

  previewLineAssignments(points: Vec2[], options: LineIntentOptions): FrontlineAssignment[] {
    const cleanPoints = sanitizePolyline(points);
    if (cleanPoints.length < 2) {
      return [];
    }
    return this.planLineAssignments(
      this.selectedFormations().filter((formation) => formation.side === "rome" && formation.state !== "routing"),
      cleanPoints,
      options,
    );
  }

  undoLastIntent(side: SideId = "rome"): void {
    const removed = this.intentSystem.undoLastIntent(side);
    this.pushEvent({
      time: this.time,
      kind: "command",
      message: removed ? `${removed.kind} intent undone` : "No intent to undo",
    });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: removed ? `${removed.kind} undone` : "undo empty",
    });
  }

  toggleDebug(flag: keyof DebugFlags): void {
    this.debugFlags[flag] = !this.debugFlags[flag];
  }

  private centerOfSelected(): Vec2 {
    const selected = this.selectedFormations();
    if (selected.length === 0) {
      return { x: 0, y: 0 };
    }
    const sum = selected.reduce(
      (accumulator, formation) => ({
        x: accumulator.x + formation.center.x,
        y: accumulator.y + formation.center.y,
      }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / selected.length, y: sum.y / selected.length };
  }

  private planLineAssignments(
    formations: Formation[],
    points: Vec2[],
    options: LineIntentOptions,
  ): FrontlineAssignment[] {
    if (formations.length === 0) {
      return [];
    }

    const lineDirection = tangentAtPolyline(points, 0.5);
    const sorted = [...formations].sort(
      (a, b) => dot(sub(a.center, points[0]), lineDirection) - dot(sub(b.center, points[0]), lineDirection),
    );
    const enemyCentroid = this.enemyCentroidFor("rome");

    return sorted.map((formation, index) => {
      const t = sampleT(index, sorted.length, options.spacingMode);
      const targetCenter = samplePolyline(points, t);
      const tangent = tangentAtPolyline(points, t);
      const targetFacing = chooseFacingNormal(tangent, targetCenter, enemyCentroid, formation.side);
      const dimensions = intendedDimensions(formation, options);

      return {
        formationId: formation.id,
        targetCenter,
        targetFacing,
        width: dimensions.width,
        depth: dimensions.depth,
        index,
      };
    });
  }

  private enemyCentroidFor(side: SideId): Vec2 | undefined {
    const enemies = this.formations.filter((formation) => formation.side !== side && formation.state !== "routing");
    if (enemies.length === 0) {
      return undefined;
    }
    const sum = enemies.reduce(
      (accumulator, formation) => ({
        x: accumulator.x + formation.center.x,
        y: accumulator.y + formation.center.y,
      }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / enemies.length, y: sum.y / enemies.length };
  }

  private applyIntentInfluence(dt: number): void {
    for (const formation of this.formations) {
      const influence = this.intentSystem.getInfluenceForFormation(formation.side, formation.center);
      formation.intentPressure = influence.pressureStrength;
      formation.standardInfluence = influence.standardMorale;
      if (influence.standardMorale > 0) {
        formation.panic = clamp(formation.panic - dt * (0.045 + influence.standardMorale * 0.12), 0, 1.2);
        formation.pressure = clamp(formation.pressure - dt * (0.04 + influence.standardCommand * 0.08), 0, 1.4);
        formation.morale = clamp(formation.morale + dt * influence.standardMorale * 0.045, 0, 1);
        formation.discipline = clamp(formation.discipline + dt * influence.standardCommand * 0.025, 0, 1);
      }
    }
  }

  private pushEvent(event: SimEvent): void {
    this.replay.push([event]);
    this.recentEvents = this.replay.recent(SIM_CONFIG.maxRecentEvents);
  }

  private nearestEnemy(point: Vec2) {
    let best = this.formations.find((formation) => formation.side === "opposition");
    let bestDistance = best ? distance(point, best.center) : Number.POSITIVE_INFINITY;
    for (const formation of this.formations) {
      if (formation.side !== "opposition" || formation.state === "routing") continue;
      const candidateDistance = distance(point, formation.center);
      if (candidateDistance < bestDistance) {
        best = formation;
        bestDistance = candidateDistance;
      }
    }
    return best;
  }
}

function sanitizePolyline(points: Vec2[]): Vec2[] {
  const clean: Vec2[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }
    const previous = clean[clean.length - 1];
    if (!previous || distance(previous, point) > 0.12) {
      clean.push({ ...point });
    }
  }
  return clean;
}

function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

function samplePolyline(points: Vec2[], t: number): Vec2 {
  const total = polylineLength(points);
  if (total <= 0.001) {
    return { ...points[0] };
  }

  const targetDistance = total * Math.max(0, Math.min(1, t));
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = distance(start, end);
    if (walked + segmentLength >= targetDistance) {
      const localT = (targetDistance - walked) / Math.max(segmentLength, 0.001);
      return {
        x: lerp(start.x, end.x, localT),
        y: lerp(start.y, end.y, localT),
      };
    }
    walked += segmentLength;
  }

  return { ...points[points.length - 1] };
}

function tangentAtPolyline(points: Vec2[], t: number): Vec2 {
  const total = polylineLength(points);
  if (total <= 0.001) {
    return { x: 1, y: 0 };
  }

  const targetDistance = total * Math.max(0, Math.min(1, t));
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = distance(start, end);
    if (walked + segmentLength >= targetDistance || index === points.length - 1) {
      return normalize(sub(end, start));
    }
    walked += segmentLength;
  }
  return normalize(sub(points[points.length - 1], points[0]));
}

function sampleT(index: number, count: number, spacingMode: SpacingMode): number {
  if (count <= 1) {
    return 0.5;
  }
  const margin = spacingMode === "loose" ? 0.04 : spacingMode === "tight" ? 0.22 : 0.12;
  return lerp(margin, 1 - margin, index / (count - 1));
}

function chooseFacingNormal(
  tangent: Vec2,
  point: Vec2,
  enemyCentroid: Vec2 | undefined,
  side: SideId,
): number {
  const normalA = normalize({ x: tangent.y, y: -tangent.x });
  const normalB = scale(normalA, -1);
  const desired = enemyCentroid ? normalize(sub(enemyCentroid, point)) : side === "rome" ? { x: 0, y: 1 } : { x: 0, y: -1 };
  return angleOf(dot(normalA, desired) >= dot(normalB, desired) ? normalA : normalB);
}

function intendedDimensions(formation: Formation, options: LineIntentOptions): { width: number; depth: number } {
  if (options.depthMode === "deep") {
    // The visual slot relayout is still owned by formation setup; this records the intended shape for ghosts.
    return { width: formation.width * 0.82, depth: formation.depth * 1.24 };
  }
  if (options.depthMode === "thin") {
    return { width: formation.width * 1.12, depth: formation.depth * 0.88 };
  }
  return { width: formation.width, depth: formation.depth };
}
