import { SIM_CONFIG } from "../engine/sim/SimConfig";

export interface LoopMetrics {
  fps: number;
  simMs: number;
  renderMs: number;
}

export class GameLoop {
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private frameCount = 0;
  private fpsElapsed = 0;
  readonly metrics: LoopMetrics = {
    fps: 0,
    simMs: 0,
    renderMs: 0,
  };

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) {
      return;
    }

    const delta = Math.min((now - this.lastTime) / 1000, 0.12);
    this.lastTime = now;
    this.accumulator += delta;

    const simStart = performance.now();
    while (this.accumulator >= SIM_CONFIG.fixedTimestep) {
      this.update(SIM_CONFIG.fixedTimestep);
      this.accumulator -= SIM_CONFIG.fixedTimestep;
    }
    this.metrics.simMs = performance.now() - simStart;

    const renderStart = performance.now();
    this.render(this.accumulator / SIM_CONFIG.fixedTimestep);
    this.metrics.renderMs = performance.now() - renderStart;

    this.frameCount += 1;
    this.fpsElapsed += delta;
    if (this.fpsElapsed >= 0.5) {
      this.metrics.fps = this.frameCount / this.fpsElapsed;
      this.frameCount = 0;
      this.fpsElapsed = 0;
    }

    requestAnimationFrame(this.tick);
  };
}
