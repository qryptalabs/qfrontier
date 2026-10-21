"use client";
import type {useRoyalKingdom} from './use-royal-kingdom';
type Kingdom=ReturnType<typeof useRoyalKingdom>;
export function RoyalKingdomPanel({kingdom:k,playerId,ready,resume,preview,route}:{kingdom:Kingdom;playerId:string;ready:boolean;resume:()=>void;preview:()=>void;route:(target:'reception'|'throne'|'gate')=>void}){
 const d=k.data,c=d?.contract,disabled=k.busy||k.pending,go=(t:string)=>()=>void k.act(t);
 return <section className="rh-market rh-kingdom" aria-label="Personaje y encargos del reino">
  <div className="rh-market-header"><div><span className="rh-eyebrow">TU HISTORIA EN CORONA DEL ALBA</span><h3>El encargo de la Corona</h3><p>{k.playing?'Personaje real · Recorrido guardado por el servidor':'Vista de visita · Tu personaje conserva su ubicación real'}</p></div>{k.playing?<button disabled={disabled} onClick={preview}>Guardar y volver a visita</button>:<button disabled={disabled||!ready||!d?.present} onClick={resume}>Controlar mi personaje</button>}</div>
  {!d?<p>Conectando con tu partida…</p>:<>
   <p>Ubicación: <strong>{d.traveling?(d.direction==='inbound'?'Viajando al reino':'Regresando a tu aldea'):d.present?'Corona del Alba':d.home?'Tu aldea':'Fuera de la aldea'}</strong>{d.traveling&&` · ${Math.ceil(d.remainingSeconds/60)} min restantes`}. Saldo: {d.credits} CR.</p>
   <div className="rh-kingdom-actions">
    {!d.present&&!d.traveling&&<button disabled={disabled||!d.hasCharacter} onClick={go('royal.travel')}>Viajar al reino por los caminos</button>}
    {d.traveling&&<a href={`/recorrer/encargo?profile=${encodeURIComponent(playerId)}`}>Seguir mi viaje en Recorrer</a>}
    {(d.present||d.canReturn)&&<button disabled={disabled} onClick={go('royal.home')}>Regresar a mi aldea</button>}
    {k.playing&&<><button disabled={disabled} onClick={()=>route('reception')}>Caminar a recepción</button><button disabled={disabled} onClick={()=>route('throne')}>Caminar al trono real</button><button disabled={disabled} onClick={()=>route('gate')}>Caminar a la plaza</button></>}
    {k.playing&&k.near&&<button disabled={disabled} onClick={()=>k.setReception(true)}>Interactuar con el encargado · E</button>}
   </div>
   {c?<div className="rh-royal-contract"><h4>Dos tablones para las obras del castillo</h4><p>{c.status==='delivered'?'Entrega completada. La cuadrilla está reparando el mobiliario de recepción.':c.status==='cancelled'?'Encargo cancelado. No se concederá otro esta temporada.':c.status==='loaded'?'Carga preparada: viaja al reino y entrega al encargado.':'Regresa a tu aldea, fabrica dos tablones transferibles y prepara la carga.'}</p><ol><li>Aceptar en recepción.</li><li>Fabricar y cargar en tu aldea.</li><li>Viajar con la carga y entregar en el castillo.</li></ol><p>{c.cargo}/2 tablones en la carga · {d.transferablePlanks} transferibles en tu aldea · Recompensa: 12 CR + 25 XP.</p>
    {c.status==='accepted'&&<><button disabled={disabled||!d.home||d.transferablePlanks<2} onClick={go('royal.load')}>Cargar dos tablones en la aldea</button><button disabled={disabled} onClick={go('royal.cancel')}>Cancelar encargo</button></>}
    {c.status==='loaded'&&<><button disabled={disabled||!d.home} onClick={go('royal.unload')}>Descargar en mi aldea</button><button disabled={disabled||!k.playing||!k.near} onClick={go('royal.deliver')}>Entregar al encargado</button></>}
   </div>:<p>El encargado reserva 12 CR del presupuesto del reino para recibir dos tablones. Una recompensa por cuenta y temporada. Habla con él cuando tu personaje llegue; visitar el salón con la cámara no permite aceptar ni entregar.</p>}
   {d.accountClaimed&&<p>Otro explorador de tu cuenta ya reservó el encargo de esta temporada.</p>}
   {k.reception&&<div className="rh-royal-contract" role="group" aria-label="Recepción del castillo"><h4>Encargado de suministros reales</h4><p>Necesitamos dos tablones para restaurar el mobiliario del salón. La cuadrilla los transportará y trabajará aquí después de tu entrega.</p>{!c&&<button disabled={disabled||!k.playing||!k.near||d.accountClaimed||!d.budgetAvailable} onClick={go('royal.accept')}>Aceptar encargo · 2 tablones → 12 CR + 25 XP</button>}<button onClick={()=>k.setReception(false)}>Cerrar recepción</button></div>}
   {d.work&&<p role="status">Obras de recepción: {({unloading:'recibiendo los tablones',building:'carpintero trabajando',completed:'reparación terminada'})[d.work.phase]} · <progress aria-label="Progreso de la reparación real" max={1} value={d.work.progress}/></p>}
  </>}
  {k.pending&&<button disabled={k.busy} onClick={()=>void k.retry()}>Comprobar operación pendiente</button>}
  {k.message&&<p className="rh-trade-notice" role="status">{k.message}</p>}
 </section>;
}
