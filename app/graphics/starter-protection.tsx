"use client";

import {useSyncExternalStore} from 'react';
const subscribe=()=>()=>{};
import { ShieldCheck } from "lucide-react";
import type { StarterProtection } from "../../lib/mvp/types";

function remainingTime(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function StarterProtectionBanner({ protection, clock, compact=false }: { protection: StarterProtection; clock: number;compact?:boolean }) {
  const localDeadline=useSyncExternalStore(subscribe,()=>protection?new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(new Date(protection.endsAt)):null,()=>null);
  if (!protection) return null;
  const active = protection.active;
  const deadline = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(protection.endsAt));
  const details=<>
    <ShieldCheck size={27}/>
    <div><strong>{active ? "Escudo de bienvenida · 72 horas" : "Tu aldea permanece protegida"}</strong>
      <p>{active ? "Podés construir, explorar y comerciar. Durante el escudo no podés atacar ni recibir ataques de otros jugadores." : "Tu estación y su almacén están a salvo. Participar en disputas regionales sigue siendo una decisión voluntaria."}</p>
      {active && <time dateTime={new Date(protection.endsAt).toISOString()} title={`Costa Rica: ${deadline}`}>Finaliza el {localDeadline??deadline}, {localDeadline?'hora de tu dispositivo':'hora de Costa Rica'}. El plazo pertenece a tu cuenta y se conserva entre exploradores.</time>}
    </div>
    <div className="m-protection-countdown"><b>{active ? remainingTime(protection.endsAt - clock) : "PvP voluntario"}</b><span>{active ? "de protección inicial" : "Sin activación automática"}</span></div>
  </>;
  if(compact)return <details className={`m-protection-compact ${active?'':'m-protection-expired'}`}><summary><ShieldCheck size={16}/><strong>{active?'Escudo activo':'Aldea protegida'}</strong><span>{active?remainingTime(protection.endsAt-clock):'PvP voluntario'}</span><small>Ver detalles</small></summary><section className="m-protection-banner" aria-label="Protección de tu aldea">{details}</section></details>;
  return <section className={`m-protection-banner ${active ? "" : "m-protection-expired"}`} aria-label="Protección de tu aldea">{details}</section>;
}
