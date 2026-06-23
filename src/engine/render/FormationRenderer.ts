import * as THREE from "three";
import { bannerColor } from "../content/Materials";
import { createBannerGeometry } from "../content/ProceduralMeshes";
import type { Formation } from "../sim/SimTypes";
import type { TerrainField } from "../sim/TerrainField";

interface BannerBatch {
  group: THREE.Group;
  cloth: THREE.Mesh;
  base: THREE.Mesh;
}

export class FormationRenderer {
  private readonly banners = new Map<string, BannerBatch>();
  private readonly poleGeometry = new THREE.CylinderGeometry(0.04, 0.05, 2.9, 6);
  private readonly baseGeometry = new THREE.RingGeometry(0.9, 1.2, 24);
  private readonly poleMaterial = new THREE.MeshStandardMaterial({ color: 0x4c4033, roughness: 0.85 });

  constructor(private readonly scene: THREE.Scene, private readonly terrain: TerrainField) {}

  update(formations: Formation[]): void {
    for (const formation of formations) {
      const batch = this.banners.get(formation.id) ?? this.createBanner(formation);
      const height = this.terrain.heightAt(formation.center.x, formation.center.y);
      batch.group.position.set(formation.center.x, height + 0.05, formation.center.y);
      batch.group.rotation.y = formation.facing;
      batch.cloth.visible = formation.state !== "routing" || Math.sin(performance.now() * 0.01) > -0.4;
      batch.base.visible = formation.selected;
      const scale = formation.state === "rupturing" ? 1.2 + Math.sin(performance.now() * 0.018) * 0.12 : 1;
      batch.base.scale.setScalar(scale);
    }
  }

  private createBanner(formation: Formation): BannerBatch {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(this.poleGeometry, this.poleMaterial);
    pole.castShadow = true;
    pole.position.set(0, 1.45, -formation.depth * 0.16);

    const clothMaterial = new THREE.MeshStandardMaterial({
      color: bannerColor(formation.side),
      roughness: 0.76,
      metalness: 0.02,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const cloth = new THREE.Mesh(createBannerGeometry(), clothMaterial);
    cloth.position.set(0.04, 2.25, -formation.depth * 0.16);
    cloth.rotation.y = Math.PI / 2;
    cloth.castShadow = true;

    const baseMaterial = new THREE.MeshBasicMaterial({
      color: formation.side === "rome" ? 0xffd36a : 0x80e4ff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const base = new THREE.Mesh(this.baseGeometry, baseMaterial);
    base.rotation.x = -Math.PI / 2;
    base.visible = formation.selected;

    group.add(pole, cloth, base);
    this.scene.add(group);
    const batch = { group, cloth, base };
    this.banners.set(formation.id, batch);
    return batch;
  }
}
