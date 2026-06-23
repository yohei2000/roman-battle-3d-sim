import { dot, fromAngle, rightFromFacing, sub, type Vec2 } from "./Vec2";

export interface OrientedBox {
  center: Vec2;
  width: number;
  depth: number;
  facing: number;
}

export function boxAxes(box: OrientedBox): [Vec2, Vec2] {
  return [rightFromFacing(box.facing), fromAngle(box.facing)];
}

export function boxCorners(box: OrientedBox): Vec2[] {
  const [right, forward] = boxAxes(box);
  const halfWidth = box.width * 0.5;
  const halfDepth = box.depth * 0.5;
  return [
    {
      x: box.center.x + right.x * halfWidth + forward.x * halfDepth,
      y: box.center.y + right.y * halfWidth + forward.y * halfDepth,
    },
    {
      x: box.center.x - right.x * halfWidth + forward.x * halfDepth,
      y: box.center.y - right.y * halfWidth + forward.y * halfDepth,
    },
    {
      x: box.center.x - right.x * halfWidth - forward.x * halfDepth,
      y: box.center.y - right.y * halfWidth - forward.y * halfDepth,
    },
    {
      x: box.center.x + right.x * halfWidth - forward.x * halfDepth,
      y: box.center.y + right.y * halfWidth - forward.y * halfDepth,
    },
  ];
}

export function pointInBox(point: Vec2, box: OrientedBox): boolean {
  const [right, forward] = boxAxes(box);
  const local = sub(point, box.center);
  return (
    Math.abs(dot(local, right)) <= box.width * 0.5 &&
    Math.abs(dot(local, forward)) <= box.depth * 0.5
  );
}

export function frontCenter(box: OrientedBox): Vec2 {
  const forward = fromAngle(box.facing);
  return {
    x: box.center.x + forward.x * box.depth * 0.5,
    y: box.center.y + forward.y * box.depth * 0.5,
  };
}

export function rearCenter(box: OrientedBox): Vec2 {
  const forward = fromAngle(box.facing);
  return {
    x: box.center.x - forward.x * box.depth * 0.5,
    y: box.center.y - forward.y * box.depth * 0.5,
  };
}

function project(points: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = dot(points[0], axis);
  let max = min;
  for (let index = 1; index < points.length; index += 1) {
    const value = dot(points[index], axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

export function orientedBoxesOverlap(a: OrientedBox, b: OrientedBox, padding = 0): boolean {
  const aCorners = boxCorners({ ...a, width: a.width + padding, depth: a.depth + padding });
  const bCorners = boxCorners({ ...b, width: b.width + padding, depth: b.depth + padding });
  const axes = [...boxAxes(a), ...boxAxes(b)];

  for (const axis of axes) {
    const aProjection = project(aCorners, axis);
    const bProjection = project(bCorners, axis);
    if (aProjection.max < bProjection.min || bProjection.max < aProjection.min) {
      return false;
    }
  }

  return true;
}

export function centerDistanceToBox(point: Vec2, box: OrientedBox): number {
  const [right, forward] = boxAxes(box);
  const local = sub(point, box.center);
  const dx = Math.max(Math.abs(dot(local, right)) - box.width * 0.5, 0);
  const dy = Math.max(Math.abs(dot(local, forward)) - box.depth * 0.5, 0);
  return Math.hypot(dx, dy);
}
