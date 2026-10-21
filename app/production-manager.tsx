'use client';

import {useState} from 'react';
import {ArrowRight,CheckCircle2,ChevronDown,CircleHelp,ClipboardList,Clock3,Hammer,Leaf,Package,Pause,Play,Route,ShieldCheck,Sprout,Users,Warehouse,X} from 'lucide-react';
import type {HabitableManagerView,ManagerBalanceView,ManagerFacilityOption,ManagerGoalItem,ManagerShedOption} from '../lib/mvp/habitable-manager';
import type {ManagerForecast} from '../lib/mvp/habitable-manager-forecast';
import type {ItemAmount,MvpCommand} from '../lib/mvp/types';
import {ITEM_CATALOG} from '../lib/mvp/catalog';
import {useGameTimestamp} from './local-time';
import './production-manager.css';
import {ManagerIndustryControls,ManagerIndustryPolicy,ManagerTransportPanel,useManagerIndustryDraft} from './manager-industry';
import {ManagerAllocationPanel,ManagerPolicyControls,ManagerPrioritySummary,ManagerWorkReservations,useManagerPolicyDraft} from './manager-policy';
import {ManagerOperatorPanel} from './manager-operator';

export interface ProductionManagerProps {
  manager:HabitableManagerView|null|undefined;playerId:string;clock:number;busy:boolean;
  act(command:MvpCommand):void|Promise<void>;
  onFacility(id:string):void;onResidents():void;onLand():void;onBuild(shedId:string):void;
}

const goalItems:readonly ManagerGoalItem[]=['ration','plank','cloth'];
const goalNames:Record<ManagerGoalItem,string>={ration:'Raciones',plank:'Tablones',cloth:'Tejidos'};
const reserveItems=['ration','grain','seed','nutrient','plank','cloth','timber','water','biomass','fiber','stone'] as const;
type ReserveItem=typeof reserveItems[number];
const statusLabels={active:'Turno en marcha',paused:'En pausa',draining:'Terminando los trabajos y entregas',completed:'Objetivos completados',expired:'Turno finalizado'};
const approvalLabels={approved:'Plano autorizado',started:'Obra iniciada',completed:'Obra terminada',revoked:'Autorización retirada'};
const buildingNames={shed:'Cobertizo',workbench:'Mesa de trabajo',planter:'Bancal',house:'Vivienda'};
const itemName=(id:string)=>ITEM_CATALOG[id as keyof typeof ITEM_CATALOG]?.name??id;
const amounts=(items:readonly ItemAmount[])=>items.filter(item=>item.qty>0).map(item=>`${item.qty} ${itemName(item.itemId).toLocaleLowerCase('es')}`).join(' + ')||'Sin materiales';
const duration=(seconds:number)=>{const total=Math.max(0,Math.ceil(seconds));return total<60?`${total} s`:`${Math.floor(total/60)} min${total%60?` ${total%60} s`:''}`;};
const integer=(raw:string,min:number,max:number)=>raw.trim()!==''&&Number.isSafeInteger(Number(raw))&&Number(raw)>=min&&Number(raw)<=max;

/** A local draft only. Every action goes through the existing authoritative quote flow. */
export default function ProductionManager(props:ProductionManagerProps){
  if(!props.manager||props.manager.playerId!==props.playerId)return null;
  return <ManagerPanel key={props.playerId} {...props} manager={props.manager}/>;
}

function ManagerPanel({manager,playerId,clock,busy,act,onFacility,onResidents,onLand,onBuild}:ProductionManagerProps&{manager:HabitableManagerView}){
  const plan=manager.plan,timestamp=useGameTimestamp();
  const industry=useManagerIndustryDraft(manager);
  const policyDraft=useManagerPolicyDraft(plan);
  const [expanded,setExpanded]=useState(()=>plan?.status==='active'||plan?.status==='draining');
  const [shedId,setShedId]=useState(plan?.supplyShedId??manager.sheds.find(s=>s.available)?.buildingId??manager.sheds[0]?.buildingId??'');
  const [workbenchId,setWorkbenchId]=useState(plan?.workbenchId??manager.workbenches.find(b=>b.available)?.buildingId??manager.workbenches[0]?.buildingId??'');
  const [planterId,setPlanterId]=useState(plan?.planterId??'');
  const [configuration,setConfiguration]=useState<'preserve'|'new'>('preserve');
  const [goals,setGoals]=useState<Record<ManagerGoalItem,string>>(()=>({ration:String(plan?.goals.find(g=>g.itemId==='ration')?.target??5),plank:String(plan?.goals.find(g=>g.itemId==='plank')?.target??4),cloth:String(plan?.goals.find(g=>g.itemId==='cloth')?.target??2)}));
  const [replenishFarmInputs,setReplenishFarmInputs]=useState(plan?.replenishFarmInputs===true);
  const [reserves,setReserves]=useState<Record<ReserveItem,string>>(()=>Object.fromEntries(reserveItems.map(item=>[item,String(plan?.reserves?.find(row=>row.itemId===item)?.minimum??0)])) as Record<ReserveItem,string>);
  const [minutes,setMinutes]=useState('10'),[maxOrders,setMaxOrders]=useState('6'),[inputBudget,setInputBudget]=useState('24');
  const source=manager.sheds.find(s=>s.buildingId===shedId),bench=manager.workbenches.find(b=>b.buildingId===workbenchId),planter=manager.planters.find(b=>b.buildingId===planterId);
  const resuming=!!plan?.canResume&&(!manager.canStart||configuration==='preserve'),turnValid=manager.limits.durationsMinutes.some(value=>value===Number(minutes))&&integer(maxOrders,1,manager.limits.maxOrders)&&integer(inputBudget,1,manager.limits.maxInputBudget);
  const goalsValid=goalItems.every(item=>integer(goals[item],0,20))&&goalItems.some(item=>Number(goals[item])>0);
  const reservesValid=reserveItems.every(item=>integer(reserves[item],0,20));
  const selectionValid=!!source?.available&&!!bench?.available&&(!planterId||!!planter?.available);
  const canSubmit=!busy&&turnValid&&reservesValid&&industry.valid&&policyDraft.valid&&(resuming||manager.canStart&&goalsValid&&selectionValid);
  const activeTurn=plan?.status==='active'||plan?.status==='draining';
  const send=(type:string,fields:Record<string,unknown>={})=>{if(!busy)void act({type,playerId,...fields});};
  const submit=()=>{if(!canSubmit)return;const policy={replenishFarmInputs,reserves:Object.fromEntries(reserveItems.filter(item=>Number(reserves[item])>0).map(item=>[item,Number(reserves[item])])),...industry.fields,...policyDraft.fields};if(resuming&&plan)send('habitat.manager.resume',{planId:plan.id,durationMinutes:Number(minutes),maxOrders:Number(maxOrders),inputBudget:Number(inputBudget),...policy});else send('habitat.manager.start',{supplyShedId:shedId,workbenchId,...(planterId?{planterId}:{}),goals:{ration:Number(goals.ration),plank:Number(goals.plank),cloth:Number(goals.cloth)},durationMinutes:Number(minutes),maxOrders:Number(maxOrders),inputBudget:Number(inputBudget),...policy});};
  return <details className={`pm-card ${activeTurn?'is-active':''}`} open={expanded} onToggle={event=>{if(event.currentTarget.open!==expanded)setExpanded(event.currentTarget.open);}}>
    <summary><ClipboardList size={20}/><span><strong>Encargado de producción</strong><small>{plan?(plan.blockedReason&&plan.status==='active'?'En espera · conserva su turno':statusLabels[plan.status]):'Metas de stock · Un turno por confirmación'}</small></span><ChevronDown size={16} className="pm-chevron"/></summary>
    <div className="pm-body">
      <p>Autorizá un turno para que los habitantes ya asignados abastezcan sus puestos, produzcan y entreguen al cobertizo. El encargado usa los mismos trabajos y caminos de tu circuito.</p>
      {manager.commerce?.authorized&&<section className="pm-current" aria-label="Pedido comercial del encargado"><strong>Pedido del granero de Paso del Norte</strong><p>{manager.commerce.held}/2 tablones reservados · {manager.commerce.incoming} en producción o traslado · {manager.commerce.cargo} en tu carga.</p><p>{manager.commerce.reason}</p><a className="pm-link" href={'/mundo/reino?profile='+encodeURIComponent(playerId)}>Abrir tienda → Encargos y ruta</a><p>Respeta este turno, las obras y los mínimos. Los tablones reservados no se consumen para otras tareas.</p></section>}
      <ManagerPrioritySummary plan={plan}/>
      {plan&&<section className="pm-current" aria-label="Turno confirmado del encargado">
        <div className="pm-heading"><strong>{statusLabels[plan.status]}</strong><span>{plan.status==='completed'?<CheckCircle2 size={15}/>:<Clock3 size={15}/>} {activeTurn?(plan.turn.endsAt>clock?`${duration((plan.turn.endsAt-clock)/1000)} restantes`:'Confirmando cierre del turno…'):'Sin nuevas órdenes autorizadas'}</span></div>
        <dl className="pm-stats"><div><dt>Órdenes iniciadas</dt><dd>{plan.turn.startedOrders} / {plan.turn.maxOrders}</dd></div><div><dt>Materiales comprometidos</dt><dd>{plan.committedUnits} / {plan.turn.inputBudget}</dd></div><div><dt>Órdenes completadas</dt><dd>{plan.turn.completedOrders}</dd></div><div><dt>Margen del turno</dt><dd>{plan.remainingOrders} órdenes · {plan.remainingInputs} unidades</dd></div></dl>
        <p className="pm-time">Cierre autorizado: <time dateTime={new Date(plan.turn.endsAt).toISOString()}>{timestamp(plan.turn.endsAt)}</time>.</p>
        <div className="pm-goals" role="table" aria-label="Existencias objetivo del turno"><div role="row" className="pm-goal-head"><span role="columnheader">Producto</span><span role="columnheader">Stock</span><span role="columnheader">En camino</span><span role="columnheader">Meta</span></div>{plan.goals.map(goal=><div role="row" key={goal.itemId}><strong role="rowheader">{goalNames[goal.itemId]}</strong><span role="cell">{goal.stock}</span><span role="cell">{goal.inFlight}</span><span role="cell">{goal.target}</span></div>)}</div>
        <p>Las metas son existencias en este cobertizo, no unidades adicionales. Se cuentan sus entregas propias en camino para evitar repetir la producción.</p>
        <div className="pm-confirmed-policy" aria-label="Reposición y reservas autorizadas"><strong><Sprout size={14}/>Reposición de semillas y nutrientes: {plan.replenishFarmInputs?'Autorizada':'Desactivada'}</strong><p>{plan.reserves?.some(row=>row.minimum>0)?`Reservas mínimas: ${plan.reserves.filter(row=>row.minimum>0).map(row=>`${row.minimum} ${itemName(row.itemId).toLocaleLowerCase('es')}`).join(' · ')}.`:'Sin reservas mínimas configuradas.'}</p><p>Estas reservas limitan sólo el consumo automático. Las acciones manuales no cambian.</p></div>
        <ManagerIndustryPolicy plan={plan}/>
        <ManagerTransportPanel plan={plan} onFacility={onFacility}/>
        <ManagerOperatorPanel plan={plan} onFacility={onFacility}/>
        <ManagerAllocationPanel plan={plan}/>
        {plan.reserves?.some(row=>row.minimum>0)&&<details className="pm-reserve-status"><summary><ShieldCheck size={14}/>Ver existencias protegidas</summary><ul>{plan.reserves.filter(row=>row.minimum>0).map(row=><li key={row.itemId}><strong>{itemName(row.itemId)}</strong><span>Mínimo {row.minimum} · Stock {row.stock} · En camino {row.inFlight}</span><small>{row.spendable} disponibles para consumo automático{row.missing>0?` · Faltan ${row.missing} para cubrir el mínimo`:''}.</small></li>)}</ul></details>}
        {(plan.activeOrders??(plan.active?[plan.active]:[])).map((order,index)=><div className="pm-order" key={order.id}><Package size={15}/><span><strong>{plan.parallel?`Puesto ${index+1} · `:''}{order.kind==='farm'?'Cultivo en curso':order.kind==='build'?'Construcción autorizada':order.kind==='extract'?'Extracción forestal':`Fabricación de ${order.recipeId?itemName(order.recipeId).toLocaleLowerCase('es'):'productos'}`}</strong><small>{order.kind==='extract'?`Madera reservada del yacimiento: ${order.outputs.find(i=>i.itemId==='timber')?.qty??0}.`:`Materiales de esta orden: ${amounts(order.inputs)}.`}</small></span><button type="button" className="pm-link" onClick={()=>onFacility(order.buildingId)} aria-label={`Abrir instalación del trabajo ${index+1}`}><ArrowRight size={16}/></button></div>)}
        {plan.blockedReason&&<p className="pm-warning" role="status"><CircleHelp size={15}/><span>{plan.blockedReason}</span></p>}
        {plan.lastOutcome&&<p className="pm-outcome">{plan.lastOutcome}</p>}
        {plan.canPause&&<button type="button" className="h-button secondary full" disabled={busy} onClick={()=>send('habitat.manager.pause',{planId:plan.id})}><Pause size={16}/>Revisar pausa de nuevas órdenes</button>}
        {plan.status==='draining'&&<p className="pm-note">Los trabajos ya iniciados terminan sus entregas y regresos. La pausa no cancela sus materiales ni los traslados y conserva al transportista y al operador autorizados hasta su regreso.</p>}
        <button type="button" className="pm-link" onClick={()=>onFacility(plan.supplyShedId)}><Warehouse size={14}/>Abrir cobertizo del turno<ArrowRight size={12}/></button>
        {plan.approvals.length>0&&<div className="pm-plans" aria-label="Planos autorizados del encargado"><h4><Hammer size={15}/>Obras aprobadas · {plan.approvals.filter(a=>a.status==='approved').length} pendientes</h4>{plan.approvals.map(approval=><article key={approval.id}><div><strong>{buildingNames[approval.templateId]}</strong><small>{approvalLabels[approval.status]} · X {approval.x.toFixed(1)}, Y {approval.y.toFixed(1)}</small><small>{amounts(approval.costs)}</small>{plan.reserveBuildMaterials&&<ManagerWorkReservations approval={approval}/>} {approval.blockedReason&&<p className="pm-warning">{approval.blockedReason}</p>}</div>{approval.buildingId?<button type="button" className="pm-link" onClick={()=>onFacility(approval.buildingId!)} aria-label={`Abrir ${buildingNames[approval.templateId].toLocaleLowerCase('es')} autorizado`}><ArrowRight size={15}/></button>:approval.status==='approved'&&plan.canRevoke&&<button type="button" className="pm-link" disabled={busy} onClick={()=>send('habitat.manager.revoke-build',{planId:plan.id,approvalId:approval.id})} aria-label={`Revisar retirada del plano ${buildingNames[approval.templateId].toLocaleLowerCase('es')}`}><X size={15}/></button>}</article>)}</div>}
        {plan.canApprove&&<button type="button" className="h-button secondary full" disabled={busy} onClick={()=>onBuild(plan.supplyShedId)}><Hammer size={15}/>Elegir un plano para este turno</button>}
        {plan.forecast&&<details className="pm-forecast-details"><summary><ClipboardList size={14}/>Previsión del plan confirmado</summary><ManagerForecastPanel forecast={plan.forecast}/></details>}
        {plan.balance?<ManagerBalancePanel balance={plan.balance}/>:<p className="pm-note">Balance no disponible para este turno anterior. Se registrará al autorizar un nuevo turno.</p>}
      </section>}

      <form className="pm-form" onSubmit={event=>{event.preventDefault();submit();}} aria-label={resuming?'Nuevo turno del encargado':'Configurar encargado de producción'}>
        {plan?.canResume&&manager.canStart&&<fieldset className="pm-mode" disabled={busy}><legend>Plan del próximo turno</legend><label><input type="radio" name={`manager-mode-${playerId}`} checked={configuration==='preserve'} onChange={()=>setConfiguration('preserve')}/>Conservar el plan</label><label><input type="radio" name={`manager-mode-${playerId}`} checked={configuration==='new'} onChange={()=>setConfiguration('new')}/>Cambiar configuración y metas</label></fieldset>}
        <h3>{resuming?'Autorizar otro turno':'Configurar un turno'}</h3>
        {resuming?<><p>Conserva el cobertizo, los puestos y las metas del plan. Revisá un nuevo plazo y nuevos límites; no se renuevan automáticamente.</p>{!manager.canStart&&manager.reason&&<p className="pm-note">Para cambiar la configuración: {manager.reason}</p>}</>:<>
          <FacilitySelect label="Cobertizo de suministro y destino" value={shedId} options={manager.sheds} disabled={busy||!manager.canStart} onChange={setShedId}/>
          <FacilitySelect label="Mesa de producción" value={workbenchId} options={manager.workbenches} disabled={busy||!manager.canStart} onChange={setWorkbenchId}/>
          <FacilitySelect label="Bancal para reponer grano" value={planterId} options={manager.planters} disabled={busy||!manager.canStart} onChange={setPlanterId} optional/>
          {[source,bench,planter].filter((choice):choice is ManagerShedOption|ManagerFacilityOption=>!!choice&&!choice.available).map(choice=><p className="pm-warning" role="status" key={choice.buildingId}><CircleHelp size={14}/><span>{choice.reason??'Esta instalación no está disponible.'}</span></p>)}
          {((shedId&&!source)||(workbenchId&&!bench)||(planterId&&!planter))&&<p className="pm-warning" role="status">Una instalación seleccionada ya no está disponible. Elegí otra explícitamente para continuar.</p>}
          {(bench?.residentName||planter?.residentName)&&<p className="pm-note"><Users size={14}/><span>{bench?.residentName?`Mesa: ${bench.residentName}. `:''}{planter?.residentName?`Bancal: ${planter.residentName}.`:''} Conservan sus puestos y horarios.</span></p>}
          <fieldset className="pm-targets" disabled={busy||!manager.canStart}><legend>Existencias objetivo en el cobertizo</legend>{goalItems.map(item=><label key={item}>{goalNames[item]}<input aria-label={`Meta de ${goalNames[item].toLocaleLowerCase('es')}`} type="number" inputMode="numeric" min={0} max={20} step={1} value={goals[item]} onChange={event=>setGoals(current=>({...current,[item]:event.target.value}))}/></label>)}</fieldset>
          <p>Entre 0 y 20 por producto. Una meta en cero deja ese producto fuera del turno. Debe haber al menos una meta positiva.</p>
          {source&&<p className="pm-stock"><Warehouse size={14}/><span>Existencias vigentes de este cobertizo: {amounts(source.stock)}. {source.free} espacios libres; {source.reserved} reservados.</span></p>}
        </>}
        <fieldset className="pm-replenishment" disabled={busy||activeTurn}><legend>Abastecimiento automático del próximo turno</legend><label><input type="checkbox" aria-label="Reponer semillas y nutrientes" checked={replenishFarmInputs} onChange={event=>setReplenishFarmInputs(event.target.checked)}/><span><strong>Reponer semillas y nutrientes</strong><small>Preparar los insumos de una cosecha necesaria para reponer raciones, usando materiales reales del cobertizo.</small></span></label><p>Requiere las recetas desbloqueadas, habitantes, capacidad y rutas disponibles. Cada reposición cuenta como una orden y compromete insumos dentro del mismo presupuesto.</p></fieldset>
        <details className="pm-reserve-fields"><summary><ShieldCheck size={14}/>Reservas mínimas del encargado · {reserveItems.filter(item=>Number(reserves[item])>0).length} productos protegidos</summary><p>El encargado no usará existencias por debajo de estos mínimos en el cobertizo. Son límites de consumo automático, no apartados de inventario. Para raciones, tablones y tejidos, el mínimo también eleva la existencia objetivo; los demás no autorizan extracción ni compras. Las semillas y nutrientes se preparan sólo para una cosecha necesaria si autorizás la reposición.</p><fieldset disabled={busy||activeTurn}><legend>Unidades mínimas por producto</legend><div>{reserveItems.map(item=><label key={item}>{itemName(item)}<input aria-label={`Reserva mínima de ${itemName(item).toLocaleLowerCase('es')}`} type="number" inputMode="numeric" min={0} max={20} step={1} value={reserves[item]} onChange={event=>setReserves(current=>({...current,[item]:event.target.value}))}/></label>)}</div></fieldset><p>Enteros de 0 a 20. Cero no protege unidades de ese producto. Las acciones manuales conservan sus requisitos actuales.</p></details>
        <ManagerIndustryControls manager={manager} draft={industry.draft} setDraft={industry.setDraft} disabled={busy||activeTurn} onResidents={onResidents}/>
        <ManagerPolicyControls draft={policyDraft.draft} setDraft={policyDraft.setDraft} disabled={busy||activeTurn}/>
        {!activeTurn&&!industry.valid&&<p className="pm-warning" role="status">Revisá las instalaciones, el yacimiento, los permisos del operador y el transportista elegidos. Cada habitante debe estar disponible para su función; el transportista requiere estar sin puesto.</p>}
        <div className="pm-limits"><label>Duración del turno<select aria-label="Duración del turno del encargado" value={minutes} disabled={busy||activeTurn} onChange={event=>setMinutes(event.target.value)}>{manager.limits.durationsMinutes.map(value=><option value={value} key={value}>{value} minutos</option>)}</select></label><label>Máximo de órdenes<input aria-label="Máximo de órdenes del encargado" type="number" inputMode="numeric" min={1} max={manager.limits.maxOrders} step={1} value={maxOrders} disabled={busy||activeTurn} onChange={event=>setMaxOrders(event.target.value)}/></label><label>Tope de materiales comprometidos<input aria-label="Tope de materiales comprometidos" type="number" inputMode="numeric" min={1} max={manager.limits.maxInputBudget} step={1} value={inputBudget} disabled={busy||activeTurn} onChange={event=>setInputBudget(event.target.value)}/></label></div>
        <p className="pm-note"><ShieldCheck size={14}/><span>El tope suma insumos comprometidos y madera reservada para extraer. Ambos puestos comparten ese presupuesto y el máximo de órdenes; no se reserva todo el turno de antemano. La extracción conserva su propio límite autorizado y las cuotas del yacimiento.</span></p>
        {manager.recipes.length>0&&<details className="pm-costs"><summary><Package size={14}/>Ver costes por ciclo</summary><ul>{manager.recipes.map(recipe=><li key={recipe.id}><strong>{recipe.label}</strong><span>{amounts(recipe.inputs)} <ArrowRight size={12}/> {amounts(recipe.outputs)}</span><small>{duration(recipe.seconds)} de trabajo, más suministro, entrega y regreso.</small></li>)}</ul><p>Son costes por orden, no una compra total garantizada. La revisión confirma los requisitos y límites vigentes.</p></details>}
        {!turnValid&&<p className="pm-warning" role="status">Elegí un turno de {manager.limits.durationsMinutes.join(' o ')} minutos, entre 1 y {manager.limits.maxOrders} órdenes y entre 1 y {manager.limits.maxInputBudget} unidades de material.</p>}
        {!resuming&&!goalsValid&&<p className="pm-warning" role="status">Las metas deben ser enteras de 0 a 20 y al menos una debe ser mayor que cero.</p>}
        {!reservesValid&&<p className="pm-warning" role="status">Las reservas mínimas deben ser enteras de 0 a 20.</p>}
        <p className="pm-note">La revisión muestra una previsión con esta configuración. No garantiza completar todas las metas: el stock, la comida, las cuotas y los caminos pueden cambiar.</p>
        <button type="submit" className="h-button full" disabled={!canSubmit}><Play size={16}/>{resuming?'Revisar nuevo turno':'Revisar inicio del encargado'}</button>
        {!resuming&&manager.reason&&<p className="pm-warning" role="status"><CircleHelp size={14}/><span>{manager.reason}</span></p>}
      </form>
      {manager.nextChangeAt!==null&&manager.nextChangeAt>clock&&<p className="pm-time"><Clock3 size={13}/>Próximo cambio previsto: <time dateTime={new Date(manager.nextChangeAt).toISOString()}>{timestamp(manager.nextChangeAt)}</time> · {duration((manager.nextChangeAt-clock)/1000)}.</p>}
      {manager.warnings.length>0&&<ul className="pm-warnings" aria-label="Avisos del circuito">{manager.warnings.map((warning,index)=><li key={`${index}:${warning}`}><CircleHelp size={14}/><span>{warning}</span></li>)}</ul>}
      <div className="pm-actions"><button type="button" className="h-button secondary small" onClick={onResidents}><Users size={14}/>Habitantes y jornada</button><button type="button" className="h-button secondary small" onClick={onLand}><Route size={14}/>Revisar caminos</button></div>
      <p className="pm-note"><Leaf size={14}/><span>No renueva la comida. Sólo cambia los puestos industriales del operador que autorices expresamente. Deja de iniciar un producto cuando su meta está cubierta; el turno puede reponerlo si cambia el stock, hasta alcanzar su plazo o límites. Las tareas ya iniciadas conservan su recorrido y sus horarios.</span></p>
    </div>
  </details>;
}

function FacilitySelect({label,value,options,disabled,onChange,optional=false}:{label:string;value:string;options:readonly (ManagerShedOption|ManagerFacilityOption)[];disabled:boolean;onChange(value:string):void;optional?:boolean}){
  const present=options.some(option=>option.buildingId===value),missing=!!value&&!present;
  return <label>{label}<select aria-label={label} value={missing?'missing':value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{missing?<option value="missing" disabled>Selección no disponible · Elegí otra</option>:<option value="">{optional?'Sin bancal · Usar grano existente':'Elegí una instalación'}</option>}{missing&&optional&&<option value="">Sin bancal · Usar grano existente</option>}{options.map(option=><option key={option.buildingId} value={option.buildingId}>{option.label}{option.available?'':' · No disponible'}</option>)}</select></label>;
}

/** Shared by the confirmed plan and the review dialog; it does not simulate or dispatch. */
export function ManagerForecastPanel({forecast}:{forecast:ManagerForecast}){
  const timestamp=useGameTimestamp();
  const status={conditional:'Previsión condicionada',blocked:'Previsión bloqueada',satisfied:'Metas cubiertas con este stock'}[forecast.status];
  return <section className="pm-forecast" aria-label="Previsión condicionada del encargado"><div className="pm-heading"><h3><ClipboardList size={16}/>Previsión del turno</h3><span>{status}</span></div><p>Calculada con los recursos y límites observados. Es una estimación; no reserva estas órdenes ni garantiza sus entregas.</p>
    <dl className="pm-stats"><div><dt>Órdenes previstas</dt><dd>{forecast.projectedOrders}</dd></div><div><dt>Trabajo acumulado previsto</dt><dd>{duration(forecast.workSeconds)}</dd></div></dl>
    <div className="pm-forecast-flow"><article><h4>Insumos comprometidos por etapas</h4><p>{amounts(forecast.inputs)}</p></article><article><h4>Producción prevista</h4><p>{amounts(forecast.outputs)}</p></article></div>
    <p className="pm-note">Incluye intermedios que pueden usarse en órdenes siguientes; no es stock final ni compra inicial.{!!forecast.extractionUnits&&` Además, prevé reservar ${forecast.extractionUnits} unidades de madera del yacimiento autorizado: cuentan en el presupuesto común, pero no son consumo del cobertizo.`}</p>
    <p className="pm-note">El tiempo suma el trabajo de todos los puestos, incluso si coinciden en paralelo. No incluye suministro, desplazamientos, colas ni regreso; no es una hora de finalización.</p>
    <dl className="pm-forecast-facts"><div><dt>Margen del turno considerado</dt><dd>{forecast.remaining.orders} órdenes · {forecast.remaining.inputs} unidades de insumo · {duration(forecast.remaining.seconds)}</dd></div><div><dt>Capacidad del cobertizo</dt><dd>{forecast.capacity.used} ocupados · {forecast.capacity.reserved} reservados · {forecast.capacity.free} libres / {forecast.capacity.capacity}</dd></div><div><dt>Cuotas agrícolas consideradas</dt><dd>Parcela: {forecast.farm.playerCycles} ciclos · Región: {forecast.farm.regionCycles} ciclos</dd></div></dl>
    {forecast.checks.length>0&&<ul className="pm-forecast-checks" aria-label="Condiciones de la previsión">{forecast.checks.map(check=><li key={check.id} className={check.available?'available':'blocked'}>{check.available?<CheckCircle2 size={14}/>:<CircleHelp size={14}/>}<span><strong>{check.label}</strong>{check.reason&&<small>{check.reason}</small>}</span></li>)}</ul>}
    {forecast.warnings.length>0&&<ul className="pm-warnings" aria-label="Advertencias de la previsión">{forecast.warnings.map((warning,index)=><li key={`${index}:${warning}`}><CircleHelp size={14}/><span>{warning}</span></li>)}</ul>}
    <p className="pm-time">Evaluada: <time dateTime={new Date(forecast.evaluatedAt).toISOString()}>{timestamp(forecast.evaluatedAt)}</time>.</p>
  </section>;
}

function ManagerBalancePanel({balance}:{balance:ManagerBalanceView}){
  const timestamp=useGameTimestamp(),rows=balance.rows.filter(row=>row.opening!==0||row.committed!==0||row.produced!==0||row.delivered!==0||row.expired!==0||row.closing!==0||row.externalAdjustment!==0);
  return <details className="pm-balance"><summary><Package size={14}/>Balance del turno · {balance.finishedAt===null?'En seguimiento':'Cerrado'}</summary><p>Desde <time dateTime={new Date(balance.startsAt).toISOString()}>{timestamp(balance.startsAt)}</time>. {balance.finishedAt===null?'Última observación':'Cierre'}: <time dateTime={new Date(balance.finishedAt??balance.observedAt).toISOString()}>{timestamp(balance.finishedAt??balance.observedAt)}</time>.</p>
    {rows.length>0?<div className="pm-balance-grid">{rows.map(row=><article key={row.itemId} aria-label={`Balance de ${itemName(row.itemId).toLocaleLowerCase('es')}`}><h4>{itemName(row.itemId)}</h4><dl><div><dt>Stock al inicio</dt><dd>{row.opening}</dd></div><div><dt>Material comprometido</dt><dd>{row.committed}</dd></div><div><dt>Producido</dt><dd>{row.produced}</dd></div><div><dt>Entregado al cobertizo</dt><dd>{row.delivered}</dd></div><div><dt>Caducado</dt><dd>{row.expired}</dd></div><div><dt>Ajuste externo</dt><dd>{row.externalAdjustment>0?`+${row.externalAdjustment}`:row.externalAdjustment}</dd></div><div className="pm-balance-close"><dt>{balance.finishedAt===null?'Stock observado':'Stock al cierre'}</dt><dd>{row.closing}</dd></div></dl></article>)}</div>:<p>No hay movimientos confirmados para este turno.</p>}
    <p>Producido y entregado son etapas de las mismas unidades; no se suman. Los cambios externos de stock no se muestran como producción del encargado.</p><p className="pm-note">{balance.note}</p>
  </details>;
}
