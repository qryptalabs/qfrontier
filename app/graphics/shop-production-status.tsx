"use client";
import type {ShopSnapshot} from '../../lib/mvp/city-shop';
export function ShopProductionStatus({data,busy,act}:{data:ShopSnapshot;busy:boolean;act:(type:string)=>void}){
 const s=data.production;if(data.contract?.request!=='granary')return null;
 const labels:Record<string,string>={loading:'Transportando al punto de carga',loaded:'Cargamento preparado',ready:'Listo en el cobertizo','plan-changed':'Requiere nueva autorización',paused:'Espera un turno autorizado',producing:'Fabricando y transportando',waiting:'Revisando materiales y accesos'};
 return <section className="cs-production" aria-label="Preparación del pedido del granero"><h4>Tu pedido está en…</h4>
 {!s.authorized?<><p>Conecta este pedido con el cobertizo y el encargado de tu aldea. Producirá únicamente lo que falte, dentro del turno y presupuesto que ya autorizaste.</p><button disabled={busy||!data.home||!s.canAuthorize} onClick={()=>act('shop.prepare')}>Autorizar al encargado</button>{s.reason&&<p>{s.reason}</p>}</>:<><strong>{labels[s.phase]}</strong><dl><div><dt>Reservados en el cobertizo</dt><dd>{s.held}/2</dd></div><div><dt>En producción o traslado</dt><dd>{s.incoming}</dd></div><div><dt>Por preparar</dt><dd>{s.missing}</dd></div><div><dt>Tablones en tu carga</dt><dd>{s.cargo}</dd></div></dl><p role="status">{s.reason}</p>{s.phase==='plan-changed'?<button disabled={busy||!data.home} onClick={()=>act('shop.prepare')}>Vincular el plan actual</button>:s.phase==='ready'?<button disabled={busy||!data.home} onClick={()=>act('shop.pack')}>Preparar carga con un habitante</button>:null}</>}
 <p><a href={'/recorrer/encargo?profile='+encodeURIComponent(data.playerId)}>Ver encargado y habitantes de mi aldea</a></p><small>Respeta obras aprobadas, reservas mínimas, cuotas forestales y límites de turno. No compra insumos ni renueva turnos automáticamente. Para cargar, necesita un habitante libre y un camino seguro hasta tu personaje.</small>
 </section>;
}
