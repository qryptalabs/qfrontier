'use client';

import {useState} from 'react';
import type {Dispatch,SetStateAction} from 'react';
import {ClipboardList,Package,Route,ShieldCheck} from 'lucide-react';
import type {HabitableManagerView,ManagerBuildApproval} from '../lib/mvp/habitable-manager';
import {ITEM_CATALOG} from '../lib/mvp/catalog';

type Plan=NonNullable<HabitableManagerView['plan']>;
type Priority='food'|'construction'|'stock';
const priorities:readonly Priority[]=['food','construction','stock'];
const names:Record<Priority,string>={food:'Alimentos',construction:'Construcción',stock:'Almacenamiento'};
const orders:Record<Priority,string>={food:'Alimentos → Construcción → Almacenamiento',construction:'Construcción → Alimentos → Almacenamiento',stock:'Almacenamiento → Alimentos → Construcción'};
const itemName=(id:string)=>ITEM_CATALOG[id as keyof typeof ITEM_CATALOG]?.name??id;
export interface ManagerPolicyDraft {priority:Priority;reserveBuildMaterials:boolean;urgentTransport:boolean}

/** These preferences become authoritative only through a confirmed server quote. */
export function useManagerPolicyDraft(plan:Plan|null){
  const [draft,setDraft]=useState<ManagerPolicyDraft>(()=>({priority:plan?.priority??'food',reserveBuildMaterials:plan?plan.reserveBuildMaterials===true:true,urgentTransport:plan?plan.urgentTransport===true:true}));
  return{draft,setDraft,valid:priorities.includes(draft.priority),fields:{...draft}};
}

export function ManagerPolicyControls({draft,setDraft,disabled}:{draft:ManagerPolicyDraft;setDraft:Dispatch<SetStateAction<ManagerPolicyDraft>>;disabled:boolean}){
  return <fieldset className="pm-policy-controls" disabled={disabled}><legend><ClipboardList size={14}/>Prioridades y reservas del próximo turno</legend>
    <label>Prioridad principal<select aria-label="Prioridad principal del encargado" value={draft.priority} onChange={e=>setDraft(current=>({...current,priority:e.target.value as Priority}))}>{priorities.map(priority=><option key={priority} value={priority}>{names[priority]}</option>)}</select></label>
    <p className="pm-note">{orders[draft.priority]}.</p>
    <label className="pm-policy-choice"><input aria-label="Reservar materiales para las obras" type="checkbox" checked={draft.reserveBuildMaterials} onChange={e=>setDraft(current=>({...current,reserveBuildMaterials:e.target.checked}))}/><span><strong>Reservar materiales para cada obra</strong><small>Apartar lotes existentes para los planos aprobados, después de respetar los mínimos. Esas unidades siguen en el cobertizo y quedan protegidas frente a retiros, ventas y otros trabajos.</small></span></label>
    <p className="pm-note">Las reservas de obra pendientes se mantienen al pausar. Retirar un plano o desactivar esta opción al autorizar otro turno libera lo que todavía no salió hacia la obra. Reservar no consume materiales ni inicia una orden.</p>
    <label className="pm-policy-choice"><input aria-label="Transportar por urgencia" type="checkbox" checked={draft.urgentTransport} onChange={e=>setDraft(current=>({...current,urgentTransport:e.target.checked}))}/><span><strong>Entregar según urgencia</strong><small>Atender primero la carga que desbloquee tareas de tu prioridad. Conserva las rutas, los límites de carga y los viajes en marcha; las entregas antiguas ganan prioridad para evitar esperas prolongadas.</small></span></label>
    <p className="pm-note">Estos cambios se aplican al confirmar un turno. El despacho por urgencia utiliza al transportista del modo paralelo. Los puestos y el transportista conservan los mismos límites compartidos.</p>
  </fieldset>;
}

export function ManagerPrioritySummary({plan}:{plan:Plan|null}){
  const priority=plan?.priority??'food';
  return <p className="pm-priority"><ClipboardList size={14}/><span><strong>Prioridad del plan:</strong> {orders[priority]}. Si un puesto está bloqueado, se revisan las otras tareas elegibles dentro de los mismos límites.{plan&&<><br/><ShieldCheck size={12}/> Reservas por obra: {plan.reserveBuildMaterials?'activadas':'desactivadas'}. <Route size={12}/> Entregas: {plan.urgentTransport?'por urgencia':'por orden de finalización'}.</>}</span></p>;
}

export function ManagerAllocationPanel({plan}:{plan:Plan}){
  if(!plan.reserveBuildMaterials)return null;
  const rows=(plan.reserves??[]).filter(row=>row.stock>0||(row.reservedForBuilds??0)>0||row.minimum>0);
  return <details className="pm-allocation"><summary><Package size={14}/>Materiales disponibles y asignados a obras</summary>
    <p>Las unidades asignadas siguen dentro del stock del cobertizo. Se cuentan una sola vez y sólo su obra puede utilizarlas; las reservas mínimas limitan el consumo automático.</p>
    {rows.length?<div role="table" aria-label="Disponibilidad de materiales del encargado"><div role="row" className="pm-allocation-head"><span role="columnheader">Material</span><span role="columnheader">Stock</span><span role="columnheader">Para obras</span><span role="columnheader">Sin asignar</span></div>{rows.map(row=><div role="row" key={row.itemId}><strong role="rowheader">{itemName(row.itemId)}</strong><span role="cell">{row.stock}</span><span role="cell">{row.reservedForBuilds??0}</span><span role="cell">{row.free??row.stock}</span><small>Mínimo {row.minimum} · {row.spendable} para otros trabajos automáticos</small></div>)}</div>:<p>No hay existencias ni reservas asignadas todavía.</p>}
  </details>;
}

export function ManagerWorkReservations({approval}:{approval:ManagerBuildApproval&{reservations?:{itemId:string;required:number;reserved:number;missing:number}[]}}){
  const rows=approval.reservations;
  if(!rows?.length||approval.status==='revoked')return null;
  if(approval.status==='started'||approval.status==='completed')return <p className="pm-note">Los materiales de esta obra ya salieron del stock disponible con su constructor.</p>;
  return <div className="pm-work-reservations" aria-label="Materiales reservados de esta obra"><strong>Reservas de esta obra</strong><ul>{rows.map(row=><li key={row.itemId}><span>{itemName(row.itemId)}</span><span>{row.reserved} / {row.required} apartados</span><small>{row.missing?`Faltan ${row.missing}; el encargado espera abastecimiento.`:'Materiales apartados en el cobertizo.'}</small></li>)}</ul></div>;
}
