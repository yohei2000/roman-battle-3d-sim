import * as THREE from "three";
import type { SimSnapshot } from "../sim/SimTypes";
import type { TerrainField } from "../sim/TerrainField";

export class EffectsRenderer {
  private readonly maxPoints = 160;
  private readonly positions = new Float32Array(this.maxPoints * 3);
  private readonly colors = new Float32Array(this.maxPoints * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;

  constructor(scene: THREE.Scene, private readonly terrain: TerrainField) {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
      size: 1.15,
      color: 0xd6c19a,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, material);
    scene.add(this.points);
  }

  update(snapshot: SimSnapshot): void {
    let cursor = 0;
    for (const engagement of snapshot.engagements) {
      const phaseBoost = engagement.phase === "surge" ? 1.8 : engagement.phase === "rupture" ? 2.2 : 0.8;
      for (const lane of engagement.contactLanes) {
        if (cursor >= this.maxPoints) break;
        const seed = Math.sin(snapshot.time * 8 + lane.index * 4.17) * 0.5 + 0.5;
        const spread = lane.width * (0.6 + seed * phaseBoost);
        const x = lane.worldPos.x + (seed - 0.5) * spread;
        const z = lane.worldPos.y + (Math.sin(seed * 9.2) - 0.5) * spread;
        const y = this.terrain.heightAt(x, z) + 0.18 + seed * 0.45;
        const i = cursor * 3;
        this.positions[i] = x;
        this.positions[i + 1] = y;
        this.positions[i + 2] = z;
        this.colors[i] = 0.68 + seed * 0.22;
        this.colors[i + 1] = 0.57 + seed * 0.16;
        this.colors[i + 2] = 0.4 + seed * 0.1;
        cursor += 1;
      }
    }
    this.geometry.setDrawRange(0, cursor);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
