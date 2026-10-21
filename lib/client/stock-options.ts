import type { InventoryLot, ItemId } from '../mvp/types.ts';
import { ITEMS } from '../mvp/catalog.ts';

/** Display only usable stock; the server still reserves the actual lots. */
export function usableQuantity(lots: InventoryLot[], itemId: ItemId, now: number, transferable = false): number {
  return lots.filter(lot => lot.itemId === itemId && lot.qty > 0 && lot.quality >= 1 && (!transferable || !lot.bound) && (lot.expiresAt === null || lot.expiresAt > now)).reduce((total, lot) => total + lot.qty, 0);
}

export function ownedItemOptions(lots: InventoryLot[], now: number, transferable = true) {
  return ITEMS.map(item => {
    const available = usableQuantity(lots, item.id, now, transferable);
    return {value: item.id, label: `${item.name} · ${available} ${transferable ? 'transferibles' : 'disponibles'}`, available};
  }).filter(option => option.available > 0);
}
