import * as THREE from "three";
import type { TerrainField } from "../sim/TerrainField";

export class TerrainRenderer {
  readonly mesh: THREE.Mesh;
  readonly grid: THREE.GridHelper;

  constructor(private readonly terrain: TerrainField) {
    const geometry = this.createTerrainGeometry();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.01,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;

    this.grid = new THREE.GridHelper(terrain.size, 32, 0x53624e, 0x7f8a6f);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.18;
    this.grid.position.y = 0.08;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh);
    scene.add(this.grid);
  }

  private createTerrainGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(this.terrain.size, this.terrain.size, 88, 88);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const sample = this.terrain.sample(x, z);
      position.setY(index, sample.height);

      if (sample.groundType === "ridge") {
        color.setRGB(0.52, 0.58, 0.45);
      } else if (sample.groundType === "scrub") {
        color.setRGB(0.4, 0.55, 0.35);
      } else {
        color.setRGB(0.47, 0.64, 0.39);
      }
      color.offsetHSL(0, 0, sample.slope * -0.08);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}
