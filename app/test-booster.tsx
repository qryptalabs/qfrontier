'use client';
import {Clock3,FlaskConical,Gift,ShieldCheck,Ticket} from 'lucide-react';
import type {TestBoostView} from '../lib/mvp/test-boosts';
import {useGameTimestamp} from './local-time';
import './test-booster.css';

export interface TestBoosterProps {boosts:TestBoostView|null|undefined;checked:boolean;onChange(value:boolean):void;disabled?:boolean}
const duration=(seconds:number)=>{const total=Math.max(0,Math.floor(seconds));return total<60?`${total} s`:`${Math.floor(total/60)} min${total%60?` ${total%60} s`:''}`;};
const amount=(value:number)=>value.toLocaleString('es-CR');

/** This opt-in sends intent only. The quote and server reserve the real saving. */
export function TestBooster({boosts,checked,onChange,disabled=false}:TestBoosterProps){
  const timestamp=useGameTimestamp();
  if(!boosts)return null;
  const passes=boosts.passes,hasBudget=Number.isFinite(boosts.remainingSeconds)&&boosts.remainingSeconds>=1;
  // Older projections and fixtures predate passes; the server still validates every order.
  const hasPasses=passes===undefined||Number.isFinite(passes.available)&&passes.available>=1,available=hasBudget&&hasPasses;
  return <section className={`m-test-boost ${checked?'selected':''}`} aria-label="Potenciador de prueba">
    <label className="m-test-boost-toggle"><input type="checkbox" checked={checked} disabled={disabled||(!available&&!checked)} onChange={event=>{const next=event.target.checked;if(!disabled&&(!next||available))onChange(next);}}/><FlaskConical size={18}/><span><strong>Aplicar potenciador de prueba</strong><small>Hasta {boosts.maxReductionPercent}% menos tiempo de producción</small></span><span className="m-test-boost-tag">Gratis · Prueba</span></label>
    {passes&&<div className="m-test-boost-passes"><Ticket size={17}/><span><strong>{amount(passes.available)} {passes.available===1?'pase disponible':'pases disponibles'}</strong><small>{amount(passes.earned)} obtenidos · {amount(passes.spent)} utilizados · Compartidos por tu cuenta</small></span></div>}
    <div className="m-test-boost-balance"><Clock3 size={14}/><span><strong>{duration(boosts.remainingSeconds)}</strong> de ahorro disponibles · {duration(boosts.usedSeconds)} usados de {duration(boosts.limitSeconds)} por cuenta en las últimas 24 horas.</span></div>
    {!hasPasses&&<p className="m-test-boost-note" role="status">No tenés pases disponibles. Podés ganarlos jugando.{checked?' Desmarcá la opción para revisar una orden sin potenciador.':''}</p>}
    {!hasBudget&&<p className="m-test-boost-note" role="status">El cupo de ahorro está agotado.{checked?' Desmarcá la opción para revisar una orden sin potenciador.':''}{typeof boosts.nextReleaseAt==='number'&&Number.isFinite(boosts.nextReleaseAt)&&<> Próxima liberación: <time dateTime={new Date(boosts.nextReleaseAt).toISOString()}>{timestamp(boosts.nextReleaseAt)}</time>.</>}</p>}
    {passes&&<><p className="m-test-boost-note">Una orden potenciada confirmada usa 1 pase, incluso con ahorro parcial. Cancelar no devuelve el pase ni el cupo reservado.</p><details className="m-test-boost-rewards"><summary><Gift size={14}/>Cómo ganar pases · Últimas recompensas</summary><div className="m-test-boost-reward-rules"><p><strong>Bienvenida:</strong> 3 pases, una sola vez por cuenta.</p><p><strong>Nuevo nivel máximo de tu cuenta:</strong> 2 pases por nivel desde el 2. Subir otro explorador a un nivel ya alcanzado no repite el premio.</p><p><strong>Encargos pagados:</strong> 1 por el encargo inicial del distrito; 1 por producto demandado vendido a la Feria por cuenta y temporada; 1 por entrega comercial pagada de 2 tablones a Valleverde. Fabricar en el aserradero no entrega pases.</p><p>Las recompensas se reconocen automáticamente. Los pases no vencen a las 24 horas; ese plazo sólo libera el cupo de ahorro.</p></div>{passes.history.length>0?<ul className="m-test-boost-history">{passes.history.map(reward=><li key={reward.id}><span><strong>{reward.title}</strong><time dateTime={new Date(reward.earnedAt).toISOString()}>{timestamp(reward.earnedAt)}</time></span><b>+{amount(reward.charges)} {reward.charges===1?'pase':'pases'}</b></li>)}</ul>:<p className="m-test-boost-note">Tus recompensas confirmadas aparecerán acá.</p>}<p className="m-test-boost-note">Últimas {passes.history.length} recompensas de la cuenta. Los totales incluyen todo el historial reconocido; recargar no vuelve a otorgarlas.</p></details></>}
    <p className="m-test-boost-note"><ShieldCheck size={13}/><span>{checked?'El ahorro exacto se confirma en la revisión de la orden. No acelera la cola, el suministro ni las entregas.':'Se aplica sólo si lo seleccionás. Los materiales, productos y requisitos permanecen iguales.'} No requiere pagos ni cambia la XP obtenida por la actividad.</span></p>
  </section>;
}
export default TestBooster;
