'use client';
import {ClipboardCheck,Route,Warehouse} from 'lucide-react';
import type {HabitablePoint,HabitableTemplate} from '../lib/mvp/habitable-data';

interface Props {
  planId:string|null;planSourceId:string|null;sourceId:string;queued:number;template:HabitableTemplate;
  point?:HabitablePoint;busy:boolean;invalidReason:string|null;
  onConfigure():void;onSource(id:string):void;onReview():void;
}

export default function ManagerBuildApproval({planId,planSourceId,sourceId,queued,template,point,busy,invalidReason,onConfigure,onSource,onReview}:Props){
  if(!['shed','workbench','planter','house'].includes(template.id))return null;
  const sourceMatches=!!planSourceId&&sourceId===planSourceId;
  const reason=!planId?'Configurá primero el encargado desde Circuito.':!sourceMatches?'Elegí el mismo cobertizo que abastece el turno del encargado.':queued>=4?'Ya hay cuatro planos pendientes. Retirá uno o esperá a que empiece una obra.':invalidReason??(!point?'Ubicá el plano en un espacio válido.':null);
  return <section className="hn-materials" aria-label="Obra aprobada para el encargado"><h3><ClipboardCheck size={16}/>Dejar esta obra al encargado</h3>
    <p>Aprobás este plano y su ubicación para que el encargado lo inicie cuando tenga materiales y un constructor libre. Puede preparar tablones y tejido; la piedra y los demás insumos deben estar en el cobertizo.</p>
    <p>La aprobación guarda el plano. Si autorizaste reservas por obra, se apartan los materiales disponibles del cobertizo para este destino; podés consultar lo reservado y lo que falta en Circuito. Al comenzar la obra, sus materiales y su orden cuentan dentro de los límites del turno. El encargado respeta la prioridad que elegiste.</p>
    {!planId?<button type="button" className="h-button secondary full" disabled={busy} onClick={onConfigure}><Route size={14}/>Configurar encargado</button>:!sourceMatches&&planSourceId?<button type="button" className="h-button secondary full" disabled={busy} onClick={()=>onSource(planSourceId)}><Warehouse size={14}/>Usar el cobertizo del encargado</button>:null}
    <button type="button" className="h-button secondary full" disabled={busy||!!reason} onClick={onReview}><ClipboardCheck size={14}/>Revisar aprobación del plano</button>
    {reason&&<p className="hn-note" role="status">{reason}</p>}
    <p>Podés retirar un plano pendiente desde Circuito. Pausar el encargado detiene nuevos trabajos; las obras que ya comenzaron terminan con sus recursos reservados.</p>
  </section>;
}
