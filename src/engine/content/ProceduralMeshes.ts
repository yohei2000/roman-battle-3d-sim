import * as THREE from "three";

export function createSoldierBodyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.28, 0.34, 1.18, 5, 1);
  geometry.translate(0, 0.59, 0);
  return geometry;
}

export function createShieldGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(0.58, 0.72, 0.08, 1, 1, 1);
  geometry.translate(0, 0.58, 0);
  return geometry;
}

export function createSpearGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.025, 0.03, 1.55, 5, 1);
  geometry.translate(0, 0.78, 0);
  return geometry;
}

export function createBannerGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1.4, 0.18);
  shape.lineTo(1.2, 0.86);
  shape.lineTo(0, 0.7);
  shape.lineTo(0, 0);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.translate(0, 0, 0);
  return geometry;
}
