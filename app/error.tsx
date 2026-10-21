"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import GameIcon from "./graphics/game-icons";
import "./game-availability.css";

/** Keep unexpected errors readable without exposing server diagnostics. */
export default function GameError({reset}:{error:Error&{digest?:string};reset:()=>void}) {
  return <main className="ga-page"><section className="ga-error-card" aria-labelledby="ga-error-title"><GameIcon name="emblem" size={61}/><div className="ga-eyebrow"><span/>QFRONTIER · CONEXIÓN INTERRUMPIDA</div><h1 id="ga-error-title">No pudimos abrir la frontera</h1><p>El juego no pudo completar esta carga. Podés volver a intentarlo; necesitamos una respuesta válida del servidor antes de mostrar la partida.</p><div className="ga-actions"><button className="ga-button" type="button" onClick={reset}><RefreshCw size={16}/>Volver a intentar</button><button className="ga-button secondary" type="button" onClick={()=>window.location.reload()}>Volver a cargar<ArrowRight size={14}/></button></div></section></main>;
}
