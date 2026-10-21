'use client';
import {memo,useCallback,useState} from 'react';
import {Axe,Compass,Flag,Hammer,LandPlot,LockKeyhole,ShieldCheck,Users} from 'lucide-react';
import type {MvpCommand} from '../lib/mvp/types';
import type {MvpView,PublicPlayer} from '../lib/mvp/view';
import type {LandCellView,LandMethod,LandView} from '../lib/mvp/land-grid';
import {ITEM_CATALOG} from '../lib/mvp/catalog';
import {CivilWorks,CivilDemolition,CivilMaintenance} from './civil-works';
import './land-expansion.css';

const terrainLabels={grass:'Suelo abierto',forest:'Bosque',rock:'Roca',water:'Agua'};
const statusLabels={core:'Área consolidada',legacy:'Derecho conservado',locked:'Fuera del anillo habilitado',available:'Por explorar',explored:'Explorada',exploring:'Exploración en curso',preparing:'Preparación en curso',prepared:'Terreno preparado',claiming:'Reclamación en curso',claimed:'Reclamada'};
const symbols={grass:'·',forest:'♠',rock:'◆',water:'≈'};
const costs=(items:readonly {itemId:keyof typeof ITEM_CATALOG;qty:number}[])=>items.map(item=>`${item.qty} ${ITEM_CATALOG[item.itemId].name}`).join(' · ')||'Sin materiales';
const seconds=(value:number)=>value<60?`${Math.max(0,Math.ceil(value))} s`:`${Math.floor(value/60)} min${Math.ceil(value%60)?` ${Math.ceil(value%60)} s`:''}`;
const LandMap=memo(function LandMap({cells,selected,onToggle,disabled,roads}:{cells:LandCellView[];selected:readonly string[];onToggle(id:string):void;disabled:boolean;roads?:readonly string[]}){
  const marked=new Set(selected),builtRoads=new Set(roads??[]);
  return <div className="hl-map" role="group" aria-label="Plano de 25 por 25 casillas" onKeyDown={event=>{
    const button=event.target as HTMLButtonElement,index=Number(button.dataset.index),delta=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-25,ArrowDown:25}as Record<string,number>)[event.key];
    if(delta===undefined||!Number.isInteger(index))return;event.preventDefault();const target=Math.max(0,Math.min(cells.length-1,index+delta));event.currentTarget.querySelector<HTMLButtonElement>(`[data-index="${target}"]`)?.focus();
  }}>{cells.map((cell,index)=><button type="button" key={cell.id} data-index={index} tabIndex={cell.id===(selected[0]??'land_12_12')?0:-1} disabled={disabled} aria-pressed={marked.has(cell.id)} aria-label={`Casilla ${cell.col+1}, ${cell.row+1}: ${terrainLabels[cell.terrain]}, ${statusLabels[cell.status]}${builtRoads.has(cell.id)?', Camino terminado':''}${cell.protectedReason?`, ${cell.protectedReason}`:''}`} title={`${cell.col+1}, ${cell.row+1} · ${terrainLabels[cell.terrain]} · ${statusLabels[cell.status]}${builtRoads.has(cell.id)?' · Camino terminado':''}`} className={`hl-cell ${cell.terrain} ${cell.status}${builtRoads.has(cell.id)?' road':''}${cell.occupied?' occupied':''}${cell.protectedReason?' protected':''}${marked.has(cell.id)?' selected':''}`} onClick={()=>onToggle(cell.id)}>{cell.occupied?'▪':builtRoads.has(cell.id)?'━':symbols[cell.terrain]}</button>)}</div>;
});

export type LandPane='plots'|'works'|'demolish';
export interface LandExpansionProps {view:MvpView;player:PublicPlayer;busy:boolean;clock:number;selected:readonly string[];onSelect(ids:string[]):void;act(command:MvpCommand):void|Promise<void>;onBuild(point:{x:number;y:number}):void;onFacility?(id:string):void;onResidents?():void;pane?:LandPane;onPaneChange?(pane:LandPane):void}
export default function LandExpansion({view,player,busy,clock,selected,onSelect,act,onBuild,onFacility,onResidents,pane:controlledPane,onPaneChange}:LandExpansionProps){
  const land=view.land?.playerId===player.id?view.land:null;
  const [method,setMethod]=useState<LandMethod>('colonize'),[proof,setProof]=useState(''),[col,setCol]=useState('13'),[row,setRow]=useState('13');
  const [localPane,setLocalPane]=useState<LandPane>('plots'),pane=controlledPane??localPane;
  const setPane=(next:LandPane)=>onPaneChange?onPaneChange(next):setLocalPane(next);
  const limit=land?.rules.batchLimit??8;
  const toggle=useCallback((id:string)=>{const next=selected.includes(id)?selected.filter(value=>value!==id):selected.length<limit?[...selected,id]:[id];onSelect([...next]);},[selected,limit,onSelect]);
  if(!land)return <section className="h-card"><div className="h-card-body"><p>El plano territorial se mostrará al actualizar tu partida.</p></div></section>;
  const cells=selected.map(id=>land.cells.find(cell=>cell.id===id)).filter((cell):cell is LandCellView=>!!cell),chosen=land.methods.find(item=>item.id===method),active=land.jobs.some(job=>job.status==='running'||job.status==='reserved'),locked=busy||active||!!player.habitable?.movement&&player.habitable.movement.endsAt>clock;
  const unprotected=cells.length>0&&cells.every(cell=>!cell.protectedReason&&!cell.occupied),canExplore=unprotected&&cells.every(cell=>cell.status==='available'),canClear=unprotected&&cells.every(cell=>['core','legacy','explored'].includes(cell.status)),canClaim=unprotected&&cells.every(cell=>cell.status==='prepared');
  const selectedProof=chosen?.proofs.find(item=>item.id===proof&&item.available)??chosen?.proofs.find(item=>item.available);
  const send=(type:string,extra:Record<string,unknown>={})=>{if(!locked)void act({type,playerId:player.id,cellIds:cells.map(cell=>cell.id),...extra});};
  const coordinateValid=Number.isInteger(Number(col))&&Number.isInteger(Number(row))&&Number(col)>=1&&Number(col)<=25&&Number(row)>=1&&Number(row)<=25,coordinateId=`land_${Number(row)-1}_${Number(col)-1}`;
  return <section className="h-card hl-panel" aria-label="Terreno de tu aldea"><div className="h-card-head"><h2><LandPlot/>Tu territorio</h2><span>{land.summary.owned} casillas</span></div><div className="h-card-body">
    <p>La aldea existente conserva su área de 21 × 21. Elegí hacia dónde crecer: el Centro habilita los anillos y cada terreno requiere su preparación.</p>
    <section className="hl-center" aria-label="Centro de la aldea"><div><strong><Flag size={17}/>Centro · Nivel {land.center.level}</strong><span>Área habilitada {land.center.allowedSize} × {land.center.allowedSize} · {land.capacity.used}/{land.capacity.max} construcciones</span></div>{land.center.upgrade?<><p>{costs(land.center.upgrade.costs)} · {seconds(land.center.upgrade.seconds)}</p><button className="h-button full" disabled={locked||!land.center.upgrade.canStart} onClick={()=>void act({type:'habitat.land.center.upgrade',playerId:player.id})}><Hammer/>Revisar mejora a nivel {land.center.upgrade.targetLevel}</button>{land.center.upgrade.reason&&<p role="status">{land.center.upgrade.reason}</p>}</>:<p>El Centro ya habilita el máximo de 25 × 25. Agua, edificios y espacios protegidos conservan sus restricciones.</p>}</section>
    <nav className="hl-subviews" aria-label="Opciones del terreno">{([{id:'plots',label:'Parcelas'},{id:'works',label:'Caminos y puentes'},{id:'demolish',label:'Desmontar'}]as const).map(item=><button type="button" key={item.id} aria-pressed={pane===item.id} onClick={()=>setPane(item.id)}>{item.label}</button>)}</nav>
    {pane!=='demolish'&&<><div className="hl-legend"><span>♠ Bosque</span><span>◆ Roca</span><span>≈ Agua</span><span>▪ Ocupado</span><span>━ Camino</span><span className="hl-locked-legend"><LockKeyhole size={11}/>Anillo bloqueado</span></div>
    <LandMap cells={land.cells} selected={selected} onToggle={toggle} disabled={busy} roads={land.civil?.roads.builtCells}/>
    <p className="hl-map-help">Seleccioná hasta {limit} casillas contiguas. También podés usar las flechas del teclado o estas coordenadas. Seleccionar no cobra ni inicia trabajos.</p>
    <div className="hl-coordinate-picker"><label>Columna<input aria-label="Columna del terreno" type="number" min="1" max="25" value={col} onChange={event=>setCol(event.target.value)}/></label><label>Fila<input aria-label="Fila del terreno" type="number" min="1" max="25" value={row} onChange={event=>setRow(event.target.value)}/></label><button className="h-button secondary small" disabled={busy||!coordinateValid} onClick={()=>onSelect([coordinateId])}>Localizar</button></div>
    {pane==='works'&&<div className="hl-add-coordinate"><button className="h-button secondary small" disabled={busy||!coordinateValid||selected.length>=limit||selected.includes(coordinateId)} onClick={()=>onSelect([...selected,coordinateId])}>Agregar casilla al trazado</button></div>}
    <div className="hl-selection" aria-label="Casillas seleccionadas"><strong>{cells.length?`${cells.length} ${cells.length===1?'casilla seleccionada':'casillas seleccionadas'}`:'Elegí una casilla'}</strong>{cells.map(cell=><p key={cell.id}><b>{cell.col+1}, {cell.row+1}</b> · {terrainLabels[cell.terrain]} · {statusLabels[cell.status]}{cell.protectedReason&&<span className="hl-reason">{cell.protectedReason}</span>}</p>)}{cells.length>0&&<button className="hl-text-button" onClick={()=>onSelect([])}>Limpiar selección</button>}</div>
    </>}
    {pane==='plots'&&<><div className="hl-step-actions"><button className="h-button secondary full" disabled={locked||!canExplore} onClick={()=>send('habitat.land.explore')}><Compass/>Revisar exploración · {seconds(land.rules.exploreSeconds)} de trabajo</button><button className="h-button secondary full" disabled={locked||!canClear} onClick={()=>send('habitat.land.clear')}><Axe/>Revisar preparación · {seconds(land.rules.clearingSecondsPerCell*Math.max(1,cells.length))} de trabajo</button></div>
    <p className="hl-map-help">Preparar consume una ración por lote, también en suelo abierto. La vegetación sigue bloqueando hasta terminar el trabajo; los recursos se extraen de los yacimientos existentes.</p>
    <section className="hl-claim"><h3><Flag size={16}/>Reclamar terreno preparado</h3><label>Forma de expansión<select aria-label="Forma de expansión" value={method} disabled={locked} onChange={event=>{setMethod(event.target.value as LandMethod);setProof('');}}>{land.methods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{chosen&&<><p>{chosen.simCost>0?`${chosen.simCost} QRYP SIMULADO · `:''}{costs(chosen.costs)} · {seconds(land.rules.claimSeconds)}</p>{method==='deed'&&<p className="hl-sim-note">Sólo saldo de prueba. No conecta una billetera, no cobra tokens reales y no compra parcelas de otros jugadores.</p>}{chosen.proofs.length>0&&<label>Hazaña registrada<select aria-label="Hazaña para reclamar terreno" value={selectedProof?.id??''} disabled={locked} onChange={event=>setProof(event.target.value)}><option value="" disabled>Elegí una hazaña disponible</option>{chosen.proofs.map(item=><option key={item.id} value={item.id} disabled={!item.available}>{item.label}{!item.available?' · Ya utilizada':''}</option>)}</select></label>}<button className="h-button full" disabled={locked||!canClaim||!chosen.available||method==='achievement'&&!selectedProof} onClick={()=>send('habitat.land.claim',{method,...(selectedProof&&method==='achievement'?{proofId:selectedProof.id}:{})})}>{method==='colonize'?<Users/>:<Flag/>}Revisar reclamación</button>{chosen.reason&&<p className="hl-reason" role="status">{chosen.reason}</p>}</>}</section>
    {cells.length===1&&['core','legacy','claimed'].includes(cells[0].status)&&!cells[0].protectedReason&&!cells[0].occupied&&cells[0].terrain==='grass'&&<button className="h-button secondary full" disabled={busy} onClick={()=>onBuild({x:cells[0].x,y:cells[0].y})}><Hammer/>Usar este lugar para construir</button>}</>}
    {pane==='works'&&<CivilWorks land={land} cells={cells} playerId={player.id} locked={locked} act={act} onSelect={onSelect}/>}
    {pane==='demolish'&&<CivilDemolition land={land} playerId={player.id} locked={locked} act={act} onFacility={id=>onFacility?.(id)} onResidents={()=>onResidents?.()}/>}
    <LandJobs land={land} clock={clock}/>
    <section className="hl-maintenance"><h3><ShieldCheck size={16}/>Mantener lo que abrís</h3><p>{land.maintenance.note}</p><p>Suplemento territorial por jornada: {land.maintenance.extraRations} raciones y {land.maintenance.extraTimber} maderas. No hay cobros atrasados por estar desconectado.</p><CivilMaintenance land={land}/></section>
    <p className="hl-map-help">Las obras conservan los límites de tu parcela y sus cauces. Las terrazas especiales, las escrituras entre jugadores y las fronteras negociadas corresponden a una fase posterior.</p>
  </div></section>;
}
function LandJobs({land,clock}:{land:LandView;clock:number}){
  const jobs=land.jobs.filter(job=>job.status==='running'||job.status==='reserved');
  if(!jobs.length)return null;
  return <section className="hl-jobs" aria-label="Trabajos de terreno"><h3><Hammer size={16}/>Tu cuadrilla tiene una orden en curso</h3>{jobs.map(job=>{
    const progress=Math.max(0,Math.min(100,100*(clock-job.startsAt)/Math.max(1,job.endsAt-job.startsAt)));
    const leg=job.crew?.legs.find(phase=>phase.startsAt<=clock&&clock<phase.endsAt);
    return <div key={job.id}>
      <strong>{{explore:'Explorando',clear:'Preparando terreno',claim:'Reclamando',center:'Mejorando el Centro',road:'Construyendo camino',bridge:'Construyendo puente',demolish:'Desmontando construcción',construction:'Construyendo instalación'}[job.kind]}</strong>
      {leg&&<span>{{outbound:'Caminando hasta la obra',loading:'Recogiendo materiales',unloading:'Descargando materiales',working:'Trabajando en la obra',between:'Hacia el siguiente tramo',returning:'Regresando al Centro'}[leg.phase]}{(leg.cargoUnits??0)>0&&` · ${leg.cargoUnits} ${leg.cargoUnits===1?'unidad recuperada':'unidades recuperadas'} en camino`}</span>}
      <span>{seconds(Math.max(0,(job.endsAt-clock)/1000))}{job.cellIds.length>0&&` · ${job.cellIds.length} ${job.cellIds.length===1?'casilla':'casillas'}`}</span>
      <div className="hl-progress" role="progressbar" aria-label="Progreso del trabajo de terreno" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}><span style={{width:`${progress}%`}}/></div>
    </div>;
  })}</section>;
}
