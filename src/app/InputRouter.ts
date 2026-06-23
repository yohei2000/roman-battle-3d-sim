import type { CameraRig } from "../engine/render/CameraRig";
import type { SimWorld } from "../engine/sim/SimWorld";
import { distance, type Vec2 } from "../engine/math/Vec2";
import { CameraGesture } from "./CameraGesture";
import { detectInputProfile, type InputProfile } from "./InputProfile";
import { PointerTracker } from "./PointerTracker";
import type {
  AlignmentMode,
  DepthMode,
  FrontlineAssignment,
  GesturePreview,
  InputMode,
  IntentKind,
  LineIntentOptions,
  SpacingMode,
} from "../engine/sim/IntentTypes";

type CommandTool = "none" | "frontline" | "pressure_stroke" | "standard" | "fallback_line" | "contingency";

const DEFAULT_LINE_OPTIONS: LineIntentOptions = {
  spacingMode: "normal",
  depthMode: "normal",
  alignmentMode: "normal",
};

export class InputRouter {
  private readonly tracker = new PointerTracker();
  private readonly cameraGesture = new CameraGesture();
  private readonly inputProfile: InputProfile = detectInputProfile();
  private leftStart?: { screenX: number; screenY: number; world: Vec2 };
  private fHeld = false;
  private activeTool: CommandTool = "none";
  private lensOpen = false;
  private drawing = false;
  private pendingConfirm = false;
  private previewPoints: Vec2[] = [];
  private previewPosition?: Vec2;
  private previewOptions: LineIntentOptions = { ...DEFAULT_LINE_OPTIONS };
  private previewAssignments: FrontlineAssignment[] = [];
  private previewStatus?: string;
  private readonly dragRect: HTMLDivElement;
  private readonly lens: HTMLDivElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: CameraRig,
    private readonly world: SimWorld,
    root: HTMLElement,
  ) {
    this.dragRect = document.createElement("div");
    this.dragRect.className = "drag-rect";
    root.appendChild(this.dragRect);
    this.lens = this.createCommandLens();
    root.appendChild(this.lens);
    this.bind();
    this.renderLens();
  }

  gesturePreview(): GesturePreview {
    return {
      mode: this.inputMode(),
      active: this.drawing || this.pendingConfirm,
      pendingConfirm: this.pendingConfirm,
      tool: this.previewTool(),
      points: this.previewPoints.map((point) => ({ ...point })),
      position: this.previewPosition ? { ...this.previewPosition } : undefined,
      radius: this.activeTool === "standard" ? 22 : this.activeTool === "pressure_stroke" ? 14 : undefined,
      assignments: this.previewAssignments.map((assignment) => ({
        ...assignment,
        targetCenter: { ...assignment.targetCenter },
      })),
      spacingMode: this.previewOptions.spacingMode,
      depthMode: this.previewOptions.depthMode,
      alignmentMode: this.previewOptions.alignmentMode,
      inputProfile: this.inputProfile.kind,
      status: this.previewStatus,
    };
  }

  private bind(): void {
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.tracker.begin(event);

      if (this.tracker.count() >= 2) {
        this.cancelTransientStroke("Camera gesture");
        return;
      }

      if (event.button === 2) {
        const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
        if (world) {
          this.world.issueSelected("move", world);
        }
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
      if (!world) {
        return;
      }

      this.leftStart = { screenX: event.clientX, screenY: event.clientY, world };
      if (this.activeTool === "standard") {
        this.previewPosition = world;
        this.previewStatus = "Standard preview";
        this.pendingConfirm = true;
        this.world.recordTelemetry({ kind: "stroke", message: "standard preview" });
        this.renderLens();
      } else if (this.isStrokeTool()) {
        this.beginStroke(world, event);
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      const pointer = this.tracker.move(event);
      if (!pointer) {
        return;
      }

      const pointers = this.tracker.all();
      if (this.cameraGesture.update(pointers, this.camera)) {
        return;
      }

      const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
      if (!world || !this.leftStart) {
        return;
      }

      const dragDistance = Math.hypot(event.clientX - this.leftStart.screenX, event.clientY - this.leftStart.screenY);
      if ((this.fHeld || this.isStrokeTool()) && this.activeTool !== "standard" && dragDistance > 6) {
        if (!this.drawing) {
          if (!this.isStrokeTool()) {
            this.setTool("frontline", false);
          }
          this.beginStroke(this.leftStart.world, event);
        }
        this.addPreviewPoint(world, 0.8);
        this.updateAssignments();
        this.hideDragRect();
        return;
      }

      if (this.activeTool === "none" && dragDistance > 8) {
        this.showDragRect(this.leftStart.screenX, this.leftStart.screenY, event.clientX, event.clientY);
      }
    });

    this.canvas.addEventListener("pointerup", (event) => {
      this.tracker.end(event.pointerId);
      this.cameraGesture.reset();

      if (event.button !== 0 || !this.leftStart) {
        return;
      }

      const world = this.camera.screenToGround(event.clientX, event.clientY, this.canvas);
      if (this.drawing) {
        if (world) {
          this.addPreviewPoint(world, 0.12);
        }
        this.finishStrokePreview();
        this.leftStart = undefined;
        this.hideDragRect();
        return;
      }

      if (this.activeTool === "none" && world) {
        const dragDistance = Math.hypot(event.clientX - this.leftStart.screenX, event.clientY - this.leftStart.screenY);
        if (dragDistance > 8) {
          this.world.selectRect(this.leftStart.world, world);
        } else {
          this.world.selectAt(world, event.shiftKey);
        }
      }
      this.leftStart = undefined;
      this.hideDragRect();
    });

    this.canvas.addEventListener("pointercancel", (event) => {
      this.tracker.cancel(event.pointerId);
      this.cameraGesture.reset();
      this.cancelTransientStroke("Pointer cancelled");
      this.world.recordTelemetry({ kind: "pointercancel", message: "pointercancel", data: { pointerId: event.pointerId } });
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.camera.zoom(event.deltaY);
    });

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "f") {
        this.fHeld = true;
        this.previewStatus = "Draw Frontline";
        this.renderLens();
        return;
      }
      if (key === "enter" && this.pendingConfirm) {
        event.preventDefault();
        this.confirmPreview();
        return;
      }
      if (key === "escape") {
        event.preventDefault();
        this.cancelPreview("Cancelled");
        return;
      }
      if (key === "backspace") {
        event.preventDefault();
        this.undoLastIntent();
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
        if (!this.drawing && !this.pendingConfirm && this.activeTool === "frontline") {
          this.setTool("none", false);
        }
        if (!this.drawing && !this.pendingConfirm && this.previewStatus === "Draw Frontline") {
          this.previewStatus = undefined;
        }
        this.renderLens();
        return;
      }
      this.camera.setKey(event.key, false);
    });
  }

  private beginStroke(world: Vec2, event: PointerEvent): void {
    this.drawing = true;
    this.pendingConfirm = false;
    this.previewPoints = [{ ...world }];
    this.previewPosition = undefined;
    this.previewOptions = readLineOptions(event);
    this.previewAssignments = [];
    this.previewStatus = `${toolLabel(this.activeTool)} stroke`;
    this.world.recordTelemetry({ kind: "stroke", message: `${this.activeTool} begin` });
    this.renderLens();
  }

  private finishStrokePreview(): void {
    this.drawing = false;
    this.pendingConfirm = this.previewPoints.length >= 2;
    if (!this.pendingConfirm) {
      this.previewStatus = "Invalid stroke";
      this.world.recordTelemetry({ kind: "invalid_command", message: "stroke too short" });
      this.clearPreviewData(false);
    } else {
      this.updateAssignments();
      this.previewStatus = `${toolLabel(this.activeTool)} preview`;
      this.world.recordTelemetry({ kind: "stroke", message: `${this.activeTool} preview`, data: { points: this.previewPoints.length } });
    }
    this.renderLens();
  }

  private confirmPreview(): void {
    let ok = false;
    if (this.activeTool === "frontline") {
      ok = !!this.world.issueLineFormationForSelection(this.previewPoints, this.previewOptions);
    } else if (this.activeTool === "pressure_stroke") {
      ok = !!this.world.issuePressureStrokeForSelection(this.previewPoints);
    } else if (this.activeTool === "fallback_line") {
      ok = !!this.world.issueFallbackLineForSelection(this.previewPoints);
    } else if (this.activeTool === "standard" && this.previewPosition) {
      ok = !!this.world.placeStandardForSelection(this.previewPosition);
    } else if (this.activeTool === "contingency") {
      ok = !!this.world.setContingencyForSelection();
    }

    this.previewStatus = ok ? `${toolLabel(this.activeTool)} committed` : "Invalid command";
    this.world.recordTelemetry({ kind: ok ? "intent" : "invalid_command", message: this.previewStatus });
    this.clearPreviewData(true);
    this.setTool("none", false);
  }

  private cancelPreview(status = "Cancelled"): void {
    this.cancelTransientStroke(status);
    this.setTool("none", false);
  }

  private cancelTransientStroke(status: string): void {
    if (this.drawing || this.pendingConfirm) {
      this.previewStatus = status;
      this.world.recordTelemetry({ kind: "stroke", message: status });
    }
    this.clearPreviewData(false);
    this.leftStart = undefined;
    this.hideDragRect();
    this.renderLens();
  }

  private undoLastIntent(): void {
    this.world.undoLastIntent("rome");
    this.previewStatus = "Last intent undone";
    this.world.recordTelemetry({ kind: "intent", message: "undo requested" });
    this.renderLens();
  }

  private addPreviewPoint(world: Vec2, minDistance: number): void {
    const previous = this.previewPoints[this.previewPoints.length - 1];
    if (!previous || distance(previous, world) >= minDistance) {
      this.previewPoints.push({ ...world });
    }
  }

  private updateAssignments(): void {
    this.previewAssignments =
      this.activeTool === "frontline"
        ? this.world.previewLineAssignments(this.previewPoints, this.previewOptions)
        : [];
  }

  private clearPreviewData(keepStatus: boolean): void {
    this.drawing = false;
    this.pendingConfirm = false;
    this.previewPoints = [];
    this.previewPosition = undefined;
    this.previewAssignments = [];
    this.previewOptions = { ...DEFAULT_LINE_OPTIONS };
    if (!keepStatus) {
      this.previewStatus = undefined;
    }
  }

  private setTool(tool: CommandTool, clearPreview = true): void {
    this.activeTool = tool;
    this.lensOpen = tool !== "none";
    if (clearPreview) {
      this.clearPreviewData(false);
    }
    this.previewStatus = tool === "none" ? undefined : `${toolLabel(tool)} ready`;
    this.world.recordTelemetry({ kind: "lens", message: `${tool} selected` });
    this.renderLens();
  }

  private inputMode(): InputMode {
    if (this.fHeld || this.activeTool === "frontline") return "draw_frontline";
    if (this.activeTool === "pressure_stroke") return "paint_pressure";
    if (this.activeTool === "standard") return "place_standard";
    if (this.activeTool === "fallback_line") return "draw_fallback";
    if (this.activeTool === "contingency") return "set_contingency";
    return "select";
  }

  private previewTool(): IntentKind | "none" {
    return this.activeTool === "none" ? "none" : this.activeTool;
  }

  private createCommandLens(): HTMLDivElement {
    const lens = document.createElement("div");
    lens.className = "command-lens";
    return lens;
  }

  private renderLens(): void {
    this.lens.innerHTML = "";
    this.lens.classList.toggle("is-open", this.lensOpen || this.pendingConfirm);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "lens-primary";
    toggle.textContent = this.lensOpen ? "Close" : "作戦";
    toggle.addEventListener("click", () => {
      this.lensOpen = !this.lensOpen;
      this.world.recordTelemetry({ kind: "lens", message: this.lensOpen ? "lens open" : "lens close" });
      this.renderLens();
    });
    this.lens.appendChild(toggle);

    if (!this.lensOpen && !this.pendingConfirm) {
      return;
    }

    const tools = document.createElement("div");
    tools.className = "lens-tools";
    for (const [tool, label] of [
      ["frontline", "Frontline"],
      ["pressure_stroke", "Pressure"],
      ["standard", "Standard"],
      ["fallback_line", "Fallback"],
      ["contingency", "Contingency"],
    ] as Array<[CommandTool, string]>) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.className = this.activeTool === tool ? "active" : "";
      button.disabled = this.pendingConfirm;
      button.addEventListener("click", () => this.setTool(tool));
      tools.appendChild(button);
    }
    this.lens.appendChild(tools);

    const actions = document.createElement("div");
    actions.className = "lens-actions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Confirm";
    confirm.disabled = !this.pendingConfirm;
    confirm.addEventListener("click", () => this.confirmPreview());
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.cancelPreview("Cancelled"));
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "Undo";
    undo.addEventListener("click", () => this.undoLastIntent());
    actions.append(confirm, cancel, undo);
    this.lens.appendChild(actions);
  }

  private isStrokeTool(): boolean {
    return this.activeTool === "frontline" || this.activeTool === "pressure_stroke" || this.activeTool === "fallback_line";
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

function toolLabel(tool: CommandTool): string {
  if (tool === "pressure_stroke") return "Pressure";
  if (tool === "fallback_line") return "Fallback";
  if (tool === "standard") return "Standard";
  if (tool === "contingency") return "Contingency";
  if (tool === "frontline") return "Frontline";
  return "Command";
}
