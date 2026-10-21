import { islandContains, isSceneryWater, riverCenter, riverWidth, sceneryNoise, sceneryWaterHeight, settlementHeightAt } from './settlement-layout.ts';

export const LANDSCAPE_HALF_EXTENT = 84;
export const LANDSCAPE_BOUNDS = { minX: -84, maxX: 84, minZ: -84, maxZ: 84 } as const;

function smooth(value: number): number { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

/** Matches the authored village ground at its seam, then rolls into a forested
 * river valley. The ground exists beyond the playable parcel in every direction.
 */
export function continuousGroundHeight(x: number, z: number): number {
  if (isSceneryWater(x, z)) return sceneryWaterHeight(z) - .34;
  if (islandContains(x, z)) return settlementHeightAt(x, z);
  const outside = Math.max(Math.abs(x) - 15.2, Math.abs(z) - 12.2, 0);
  const blend = smooth(Math.max(0, outside - 1) / 13);
  const seam = settlementHeightAt(x, z);
  const bankDistance = Math.max(0, Math.abs(x - riverCenter(z)) - riverWidth(z) / 2);
  const roll = Math.sin(x * .105 + .4) * .55 + Math.cos(z * .095 - .3) * .44;
  const valley = sceneryWaterHeight(z) + .82 + Math.min(5, bankDistance * .19) + roll;
  const ridges = Math.exp(-Math.pow((Math.abs(x) - 59) / 16, 2)) * (4.7 + Math.sin(z * .16) * 1.8)
    + Math.exp(-Math.pow((Math.abs(z) - 62) / 13, 2)) * (5.4 + Math.cos(x * .12) * 1.6);
  return seam * (1 - blend) + (valley + ridges) * blend;
}

/** Roads continue out through the valley, rather than ending on a cut slab. */
export function valleyRoadCenter(x: number, z: number): boolean {
  const west = x < -9.8 && x > -46 && Math.abs(z - (.4 + Math.sin((x + 10) * .08) * 2.2)) < .7;
  const south = z > 8.2 && z < 49 && Math.abs(x - (1.2 + Math.sin((z - 8.5) * .1) * 3)) < .65;
  const east = x > 14.2 && x < 48 && Math.abs(z - (4.3 + Math.sin((x - 14.6) * .09) * 3)) < .7;
  return (west || south || east) && !isSceneryWater(x, z);
}

export function sceneryHasGround(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= LANDSCAPE_HALF_EXTENT && Math.abs(z) <= LANDSCAPE_HALF_EXTENT;
}

export function isValleyTreePosition(x: number, z: number): boolean {
  if (islandContains(x, z) || isSceneryWater(x, z) || valleyRoadCenter(x, z)) return false;
  return Math.abs(x - riverCenter(z)) > riverWidth(z) / 2 + .9 && sceneryNoise(x, z, 96) > .27;
}
