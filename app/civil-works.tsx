'use client';
import {Footprints,Hammer,MoveRight,Recycle,Route,Users,Warehouse} from 'lucide-react';
import {ITEM_CATALOG} from '../lib/mvp/catalog';
import type {LandCellView,LandView} from '../lib/mvp/land-grid';
import type {ItemAmount,MvpCommand} from '../lib/mvp/types';
import './civil-works.css';

const materials=(items:readonly ItemAmount[])=>items.map(item=>`${item.qty} ${ITEM_CATALOG[item.itemId].name}`).join(' · ')||'Sin materiales';
const duration=(seconds:number)=>seconds<60?`${seconds} s`:`${Math.floor(seconds/60)} min${seconds%60?` ${seconds%60} s`:''}`;
const coords=(point:{x:number;y:number})=>`X ${point.x.toFixed(1)} · Y ${point.y.toFixed(1)}`;
function connected(cells:readonly LandCellView[]):boolean {
  if(!cells.length)return false;const remaining=new Set(cells.map(cell=>cell.id)),queue=[cells[0]];remaining.delete(cells[0].id);
  while(queue.length){const current=queue.shift()!;for(const next of cells)if(remaining.has(next.id)&&Math.abs(current.row-next.row)+Math.abs(current.col-next.col)===1){remaining.delete(next.id);queue.push(next);}}
  return remaining.size===0;
}
interface CivilProps {land:LandView;cells:LandCellView[];playerId:string;locked:boolean;act(command:MvpCommand):void|Promise<void>;onSelect(ids:string[]):void}
export function CivilWorks({land,cells,playerId,locked,act,onSelect}:CivilProps){
  const civil=land.civil;if(!civil)return <p className="hl-map-help">Actualizá la partida para consultar las obras del distrito.</p>;
  const built=new Set(civil.roads.builtCells),eligible=cells.length>0&&connected(cells)&&cells.every(cell=>!cell.protectedReason&&!cell.occupied&&cell.terrain==='grass'&&cell.status==='claimed'&&!built.has(cell.id));
  const costs=civil.roads.unitCosts.map(item=>({...item,qty:item.qty*cells.length}));
  const locateBridge=(bridge:LandView['civil']['bridges'][number])=>{const minX=Math.min(bridge.from.x,bridge.to.x),maxX=Math.max(bridge.from.x,bridge.to.x),minY=Math.min(bridge.from.y,bridge.to.y),maxY=Math.max(bridge.from.y,bridge.to.y);onSelect(land.cells.filter(cell=>cell.x>=minX-.7&&cell.x<=maxX+.7&&cell.y>=minY-.7&&cell.y<=maxY+.7).map(cell=>cell.id).slice(0,land.rules.batchLimit));};
  return <div className="hc-works" aria-label="Caminos y puentes de la aldea">
    <section className="hc-work-card"><h3><Route size={17}/>Trazar un camino</h3><p>Seleccioná hasta {land.rules.batchLimit} casillas contiguas en suelo propio, libre y seco. La cuadrilla construye cada tramo y vuelve al Centro. Los tramos terminados pasan a formar parte de las rutas del distrito.</p>
      <div className="hc-facts"><span>{civil.roads.builtCells.length} {civil.roads.builtCells.length===1?'tramo terminado':'tramos terminados'}</span><span>{civil.roads.secondsPerCell} s de trabajo por casilla</span></div>
      <p className="hc-materials">{cells.length?`${cells.length} ${cells.length===1?'casilla':'casillas'} · ${materials(costs)}`:`Por casilla: ${materials(civil.roads.unitCosts)}`}</p>
      <p className="hl-map-help">La cotización incluye los desplazamientos de la cuadrilla. Prepará primero el bosque y reclamá las casillas exteriores que todavía no sean tuyas.</p>
      <button className="h-button full" disabled={locked||!eligible} onClick={()=>void act({type:'habitat.land.road',playerId,cellIds:cells.map(cell=>cell.id)})}><Hammer/>Revisar camino{cells.length>0?` · ${duration(civil.roads.secondsPerCell*cells.length)} de trabajo`:''}</button>
      {cells.length>0&&!eligible&&<p className="hl-reason">Prepará primero las casillas desde Parcelas. El trazado necesita casillas nuevas, contiguas, propias y sin obstáculos. Los caminos existentes aparecen con una línea en el plano.</p>}
    </section>
    <section className="hc-work-card"><h3><MoveRight size={17}/>Unir las dos orillas</h3><p>El primer cruce tiene apoyos definidos para conservar el cauce. Durante la obra verás la estructura en construcción; al terminar, el puente permite el paso del personaje y de los trabajadores.</p>
      {civil.bridges.map(bridge=><article className="hc-bridge" key={bridge.id}><div className="hc-card-title"><strong>{bridge.label}</strong><span className={`hc-status ${bridge.status}`}>{{available:'Plano disponible',building:'En construcción',completed:'Abierto al paso'}[bridge.status]}</span></div><p className="hc-coordinates">{coords(bridge.from)}<MoveRight size={12}/>{coords(bridge.to)}</p><p>{materials(bridge.costs)} · {duration(bridge.seconds)} de trabajo más desplazamientos.</p><div className="hc-actions"><button className="h-button secondary small" disabled={locked} onClick={()=>locateBridge(bridge)}><Footprints/>Localizar cruce</button><button className="h-button" disabled={locked||!bridge.canStart} onClick={()=>void act({type:'habitat.land.bridge',playerId,presetId:bridge.id})}><Hammer/>{bridge.status==='completed'?'Puente terminado':'Revisar puente'}</button></div>{bridge.reason&&<p className="hl-reason" role="status">{bridge.reason}</p>}</article>)}
    </section>
  </div>;
}

export function CivilDemolition({land,playerId,locked,act,onFacility,onResidents}:{land:LandView;playerId:string;locked:boolean;act(command:MvpCommand):void|Promise<void>;onFacility(id:string):void;onResidents():void}){
  const candidates=land.civil?.demolitions??[];
  return <section className="hc-work-card" aria-label="Desmontar construcciones propias"><h3><Recycle size={17}/>Recuperar espacio</h3><p>Desmontar retira la construcción al completar el trabajo. Su historia y la experiencia ya ganada se conservan. El resultado recuperable aparece antes de confirmar.</p><p className="hl-map-help">Vaciá el almacén y terminá sus entregas, contratos y trabajos. Retirá sus asignaciones antes de desmontar. Las construcciones originales del paisaje quedan protegidas.</p>
    {candidates.length===0?<p>No tenés construcciones propias para desmontar.</p>:candidates.map(building=><article key={building.buildingId} className="hc-demolition"><strong>{building.label}</strong><p>{duration(building.seconds)} de trabajo más desplazamientos.</p><div className="hc-recovery"><span>Recuperación al regresar a Estación</span><strong>{building.recovery.length?materials(building.recovery):'Sin recuperación de materiales'}</strong></div>{building.recovery.length===0&&<p className="hl-map-help">La revisión indicará si la obra conserva materiales recuperables. Las obras antiguas sin registro de sus consumos no generan una devolución.</p>}<p className="hl-map-help">Los materiales recuperados conservan su vinculación. Reconstruir el mismo tipo de edificio después de desmontarlo no vuelve a otorgar su premio de XP.</p><div className="hc-actions"><button className="h-button secondary small" disabled={locked} onClick={()=>onFacility(building.buildingId)}><Warehouse/>Ver instalación</button><button className="h-button secondary small" disabled={locked} onClick={onResidents}><Users/>Habitantes</button></div><button className="h-button full hc-demolish-button" disabled={locked||!building.canStart} onClick={()=>void act({type:'habitat.building.demolish',playerId,buildingId:building.buildingId})}><Recycle/>Revisar desmontaje</button>{building.reason&&<p className="hl-reason" role="status">{building.reason}</p>}</article>)}
  </section>;
}

export function CivilMaintenance({land}:{land:LandView}){
  const maintenance=land.civil?.maintenance;if(!maintenance)return null;
  return <div className="hc-maintenance" aria-label="Previsión de mantenimiento"><h3><Warehouse size={16}/>Previsión de la próxima jornada</h3><div className="hc-recovery"><span>Con tu aldea actual</span><strong>{maintenance.current.rations} raciones · {maintenance.current.timber} maderas</strong></div><div className="hc-recovery"><span>Si añadís un lote de ocho tramos</span><strong>{maintenance.afterRoadBatch.rations} raciones · {maintenance.afterRoadBatch.timber} maderas</strong></div><p>{maintenance.note}</p></div>;
}
