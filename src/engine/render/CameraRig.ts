import * as THREE from "three";
import type { Formation } from "../sim/SimTypes";
import type { TerrainField } from "../sim/TerrainField";

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 500);
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly keys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly temp = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.92;
  private distance = 72;
  private mode: "tactical" | "cinematic" = "tactical";

  constructor(private readonly terrain: TerrainField) {
    this.updateCameraPosition(0);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setKey(key: string, down: boolean): void {
    if (down) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
  }

  rotate(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * 0.004, 0.46, 1.18);
  }

  panPixels(deltaX: number, deltaY: number): void {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const scale = this.distance * 0.0014;
    this.target.addScaledVector(right, -deltaX * scale);
    this.target.addScaledVector(forward, deltaY * scale);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -70, 70);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -70, 70);
    this.target.y = this.terrain.heightAt(this.target.x, this.target.z) + 1.5;
  }

  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + delta * 0.045, 24, 118);
  }

  toggleMode(): void {
    this.mode = this.mode === "tactical" ? "cinematic" : "tactical";
  }

  update(dt: number, selected: Formation[], time: number): void {
    if (this.mode === "cinematic") {
      const focus = selected[0];
      const centerX = focus?.center.x ?? 0;
      const centerZ = focus?.center.y ?? 0;
      this.target.set(centerX, this.terrain.heightAt(centerX, centerZ) + 2.8, centerZ);
      this.yaw += dt * 0.22;
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.35, dt * 2.5);
      this.distance = THREE.MathUtils.lerp(this.distance, focus ? 23 : 42, dt * 1.5);
      this.updateCameraPosition(time);
      return;
    }

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pan = new THREE.Vector3();
    const speed = this.distance * 0.46 * dt;

    if (this.keys.has("w")) pan.add(forward);
    if (this.keys.has("s")) pan.sub(forward);
    if (this.keys.has("d")) pan.add(right);
    if (this.keys.has("a")) pan.sub(right);
    if (this.keys.has("q")) this.yaw += dt * 1.5;
    if (this.keys.has("e")) this.yaw -= dt * 1.5;

    if (pan.lengthSq() > 0) {
      pan.normalize().multiplyScalar(speed);
      this.target.add(pan);
      this.target.x = THREE.MathUtils.clamp(this.target.x, -70, 70);
      this.target.z = THREE.MathUtils.clamp(this.target.z, -70, 70);
      this.target.y = this.terrain.heightAt(this.target.x, this.target.z) + 1.5;
    }

    this.updateCameraPosition(time);
  }

  screenToGround(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } | undefined {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) {
      return undefined;
    }
    return { x: hit.x, y: hit.z };
  }

  project(x: number, z: number, yOffset = 0): { x: number; y: number; visible: boolean } {
    this.temp.set(x, this.terrain.heightAt(x, z) + yOffset, z);
    this.temp.project(this.camera);
    return {
      x: (this.temp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.temp.y * 0.5 + 0.5) * window.innerHeight,
      visible: this.temp.z > -1 && this.temp.z < 1,
    };
  }

  private updateCameraPosition(time: number): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;
    const sway = this.mode === "cinematic" ? Math.sin(time * 0.7) * 1.2 : 0;
    const x = this.target.x - Math.sin(this.yaw) * horizontal;
    const z = this.target.z - Math.cos(this.yaw) * horizontal;
    this.camera.position.set(x, this.target.y + height + sway, z);
    this.camera.lookAt(this.target);
  }
}
