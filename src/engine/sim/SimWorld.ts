import { pointInBox } from "../math/Geometry";
import { Rng } from "../math/Rng";
import { angleOf, clamp, distance, normalize, sub, type Vec2 } from "../math/Vec2";
import { createDefaultScenario } from "../../scenarios/defaultScenario";
import { AISystem } from "./AISystem";
import { CommandSystem } from "./CommandSystem";
import { EngagementSystem } from "./EngagementSystem";
import { FormationSystem } from "./FormationSystem";
import { MoraleSystem } from "./MoraleSystem";
import { MovementSystem } from "./MovementSystem";
import { ReplayRecorder } from "./ReplayRecorder";
import { SIM_CONFIG } from "./SimConfig";
import { TerrainField } from "./TerrainField";
import type { DebugFlags, FormationIntent, SimEvent, SimSnapshot } from "./SimTypes";

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
