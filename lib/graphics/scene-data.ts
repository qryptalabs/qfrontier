import type { Biome, BuildingType, ItemId, Job, Terrain, Weather } from '../mvp/types.ts';
import type { MvpView, PublicPlayer } from '../mvp/view.ts';

export type SceneMode = 'world'|'station'|'settlement'|'expedition'|'showcase';
export type RenderQuality = 'auto'|'performance'|'fullhd'|'4k';
export interface SceneInput { view:MvpView; player:PublicPlayer|null; selected:string; selectedSettlementId?:string; mode:SceneMode; quality:RenderQuality; reducedMotion:boolean }
export interface RenderStats { width:number;height:number;drawCalls:number;triangles:number;fps:number }
export const TILE_SIZE=3.2;
export const BUILDING_ORDER:BuildingType[]=['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'];
export interface TileVisual {
 id:string; row:number;col:number;x:number;z:number;y:number;seed:number;
 visible:boolean;surveyed:boolean;protected:boolean;dangerous:boolean;bridge:boolean;
 biome:Biome|null;terrain:Terrain|null;deposits:ItemId[];
}
export function stableSeed(value:string):number {
 let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return hash>>>0;
}
export function tilePoint(row:number,col:number):{x:number;z:number} {return{x:(col-4)*TILE_SIZE,z:(row-4)*TILE_SIZE};}
export function tileElevation(terrain:Terrain|null,seed:number):number {
 if(!terrain||terrain==='firm')return 0;
 if(terrain==='water')return -.24;
 if(terrain==='slope')return .5;
 if(terrain==='rocky')return .2+(seed%3)*.12;
 return terrain==='sandy'?.06:-.1;
}
/** Only surveyed deposits enter the render model. Hidden sectors have no biome decorations. */
export function projectTiles(input:SceneInput):TileVisual[] {
 const discovered=new Set(input.player?.discovered??[]),surveyed=new Set(input.player?.surveyed??[]);
 return input.view.tiles.map(tile=>{
  const visible=input.mode==='showcase'?Math.abs(tile.row-4)<=1&&Math.abs(tile.col-4)<=1:discovered.has(tile.id);
  const scanned=input.mode!=='showcase'&&visible&&surveyed.has(tile.id),seed=stableSeed(tile.id);
  const terrain=visible?tile.terrain:null;
  return{id:tile.id,row:tile.row,col:tile.col,...tilePoint(tile.row,tile.col),y:tileElevation(terrain,seed),seed,visible,surveyed:scanned,protected:visible&&tile.protected,dangerous:visible&&tile.dangerous,bridge:visible&&tile.bridge,biome:visible?tile.biome:null,terrain,deposits:scanned?tile.deposits.filter(deposit=>deposit.layers.some(layer=>layer.remaining>0)).map(deposit=>deposit.itemId):[]};
 });
}
export function jobProgress(job:Pick<Job,'startsAt'|'endsAt'>,now:number):number {return Math.max(0,Math.min(1,(now-job.startsAt)/Math.max(1,job.endsAt-job.startsAt)));}
export function routePoint(route:string[],tiles:TileVisual[],progress:number):{x:number;y:number;z:number}|null {
 const points=route.map(id=>tiles.find(tile=>tile.id===id)).filter((tile):tile is TileVisual=>!!tile&&tile.visible);
 if(!points.length)return null;
 if(points.length===1)return{x:points[0].x,y:points[0].y,z:points[0].z};
 const total=(points.length-1)*Math.max(0,Math.min(1,progress)),index=Math.min(points.length-2,Math.floor(total)),phase=total-index;
 const start=points[index],end=points[index+1];return{x:start.x+(end.x-start.x)*phase,y:start.y+(end.y-start.y)*phase,z:start.z+(end.z-start.z)*phase};
}
export function activeWeather(input:SceneInput):Weather {
 if(input.mode==='showcase')return'clear';
 const tile=input.view.tiles.find(tile=>tile.id===((input.mode==='settlement'||input.mode==='station')?'t_4_4':input.player?.position??input.selected));
 return input.view.weather.find(weather=>weather.regionId===tile?.regionId)?.state??'clear';
}
export function resolutionFor(width:number,height:number,pixelRatio:number,quality:RenderQuality):{width:number;height:number;ratio:number} {
 const longEdge=Math.max(1,width,height),limit=quality==='4k'?3840:quality==='fullhd'?1920:quality==='performance'?1280:1920;
 const desired=quality==='4k'?Math.max(1,Math.min(3,pixelRatio*1.5)):quality==='performance'?1:Math.min(2,Math.max(1,pixelRatio));
 const ratio=Math.min(desired,limit/longEdge);
 return{width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio)),ratio};
}
