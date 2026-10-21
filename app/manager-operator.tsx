'use client';

import {ArrowRightLeft,CircleHelp,Footprints,Users} from 'lucide-react';
import type {Dispatch,SetStateAction} from 'react';
import type {HabitableManagerView} from '../lib/mvp/habitable-manager';
import type {ManagerIndustryDraft} from './manager-industry';

type Plan=NonNullable<HabitableManagerView['plan']>;
const jobs={woodlot:'Puesto forestal',sawmill:'Aserradero'};
const duration=(seconds:number)=>{const whole=Math.max(0,Math.floor(seconds));return whole<60?`${whole} s`:`${Math.floor(whole/60)} min ${whole%60} s`;};

export function ManagerOperatorControls({manager,draft,setDraft,disabled}:{manager:HabitableManagerView;draft:ManagerIndustryDraft;setDraft:Dispatch<SetStateAction<ManagerIndustryDraft>>;disabled:boolean}){
  const choices=manager.operators??[],selected=choices.find(r=>r.residentId===draft.operatorResidentId);
  const choose=(key:keyof ManagerIndustryDraft,value:string|boolean)=>setDraft(current=>({...current,[key]:value}));
  return <fieldset className="pm-operator-controls" disabled={disabled}><legend><ArrowRightLeft size={14}/>Operador polivalente del próximo turno</legend>
    <label className="pm-policy-choice"><input type="checkbox" aria-label="Autorizar operador polivalente" checked={draft.operatorEnabled} onChange={e=>choose('operatorEnabled',e.target.checked)}/><span><strong>Un habitante entre el bosque y el aserradero</strong><small>Cambia de puesto sólo con tu autorización. La mesa, el bancal y el transportista conservan sus funciones.</small></span></label>
    {draft.operatorEnabled&&<><label>Habitante autorizado<select aria-label="Operador polivalente" value={selected?draft.operatorResidentId:draft.operatorResidentId?'missing':''} onChange={e=>choose('operatorResidentId',e.target.value)}>
      {draft.operatorResidentId&&!selected?<option value="missing" disabled>Habitante no disponible · Elegí otro</option>:<option value="">Elegí un habitante propio</option>}
      {choices.map(r=><option key={r.residentId} value={r.residentId}>{r.name}{r.available?'':` · ${r.reason??'No disponible'}`}</option>)}
    </select></label>
    {selected&&<p className="pm-note"><Users size={14}/>{selected.currentJob?`Puesto actual: ${jobs[selected.currentJob]}.`:'Actualmente sin puesto industrial.'} No se trasladará al cambiar esta selección; primero revisá y confirmá el turno.</p>}
    {selected&&!selected.available&&<p className="pm-warning" role="status"><CircleHelp size={14}/>{selected.reason??'El habitante debe terminar sus tareas antes de autorizarlo.'}</p>}
    <div className="pm-operator-permissions" role="group" aria-label="Trabajos permitidos al operador">
      <label className="pm-policy-choice"><input type="checkbox" aria-label="Permitir puesto forestal" checked={draft.operatorWoodlot} onChange={e=>choose('operatorWoodlot',e.target.checked)}/><span>Trabajar en el puesto forestal elegido</span></label>
      <label className="pm-policy-choice"><input type="checkbox" aria-label="Permitir aserradero" checked={draft.operatorSawmill} onChange={e=>choose('operatorSawmill',e.target.checked)}/><span>Trabajar en el aserradero elegido</span></label>
    </div>
    <label>Puesto preferido<select aria-label="Puesto preferido del operador" value={draft.operatorPreferredJob} onChange={e=>choose('operatorPreferredJob',e.target.value)}><option value="woodlot">Puesto forestal</option><option value="sawmill">Aserradero</option></select></label>
    <p className="pm-note"><Footprints size={14}/><span>Elegí al menos un trabajo y su instalación. La preferencia debe estar permitida; sólo desempata tareas equivalentes. Un puesto ocupado por otro habitante conserva a ese trabajador.</span></p>
    <p>Camina antes de producir y espera a que termine la entrega anterior. El traslado ocupa una de las ranuras del turno. Al pausar o vencer el plazo, vuelve a su puesto o punto original y queda reservado hasta llegar. No inicia trabajos nuevos fuera de los límites.</p></>}
  </fieldset>;
}

export function ManagerOperatorPanel({plan,onFacility}:{plan:Plan;onFacility(id:string):void}){
  const operator=plan.operatorState,config=plan.operator;if(!config&&!operator)return null;
  const phase={idle:'Disponible para el siguiente trabajo',relocating:'Caminando al puesto autorizado',supplying:'Recogiendo insumos del trabajo',working:'Trabajando en el puesto',waiting:'Esperando la entrega y el regreso',returning:'Regresando a su puesto o punto original',blocked:'Esperando un acceso seguro',released:'Turno cerrado · Habitante liberado'};
  return <section className="pm-courier pm-operator" aria-label="Estado del operador polivalente"><strong><ArrowRightLeft size={15}/>{operator?.name??'Operador autorizado'}</strong>
    {config&&<p>Permisos: {config.allowedJobs.map(job=>jobs[job]).join(' · ')}. Preferencia: {jobs[config.preferredJob]}.</p>}
    {operator&&<><p className="pm-operator-phase" role="status">{phase[operator.phase]}</p><p>{operator.reason}</p><p className="pm-note">{operator.reserved?'Reservado para este turno y su regreso.':'Habitante disponible para otras asignaciones.'}</p>
    {operator.occupancy&&<dl className="pm-stats" aria-label="Ocupación real del operador"><div><dt>Trabajo</dt><dd>{duration(operator.occupancy.workSeconds)}</dd></div><div><dt>Desplazamiento</dt><dd>{duration(operator.occupancy.travelSeconds)}</dd></div><div><dt>Espera durante la reserva</dt><dd>{duration(operator.occupancy.waitingSeconds)}</dd></div></dl>}
    {operator.currentBuildingId&&<button type="button" className="pm-link" onClick={()=>onFacility(operator.currentBuildingId!)}>Ver puesto actual</button>}
    {operator.targetBuildingId&&operator.targetBuildingId!==operator.currentBuildingId&&<button type="button" className="pm-link" onClick={()=>onFacility(operator.targetBuildingId!)}>Ver puesto de destino</button>}
    </>}
  </section>;
}
