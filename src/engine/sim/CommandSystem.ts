import { fromAngle } from "../math/Vec2";
import { SIM_CONFIG } from "./SimConfig";
import type { Formation, FormationCommand, FormationIntent, SimEvent } from "./SimTypes";
import type { Rng } from "../math/Rng";

export class CommandSystem {
  private nextCommandId = 1;
  private readonly queue: FormationCommand[] = [];

  issue(
    formationIds: string[],
    type: FormationIntent,
    time: number,
    rng: Rng,
    targetCenter?: { x: number; y: number },
    targetFacing?: number,
  ): void {
    this.queue.push({
      id: this.nextCommandId,
      formationIds,
      type,
      targetCenter,
      targetFacing,
      issuedAt: time,
      delay: rng.range(SIM_CONFIG.commandDelayMin, SIM_CONFIG.commandDelayMax),
    });
    this.nextCommandId += 1;
  }

  consumeQueued(formations: Formation[], events: SimEvent[], time: number): void {
    while (this.queue.length > 0) {
      const command = this.queue.shift();
      if (!command) continue;
      for (const id of command.formationIds) {
        const formation = formations.find((candidate) => candidate.id === id);
        if (!formation || formation.state === "routing") {
          continue;
        }
        formation.pendingCommand = { ...command };
        formation.commandDelay = command.delay;
        events.push({
          time,
          kind: "command",
          formationId: id,
          message: `${formation.name}: ${command.type.toUpperCase()} queued`,
        });
      }
    }
  }

  updateCommandDelay(formations: Formation[], dt: number, events: SimEvent[], time: number): void {
    for (const formation of formations) {
      if (!formation.pendingCommand) {
        formation.commandDelay = Math.max(0, formation.commandDelay - dt);
        continue;
      }

      formation.pendingCommand.delay -= dt;
      formation.commandDelay = Math.max(0, formation.pendingCommand.delay);

      if (formation.pendingCommand.delay > 0) {
        continue;
      }

      const command = formation.pendingCommand;
      formation.pendingCommand = undefined;
      formation.intent = command.type;

      if (command.targetCenter) {
        formation.targetCenter = { ...command.targetCenter };
      }

      if (command.targetFacing !== undefined) {
        formation.targetFacing = command.targetFacing;
      } else if (command.targetCenter) {
        const direction = {
          x: command.targetCenter.x - formation.center.x,
          y: command.targetCenter.y - formation.center.y,
        };
        if (Math.hypot(direction.x, direction.y) > 0.1) {
          formation.targetFacing = Math.atan2(direction.x, direction.y);
        }
      }

      if (command.type === "hold") {
        formation.targetCenter = { ...formation.center };
        formation.targetFacing = formation.facing;
        formation.state = "holding";
      } else if (command.type === "reform") {
        formation.targetCenter = { ...formation.center };
        formation.targetFacing = formation.facing;
        formation.state = "reforming";
      } else if (command.type === "retreat") {
        const away = fromAngle(formation.facing + Math.PI);
        formation.targetCenter = {
          x: formation.center.x + away.x * 26,
          y: formation.center.y + away.y * 26,
        };
        formation.targetFacing = formation.facing + Math.PI;
        formation.state = "moving";
        formation.cohesion = Math.max(0.1, formation.cohesion - 0.08);
      } else {
        formation.state = "moving";
      }

      events.push({
        time,
        kind: "command",
        formationId: formation.id,
        message: `${formation.name}: ${command.type.toUpperCase()} active`,
      });
    }
  }
}
