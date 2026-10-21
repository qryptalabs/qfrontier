/** Authored local infrastructure, shared by authoritative navigation and all three views.
 * Building a bridge adds a deck; it never flattens or removes the river bed. */
export const LAND_BRIDGE_PRESETS=Object.freeze([
 Object.freeze({id:'river-south',name:'Puente del Sendero Sur',from:Object.freeze({x:7.8,y:8.5}),to:Object.freeze({x:12.8,y:8.5}),width:1.4,walkWidth:1.12,bankHeight:2.03,archHeight:.22}),
]);
export type LandBridgePreset=typeof LAND_BRIDGE_PRESETS[number];
export interface LandBridgeStateLike {presetId:string;completedAt?:number}
export interface LandInfrastructureLike {bridges?:readonly LandBridgeStateLike[];roads?:Readonly<Record<string,{completedAt:number}>>}
export interface LandInfrastructureStateLike {land?:LandInfrastructureLike;landVisual?:LandInfrastructureLike}
export function landBridgePreset(id:string):LandBridgePreset|null{return LAND_BRIDGE_PRESETS.find(p=>p.id===id)??null;}
export function landBridgeProgressAt(preset:LandBridgePreset,x:number,y:number,padding=0):number|null {
 const dx=preset.to.x-preset.from.x,dy=preset.to.y-preset.from.y,length=Math.hypot(dx,dy),t=((x-preset.from.x)*dx+(y-preset.from.y)*dy)/(length*length),side=Math.abs((x-preset.from.x)*dy-(y-preset.from.y)*dx)/length;
 return t>=0&&t<=1&&side<=preset.walkWidth/2-padding?t:null;
}
export function landBridgeDeckHeight(preset:LandBridgePreset,t:number):number{return preset.bankHeight+Math.sin(Math.max(0,Math.min(1,t))*Math.PI)*preset.archHeight;}
/** A completion timestamp is a confirmed record, not an animation timer. */
export function landBridgeAt(state:LandInfrastructureStateLike|null|undefined,x:number,y:number):{preset:LandBridgePreset;t:number;height:number}|null {
 for(const bridge of(state?.land??state?.landVisual)?.bridges??[]){if(typeof bridge.completedAt!=='number'||!Number.isFinite(bridge.completedAt)||bridge.completedAt<0)continue;const preset=landBridgePreset(bridge.presetId);if(!preset)continue;const t=landBridgeProgressAt(preset,x,y);if(t!==null)return{preset,t,height:landBridgeDeckHeight(preset,t)};}return null;
}
