import * as THREE from "three";

export class SceneRoot {
  readonly scene = new THREE.Scene();

  constructor() {
    this.scene.background = new THREE.Color(0xa9c6ce);
    this.scene.fog = new THREE.Fog(0xa9c6ce, 58, 155);
  }
}
