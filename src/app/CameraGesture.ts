import type { CameraRig } from "../engine/render/CameraRig";
import type { TrackedPointer } from "./PointerTracker";

export class CameraGesture {
  private previousCenter?: { x: number; y: number };
  private previousDistance = 0;
  private previousAngle = 0;

  update(pointers: TrackedPointer[], camera: CameraRig): boolean {
    if (pointers.length !== 2) {
      this.reset();
      return false;
    }

    const [a, b] = pointers;
    const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);

    if (this.previousCenter) {
      camera.panPixels(center.x - this.previousCenter.x, center.y - this.previousCenter.y);
      camera.zoom((this.previousDistance - distance) * 1.35);
      camera.rotate((angle - this.previousAngle) * 85, 0);
    }

    this.previousCenter = center;
    this.previousDistance = distance;
    this.previousAngle = angle;
    return true;
  }

  reset(): void {
    this.previousCenter = undefined;
    this.previousDistance = 0;
    this.previousAngle = 0;
  }
}
