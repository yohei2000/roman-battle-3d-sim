export type TelemetryKind =
  | "selection"
  | "lens"
  | "stroke"
  | "intent"
  | "formation_command"
  | "engagement_phase"
  | "recoil"
  | "rupture"
  | "rout"
  | "battle_result"
  | "invalid_command"
  | "pointercancel"
  | "command_focus_spent"
  | "command_focus_recovered"
  | "role_changed"
  | "reserve_committed"
  | "objective_captured"
  | "objective_lost"
  | "doctrine_selected"
  | "collapse_reason_recorded"
  | "standard_effect_applied";

export interface TelemetryEvent {
  time: number;
  kind: TelemetryKind;
  message: string;
  data?: Record<string, string | number | boolean | undefined>;
}

export class TelemetryCollector {
  private readonly events: TelemetryEvent[] = [];

  constructor(private readonly limit = 600) {}

  record(event: TelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.splice(0, this.events.length - this.limit);
    }
  }

  snapshot(): TelemetryEvent[] {
    return this.events.map((event) => ({ ...event, data: event.data ? { ...event.data } : undefined }));
  }

  count(kind?: TelemetryKind): number {
    return kind ? this.events.filter((event) => event.kind === kind).length : this.events.length;
  }
}
