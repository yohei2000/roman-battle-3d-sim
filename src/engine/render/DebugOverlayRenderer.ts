import { boxCorners, frontCenter } from "../math/Geometry";
import type { CameraRig } from "./CameraRig";
import type { DebugFlags, EngagementPhase, Formation, SimSnapshot } from "../sim/SimTypes";

export class DebugOverlayRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly root: HTMLElement, private readonly cameraRig: CameraRig) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "debug-overlay";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D overlay context unavailable.");
    }
    this.ctx = ctx;
    root.appendChild(this.canvas);
    this.resize();
  }

  resize(): void {
    this.canvas.width = this.root.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.root.clientHeight * window.devicePixelRatio;
    this.canvas.style.width = `${this.root.clientWidth}px`;
    this.canvas.style.height = `${this.root.clientHeight}px`;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  render(snapshot: SimSnapshot, flags: DebugFlags): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.lineWidth = 1.5;
    this.ctx.font = "12px Inter, Segoe UI, sans-serif";
    const phaseByFormation = phaseMap(snapshot);

    for (const formation of snapshot.formations) {
      if (flags.bounds) this.drawBounds(formation);
      if (flags.fronts) this.drawFront(formation);
      if (flags.labels) this.drawLabel(formation, phaseByFormation.get(formation.id));
      if (flags.pressureLabels) this.drawPressure(formation);
    }

    if (flags.contactLanes) {
      this.drawContactLanes(snapshot);
    }
  }

  private drawBounds(formation: Formation): void {
    const points = boxCorners({
      center: formation.center,
      width: formation.width,
      depth: formation.depth,
      facing: formation.facing,
    }).map((point) => this.cameraRig.project(point.x, point.y, 0.2));
    this.ctx.strokeStyle = formation.selected ? "#ffd36a" : formation.side === "rome" ? "#e26655" : "#6fd0eb";
    this.ctx.globalAlpha = formation.selected ? 0.9 : 0.42;
    this.ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) this.ctx.moveTo(point.x, point.y);
      else this.ctx.lineTo(point.x, point.y);
    });
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  private drawFront(formation: Formation): void {
    const center = frontCenter({
      center: formation.center,
      width: formation.width,
      depth: formation.depth,
      facing: formation.facing,
    });
    const projected = this.cameraRig.project(center.x, center.y, 0.65);
    this.ctx.fillStyle = formation.side === "rome" ? "#ffe3a0" : "#bff2ff";
    this.ctx.beginPath();
    this.ctx.arc(projected.x, projected.y, formation.selected ? 5 : 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawLabel(formation: Formation, phase?: EngagementPhase): void {
    const projected = this.cameraRig.project(formation.center.x, formation.center.y, 3.8);
    if (!projected.visible) return;
    const stateLabel = phase?.toUpperCase() ?? formation.state.toUpperCase();
    const text = `${formation.name}  ${stateLabel}`;
    this.ctx.font = formation.selected ? "600 12px Inter, Segoe UI, sans-serif" : "500 11px Inter, Segoe UI, sans-serif";
    const metrics = this.ctx.measureText(text);
    const x = projected.x - metrics.width / 2;
    const y = projected.y;
    this.ctx.fillStyle = "rgba(13, 20, 22, 0.74)";
    this.roundRect(x - 6, y - 15, metrics.width + 12, 20, 4);
    this.ctx.fill();
    this.ctx.fillStyle = formation.state === "routing" ? "#ffb5a7" : formation.selected ? "#ffe8a8" : "#f2f7f5";
    this.ctx.fillText(text, x, y);
  }

  private drawPressure(formation: Formation): void {
    const projected = this.cameraRig.project(formation.center.x, formation.center.y, 2.2);
    const text = `M ${pct(formation.morale)} C ${pct(formation.cohesion)} P ${formation.pressure.toFixed(2)}`;
    this.ctx.fillStyle = "rgba(6, 12, 14, 0.68)";
    this.ctx.fillRect(projected.x - 46, projected.y + 7, 92, 17);
    this.ctx.fillStyle = "#eaf2ec";
    this.ctx.fillText(text, projected.x - 41, projected.y + 20);
  }

  private drawContactLanes(snapshot: SimSnapshot): void {
    this.ctx.lineWidth = 2;
    for (const engagement of snapshot.engagements) {
      const color = engagement.phase === "surge" ? "#ffcd6b" : engagement.phase === "rupture" ? "#ff7b6b" : "#f1eee5";
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
      for (const lane of engagement.contactLanes) {
        const start = this.cameraRig.project(lane.worldPos.x, lane.worldPos.y, 0.45);
        const end = this.cameraRig.project(
          lane.worldPos.x + lane.normal.x * (1.2 + lane.intensity),
          lane.worldPos.y + lane.normal.y * (1.2 + lane.intensity),
          0.45,
        );
        this.ctx.globalAlpha = 0.35 + lane.intensity * 0.22;
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
    }
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.arcTo(x + width, y, x + width, y + height, radius);
    this.ctx.arcTo(x + width, y + height, x, y + height, radius);
    this.ctx.arcTo(x, y + height, x, y, radius);
    this.ctx.arcTo(x, y, x + width, y, radius);
    this.ctx.closePath();
  }
}

function phaseMap(snapshot: SimSnapshot): Map<string, EngagementPhase> {
  const map = new Map<string, EngagementPhase>();
  for (const engagement of snapshot.engagements) {
    map.set(engagement.aFormationId, engagement.phase);
    map.set(engagement.bFormationId, engagement.phase);
  }
  return map;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}`;
}
