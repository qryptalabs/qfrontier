"use client";

import {ArrowRight, Check, Clock3, Coins, Package, ShieldCheck} from "lucide-react";
import type {MvpView} from "../lib/mvp/view";
import type {MvpCommand} from "../lib/mvp/types";
import type {GameNavigation} from "../lib/client/navigation";

type Guide=NonNullable<MvpView["firstTrade"]>;
type Props={guide:Guide;clock:number;busy:boolean;showReceipt?:boolean;act:(command:MvpCommand)=>void;navigate:(destination:GameNavigation)=>void;refresh:()=>void};
const waitTime=(seconds:number)=>{const value=Math.max(0,Math.ceil(seconds));return value>=60?`${Math.floor(value/60)} min ${value%60} s`:`${value} s`;};

/** The server selects the next valid command. Every resource-spending action still opens its normal quote. */
export default function FirstTradePanel({guide,clock,busy,showReceipt=false,act,navigate,refresh}:Props){
  const playerId=guide.playerId;
  if(!playerId)return null;
  const ledger=()=>navigate({tab:"season",section:"ledger",profileId:playerId});
  if(guide.stage==="complete")return showReceipt?<details className="m-first-sale-receipt"><summary><ShieldCheck size={17}/><span>Primera venta completada</span><strong>{guide.cash.received} CR recibidos</strong></summary><p>El pago está registrado. Tus créditos disponibles: <strong>{guide.cash.balance} CR</strong>.</p><button type="button" className="m-link-button" onClick={ledger}>Ver mis movimientos<ArrowRight size={14}/></button></details>:null;
  const completed=guide.steps.filter(step=>step.done).length,remaining=guide.job?Math.max(0,Math.ceil((guide.job.endsAt-clock)/1000)):0;
  const isDistrict=!!guide.collection?.buildingId||guide.job?.kind==="walk"||guide.job?.kind==="daily",isCraft=guide.stage==="craft"||guide.job?.kind==="craft";
  const openPlace=()=>navigate({tab:isDistrict?"roam":isCraft?"station":guide.stage==="sell"?"trade":"world",section:isDistrict?"production":isCraft?"craft":guide.stage==="sell"?"npc":"sectors",profileId:playerId,...(guide.sector?{tileId:guide.sector.id}:{}),...(guide.collection?.buildingId?{facilityId:guide.collection.buildingId}:{})});
  return <section className="m-first-sale" aria-label="Tu primera venta guiada">
    <div className="m-first-sale-heading"><span className="m-eyebrow">DEL BOSQUE A LA FERIA</span><span>{completed}/{guide.steps.length} pasos</span></div>
    <div className="m-first-sale-progress" role="progressbar" aria-label="Avance de la primera venta" aria-valuemin={0} aria-valuemax={guide.steps.length} aria-valuenow={completed}><span style={{width:`${100*completed/Math.max(1,guide.steps.length)}%`}}/></div>
    <div className="m-first-sale-body"><div><h2>{guide.title}</h2><p>{guide.detail}</p>
      {guide.reason&&<p className="m-first-sale-reason" role="status">{guide.reason}</p>}
      {guide.job&&<p className="m-first-sale-wait" role="status"><Clock3 size={15}/>{remaining?`En curso · ${waitTime(remaining)}`:"Comprobando el resultado guardado…"}<small>El trabajo continúa aunque salgas del juego.</small></p>}
      {!!guide.ingredients.length&&['craft','extract'].includes(guide.stage)&&<div className="m-first-sale-ingredients">{guide.ingredients.map(ingredient=><span key={ingredient.itemId} className={ingredient.missing?"missing":"ready"}><Package size={13}/>{ingredient.available}/{ingredient.required} maderas transferibles</span>)}</div>}
    </div><div className="m-first-sale-action"><div className="m-first-sale-price"><Coins size={20}/><span>Un tablón en la Feria<strong>{guide.sale.unitPrice} CR</strong></span></div>
      {guide.command?<button type="button" className="m-button full" disabled={busy||!guide.canAct} onClick={()=>{if(!busy&&guide.canAct&&guide.command)act(guide.command);}}>{guide.actionLabel}<ArrowRight size={15}/></button>:guide.job&&remaining===0?<button type="button" className="m-button full" disabled={busy} onClick={()=>{if(!busy)refresh();}}>Comprobar resultado</button>:null}
      <button type="button" className="m-link-button" disabled={busy} onClick={openPlace}>Ver el lugar y sus opciones<ArrowRight size={13}/></button>
    </div></div>
    <details className="m-first-sale-steps"><summary>Ver el recorrido completo</summary><ol>{guide.steps.map((step,index)=><li key={step.id} className={step.done?"done":""}><span>{step.done?<Check size={13}/>:index+1}</span>{step.label}</li>)}</ol><p>La guía usa materiales transferibles. Cada orden muestra sus recursos y su duración antes de confirmar; el kit del tutorial conserva su vínculo.</p></details>
  </section>;
}
