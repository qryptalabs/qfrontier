"use client";

import {useState} from "react";
import {ArrowRight,CheckCircle2,CircleHelp,Clock3,Footprints,Leaf,Package,ShieldCheck,Soup,TreePine,Users,Warehouse} from "lucide-react";
import type {MvpCommand} from "../lib/mvp/types";
import type {MvpView,PublicPlayer} from "../lib/mvp/view";
import type {HabitableDailyView} from "../lib/mvp/habitable-daily";
import {HABITABLE_INTERACTION_RADIUS,habitableLineClear,habitablePositionAt,type HabitableState} from "../lib/mvp/habitable-data";
import {ITEM_CATALOG} from "../lib/mvp/catalog";
import HabitableClearAccess from "./habitable-access";
import "./habitable-daily.css";

type Action=(command:MvpCommand)=>void|Promise<void>;
interface Props{view:MvpView;player:PublicPlayer;state:HabitableState;clock:number;busy:boolean;act:Action;quickAct:Action;mode?:"manage"|"summary";onFacility(id:string):void;onResidents?():void}
const duration=(seconds:number)=>{const value=Math.max(0,Math.ceil(seconds));return value<60?`${value} s`:`${Math.floor(value/60)} min${value%60?` ${value%60} s`:""}`;};
const itemName=(id:string)=>ITEM_CATALOG[id as keyof typeof ITEM_CATALOG]?.name??id;
const dailyLabels={legacy:"Activación voluntaria",delivering:"Reparto en curso",active:"Jornada cubierta",paused:"Jornada en pausa"};
const foodLabels={legacy:"Sin jornada activada",waiting:"Esperando su ración",fed:"Alimentado",paused:"Necesita una jornada"};

export function HabitableFoodStatus({resident,clock}:{resident:HabitableDailyView["residents"][number];clock:number}){
  const left=resident.fedUntil===null?0:Math.max(0,(resident.fedUntil-clock)/1000);
  return <span className={`hd-food-status ${resident.status}`}><Soup size={12}/>{resident.status==="fed"?left?`${foodLabels.fed} · ${duration(left)}`:"Confirmando jornada…":foodLabels[resident.status]}</span>;
}

export default function HabitableDaily(props:Props){
  const daily=props.view.habitable.daily;
  if(!daily)return null;
  return props.mode==="summary"?<DailySummary {...props} daily={daily}/>:<DailyManagement {...props} daily={daily}/>;
}

function DailySummary({daily,onResidents}:{daily:HabitableDailyView;onResidents?:()=>void}){
  return <section className="hd-panel hd-economy" aria-label="Balance confirmado de alimentación"><div className="hd-title"><Leaf size={18}/><h3>Consumos de tu comunidad</h3></div><div className="hd-confirmed-grid"><span>Raciones consumidas<strong>{daily.balance.rationsConsumed}</strong></span><span>Madera de mantenimiento<strong>{daily.balance.timberConsumed}</strong></span></div><p>Consumos confirmados por las entregas de la jornada. Se muestran separados de los ingresos comerciales y de las previsiones.</p><div className="hd-forecast"><span>Previsión por próxima jornada</span><strong>{daily.costs.map(cost=>`${cost.qty} ${itemName(cost.itemId).toLocaleLowerCase("es")}`).join(" + ")}</strong><small>{duration(daily.durationSeconds)} por habitante después de recibir su ración. El próximo reparto requiere otra confirmación.</small></div><div className="hd-current-stock"><Package size={14}/><span>En tus cobertizos: {daily.balance.rationStock} raciones y {daily.balance.timberStock} maderas vigentes.</span></div>{onResidents&&<button type="button" className="hd-text-button" onClick={onResidents}><Users size={14}/>Gestionar jornada y alimentación<ArrowRight size={13}/></button>}</section>;
}

function DailyManagement({daily,view,player,state,clock,busy,act,quickAct,onFacility}:Props&{daily:HabitableDailyView}){
  const [shedId,setShedId]=useState(daily.sheds.find(s=>s.canStart)?.buildingId??daily.sheds[0]?.buildingId??""),[courierId,setCourierId]=useState(daily.couriers.find(r=>r.available)?.id??daily.couriers[0]?.id??"");
  const shed=daily.sheds.find(s=>s.buildingId===shedId),courier=daily.couriers.find(r=>r.id===courierId),facility=view.habitable.facilities.find(f=>f.buildingId===shedId),position=habitablePositionAt(state,clock);
  const moving=!!state.movement&&state.movement.endsAt>clock||view.jobs.some(j=>j.playerId===player.id&&["travel","convoy"].includes(j.kind)&&["running","reserved"].includes(j.status));
  const access=facility?.access,confirmingAccess=!shed?.near&&!moving&&!!access&&Math.hypot(position.x-access.x,position.y-access.y)<=HABITABLE_INTERACTION_RADIUS&&habitableLineClear(position,access,state);
  const positiveCosts=daily.costs.filter(c=>c.qty>0),stock={ration:shed?.stock.ration??0,timber:shed?.stock.timber??0},coverage=shed&&positiveCosts.length?Math.max(0,Math.min(...positiveCosts.map(c=>Math.floor((stock[c.itemId as keyof typeof stock]??0)/c.qty)))):0;
  const canStart=!busy&&!moving&&!!shed?.canStart&&!!courier?.available;
  return <section className="hd-panel" aria-label="Jornada y alimentación"><div className="hd-heading"><div className="hd-title"><Soup size={21}/><h3>Una jornada para tu comunidad</h3></div><span className={`hd-state ${daily.status}`}>{dailyLabels[daily.status]}</span></div><p>{daily.optedIn?"El repartidor recoge los recursos del cobertizo, lleva una ración a cada habitante y regresa a su puesto.":"Activá esta rutina cuando quieras empezar a alimentar a tus habitantes. No se cobran jornadas anteriores."}</p><div className="hd-rule"><Clock3 size={16}/><span><strong>{duration(daily.durationSeconds)} por habitante</strong> desde su entrega. Una ración por persona y una madera por cada tres obras terminadas, redondeando hacia arriba.</span></div>
    {daily.journey&&<DailyJourney daily={daily} clock={clock} onFacility={onFacility}/>}
    <div className="hd-forecast"><span>Coste de la próxima jornada</span><div className="hd-costs">{daily.costs.map(cost=><span key={cost.itemId}>{cost.itemId==="ration"?<Soup size={14}/>:<TreePine size={14}/>}<strong>{cost.qty}</strong> {itemName(cost.itemId)}</span>)}</div><small>Se reserva en un cobertizo propio al confirmar. El consumo queda registrado al completar las entregas; no hay un cobro en créditos.</small></div>
    {daily.sheds.length?<form className="hd-form" onSubmit={event=>{event.preventDefault();if(canStart)void act({type:"habitat.daily.start",playerId:player.id,buildingId:shedId,residentId:courierId});}}><label>Cobertizo de alimentos<select aria-label="Cobertizo para la jornada" value={shedId} disabled={busy||moving||daily.status==="delivering"} onChange={event=>setShedId(event.target.value)}>{!shed&&<option value="">Elegí un cobertizo</option>}{daily.sheds.map(s=>{const b=state.buildings.find(b=>b.id===s.buildingId);return <option key={s.buildingId} value={s.buildingId}>{s.label}{b?` · X ${b.x.toFixed(1)}, Y ${b.y.toFixed(1)}`:""}</option>;})}</select></label>{shed&&<><div className="hd-stock"><span><Soup size={15}/>Raciones vigentes<strong>{shed.stock.ration}</strong></span><span><TreePine size={15}/>Maderas vigentes<strong>{shed.stock.timber}</strong></span></div><p className="hd-stock-cover">Previsión con este stock: <strong>{coverage} {coverage===1?"jornada":"jornadas"}</strong> para la población y obras actuales. No programa consumos futuros ni garantiza que los lotes sigan vigentes.</p><div className="hd-access-actions"><button type="button" className="hd-text-button" onClick={()=>onFacility(shed.buildingId)}><Warehouse size={13}/>Ver existencias<ArrowRight size={12}/></button>{!shed.near&&<button type="button" className="h-button secondary small" disabled={busy||moving||!access||confirmingAccess} onClick={()=>{if(access)void quickAct({type:"habitat.walk",playerId:player.id,x:access.x,y:access.y});}}><Footprints/>{moving?"En camino…":confirmingAccess?"Confirmando acceso…":"Ir al cobertizo de alimentos"}</button>}</div>{facility&&shed.near&&<HabitableClearAccess state={state} facility={facility} clock={clock} busy={busy||moving} playerId={player.id} quickAct={quickAct}/>}</>}
      <label>Habitante que repartirá<select aria-label="Repartidor de la jornada" value={courierId} disabled={busy||moving||daily.status==="delivering"} onChange={event=>setCourierId(event.target.value)}>{!courier&&<option value="">Elegí un habitante</option>}{daily.couriers.map(r=><option key={r.id} value={r.id} disabled={!r.available}>{r.name}{r.available?"":" · Ocupado"}</option>)}</select></label><p className="hd-note"><Users size={14}/><span>Usa un habitante existente. Todos deben estar libres para reservar el reparto; conservan sus puestos y regresan a ellos.</span></p><button type="submit" className="h-button full" disabled={!canStart}><Soup/>{daily.optedIn?"Revisar nueva jornada":"Revisar activación de la jornada"}</button>{(shed?.reason||courier?.reason)&&<p className="hd-note" role="status"><CircleHelp size={14}/><span>{shed?.reason??courier?.reason}</span></p>}</form>:<p className="hd-note"><Warehouse size={15}/><span>Prepará un cobertizo propio y registrá a los habitantes para organizar su primera jornada.</span></p>}
    <p className="hd-note"><ShieldCheck size={14}/><span>Una jornada por confirmación. Al ausentarte no se acumulan deudas ni se cobran repartos adicionales. Las tareas básicas para producir alimentos y obtener madera siguen disponibles.</span></p></section>;
}

function DailyJourney({daily,clock,onFacility}:{daily:HabitableDailyView;clock:number;onFacility(id:string):void}){
  const journey=daily.journey!,travelling=daily.status==="delivering",left=Math.max(0,(journey.endsAt-clock)/1000),progress=Math.max(0,Math.min(100,(clock-journey.startsAt)/Math.max(1,journey.endsAt-journey.startsAt)*100));
  const courier=daily.couriers.find(r=>r.id===journey.workerId),next=journey.stops.find(stop=>stop.deliveredAt===null),recipient=next&&daily.residents.find(r=>r.id===next.residentId);
  const phaseLabel=!travelling?"Reparto completado":journey.delivered<journey.total?"Repartiendo alimentos":journey.cargoUnits>0?"Mantenimiento del cobertizo":"Regresando a su puesto";
  return <section className={`hd-journey ${travelling?"":"completed"}`} aria-label="Seguimiento del reparto"><div className="hd-journey-title"><span>{travelling?<Footprints size={16}/>:<CheckCircle2 size={16}/>}<strong>{phaseLabel}</strong></span><small>{journey.delivered} / {journey.total} raciones entregadas</small></div><p>{courier?.name??"Tu habitante"}{travelling?` · ${left?`${duration(left)} para completar el recorrido`:"Confirmando regreso…"}`:" regresó a su puesto habitual."}</p>{travelling&&<div className="h-progress-track" role="progressbar" aria-label="Progreso del reparto de alimentos" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div>}<dl><div><dt>Carga reservada en recorrido</dt><dd>{journey.cargoUnits} unidades</dd></div>{travelling&&recipient&&<div><dt>Próxima entrega</dt><dd>{recipient.name}{next&&<small>{next.arrivesAt>clock?`en ${duration((next.arrivesAt-clock)/1000)}`:"Confirmando entrega…"}</small>}</dd></div>}</dl><button type="button" className="hd-text-button" onClick={()=>onFacility(journey.sourceBuildingId)}><Warehouse size={13}/>Ver cobertizo del reparto<ArrowRight size={12}/></button></section>;
}
