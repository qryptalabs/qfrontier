import { ITEM_CATALOG } from './catalog.ts';
import {nextWorldId,cloneOperationWorld} from './operation-ids.ts';
import type { Context, InventoryLot, ItemAmount, ItemId, MvpCommand, MvpWorld, Player } from './types.ts';
export class MvpError extends Error { readonly status:number; constructor(message:string,status=400){super(message);this.name='MvpError';this.status=status;} }
export function integer(value:unknown,label='Cantidad',min=1,max=999):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new MvpError(`${label}: usa un entero de ${min} a ${max}.`);return value;}
export function text(value:unknown,label:string,max=40):string {if(typeof value!=='string'||value.trim().length<2||value.trim().length>max||/[\u0000-\u001f]/.test(value))throw new MvpError(`${label} no es válido.`);return value.trim();}
export function item(value:unknown):ItemId {if(typeof value!=='string'||!Object.hasOwn(ITEM_CATALOG,value))throw new MvpError('Objeto desconocido.');return value as ItemId;}
export function actor(ctx:Context):Player {if(!ctx.actor)throw new MvpError('Crea tu estación primero.',409);return ctx.actor;}
export function field(command:MvpCommand,key:string):string {const value=command[key];if(typeof value!=='string'||value.length>160)throw new MvpError(`Falta ${key}.`);return value;}
export function available(player:Player,itemId:ItemId,now:number,tradeableOnly=false):number {return player.inventory.filter(l=>l.itemId===itemId&&(!l.expiresAt||l.expiresAt>now)&&(!tradeableOnly||!l.bound)).reduce((sum,l)=>sum+l.qty,0);}
export function nextLotId(player:Player):string {let id:string;do{player.lotSequence=(player.lotSequence??0)+1;id=`lot_${player.id}_${player.lotSequence}`;}while(player.inventory.some(l=>l.id===id)||(player.habitable?.buildings??[]).some(b=>[...(b.storage??[]),...(b.pending??[]),...(b.shipment?.cargo??[]),...(b.supply?.cargo??[]),...(b.construction?.cargo??[])].some(l=>l.id===id))||(player.habitable?.commerce?.contracts??[]).some(c=>c.cargo.some(l=>l.id===id))||(player.habitable?.daily?.journey.cargo??[]).some(l=>l.id===id)||(player.habitable?.land?.demolished??[]).some(d=>d.recoveryCargo?.some(l=>l.id===id)));return id;}
/** Split units acquire their own identity before wear, transfer or repair diverges. */
export function takeLot(player:Player,lotId:string,qty:number,now:number):InventoryLot {
 const lot=player.inventory.find(l=>l.id===lotId);if(!lot||lot.expiresAt!==null&&lot.expiresAt<=now)throw new MvpError('El lote no está disponible.',409);integer(qty,'Cantidad',1,lot.qty);
 const result=structuredClone(lot);result.qty=qty;if(qty<lot.qty){lot.originLotId??=lot.id;result.originLotId=lot.originLotId;result.id=nextLotId(player);}lot.qty-=qty;player.inventory=player.inventory.filter(l=>l.qty>0);return result;
}
export function consume(player:Player,itemId:ItemId,qty:number,now:number,options:{tradeableOnly?:boolean;boundOnly?:boolean}={}):InventoryLot[]{
 integer(qty);const lots=player.inventory.filter(l=>l.itemId===itemId&&(!l.expiresAt||l.expiresAt>now)&&(!options.tradeableOnly||!l.bound)&&(!options.boundOnly||l.bound)).sort((a,b)=>Number(b.bound)-Number(a.bound)||(a.expiresAt??Infinity)-(b.expiresAt??Infinity));
 if(lots.reduce((sum,l)=>sum+l.qty,0)<qty)throw new MvpError(`Faltan ${ITEM_CATALOG[itemId].name.toLowerCase()}${options.tradeableOnly?' transferibles':''}.`,409);
 let left=qty;const result:InventoryLot[]=[];for(const lot of lots){if(!left)break;const take=Math.min(left,lot.qty);result.push(takeLot(player,lot.id,take,now));left-=take;}return result;
}
export const reserve=consume;
export function addLots(player:Player,lots:InventoryLot[]):void {for(const incoming of lots){if(incoming.qty<=0)continue;
 const durable=!!ITEM_CATALOG[incoming.itemId].durability;
 if(durable){for(let i=0;i<incoming.qty;i++){const copy=structuredClone(incoming);copy.qty=1;if(incoming.qty>1)copy.originLotId??=incoming.id;if(i>0||player.inventory.some(l=>l.id===copy.id))copy.id=nextLotId(player);player.inventory.push(copy);}continue;}
 const existing=player.inventory.find(l=>l.id===incoming.id&&l.bound===incoming.bound&&l.wear===incoming.wear&&l.expiresAt===incoming.expiresAt&&l.quality===incoming.quality&&l.location===incoming.location&&JSON.stringify(l.provenance)===JSON.stringify(incoming.provenance));if(existing)existing.qty+=incoming.qty;else{const copy=structuredClone(incoming);if(player.inventory.some(l=>l.id===copy.id))copy.id=nextLotId(player);player.inventory.push(copy);}}}
export function give(player:Player,itemId:ItemId,qty:number,now:number,source:string,inputs:ItemAmount[]=[],bound=false):InventoryLot {
 integer(qty);const def=ITEM_CATALOG[itemId];if(def.durability&&qty>1){const first=give(player,itemId,1,now,source,inputs,bound);for(let i=1;i<qty;i++)give(player,itemId,1,now,source,inputs,bound);return first;}
 const lot:InventoryLot={id:nextLotId(player),itemId,qty,bound,quality:1,expiresAt:def.expiresInHours?now+def.expiresInHours*3600000:null,wear:def.durability??0,location:'station',provenance:{source,creatorId:player.id,seasonId:'frontier-2026-pilot',inputs:structuredClone(inputs)}};player.inventory.push(lot);return lot;
}
export function consumedInputs(lots:InventoryLot[]):ItemAmount[]{const sums=new Map<ItemId,number>();for(const lot of lots)sums.set(lot.itemId,(sums.get(lot.itemId)??0)+lot.qty);return [...sums].map(([itemId,qty])=>({itemId,qty}));}
export function spendMany(player:Player,costs:ItemAmount[],now:number):InventoryLot[]{for(const c of costs)if(available(player,c.itemId,now)<c.qty)throw new MvpError(`Faltan ${ITEM_CATALOG[c.itemId].name.toLowerCase()}.`,409);return costs.flatMap(c=>consume(player,c.itemId,c.qty,now));}
export function emit(world:MvpWorld,player:Player,now:number,message:string):void {world.events.unshift({id:nextWorldId(world,'event'),playerId:player.id,playerName:player.name,text:message,at:now});world.events=world.events.slice(0,150);}
export function milestone(player:Player,id:string,now:number):void {if(!player.milestones.includes(id))player.milestones.push(id);const day=new Date(now).toISOString().slice(0,10);if(!player.activityDays.includes(day))player.activityDays.push(day);}
export function seeded(seed:string):number {let n=2166136261;for(let i=0;i<seed.length;i++)n=Math.imul(n^seed.charCodeAt(i),16777619);return(n>>>0)/4294967296;}
export function cloneWorld(world:MvpWorld):MvpWorld{return cloneOperationWorld(world);}

