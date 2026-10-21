import {ROYAL_HARBOR_STOCK_LIMIT,type RoyalHarborGood,type RoyalHarborSnapshot} from '../mvp/royal-harbor.ts';

export type RoyalPendingTrade={requestId:string;expectedRevision:number;command:{type:'royal-harbor.buy'|'royal-harbor.sell';playerId:string;good:RoyalHarborGood;qty:number}};
export function royalSnapshotIsNewer(current:RoyalHarborSnapshot|null,next:RoyalHarborSnapshot){return !current||next.revision>current.revision||next.revision===current.revision&&next.now>=current.now;}
export function canRoyalTrade(snapshot:RoyalHarborSnapshot,good:RoyalHarborGood,side:'buy'|'sell',qty:number){
 const item=snapshot.goods.find(g=>g.id===good);if(!snapshot.available||!item||!Number.isInteger(qty)||qty<1||qty>20)return false;
 return side==='buy'?item.canBuy&&item.stock>=qty&&snapshot.account.credits>=item.buyPrice*qty:item.canSell&&item.playerTransferable>=qty&&snapshot.merchantCredits>=item.sellPrice*qty&&item.stock+qty<=ROYAL_HARBOR_STOCK_LIMIT;
}
/** An uncertain operation owns its request identity until a definitive response.
 * A second click cannot allocate a new identity even after a newer GET arrives. */
export function newRoyalTrade(snapshot:RoyalHarborSnapshot,playerId:string,good:RoyalHarborGood,side:'buy'|'sell',qty:number,pending:RoyalPendingTrade|null,newId=()=>crypto.randomUUID()):RoyalPendingTrade|null{
 if(pending||!canRoyalTrade(snapshot,good,side,qty))return null;
 return{requestId:newId(),expectedRevision:snapshot.revision,command:{type:side==='buy'?'royal-harbor.buy':'royal-harbor.sell',playerId,good,qty}};
}
