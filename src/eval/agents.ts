import type { Vec2 } from "../engine/math/Vec2";
import type { SimWorld } from "../engine/sim/SimWorld";
import type { EvaluationAgent } from "./EvaluationAgent";

function friendlyIds(world: SimWorld): string[] {
  return world.formations.filter((formation) => formation.side === "rome").map((formation) => formation.id);
}

function lineIds(world: SimWorld): string[] {
  return world.formations
    .filter((formation) => formation.side === "rome" && (formation.role !== "reserve" || formation.reserveReleased))
    .map((formation) => formation.id);
}

function reserveIds(world: SimWorld): string[] {
  return world.formations
    .filter((formation) => formation.side === "rome" && formation.role === "reserve")
    .map((formation) => formation.id);
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
    world.selectFormationIds(lineIds(world));
  }
  update(): void {}
}

export class FrontalAttackAgent implements EvaluationAgent {
  id = "frontal";
  name = "Frontal Attack";
  private issued = false;
  start(world: SimWorld): void {
    world.selectFormationIds(lineIds(world));
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
    world.selectFormationIds(lineIds(world));
  }
  update(world: SimWorld): void {
    if (this.issued) return;
    this.issued = true;
    world.issueLineFormation(lineIds(world), [{ x: -34, y: -8 }, { x: 0, y: -11 }, { x: 34, y: -8 }], {
      spacingMode: "loose",
      depthMode: "normal",
      alignmentMode: "careful",
    });
  }
}

export class ReserveAgent implements EvaluationAgent {
  id = "reserve";
  name = "Reserve Timing";
  private pressureIssued = false;
  private reserveIssued = false;
  start(world: SimWorld): void {
    world.setDoctrine("flexible_reserve");
    world.selectFormationIds(lineIds(world));
    world.issueLineFormation(lineIds(world), [{ x: -32, y: -8 }, { x: 0, y: -11 }, { x: 32, y: -8 }], {
      spacingMode: "normal",
      depthMode: "normal",
      alignmentMode: "careful",
    });
    world.issueFallbackLineForSelection([{ x: -36, y: -42 }, { x: 0, y: -46 }, { x: 36, y: -42 }]);
  }
  update(world: SimWorld, time: number): void {
    if (!this.pressureIssued && time > 9) {
      this.pressureIssued = true;
      world.selectFormationIds(lineIds(world));
      const enemy = enemyCentroid(world);
      world.issuePressureStrokeForSelection([
        { x: enemy.x - 24, y: enemy.y - 18 },
        { x: enemy.x, y: enemy.y - 22 },
        { x: enemy.x + 24, y: enemy.y - 18 },
      ]);
    }
    if (!this.reserveIssued && time > 14) {
      this.reserveIssued = true;
      world.selectFormationIds(reserveIds(world));
      world.releaseReserveForSelection("manual");
    }
  }
}

export class ObjectiveAgent implements EvaluationAgent {
  id = "objective";
  name = "Objective Focus";
  private pressureIssued = false;
  start(world: SimWorld): void {
    world.setDoctrine("refuse_flank");
    world.selectFormationIds(lineIds(world));
    world.focusObjectiveForSelection({ x: 0, y: -6 });
  }
  update(world: SimWorld, time: number): void {
    if (this.pressureIssued || time < 12) return;
    this.pressureIssued = true;
    world.selectFormationIds(lineIds(world));
    const enemy = enemyCentroid(world);
    world.issuePressureStrokeForSelection([
      { x: enemy.x - 18, y: enemy.y - 16 },
      { x: enemy.x + 18, y: enemy.y - 16 },
    ]);
  }
}

export class DoctrineMixAgent implements EvaluationAgent {
  id = "doctrine-mix";
  name = "Doctrine Mix";
  private reserveIssued = false;
  private pressureIssued = false;
  start(world: SimWorld): void {
    world.setDoctrine("center_push");
    world.selectFormationIds(lineIds(world));
    world.setRoleForSelection("center");
    world.issueLineFormation(lineIds(world), [{ x: -28, y: -8 }, { x: 0, y: -14 }, { x: 28, y: -8 }], {
      spacingMode: "loose",
      depthMode: "deep",
      alignmentMode: "careful",
    });
    world.placeStandardForSelection({ x: 0, y: -26 });
  }
  update(world: SimWorld, time: number): void {
    if (!this.pressureIssued && time > 8) {
      this.pressureIssued = true;
      world.selectFormationIds(lineIds(world));
      const enemy = enemyCentroid(world);
      world.issuePressureStrokeForSelection([
        { x: enemy.x - 20, y: enemy.y - 20 },
        { x: enemy.x, y: enemy.y - 23 },
        { x: enemy.x + 20, y: enemy.y - 20 },
      ]);
    }
    if (!this.reserveIssued && time > 18) {
      this.reserveIssued = true;
      world.setDoctrine("flexible_reserve");
      world.selectFormationIds(reserveIds(world));
      world.releaseReserveForSelection("manual");
    }
  }
}

export function createAgents(): EvaluationAgent[] {
  return [
    new NoOpAgent(),
    new FrontalAttackAgent(),
    new DrawFrontlineAgent(),
    new ReserveAgent(),
    new ObjectiveAgent(),
    new DoctrineMixAgent(),
  ];
}
