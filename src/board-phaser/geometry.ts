/**
 * Board geometry: ground-space hex layout squashed by the oblique camera.
 * All positions are in world units centred on the island's middle hex.
 */
import { HEX_COORDS, HEX_COUNT } from '@/engine/board/layout';
import { EDGE_COUNT, TOPOLOGY, VERTEX_COUNT } from '@/engine/board/topology';
import { CAMERA_K, HEX_R, type RoadOrientation } from './assets';

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** Ground-space centre of a hex (pointy-top axial). */
export function hexCenterGround(q: number, r: number): Point {
  return { x: HEX_R * SQRT3 * (q + r / 2), y: HEX_R * 1.5 * r };
}

/** Ground-space corner i (clockwise from north) of a hex centred at c. */
export function hexCornerGround(c: Point, i: number): Point {
  const angle = (Math.PI / 180) * (-90 + 60 * i);
  return { x: c.x + HEX_R * Math.cos(angle), y: c.y + HEX_R * Math.sin(angle) };
}

export function toScreen(p: Point): Point {
  return { x: p.x, y: p.y * CAMERA_K };
}

export const HEX_PX: readonly Point[] = HEX_COORDS.map((c) => toScreen(hexCenterGround(c.q, c.r)));

export const VERTEX_PX: readonly Point[] = (() => {
  const out: Point[] = Array.from({ length: VERTEX_COUNT }, () => ({ x: 0, y: 0 }));
  for (let h = 0; h < HEX_COUNT; h++) {
    const c = hexCenterGround(HEX_COORDS[h].q, HEX_COORDS[h].r);
    TOPOLOGY.hexVertices[h].forEach((v, i) => {
      out[v] = toScreen(hexCornerGround(c, i));
    });
  }
  return out;
})();

export interface EdgeGeometry {
  mid: Point;
  /** Screen-space angle in radians. */
  angle: number;
  orientation: RoadOrientation;
  /** Outward normal (unit, screen space) for rim edges, pointing away from the island. */
  outward: Point;
}

export const EDGE_PX: readonly EdgeGeometry[] = (() => {
  const out: EdgeGeometry[] = [];
  for (let e = 0; e < EDGE_COUNT; e++) {
    const [a, b] = TOPOLOGY.edgeVertices[e];
    const pa = VERTEX_PX[a];
    const pb = VERTEX_PX[b];
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const angle = Math.atan2(dy, dx);
    let orientation: RoadOrientation;
    if (Math.abs(dx) < 1e-6) orientation = 'vertical';
    else orientation = dx * dy > 0 ? 'down' : 'up';
    const hex = TOPOLOGY.edgeHexes[e][0];
    const hc = HEX_PX[hex];
    let outward = { x: mid.x - hc.x, y: mid.y - hc.y };
    const len = Math.hypot(outward.x, outward.y) || 1;
    outward = { x: outward.x / len, y: outward.y / len };
    out.push({ mid, angle, orientation, outward });
  }
  return out;
})();

/**
 * Screen-space bounding box of the island including a margin of sea. Extra water is
 * reserved above (instruction card) and below (hand tray) so overlays never cover land.
 */
export function boardBounds(margin = HEX_R * 1.1, extraTop = 0, extraBottom = 0, extraRight = 0, extraLeft = 0): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of VERTEX_PX) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX: minX - margin - extraLeft, minY: minY - margin * CAMERA_K - extraTop, maxX: maxX + margin + extraRight, maxY: maxY + margin * CAMERA_K + extraBottom };
}

/** Screen-space polygon of a hex's top face. */
export function hexPolygon(h: number): Point[] {
  const c = hexCenterGround(HEX_COORDS[h].q, HEX_COORDS[h].r);
  return [0, 1, 2, 3, 4, 5].map((i) => toScreen(hexCornerGround(c, i)));
}
