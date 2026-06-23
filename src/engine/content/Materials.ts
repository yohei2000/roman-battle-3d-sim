import * as THREE from "three";
import type { SideId } from "../sim/SimTypes";

export function sideColor(side: SideId): THREE.ColorRepresentation {
  return side === "rome" ? 0xb73728 : 0x2d6f88;
}

export function shieldColor(side: SideId): THREE.ColorRepresentation {
  return side === "rome" ? 0xd7b15d : 0x84a98c;
}

export function bannerColor(side: SideId): THREE.ColorRepresentation {
  return side === "rome" ? 0xde4f3d : 0x3d93ad;
}

export function createSoldierMaterial(side: SideId): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: sideColor(side),
    roughness: 0.78,
    metalness: 0.08,
    flatShading: true,
  });
}

export function createShieldMaterial(side: SideId): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: shieldColor(side),
    roughness: 0.84,
    metalness: 0.02,
    flatShading: true,
  });
}

export function createSpearMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x7d6652,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });
}
