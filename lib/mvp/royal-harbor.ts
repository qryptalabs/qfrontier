import {tavernPublicView} from './tavern-public-view.ts';
import type { InventoryLot, ItemId, MvpWorld, Player } from './types.ts';

/** Domain-only contract shared by the authenticated API and presentation.
 * Fish uses the existing Conserva item, with a fishing provenance. No legacy
 * recipe, item identity, player position or catalogue entry is reinterpreted. */
export type RoyalHarborGood = 'fish' | 'timber' | 'plank';
export type RoyalHarborPhase = 'outbound' | 'fishing' | 'returning' | 'docking' | 'unloading' | 'warehousing' | 'transporting' | 'market' | 'idle';
export const ROYAL_HARBOR_CYCLE_MS = 120_000;
export const ROYAL_HARBOR_FISHERY_BUDGET = 1_024;
export const ROYAL_HARBOR_CREDIT_RESERVE = 512;
export const ROYAL_HARBOR_BATCH = 8;
export const ROYAL_HARBOR_STOCK_LIMIT = 128;
export const ROYAL_HARBOR_GOODS: Readonly<Record<RoyalHarborGood, { label: string; itemId: ItemId; buyPrice: number; sellPrice: number }>> = Object.freeze({
  fish: { label: 'Conserva de pescado', itemId: 'preserved_food', buyPrice: 7, sellPrice: 4 },
  timber: { label: 'Madera', itemId: 'timber', buyPrice: 3, sellPrice: 2 },
  plank: { label: 'Tablón', itemId: 'plank', buyPrice: 8, sellPrice: 5 },
});
type HarborPlace = 'ship' | 'warehouse' | 'cart' | 'market';
export interface RoyalHarborDelivery { id: string; at: number; quantity: number; source: 'fishing'; destination: 'market' }
export interface RoyalHarborState {
  schema: 1;
  epoch: number;
  cycleIndex: number;
  nextStep: number;
  cycleCargoIds: string[];
  credits: number;
  initializedCredits: number;
  fishery: { budget: number; remaining: number; spoiled: number };
  stocks: Record<HarborPlace, InventoryLot[]>;
  delivered: number;
  deliveries: RoyalHarborDelivery[];
}
export interface RoyalHarborSnapshot {
  townSupply?:ReturnType<typeof tavernPublicView>;
  revision: number;
  now: number;
  serverEpoch: number;
  initialized: boolean;
  available: boolean;
  reason: string | null;
  city: { id: 'corona-del-alba'; name: 'Corona del Alba' };
  cycle: { index: number; durationMs: number; startsAt: number; endsAt: number; phase: RoyalHarborPhase; phaseStartsAt: number; phaseEndsAt: number; nextTransitionAt: number; fishUnits: number };
  stock: { ship: number; warehouse: number; cart: number; market: number; fisheryRemaining: number };
  goods: { id: RoyalHarborGood; label: string; itemId: ItemId; stock: number; buyPrice: number; sellPrice: number; playerTransferable: number; canBuy: boolean; canSell: boolean }[];
  account: { credits: number };
  merchantCredits: number;
  deliveries: RoyalHarborDelivery[];
  totalDelivered: number;
}
const places: HarborPlace[] = ['ship', 'warehouse', 'cart', 'market'];
const sum = (lots: readonly InventoryLot[], itemId: ItemId = 'preserved_food') => lots.filter(lot => lot.itemId === itemId).reduce((total, lot) => total + lot.qty, 0);
const eventOffsets = [40_000, 72_000, 88_000, 112_000, ROYAL_HARBOR_CYCLE_MS];
const phases: { phase: RoyalHarborPhase; from: number; to: number }[] = [
  { phase: 'outbound', from: 0, to: 16_000 }, { phase: 'fishing', from: 16_000, to: 40_000 },
  { phase: 'returning', from: 40_000, to: 60_000 }, { phase: 'docking', from: 60_000, to: 66_000 },
  { phase: 'unloading', from: 66_000, to: 72_000 }, { phase: 'warehousing', from: 72_000, to: 88_000 },
  { phase: 'transporting', from: 88_000, to: 112_000 }, { phase: 'market', from: 112_000, to: ROYAL_HARBOR_CYCLE_MS },
];
function fishingLot(world: MvpWorld, id: string, qty: number, at: number): InventoryLot {
  return { id, itemId: 'preserved_food', qty, bound: false, quality: 1, expiresAt: at + 168 * 3_600_000, wear: 0, location: 'royal-harbor:ship', provenance: { source: 'corona-del-alba:fishing-quota', creatorId: 'npc:corona-del-alba:fishers', seasonId: world.seasonId, inputs: [] } };
}
/** Blueprint only. It never debits a budget or modifies a legacy world on GET. */
export function previewRoyalHarborState(world: MvpWorld, now: number): RoyalHarborState {
  const epoch = Math.floor(now / ROYAL_HARBOR_CYCLE_MS) * ROYAL_HARBOR_CYCLE_MS;
  const market = fishingLot(world, `royal:${epoch}:opening-market`, 12, epoch);
  const warehouse = fishingLot(world, `royal:${epoch}:opening-warehouse`, 8, epoch);
  market.location = 'royal-harbor:market'; warehouse.location = 'royal-harbor:warehouse';
  return { schema: 1, epoch, cycleIndex: 0, nextStep: 0, cycleCargoIds: [], credits: Math.min(ROYAL_HARBOR_CREDIT_RESERVE, Math.max(0, world.social.npc.remaining)), initializedCredits: Math.min(ROYAL_HARBOR_CREDIT_RESERVE, Math.max(0, world.social.npc.remaining)), fishery: { budget: ROYAL_HARBOR_FISHERY_BUDGET, remaining: ROYAL_HARBOR_FISHERY_BUDGET - 20, spoiled: 0 }, stocks: { ship: [], warehouse: [warehouse], cart: [], market: [market] }, delivered: 0, deliveries: [] };
}
function transfer(state: RoyalHarborState, from: HarborPlace, to: HarborPlace) {
  const ids = new Set(state.cycleCargoIds), moved = state.stocks[from].filter(lot => ids.has(lot.id));
  state.stocks[from] = state.stocks[from].filter(lot => !ids.has(lot.id));
  for (const lot of moved) { lot.location = `royal-harbor:${to}`; state.stocks[to].push(lot); }
  return moved.reduce((total, lot) => total + lot.qty, 0);
}
function expired(state: RoyalHarborState, at: number) {
  for (const place of places) {
    const lost = state.stocks[place].filter(lot => lot.expiresAt !== null && lot.expiresAt <= at);
    state.fishery.spoiled += sum(lost.filter(lot => lot.provenance.source === 'corona-del-alba:fishing-quota'));
    state.stocks[place] = state.stocks[place].filter(lot => lot.expiresAt === null || lot.expiresAt > at);
  }
}
/** A deterministic finite-resource work schedule. Render frames never call this
 * function, create stock or pay a worker. Replay transfers each existing lot
 * exactly once. Idle cycles are skipped arithmetically, so offline projection
 * does not replay a frame or an unbounded history for every elapsed second. */
export function settleRoyalHarborState(world: MvpWorld, state: RoyalHarborState, now: number): void {
  if (state.schema !== 1 || !Number.isSafeInteger(state.epoch) || !Number.isSafeInteger(state.cycleIndex) || state.cycleIndex < 0 || !Number.isInteger(state.nextStep) || state.nextStep < 0 || state.nextStep > 4) throw new Error('El puerto tiene un calendario inválido.');
  let steps = 0;
  for (;;) {
    const startsAt = state.epoch + state.cycleIndex * ROYAL_HARBOR_CYCLE_MS;
    if (startsAt + eventOffsets[state.nextStep] > now) break;
    if (++steps > 2_000) throw new Error('El calendario del puerto requiere revisión.');
    if (state.nextStep === 0) {
      expired(state, startsAt + 40_000);
      const room = ROYAL_HARBOR_STOCK_LIMIT - places.reduce((n, place) => n + sum(state.stocks[place]), 0);
      const qty = Math.min(ROYAL_HARBOR_BATCH, room, state.fishery.remaining);
      if (qty <= 0) {
        // With no fishery quota or no room, no work or resources are invented.
        const target = Math.floor((now - state.epoch) / ROYAL_HARBOR_CYCLE_MS);
        if (target > state.cycleIndex) { state.cycleIndex = target; continue; }
      }
      state.cycleCargoIds = [];
      if (qty > 0) {
        const lot = fishingLot(world, `royal:${state.epoch}:catch:${state.cycleIndex}`, qty, startsAt + 40_000);
        state.fishery.remaining -= qty; state.stocks.ship.push(lot); state.cycleCargoIds.push(lot.id);
      }
    } else if (state.nextStep === 1) transfer(state, 'ship', 'warehouse');
    else if (state.nextStep === 2) transfer(state, 'warehouse', 'cart');
    else if (state.nextStep === 3) {
      const qty = transfer(state, 'cart', 'market');
      if (qty) { state.delivered += qty; state.deliveries.unshift({ id: `royal:${state.epoch}:delivery:${state.cycleIndex}`, at: startsAt + 112_000, quantity: qty, source: 'fishing', destination: 'market' }); state.deliveries = state.deliveries.slice(0, 12); }
    } else { state.cycleIndex++; state.nextStep = 0; state.cycleCargoIds = []; continue; }
    state.nextStep++;
  }
  expired(state, now);
}
/** A pure projection: opening a district never alters a save, reserves money,
 * advances an order, creates a receipt or changes a player's coordinates. */
export function royalHarborSnapshot(world: MvpWorld, player: Player, revision: number, now: number): RoyalHarborSnapshot {
  const initialized = !!world.royalHarbor, state = structuredClone(world.royalHarbor ?? previewRoyalHarborState(world, now));
  settleRoyalHarborState(world, state, now);
  const balance = world.social.accounts[player.id]?.credits ?? 0;
  const startsAt = state.epoch + state.cycleIndex * ROYAL_HARBOR_CYCLE_MS;
  const phase = phases.find(entry => now - startsAt < entry.to) ?? phases.at(-1)!;
  const working = state.cycleCargoIds.length > 0 || state.fishery.remaining > 0 && places.reduce((n, place) => n + sum(state.stocks[place]), 0) < ROYAL_HARBOR_STOCK_LIMIT;
  return { townSupply:tavernPublicView(world,now),revision, now, serverEpoch: state.epoch, initialized, available: true, reason: null, city: { id: 'corona-del-alba', name: 'Corona del Alba' },
    cycle: { index: state.cycleIndex, durationMs: ROYAL_HARBOR_CYCLE_MS, startsAt, endsAt: startsAt + ROYAL_HARBOR_CYCLE_MS, phase: working ? phase.phase : 'idle', phaseStartsAt: startsAt + phase.from, phaseEndsAt: startsAt + phase.to, nextTransitionAt: startsAt + phase.to, fishUnits: state.cycleCargoIds.reduce((n, id) => n + places.flatMap(place => state.stocks[place]).filter(lot => lot.id === id).reduce((s, lot) => s + lot.qty, 0), 0) },
    stock: { ship: sum(state.stocks.ship), warehouse: sum(state.stocks.warehouse), cart: sum(state.stocks.cart), market: sum(state.stocks.market), fisheryRemaining: state.fishery.remaining },
    goods: (Object.entries(ROYAL_HARBOR_GOODS) as [RoyalHarborGood, typeof ROYAL_HARBOR_GOODS[RoyalHarborGood]][]).map(([id, definition]) => {
      const stock = sum(state.stocks.market, definition.itemId), playerTransferable = player.inventory.filter(lot => lot.itemId === definition.itemId && !lot.bound && lot.quality >= 1 && (lot.expiresAt === null || lot.expiresAt > now)).reduce((n, lot) => n + lot.qty, 0);
      return { id, ...definition, stock, playerTransferable, canBuy: stock > 0 && balance >= definition.buyPrice, canSell: playerTransferable > 0 && state.credits >= definition.sellPrice && stock < ROYAL_HARBOR_STOCK_LIMIT };
    }), account: { credits: balance }, merchantCredits: state.credits, deliveries: state.deliveries, totalDelivered: state.delivered };
}
