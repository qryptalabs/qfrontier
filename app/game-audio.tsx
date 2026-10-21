'use client';
import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {Music2,Volume2,VolumeX,X} from 'lucide-react';
import {gameAudio} from '../lib/audio/engine';
import type {AudioSettings} from '../lib/audio/model';
import type {ActivityProgressionView} from '../lib/mvp/activity-progression';
import './game-audio.css';

export function GameAudio(){
  const audio=useSyncExternalStore(gameAudio.subscribe,gameAudio.getSnapshot,gameAudio.getServerSnapshot),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),wrapper=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>gameAudio.mount(),[]);
  useEffect(()=>{const bed=gameAudio.scene(0),update=()=>bed.update({listener:{x:0,y:0,z:0},yaw:0,aerial:true,inside:false,biome:'menu',label:'QFrontier · Frontera Cero',emitters:[]});update();const timer=setInterval(update,500);return()=>{clearInterval(timer);bed.dispose();};},[]);
  useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}},outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!wrapper.current?.contains(e.target))setOpen(false);};window.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};},[open]);
  const activate=async()=>{setBusy(true);try{await gameAudio.activate();}finally{setBusy(false);}};
  const panelId=useId(),audible=audio.ready&&audio.settings.enabled&&audio.settings.master>0;
  return <div className="q-audio" data-audio-controls data-audio-ready={audio.ready} data-audio-voices={audio.voices} ref={wrapper}>
    <button ref={trigger} className="q-audio-trigger" onClick={()=>setOpen(!open)} aria-label="Ajustes de sonido" aria-expanded={open} aria-controls={panelId}>{audible?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>{audible?'Sonido':'Activar sonido'}</span></button>
    {open&&<section id={panelId} className="q-audio-panel" role="dialog" aria-modal="false" aria-labelledby={panelId+'-title'}>
      <header><div><small>ESCUCHA LA FRONTERA</small><h2 id={panelId+'-title'}><Music2 size={19}/>Sonido del mundo</h2></div><button aria-label="Cerrar ajustes de sonido" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18}/></button></header>
      <div className="q-audio-status" role="status">{audio.ready&&audio.status==='Sonido activo'?audio.scene:audio.status}</div>
      {!audible?<button className="q-audio-enable" disabled={busy} onClick={()=>void activate()}>{busy?'Preparando sonido…':'Activar sonido'}</button>:<button className="q-audio-enable secondary" onClick={()=>gameAudio.settings({enabled:false})}><VolumeX size={15}/>Silenciar todo</button>}
      {([['master','Volumen general'],['music','Música'],['ambience','Ambiente'],['effects','Pasos y actividades'],['interface','Interfaz y avisos']]as const).map(([key,label])=><label className="q-audio-slider" key={key}><span>{label}<output>{Math.round(audio.settings[key]*100)} %</output></span><input aria-label={label} type="range" min="0" max="100" step="1" value={Math.round(audio.settings[key]*100)} onChange={e=>gameAudio.settings({[key]:Number(e.target.value)/100} as Partial<AudioSettings>)}/></label>)}
      <p>El volumen se guarda en este navegador. Los sonidos siguen las actividades cercanas y se pausan al ocultar la pestaña.</p><button className="q-audio-test" disabled={!audible} onClick={()=>gameAudio.cue('complete')}>Probar aviso</button>
      <details className="q-audio-credits"><summary>Música y efectos</summary><p>Música: «Medieval: Exploration», RandomMind. Ambiente de bosque: TinyWorlds. Olas: jasinski. Efectos: Kenney. Recursos CC0; mezcla y señales de QFrontier.</p><a href="/audio/v1/credits.txt" target="_blank" rel="noreferrer">Ver créditos y licencias</a></details>
    </section>}
  </div>;
}

/** The initial snapshot is a silent baseline. Reloading never replays old rewards. */
export function useAudioActivity(activity:ActivityProgressionView|null|undefined,paused:boolean){
  const previous=useRef<{profile:string;ids:Set<string>;level:number}|null>(null);
  useEffect(()=>{
    if(paused||!activity){previous.current=null;return;}
    const current={profile:activity.playerId,ids:new Set(activity.completions.map(c=>c.id)),level:activity.progression.level},last=previous.current;previous.current=current;
    if(!last||last.profile!==current.profile)return;
    const fresh=activity.completions.filter(c=>!last.ids.has(c.id));
    if(current.level>last.level)gameAudio.cue('level',`${current.profile}:level:${current.level}`);
    else if(fresh.length)gameAudio.cue('complete',`${current.profile}:completion:${fresh[0].id}`);
  },[activity,paused]);
}
