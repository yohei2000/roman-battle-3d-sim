import type { LoopMetrics } from "../app/GameLoop";
import type { RenderStats } from "../engine/render/Renderer";
import type { GesturePreview } from "../engine/sim/IntentTypes";
import type { DebugFlags, FormationIntent, SimSnapshot } from "../engine/sim/SimTypes";
import type { SimWorld } from "../engine/sim/SimWorld";
import { doctrineLabel } from "../engine/sim/ComplexityModel";

export class Hud {
  private readonly selectedPanel: HTMLDivElement;
  private readonly intentPanel: HTMLDivElement;
  private readonly metricsPanel: HTMLDivElement;
  private readonly eventList: HTMLDivElement;
  private readonly commandButtons = new Map<FormationIntent, HTMLButtonElement>();
  private readonly debugPanel: HTMLDivElement;

  constructor(root: HTMLElement, private readonly world: SimWorld) {
    const hud = document.createElement("div");
    hud.className = "hud";

    const commandBar = document.createElement("div");
    commandBar.className = "command-bar";
    this.addCommandButton(commandBar, "hold", "Hold");
    this.addCommandButton(commandBar, "advance", "Advance");
    this.addCommandButton(commandBar, "reform", "Reform");
    this.addCommandButton(commandBar, "retreat", "Retreat");

    this.selectedPanel = document.createElement("div");
    this.selectedPanel.className = "panel selected-panel";

    this.intentPanel = document.createElement("div");
    this.intentPanel.className = "panel intent-panel";

    this.metricsPanel = document.createElement("div");
    this.metricsPanel.className = "panel metrics-panel";

    this.eventList = document.createElement("div");
    this.eventList.className = "event-list";

    this.debugPanel = document.createElement("div");
    this.debugPanel.className = "panel debug-panel";
    this.addDebugToggle("bounds", "Bounds");
    this.addDebugToggle("fronts", "Front");
    this.addDebugToggle("contactLanes", "Lanes");
    this.addDebugToggle("labels", "Labels");
    this.addDebugToggle("pressureLabels", "Stats");

    hud.append(commandBar, this.selectedPanel, this.intentPanel, this.metricsPanel, this.eventList, this.debugPanel);
    root.appendChild(hud);
  }

  update(
    snapshot: SimSnapshot,
    loop: LoopMetrics,
    renderStats: RenderStats,
    gesturePreview: GesturePreview,
  ): void {
    const selected = snapshot.formations.filter((formation) => formation.selected);
    for (const [type, button] of this.commandButtons) {
      button.disabled = selected.length === 0 || (type === "retreat" && selected.every((f) => f.state === "routing"));
    }

    this.selectedPanel.innerHTML = "";
    if (selected.length === 0) {
      this.selectedPanel.append(row("Selected", "None"));
    } else {
      const primary = selected[0];
      const phase =
        snapshot.engagements.find(
          (engagement) => engagement.aFormationId === primary.id || engagement.bFormationId === primary.id,
        )?.phase ?? "none";
      this.selectedPanel.append(
        row("Selected", selected.length === 1 ? primary.name : `${selected.length} formations`),
        row("Role", `${primary.role}${primary.role === "reserve" && !primary.reserveReleased ? " (held)" : ""}`),
        row("State", `${primary.state} / ${phase}`),
        meter("Morale", primary.morale, "#78d38b"),
        meter("Cohesion", primary.cohesion, "#76b7ff"),
        meter("Fatigue", primary.fatigue, "#e7b75f", true),
        meter("Pressure", Math.min(primary.pressure / 1.4, 1), "#f1806c", true),
        meter("Discipline", primary.discipline, "#d5c475"),
        meter("Panic", Math.min(primary.panic / 1.2, 1), "#ff8f9b", true),
        row("Delay", `${primary.commandDelay.toFixed(2)}s`),
      );
    }

    this.intentPanel.innerHTML = "";
    const intentSnapshot = this.world.intentSnapshot();
    const intentCount = intentSnapshot.intents.length;
    const focus = snapshot.commandFocus;
    const ownedObjectives = snapshot.objectives.filter((objective) => objective.owner === "rome").length;
    const contestedObjectives = snapshot.objectives.filter((objective) => objective.contested).length;
    const collapse = snapshot.collapseReasons[snapshot.collapseReasons.length - 1];
    this.intentPanel.append(
      row("Focus", `${focus.current.toFixed(0)} / ${focus.max} (+${focus.recoveryRate.toFixed(1)}/s)`),
      row("Mode", modeLabel(gesturePreview.mode)),
      row("Doctrine", doctrineLabel(snapshot.doctrine)),
      row("Objectives", `${ownedObjectives}/${snapshot.objectives.length}${contestedObjectives ? ` (${contestedObjectives} contested)` : ""}`),
      row("Intents", `${intentCount}`),
    );
    if (collapse) {
      const reason = document.createElement("div");
      reason.className = "intent-status collapse-reason";
      reason.textContent = `${collapse.formationId}: ${collapse.reason}`;
      this.intentPanel.appendChild(reason);
    }
    if (gesturePreview.mode !== "select") {
      const hint = document.createElement("div");
      hint.className = "intent-hint";
      hint.textContent = gesturePreview.pendingConfirm
        ? "Confirm / Cancel / Undo"
        : "Draw with one finger  Two fingers move camera";
      this.intentPanel.appendChild(hint);
    }
    if (gesturePreview.status) {
      const status = document.createElement("div");
      status.className = "intent-status";
      status.textContent = gesturePreview.status;
      this.intentPanel.appendChild(status);
    }

    this.metricsPanel.textContent = `FPS ${renderStats.fps.toFixed(0)}  SIM ${loop.simMs.toFixed(
      1,
    )}ms  RENDER ${loop.renderMs.toFixed(1)}ms  DRAWS ${renderStats.drawCalls}  TRIS ${renderStats.triangles}`;

    this.eventList.innerHTML = snapshot.events
      .slice()
      .reverse()
      .map((event) => `<div><span>${event.time.toFixed(1)}</span>${escapeHtml(event.message)}</div>`)
      .join("");
  }

  private addCommandButton(container: HTMLElement, type: FormationIntent, label: string): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (type === "advance") {
        this.world.advanceSelected();
      } else {
        this.world.issueSelected(type);
      }
    });
    this.commandButtons.set(type, button);
    container.appendChild(button);
  }

  private addDebugToggle(flag: keyof DebugFlags, label: string): void {
    const wrapper = document.createElement("label");
    wrapper.className = "toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.world.debugFlags[flag];
    input.addEventListener("change", () => {
      this.world.debugFlags[flag] = input.checked;
    });
    const span = document.createElement("span");
    span.textContent = label;
    wrapper.append(input, span);
    this.debugPanel.appendChild(wrapper);
  }
}

function row(label: string, value: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "stat-row";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  element.append(labelElement, valueElement);
  return element;
}

function meter(label: string, value: number, color: string, inverse = false): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "meter-row";
  const top = document.createElement("div");
  top.className = "meter-label";
  top.append(row(label, `${Math.round(value * 100)}%`));
  const bar = document.createElement("div");
  bar.className = "meter";
  const fill = document.createElement("div");
  fill.style.width = `${Math.max(0, Math.min(100, value * 100))}%`;
  fill.style.background = inverse ? `linear-gradient(90deg, ${color}, #ffcf7a)` : color;
  bar.appendChild(fill);
  element.append(top, bar);
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function modeLabel(mode: GesturePreview["mode"]): string {
  if (mode === "draw_frontline") return "Draw Frontline";
  if (mode === "paint_pressure") return "Paint Pressure";
  if (mode === "place_standard") return "Place Standard";
  if (mode === "draw_fallback") return "Draw Fallback";
  if (mode === "release_reserve") return "Release Reserve";
  if (mode === "focus_objective") return "Focus Objective";
  if (mode === "set_contingency") return "Set Contingency";
  return "Select";
}
