import type { SimEvent } from "./SimTypes";

export class ReplayRecorder {
  private readonly events: SimEvent[] = [];
  private readonly limit = 300;

  push(events: SimEvent[]): void {
    this.events.push(...events);
    if (this.events.length > this.limit) {
      this.events.splice(0, this.events.length - this.limit);
    }
  }

  recent(count: number): SimEvent[] {
    return this.events.slice(-count);
  }
}
