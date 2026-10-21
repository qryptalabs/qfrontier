'use client';
import type {ReactNode} from 'react';
import {ArrowRight,CheckCircle2,Footprints,Hammer,MapPin,Package,Route,Sprout,Users,Warehouse} from 'lucide-react';
import {habitableWorkerAt,type HabitableBuilding,type HabitableState,type HabitableWorkerPhase} from '../lib/mvp/habitable-data';
import type {MvpView,PublicPlayer} from '../lib/mvp/view';
import './habitable-network.css';

interface NetworkProps {
  view:MvpView;player:PublicPlayer;state:HabitableState;clock:number;busy:boolean;selectedId?:string;
  onSelect(id:string):void;onFacility(id:string):void;onResidents():void;onLand():void;onBuild(shedId:string):void;
  manager?:ReactNode;
}
const phaseLabels:Record<HabitableWorkerPhase,string>={working:'Trabajando',collecting:'Recogiendo productos',carrying:'Transportando la producción',unloading:'Descargando',returning:'Regresando',waiting:'Esperando una entrega',idle:'Disponible',to_storage:'Caminando al cobertizo',loading:'Recogiendo materiales',supplying:'Llevando materiales al puesto',receiving:'Descargando materiales',relocating:'Cambiando de puesto'};
const point=(p:{x:number;y:number})=>`X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)}`;
const routeLabels={planned:'Traslado programado',active:'Traslado en curso',waiting:'Esperando',connected:'Paso conectado',blocked:'Paso bloqueado',completed:'Traslado completado'};
const routeKinds={input:'Suministro al puesto',output:'Entrega de producción',construction:'Abastecimiento de obra',connection:'Conexión al cobertizo'};
const time=(value:number)=>value<60?`${Math.ceil(value)} s`:`${Math.floor(value/60)} min${Math.ceil(value%60)?` ${Math.ceil(value%60)} s`:''}`;

export default function HabitableNetwork({view,state,clock,busy,selectedId,onSelect,onFacility,onResidents,onLand,onBuild,manager}:NetworkProps){
  const facilities=view.habitable.facilities,selected=facilities.find(b=>b.buildingId===selectedId)??facilities[0];
  const network=view.habitable.network;
  const building=state.buildings.find(b=>b.id===selected?.buildingId);
  const workers=(state.workers??[]).map(worker=>({worker,pose:habitableWorkerAt(worker,clock)}));
  const connectedWorkers=workers.filter(({worker})=>worker.buildingId===selected?.buildingId||worker.supply?.sourceBuildingId===selected?.buildingId||worker.shipment?.destinationBuildingId===selected?.buildingId||worker.crew?.kind==='construction'&&state.buildings.find(b=>b.id===worker.buildingId)?.constructionVisual?.sourceBuildingId===selected?.buildingId);
  const count=(id:string)=>state.buildings.filter(b=>b.templateId===id&&b.endsAt<=clock).length;
  const issues=network.nodes.filter(node=>node.blockedReason);
  const routes=network.edges.filter(edge=>edge.fromBuildingId===selected?.buildingId||edge.toBuildingId===selected?.buildingId);
  const labelFor=(id:string)=>{const facility=facilities.find(f=>f.buildingId===id),b=state.buildings.find(b=>b.id===id);return facility?`${facility.label}${b?` (${b.x.toFixed(1)}, ${b.y.toFixed(1)})`:''}`:'Instalación';};
  return <section className="h-card hn-panel" aria-label="Circuito de producción de la aldea"><div className="h-card-head"><h2><Route/>Tu circuito</h2><span>{workers.filter(w=>w.pose.walking||w.pose.working).length} trabajando</span></div><div className="h-card-body">
    <p>Seguí los alimentos, los materiales y a las personas que conectan tus construcciones. Seleccionar una instalación resalta su ruta en el mapa.</p>
    <div className="hn-facts" aria-label="Colores de las rutas"><span style={{borderColor:'#87c8bb88'}}>Cian · Insumos</span><span style={{borderColor:'#e5cb7988'}}>Dorado · Productos</span><span style={{borderColor:'#d9a87688'}}>Ámbar · Obra</span></div>
    <div className="hn-circuit" aria-label="Etapas del circuito"><div className="hn-node"><Sprout/><span><strong>Bancal</strong><small>{count('planter')} para cultivar</small></span></div><div className="hn-node"><Warehouse/><span><strong>Cobertizo</strong><small>{count('shed')} para abastecer</small></span></div><div className="hn-node"><Hammer/><span><strong>Mesa</strong><small>{count('workbench')} para fabricar</small></span></div><div className="hn-node"><Package/><span><strong>Construcción</strong><small>{state.buildings.filter(b=>b.endsAt>clock).length} obras en curso</small></span></div></div>
    <p className="hn-note">El grano del bancal sirve para preparar raciones en la mesa. Los tablones, tejidos y demás materiales del cobertizo abastecen las obras. Las raciones sostienen la jornada de los habitantes.</p>
    <div className="hn-facts"><span>{state.workforce?.residents.length??0} habitantes registrados</span><span>{issues.length} entregas o pedidos en espera</span></div>
    {manager}
    {facilities.length===0?<><p>Construí primero un cobertizo, un bancal y una mesa. Guardá los insumos en el cobertizo para que sus habitantes puedan recogerlos.</p><button className="h-button full" onClick={()=>onBuild('')}><Hammer/>Elegir la primera construcción<ArrowRight/></button></>:<>
      <div aria-label="Instalaciones del circuito">{facilities.map(f=>{const b=state.buildings.find(b=>b.id===f.buildingId),label=!f.ready?'Obra en curso':f.logistics?.blockedReason??f.industry?.order?.blockedReason??(f.storage?`${f.storage.used} / ${f.storage.capacity} unidades almacenadas`:f.supplies&&!['consumed','cancelled'].includes(f.supplies.status)?'Recibiendo insumos':f.operation&&['reserved','running'].includes(f.operation.status)?'Produciendo':'Instalación disponible');return <button type="button" className="hn-place" key={f.buildingId} aria-pressed={f.buildingId===selected?.buildingId} onClick={()=>onSelect(f.buildingId)}>{f.templateId==='shed'?<Warehouse size={17}/>:f.templateId==='planter'?<Sprout size={17}/>:<Hammer size={17}/>}<span><strong>{f.label}</strong><small>{label}{b&&<> · {point(b)}</>}</small></span><ArrowRight size={14}/></button>;})}</div>
      {selected&&building&&<section className="hn-detail" aria-label="Detalle de la conexión seleccionada"><h3><MapPin size={16}/>{selected.label}</h3><p>{point(building)}{selected.access&&<> · Entrada {point(selected.access)}</>}</p>
        <ConstructionProgress building={building} clock={clock}/>
        <section aria-label="Rutas de esta instalación"><h3><Route size={16}/>Entradas y salidas</h3>{routes.length?routes.map(edge=><article className={`hn-route ${edge.status==='blocked'?'blocked':''}`} key={edge.id}><strong>{routeKinds[edge.kind]} · {routeLabels[edge.status]}</strong><p>{labelFor(edge.fromBuildingId)} → {labelFor(edge.toBuildingId)}</p>{edge.points.length>1&&<div className="hn-facts"><span>{edge.points.slice(1).reduce((distance,p,index)=>distance+Math.hypot(p.x-edge.points[index].x,p.y-edge.points[index].y),0).toFixed(1)} m de recorrido</span><span>{Math.round(edge.roadCoverage*100)}% por caminos propios</span></div>}{edge.cargoUnits>0&&<p>{edge.cargoUnits} {edge.cargoUnits===1?'unidad en el lote':'unidades en el lote'}</p>}{edge.endsAt!==null&&edge.endsAt>clock&&<p>Tramo previsto: {time((edge.endsAt-clock)/1000)} restantes.</p>}{edge.blockedReason&&<p className="hn-note" role="status">{edge.blockedReason}</p>}</article>):<p>No hay una conexión disponible. Construí un cobertizo terminado y conservá un paso libre entre sus entradas.</p>}</section>
        {selected.storage&&<div className="hn-facts"><span>{selected.storage.free} espacios disponibles</span><span>{selected.storage.reserved} unidades reservadas</span></div>}
        {selected.logistics?.blockedReason&&<p className="hn-note" role="status">{selected.logistics.blockedReason}</p>}
        <div aria-label="Habitantes de esta conexión"><h3><Footprints size={16}/>Trabajo y transporte</h3>{connectedWorkers.length?connectedWorkers.map(({worker,pose})=><div className="hn-worker" key={worker.id}><strong>{view.habitable.residents.residents.find(r=>r.id===worker.id)?.name??(worker.role==='builder'?'Cuadrilla de construcción':'Habitante del puesto')}</strong><span>{worker.crew?.kind==='construction'&&pose.state==='relocating'?'Caminando por los materiales':phaseLabels[pose.state]} · {point(pose)}{pose.carrying&&pose.cargoUnits>0&&` · ${pose.cargoUnits} ${pose.cargoUnits===1?'unidad en la carga':'unidades en la carga'}`}</span>{worker.blockedReason&&<p className="hn-note">{worker.blockedReason}</p>}</div>):<p>No hay un traslado en curso para esta instalación. Organizá sus habitantes e iniciá un trabajo desde Producción.</p>}</div>
        <div className="hn-actions"><button className="h-button" onClick={()=>onFacility(selected.buildingId)}><Package size={14}/>Abrir instalación</button>{selected.templateId==='shed'&&selected.ready&&<button className="h-button secondary" disabled={busy} onClick={()=>onBuild(selected.buildingId)}><Hammer size={14}/>Abastecer una obra</button>}</div>
      </section>}
    </>}
    <div className="hn-actions"><button className="h-button secondary" onClick={onResidents}><Users size={14}/>Habitantes</button><button className="h-button secondary" onClick={onLand}><Route size={14}/>Caminos y puentes</button></div>
    <p><CheckCircle2 size={12}/> La producción y las entregas conservan sus horarios al salir. El mantenimiento corresponde a la jornada que confirmás.</p>
  </div></section>;
}

export function ConstructionProgress({building,clock}:{building:HabitableBuilding;clock:number}){
  const schedule=building.constructionVisual;if(!schedule)return null;
  const finished=clock>=building.endsAt,returning=finished&&clock<schedule.crew.endsAt;
  if(finished&&!returning)return null;
  const worker=schedule.crew.legs.find(leg=>leg.startsAt<=clock&&clock<leg.endsAt),work=Math.max(0,Math.min(1,(clock-building.startsAt)/Math.max(1,building.endsAt-building.startsAt)));
  const stage=returning?'Regreso del constructor':clock<building.startsAt?'Abastecimiento de materiales':work<.2?'Preparación de la obra':work<.8?'Levantando la estructura':'Acabados';
  return <div className="hn-route" aria-label="Avance de la obra abastecida"><strong>{stage}</strong><p>{clock<building.startsAt?'La estructura comenzará cuando se descarguen los materiales.':returning?'La construcción está lista; su habitante termina el regreso antes de aceptar otro puesto.':'Los materiales descargados se utilizan en esta construcción.'}</p><div className="hn-stage">{['Abastecer','Preparar','Estructura','Acabar','Regresar'].map((name,index)=><span key={name} className={(returning?index===4:clock<building.startsAt?index===0:work<.2?index===1:work<.8?index===2:index===3)?'active':''}>{name}</span>)}</div><div className="hn-meter" role="progressbar" aria-label="Progreso de construcción" aria-valuenow={Math.round(work*100)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${work*100}%`}}/></div><p>{time(Math.max(0,((returning?schedule.crew.endsAt:building.endsAt)-clock)/1000))} restantes{worker?.cargoUnits?` · ${worker.cargoUnits} unidades transportadas`:''}.</p></div>;
}
