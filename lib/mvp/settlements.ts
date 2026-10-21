import { MvpError } from './helpers.ts';
import type { MvpWorld, Player, SettlementPlot, StarterProtection } from './types.ts';

export const PARCEL_WIDTH=40;
export const PARCEL_DEPTH=36;
export const PARCEL_SPACING=48;
export const WORLD_SECTOR_SPAN=192;
export const STARTER_PROTECTION_MS=72*3_600_000;

/** Coordinates are permanent station anchors. Resource travel continues to use
 * the existing 81 shared sectors; parcels never allocate or refill deposits. */
export function globalToTile(x:number,y:number):string {
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new MvpError('Coordenadas de territorio inválidas.',400);
  const col=Math.max(0,Math.min(8,Math.floor(x/WORLD_SECTOR_SPAN+.5)+4));
  const row=Math.max(0,Math.min(8,Math.floor(y/WORLD_SECTOR_SPAN+.5)+4));
  return `t_${row}_${col}`;
}
export function tileToGlobal(tileId:string):{x:number;y:number} {
  const match=/^t_([0-8])_([0-8])$/.exec(tileId);
  if(!match)throw new MvpError('El sector de territorio no existe.',400);
  return {x:(Number(match[2])-4)*WORLD_SECTOR_SPAN,y:(Number(match[1])-4)*WORLD_SECTOR_SPAN};
}
export function plotForIndex(index:number):SettlementPlot {
  if(!Number.isSafeInteger(index)||index<0||index>1_000_000_000)throw new MvpError('Índice de territorio inválido.',400);
  let x=0,y=0;
  if(index){
    const ring=Math.ceil((Math.sqrt(index+1)-1)/2),side=ring*2,distance=(side+1)**2-1-index;
    if(distance<side){x=ring-distance;y=-ring;}
    else if(distance<2*side){x=-ring;y=-ring+distance-side;}
    else if(distance<3*side){x=-ring+distance-2*side;y=ring;}
    else{x=ring;y=ring-distance+3*side;}
  }
  x*=PARCEL_SPACING;y*=PARCEL_SPACING;
  return {id:`plot_${index}`,index,x,y,width:PARCEL_WIDTH,depth:PARCEL_DEPTH,homeTileId:globalToTile(x,y)};
}
function validPlot(plot:SettlementPlot|undefined):plot is SettlementPlot {
  if(!plot||!Number.isSafeInteger(plot.index)||plot.index<0||plot.index>1_000_000_000)return false;
  const canonical=plotForIndex(plot.index);
  return Object.entries(canonical).every(([key,value])=>plot[key as keyof SettlementPlot]===value);
}
export function allocateSettlement(world:MvpWorld):SettlementPlot {
  const used=new Set(Object.values(world.players).flatMap(player=>validPlot(player.settlement)?[player.settlement.index]:[]));
  let index=0;while(used.has(index))index++;
  return plotForIndex(index);
}
/** Deterministic, idempotent migration on the engine's transaction clone. Valid
 * plots survive changes in travel, profile selection, jobs and map exploration. */
export function normalizeSettlements(world:MvpWorld):void {
  const players=Object.values(world.players).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id,'en'));
  const used=new Set<number>(),missing:Player[]=[];
  for(const player of players){if(validPlot(player.settlement)&&!used.has(player.settlement.index))used.add(player.settlement.index);else missing.push(player);}
  let index=0;
  for(const player of missing){while(used.has(index))index++;player.settlement=plotForIndex(index);used.add(index);}
}
export function starterProtection(world:MvpWorld,player:Player,now:number):StarterProtection {
  const startsAt=Math.min(...Object.values(world.players).filter(p=>p.ownerId===player.ownerId).map(p=>Number.isFinite(p.createdAt)?p.createdAt:world.createdAt));
  const endsAt=startsAt+STARTER_PROTECTION_MS;
  return {startsAt,endsAt,active:now<endsAt};
}
export function requireUnprotected(world:MvpWorld,player:Player,now:number):void {
  if(starterProtection(world,player,now).active)throw new MvpError('La protección inicial de 72 horas impide participar en PvP, tanto atacar como recibir ataques.',409);
}
export function normalizeStarterProtection(world:MvpWorld,now:number,playerId?:string):void {
  for(const player of Object.values(world.players))if((playerId===undefined||player.id===playerId)&&player.pvpEnabled&&starterProtection(world,player,now).active)player.pvpEnabled=false;
}
