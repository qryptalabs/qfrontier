"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, Database, ExternalLink, LoaderCircle, LogIn, Radio, RefreshCw } from "lucide-react";
import type { MvpView } from "../lib/mvp/view";
import {defaultGameNavigation,formatGameNavigation,normalizeGameNavigation,parseGameNavigation,type GameNavigation,type GameTab} from "../lib/client/navigation";
import MvpClient from "./mvp-client";
import GameIcon from "./graphics/game-icons";
import "./game-availability.css";

type ConnectionState = "waiting" | "checking" | "unavailable" | "session";

/** A successful, authenticated server view is the only way back into the game. */
function isGameView(value: unknown): value is MvpView {
  if(!value||typeof value!=="object")return false;
  const record=value as Record<string,unknown>;
  return typeof record.revision==="number"&&Number.isSafeInteger(record.revision)&&record.revision>=0
    &&typeof record.now==="number"&&Number.isFinite(record.now)
    &&["players","tiles","jobs","people","settlements","regions","events","weather","forecast","battles","convoys"].every(key=>Array.isArray(record[key]))
    &&!!record.social&&typeof record.social==="object"
    &&!!record.habitable&&typeof record.habitable==="object"
    &&(record.player===null||!!record.player&&typeof record.player==="object"&&typeof (record.player as Record<string,unknown>).id==="string");
}

function FrontierSignal() {
  return <div className="ga-signal" aria-hidden="true"><svg viewBox="0 0 400 300" fill="none">
    <defs><radialGradient id="gaGlow"><stop stopColor="#718d60" stopOpacity=".3"/><stop offset="1" stopColor="#718d60" stopOpacity="0"/></radialGradient><linearGradient id="gaLand" x1="100" y1="100" x2="290" y2="250" gradientUnits="userSpaceOnUse"><stop stopColor="#759365"/><stop offset="1" stopColor="#314e3a"/></linearGradient></defs>
    <circle cx="200" cy="148" r="143" fill="url(#gaGlow)"/>
    <ellipse cx="200" cy="165" rx="155" ry="78" stroke="#90a474" strokeOpacity=".25" strokeDasharray="3 9"/>
    <ellipse cx="200" cy="165" rx="125" ry="57" stroke="#b7ba82" strokeOpacity=".28"/>
    <path d="M66 165 201 91l134 74-134 79z" fill="#142b21" stroke="#8c9b65" strokeOpacity=".4"/>
    <path d="m84 158 117-64 116 64-116 69z" fill="url(#gaLand)"/>
    <path d="m84 158 117 69v17L84 175z" fill="#334534"/><path d="m201 227 116-69v17l-116 69z" fill="#263d30"/>
    <path d="m171 174 17-10 43 26-17 10zm-53-31 14-8 43 26-14 8z" fill="#a7a17a"/>
    <path d="m173 144 30-18 30 18-30 18z" fill="#b89a61"/><path d="m173 144 30 18v28l-30-18z" fill="#8d815b"/><path d="m203 162 30-18v28l-30 18z" fill="#606e50"/>
    <path d="m166 143 37-31 38 31-38 21z" fill="#84643e"/><path d="m166 143 37-31v24l-22 15z" fill="#ad8750"/>
    <path d="m182 158 10 6v16l-10-6z" fill="#e0b56c"/><path d="m211 170 12-7v9l-12 7z" fill="#c3bd7b"/>
    <path d="m134 160-21-13 21-12 22 12z" fill="#4a6743"/><path d="m134 146-17-10 17-31 18 31z" fill="#78905d"/><path d="m134 126-13-7 13-27 14 27z" fill="#94a76c"/><path d="M132 148h5v14h-5z" fill="#8c6a40"/>
    <path d="m270 167-22-13 22-12 23 12z" fill="#3f603e"/><path d="m270 153-18-11 18-33 19 33z" fill="#688452"/><path d="m270 132-13-8 13-28 15 28z" fill="#88a26a"/><path d="M268 155h5v14h-5z" fill="#836641"/>
    <path d="m232 209 13-8 19 11-13 8z" fill="#73a4a0"/><path d="m225 205 12-7 9 5-12 7z" fill="#97b8aa"/>
    <path d="M202 91V69" stroke="#d8b777" strokeWidth="2"/><circle cx="202" cy="60" r="4" fill="#e1c38c"/>
    <path d="M185 53a23 23 0 0 1 34 0m-45-11a39 39 0 0 1 56 0" stroke="#d5b981" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/>
    <path d="M72 96h4m-2-2v4m242-8h4m-2-2v4M106 56h3m179 185h4m-2-2v4" stroke="#c1c59a" strokeOpacity=".65"/>
    <circle cx="100" cy="207" r="2" fill="#cfbe83"/><circle cx="302" cy="128" r="1.5" fill="#b9cfad"/>
  </svg><span>LA FRONTERA TE ESPERA</span></div>;
}

export default function GameAvailability({initialTab="world",initialNavigation}:{initialTab?:GameTab;initialNavigation?:GameNavigation}) {
  const [view,setView]=useState<MvpView|null>(null);
  const [navigation,setNavigation]=useState<GameNavigation>(()=>initialNavigation??defaultGameNavigation(initialTab));
  const [connection,setConnection]=useState<ConnectionState>("waiting");
  const [countdown,setCountdown]=useState(5);
  const [visible,setVisible]=useState(true);
  const [lastAttempt,setLastAttempt]=useState<number|null>(null);
  const [message,setMessage]=useState("No pudimos consultar el guardado. La partida se mostrará cuando el servidor confirme su estado.");
  const retry=useRef<()=>void>(()=>{});

  useEffect(()=>{
    if(view)return;
    let disposed=false,resolved=false,sessionRequired=false,failures=0;
    let nextAt=performance.now()+5000,pausedRemaining=5000,nextDelay=5000;
    let inFlight:AbortController|null=null;
    const updateCountdown=()=>{
      if(disposed||resolved||sessionRequired||document.hidden)return;
      const remaining=Math.max(0,Math.ceil((nextAt-performance.now())/1000));
      setCountdown(current=>current===remaining?current:remaining);
    };
    const requireSession=()=>{sessionRequired=true;setConnection("session");setMessage("El acceso necesita comprobar tu sesión. Volvé a abrir el juego para identificarte y continuar en esta misma vista.");};
    const check=async()=>{
      if(disposed||resolved||sessionRequired||inFlight||document.hidden)return;
      const controller=new AbortController();inFlight=controller;
      setConnection("checking");setLastAttempt(Date.now());
      let timedOut=false;
      const timeout=setTimeout(()=>{timedOut=true;controller.abort();},8000);
      try{
        const read=async(path:string):Promise<MvpView|null>=>{
          const response=await fetch(path,{method:"GET",cache:"no-store",credentials:"same-origin",redirect:"manual",headers:{Accept:"application/json"},signal:controller.signal});
          if(disposed||document.hidden)return null;
          if(response.type==="opaqueredirect"||response.status===401||response.status===403){requireSession();return null;}
          const contentType=response.headers.get("content-type")??"";
          if(!contentType.includes("application/json")){
            if(response.ok&&contentType.includes("text/html")){requireSession();return null;}
            throw new Error("unavailable");
          }
          const payload:unknown=await response.json();
          if(disposed||document.hidden)return null;
          if(response.ok&&payload&&typeof payload==="object"&&isGameView((payload as Record<string,unknown>).view))return (payload as {view:MvpView}).view;
          setMessage(response.status===503?"La conexión con el guardado sigue sin estar disponible. Esperamos una respuesta verificada del servidor.":"El servidor todavía no devolvió un estado de partida válido. Volveremos a comprobarlo.");
          return null;
        };
        let next=await read('/api/mvp');if(!next)return;
        // The address can contain a legacy hash; financial profiles must still belong to this session.
        const requested=parseGameNavigation(window.location.href);
        let restored=normalizeGameNavigation(requested,{profiles:next.players,selectedProfileId:next.player?.id,isAdmin:!!next.admin});
        if(restored.profileId&&restored.profileId!==next.player?.id){
          next=await read(`/api/mvp?${new URLSearchParams({playerId:restored.profileId})}`);if(!next)return;
          restored=normalizeGameNavigation(restored,{profiles:next.players,selectedProfileId:next.player?.id,isAdmin:!!next.admin});
          if(restored.profileId!==next.player?.id)throw new Error('profile-unavailable');
        }
        if(disposed||document.hidden)return;
        resolved=true;setNavigation(restored);setView(next);
      }catch{
        if(disposed||document.hidden)return;
        setMessage(timedOut?"El servidor no respondió dentro del tiempo de espera. Volveremos a comprobar la conexión.":navigator.onLine===false?"Tu navegador está sin conexión. Los reintentos continuarán cuando pueda comunicarse con el servidor.":"No pudimos comunicarnos con el guardado. Esperamos una respuesta verificada antes de abrir la partida.");
      }finally{
        clearTimeout(timeout);
        if(inFlight===controller)inFlight=null;
        if(!disposed&&!resolved&&!sessionRequired&&controller.signal.reason==="visibility")setConnection("waiting");
        else if(!disposed&&!resolved&&!sessionRequired){
          failures++;nextDelay=Math.min(30000,5000*2**Math.min(3,failures));
          if(document.hidden){pausedRemaining=nextDelay;setConnection("unavailable");}
          else{nextAt=performance.now()+nextDelay;setConnection("unavailable");updateCountdown();}
        }
      }
    };
    const visibility=()=>{
      if(disposed||resolved)return;
      setVisible(!document.hidden);
      if(document.hidden){pausedRemaining=inFlight?nextDelay:Math.max(0,nextAt-performance.now());inFlight?.abort("visibility");}
      else{nextAt=performance.now()+Math.max(1000,pausedRemaining);updateCountdown();}
    };
    const interval=setInterval(()=>{if(disposed||resolved||sessionRequired||document.hidden||inFlight)return;updateCountdown();if(performance.now()>=nextAt)void check();},250);
    retry.current=()=>void check();
    document.addEventListener("visibilitychange",visibility);
    visibility();
    return()=>{disposed=true;clearInterval(interval);document.removeEventListener("visibilitychange",visibility);inFlight?.abort();retry.current=()=>{};};
  },[view]);

  if(view)return <MvpClient initialView={view} initialNavigation={navigation}/>;
  const checking=connection==="checking",session=connection==="session";
  const returnPath=formatGameNavigation(navigation);
  return <main className="ga-page">
    <header className="ga-header"><a href={returnPath} className="ga-brand" aria-label="QFrontier, inicio"><GameIcon name="emblem" size={47}/><span>QFrontier<small>FRONTERA CERO</small></span></a><span className="ga-private">ENTORNO DE PRUEBAS</span></header>
    <section className="ga-card" aria-labelledby="ga-title">
      <div className="ga-art"><div className="ga-art-label"><Radio size={14}/>SEÑAL DE LA FRONTERA</div><FrontierSignal/><p>Un momento de espera<br/><span>antes de volver a explorar.</span></p></div>
      <div className="ga-content"><div className="ga-eyebrow"><span/>CONEXIÓN EN ESPERA</div><h1 id="ga-title">La frontera está temporalmente en pausa</h1><p className="ga-intro">La conexión con el guardado no está disponible en este momento.</p><div className="ga-checkpoint"><Database size={21}/><div><strong>Verificación del servidor pendiente</strong><p>Necesitamos consultar la partida antes de mostrar tus recursos, construcciones y actividades.</p></div></div>
        <p className="ga-message" role="status" aria-live="polite">{message}</p>
        <div className="ga-actions">{session?<a className="ga-button" href={returnPath} onClick={event=>{event.preventDefault();window.location.reload();}}><LogIn size={17}/>Volver a iniciar sesión<ArrowRight size={15}/></a>:<button className="ga-button" type="button" disabled={checking||!visible} aria-busy={checking} onClick={()=>retry.current()}>{checking?<LoaderCircle className="ga-spin" size={17}/>:<RefreshCw size={17}/>} {checking?"Comprobando conexión…":"Volver a intentar"}</button>}</div>
        {!session&&<div className="ga-retry" aria-live="off"><Clock3 size={14}/><span>{!visible?"Los reintentos están en pausa mientras esta pestaña está oculta.":checking?"Una comprobación en curso · Espera máxima de 8 segundos.":<>Reintento automático en <strong role="timer" aria-live="off">{countdown} s</strong></>}</span></div>}
        {lastAttempt&&<p className="ga-last">Última comprobación: <time dateTime={new Date(lastAttempt).toISOString()}>{new Date(lastAttempt).toLocaleTimeString("es-CR",{timeZone:"America/Costa_Rica",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})}</time> · Guardado del juego</p>}
      </div>
    </section>
    <footer className="ga-footer"><span>El acceso a la partida espera una respuesta válida del servidor.</span><a href="https://www.cloudflarestatus.com/" target="_blank" rel="noopener noreferrer">Estado de Cloudflare<ExternalLink size={12}/></a></footer>
  </main>;
}
