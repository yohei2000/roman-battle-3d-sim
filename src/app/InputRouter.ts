import type { CameraRig } from "../engine/render/CameraRig";
import type { SimWorld } from "../engine/sim/SimWorld";
import { distance, type Vec2 } from "../engine/math/Vec2";
import type {
  AlignmentMode,
  DepthMode,
  FrontlineAssignment,
  GesturePreview,
  InputMode,
  LineIntentOptions,
  SpacingMode,
} from "../engine/sim/IntentTypes";

const DEFAULT_LINE_OPTIONS: LineIntentOptions = {
  spacingMode: "normal",
  depthMode: "normal",
  alignmentMode: "normal",
};

export class InputRouter {
  private leftStart?: { screenX: number; screenY: number; world: Vec2 };
  private middleDown = false;
  private fHeld = false;
  private drawingFrontline = false;
  private previewPoints: Vec2[] = [];
  private previewOptions: LineIntentOptions = { ...DEFAULT_LINE_OPTIONS };
  private previewAssignments: FrontlineAssignment[] = [];
  private previewStatus?: string;
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

  gesturePreview(): GesturePreview {
    return {
      mode: this.inputMode(),
      active: this.drawingFrontline,
      points: this.previewPoints.map((point) => ({ ...point })),
      assignments: this.previewAssignments.map((assignment) => ({
        ...assignment,
        targetCenter: { ...assignment.targetCenter },
      })),
      spacingMode: this.previewOptions.spacingMode,
      depthMode: this.previewOptions.depthMode,
      alignmentMode: this.previewOptions.alignmentMode,
      status: this.previewStatus,
    };
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
        const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
        const dx = event.clientX - this.leftStart.screenX;
        const dy = event.clientY - this.leftStart.screenY;
        const dragDistance = Math.hypot(dx, dy);
        if ((this.fHeld || this.drawingFrontline) && world && dragDistance > 6) {
          this.updateFrontlinePreview(world, event);
          this.hideDragRect();
          return;
        }
        if (dragDistance > 8) {
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
        if (this.drawingFrontline) {
          if (world) {
            this.addPreviewPoint(world, 0.12);
          }
          const intent = this.world.issueLineFormationForSelection(this.previewPoints, this.previewOptions);
          this.previewStatus = intent
            ? `Frontline intent committed: ${intent.formationIds.length} formations`
            : "Frontline ignored: select formations and draw a longer line";
          this.clearPreviewStroke();
          this.leftStart = undefined;
          this.hideDragRect();
          return;
        }

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
      const key = event.key.toLowerCase();
      if (key === "f") {
        this.fHeld = true;
        this.previewStatus = "Draw Frontline";
        return;
      }
      if (key === "escape" && this.drawingFrontline) {
        event.preventDefault();
        this.cancelFrontlinePreview();
        return;
      }
      if (key === "backspace") {
        event.preventDefault();
        this.world.undoLastIntent("rome");
        this.previewStatus = "Last intent undone";
        return;
      }
      if (key === "c") {
        this.camera.toggleMode();
      } else if (key === "d") {
        this.world.toggleDebug("labels");
      } else {
        this.camera.setKey(event.key, true);
      }
    });
    window.addEventListener("keyup", (event) => {
      if (event.key.toLowerCase() === "f") {
        this.fHeld = false;
        if (!this.drawingFrontline && this.previewStatus === "Draw Frontline") {
          this.previewStatus = undefined;
        }
        return;
      }
      this.camera.setKey(event.key, false);
    });
  }

  private inputMode(): InputMode {
    return this.fHeld || this.drawingFrontline ? "draw_frontline" : "select";
  }

  private updateFrontlinePreview(world: Vec2, event: PointerEvent): void {
    if (!this.drawingFrontline) {
      this.drawingFrontline = true;
      this.previewPoints = this.leftStart ? [{ ...this.leftStart.world }] : [];
    }

    this.previewOptions = readLineOptions(event);
    this.addPreviewPoint(world, 0.8);
    this.previewAssignments = this.world.previewLineAssignments(this.previewPoints, this.previewOptions);
    this.previewStatus = "Draw Frontline";
  }

  private addPreviewPoint(world: Vec2, minDistance: number): void {
    const previous = this.previewPoints[this.previewPoints.length - 1];
    if (!previous || distance(previous, world) >= minDistance) {
      this.previewPoints.push({ ...world });
    }
  }

  private cancelFrontlinePreview(): void {
    this.clearPreviewStroke();
    this.leftStart = undefined;
    this.hideDragRect();
    this.previewStatus = "Frontline cancelled";
  }

  private clearPreviewStroke(): void {
    this.drawingFrontline = false;
    this.previewPoints = [];
    this.previewAssignments = [];
    this.previewOptions = { ...DEFAULT_LINE_OPTIONS };
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

function readLineOptions(event: Pick<PointerEvent, "shiftKey" | "altKey" | "ctrlKey">): LineIntentOptions {
  const spacingMode: SpacingMode = event.shiftKey ? "loose" : "normal";
  const depthMode: DepthMode = event.altKey ? "deep" : "normal";
  const alignmentMode: AlignmentMode = event.ctrlKey ? "careful" : "normal";
  return { spacingMode, depthMode, alignmentMode };
}
