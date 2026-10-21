'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Bell,Check,CheckCheck,Sparkles,X} from 'lucide-react';
import type {ActivityCompletion,ActivityProgressionView} from '../lib/mvp/activity-progression';
import type {ActivityNotificationSnapshot,ActivityNotificationStore} from '../lib/client/activity-notifications';
import {useGameTimestamp} from './local-time';

const amount=(n:number)=>n.toLocaleString('es-CR');
export function ExperienceBar({activity,onOpenUnlocks}:{activity:ActivityProgressionView;onOpenUnlocks?:()=>void}){
  const p=activity.progression;
  return <section className="m-xp" aria-label="Experiencia del explorador">
    <div className="m-xp-summary"><span className="m-xp-level"><Sparkles size={16}/>Nivel {p.level}</span><div className="m-xp-meter"><div className="m-xp-label"><strong>{amount(p.xp)} XP</strong><span>{amount(p.xpToNextLevel)} para nivel {p.level+1}</span></div><div className="m-xp-track" role="progressbar" aria-label={`Progreso al nivel ${p.level+1}`} aria-valuemin={0} aria-valuemax={p.nextLevelXp-p.levelStartXp} aria-valuenow={p.intoLevelXp} aria-valuetext={`${amount(p.xp)} XP acumulada; faltan ${amount(p.xpToNextLevel)} para el nivel ${p.level+1}`}><span style={{width:`${p.progressPercent}%`}}/></div></div><details className="m-xp-help"><summary>Cómo ganar XP</summary><div><strong>Tu experiencia cuenta tu historia</strong><p>Prospección: 20 XP · Extracción: 3 por unidad · Fabricación: 10 por lote · Cosecha: 15 · Obra nueva: 30 · Mejora: 40 · Expedición: 25 · Convoy: 15.</p><p>Visitar un destino nuevo: 5 XP. Primera venta pagada a una ciudad y primer intercambio con cada cuenta distinta: 20 XP. Volver a visitar, mover recursos o comerciar con tu propia cuenta no suma otra vez.</p><p>Los puntos son XP acumulada: no se gastan ni son créditos. Se reconocen las actividades anteriores registradas por el servidor. {amount(p.activityCount)} actividades con experiencia.</p></div></details></div>
    <button className="m-xp-unlocks" disabled={!onOpenUnlocks} onClick={onOpenUnlocks}><Sparkles size={13}/>Ver desbloqueos</button>
  </section>;
}

export function ActivityBell({activity,snapshot,store,open,setOpen,disabled,onSelect}:{activity:ActivityProgressionView;snapshot:ActivityNotificationSnapshot;store:ActivityNotificationStore;open:boolean;setOpen:(value:boolean)=>void;disabled:boolean;onSelect:(item:ActivityCompletion)=>void}){
  const wrapper=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),timestamp=useGameTimestamp();
  const [all,setAll]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!wrapper.current?.contains(e.target))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape);};
  },[open,setOpen]);
  const unread=new Set(snapshot.unread.map(item=>item.id)),items=all?activity.completions:snapshot.unread;
  return <div className="m-notification-hub" ref={wrapper}>
    <button ref={trigger} className="m-notification-trigger" aria-label={`Notificaciones${snapshot.unreadCount?`: ${snapshot.unreadCount} sin leer`:''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="m-notification-inbox" disabled={disabled} onClick={()=>setOpen(!open)}><Bell size={20}/>{snapshot.unreadCount>0&&<span className="m-notification-count" aria-hidden="true">{snapshot.unreadCount>99?'99+':snapshot.unreadCount}</span>}</button>
    {open&&<section className="m-notification-inbox" id="m-notification-inbox" role="dialog" aria-modal="false" aria-labelledby="m-notification-title">
      <div className="m-notification-heading"><div><span className="m-eyebrow">TU ACTIVIDAD</span><h2 id="m-notification-title">Notificaciones</h2></div><button aria-label="Cerrar notificaciones" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18}/></button></div>
      <div className="m-notification-tools"><div role="group" aria-label="Filtrar notificaciones"><button aria-pressed={!all} onClick={()=>setAll(false)}>Sin leer ({snapshot.unreadCount})</button><button aria-pressed={all} onClick={()=>setAll(true)}>Historial</button></div><button disabled={!snapshot.unreadCount} onClick={()=>store.markAllRead()} title="Marcar todas como leídas"><CheckCheck size={15}/><span>Leer todas</span></button></div>
      <div className="m-notification-list">{items.length?items.map(item=><article key={item.id} className={unread.has(item.id)?'unread':''}><button className="m-notification-item" onClick={()=>onSelect(item)}><span className="m-notification-symbol">{unread.has(item.id)?<Bell size={15}/>:<Check size={15}/>}</span><span><strong>{item.title}</strong><span className="m-notification-result">{item.result}</span><span className="m-notification-meta"><time dateTime={new Date(item.completedAt).toISOString()}>{timestamp(item.completedAt)}</time>{item.xp>0&&<b>+{amount(item.xp)} XP</b>}</span><span className="m-notification-link">Ver actividad <ArrowRight size={12}/></span></span></button>{unread.has(item.id)&&<button className="m-notification-read" aria-label={`Marcar como leída: ${item.title}`} onClick={()=>store.markRead([item.id])}><Check size={15}/></button>}</article>):<div className="m-notification-empty"><CheckCheck size={28}/><strong>Todo al día</strong><p>{all?'Las actividades que completes aparecerán aquí.':'No tenés avisos sin leer. Podés consultar el historial.'}</p></div>}</div>
      <p className="m-notification-footnote">Últimas {activity.completions.length} actividades de este explorador. La lectura se guarda en este navegador; los resultados y la XP, en tu partida.</p>
    </section>}
  </div>;
}

export function ActivityAlerts({items,onOpen,onDismiss}:{items:readonly ActivityCompletion[];onOpen:()=>void;onDismiss:()=>void}){
  const xp=items.reduce((sum,item)=>sum+item.xp,0);
  return <div className="m-completion-toast" role="status" aria-live="polite"><span className="m-completion-icon"><CheckCheck size={22}/></span><div><strong>{items.length===1?items[0].title:`${items.length} actividades completadas`}</strong><p>{items.length===1?items[0].result:'Tu actividad ya tiene nuevos resultados. Consultá los avisos para ver cada entrega.'}</p><button onClick={onOpen}>Ver notificaciones <ArrowRight size={13}/></button></div>{xp>0&&<b>+{amount(xp)} XP</b>}<button className="m-completion-dismiss" aria-label="Cerrar aviso de actividades" onClick={onDismiss}><X size={17}/></button></div>;
}
