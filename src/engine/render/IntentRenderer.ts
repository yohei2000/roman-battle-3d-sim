import * as THREE from "three";
import { boxCorners } from "../math/Geometry";
import type { Vec2 } from "../math/Vec2";
import type {
  FallbackLine,
  GesturePreview,
  IntentSnapshot,
  LineIntent,
  PressureStroke,
  Standard,
} from "../sim/IntentTypes";
import type { TerrainField } from "../sim/TerrainField";

export class IntentRenderer {
  private readonly group = new THREE.Group();
  private signature = "";

  constructor(scene: THREE.Scene, private readonly terrain: TerrainField) {
    scene.add(this.group);
  }

  update(snapshot: IntentSnapshot, preview: GesturePreview): void {
    const signature = makeSignature(snapshot, preview);
    if (signature === this.signature) {
      return;
    }

    this.signature = signature;
    this.clearGroup();

    for (const frontline of snapshot.committedFrontlines) {
      this.addFrontline(frontline, false);
    }
    for (const pressure of snapshot.pressureStrokes) {
      this.addPressure(pressure, false);
    }
    for (const standard of snapshot.standards) {
      this.addStandard(standard, false);
    }
    for (const fallback of snapshot.fallbackLines) {
      this.addFallback(fallback, false);
    }

    if (preview.active) {
      this.addPreview(preview);
    }
  }

  private addFrontline(intent: LineIntent, preview: boolean): void {
    const color = preview ? 0xffdd83 : 0x7fe7ff;
    this.addLine(intent.points, color, preview);
    this.addEndpoints(intent.points, color);
    for (const assignment of intent.assignments) {
      this.addArrow(assignment.targetCenter, assignment.targetFacing, color, 0.55);
      this.addGhostRect(assignment.targetCenter, assignment.targetFacing, assignment.width, assignment.depth, color, 0.38);
    }
  }

  private addPreview(preview: GesturePreview): void {
    if (preview.tool === "frontline" && preview.points.length > 1) {
      const color = 0xffdd83;
      this.addLine(preview.points, color, true);
      this.addEndpoints(preview.points, color);
      for (const assignment of preview.assignments) {
        this.addArrow(assignment.targetCenter, assignment.targetFacing, color, 0.72);
        this.addGhostRect(assignment.targetCenter, assignment.targetFacing, assignment.width, assignment.depth, color, 0.52);
      }
    } else if (preview.tool === "pressure_stroke" && preview.points.length > 1) {
      this.addLine(preview.points, 0xff9b54, true, 0.86);
      this.addEndpoints(preview.points, 0xff9b54);
    } else if (preview.tool === "fallback_line" && preview.points.length > 1) {
      this.addLine(preview.points, 0x8ef2a0, true, 0.72);
      this.addEndpoints(preview.points, 0x8ef2a0);
    } else if (preview.tool === "standard" && preview.position) {
      this.addCircle(preview.position, preview.radius ?? 22, 0xf6e27c, 0.48, true);
    }
  }

  private addPressure(intent: PressureStroke, preview: boolean): void {
    this.addLine(intent.points, 0xff8b4a, preview, preview ? 0.82 : 0.58);
  }

  private addStandard(intent: Standard, preview: boolean): void {
    this.addCircle(intent.position, intent.radius, 0xf6e27c, preview ? 0.58 : 0.42, true);
  }

  private addFallback(intent: FallbackLine, preview: boolean): void {
    this.addLine(intent.points, 0x8ef2a0, true, preview ? 0.78 : 0.5);
  }

  private addLine(
    points: Vec2[],
    color: THREE.ColorRepresentation,
    dashed: boolean,
    opacity = dashed ? 0.76 : 0.74,
  ): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.linePositions(points, 0.42), 3));
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity,
          dashSize: 2.2,
          gapSize: 1.0,
          depthWrite: false,
        })
      : new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        });
    const line = new THREE.Line(geometry, material);
    if (dashed) {
      line.computeLineDistances();
    }
    this.group.add(line);
  }

  private addEndpoints(points: Vec2[], color: THREE.ColorRepresentation): void {
    const endpointGeometry = new THREE.SphereGeometry(0.45, 10, 6);
    const endpointMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 });
    for (const point of [points[0], points[points.length - 1]]) {
      const marker = new THREE.Mesh(endpointGeometry, endpointMaterial);
      marker.position.set(point.x, this.terrain.heightAt(point.x, point.y) + 0.55, point.y);
      this.group.add(marker);
    }
  }

  private addArrow(
    center: Vec2,
    facing: number,
    color: THREE.ColorRepresentation,
    opacity: number,
  ): void {
    const direction = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).normalize();
    const geometry = new THREE.ConeGeometry(0.38, 1.15, 3);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const arrow = new THREE.Mesh(geometry, material);
    arrow.position.set(
      center.x + direction.x * 1.8,
      this.terrain.heightAt(center.x, center.y) + 0.68,
      center.y + direction.z * 1.8,
    );
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.group.add(arrow);
  }

  private addGhostRect(
    center: Vec2,
    facing: number,
    width: number,
    depth: number,
    color: THREE.ColorRepresentation,
    opacity: number,
  ): void {
    const corners = boxCorners({ center, width, depth, facing });
    const positions: number[] = [];
    for (const corner of [...corners, corners[0]]) {
      positions.push(corner.x, this.terrain.heightAt(corner.x, corner.y) + 0.34, corner.y);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    this.group.add(new THREE.Line(geometry, material));
  }

  private addCircle(
    center: Vec2,
    radius: number,
    color: THREE.ColorRepresentation,
    opacity: number,
    dashed: boolean,
  ): void {
    const geometry = new THREE.RingGeometry(radius * 0.96, radius, 56);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, this.terrain.heightAt(center.x, center.y) + 0.5, center.y);
    this.group.add(ring);

    if (dashed) {
      const poleGeometry = new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6);
      const pole = new THREE.Mesh(poleGeometry, material);
      pole.position.set(center.x, this.terrain.heightAt(center.x, center.y) + 1.6, center.y);
      this.group.add(pole);
    }
  }

  private linePositions(points: Vec2[], yOffset: number): number[] {
    const positions: number[] = [];
    for (const point of points) {
      positions.push(point.x, this.terrain.heightAt(point.x, point.y) + yOffset, point.y);
    }
    return positions;
  }

  private clearGroup(): void {
    for (const child of this.group.children) {
      child.traverse((object) => {
        const mesh = object as THREE.Mesh | THREE.Line;
        if ("geometry" in mesh && mesh.geometry) {
          mesh.geometry.dispose();
        }
        if ("material" in mesh && mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((material) => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
    this.group.clear();
  }
}

function makeSignature(snapshot: IntentSnapshot, preview: GesturePreview): string {
  const previewPoints = preview.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("|");
  const previewPosition = preview.position
    ? `${preview.position.x.toFixed(1)},${preview.position.y.toFixed(1)}`
    : "";
  const previewAssignments = preview.assignments
    .map(
      (assignment) =>
        `${assignment.formationId}:${assignment.targetCenter.x.toFixed(1)},${assignment.targetCenter.y.toFixed(
          1,
        )}:${assignment.targetFacing.toFixed(2)}`,
    )
    .join("|");
  return [
    snapshot.revision,
    preview.active,
    preview.pendingConfirm,
    preview.tool,
    preview.spacingMode,
    preview.depthMode,
    preview.alignmentMode,
    previewPoints,
    previewPosition,
    previewAssignments,
  ].join(";");
}
