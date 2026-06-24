import * as THREE from "three";
import type { ObjectiveZone } from "../sim/SimTypes";
import type { TerrainField } from "../sim/TerrainField";

export class ObjectiveRenderer {
  private readonly group = new THREE.Group();
  private signature = "";

  constructor(scene: THREE.Scene, private readonly terrain: TerrainField) {
    scene.add(this.group);
  }

  update(objectives: ObjectiveZone[]): void {
    const signature = objectives
      .map(
        (objective) =>
          `${objective.id}:${objective.owner ?? "none"}:${objective.contested}:${objective.focus}:${objective.control.rome.toFixed(
            2,
          )}:${objective.control.opposition.toFixed(2)}`,
      )
      .join("|");
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    this.clear();
    for (const objective of objectives) {
      this.addObjective(objective);
    }
  }

  private addObjective(objective: ObjectiveZone): void {
    const color = objective.owner === "rome" ? 0x74d69b : objective.owner === "opposition" ? 0x7cc8ff : 0xf0e0a2;
    const opacity = objective.focus ? 0.52 : objective.contested ? 0.42 : 0.28;
    const ringGeometry = new THREE.RingGeometry(objective.radius * 0.92, objective.radius, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(objective.center.x, this.terrain.heightAt(objective.center.x, objective.center.y) + 0.18, objective.center.y);
    this.group.add(ring);

    const markerGeometry = new THREE.CylinderGeometry(0.38, 0.54, objective.focus ? 2.4 : 1.55, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(objective.center.x, this.terrain.heightAt(objective.center.x, objective.center.y) + 0.95, objective.center.y);
    this.group.add(marker);
  }

  private clear(): void {
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
    this.group.clear();
  }
}
