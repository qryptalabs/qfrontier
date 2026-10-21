import type { MvpWorld, Player } from './types.ts';

/** Restricts settlement to an explicit village without fabricating a smaller world.
 * Shared deposits, wallets and counterparties remain available to their rules. */
export function settlementPlayers(world: MvpWorld, playerId?: string): Player[] {
  if (playerId === undefined) return Object.values(world.players);
  const player = Object.hasOwn(world.players, playerId) ? world.players[playerId] : undefined;
  return player ? [player] : [];
}

export interface VillageBuildingSettlementScope {
  playerId: string;
  /** An omitted set settles all facilities of this village, not other villages. */
  buildingIds?: ReadonlySet<string>;
}
