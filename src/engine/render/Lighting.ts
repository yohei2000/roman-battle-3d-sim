import * as THREE from "three";

export function addLighting(scene: THREE.Scene): void {
  const hemisphere = new THREE.HemisphereLight(0xe9f7ff, 0x5c6b48, 1.2);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff2d3, 2.3);
  sun.position.set(-24, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 110;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);
}
