import { clamp, type Vec2 } from "../math/Vec2";
import type { TerrainSample } from "./SimTypes";

export class TerrainField {
  readonly size = 160;

  heightAt(x: number, z: number): number {
    const broad = Math.sin(x * 0.045 + 1.7) * 1.15 + Math.cos(z * 0.052 - 0.8) * 0.95;
    const ridge = Math.sin((x + z) * 0.032) * 1.8;
    const undulation = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.45;
    return broad + ridge + undulation;
  }

  sample(x: number, z: number): TerrainSample {
    const height = this.heightAt(x, z);
    const step = 1.5;
    const dx = (this.heightAt(x + step, z) - this.heightAt(x - step, z)) / (step * 2);
    const dz = (this.heightAt(x, z + step) - this.heightAt(x, z - step)) / (step * 2);
    const slope = clamp(Math.hypot(dx, dz), 0, 1.25);
    const ridgeMix = clamp((height + 2) / 7, 0, 1);
    const scrub = Math.sin(x * 0.21 + z * 0.17) > 0.58;

    return {
      height,
      slope,
      moveCost: 1 + slope * 1.35 + (scrub ? 0.18 : 0),
      cohesionCost: slope * 0.09 + (scrub ? 0.025 : 0),
      visibility: clamp(0.82 + ridgeMix * 0.18 - slope * 0.18, 0.45, 1),
      groundType: ridgeMix > 0.72 ? "ridge" : scrub ? "scrub" : "grass",
    };
  }

  sampleVec(point: Vec2): TerrainSample {
    return this.sample(point.x, point.y);
  }
}
