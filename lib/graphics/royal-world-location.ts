import {ROYAL_PORT_OFFSET} from './royal-proportions.ts';
import {WORLD_LANDMARKS} from './world-geography.ts';
/** Fixed public district; unrelated to player parcels or saved positions. */
export const ROYAL_WORLD_LOCATION = Object.freeze({
  id:'world-corona-del-alba',name:'Corona del Alba',alias:'Reino del Alba',
  kind:'city' as const,stage:'city' as const,tier:3 as const,biome:'forest' as const,
  x:-2304,y:-4608,
});
export const ROYAL_WORLD_SCALE=1;
/** Full original palace footprint in shared world metres, including its
 * terraces, perimeter crossings and supported mountain amphitheatre. */
export const ROYAL_WORLD_BOUNDS=Object.freeze({minX:-512,maxX:512,minZ:-384,maxZ:640});
// The map pin identifies the palace; the river harbor lies to its south.
export const ROYAL_WORLD_ORIGIN=Object.freeze({x:ROYAL_WORLD_LOCATION.x,y:ROYAL_WORLD_LOCATION.y+ROYAL_PORT_OFFSET});
export function royalLocalToWorld(x:number,z:number){return{x:ROYAL_WORLD_ORIGIN.x+x*ROYAL_WORLD_SCALE,y:ROYAL_WORLD_ORIGIN.y+z*ROYAL_WORLD_SCALE};}
export function royalWorldContains(x:number,y:number,padding=0){const dx=x-ROYAL_WORLD_LOCATION.x,dz=y-ROYAL_WORLD_LOCATION.y,b=ROYAL_WORLD_BOUNDS;return dx>=b.minX-padding&&dx<=b.maxX+padding&&dz>=b.minZ-padding&&dz<=b.maxZ+padding&&!WORLD_LANDMARKS.some(p=>Math.abs(x-p.x)<192&&Math.abs(y-p.y)<192);}
export function royalWorldVisible(x:number,y:number){return royalWorldEnvelope(x,y,1800);}

/** The authored palace keeps its original metres. Zoom only changes the camera,
 * never a building's scale. Street-level streaming retains its normal budget. */
export function royalViewHalfHeight(level:number){
 const t=Math.max(0,Math.min(1,(level-6.2)/3.8));
 return 320*Math.pow(8/320,t);
}
export function royalCameraDistrict(x:number,y:number){return royalWorldContains(x,y);}

export function royalWorldEnvelope(x:number,y:number,padding=0){const dx=x-ROYAL_WORLD_LOCATION.x,dz=y-ROYAL_WORLD_LOCATION.y,b=ROYAL_WORLD_BOUNDS;return dx>=b.minX-padding&&dx<=b.maxX+padding&&dz>=b.minZ-padding&&dz<=b.maxZ+padding;}
/** A continuous lens transition; nearby villages never switch to another world. */
export function royalCameraWeight(x:number,y:number){const dx=Math.max(0,Math.abs(x-ROYAL_WORLD_LOCATION.x)-320),dz=Math.max(0,Math.abs(y-ROYAL_WORLD_LOCATION.y)-320),t=Math.max(0,Math.min(1,1-Math.hypot(dx,dz)/1200));return t*t*(3-2*t);}

/** Locate a normal town at the same physical footprint despite the broad regional lens. */
export function royalContextZoom(x:number,y:number,base:number){const w=royalCameraWeight(x,y);if(!w)return base;const target=95*Math.pow(.5,(Math.max(5.6,Math.min(10,base))-6)*.74);let lo=5.6,hi=10;for(let i=0;i<24;i++){const level=(lo+hi)/2,normal=95*Math.pow(.5,(level-6)*.74),height=normal*(1-w)+royalViewHalfHeight(level)*w;if(height>target)lo=level;else hi=level;}return(lo+hi)/2;}
