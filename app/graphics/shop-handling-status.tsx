"use client";
import type {ShopSnapshot} from '../../lib/mvp/city-shop';
import {SHOP_SITES} from '../../lib/graphics/city-shop-sites';
export function ShopHandlingStatus({data,onFollow}:{data:ShopSnapshot;onFollow:()=>void}){
 const h=data.handling;if(!h)return null;
 const phase=h.completedAt!==undefined?'completed':h.transferredAt!==undefined?'returning':data.now>=h.transfersAt?'confirming':h.kind==='collect'?'loading':'unloading';
 const label={completed:'Operación completada',loading:'El trabajador carga tu carreta',unloading:'El trabajador descarga en el almacén',confirming:'Comprobando la transferencia con el almacén',returning:'Carga confirmada · el trabajador regresa'}[phase];
 return <article className="cs-contract cs-handling" aria-live="polite"><span className="cs-eyebrow">LOGÍSTICA DEL PATIO · {SHOP_SITES[h.cityId].city}</span><h4>{label}</h4><p>{h.units} unidades · {h.kind==='collect'?'Almacén → carreta':'Carreta → almacén'}</p><ol className="cs-flow"><li data-done="true">Preparación</li><li data-done={h.transferredAt!==undefined}>Traslado físico</li><li data-done={h.completedAt!==undefined}>Confirmación</li></ol>{h.completedAt===undefined?<><progress max={Math.max(1,h.endsAt-h.startsAt)} value={Math.max(0,Math.min(h.endsAt-h.startsAt,data.now-h.startsAt))} aria-label="Progreso de la carga o descarga"/><p>Faltan aproximadamente {Math.max(1,Math.ceil((h.endsAt-data.now)/1000))} segundos. El equipo espera en el patio; el proceso continúa si cierras la ventana.</p><button onClick={onFollow}>Ver al trabajador y mi carreta</button></>:<p>Los recursos ya cambiaron de ubicación. {h.kind==='collect'?'Puedes iniciar el viaje desde Encargos y ruta.':'El servidor confirmó la entrega y el pago correspondiente.'}</p>}</article>;
}
