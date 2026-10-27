export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutKind =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function calculateLayout(work: Rect, kind: LayoutKind): Rect {
  const halfWidth = Math.floor(work.width / 2);
  const halfHeight = Math.floor(work.height / 2);

  switch (kind) {
    case "left":
      return { x: work.x, y: work.y, width: halfWidth, height: work.height };
    case "right":
      return {
        x: work.x + halfWidth,
        y: work.y,
        width: work.width - halfWidth,
        height: work.height,
      };
    case "top-left":
      return { x: work.x, y: work.y, width: halfWidth, height: halfHeight };
    case "top-right":
      return {
        x: work.x + halfWidth,
        y: work.y,
        width: work.width - halfWidth,
        height: halfHeight,
      };
    case "bottom-left":
      return {
        x: work.x,
        y: work.y + halfHeight,
        width: halfWidth,
        height: work.height - halfHeight,
      };
    case "bottom-right":
      return {
        x: work.x + halfWidth,
        y: work.y + halfHeight,
        width: work.width - halfWidth,
        height: work.height - halfHeight,
      };
  }
}
