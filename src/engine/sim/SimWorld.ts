import { pointInBox } from "../math/Geometry";
import { Rng } from "../math/Rng";
import { angleOf, distance, dot, lerp, normalize, scale, sub, type Vec2 } from "../math/Vec2";
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
import type {
  FrontlineAssignment,
  IntentSnapshot,
  LineIntent,
  LineIntentOptions,
  SpacingMode,
} from "./IntentTypes";
import type { DebugFlags, Formation, FormationIntent, SideId, SimEvent, SimSnapshot } from "./SimTypes";

export class SimWorld {
  readonly terrain = new TerrainField();
  readonly debugFlags: DebugFlags = {
    bounds: true,
    fronts: true,
    contactLanes: true,
    labels: true,
    pressureLabels: false,
  };

  readonly formations = createDefaultScenario();
  private readonly rng = new Rng(20260623);
  private readonly commands = new CommandSystem();
  private readonly movement = new MovementSystem();
  private readonly engagements = new EngagementSystem();
  private readonly morale = new MoraleSystem();
  private readonly ai = new AISystem();
  private readonly formationSystem = new FormationSystem();
  private readonly intentSystem = new IntentSystem();
  private readonly replay = new ReplayRecorder();
  private recentEvents: SimEvent[] = [];
  time = 0;

  constructor() {
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
    this.ai.update(this.formations, this.commands, this.time, this.rng, events);
    this.movement.update(this.formations, this.terrain, dt);
    this.engagements.update(this.formations, this.terrain, this.rng, this.time, dt, events);
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
      });
      return;
    }

    this.commands.issue(ids, type, this.time, this.rng);
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
          !!formation &&
          formation.side === "rome" &&
          formation.selected &&
          formation.state !== "routing",
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
    }

    this.pushEvent({
      time: this.time,
      kind: "command",
      message: `Frontline intent committed: ${assignments.length} formations`,
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
