import type { CameraRig } from "../engine/render/CameraRig";
import type { SimWorld } from "../engine/sim/SimWorld";
import type { Vec2 } from "../engine/math/Vec2";

export class InputRouter {
  private leftStart?: { screenX: number; screenY: number; world: Vec2 };
  private middleDown = false;
  private readonly dragRect: HTMLDivElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CameraRig,
    private readonly world: SimWorld,
    root: HTMLElement,
  ) {
    this.dragRect = document.createElement("div");
    this.dragRect.className = "drag-rect";
    root.appendChild(this.dragRect);
    this.bind();
  }

  private bind(): void {
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      if (event.button === 0) {
        const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
        if (world) {
          this.leftStart = { screenX: event.clientX, screenY: event.clientY, world };
        }
      } else if (event.button === 1) {
        this.middleDown = true;
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (this.middleDown) {
        this.camera.rotate(event.movementX, event.movementY);
      }
      if (this.leftStart) {
        const dx = event.clientX - this.leftStart.screenX;
        const dy = event.clientY - this.leftStart.screenY;
        if (Math.hypot(dx, dy) > 8) {
          this.showDragRect(this.leftStart.screenX, this.leftStart.screenY, event.clientX, event.clientY);
        }
      }
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (event.button === 1) {
        this.middleDown = false;
      }

      if (event.button === 2) {
        const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
        if (world) {
          this.world.issueSelected("move", world);
        }
      }

      if (event.button === 0 && this.leftStart) {
        const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
        const dragDistance = Math.hypot(event.clientX - this.leftStart.screenX, event.clientY - this.leftStart.screenY);
        if (world && dragDistance > 8) {
          this.world.selectRect(this.leftStart.world, world);
        } else if (world) {
          this.world.selectAt(world, event.shiftKey);
        }
        this.leftStart = undefined;
        this.hideDragRect();
      }
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.camera.zoom(event.deltaY);
    });

    window.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.key.toLowerCase() === "c") {
        this.camera.toggleMode();
      } else if (event.key.toLowerCase() === "d") {
        this.world.toggleDebug("labels");
      } else {
        this.camera.setKey(event.key, true);
      }
    });
    window.addEventListener("keyup", (event) => this.camera.setKey(event.key, false));
  }

  private showDragRect(x1: number, y1: number, x2: number, y2: number): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    this.dragRect.style.display = "block";
    this.dragRect.style.left = `${left}px`;
    this.dragRect.style.top = `${top}px`;
    this.dragRect.style.width = `${Math.abs(x2 - x1)}px`;
    this.dragRect.style.height = `${Math.abs(y2 - y1)}px`;
  }

  private hideDragRect(): void {
    this.dragRect.style.display = "none";
  }
}
