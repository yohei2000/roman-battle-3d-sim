import type {
  FrontlineAssignment,
  IntentSnapshot,
  LineIntent,
  LineIntentOptions,
  TacticalIntent,
} from "./IntentTypes";
import type { Vec2 } from "../math/Vec2";
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
