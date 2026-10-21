"use client";

import {useId,useMemo,useState} from 'react';
import {ArrowRight,Building2,Caravan,Check,Clock3,Compass,Footprints,Home,MapPin,Mountain,Route,Search,ShieldCheck,Ship,Square,TreePine} from 'lucide-react';
import type {ExplorationView} from '../lib/mvp/exploration-data';
import {explorationHoldAt} from '../lib/mvp/exploration-timing';
import './exploration.css';

export interface ExplorationPanelProps {
  exploration:ExplorationView;
  busy:boolean;
  clock:number;
  stationName?:string;
  onCommand(type:string,fields?:Record<string,unknown>):void;
}
const biomeLabels:Record<string,string>={forest:'Bosque templado',tropical:'Bosque tropical',plains:'Llanuras',mountain:'Cordillera',ice:'Región glacial',desert:'Desierto',coast:'Costa',ocean:'Océano'};
const number=new Intl.NumberFormat('es-CR',{maximumFractionDigits:1});
function duration(seconds:number){const remaining=Math.max(0,Math.ceil(seconds));if(remaining<60)return `${remaining} s`;if(remaining<3600)return `${Math.floor(remaining/60)} min${remaining%60?` ${remaining%60} s`:''}`;return `${Math.floor(remaining/3600)} h${Math.floor(remaining%3600/60)?` ${Math.floor(remaining%3600/60)} min`:''}`;}
const coordinates=(point:{x:number;y:number})=>`X ${number.format(point.x)} · Y ${number.format(point.y)}`;
const transportLabel=(mode:string)=>mode==='boat'?'En barco':mode==='carriage'?'En carreta':'A pie';
const TransportIcon=({mode}:{mode:string})=>mode==='boat'?<Ship size={16}/>:mode==='carriage'?<Caravan size={16}/>:<Footprints size={16}/>;

/** Renders server-approved destinations and movement; never invents a traversable route. */
export default function ExplorationPanel({exploration,busy,clock,stationName,onCommand}:ExplorationPanelProps){
  const titleId=useId(),searchId=useId(),[query,setQuery]=useState(''),[kind,setKind]=useState<'all'|'city'|'village'>('all'),[limit,setLimit]=useState(8);
  const destinations=useMemo(()=>{const match=query.trim().toLocaleLowerCase('es');return exploration.destinations.filter(place=>(kind==='all'||place.kind===kind)&&(!match||`${place.name} ${biomeLabels[place.biome]??place.biome}`.toLocaleLowerCase('es').includes(match))).slice().sort((a,b)=>Number(b.reachable)-Number(a.reachable)||a.distance-b.distance||a.name.localeCompare(b.name,'es'));},[exploration.destinations,kind,query]);
  const movement=exploration.movement,destination=exploration.destinations.find(place=>place.id===exploration.destinationId),remaining=movement&&Number.isFinite(clock)?Math.max(0,Math.ceil((movement.endsAt-clock)/1000)):exploration.remainingSeconds;
  const travelClock=Number.isFinite(clock)?clock:movement?.startsAt??0,legs=movement?.legs??[],legIndex=legs.findIndex(leg=>travelClock>=leg.startsAt&&travelClock<leg.endsAt),activeLegIndex=legIndex>=0?legIndex:travelClock<(movement?.startsAt??0)?0:Math.max(0,legs.length-1),currentLeg=legs[activeLegIndex],mode=currentLeg?.mode??'walk';
  const hold=explorationHoldAt(movement??undefined,travelClock);
  const percent=movement?Math.max(0,Math.min(100,100*((Number.isFinite(clock)?clock:movement.startsAt)-movement.startsAt)/Math.max(1,movement.endsAt-movement.startsAt))):0;
  const status=hold?'Cediendo el paso':exploration.status==='home'?'En tu aldea':exploration.status==='returning'?'Volviendo a casa':exploration.status==='traveling'?'Viaje en curso':exploration.status==='walking'?'Caminando':destination?`En ${destination.name}`:'Exploración libre';
  const heading=exploration.status==='returning'?(stationName??'Tu aldea'):destination?.name??(exploration.isOutside?'Exploración de la frontera':stationName??'Tu aldea');
  return <section className="q-exploration" aria-labelledby={titleId}>
    <header className="e-heading"><div><span className="e-eyebrow"><Compass size={14}/>Recorrer el mundo</span><h2 id={titleId}>Más allá de tu aldea</h2><p>Salí a explorar y recorré los caminos hacia otras aldeas y ciudades.</p></div><span className={`e-status ${exploration.isOutside?'outside':'home'}`}><MapPin size={14}/>{status}</span></header>
    <div className="e-current">
      <div className="e-current-place"><span className="e-current-icon">{exploration.isOutside?<Footprints size={23}/>:<Home size={23}/>}</span><div><strong>{heading}</strong><span>{movement?'Posición confirmada · ':''}{coordinates(exploration.position)}</span></div></div>
      <div className="e-actions">{!exploration.isOutside?<button type="button" className="e-button" disabled={busy||!exploration.canLeave} onClick={()=>onCommand('habitat.explore.leave')}><Footprints size={16}/>Salir de la aldea<ArrowRight size={15}/></button>:<><button type="button" className="e-button" disabled={busy||!exploration.canReturn||mode==='boat'} onClick={()=>onCommand('habitat.explore.return')}><Home size={16}/>Volver a casa</button>{exploration.canStop&&mode!=='boat'&&<button type="button" className="e-button secondary" disabled={busy} onClick={()=>onCommand('habitat.explore.stop')}><Square size={13}/>Detenerme</button>}</>}</div>
    </div>
    {exploration.blockedReason&&<p className="e-note" role="status"><ShieldCheck size={14}/>{exploration.blockedReason}</p>}
    {movement&&<div className="e-journey" aria-label="Recorrido en curso"><div><span><Route size={15}/>{exploration.status==='returning'?'Camino de regreso':destination?`Camino a ${destination.name}`:'Recorrido a pie'}</span><strong>{hold?duration((hold.endsAt-travelClock)/1000):remaining>0?duration(remaining):'Confirmando llegada…'}</strong></div><div className="e-progress" role="progressbar" aria-label="Progreso del recorrido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{width:`${percent}%`}}/></div><div className="e-transport" aria-label="Transporte actual"><span><TransportIcon mode={mode}/>{hold?'Cediendo el paso':transportLabel(mode)}</span>{legs.length>0&&<span>Tramo {Math.min(legs.length,activeLegIndex+1)} de {legs.length}</span>}</div><p>{hold?'El paso está ocupado. Tu personaje espera en una posición segura; podés detener el viaje por tierra.':'Podés mirar alrededor y cambiar de cámara mientras tu personaje sigue el recorrido.'}</p>{mode==='boat'&&<p className="e-landing"><Ship size={14}/>El barco te llevará al próximo desembarque. Allí podrás detenerte o cambiar de ruta.</p>}</div>}
    <div className="e-guidance"><TreePine size={16}/><p>{exploration.isOutside?'Usá las flechas o el joystick para explorar. Elegí un destino para seguir un camino disponible.':'Tu aldea conserva sus construcciones y tareas mientras explorás. Al salir, podés caminar y visitar los destinos disponibles.'}</p></div>
    <div className="e-directory-heading"><div><h3><Route size={16}/>Destinos</h3><p>Las rutas disponibles aparecen primero.</p></div><span>{destinations.length} {destinations.length===1?'lugar':'lugares'}</span></div>
    <div className="e-filters"><label className="e-search" htmlFor={searchId}><Search size={16}/><input id={searchId} type="search" aria-label="Buscar ciudad, aldea o bioma" value={query} onChange={event=>{setQuery(event.target.value);setLimit(8);}} placeholder="Buscar ciudad, aldea o bioma" autoComplete="off"/></label><div role="group" aria-label="Tipo de destino" className="e-filter-buttons">{([{id:'all',label:'Todos'},{id:'city',label:'Ciudades'},{id:'village',label:'Aldeas'}]as const).map(filter=><button key={filter.id} type="button" aria-pressed={kind===filter.id} onClick={()=>{setKind(filter.id);setLimit(8);}}>{filter.label}</button>)}</div></div>
    <ul className="e-destinations">{destinations.slice(0,limit).map(place=>{const selected=exploration.destinationId===place.id;return <li key={place.id} className={`e-destination${selected?' selected':''}${!place.reachable?' unavailable':''}`}><div className="e-destination-name"><span className={`e-destination-icon e-biome-${place.biome}`}>{place.kind==='city'?<Building2 size={20}/>:<Home size={19}/>}</span><div><h4>{place.name}{selected&&<Check size={13} aria-label="Destino actual"/>}</h4><p>{place.kind==='city'?'Ciudad':'Aldea'} · {biomeLabels[place.biome]??place.biome}</p></div></div><div className="e-destination-details"><span><MapPin size={12}/>{coordinates(place.position)}</span><span><Route size={12}/>{number.format(Math.round(place.distance))} unidades</span>{place.reachable&&place.seconds!==null&&<span><Clock3 size={12}/>Viaje estimado: {duration(place.seconds)}</span>}</div>{!place.reachable&&<p className="e-blocked"><Mountain size={13}/>{place.blockedReason??'Este destino todavía no tiene un camino disponible desde tu posición.'}</p>}<button type="button" className={`e-button ${selected?'secondary':''}`} disabled={busy||!exploration.isOutside||!place.reachable||!!movement} onClick={()=>onCommand('habitat.explore.travel',{destinationId:place.id})}><Footprints size={15}/>{!place.reachable?'Ruta no disponible':!exploration.isOutside?'Salí de la aldea primero':selected&&movement?'En camino':'Trazar ruta y viajar'}{place.reachable&&exploration.isOutside&&!movement&&<ArrowRight size={14}/>}</button></li>;})}</ul>
    {!destinations.length&&<p className="e-empty">No encontramos lugares con ese nombre o filtro. Probá con otra búsqueda.</p>}
    {destinations.length>limit&&<button type="button" className="e-more" onClick={()=>setLimit(value=>value+8)}>Ver {Math.min(8,destinations.length-limit)} destinos más<span>{Math.min(limit,destinations.length)} de {destinations.length}</span></button>}
    <p className="e-scope"><Compass size={14}/>Itinerarios por tierra y mar entre las ciudades y aldeas del mundo. El comercio y la construcción en los destinos se incorporarán después.</p>
  </section>;
}
