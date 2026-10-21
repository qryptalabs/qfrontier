'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {MvpView} from '../../../lib/mvp/view';
import type {MvpWorld,Player} from '../../../lib/mvp/types';
import type {SceneInput} from '../../../lib/graphics/scene-data';
import type {HabitablePoint,HabitableState} from '../../../lib/mvp/habitable-data';
import type {ExplorationTransport,ExplorationMovement} from '../../../lib/mvp/exploration-data';
import type {DistrictManualNavigationIntent} from '../../../lib/client/district-controls';
import {EXPLORATION_NETWORK} from '../../../lib/mvp/exploration-network-data';
import {physicalLineClear,physicalObstaclesNear,physicalTerrainSample} from '../../../lib/graphics/world-collision';
import {explorationPositionAt,explorationHoldAt,explorationTransportAt} from '../../../lib/mvp/exploration-data';
import {dispatchManualNavigation} from '../../../lib/mvp/manual-navigation';
import {reserveTrafficMovement,settleExplorationTraffic} from '../../../lib/mvp/exploration-traffic';
import {settleExploration} from '../../../lib/mvp/exploration';
import {createPlayer} from '../../../lib/mvp/world';
import HabitableScene from '../../graphics/habitable-scene';

export type TravelLabPreset='city'|'fence'|'boat'|'carriage'|'traffic';
type Scenario={state:HabitableState;mode?:ExplorationTransport;crossing?:HabitablePoint;label:string};
export interface TravelLabMemory {world:MvpWorld;playerId:string;scenario:Scenario;manualCommands:number}
const HOME={x:0,y:1.5};
const baseState=():HabitableState=>({version:1,appearance:'pine',profession:'carrier',position:{...HOME},buildings:[]});
function makeScenario(preset:TravelLabPreset,now:number):Scenario{
  const base=baseState(),point={x:-408,y:-312};let crossing:HabitablePoint|undefined,movement:ExplorationMovement|undefined,mode:ExplorationTransport|undefined,label='Calles de Costa Ámbar';
  if(preset==='fence'){
    const fence=physicalObstaclesNear({x:-216,y:168},42).find(p=>p.kind==='fence');
    if(fence){const angle=fence.rotation??0,n={x:Math.cos(angle),y:-Math.sin(angle)},offset=fence.width/2+1;point.x=fence.x+n.x*offset;point.y=fence.y+n.y*offset;crossing={x:fence.x-n.x*offset,y:fence.y-n.y*offset};}
    label='Cerca real de Las Brumas';
  }
  if(preset==='boat'||preset==='carriage'){
    mode=preset;const edge=EXPLORATION_NETWORK.edges.find(e=>e.mode===mode&&e.points.length>1);
    if(edge){const pair=edge.points.slice(1).map((b,i)=>({a:edge.points[i],b,d:Math.hypot(b.x-edge.points[i].x,b.y-edge.points[i].y)})).sort((a,b)=>b.d-a.d)[0];
      const d=Math.min(pair.d,mode==='boat'?360:160),start={x:(pair.a.x+pair.b.x)/2,y:(pair.a.y+pair.b.y)/2},delta={x:(pair.b.x-pair.a.x)/pair.d*d/2,y:(pair.b.y-pair.a.y)/pair.d*d/2},a={x:start.x-delta.x,y:start.y-delta.y},b={x:start.x+delta.x,y:start.y+delta.y},duration=Math.ceil(d/(mode==='boat'?12:8)*1000);
      Object.assign(point,a);movement={points:[a,b],startsAt:now-2000,endsAt:now-2000+duration,legs:[{mode,fromIndex:0,toIndex:1,startsAt:now-2000,endsAt:now-2000+duration,routeId:edge.id}]};
      label=mode==='boat'?'Barco sobre una ruta marítima de la red':'Carreta con animal sobre un camino de la red';
    }
  }
  base.exploration={version:1,position:point,homePosition:{...HOME},departedAt:now,...(movement?{movement}:{} )};
  return{state:base,mode,crossing,label};
}
function primary(memory:TravelLabMemory):Player {const player=memory.world.players[memory.playerId];if(!player||player.ownerId!=='visual-lab')throw new Error('El laboratorio sólo admite sus perfiles ficticios.');return player;}

/** Synthetic seed and dispatch only: neither a game store nor an endpoint is opened. */
export function createTravelLabMemory(seed:MvpWorld,playerId:string,preset:TravelLabPreset,now:number):TravelLabMemory{
  const world=structuredClone(seed),scenario=makeScenario(preset,now),memory={world,playerId,scenario,manualCommands:0},player=primary(memory);player.habitable=scenario.state;
  if(preset==='traffic'){
    const walker=createPlayer(world,{ownerId:'visual-lab',requestId:'visual-lab-walker',now,actor:null},{type:'player.create',name:'Peatón del ensayo',stationName:'Ensayo secundario sin guardar',faction:'cartographers'}),a={x:-408,y:-325},b={x:-408,y:-299},wa=now,wb=now+Math.ceil(26/3.5*1000),walk:ExplorationMovement={points:[a,b],startsAt:wa,endsAt:wb,legs:[{mode:'walk',fromIndex:0,toIndex:1,startsAt:wa,endsAt:wb,routeId:'lab:city-crossing'}]};
    walker.habitable={...baseState(),appearance:'frost',exploration:{version:1,position:a,homePosition:{...HOME},departedAt:now,movement:walk}};
    const from={x:-438,y:-312},to={x:-394,y:-312},endsAt=now+5500,carriage:ExplorationMovement={points:[from,to],startsAt:now,endsAt,legs:[{mode:'carriage',fromIndex:0,toIndex:1,startsAt:now,endsAt,routeId:'lab:city-main-street'}]},reserved=reserveTrafficMovement(carriage,[{id:walker.id,position:a,mode:'walk',movement:walk}],now);
    scenario.state.exploration={version:1,position:from,homePosition:{...HOME},departedAt:now,movement:reserved};scenario.label='Tráfico terrestre · Dos perfiles ficticios sobre calles reales';scenario.mode='carriage';
  }
  return memory;
}
export function applyTravelLabManual(memory:TravelLabMemory,intent:DistrictManualNavigationIntent,now:number):TravelLabMemory{
  const next=structuredClone(memory),player=primary(next);dispatchManualNavigation(next.world,{type:'habitat.walk.input',playerId:player.id,...intent},{ownerId:'visual-lab',requestId:`visual-${intent.sessionId}-${intent.sequence}`,now,actor:player});next.scenario.state=player.habitable!;next.manualCommands++;return next;
}
export function travelLabPosition(memory:TravelLabMemory,now:number):HabitablePoint {const state=primary(memory).habitable!;return state.exploration?explorationPositionAt(state.exploration,now):state.position;}

/** Explicitly separate in-memory visual QA from all saved game commands. */
export default function TravelPhysicsLab({initial,initialWorld}:{initial:MvpView;initialWorld:MvpWorld}){
  const[preset,setPreset]=useState<TravelLabPreset>('city'),[memory,setMemory]=useState(()=>createTravelLabMemory(initialWorld,initial.player!.id,'city',initial.now)),[clock,setClock]=useState(initial.now),[notice,setNotice]=useState('Vista de ensayo: no envía órdenes al juego.'),[quality,setQuality]=useState<SceneInput['quality']>('auto'),[trialActive,setTrialActive]=useState(false);
  const current=useRef(memory),trial=useRef<{timer:ReturnType<typeof setInterval>;sessionId:string;sequence:number;startedAt:number;start:HabitablePoint}|null>(null);
  const commit=useCallback((next:TravelLabMemory)=>{current.current=next;setMemory(next);},[]);
  const control=useCallback((intent:DistrictManualNavigationIntent)=>{try{const now=Date.now(),next=applyTravelLabManual(current.current,intent,now);commit(next);setClock(now);setNotice(intent.stop?'Control soltado: parada confirmada en RAM.':'Controlador real: movimiento autorizado en RAM.');}catch(error){setNotice(error instanceof Error?error.message:'El paso no se pudo autorizar.');}},[commit]);
  useEffect(()=>{const timer=setInterval(()=>{const now=Date.now();setClock(now);const previous=current.current,state=primary(previous).habitable!,move=state.exploration?.movement;if(!move)return;
    if(move.endsAt>now&&!move.holds?.length)return;
    const next=structuredClone(previous);settleExplorationTraffic(next.world,now);for(const player of Object.values(next.world.players))settleExploration(player,now);next.scenario.state=primary(next).habitable!;
    if((preset==='boat'||preset==='carriage')&&move.endsAt<=now){const points=move.points.slice().reverse(),duration=move.endsAt-move.startsAt;next.scenario.state.exploration={...state.exploration!,position:{...points[0]},movement:{points,startsAt:now,endsAt:now+duration,legs:[{mode:preset,fromIndex:0,toIndex:points.length-1,startsAt:now,endsAt:now+duration}]}};primary(next).habitable=next.scenario.state;}
    commit(next);
  },200);return()=>clearInterval(timer);},[preset,commit]);
  useEffect(()=>()=>{if(trial.current)clearInterval(trial.current.timer);},[]);
  const stopTrial=()=>{const active=trial.current;if(!active)return;clearInterval(active.timer);trial.current=null;control({sessionId:active.sessionId,sequence:++active.sequence,directionX:0,directionY:0,stop:true});setTrialActive(false);};
  const select=(value:TravelLabPreset)=>{stopTrial();try{setPreset(value);commit(createTravelLabMemory(initialWorld,initial.player!.id,value,Date.now()));setNotice('Escenario ficticio. Ninguna partida se modifica.');}catch(error){setNotice(error instanceof Error?error.message:'No se pudo preparar el ensayo.');}};
  const startTrial=()=>{stopTrial();const now=Date.now(),sessionId=crypto.randomUUID(),start=travelLabPosition(current.current,now),run={timer:undefined as unknown as ReturnType<typeof setInterval>,sessionId,sequence:1,startedAt:now,start};control({sessionId,sequence:1,directionX:1,directionY:0,stop:false});setTrialActive(true);
    run.timer=setInterval(()=>{const elapsed=Date.now()-run.startedAt;if(elapsed>=5000){stopTrial();const end=travelLabPosition(current.current,Date.now());setNotice(`Ensayo de cinco segundos terminado: ${Math.hypot(end.x-start.x,end.y-start.y).toFixed(2)} unidades; parada real, sin guardar partidas.`);return;}control({sessionId,sequence:++run.sequence,directionX:1,directionY:0,stop:false});},250);trial.current=run;
  };
  const scenario=memory.scenario,state=scenario.state;
  const input=useMemo<SceneInput>(()=>{const player={...initial.player!,habitable:memory.scenario.state},actors=Object.values(memory.world.players).filter(p=>p.habitable&&p.settlement).map(p=>({playerId:p.id,name:p.name,plot:p.settlement!,state:p.habitable!})),habitable={...initial.habitable,actors};return{view:{...initial,now:clock,player,habitable},player,selected:player.position,mode:'settlement',quality,reducedMotion:false};},[initial,memory,quality,clock]);
  const move=(to:HabitablePoint)=>{const previous=current.current,state=primary(previous).habitable!,exp=state.exploration!,now=Date.now();if(exp.movement&&exp.movement.endsAt>now)return;const from=explorationPositionAt(exp,now),distance=Math.hypot(to.x-from.x,to.y-from.y);if(distance>8){setNotice('Paso demasiado largo: máximo 8 unidades.');return;}if(!physicalLineClear(from,to,{now,endsAt:now+distance/3.5*1000,includeNpcs:true})){setNotice('Paso bloqueado por la física compartida: no se atraviesa el obstáculo.');return;}const next=structuredClone(previous),h=primary(next).habitable!,duration=Math.max(150,Math.ceil(distance/3.5*1000));h.exploration={...exp,position:from,movement:{points:[from,to],startsAt:now,endsAt:now+duration}};next.scenario.state=h;commit(next);setNotice(`Paso permitido · suelo ${physicalTerrainSample(to).height.toFixed(2)}`);};
  const moving=state.exploration?.movement,active=!!moving&&moving.endsAt>clock&&!moving.manualSessionId,hold=explorationHoldAt(moving,clock),position=travelLabPosition(memory,clock),metadata=state.manualNavigation;
  return <main style={{padding:16,maxWidth:1400,margin:'auto',color:'#eddfbc',background:'#142b21',fontFamily:'system-ui'}}>
    <h1 style={{fontSize:22}}>Laboratorio visual · Viajes y colisiones</h1>
    <p>Datos ficticios y estado en memoria. Esta vista no lee ni guarda partidas y no realiza operaciones económicas. El control continuo utiliza el mismo controlador de movimiento del juego, sobre una copia ficticia en RAM.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
      <label>Escenario <select aria-label="Escenario de ensayo" value={preset} onChange={e=>select(e.target.value as TravelLabPreset)}><option value="city">Ciudad y habitantes</option><option value="fence">Cerca</option><option value="boat">Barco</option><option value="carriage">Carreta</option><option value="traffic">Cruce con cesión de paso</option></select></label>
      <label>Calidad <select aria-label="Calidad del ensayo" value={quality} onChange={e=>setQuality(e.target.value as SceneInput['quality'])}><option value="auto">Adaptable</option><option value="performance">Rendimiento</option><option value="fullhd">Full HD</option></select></label>
      <button type="button" onClick={()=>select(preset)}>Reiniciar ensayo</button>
      <button type="button" disabled={active||trialActive} onClick={startTrial}>Probar caminata continua · 5 s</button>
      {trialActive&&<button type="button" onClick={stopTrial}>Soltar control del ensayo</button>}
      {scenario.crossing&&<button type="button" disabled={active} onClick={()=>move(scenario.crossing!)}>Intentar cruzar la cerca</button>}
      {/* Full navigation avoids a verified Vinext RSC prefetch error in this isolated QA page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/recorrer/encargo" style={{color:'#ead094'}}>Volver al juego</a>
    </div>
    <p>{scenario.label}</p><p role="status">{notice}</p>
    <output aria-label="Diagnóstico visible del ensayo" style={{display:'block',padding:10,marginBottom:10,background:'#203c2e'}}>X {position.x.toFixed(3)} · Y {position.y.toFixed(3)} · Controles recibidos: {memory.manualCommands} · Secuencia: {metadata?.sequence??0} · Autorización: {metadata?.stopped?'detenida':metadata&&metadata.expiresAt>clock?'activa':'sin movimiento autorizado'} · Comprobantes económicos: {Object.keys(memory.world.receipts).length} · {hold?'Cediendo el paso':'Paso disponible'}</output>
    <div style={{height:'min(72vh,800px)',minHeight:440}}><HabitableScene input={input} state={state} onMove={move} onManualNavigation={control} onPlace={()=>{}} onInteract={()=>setNotice('Interacción del ensayo: sin operación económica.')} navigationDisabled={trialActive} journey={active?{mode:explorationTransportAt(state.exploration!,clock),remainingLabel:`${Math.ceil((moving!.endsAt-clock)/1000)} s`,canStop:false,waiting:!!hold}:undefined}/></div>
  </main>;
}
