import { pointInBox } from "../math/Geometry";
import { Rng } from "../math/Rng";
import { angleOf, clamp, distance, dot, lerp, normalize, scale, sub, type Vec2 } from "../math/Vec2";
import { createDefaultScenario } from "../../scenarios/defaultScenario";
import { AISystem } from "./AISystem";
import { CommandSystem } from "./CommandSystem";
import {
  COMMAND_COST,
  COMMAND_FOCUS_INITIAL,
  COMMAND_FOCUS_MAX,
  createDefaultObjectives,
  doctrineLabel,
  doctrineTraits,
  roleTraits,
} from "./ComplexityModel";
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
  ObjectiveFocusIntent,
  PressureStroke,
  ReserveIntent,
  SpacingMode,
  Standard,
} from "./IntentTypes";
import type {
  BattleDoctrine,
  CommandFocusState,
  DebugFlags,
  Formation,
  FormationIntent,
  FormationRole,
  ObjectiveZone,
  SideId,
  SimEvent,
  SimSnapshot,
} from "./SimTypes";

export interface SimWorldOptions {
  seed?: number;
  formations?: Formation[];
  objectives?: ObjectiveZone[];
  doctrine?: BattleDoctrine;
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
  readonly objectives: ObjectiveZone[];
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
  private readonly commandFocus: CommandFocusState = {
    current: COMMAND_FOCUS_INITIAL,
    max: COMMAND_FOCUS_MAX,
    recoveryRate: 0,
    predictedFiveSeconds: COMMAND_FOCUS_INITIAL,
    spent: 0,
    recovered: 0,
  };
  private doctrine: BattleDoctrine;
  private focusRecoveryAccumulator = 0;
  private readonly collapseReasons: Array<{ formationId: string; reason: string; time: number }> = [];
  time = 0;

  constructor(options: SimWorldOptions = {}) {
    this.formations = options.formations ?? createDefaultScenario();
    this.objectives = options.objectives ?? createDefaultObjectives();
    this.doctrine = options.doctrine ?? "hold_absorb";
    this.rng = new Rng(options.seed ?? 20260623);
    for (const formation of this.formations) {
      this.formationSystem.initializeSlots(formation);
    }
    this.formations[1].selected = true;
  }

  step(dt: number): void {
    this.time += dt;
    const events: SimEvent[] = [];
    this.decayComplexityInfluence(dt);
    this.updateObjectives(dt, events);
    this.recoverCommandFocus(dt);
    this.commands.consumeQueued(this.formations, events, this.time);
    this.commands.updateCommandDelay(this.formations, dt, events, this.time);
    this.intentSystem.clearExpired(this.time);
    this.applyIntentInfluence(dt);
    this.processReserveAutomation(events);
    this.ai.update(this.formations, this.commands, this.time, this.rng, events);
    this.movement.update(this.formations, this.terrain, dt);
    this.engagements.update(
      this.formations,
      this.terrain,
      this.rng,
      this.time,
      dt,
      events,
      this.intentSystem,
      this.telemetry,
      this.doctrine,
    );
    this.morale.update(
      this.formations,
      this.engagements.all(),
      dt,
      this.time,
      events,
      this.telemetry,
      this.commandFocus.current / this.commandFocus.max,
      this.doctrine,
    );
    this.collectCollapseReasons(events);
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
      commandFocus: this.commandFocusSnapshot(),
      doctrine: this.doctrine,
      objectives: this.objectiveSnapshot(),
      collapseReasons: this.collapseReasons.slice(-6).map((entry) => ({ ...entry })),
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

  setDoctrine(doctrine: BattleDoctrine): boolean {
    if (this.doctrine === doctrine) {
      return true;
    }
    const cost = COMMAND_COST.doctrine * doctrineTraits(this.doctrine).roleCost;
    if (!this.spendCommandFocus(cost, `doctrine:${doctrine}`)) {
      return false;
    }
    this.doctrine = doctrine;
    this.pushEvent({ time: this.time, kind: "doctrine", message: `Doctrine: ${doctrineLabel(doctrine)}` });
    this.telemetry.record({
      time: this.time,
      kind: "doctrine_selected",
      message: doctrineLabel(doctrine),
      data: { doctrine },
    });
    return true;
  }

  setRoleForSelection(role: FormationRole): boolean {
    const selected = this.selectedFormations().filter((formation) => formation.side === "rome" && formation.state !== "routing");
    if (selected.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "role change without selection" });
      return false;
    }
    const inCombat = selected.some((formation) => formation.currentEngagementIds.length > 0 || formation.state === "engaged");
    const base = inCombat ? COMMAND_COST.roleCombat : COMMAND_COST.roleCalm;
    const cost = base * selected.length * doctrineTraits(this.doctrine).roleCost;
    if (!this.spendCommandFocus(cost, `role:${role}`)) {
      return false;
    }
    for (const formation of selected) {
      formation.role = role;
      formation.reserveReleased = role === "reserve" ? false : true;
      formation.cohesion = clamp(formation.cohesion - (inCombat ? 0.08 : 0.025), 0, 1);
      formation.fatigue = clamp(formation.fatigue + (inCombat ? 0.08 : 0.025), 0, 1);
      this.telemetry.record({
        time: this.time,
        kind: "role_changed",
        message: `${formation.id} role ${role}`,
        data: { formation: formation.id, role },
      });
    }
    this.pushEvent({ time: this.time, kind: "command", message: `Role changed: ${role}` });
    return true;
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
      .filter((formation) => formation.role !== "reserve" || formation.reserveReleased || type === "hold" || type === "reform")
      .map((formation) => formation.id);
    if (ids.length === 0) {
      return;
    }
    if (!this.spendCommandFocus(COMMAND_COST.basic + ids.length * 1.1, `${type} command`)) {
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
    const selected = this.selectedFormations().filter((formation) => formation.state !== "routing");
    const movable = selected.filter((formation) => formation.role !== "reserve" || formation.reserveReleased);
    if (movable.length === 0 || !this.spendCommandFocus(COMMAND_COST.basic + movable.length * 1.3, "advance")) {
      return;
    }
    for (const formation of movable) {
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
    const eligibleFormations = targetFormations.filter((formation) => formation.role !== "reserve" || formation.reserveReleased);

    if (eligibleFormations.length === 0) {
      return undefined;
    }

    const assignments = this.planLineAssignments(eligibleFormations, cleanPoints, options);
    if (assignments.length === 0) {
      return undefined;
    }
    const cost = this.commandCost(COMMAND_COST.frontline, assignments.map((assignment) => assignment.formationId), "frontline");
    if (!this.spendCommandFocus(cost, "frontline")) {
      return undefined;
    }

    const intent = this.intentSystem.addLineIntent(
      "rome",
      cleanPoints,
      eligibleFormations.map((formation) => formation.id),
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
      const formation = this.formations.find((candidate) => candidate.id === assignment.formationId);
      if (formation) {
        formation.fatigue = clamp(formation.fatigue + 0.025, 0, 1);
        formation.cohesion = clamp(formation.cohesion - 0.018, 0, 1);
      }
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
    const ids = this.selectedFormations()
      .filter((formation) => formation.role !== "reserve" || formation.reserveReleased)
      .map((formation) => formation.id);
    const cleanPoints = sanitizePolyline(points);
    if (ids.length === 0 || cleanPoints.length < 2) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid pressure stroke" });
      return undefined;
    }
    if (!this.spendCommandFocus(this.commandCost(COMMAND_COST.pressure, ids, "pressure"), "pressure")) {
      return undefined;
    }
    for (const id of ids) {
      const formation = this.formations.find((candidate) => candidate.id === id);
      if (!formation) continue;
      formation.fatigue = clamp(formation.fatigue + 0.055, 0, 1);
      formation.cohesion = clamp(formation.cohesion - 0.035, 0, 1);
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
    if (!this.spendCommandFocus(this.commandCost(COMMAND_COST.standard, ids, "standard"), "standard")) {
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
    if (!this.spendCommandFocus(this.commandCost(COMMAND_COST.fallback, ids, "fallback"), "fallback")) {
      return undefined;
    }
    for (const id of ids) {
      const formation = this.formations.find((candidate) => candidate.id === id);
      if (!formation) continue;
      formation.panic = clamp(formation.panic - 0.04, 0, 1.2);
      formation.fatigue = clamp(formation.fatigue + 0.02, 0, 1);
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

  releaseReserveForSelection(condition: ReserveIntent["condition"] = "manual"): ReserveIntent | undefined {
    const selectedReserveIds = this.selectedFormations()
      .filter((formation) => formation.side === "rome" && formation.role === "reserve" && !formation.reserveReleased)
      .map((formation) => formation.id);
    const ids =
      selectedReserveIds.length > 0
        ? selectedReserveIds
        : this.formations
            .filter((formation) => formation.side === "rome" && formation.role === "reserve" && !formation.reserveReleased)
            .map((formation) => formation.id);
    return this.releaseReserve(ids, condition);
  }

  focusObjectiveForSelection(position?: Vec2): ObjectiveFocusIntent | undefined {
    const ids = this.selectedFormations()
      .filter((formation) => formation.side === "rome" && formation.state !== "routing")
      .map((formation) => formation.id);
    const objective = this.nearestObjective(position ?? this.centerOfSelected());
    if (!objective || ids.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid objective focus" });
      return undefined;
    }
    if (!this.spendCommandFocus(this.commandCost(COMMAND_COST.objective, ids, "objective"), `objective:${objective.id}`)) {
      return undefined;
    }
    for (const zone of this.objectives) {
      zone.focus = zone.id === objective.id;
    }
    const intent = this.intentSystem.addObjectiveFocus("rome", objective.id, objective.center, ids, this.time);
    ids.forEach((id, index) => {
      const offset = { x: (index - (ids.length - 1) * 0.5) * 7, y: 0 };
      this.commands.issue(
        [id],
        "move",
        this.time,
        this.rng,
        { x: objective.center.x + offset.x, y: objective.center.y - 8 },
        0,
        { arrivalIntent: "hold", intentId: intent.id },
      );
    });
    this.pushEvent({ time: this.time, kind: "objective", message: `Objective focus: ${objective.name}` });
    this.telemetry.record({
      time: this.time,
      kind: "intent",
      message: "objective focus committed",
      data: { intent: intent.id, objective: objective.id, count: ids.length },
    });
    return intent;
  }

  setContingencyForSelection(): ContingencyIntent | undefined {
    const ids = this.selectedFormations().map((formation) => formation.id);
    if (ids.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "invalid contingency" });
      return undefined;
    }
    if (!this.spendCommandFocus(COMMAND_COST.basic + ids.length, "contingency")) {
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
        if (formation.side === "rome" && this.time % 1 < dt) {
          this.telemetry.record({
            time: this.time,
            kind: "standard_effect_applied",
            message: `${formation.id} standard support`,
            data: { formation: formation.id, morale: influence.standardMorale },
          });
        }
      }
    }
  }

  private decayComplexityInfluence(dt: number): void {
    for (const formation of this.formations) {
      formation.reserveRelief = clamp(formation.reserveRelief - dt * 0.08, 0, 1);
      formation.objectiveSupport = 0;
    }
  }

  private updateObjectives(dt: number, events: SimEvent[]): void {
    const doctrine = doctrineTraits(this.doctrine);
    for (const objective of this.objectives) {
      const previousOwner = objective.owner;
      const romePower = objectivePower(this.formations, objective, "rome", doctrine.objectiveCapture);
      const oppositionPower = objectivePower(this.formations, objective, "opposition", 1);
      const diff = romePower - oppositionPower;
      objective.contested = romePower > 0.15 && oppositionPower > 0.15 && Math.abs(diff) < 0.45;
      if (Math.abs(diff) > 0.12) {
        const side: SideId = diff > 0 ? "rome" : "opposition";
        const other: SideId = side === "rome" ? "opposition" : "rome";
        objective.control[side] = clamp(objective.control[side] + dt * 0.16 * Math.abs(diff), 0, 1);
        objective.control[other] = clamp(objective.control[other] - dt * 0.11 * Math.abs(diff), 0, 1);
      }
      if (objective.control.rome > 0.62 && objective.control.rome > objective.control.opposition + 0.2) {
        objective.owner = "rome";
      } else if (objective.control.opposition > 0.62 && objective.control.opposition > objective.control.rome + 0.2) {
        objective.owner = "opposition";
      }
      if (objective.owner) {
        objective.controlTime[objective.owner] += dt;
      }
      if (objective.owner !== previousOwner) {
        if (previousOwner) {
          this.telemetry.record({
            time: this.time,
            kind: "objective_lost",
            message: `${objective.id} lost by ${previousOwner}`,
            data: { objective: objective.id, side: previousOwner },
          });
        }
        if (objective.owner) {
          events.push({ time: this.time, kind: "objective", message: `${objective.name} captured by ${objective.owner}` });
          this.telemetry.record({
            time: this.time,
            kind: "objective_captured",
            message: `${objective.id} captured`,
            data: { objective: objective.id, side: objective.owner },
          });
        }
      }
      for (const formation of this.formations) {
        if (objective.owner !== formation.side || distance(formation.center, objective.center) > objective.radius + 4) {
          continue;
        }
        const support = (objective.bonuses.cohesionRecovery ?? 0) + (objective.bonuses.visibility ?? 0) * 0.5;
        formation.objectiveSupport = clamp(formation.objectiveSupport + support, 0, 0.45);
        formation.cohesion = clamp(formation.cohesion + dt * support * 0.08, 0, 1);
        formation.panic = clamp(formation.panic - dt * support * 0.045, 0, 1.2);
      }
    }
  }

  private recoverCommandFocus(dt: number): void {
    const recovery = this.calculateFocusRecoveryRate();
    this.commandFocus.recoveryRate = recovery;
    const before = this.commandFocus.current;
    this.commandFocus.current = clamp(this.commandFocus.current + recovery * dt, 0, this.commandFocus.max);
    const recovered = this.commandFocus.current - before;
    this.commandFocus.recovered += recovered;
    this.focusRecoveryAccumulator += recovered;
    this.commandFocus.predictedFiveSeconds = clamp(this.commandFocus.current + recovery * 5, 0, this.commandFocus.max);
    if (this.focusRecoveryAccumulator >= 5) {
      const recoveredChunk = this.focusRecoveryAccumulator;
      this.commandFocus.lastRecovery = `${recovery.toFixed(1)}/s`;
      this.telemetry.record({
        time: this.time,
        kind: "command_focus_recovered",
        message: "command focus recovered",
        data: { current: this.commandFocus.current, rate: recovery, recovered: recoveredChunk },
      });
      this.focusRecoveryAccumulator = 0;
    }
  }

  private calculateFocusRecoveryRate(): number {
    const trait = doctrineTraits(this.doctrine);
    const ownedRecovery = this.objectives
      .filter((objective) => objective.owner === "rome")
      .reduce((sum, objective) => sum + (objective.bonuses.commandFocusRecovery ?? 0), 0);
    const standards = this.intentSystem.getSnapshot().standards.length * 0.22;
    const routingPenalty = this.formations.filter((formation) => formation.side === "rome" && formation.state === "routing").length * 0.42;
    const panicPenalty =
      this.formations
        .filter((formation) => formation.side === "rome")
        .reduce((sum, formation) => sum + formation.panic + formation.pressure * 0.2, 0) * 0.08;
    return clamp((2.25 + ownedRecovery + standards - routingPenalty - panicPenalty) * trait.focusRecovery, 0.35, 5.6);
  }

  private processReserveAutomation(events: SimEvent[]): void {
    const reserves = this.formations.filter(
      (formation) => formation.side === "rome" && formation.role === "reserve" && !formation.reserveReleased,
    );
    if (reserves.length === 0) {
      return;
    }
    const trait = doctrineTraits(this.doctrine);
    const risk = this.formations
      .filter((formation) => formation.side === "rome" && formation.role !== "reserve" && formation.state !== "routing")
      .map((formation) => ({
        formation,
        score: formation.panic + formation.pressure * 0.42 + formation.flankThreat * 0.55 + (1 - formation.cohesion) * 0.35,
      }))
      .sort((a, b) => b.score - a.score)[0];
    const enemyRouting = this.formations.some((formation) => formation.side === "opposition" && formation.state === "routing");
    const condition: ReserveIntent["condition"] | undefined =
      risk && risk.score > trait.reserveTrigger
        ? risk.formation.flankThreat > 0.7
          ? "flank_exposed"
          : "friendly_rupture"
        : enemyRouting && this.doctrine !== "hold_absorb"
          ? "enemy_routing"
          : undefined;
    if (!condition) {
      return;
    }
    if (this.doctrine !== "flexible_reserve" && condition !== "flank_exposed") {
      return;
    }
    const intent = this.releaseReserve([reserves[0].id], condition, risk?.formation.center);
    if (intent) {
      events.push({ time: this.time, kind: "command", message: `Reserve auto-release: ${condition}` });
    }
  }

  private releaseReserve(
    ids: string[],
    condition: ReserveIntent["condition"],
    target?: Vec2,
  ): ReserveIntent | undefined {
    const reserveIds = ids.filter((id) => {
      const formation = this.formations.find((candidate) => candidate.id === id);
      return !!formation && formation.role === "reserve" && !formation.reserveReleased && formation.state !== "routing";
    });
    if (reserveIds.length === 0) {
      this.telemetry.record({ time: this.time, kind: "invalid_command", message: "no reserve available" });
      return undefined;
    }
    const cost = this.commandCost(COMMAND_COST.reserve, reserveIds, "reserve");
    if (!this.spendCommandFocus(cost, `reserve:${condition}`)) {
      return undefined;
    }
    const releaseTarget = target ?? this.reserveTarget();
    const intent = this.intentSystem.addReserveIntent("rome", condition, reserveIds, this.time, releaseTarget);
    for (const [index, id] of reserveIds.entries()) {
      const formation = this.formations.find((candidate) => candidate.id === id);
      if (!formation) continue;
      formation.reserveReleased = true;
      formation.morale = clamp(formation.morale + 0.1, 0, 1);
      formation.cohesion = clamp(formation.cohesion + 0.08, 0, 1);
      const targetCenter = {
        x: releaseTarget.x + (index - (reserveIds.length - 1) * 0.5) * 7,
        y: releaseTarget.y - 7,
      };
      this.commands.issue([id], "advance", this.time, this.rng, targetCenter, 0, {
        arrivalIntent: "hold",
        intentId: intent.id,
      });
    }
    for (const ally of this.formations.filter((formation) => formation.side === "rome")) {
      if (distance(ally.center, releaseTarget) > 34) continue;
      ally.reserveRelief = clamp(ally.reserveRelief + 0.65, 0, 1);
      ally.panic = clamp(ally.panic - 0.1, 0, 1.2);
      ally.morale = clamp(ally.morale + 0.035, 0, 1);
    }
    this.pushEvent({ time: this.time, kind: "intent", message: `Reserve committed: ${condition}` });
    this.telemetry.record({
      time: this.time,
      kind: "reserve_committed",
      message: `reserve ${condition}`,
      data: { count: reserveIds.length, condition },
    });
    return intent;
  }

  private reserveTarget(): Vec2 {
    const threatened = this.formations
      .filter((formation) => formation.side === "rome" && formation.role !== "reserve" && formation.state !== "routing")
      .slice()
      .sort(
        (a, b) =>
          b.panic + b.pressure + b.flankThreat + (1 - b.cohesion) -
          (a.panic + a.pressure + a.flankThreat + (1 - a.cohesion)),
      )[0];
    if (threatened) {
      return { ...threatened.center };
    }
    return this.enemyCentroidFor("rome") ?? { x: 0, y: -4 };
  }

  private commandCost(base: number, ids: string[], kind: "frontline" | "pressure" | "fallback" | "standard" | "reserve" | "objective"): number {
    const doctrine = doctrineTraits(this.doctrine);
    const roleMultiplier =
      ids.reduce((sum, id) => {
        const formation = this.formations.find((candidate) => candidate.id === id);
        return sum + (formation ? roleTraits(formation.role).commandCost : 1);
      }, 0) / Math.max(1, ids.length);
    const doctrineMultiplier =
      kind === "frontline"
        ? doctrine.frontlineCost
        : kind === "pressure"
          ? doctrine.pressureCost
          : kind === "reserve"
            ? doctrine.reserveCost
            : 1;
    return (base + ids.length * 1.8) * roleMultiplier * doctrineMultiplier;
  }

  private spendCommandFocus(cost: number, reason: string): boolean {
    if (this.commandFocus.current + 0.001 < cost) {
      this.commandFocus.lastSpend = `Need ${cost.toFixed(0)} for ${reason}`;
      this.telemetry.record({
        time: this.time,
        kind: "invalid_command",
        message: "low command focus",
        data: { current: this.commandFocus.current, cost, reason },
      });
      return false;
    }
    this.commandFocus.current = clamp(this.commandFocus.current - cost, 0, this.commandFocus.max);
    this.commandFocus.spent += cost;
    this.commandFocus.lastSpend = `${reason} -${cost.toFixed(0)}`;
    this.telemetry.record({
      time: this.time,
      kind: "command_focus_spent",
      message: reason,
      data: { cost, current: this.commandFocus.current },
    });
    return true;
  }

  private collectCollapseReasons(events: SimEvent[]): void {
    for (const event of events) {
      if (event.kind !== "morale" || !event.formationId) {
        continue;
      }
      const formation = this.formations.find((candidate) => candidate.id === event.formationId);
      const reason = formation?.collapseReason ?? "morale collapse";
      this.collapseReasons.push({ formationId: event.formationId, reason, time: this.time });
      if (this.collapseReasons.length > 24) {
        this.collapseReasons.splice(0, this.collapseReasons.length - 24);
      }
      this.telemetry.record({
        time: this.time,
        kind: "collapse_reason_recorded",
        message: reason,
        data: { formation: event.formationId },
      });
    }
  }

  private commandFocusSnapshot(): CommandFocusState {
    return { ...this.commandFocus };
  }

  private objectiveSnapshot(): ObjectiveZone[] {
    return this.objectives.map((objective) => ({
      ...objective,
      center: { ...objective.center },
      control: { ...objective.control },
      controlTime: { ...objective.controlTime },
      bonuses: { ...objective.bonuses },
    }));
  }

  private nearestObjective(point: Vec2): ObjectiveZone | undefined {
    return this.objectives
      .slice()
      .sort((a, b) => distance(a.center, point) - distance(b.center, point))[0];
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

function objectivePower(formations: Formation[], objective: ObjectiveZone, side: SideId, doctrineCapture: number): number {
  const focusMultiplier = objective.focus && side === "rome" ? 2.35 : side === "rome" ? 0.9 : 1;
  return formations
    .filter(
      (formation) =>
        formation.side === side &&
        formation.state !== "routing" &&
        (formation.role !== "reserve" || formation.reserveReleased) &&
        distance(formation.center, objective.center) <= objective.radius,
    )
    .reduce((sum, formation) => {
      const quality = formation.morale + formation.cohesion - formation.panic * 0.6;
      return sum + quality * roleTraits(formation.role).objectiveCapture * doctrineCapture * focusMultiplier;
    }, 0);
}
