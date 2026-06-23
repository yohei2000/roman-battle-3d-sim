import type { Vec2 } from "../math/Vec2";
import type { SideId } from "./SimTypes";

export type InputMode =
  | "select"
  | "draw_frontline"
  | "paint_pressure"
  | "place_standard"
  | "draw_fallback";

export type IntentKind =
  | "frontline"
  | "pressure_stroke"
  | "standard"
  | "fallback_line"
  | "contingency";

export type FormationId = string;
export type SpacingMode = "tight" | "normal" | "loose";
export type DepthMode = "thin" | "normal" | "deep";
export type AlignmentMode = "normal" | "careful";

export interface LineIntentOptions {
  spacingMode: SpacingMode;
  depthMode: DepthMode;
  alignmentMode: AlignmentMode;
}

export interface FrontlineAssignment {
  formationId: FormationId;
  targetCenter: Vec2;
  targetFacing: number;
  width: number;
  depth: number;
  index: number;
}

export interface LineIntent extends LineIntentOptions {
  id: number;
  kind: "frontline";
  side: SideId;
  points: Vec2[];
  formationIds: FormationId[];
  createdAt: number;
  expiresAt?: number;
  committed: boolean;
  assignments: FrontlineAssignment[];
}

export type AssignedTarget = FrontlineAssignment;

export interface PressureStroke {
  id: number;
  kind: "pressure_stroke";
  side: SideId;
  points: Vec2[];
  radius: number;
  strength: number;
  formationIds: FormationId[];
  createdAt: number;
  expiresAt?: number;
}

export interface Standard {
  id: number;
  kind: "standard";
  side: SideId;
  position: Vec2;
  radius: number;
  moraleBonus: number;
  commandBonus: number;
  attachedFormationIds: FormationId[];
  createdAt: number;
}

export interface FallbackLine {
  id: number;
  kind: "fallback_line";
  side: SideId;
  points: Vec2[];
  formationIds: FormationId[];
  createdAt: number;
}

export interface ContingencyIntent {
  id: number;
  kind: "contingency";
  trigger: "on_contact" | "on_friendly_rupture" | "on_enemy_rout";
  action: "advance" | "hold" | "reform" | "retreat" | "move_to_line";
  formationIds: FormationId[];
  targetLineId?: number;
  consumed: boolean;
  createdAt: number;
}

export type TacticalIntent =
  | LineIntent
  | PressureStroke
  | Standard
  | FallbackLine
  | ContingencyIntent;

export interface IntentSnapshot {
  intents: TacticalIntent[];
  committedFrontlines: LineIntent[];
  pressureStrokes: PressureStroke[];
  standards: Standard[];
  fallbackLines: FallbackLine[];
  revision: number;
  lastStatus?: string;
}

export interface GesturePreview extends LineIntentOptions {
  mode: InputMode;
  active: boolean;
  pendingConfirm: boolean;
  tool: IntentKind | "none";
  points: Vec2[];
  position?: Vec2;
  radius?: number;
  assignments: FrontlineAssignment[];
  inputProfile?: "desktop" | "touch" | "hybrid";
  status?: string;
}

export interface IntentInfluence {
  pressureStrength: number;
  standardMorale: number;
  standardCommand: number;
  fallbackAvailable: boolean;
}
