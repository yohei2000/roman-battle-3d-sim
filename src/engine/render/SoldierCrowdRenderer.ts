import * as THREE from "three";
import {
  createShieldMaterial,
  createSoldierMaterial,
  createSpearMaterial,
} from "../content/Materials";
import {
  createShieldGeometry,
  createSoldierBodyGeometry,
  createSpearGeometry,
} from "../content/ProceduralMeshes";
import { fromAngle, rightFromFacing } from "../math/Vec2";
import type { Formation } from "../sim/SimTypes";
import type { TerrainField } from "../sim/TerrainField";

interface CrowdBatch {
  body: THREE.InstancedMesh;
  shield: THREE.InstancedMesh;
  spear: THREE.InstancedMesh;
}

export class SoldierCrowdRenderer {
  private readonly batches = new Map<string, CrowdBatch>();
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly scene: THREE.Scene, private readonly terrain: TerrainField) {}

  update(formations: Formation[], time: number): void {
    for (const formation of formations) {
      const batch = this.batches.get(formation.id) ?? this.createBatch(formation);
      const forward = fromAngle(formation.facing);
      const right = rightFromFacing(formation.facing);
      const looseness =
        (1 - formation.cohesion) * 0.8 +
        formation.fatigue * 0.16 +
        (formation.state === "routing" ? 2.2 : 0) +
        (formation.state === "rupturing" ? 1.1 : 0);
      const pulse =
        formation.visualState === "surge"
          ? Math.sin(time * 10) * 0.42
          : formation.visualState === "recoil"
            ? -0.3
            : 0;

      for (let index = 0; index < formation.slotOffsets.length; index += 1) {
        const slot = formation.slotOffsets[index];
        const seed = formation.soldierSeeds[index] ?? 0.5;
        const jitterAngle = seed * Math.PI * 2;
        const jitterRadius = looseness * (0.16 + seed * 0.42);
        const routeScatter = formation.state === "routing" ? (time * (0.4 + seed) + seed * 8) % 5 : 0;
        const localX = slot.x + Math.cos(jitterAngle) * jitterRadius + Math.sin(time * 2 + seed * 8) * 0.035;
        const localZ =
          slot.y +
          Math.sin(jitterAngle) * jitterRadius +
          pulse * (1 - index / formation.slotOffsets.length) +
          routeScatter;
        const worldX = formation.center.x + right.x * localX + forward.x * localZ;
        const worldZ = formation.center.y + right.y * localX + forward.y * localZ;
        const height = this.terrain.heightAt(worldX, worldZ);
        const bob =
          formation.visualState === "march" || formation.visualState === "route"
            ? Math.sin(time * 8 + seed * 15) * 0.07
            : formation.visualState === "standoff"
              ? Math.sin(time * 4 + seed * 12) * 0.025
              : 0;
        const yaw = formation.facing + (seed - 0.5) * looseness * 0.35;

        this.dummy.position.set(worldX, height + bob, worldZ);
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.setScalar(formation.state === "routing" ? 0.92 : 1);
        this.dummy.updateMatrix();
        batch.body.setMatrixAt(index, this.dummy.matrix);

        this.dummy.position.set(
          worldX + forward.x * 0.34 + right.x * 0.06,
          height + bob + 0.02,
          worldZ + forward.y * 0.34 + right.y * 0.06,
        );
        this.dummy.rotation.set(0, yaw, 0);
        this.dummy.scale.setScalar(formation.visualState === "brace" ? 1.06 : 1);
        this.dummy.updateMatrix();
        batch.shield.setMatrixAt(index, this.dummy.matrix);

        this.dummy.position.set(
          worldX + forward.x * 0.42 - right.x * 0.16,
          height + bob + 0.08,
          worldZ + forward.y * 0.42 - right.y * 0.16,
        );
        this.dummy.rotation.set(Math.PI * 0.18, yaw, 0);
        this.dummy.scale.set(1, formation.visualState === "surge" ? 1.08 : 1, 1);
        this.dummy.updateMatrix();
        batch.spear.setMatrixAt(index, this.dummy.matrix);
      }

      batch.body.instanceMatrix.needsUpdate = true;
      batch.shield.instanceMatrix.needsUpdate = true;
      batch.spear.instanceMatrix.needsUpdate = true;
    }
  }

  private createBatch(formation: Formation): CrowdBatch {
    const count = formation.slotOffsets.length;
    const body = new THREE.InstancedMesh(
      createSoldierBodyGeometry(),
      createSoldierMaterial(formation.side),
      count,
    );
    const shield = new THREE.InstancedMesh(
      createShieldGeometry(),
      createShieldMaterial(formation.side),
      count,
    );
    const spear = new THREE.InstancedMesh(createSpearGeometry(), createSpearMaterial(), count);

    for (const mesh of [body, shield, spear]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    const batch = { body, shield, spear };
    this.batches.set(formation.id, batch);
    return batch;
  }
}
