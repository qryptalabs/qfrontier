/** Cooperative CPU geometry/texture construction; the renderer is created only after completion. */
export interface GraphicsBuildEnvironment {now():number;schedule(callback:(remaining:()=>number)=>void):()=>void}
export interface GraphicsBuildOptions {signal?:AbortSignal;environment?:GraphicsBuildEnvironment;budgetMilliseconds?:number}
const aborted=()=>new DOMException('La preparación de la vista se canceló.','AbortError');
function scheduleBuild(callback:(remaining:()=>number)=>void):()=>void {
  let cancelled=false,cancelPending:(()=>void)|undefined;
  const visible=()=>{if(cancelled)return;if(typeof document!=='undefined'&&document.hidden)return;
    if(typeof requestIdleCallback==='function'){const id=requestIdleCallback(deadline=>{cancelPending=undefined;if(!cancelled){if(typeof document!=='undefined'&&document.hidden)return;callback(()=>deadline.timeRemaining());}},{timeout:100});cancelPending=()=>cancelIdleCallback(id);}
    else{const id=setTimeout(()=>{cancelPending=undefined;if(!cancelled&&!(typeof document!=='undefined'&&document.hidden))callback(()=>4);},0);cancelPending=()=>clearTimeout(id);}
  };
  const changed=()=>{cancelPending?.();cancelPending=undefined;visible();};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',changed);visible();
  return()=>{cancelled=true;cancelPending?.();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',changed);};
}
export function finishGraphicsBuild<T>(steps:Generator<void,T,unknown>):T{let next=steps.next();while(!next.done)next=steps.next();return next.value;}
export function runGraphicsBuild<T>(steps:Generator<void,T,unknown>,options:GraphicsBuildOptions={}):Promise<T>{
  const environment=options.environment??{now:()=>performance.now(),schedule:scheduleBuild},budget=Math.max(1,Math.min(8,options.budgetMilliseconds??4));
  return new Promise<T>((resolve,reject)=>{
    let stopped=false,cancel:(()=>void)|undefined;
    const cleanup=()=>{stopped=true;cancel?.();options.signal?.removeEventListener('abort',abort);};
    const abort=()=>{if(stopped)return;cleanup();try{steps.return(undefined as T);}finally{reject(aborted());}};
    function slice(remaining:()=>number){if(stopped)return;cancel?.();cancel=undefined;const start=environment.now();
      try{let count=0;do{if(options.signal?.aborted){abort();return;}const next=steps.next();if(next.done){cleanup();resolve(next.value);return;}count++;}while(count<32&&environment.now()-start<budget&&remaining()>1);cancel=environment.schedule(slice);}
      catch(error){cleanup();try{steps.return(undefined as T);}finally{reject(error);}}
    }
    if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});cancel=environment.schedule(slice);
  });
}

/** Per-chunk lattice cache: shared top/side heights are evaluated once, never retained across worlds. */
export function createTerrainHeightCache(size:number,step:number,sample:(x:number,z:number)=>number){
  const stride=size/step+2,values=new Float64Array(stride*stride);values.fill(NaN);
  return(x:number,z:number)=>{const ix=x/step+1,iz=z/step+1;if(!Number.isInteger(ix)||!Number.isInteger(iz)||ix<0||iz<0||ix>=stride||iz>=stride)return sample(x,z);const key=ix*stride+iz;let value=values[key];if(Number.isNaN(value)){value=sample(x,z);values[key]=value;}return value;};
}
