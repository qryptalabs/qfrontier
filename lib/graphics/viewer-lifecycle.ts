import type {RenderQuality,SceneMode} from './scene-data.ts';

export interface GraphicsDeviceHints {coarsePointer?:boolean;width?:number;memory?:number;cores?:number;saveData?:boolean}
export function effectiveGraphicsQuality(requested:RenderQuality,hints:GraphicsDeviceHints):RenderQuality{
  if(requested!=='auto')return requested;
  return hints.saveData||hints.coarsePointer&&(hints.width??Infinity)<=1024||(hints.memory??Infinity)<=4||(hints.cores??Infinity)<=4?'performance':'auto';
}
export function viewerNeedsConsent(mode:SceneMode,compact:boolean,activation?:'auto'|'manual'){return activation?activation==='manual':compact||mode==='showcase'||mode==='expedition';}
export function graphicsDeviceHints():GraphicsDeviceHints{if(typeof window==='undefined')return{};const device=navigator as Navigator&{deviceMemory?:number;connection?:{saveData?:boolean}};return{coarsePointer:window.matchMedia?.('(pointer: coarse)').matches,width:window.innerWidth,memory:device.deviceMemory,cores:device.hardwareConcurrency,saveData:device.connection?.saveData};}

interface VisibilitySource {readonly hidden:boolean;addEventListener(type:'visibilitychange',listener:()=>void):void;removeEventListener(type:'visibilitychange',listener:()=>void):void}
interface FrameEnvironment {request(callback:FrameRequestCallback):number;cancel(id:number):void;visibility:VisibilitySource}
/** No pending animation callbacks remain while a viewer or browser tab is hidden. */
export function createViewerFrameLoop(draw:(now:number)=>void,environment?:FrameEnvironment){
  const env=environment??{request:(callback:FrameRequestCallback)=>requestAnimationFrame(callback),cancel:(id:number)=>cancelAnimationFrame(id),visibility:document};let enabled=true,disposed=false,frame:number|null=null;
  const running=()=>enabled&&!disposed&&!env.visibility.hidden;
  function schedule(){if(running()&&frame===null)frame=env.request(tick);}
  function tick(now:number){frame=null;if(!running())return;draw(now);schedule();}
  function cancel(){if(frame!==null){env.cancel(frame);frame=null;}}
  function visibility(){if(running())schedule();else cancel();}
  env.visibility.addEventListener('visibilitychange',visibility);schedule();
  return{setActive(active:boolean){if(disposed)return;enabled=active;visibility();},dispose(){if(disposed)return;disposed=true;cancel();env.visibility.removeEventListener('visibilitychange',visibility);}};
}

export interface ViewerVisibility {entered:boolean;visible:boolean}
interface ObserverEntry {isIntersecting:boolean;intersectionRatio:number}
interface VisibilityEnvironment {visibility:VisibilitySource;observe?:(element:HTMLElement,callback:(entry:ObserverEntry)=>void)=>()=>void;listenFallback?:(callback:()=>void)=>()=>void;width:()=>number;height:()=>number}
/** The first viewport entry permits lazy loading; subsequent exits only pause it. */
export function observeViewerVisibility(element:HTMLElement,notify:(state:ViewerVisibility)=>void,environment?:VisibilityEnvironment){
  const env=environment??{visibility:document,width:()=>window.innerWidth,height:()=>window.innerHeight,observe:typeof IntersectionObserver==='undefined'?undefined:(target:HTMLElement,callback:(entry:ObserverEntry)=>void)=>{const observer=new IntersectionObserver(entries=>{const entry=entries.at(-1);if(entry)callback(entry);},{threshold:[0,.001]});observer.observe(target);return()=>observer.disconnect();},listenFallback:(callback:()=>void)=>{window.addEventListener('scroll',callback,{passive:true});window.addEventListener('resize',callback);return()=>{window.removeEventListener('scroll',callback);window.removeEventListener('resize',callback);};}};
  let entered=false,intersects=false,disposed=false,last='';
  function report(){if(disposed)return;const visible=intersects&&!env.visibility.hidden;entered||=visible;const key=`${entered}:${visible}`;if(key!==last){last=key;notify({entered,visible});}}
  function fallback(){const r=element.getBoundingClientRect();intersects=r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<env.height()&&r.left<env.width();report();}
  const stop=env.observe?env.observe(element,entry=>{intersects=entry.isIntersecting&&entry.intersectionRatio>0;report();}):env.listenFallback?.(fallback);
  env.visibility.addEventListener('visibilitychange',report);if(!env.observe)fallback();else report();
  return()=>{disposed=true;stop?.();env.visibility.removeEventListener('visibilitychange',report);};
}
