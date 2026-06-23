import type {
  FrontlineAssignment,
  FallbackLine,
  IntentInfluence,
  IntentSnapshot,
  LineIntent,
  LineIntentOptions,
  PressureStroke,
  Standard,
  TacticalIntent,
} from "./IntentTypes";
import { distance, type Vec2 } from "../math/Vec2";
import type { SideId as SimSideId } from "./SimTypes";

export class IntentSystem {
  private nextIntentId = 1;
  private readonly intents: TacticalIntent[] = [];
  private revision = 0;
  private lastStatus?: string;

  addLineIntent(
    side: SimSideId,
    points: Vec2[],
    formationIds: string[],
    options: LineIntentOptions,
    createdAt: number,
    assignments: FrontlineAssignment[],
  ): LineIntent {
    const intent: LineIntent = {
      id: this.nextIntentId,
      kind: "frontline",
      side,
      points: clonePoints(points),
      formationIds: [...formationIds],
      spacingMode: options.spacingMode,
      depthMode: options.depthMode,
      alignmentMode: options.alignmentMode,
      createdAt,
      committed: true,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        targetCenter: { ...assignment.targetCenter },
      })),
    };

    this.nextIntentId += 1;
    this.intents.push(intent);
    this.lastStatus = `Frontline intent committed: ${formationIds.length} formations`;
    this.revision += 1;
    return intent;
  }

  addPressureStroke(
    side: SimSideId,
    points: Vec2[],
    radius: number,
    strength: number,
    formationIds: string[],
    createdAt: number,
    expiresAt = createdAt + 35,
  ): PressureStroke {
    const intent: PressureStroke = {
      id: this.nextIntentId,
      kind: "pressure_stroke",
      side,
      points: clonePoints(points),
      radius,
      strength,
      formationIds: [...formationIds],
      createdAt,
      expiresAt,
    };
    this.nextIntentId += 1;
    this.intents.push(intent);
    this.lastStatus = `Pressure intent committed: ${formationIds.length} formations`;
    this.revision += 1;
    return intent;
  }

  addStandard(
    side: SimSideId,
    position: Vec2,
    attachedFormationIds: string[],
    createdAt: number,
    radius = 22,
    moraleBonus = 0.16,
    commandBonus = 0.12,
  ): Standard {
    const intent: Standard = {
      id: this.nextIntentId,
      kind: "standard",
      side,
      position: { ...position },
      radius,
      moraleBonus,
      commandBonus,
      attachedFormationIds: [...attachedFormationIds],
      createdAt,
    };
    this.nextIntentId += 1;
    this.intents.push(intent);
    this.lastStatus = "Standard placed";
    this.revision += 1;
    return intent;
  }

  addFallbackLine(side: SimSideId, points: Vec2[], formationIds: string[], createdAt: number): FallbackLine {
    const intent: FallbackLine = {
      id: this.nextIntentId,
      kind: "fallback_line",
      side,
      points: clonePoints(points),
      formationIds: [...formationIds],
      createdAt,
    };
    this.nextIntentId += 1;
    this.intents.push(intent);
    this.lastStatus = `Fallback line committed: ${formationIds.length} formations`;
    this.revision += 1;
    return intent;
  }

  getInfluenceForFormation(side: SimSideId, position: Vec2): IntentInfluence {
    const influence: IntentInfluence = {
      pressureStrength: 0,
      standardMorale: 0,
      standardCommand: 0,
      fallbackAvailable: false,
    };

    for (const intent of this.intents) {
      if (!("side" in intent) || intent.side !== side) {
        continue;
      }
      if (intent.kind === "pressure_stroke") {
        influence.pressureStrength += influenceFromLine(position, intent.points, intent.radius) * intent.strength;
      } else if (intent.kind === "standard") {
        const falloff = Math.max(0, 1 - distance(position, intent.position) / intent.radius);
        influence.standardMorale += falloff * intent.moraleBonus;
        influence.standardCommand += falloff * intent.commandBonus;
      } else if (intent.kind === "fallback_line") {
        influence.fallbackAvailable ||= influenceFromLine(position, intent.points, 28) > 0.05;
      }
    }

    influence.pressureStrength = Math.min(1, influence.pressureStrength);
    influence.standardMorale = Math.min(0.35, influence.standardMorale);
    influence.standardCommand = Math.min(0.3, influence.standardCommand);
    return influence;
  }

  removeIntent(id: number): TacticalIntent | undefined {
    const index = this.intents.findIndex((intent) => intent.id === id);
    if (index < 0) {
      return undefined;
    }
    const [removed] = this.intents.splice(index, 1);
    this.lastStatus = `${removed.kind} intent removed`;
    this.revision += 1;
    return removed;
  }

  undoLastIntent(side?: SimSideId): TacticalIntent | undefined {
    for (let index = this.intents.length - 1; index >= 0; index -= 1) {
      const intent = this.intents[index];
      if (!side || intentHasSide(intent, side)) {
        const [removed] = this.intents.splice(index, 1);
        this.lastStatus = `${removed.kind} intent undone`;
        this.revision += 1;
        return removed;
      }
    }
    this.lastStatus = "No intent to undo";
    this.revision += 1;
    return undefined;
  }

  clearExpired(time: number): void {
    const before = this.intents.length;
    for (let index = this.intents.length - 1; index >= 0; index -= 1) {
      const intent = this.intents[index];
      if ("expiresAt" in intent && intent.expiresAt !== undefined && intent.expiresAt <= time) {
        this.intents.splice(index, 1);
      }
    }
    if (this.intents.length !== before) {
      this.revision += 1;
    }
  }

  getSnapshot(): IntentSnapshot {
    const intents = this.intents.map(cloneIntent);
    return {
      intents,
      committedFrontlines: intents.filter((intent): intent is LineIntent => intent.kind === "frontline"),
      pressureStrokes: intents.filter((intent): intent is PressureStroke => intent.kind === "pressure_stroke"),
      standards: intents.filter((intent): intent is Standard => intent.kind === "standard"),
      fallbackLines: intents.filter((intent): intent is FallbackLine => intent.kind === "fallback_line"),
      revision: this.revision,
      lastStatus: this.lastStatus,
    };
  }
}

function clonePoints(points: Vec2[]): Vec2[] {
  return points.map((point) => ({ ...point }));
}

function cloneIntent(intent: TacticalIntent): TacticalIntent {
  if (intent.kind === "frontline") {
    return {
      ...intent,
      points: clonePoints(intent.points),
      formationIds: [...intent.formationIds],
      assignments: intent.assignments.map((assignment) => ({
        ...assignment,
        targetCenter: { ...assignment.targetCenter },
      })),
    };
  }
  if (intent.kind === "pressure_stroke" || intent.kind === "fallback_line") {
    return { ...intent, points: clonePoints(intent.points), formationIds: [...intent.formationIds] };
  }
  if (intent.kind === "standard") {
    return {
      ...intent,
      position: { ...intent.position },
      attachedFormationIds: [...intent.attachedFormationIds],
    };
  }
  return { ...intent, formationIds: [...intent.formationIds] };
}

function intentHasSide(intent: TacticalIntent, side: SimSideId): boolean {
  return "side" in intent && intent.side === side;
}

function influenceFromLine(position: Vec2, points: Vec2[], radius: number): number {
  if (points.length === 0 || radius <= 0) {
    return 0;
  }
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    closest = Math.min(closest, distanceToSegment(position, points[index - 1], points[index]));
  }
  if (points.length === 1) {
    closest = distance(position, points[0]);
  }
  return Math.max(0, 1 - closest / radius);
}

function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ap = { x: point.x - a.x, y: point.y - a.y };
  const lengthSq = ab.x * ab.x + ab.y * ab.y;
  const t = lengthSq <= 0.0001 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / lengthSq));
  const projected = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance(point, projected);
}
