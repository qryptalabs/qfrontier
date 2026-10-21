import {sweptObstacleHit} from './kinematic-physics.ts';
/** Local camera/input math. Positions are always supplied by the confirmed game state. */
export type DistrictCameraMode='aerial'|'first-person'|'third-person';
export interface DistrictNavigationInput {forward:number;strafe:number}
export interface DistrictPoint3 {x:number;y:number;z:number}
export interface DistrictCameraObstacle {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;rotation?:number}
export const DISTRICT_WALK_INTERVAL=550;
export const DISTRICT_EYE_HEIGHT=1.24;
const finite=(value:number)=>Number.isFinite(value)?value:0;
export function normalizeDistrictInput(input:DistrictNavigationInput):DistrictNavigationInput {
  const forward=Math.max(-1,Math.min(1,finite(input.forward))),strafe=Math.max(-1,Math.min(1,finite(input.strafe))),length=Math.max(1,Math.hypot(forward,strafe));
  return{forward:forward/length,strafe:strafe/length};
}
export function districtMovement(input:DistrictNavigationInput,yaw:number):{x:number;y:number} {
  const value=normalizeDistrictInput(input),angle=finite(yaw);
  return{x:Math.sin(angle)*value.forward+Math.cos(angle)*value.strafe,y:-Math.cos(angle)*value.forward+Math.sin(angle)*value.strafe};
}
export function districtLook(yaw:number,pitch:number,dx:number,dy:number):{yaw:number;pitch:number} {
  const angle=finite(yaw)+Math.max(-Math.PI,Math.min(Math.PI,finite(dx)));
  return{yaw:Math.atan2(Math.sin(angle),Math.cos(angle)),pitch:Math.max(-1.12,Math.min(1.12,finite(pitch)+Math.max(-1,Math.min(1,finite(dy)))))};
}
export function districtCameraFrame(foot:DistrictPoint3,yaw:number,pitch:number,mode:Exclude<DistrictCameraMode,'aerial'>){
  const eye={x:foot.x,y:foot.y+DISTRICT_EYE_HEIGHT,z:foot.z},look=districtLook(yaw,pitch,0,0),sin=Math.sin(look.yaw),cos=Math.cos(look.yaw),cp=Math.cos(look.pitch);
  const direction={x:sin*cp,y:-Math.sin(look.pitch),z:-cos*cp};
  if(mode==='first-person')return{eye,target:{x:eye.x+direction.x*10,y:eye.y+direction.y*10,z:eye.z+direction.z*10},anchor:eye};
  return{eye:{x:eye.x-direction.x*5.2+cos*.58,y:eye.y-direction.y*5.2+1.05,z:eye.z-direction.z*5.2+sin*.58},target:{x:eye.x+direction.x*2,y:eye.y+direction.y*2,z:eye.z+direction.z*2},anchor:eye};
}
/** Camera clearance is independent of walking permission and can never move the avatar. */
export function constrainDistrictCamera(anchor:DistrictPoint3,desired:DistrictPoint3,ground:(x:number,z:number)=>number,obstacles:readonly DistrictCameraObstacle[],clearance=.22):DistrictPoint3 {
  const dx=desired.x-anchor.x,dy=desired.y-anchor.y,dz=desired.z-anchor.z,distance=Math.hypot(dx,dy,dz),steps=Math.max(1,Math.ceil(distance/.1));
  let last={...anchor};
  for(let step=1;step<=steps;step++){
    const t=step/steps,point={x:anchor.x+dx*t,y:anchor.y+dy*t,z:anchor.z+dz*t};
    if(point.y<ground(point.x,point.z)+clearance||obstacles.some(b=>point.y>b.minY-clearance&&point.y<b.maxY+clearance&&sweptObstacleHit({x:point.x,y:point.z},{x:point.x,y:point.z},{id:'camera',x:(b.minX+b.maxX)/2,y:(b.minZ+b.maxZ)/2,width:b.maxX-b.minX,depth:b.maxZ-b.minZ,height:b.maxY-b.minY,rotation:b.rotation},clearance)))return last;
    last=point;
  }
  return last;
}
export function districtKeyDirection(key:string):'forward'|'backward'|'left'|'right'|null {
  return({arrowup:'forward',w:'forward',arrowdown:'backward',s:'backward',arrowleft:'left',a:'left',arrowright:'right',d:'right'}as const)[key.toLowerCase() as 'w']??null;
}
export function districtHeldInput(keys:ReadonlySet<string>,analog:DistrictNavigationInput):DistrictNavigationInput {
  const active=new Set([...keys].map(districtKeyDirection));
  return normalizeDistrictInput({forward:analog.forward+(active.has('forward')?1:0)-(active.has('backward')?1:0),strafe:analog.strafe+(active.has('right')?1:0)-(active.has('left')?1:0)});
}
export function districtStreamWindow(point:{x:number;y:number},performance=false){
  const reach=performance?68:92,minCx=Math.floor((point.x-reach)/64),maxCx=Math.floor((point.x+reach)/64),minCy=Math.floor((point.y-reach)/64),maxCy=Math.floor((point.y+reach)/64);
  return{center:{...point},radius:Math.ceil((maxCx-minCx)/2),reach:0,minCx,maxCx,minCy,maxCy,fogNear:reach*.48,fogFar:reach-8};
}
export function isDistrictEditableTarget(target:EventTarget|null):boolean {
  if(!target||typeof(target as HTMLElement).closest!=='function')return false;
  return!!(target as HTMLElement).closest('input,textarea,select,button,a,[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="dialog"]');
}
