import type { SimWorld } from "../engine/sim/SimWorld";

export interface EvaluationAgent {
  id: string;
  name: string;
  start(world: SimWorld): void;
  update(world: SimWorld, time: number): void;
}
