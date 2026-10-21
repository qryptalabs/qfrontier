'use client';
import {useEffect,useRef,type CSSProperties} from 'react';
import {ArrowRight,Check,Flag,FlaskConical,Hammer,LockKeyhole,Sparkles,Trophy,X} from 'lucide-react';
import {ITEM_CATALOG} from '../lib/mvp/catalog';
import {HABITABLE_BUILDING_TEMPLATES} from '../lib/mvp/habitable-data';
import type {LevelUnlockView} from '../lib/mvp/level-unlocks';
import type {GameNavigation} from '../lib/client/navigation';
import type {TestBoostView} from '../lib/mvp/test-boosts';

const amount=(n:number)=>n.toLocaleString('es-CR');
const buildingName=(id:string)=>HABITABLE_BUILDING_TEMPLATES.find(item=>item.id===id)?.label??id;

function useProgressionFocus(onClose:()=>void){
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();onClose();return;}
      if(e.key!=='Tab')return;
      const buttons=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],summary,[tabindex="0"]');
      if(!buttons?.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',keyboard);return()=>{window.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
  },[onClose]);
  return panel;
}

export function LevelUnlockDialog({unlocks,boosts,onClose,onNavigate}:{unlocks:LevelUnlockView;boosts?:TestBoostView;onClose:()=>void;onNavigate:(route:GameNavigation)=>void}){
  const panel=useProgressionFocus(onClose);
  const go=(tab:'station'|'roam')=>{onClose();onNavigate({tab,section:tab==='station'?'craft':'build',profileId:unlocks.playerId});};
  return <div className="m-level-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} className="m-level-dialog" role="dialog" aria-modal="true" aria-labelledby="m-level-title">
    <header><div><span className="m-eyebrow">TU CAMINO EN LA FRONTERA</span><h2 id="m-level-title">Cada nivel abre posibilidades</h2><p>Explorador nivel {unlocks.level} · Todo este contenido se consigue jugando.</p></div><button aria-label="Cerrar desbloqueos" onClick={onClose}><X size={20}/></button></header>
    <div className="m-level-roadmap">{boosts?.passes&&<section className="m-level-pass-info" aria-label="Pases por progreso"><strong><FlaskConical size={16}/>Potenciadores que se ganan jugando</strong><p>Cada nuevo nivel máximo de tu cuenta, desde el nivel 2, concede dos pases. Alcanzar un nivel ya logrado con otro explorador no repite el premio.</p><p>Máximo de cuenta: nivel {boosts.passes.highestAccountLevel} · {boosts.passes.available} pases disponibles. Usarlos mantiene el máximo del 20 % y 30 minutos de ahorro en las últimas 24 horas.</p></section>}{unlocks.milestones.map(m=>{
      const unlocked=unlocks.level>=m.level;
      return <section className={`m-level-milestone ${unlocked?'unlocked':''}`} key={m.level} aria-label={`Desbloqueos del nivel ${m.level}`}><div className="m-level-step"><span>{unlocked?<Check size={19}/>:<LockKeyhole size={17}/>}</span><div><h3>Nivel {m.level}</h3><small>{amount(m.xp)} XP acumulada</small></div><b>{unlocked?'Alcanzado':'Por descubrir'}</b></div>
        <div className="m-level-rewards">{m.recipes.length>0&&<div><h4><Hammer size={14}/>Recetas</h4>{m.recipes.map(id=>{const row=unlocks.recipes.find(r=>r.id===id);return <span key={id} className={row?.unlocked?'available':''}>{ITEM_CATALOG[id].name}{row?.legacy&&<small>Conocimiento conservado</small>}</span>;})}</div>}{m.buildings.length>0&&<div><h4><Flag size={14}/>Planos de construcción</h4>{m.buildings.map(id=>{const row=unlocks.buildings.find(r=>r.id===id);return <span key={id} className={row?.unlocked?'available':''}>{buildingName(id)}{row?.legacy&&<small>Plano conservado</small>}</span>;})}</div>}</div>
      </section>;
    })}</div>
    <footer><p>El nivel del explorador habilita el conocimiento. Cada receta y obra conserva sus requisitos de materiales, edificio y trabajo. Tus conocimientos y construcciones anteriores se respetan.</p><div><button className="m-button secondary" onClick={()=>go('roam')}><Flag size={14}/>Ver planos</button><button className="m-button" onClick={()=>go('station')}><Hammer size={14}/>Ver recetas<ArrowRight size={14}/></button></div></footer>
  </section></div>;
}

export function LevelCelebration({fromLevel,toLevel,unlocks,boosts,onClose,onInspect}:{fromLevel:number;toLevel:number;unlocks:LevelUnlockView;boosts?:TestBoostView;onClose:()=>void;onInspect:()=>void}){
  const gained=unlocks.milestones.filter(m=>m.level>fromLevel&&m.level<=toLevel),recipes=gained.flatMap(m=>m.recipes).filter(id=>!unlocks.recipes.find(r=>r.id===id)?.legacy),buildings=gained.flatMap(m=>m.buildings).filter(id=>!unlocks.buildings.find(r=>r.id===id)?.legacy);
  const earnedPasses=boosts?.passes?.history.filter(reward=>reward.kind==='level'&&reward.playerId===unlocks.playerId&&typeof reward.level==='number'&&reward.level>fromLevel&&reward.level<=toLevel).reduce((sum,reward)=>sum+reward.charges,0)??0;
  return <aside className="m-level-celebration" aria-label={`Alcanzaste el nivel ${toLevel}`} role="status" aria-live="polite"><div className="m-level-sparks" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--spark':i}as CSSProperties}/>)}</div><button className="m-level-celebration-close" aria-label="Cerrar aviso de nuevo nivel" onClick={onClose}><X size={18}/></button><div className="m-level-medal" aria-hidden="true"><Trophy size={28}/><span>{toLevel}</span></div><span className="m-eyebrow">TU ESFUERZO DEJA HUELLA</span><h2>¡Nivel {toLevel} alcanzado!</h2><p>{toLevel-fromLevel>1?`Avanzaste ${toLevel-fromLevel} niveles. `:''}{recipes.length||buildings.length?'Nuevas posibilidades para tu personaje.':'Tu experiencia sigue creciendo en la frontera.'}</p><div className="m-level-prizes">{recipes.length>0&&<span><Hammer size={15}/>{recipes.length} {recipes.length===1?'receta nueva':'recetas nuevas'}</span>}{buildings.length>0&&<span><Flag size={15}/>{buildings.length} {buildings.length===1?'plano nuevo':'planos nuevos'}</span>}{earnedPasses>0&&<span><FlaskConical size={15}/>+{earnedPasses} {earnedPasses===1?'pase':'pases'} de potenciador</span>}</div>{earnedPasses>0&&<p>Premio del nuevo máximo de cuenta, ya disponible y compartido entre tus exploradores.</p>}{buildings.length>0&&<p className="m-level-preview">{buildings.map(buildingName).join(' · ')}</p>}<button className="m-button" onClick={onInspect}><Sparkles size={15}/>Ver desbloqueos<ArrowRight size={14}/></button></aside>;
}
