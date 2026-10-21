import {islandContains,settlementHeightAt} from './settlement-layout.ts';
import {sampleWorld,WORLD_LANDMARKS} from './world-geography.ts';
import {clampWorldPoint} from './world-navigation.ts';
import {livingTerrainHeight,isLivingSettlement} from './living-zone-data.ts';
import {inhabitedTerrainHeight,isInhabitedSettlement} from './inhabited-world-data.ts';
import {fishingNetworkTerrainHeight} from './fishing-network-data.ts';
import {landCellPrepared,landNaturalWater,landTerrainHeight,type LandTerrainStateLike} from './land-terrain.ts';
import {landBridgeAt} from './land-infrastructure.ts';
export type OwnPatch={x:number;y:number}&LandTerrainStateLike;
export type TerrainPlateau={x:number;y:number;height:number;radius:number}&LandTerrainStateLike;
const sampleTerrain=(x:number,y:number)=>{const p=clampWorldPoint(x,y);return sampleWorld(p.x,p.y);};
const TOWN_PLATEAUS:readonly TerrainPlateau[]=WORLD_LANDMARKS.filter(p=>(p.kind==='village'||p.kind==='city')&&!isLivingSettlement(p.id)&&!isInhabitedSettlement(p.id)).map(p=>({x:p.x,y:p.y,height:sampleTerrain(p.x,p.y).height,radius:p.kind==='city'?28:18}));
function flattenAt(x:number,y:number,height:number,plateaus:readonly TerrainPlateau[]){for(const p of plateaus){const outside=Math.max(Math.abs(x-p.x),Math.abs(y-p.y))-p.radius;if(outside>=8)continue;const n=Math.max(0,Math.min(1,Math.max(0,outside)/8)),t=1-n*n*(3-2*n);height=(1-t)*height+t*p.height;}return height;}
export function waterfallPool(x:number,y:number,own?:OwnPatch){return !!own&&y-own.y>12&&Math.pow((x-own.x-9.2)/5.8,2)+Math.pow((y-own.y-16.7)/8.2,2)<1;}
/** Shared authoritative and rendered ground sampling; no WebGL dependency. */
export function continuousTerrainHeight(x:number,y:number,own?:OwnPatch,plateaus:readonly TerrainPlateau[]=[],includeDeck=true):number {
 const sample=sampleTerrain(x,y),height=flattenAt(x,y,fishingNetworkTerrainHeight(x,y,inhabitedTerrainHeight(x,y,livingTerrainHeight(x,y,flattenAt(x,y,sample.height,TOWN_PLATEAUS)),sample),sample),plateaus);
 for(const p of plateaus)if(includeDeck&&landBridgeAt(p,x-p.x,y-p.y)||landCellPrepared(p,x-p.x,y-p.y)&&!landNaturalWater(x-p.x,y-p.y))return landTerrainHeight(p,x-p.x,y-p.y,height-p.height+2,includeDeck)+p.height-2;
 if(!own)return Math.round(height*2)/2;const dx=x-own.x,dy=y-own.y;
 if(waterfallPool(x,y,own))return sampleTerrain(own.x,own.y).height-3.85;
 if(Math.abs(dx)<=16&&Math.abs(dy)<=13&&islandContains(dx,dy))return landTerrainHeight(own,dx,dy,settlementHeightAt(dx,dy),includeDeck)+sampleTerrain(own.x,own.y).height-2;
 if(landCellPrepared(own,dx,dy)&&!landNaturalWater(dx,dy)){const base=sampleTerrain(own.x,own.y).height;return landTerrainHeight(own,dx,dy,height-base+2,includeDeck)+base-2;}
 return Math.round(height*2)/2;
}
