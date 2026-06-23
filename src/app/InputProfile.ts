export type InputProfileKind = "desktop" | "touch" | "hybrid";

export interface InputProfile {
  kind: InputProfileKind;
  hasTouch: boolean;
  hasFinePointer: boolean;
}

export function detectInputProfile(): InputProfile {
  const hasTouch = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  const hasFinePointer = matchMedia("(pointer: fine)").matches;
  return {
    kind: hasTouch && hasFinePointer ? "hybrid" : hasTouch ? "touch" : "desktop",
    hasTouch,
    hasFinePointer,
  };
}
