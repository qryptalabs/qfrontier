export type AudioChannel='music'|'ambience'|'effects'|'interface';
export interface AudioSettings {enabled:boolean;master:number;music:number;ambience:number;effects:number;interface:number}
export const AUDIO_STORAGE_KEY='qfrontier.audio.v1';
export const DEFAULT_AUDIO:Readonly<AudioSettings>=Object.freeze({enabled:true,master:.65,music:.24,ambience:.55,effects:.65,interface:.45});
export function audioSettings(raw:unknown):AudioSettings{
  const v=raw&&typeof raw==='object'?raw as Partial<AudioSettings>:{};
  const out={...DEFAULT_AUDIO};
  for(const k of ['master','music','ambience','effects','interface'] as const)if(typeof v[k]==='number'&&Number.isFinite(v[k]))out[k]=Math.max(0,Math.min(1,v[k]!));
  if(typeof v.enabled==='boolean')out.enabled=v.enabled;
  return out;
}
export type AudioPoint={x:number;y:number;z:number};
export type FootSurface='grass'|'stone'|'wood'|'snow'|'carpet';
export type SoundKind='axe'|'hammer'|'harvest'|'crate'|'saw'|'creak'|'hooves'|'splash'|'worker-step'|'dock-step';
export interface SoundEmitter extends AudioPoint {id:string;kind:SoundKind;volume?:number;radius?:number;inside?:boolean}
export interface SoundFrame {listener:AudioPoint;yaw:number;aerial:boolean;inside:boolean;biome:string;water?:number;label:string;foot?:AudioPoint&{surface:FootSurface;mode?:'walk'|'cart'|'boat'};emitters:readonly SoundEmitter[]}
export function spatialMix(frame:Pick<SoundFrame,'listener'|'yaw'|'aerial'|'inside'>,source:SoundEmitter){
  const dx=source.x-frame.listener.x,dz=source.z-frame.listener.z,dy=(source.y-frame.listener.y)*.6;
  const radius=Math.max(1,source.radius??25),distance=Math.hypot(dx,dy,dz),falloff=Math.max(0,1-distance/radius);
  const occlusion=frame.inside!==!!source.inside? .18:1;
  return {gain:falloff*falloff*(source.volume??.65)*(frame.aerial?.45:1)*occlusion,pan:Math.max(-.9,Math.min(.9,(dx*Math.cos(frame.yaw)-dz*Math.sin(frame.yaw))/Math.max(2,distance)))};
}
export function audibleEmitters(frame:SoundFrame,budget=8){return frame.emitters.map(source=>({source,...spatialMix(frame,source)})).filter(v=>v.gain>.008).sort((a,b)=>b.gain-a.gain||a.source.id.localeCompare(b.source.id)).slice(0,budget);}
/** Distance, not key presses or network requests, drives one step at a time. */
export function advanceFootstep(previous:{point:AudioPoint;at:number;distance:number}|null,foot:SoundFrame['foot'],at:number){
  if(!foot)return{state:null,play:false};
  const moved=previous?Math.hypot(foot.x-previous.point.x,foot.z-previous.point.z):0;
  const reset=!previous||at-previous.at>700||moved>3||at<=previous.at;
  const distance=reset?0:previous.distance+moved,stride=foot.mode==='cart'?1.1:foot.mode==='boat'?2:.75;
  return {state:{point:{x:foot.x,y:foot.y,z:foot.z},at,distance:distance>=stride?distance%stride:distance},play:!reset&&moved>.008&&distance>=stride};
}
