import type { Vec2 } from "../engine/math/Vec2";
import type { SimWorld } from "../engine/sim/SimWorld";
import type { EvaluationAgent } from "./EvaluationAgent";

function friendlyIds(world: SimWorld): string[] {
  return world.formations.filter((formation) => formation.side === "rome").map((formation) => formation.id);
}

function enemyCentroid(world: SimWorld): Vec2 {
  const enemies = world.formations.filter((formation) => formation.side === "opposition");
  const sum = enemies.reduce((acc, formation) => ({ x: acc.x + formation.center.x, y: acc.y + formation.center.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / Math.max(1, enemies.length), y: sum.y / Math.max(1, enemies.length) };
}

export class NoOpAgent implements EvaluationAgent {
  id = "noop";
  name = "NoOp";
  start(world: SimWorld): void {
    world.selectFormationIds(friendlyIds(world));
  }
  update(): void {}
}

export class FrontalAttackAgent implements EvaluationAgent {
  id = "frontal";
  name = "Frontal Attack";
  private issued = false;
  start(world: SimWorld): void {
    world.selectFormationIds(friendlyIds(world));
  }
  update(world: SimWorld): void {
    if (this.issued) return;
    this.issued = true;
    world.advanceSelected();
  }
}

export class DrawFrontlineAgent implements EvaluationAgent {
  id = "draw-frontline";
  name = "Draw Frontline";
  private issued = false;
  start(world: SimWorld): void {
    world.selectFormationIds(friendlyIds(world));
  }
  update(world: SimWorld): void {
    if (this.issued) return;
    this.issued = true;
    world.issueLineFormation(friendlyIds(world), [{ x: -34, y: -8 }, { x: 0, y: -11 }, { x: 34, y: -8 }], {
      spacingMode: "loose",
      depthMode: "normal",
      alignmentMode: "careful",
    });
  }
}

export class PressureAgent implements EvaluationAgent {
  id = "pressure";
  name = "Frontline + Pressure";
  private pressureIssued = false;
  start(world: SimWorld): void {
    world.selectFormationIds(friendlyIds(world));
    world.issueLineFormation(friendlyIds(world), [{ x: -32, y: -6 }, { x: 0, y: -9 }, { x: 32, y: -6 }], {
      spacingMode: "normal",
      depthMode: "normal",
      alignmentMode: "careful",
    });
  }
  update(world: SimWorld, time: number): void {
    if (this.pressureIssued || time < 11) return;
    this.pressureIssued = true;
    world.selectFormationIds(friendlyIds(world));
    const enemy = enemyCentroid(world);
    world.issuePressureStrokeForSelection([
      { x: enemy.x - 24, y: enemy.y - 18 },
      { x: enemy.x, y: enemy.y - 22 },
      { x: enemy.x + 24, y: enemy.y - 18 },
    ]);
  }
}

export class FallbackAgent implements EvaluationAgent {
  id = "fallback";
  name = "Frontline + Fallback";
  private issued = false;
  start(world: SimWorld): void {
    world.selectFormationIds(friendlyIds(world));
    world.issueFallbackLineForSelection([{ x: -36, y: -42 }, { x: 0, y: -46 }, { x: 36, y: -42 }]);
  }
  update(world: SimWorld): void {
    if (this.issued) return;
    this.issued = true;
    world.issueLineFormation(friendlyIds(world), [{ x: -30, y: -10 }, { x: 0, y: -12 }, { x: 30, y: -10 }], {
      spacingMode: "loose",
      depthMode: "deep",
      alignmentMode: "careful",
    });
  }
}

export function createAgents(): EvaluationAgent[] {
  return [
    new NoOpAgent(),
    new FrontalAttackAgent(),
    new DrawFrontlineAgent(),
    new PressureAgent(),
    new FallbackAgent(),
  ];
}
