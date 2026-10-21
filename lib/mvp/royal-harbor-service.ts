import {settleDueTavernSupplies} from './tavern-settlement.ts';
import { addLots, consume, emit, integer, MvpError, nextLotId } from './helpers.ts';
import { nextSocialId } from './operation-ids.ts';
import { previewRoyalHarborState, ROYAL_HARBOR_GOODS, ROYAL_HARBOR_STOCK_LIMIT, royalHarborSnapshot, settleRoyalHarborState } from './royal-harbor.ts';
import type { RoyalHarborGood, RoyalHarborSnapshot, RoyalHarborState } from './royal-harbor.ts';
import type { MvpStore } from './store.ts';
import type { InventoryLot, MvpWorld, Player } from './types.ts';

export interface RoyalHarborTradeCommand {
  type: 'royal-harbor.buy' | 'royal-harbor.sell';
  playerId: string;
  good: RoyalHarborGood;
  qty: number;
}
export interface RoyalHarborTradeRequest { requestId: string; expectedRevision: number; command: RoyalHarborTradeCommand }
const attempts = 8;
function requireOwner(ownerId: string) { if (typeof ownerId !== 'string' || !ownerId || ownerId.length > 256) throw new MvpError('Inicia sesión para entrar al puerto.', 401); }
function playerFor(world: MvpWorld, ownerId: string, id: string | undefined): Player {
  if (typeof id !== 'string' || !id || id.length > 180) throw new MvpError('Selecciona tu explorador para visitar el puerto.', 400);
  const player = Object.hasOwn(world.players, id) ? world.players[id] : undefined;
  if (!player || player.ownerId !== ownerId) throw new MvpError('Ese explorador no pertenece a tu cuenta.', 403);
  return player;
}
function commandFor(value: unknown): RoyalHarborTradeCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MvpError('La operación portuaria no es válida.');
  const command = value as Record<string, unknown>;
  if (Object.keys(command).some(key => !['type', 'playerId', 'good', 'qty'].includes(key)) || !['royal-harbor.buy', 'royal-harbor.sell'].includes(String(command.type)) || typeof command.good !== 'string' || !Object.hasOwn(ROYAL_HARBOR_GOODS, command.good) || typeof command.playerId !== 'string' || !command.playerId || command.playerId.length > 180) throw new MvpError('La operación portuaria no es válida.');
  const qty = integer(command.qty, 'Cantidad', 1, 20);
  return { type: command.type as RoyalHarborTradeCommand['type'], playerId: command.playerId, good: command.good as RoyalHarborGood, qty };
}
async function fingerprint(command: RoyalHarborTradeCommand): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(command)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function validateState(state: RoyalHarborState) {
  if (!Number.isSafeInteger(state.credits) || state.credits < 0 || !Number.isSafeInteger(state.fishery.remaining) || state.fishery.remaining < 0 || state.fishery.remaining > state.fishery.budget) throw new MvpError('El presupuesto del puerto requiere revisión.', 503);
  for (const lots of Object.values(state.stocks)) for (const lot of lots) if (!Number.isSafeInteger(lot.qty) || lot.qty <= 0 || lot.bound || !Number.isFinite(lot.quality) || lot.quality < 1) throw new MvpError('Las existencias del puerto requieren revisión.', 503);
}
function takeMarket(state: RoyalHarborState, player: Player, itemId: InventoryLot['itemId'], qty: number, now: number): InventoryLot[] {
  const lots = state.stocks.market.filter(lot => lot.itemId === itemId && !lot.bound && lot.quality >= 1 && (lot.expiresAt === null || lot.expiresAt > now)).sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  if (lots.reduce((total, lot) => total + lot.qty, 0) < qty) throw new MvpError('El mercado no tiene suficientes unidades disponibles.', 409);
  const result: InventoryLot[] = [];
  let remaining = qty;
  for (const lot of lots) {
    if (!remaining) break;
    const amount = Math.min(remaining, lot.qty), moved = structuredClone(lot);
    // The traded split receives its own identity; its source and origin remain.
    moved.originLotId ??= lot.originLotId ?? lot.id; moved.id = nextLotId(player); moved.qty = amount; moved.location = 'station';
    lot.qty -= amount; remaining -= amount; result.push(moved);
  }
  state.stocks.market = state.stocks.market.filter(lot => lot.qty > 0);
  return result;
}
function takePlayer(player: Player, itemId: InventoryLot['itemId'], qty: number, now: number): InventoryLot[] {
  const eligible = player.inventory.filter(lot => lot.itemId === itemId && !lot.bound && lot.quality >= 1 && (lot.expiresAt === null || lot.expiresAt > now));
  if (eligible.reduce((n, lot) => n + lot.qty, 0) < qty) throw new MvpError('No tienes suficientes unidades transferibles. El material del tutorial está vinculado.', 409);
  const ids = new Set(eligible.map(lot => lot.id)), holder = { ...player, inventory: structuredClone(eligible) };
  const taken = consume(holder, itemId, qty, now, { tradeableOnly: true });
  player.lotSequence = holder.lotSequence;
  player.inventory = [...player.inventory.filter(lot => !ids.has(lot.id)), ...holder.inventory];
  for (const lot of taken) lot.location = 'royal-harbor:market';
  return taken;
}
function trade(world: MvpWorld, player: Player, command: RoyalHarborTradeCommand, now: number) {
  const initializing = !world.royalHarbor;
  const state = world.royalHarbor ?? previewRoyalHarborState(world, now);
  validateState(state); settleRoyalHarborState(world, state, now); validateState(state);
  const definition = ROYAL_HARBOR_GOODS[command.good], buying = command.type === 'royal-harbor.buy', price = buying ? definition.buyPrice : definition.sellPrice, amount = price * command.qty;
  const account = world.social.accounts[player.id] ?? { credits: 0, boundCredits: 50, simUnits: 1_000 };
  if (!Number.isSafeInteger(account.credits) || account.credits < 0) throw new MvpError('El saldo del explorador requiere revisión.', 503);
  if (buying) {
    if (account.credits < amount) throw new MvpError('Necesitas créditos transferibles. El crédito de tutorial no se puede gastar aquí.', 409);
    const lots = takeMarket(state, player, definition.itemId, command.qty, now);
    account.credits -= amount; state.credits += amount; addLots(player, lots);
  } else {
    if (state.credits < amount) throw new MvpError('El presupuesto del comerciante se agotó. Sus compras no emiten nuevos créditos.', 409);
    if (state.stocks.market.filter(lot => lot.itemId === definition.itemId).reduce((n, lot) => n + lot.qty, 0) + command.qty > ROYAL_HARBOR_STOCK_LIMIT) throw new MvpError('El mercado tiene suficientes existencias de este producto por ahora.', 409);
    const lots = takePlayer(player, definition.itemId, command.qty, now);
    state.stocks.market.push(...lots); state.credits -= amount; account.credits += amount;
  }
  if (initializing) {
    // One atomic transfer from the existing shared merchant budget, never a
    // second allocation of that money or a credit minted by an animation.
    world.social.npc.remaining -= state.initializedCredits;
    world.social.ledger.push({ id: nextSocialId(world.social, 'ledger'), at: now, currency: 'credits', amount: state.initializedCredits, from: 'npc', to: 'npc:corona-del-alba', reason: 'Reserva única del mercado de Corona del Alba' });
    world.royalHarbor = state;
  }
  world.social.accounts[player.id] = account;
  world.social.ledger.push({ id: nextSocialId(world.social, 'ledger'), at: now, currency: 'credits', amount, from: buying ? player.id : 'npc:corona-del-alba', to: buying ? 'npc:corona-del-alba' : player.id, reason: `${buying ? 'Compra' : 'Venta'} portuaria: ${command.qty} ${definition.label}`, itemId: definition.itemId });
  player.stats.trades++;
  emit(world, player, now, `${buying ? 'Compró' : 'Vendió'} ${command.qty} ${definition.label.toLowerCase()} en el mercado de Corona del Alba por ${amount} créditos.`);
}

/** Strictly read-only. No auto-normalization, settlement CAS, player creation,
 * budget reservation or invisible migration happens when a city is opened. */
export async function readRoyalHarbor(store: MvpStore, ownerId: string, playerId: string | undefined, now = Date.now()): Promise<RoyalHarborSnapshot> {
  requireOwner(ownerId);
  let record = await store.read();
  if (!record) throw new MvpError('Abre primero tu partida de QFrontier.', 409);
  playerFor(record.world, ownerId, playerId);
  record=await settleDueTavernSupplies(store,record,ownerId,playerId!,now);
  const player = playerFor(record.world, ownerId, playerId);
  return royalHarborSnapshot(record.world, player, record.revision, now);
}

/** A whole-world economic CAS deliberately retains the active legacy store.
 * Goods, both balances, provenance, ledger and the idempotency receipt commit
 * together. A failed/ambiguous write is surfaced by the store; it is never
 * replayed here as an unconfirmed second transaction. */
export async function executeRoyalHarborTrade(store: MvpStore, ownerId: string, input: unknown, now = Date.now()): Promise<RoyalHarborSnapshot> {
  requireOwner(ownerId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MvpError('La operación portuaria no es válida.');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !['requestId', 'expectedRevision', 'command'].includes(key))) throw new MvpError('La operación portuaria no es válida.');
  if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new MvpError('Identificador de operación inválido.');
  const expectedRevision = integer(body.expectedRevision, 'Revisión', 0, Number.MAX_SAFE_INTEGER);
  const command = commandFor(body.command), hash = await fingerprint(command), receiptKey = `${ownerId}:${body.requestId}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const record = await store.read();
    if (!record) throw new MvpError('Abre primero tu partida de QFrontier.', 409);
    const actor = playerFor(record.world, ownerId, command.playerId);
    if (Object.hasOwn(record.world.receipts, receiptKey)) {
      if (record.world.receipts[receiptKey] !== hash) throw new MvpError('Este identificador ya se usó con otra operación.', 409);
      return royalHarborSnapshot(record.world, actor, record.revision, now);
    }
    if (record.revision !== expectedRevision) throw new MvpError('Las existencias o tu partida cambiaron. Actualiza el mercado y confirma otra vez.', 409);
    const next = structuredClone(record.world), player = playerFor(next, ownerId, command.playerId);
    trade(next, player, command, now); next.receipts[receiptKey] = hash;
    if (await store.compareAndSwap(record.revision, next, { ownerId, playerId: player.id, now })) return royalHarborSnapshot(next, player, record.revision + 1, now);
    // A CAS conflict is known to have committed no changes. On retry a receipt
    // resolves a duplicate success; a fresh operation must review the new head.
  }
  throw new MvpError('El mercado está ocupado. Actualiza y vuelve a intentarlo.', 503);
}
