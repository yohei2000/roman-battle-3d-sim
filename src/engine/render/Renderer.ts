import * as THREE from "three";
import type { LoopMetrics } from "../../app/GameLoop";

export interface RenderStats {
  fps: number;
  simMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;

  constructor(private readonly root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.domElement = this.renderer.domElement;
    this.domElement.className = "battle-canvas";
    root.appendChild(this.domElement);
    this.resize();
  }

  resize(): void {
    this.renderer.setSize(this.root.clientWidth, this.root.clientHeight, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  stats(loopMetrics: LoopMetrics): RenderStats {
    return {
      fps: loopMetrics.fps,
      simMs: loopMetrics.simMs,
      renderMs: loopMetrics.renderMs,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
}
