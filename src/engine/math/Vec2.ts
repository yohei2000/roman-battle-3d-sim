export interface Vec2 {
  x: number;
  y: number;
}

export const VEC2_ZERO: Vec2 = { x: 0, y: 0 };

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSq(v: Vec2): number {
  return dot(v, v);
}

export function length(v: Vec2): number {
  return Math.sqrt(lengthSq(v));
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  if (len < 0.00001) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

export function fromAngle(radians: number): Vec2 {
  return { x: Math.sin(radians), y: Math.cos(radians) };
}

export function rightFromFacing(radians: number): Vec2 {
  return { x: Math.cos(radians), y: -Math.sin(radians) };
}

export function angleOf(v: Vec2): number {
  return Math.atan2(v.x, v.y);
}

export function rotate(v: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: v.x * c + v.y * s,
    y: -v.x * s + v.y * c,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function saturate(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function wrapAngle(radians: number): number {
  let result = radians;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function moveAngleToward(current: number, target: number, maxStep: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) {
    return target;
  }
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

export function vecToString(v: Vec2): string {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}`;
}
