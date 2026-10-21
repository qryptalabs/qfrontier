/** Authored village detail footprint within continuous local scenery.
 * These coordinates never stand in for server world tiles or parcel ownership.
 */
export const SETTLEMENT_CELL = .4;
export const SETTLEMENT_HALF_WIDTH = 16;
export const SETTLEMENT_HALF_DEPTH = 13;

export function sceneryNoise(x: number, z: number, salt = 0): number {
  let value = Math.imul(Math.round(x * 17) + 193 + salt, 374761393) ^ Math.imul(Math.round(z * 19) + 431, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value >>> 0) / 4294967295;
}

export function islandContains(x: number, z: number): boolean {
  const ax = Math.abs(x), az = Math.abs(z);
  const xEdge = SETTLEMENT_HALF_WIDTH - Math.floor(sceneryNoise(Math.floor(z / 1.6), 3, 18) * 3) * .4;
  const zEdge = SETTLEMENT_HALF_DEPTH - Math.floor(sceneryNoise(Math.floor(x / 1.6), 5, 28) * 3) * .4;
  return ax < xEdge && az < zEdge && ax + az < 26.7 + sceneryNoise(Math.round(x), Math.round(z), 8) * 1.5;
}

export function riverCenter(z: number): number {
  return 9.25 + Math.sin(z * .23 + .3) * 1.8 + Math.sin(z * .51) * .38;
}

export function riverWidth(z: number): number {
  return 3.15 + Math.cos(z * .38) * .42 + Math.sin(z * .81) * .13;
}

export function isSceneryWater(x: number, z: number): boolean {
  const lakeInset = Math.max(0, -z - 14.5) * .75;
  return Math.abs(x - riverCenter(z)) < riverWidth(z) / 2 || (z < -9.5 && z > -17.4 && x > -3.5 + lakeInset && x < 7.1);
}

export function sceneryWaterHeight(z: number): number {
  if (z > 12.95) return -1.38;
  if (z > 11.5) return .42;
  if (z > 9) return .88;
  return 1.28;
}

/** The village and its movement lanes stay planar; terraces surround it. */
export function settlementHeightAt(x: number, z: number): number {
  if (isSceneryWater(x, z)) return sceneryWaterHeight(z) - .34;
  if (x > 12 && x < 14.15 && z > -.8 && z < 1.6) return 4.05;
  if (z < -9.2 && x < 6.8 && x > -8) return 1.65;
  if (x > 5.3 && z < -4.3) return 3.65;
  if (x < -8.5 && z < -5.5) return 2.6;
  if (x < -11.6 && z > 2.7) return 2.28;
  if (x > riverCenter(z) + riverWidth(z) / 2 && z < 8) return 2.15;
  if (z > 9.3) return 1.65;
  return 2;
}

export const SETTLEMENT_ANCHORS = {
  home: [-1.55, 2, -2.75], workshop: [-6.45, 2, -2.7],
  garden: [-1.6, 2, 4.2], kitchen: [-5.8, 2, -6.45],
  laboratory: [2.1, 2, -6.3], barracks: [-5.55, 2, 7.3],
  warehouse: [3.3, 2, -2.5], logistics: [3.4, 2, 6.9],
  mine: [10.8, 3.65, -5.85], bridge: [10.6, 2.2, 4.25],
} as const;
