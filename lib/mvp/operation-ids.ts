import type { MvpWorld } from './types.ts';
import type { SocialState } from './social.ts';
import {copyVillageEvidence} from './village-evidence.ts';

type WorldCounter = keyof MvpWorld['counters'];
interface OperationIds { namespace: string; counts: Record<string, number>; last: Record<string, string> }
const operationIds = Symbol('village-operation-ids');
type Scoped = { [operationIds]?: OperationIds };

/** Request-local, non-serialized allocator. Independent villages never reserve a
 * global sequence just to name a job, an event, a unit or a ledger entry. Existing
 * saves and the legacy transaction path retain their original identifiers. */
export function beginVillageOperation(world: MvpWorld): void {
  const scope: OperationIds = { namespace: crypto.randomUUID(), counts: {}, last: {} };
  attach(world, scope);
}
function attach(world: MvpWorld, scope: OperationIds): void {
  Object.defineProperty(world, operationIds, { value: scope, configurable: true });
  Object.defineProperty(world.social, operationIds, { value: scope, configurable: true });
}
function scopedId(target: Scoped, prefix: string): string | undefined {
  const scope = target[operationIds];
  if (!scope) return undefined;
  const count = (scope.counts[prefix] ?? 0) + 1;
  if (!Number.isSafeInteger(count)) throw new RangeError('Se agotó la secuencia de la operación.');
  scope.counts[prefix] = count;
  return scope.last[prefix] = `${prefix}_v_${scope.namespace}_${count}`;
}
export function nextWorldId(world: MvpWorld, counter: WorldCounter): string {
  const scoped = scopedId(world as Scoped, counter);
  if (scoped) return scoped;
  if (!Number.isSafeInteger(world.counters[counter]) || world.counters[counter] >= Number.MAX_SAFE_INTEGER) throw new RangeError('Se agotó la secuencia del mundo.');
  world.counters[counter]++;
  return `${counter}_${world.counters[counter]}`;
}
export function lastWorldId(world: MvpWorld, counter: WorldCounter): string {
  return (world as Scoped)[operationIds]?.last[counter] ?? `${counter}_${world.counters[counter]}`;
}
export function nextSocialId(state: SocialState, prefix: string): string {
  const scoped = scopedId(state as Scoped, prefix);
  if (scoped) return scoped;
  if (!Number.isSafeInteger(state.sequence) || state.sequence >= Number.MAX_SAFE_INTEGER) throw new RangeError('Se agotó la secuencia social.');
  state.sequence++;
  return `${prefix}_${state.sequence}`;
}
/** A manager trial may be committed back to its parent clone. It shares the
 * allocator, so even rejected trials cannot reuse an identifier later. */
export function cloneOperationWorld(world: MvpWorld): MvpWorld {
  const copy = structuredClone(world), scope = (world as Scoped)[operationIds];
  if (scope) attach(copy, scope);
  copyVillageEvidence(world,copy);
  return copy;
}
