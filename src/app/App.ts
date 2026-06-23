import { GameLoop } from "./GameLoop";
import { InputRouter } from "./InputRouter";
import { SimWorld } from "../engine/sim/SimWorld";
import { Renderer } from "../engine/render/Renderer";
import { SceneRoot } from "../engine/render/SceneRoot";
import { addLighting } from "../engine/render/Lighting";
import { TerrainRenderer } from "../engine/render/TerrainRenderer";
import { SoldierCrowdRenderer } from "../engine/render/SoldierCrowdRenderer";
import { FormationRenderer } from "../engine/render/FormationRenderer";
import { DebugOverlayRenderer } from "../engine/render/DebugOverlayRenderer";
import { EffectsRenderer } from "../engine/render/EffectsRenderer";
import { CameraRig } from "../engine/render/CameraRig";
import { Hud } from "../ui/Hud";

export class App {
  private readonly world = new SimWorld();
  private readonly renderer: Renderer;
  private readonly sceneRoot = new SceneRoot();
  private readonly camera: CameraRig;
  private readonly terrainRenderer: TerrainRenderer;
  private readonly soldiers: SoldierCrowdRenderer;
  private readonly formations: FormationRenderer;
  private readonly effects: EffectsRenderer;
  private readonly overlay: DebugOverlayRenderer;
  private readonly hud: Hud;
  private readonly loop: GameLoop;
  private readonly input: InputRouter;

  constructor(private readonly root: HTMLElement) {
    this.renderer = new Renderer(root);
    this.camera = new CameraRig(this.world.terrain);
    this.camera.resize(root.clientWidth, root.clientHeight);
    addLighting(this.sceneRoot.scene);
    this.terrainRenderer = new TerrainRenderer(this.world.terrain);
    this.terrainRenderer.addTo(this.sceneRoot.scene);
    this.soldiers = new SoldierCrowdRenderer(this.sceneRoot.scene, this.world.terrain);
    this.formations = new FormationRenderer(this.sceneRoot.scene, this.world.terrain);
    this.effects = new EffectsRenderer(this.sceneRoot.scene, this.world.terrain);
    this.overlay = new DebugOverlayRenderer(root, this.camera);
    this.hud = new Hud(root, this.world);
    this.input = new InputRouter(this.renderer.domElement, this.camera, this.world, root);
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );
    window.addEventListener("resize", () => this.resize());
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
    this.world.step(dt);
    this.camera.update(dt, this.world.selectedFormations(), this.world.time);
  }

  private render(_alpha: number): void {
    const snapshot = this.world.snapshot();
    this.soldiers.update(snapshot.formations, snapshot.time);
    this.formations.update(snapshot.formations);
    this.effects.update(snapshot);
    this.renderer.render(this.sceneRoot.scene, this.camera.camera);
    this.overlay.render(snapshot, this.world.debugFlags);
    this.hud.update(snapshot, this.loop.metrics, this.renderer.stats(this.loop.metrics));
  }

  private resize(): void {
    this.renderer.resize();
    this.camera.resize(this.root.clientWidth, this.root.clientHeight);
    this.overlay.resize();
  }
}
