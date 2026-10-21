"use client";

import {useEffect,useRef,useState} from "react";
import type {HabitablePoint} from "../lib/mvp/habitable-data";

interface Props{point?:HabitablePoint;disabled:boolean;halfWidth:number;halfDepth:number;onChange(point:HabitablePoint|undefined):void}
const pointKey=(point:HabitablePoint|undefined)=>point?`${point.x},${point.y}`:"";
export default function HabitablePlacementCoordinates({point,disabled,halfWidth,halfDepth,onChange}:Props){
  const [x,setX]=useState(point?String(point.x):""),[y,setY]=useState(point?String(point.y):""),emitted=useRef<string|null>(null);
  const px=point?.x,py=point?.y;
  useEffect(()=>{const key=px===undefined||py===undefined?"":`${px},${py}`;if(key===emitted.current)return;setX(px===undefined?"":String(px));setY(py===undefined?"":String(py));},[px,py]);
  const maxX=halfWidth-.5,maxY=halfDepth-.5;
  const parse=(rawX:string,rawY:string)=>{const nx=Number(rawX),ny=Number(rawY);return rawX.trim()!==""&&rawY.trim()!==""&&Number.isFinite(nx)&&Number.isFinite(ny)&&Math.abs(nx)<=maxX&&Math.abs(ny)<=maxY&&Math.abs(nx*2-Math.round(nx*2))<1e-8&&Math.abs(ny*2-Math.round(ny*2))<1e-8?{x:nx,y:ny}:undefined;};
  const update=(axis:"x"|"y",value:string)=>{if(disabled)return;const nx=axis==="x"?value:x,ny=axis==="y"?value:y;if(axis==="x")setX(value);else setY(value);const next=parse(nx,ny);emitted.current=pointKey(next);onChange(next);};
  const invalid=(x!==""||y!=="")&&!parse(x,y);
  return <fieldset className="h-coordinate-fields" disabled={disabled}><legend>Ubicar por coordenadas</legend><div><label>X<input type="number" aria-label="Coordenada X del plano" inputMode="decimal" step={.5} min={-maxX} max={maxX} value={x} placeholder="X" onChange={event=>update("x",event.target.value)}/></label><label>Y<input type="number" aria-label="Coordenada Y del plano" inputMode="decimal" step={.5} min={-maxY} max={maxY} value={y} placeholder="Y" onChange={event=>update("y",event.target.value)}/></label></div><p role={invalid?"status":undefined}>{invalid?`Ingresá X e Y en pasos de 0,5, entre ±${maxX} y ±${maxY} respectivamente.`:"Pasos de 0,5. También podés tocar el suelo o sugerir un espacio. La huella debe respetar el terreno y los accesos."}</p></fieldset>;
}
