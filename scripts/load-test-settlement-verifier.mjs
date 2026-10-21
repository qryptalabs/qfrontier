import assert from 'node:assert/strict';

export const SHARED_SETTLEMENT_BUDGET_ERROR='Hay reservas compartidas terminando. Actualiza en unos segundos.';

/** Verification-only lease identities. Never serialized as player-facing data. */
export function expiredSharedLeaseKeys(world,at){
  const keys=new Set();
  for(const job of Object.values(world.jobs))if(job.kind==='extract'&&['running','reserved'].includes(job.status)&&job.endsAt<=at)keys.add(`extract:${job.playerId}:${job.id}:${job.endsAt}`);
  for(const player of Object.values(world.players)){
    const district=player.habitable?.job;
    if(district?.status==='active'&&district.expiresAt<=at)keys.add(`district:${player.id}:${district.id}:${district.expiresAt}`);
    for(const trade of player.habitable?.commerce?.contracts??[]){
      const due=trade.status==='accepted'?trade.deadline:trade.status==='in_transit'?trade.caravan.delivery?.unloadsAt:undefined;
      if(due!==undefined&&due<=at)keys.add(`trade:${player.id}:${trade.id}:${due}`);
    }
  }
  return keys;
}

/** Used only after the comparable workload. Every HTTP attempt stays recorded.
 * Retry one precise budget response only when an authoritative observation
 * proves a strict reduction in expired shared leases. No clock or action API.
 */
export async function readSettlementWithProgress({actor,read,world,beforeWorld,at,budget,observations,role}){
  let previous=expiredSharedLeaseKeys(beforeWorld,at);
  for(;;){
    assert.ok(budget.used<budget.limit,'Due-owner verification exhausted its total HTTP-read budget; no work is silently truncated.');
    budget.used++;
    const result=await read(actor),entry={attempt:budget.used,role,status:result.status,reason:null,expiredSharedLeasesBefore:previous.size,expiredSharedLeasesAfter:null,strictProgress:null,retried:false};observations.push(entry);
    if(result.status!==503||result.error!==SHARED_SETTLEMENT_BUDGET_ERROR)return result;
    entry.reason='shared-settlement-budget';
    const next=expiredSharedLeaseKeys(await world(),at);
    entry.expiredSharedLeasesAfter=next.size;entry.strictProgress=next.size<previous.size&&[...next].every(key=>previous.has(key));
    if(!entry.strictProgress)return result;
    // The next iteration checks the same total budget as ordinary owner polls.
    entry.retried=budget.used<budget.limit;previous=next;
  }
}
