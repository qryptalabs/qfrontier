'use client';

import {useState} from 'react';
import type {Dispatch,SetStateAction} from 'react';
import {CircleHelp,Factory,Package,TreePine,Truck,Users} from 'lucide-react';
import type {HabitableManagerView} from '../lib/mvp/habitable-manager';
import {ManagerOperatorControls} from './manager-operator';

type ManagerPlan=NonNullable<HabitableManagerView['plan']>;
export interface ManagerIndustryDraft {
  parallel:boolean;courierResidentId:string;woodlotId:string;sawmillId:string;
  forestKey:string;maxTimber:string;
  operatorEnabled:boolean;operatorResidentId:string;operatorWoodlot:boolean;operatorSawmill:boolean;operatorPreferredJob:string;
}
const sourceKey=(tileId:string,layerId:string)=>JSON.stringify([tileId,layerId]);

/** Local choices only; authorization still goes through the signed server quote. */
export function useManagerIndustryDraft(manager:HabitableManagerView){
  const plan=manager.plan;
  const [draft,setDraft]=useState<ManagerIndustryDraft>(()=>({
    parallel:plan?.parallel===true,courierResidentId:plan?.courierResidentId??'',
    woodlotId:plan?.woodlotId??'',sawmillId:plan?.sawmillId??'',
    forestKey:plan?.forestry?sourceKey(plan.forestry.tileId,plan.forestry.layerId):'',
    maxTimber:String(plan?.forestry?.maxTimber??4),
    operatorEnabled:!!plan?.operator,operatorResidentId:plan?.operator?.residentId??'',
    operatorWoodlot:plan?.operator?.allowedJobs.includes('woodlot')??true,operatorSawmill:plan?.operator?.allowedJobs.includes('sawmill')??true,
    operatorPreferredJob:plan?.operator?.preferredJob??'woodlot',
  }));
  const woodlot=(manager.woodlots??[]).find(f=>f.buildingId===draft.woodlotId);
  const sawmill=(manager.sawmills??[]).find(f=>f.buildingId===draft.sawmillId);
  const courier=(manager.couriers??[]).find(r=>r.residentId===draft.courierResidentId);
  const source=(manager.forestSources??[]).find(s=>sourceKey(s.tileId,s.layerId)===draft.forestKey);
  const limit=Number(draft.maxTimber),limitValid=draft.maxTimber.trim()!==''&&Number.isSafeInteger(limit)&&limit>=1&&limit<=10;
  const operator=(manager.operators??[]).find(r=>r.residentId===draft.operatorResidentId);
  const allowedJobs:('woodlot'|'sawmill')[]=[...(draft.operatorWoodlot?['woodlot' as const]:[]),...(draft.operatorSawmill?['sawmill' as const]:[])];
  const preferred= draft.operatorPreferredJob==='woodlot'||draft.operatorPreferredJob==='sawmill'?draft.operatorPreferredJob:null;
  const currentAllowed=!operator?.currentBuildingId||draft.operatorWoodlot&&operator.currentBuildingId===draft.woodlotId||draft.operatorSawmill&&operator.currentBuildingId===draft.sawmillId;
  const operatorValid=!draft.operatorEnabled||!!operator?.available&&currentAllowed&&(!draft.parallel||draft.operatorResidentId!==draft.courierResidentId)&&allowedJobs.length>0&&!!preferred&&allowedJobs.includes(preferred)&&(!draft.operatorWoodlot||!!woodlot?.operatorEligible&&(!woodlot.residentId||woodlot.residentId===operator.residentId))&&(!draft.operatorSawmill||!!sawmill?.operatorEligible&&(!sawmill.residentId||sawmill.residentId===operator.residentId));
  const ready=(facility:typeof woodlot,job:'woodlot'|'sawmill')=>!!facility?.available||draft.operatorEnabled&&operatorValid&&allowedJobs.includes(job)&&!!facility?.operatorEligible;
  const valid=operatorValid&&(!draft.woodlotId||ready(woodlot,'woodlot')&&!!source&&limitValid)&&(!draft.sawmillId||ready(sawmill,'sawmill'))&&(!draft.parallel||!!courier?.available);
  const fields={
    parallel:draft.parallel,courierResidentId:draft.parallel?draft.courierResidentId:null,
    woodlotId:draft.woodlotId||null,sawmillId:draft.sawmillId||null,
    forestry:draft.woodlotId&&source?{tileId:source.tileId,layerId:source.layerId,maxTimber:limit}:null,
    operator:draft.operatorEnabled&&preferred?{residentId:draft.operatorResidentId,allowedJobs,preferredJob:preferred}:null,
  };
  return{draft,setDraft,valid,fields};
}

export function ManagerIndustryControls({manager,draft,setDraft,disabled,onResidents}:{
  manager:HabitableManagerView;draft:ManagerIndustryDraft;
  setDraft:Dispatch<SetStateAction<ManagerIndustryDraft>>;
  disabled:boolean;onResidents():void;
}){
  const sources=manager.forestSources??[],couriers=manager.couriers??[];
  const source=sources.find(s=>sourceKey(s.tileId,s.layerId)===draft.forestKey);
  const courier=couriers.find(r=>r.residentId===draft.courierResidentId);
  const choose=(key:keyof ManagerIndustryDraft,value:string|boolean)=>setDraft(current=>({...current,[key]:value}));
  return <details className="pm-industry-controls"><summary><Factory size={15}/>Industria y transporte{draft.parallel?' · Dos trabajos en paralelo':''}</summary>
    <p>Conectá tus instalaciones terminadas y sus habitantes asignados, o autorizá un operador para los puestos industriales elegidos. El encargado conserva las reservas mínimas y el presupuesto común del turno.</p>
    <fieldset disabled={disabled} className="pm-industry-fields"><legend>Instalaciones industriales del turno</legend>
      <IndustryFacility label="Puesto forestal del encargado" empty="Sin extracción forestal" value={draft.woodlotId} options={manager.woodlots??[]} onChange={value=>choose('woodlotId',value)}/>
      {draft.woodlotId&&<>
        <label>Yacimiento autorizado<select aria-label="Yacimiento forestal autorizado" value={source?draft.forestKey:draft.forestKey?'missing':''} onChange={e=>choose('forestKey',e.target.value)}>
          {draft.forestKey&&!source?<option value="missing" disabled>Selección no disponible · Elegí otra</option>:<option value="">Elegí un yacimiento</option>}
          {sources.map(s=><option value={sourceKey(s.tileId,s.layerId)} key={sourceKey(s.tileId,s.layerId)}>{s.tileName} · {s.available} disponibles · Cuota {s.quotaRemaining}</option>)}
        </select></label>
        <label>Máximo de madera por turno<input aria-label="Máximo de madera del encargado" type="number" min={1} max={10} step={1} inputMode="numeric" value={draft.maxTimber} onChange={e=>choose('maxTimber',e.target.value)}/></label>
        <p className="pm-note"><TreePine size={14}/><span>Entre 1 y 10 maderas desde este yacimiento. Es un máximo autorizado: la disponibilidad, las cuotas y el presupuesto restante pueden reducir la extracción. Cada madera reservada también cuenta en el tope común de materiales.</span></p>
      </>}
      <IndustryFacility label="Aserradero del encargado" empty="Usar la mesa para los tablones" value={draft.sawmillId} options={manager.sawmills??[]} onChange={value=>choose('sawmillId',value)}/>
      {draft.sawmillId&&<p className="pm-note">El aserradero elegido fabrica los tablones del plan, de un ciclo en un ciclo. Requiere dos maderas reales por tablón y conserva su jornada de alimentación. El encargado no cambia a la mesa si este aserradero queda bloqueado.</p>}
      <ManagerOperatorControls manager={manager} draft={draft} setDraft={setDraft} disabled={disabled}/>
      <label className="pm-parallel-choice"><input aria-label="Dos trabajos en paralelo" type="checkbox" checked={draft.parallel} onChange={e=>choose('parallel',e.target.checked)}/><span><strong>Dos trabajos en paralelo</strong><small>Comparten el máximo de órdenes, el presupuesto y el plazo del turno.</small></span></label>
      {draft.parallel&&<><label>Transportista de las entregas<select aria-label="Transportista del encargado" value={courier?draft.courierResidentId:draft.courierResidentId?'missing':''} onChange={e=>choose('courierResidentId',e.target.value)}>
        {draft.courierResidentId&&!courier?<option value="missing" disabled>Habitante no disponible · Elegí otro</option>:<option value="">Elegí un habitante propio sin puesto</option>}
        {couriers.map(r=><option key={r.residentId} value={r.residentId}>{r.name}{r.available?'':` · ${r.reason??'No disponible'}`}</option>)}
      </select></label>{courier&&!courier.available&&<p className="pm-warning"><CircleHelp size={14}/>{courier.reason??'El transportista necesita estar disponible y sin otro puesto.'}</p>}
      <p className="pm-note"><Truck size={14}/><span>Un solo habitante recoge las salidas de las instalaciones, las entrega al cobertizo elegido y regresa antes de atender otra carga. Los productores siguen recogiendo sus propios insumos. La capacidad de dos trabajos incluye las órdenes que esperan entrega.</span></p></>}
    </fieldset>
    <button type="button" className="pm-link" onClick={onResidents}><Users size={14}/>Organizar habitantes</button>
  </details>;
}

function IndustryFacility({label,empty,value,options,onChange}:{label:string;empty:string;value:string;options:HabitableManagerView['workbenches'];onChange(value:string):void}){
  const present=options.some(option=>option.buildingId===value);
  return <label>{label}<select aria-label={label} value={value&&!present?'missing':value} onChange={e=>onChange(e.target.value)}>{value&&!present?<option value="missing" disabled>Selección no disponible · Elegí otra</option>:null}<option value="">{empty}</option>{options.map(option=><option value={option.buildingId} key={option.buildingId}>{option.label}{option.available?'':option.operatorEligible&&!option.residentId?' · Requiere operador autorizado':` · ${option.reason??'No disponible'}`}</option>)}</select></label>;
}

export function ManagerIndustryPolicy({plan}:{plan:ManagerPlan}){
  const used=plan.turn.extractionCommitted??0;
  return <div className="pm-confirmed-policy" aria-label="Industria y transporte autorizados"><strong><Factory size={14}/>{plan.parallel?'Hasta dos trabajos · Un transportista':'Un trabajo a la vez'}</strong>
    {plan.woodlotId&&plan.forestry&&<p>Extracción autorizada: hasta {plan.forestry.maxTimber} maderas del yacimiento {plan.forestry.tileId}. Reservadas en este turno: {used}. Cada unidad cuenta en el presupuesto común.</p>}
    {plan.sawmillId&&<p>Los tablones se fabrican en el aserradero elegido. Cada ciclo requiere dos maderas y cuenta como una orden.</p>}
    {plan.parallel&&<p><Package size={13}/> Los productores abastecen sus puestos y el transportista entrega las salidas. Ningún puesto admite otra orden hasta finalizar su entrega y regreso.</p>}
  </div>;
}

export function ManagerTransportPanel({plan,onFacility}:{plan:ManagerPlan;onFacility(id:string):void}){
  const transport=plan.transport;
  if(!plan.parallel||!transport)return null;
  const phases={idle:'Disponible',approaching:'Acercándose a la instalación',loading:'Recogiendo productos',carrying:'Llevando productos al cobertizo',unloading:'Descargando en el cobertizo',returning:'Regresando a su punto de espera',blocked:'Esperando una ruta o capacidad'};
  return <section className="pm-courier" aria-label="Transportista del encargado"><strong><Truck size={15}/>{transport.name}</strong><p>{phases[transport.phase]}</p>
    <dl className="pm-stats"><div><dt>Carga en traslado</dt><dd>{transport.cargoUnits} unidades</dd></div><div><dt>Entregas en cola</dt><dd>{transport.queue}</dd></div></dl>
    <p className="pm-note">{transport.reserved?'Reservado para este turno y sus entregas pendientes.':'Turno cerrado; el habitante está liberado.'}</p>
    {transport.reason&&<p className="pm-note"><strong>Motivo de esta entrega:</strong> {transport.reason}</p>}
    {!!transport.queuedDeliveries?.length&&<details className="pm-delivery-queue"><summary>Ver prioridades de las entregas pendientes</summary><ol>{transport.queuedDeliveries.map(delivery=><li key={delivery.buildingId}><span>{delivery.units} unidades · {delivery.reason}</span><button type="button" className="pm-link" onClick={()=>onFacility(delivery.buildingId)}>Ver instalación</button></li>)}</ol></details>}
    {transport.blockedReason&&<p className="pm-warning" role="status"><CircleHelp size={14}/>{transport.blockedReason}</p>}
    {transport.sourceBuildingId&&<button type="button" className="pm-link" onClick={()=>onFacility(transport.sourceBuildingId!)}>Ver instalación de recogida</button>}
    {transport.destinationBuildingId&&<button type="button" className="pm-link" onClick={()=>onFacility(transport.destinationBuildingId!)}>Ver cobertizo de destino</button>}
  </section>;
}
