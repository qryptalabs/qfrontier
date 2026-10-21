import type { PublicSettlement } from '../mvp/view.ts';
import { PARCEL_WIDTH, PARCEL_DEPTH, WORLD_SECTOR_SPAN, globalToTile } from '../mvp/settlements.ts';
import { TILE_SIZE } from './scene-data.ts';

export const ATLAS_SCALE = TILE_SIZE / WORLD_SECTOR_SPAN;
export function atlasWorldBounds(settlements: readonly PublicSettlement[] = []) {
  const half = WORLD_SECTOR_SPAN * 4.5;
  return settlements.reduce((bounds, settlement) => ({
    minX: Math.min(bounds.minX, settlement.plot.x - settlement.plot.width / 2),
    maxX: Math.max(bounds.maxX, settlement.plot.x + settlement.plot.width / 2),
    minY: Math.min(bounds.minY, settlement.plot.y - settlement.plot.depth / 2),
    maxY: Math.max(bounds.maxY, settlement.plot.y + settlement.plot.depth / 2),
  }), { minX: -half, maxX: half, minY: -half, maxY: half });
}
export function globalToAtlas(x: number, y: number): { x: number; z: number } {
  return { x: x * ATLAS_SCALE, z: y * ATLAS_SCALE };
}
export function atlasToGlobal(x: number, z: number): { x: number; y: number } {
  return { x: x / ATLAS_SCALE, y: z / ATLAS_SCALE };
}
export function settlementFootprint(settlement: Pick<PublicSettlement, 'plot'>) {
  const point = globalToAtlas(settlement.plot.x, settlement.plot.y);
  return { ...point, width: (settlement.plot.width || PARCEL_WIDTH) * ATLAS_SCALE, depth: (settlement.plot.depth || PARCEL_DEPTH) * ATLAS_SCALE };
}
export function settlementTile(settlement: Pick<PublicSettlement, 'plot'>): string {
  return globalToTile(settlement.plot.x, settlement.plot.y);
}
export function settlementSceneSignature(settlements: readonly PublicSettlement[]): string {
  return JSON.stringify(settlements.map(settlement => [settlement.id, settlement.name, settlement.ownerName,
    settlement.faction, settlement.clanName, settlement.plot, settlement.buildings, settlement.own, settlement.protectionUntil]));
}
