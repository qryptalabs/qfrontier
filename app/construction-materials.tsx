'use client';
import {Package,Users,Warehouse} from 'lucide-react';
import type {HabitableState,HabitableTemplate} from '../lib/mvp/habitable-data';
import type {HabitableResidentsView} from '../lib/mvp/habitable-residents';
import './habitable-network.css';

export interface ConstructionMaterialsProps {
  state:HabitableState;template:HabitableTemplate;clock:number;busy:boolean;
  sourceId:string;onSource(id:string):void;residentId:string;onResident(id:string):void;
  residents:HabitableResidentsView;onResidents():void;
}
export default function ConstructionMaterials({state,template,clock,busy,sourceId,onSource,residentId,onResident,residents,onResidents}:ConstructionMaterialsProps){
  const sheds=state.buildings.filter(b=>b.templateId==='shed'&&b.endsAt<=clock&&!b.demolition);
  const source=sheds.find(b=>b.id===sourceId);
  const idle=residents.residents.filter(r=>!r.busy&&!r.assignmentBuildingId);
  const sourceMissing=!!sourceId&&!source,residentMissing=!!residentId&&!idle.some(r=>r.id===residentId);
  return <section className="hn-materials" aria-label="Abastecimiento de la construcción"><h3><Warehouse size={16}/>Materiales y constructor</h3>
    <label>Origen de los materiales<select aria-label="Origen de materiales de la obra" disabled={busy} value={sourceMissing?'missing':source?.id??'station'} onChange={event=>onSource(event.target.value==='station'?'':event.target.value)}>{sourceMissing&&<option value="missing" disabled>Origen no disponible · Elegí otro</option>}<option value="station">Inventario de la Estación</option>{sheds.map((shed,index)=><option key={shed.id} value={shed.id}>Cobertizo {index+1} · X {shed.x.toFixed(1)}, Y {shed.y.toFixed(1)}</option>)}</select></label>
    {sourceMissing&&<p className="hn-note" role="status">El cobertizo seleccionado ya no está disponible. Elegí otro origen para continuar; la revisión permanece bloqueada.</p>}
    {source?<><p><Package size={12}/> Los materiales se reservan en este cobertizo. El constructor los recoge, los lleva hasta la obra y descarga antes de empezar los {template.seconds} s de trabajo.</p>
      {residents.initialized?<><label>Habitante constructor<select aria-label="Constructor de la obra" disabled={busy||!idle.length} value={residentMissing?'missing':residentId||idle[0]?.id||''} onChange={event=>onResident(event.target.value)}>{residentMissing?<option value="missing" disabled>Constructor no disponible · Elegí otro</option>:!idle.length&&<option value="">Sin habitantes libres</option>}{idle.map(r=><option key={r.id} value={r.id}>{r.name} · Disponible</option>)}</select></label>{residentMissing&&<p className="hn-note" role="status">La persona elegida ya tiene otra ocupación o dejó de estar disponible. Seleccioná un constructor libre.</p>}{!idle.length&&<p className="hn-note">Terminá las entregas y dejá un habitante sin puesto desde Habitantes. Su tiempo se reserva hasta regresar.</p>}</>:<p>Una cuadrilla del distrito hará este traslado. Desde Habitantes podés registrar y organizar tu comunidad.</p>}
      <button type="button" className="h-button secondary small full" disabled={busy} onClick={onResidents}><Users size={14}/>Organizar habitantes</button>
      <p>La revisión comprueba los lotes, su caducidad y una ruta segura por los caminos y puentes disponibles. Los materiales mantienen su origen y vinculación.</p>
    </>:<p>El inventario de Estación permite levantar tus primeras instalaciones. Con un cobertizo terminado podés abastecer las siguientes obras mediante un traslado visible.</p>}
  </section>;
}
