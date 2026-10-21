"use client";

import {useState} from "react";
import {Footprints,MoveRight} from "lucide-react";
import {HABITABLE_INTERACTION_RADIUS,HABITABLE_POINTS,habitableLineClear,habitablePath,habitablePositionAt,habitableWalkableAt,habitableWorkerAt,type HabitablePoint,type HabitableState} from "../lib/mvp/habitable-data";
import type {HabitableFacilityView} from "../lib/mvp/habitable-buildings";
import type {MvpCommand} from "../lib/mvp/types";

/** A nearby preview, never an authoritative movement or a change to the saved position. */
export function findHabitableAccessSidePoint(state:HabitableState,facility:Pick<HabitableFacilityView,"access"|"buildingId">,clock:number):HabitablePoint|null{
  const access=facility.access;if(!access)return null;
  const from=habitablePositionAt(state,clock),building=state.buildings.find(b=>b.id===facility.buildingId);
  const extra=[...HABITABLE_POINTS.map(p=>({...p,x:p.x+.7,width:.65,depth:.65})),...(state.workers??[]).map(worker=>({...habitableWorkerAt(worker,clock),id:worker.id,width:.85,depth:.85}))];
  const angle=building?Math.atan2(access.y-building.y,access.x-building.x):Math.atan2(access.y-from.y,access.x-from.x),candidates:HabitablePoint[]=[];
  for(const radius of[.9,1.1,1.3,1.5])for(const turn of[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*3/4,-Math.PI*3/4,Math.PI])candidates.push({x:Math.round((access.x+Math.cos(angle+turn)*radius)*10)/10,y:Math.round((access.y+Math.sin(angle+turn)*radius)*10)/10});
  return candidates.find(point=>Math.hypot(point.x-access.x,point.y-access.y)>=.8&&Math.hypot(point.x-access.x,point.y-access.y)<HABITABLE_INTERACTION_RADIUS-.05&&Math.hypot(point.x-from.x,point.y-from.y)>.35&&habitableWalkableAt(point,state,.35,extra)&&habitableLineClear(point,access,state)&&!!habitablePath(state,from,point,extra))??null;
}

export default function HabitableClearAccess({state,facility,clock,busy,playerId,quickAct}:{state:HabitableState;facility:HabitableFacilityView;clock:number;busy:boolean;playerId:string;quickAct(command:MvpCommand):void|Promise<void>}){
  const [notice,setNotice]=useState("");
  const moving=!!state.movement&&state.movement.endsAt>clock;
  return <div className="hf-clear-access"><button type="button" className="h-button secondary small full" aria-label={`Dejar libre el acceso de ${facility.label}`} disabled={busy||moving||!facility.near||!facility.access} onClick={()=>{if(busy||moving)return;const point=findHabitableAccessSidePoint(state,facility,clock);if(!point){setNotice("No encontramos un paso cercano libre. Tocá otro punto del suelo o esperá a que pase el habitante.");return;}setNotice("");void quickAct({type:"habitat.walk",playerId,x:point.x,y:point.y});}}><Footprints/>Dejar libre el acceso<MoveRight size={13}/></button>{notice&&<p className="hf-note" role="status">{notice}</p>}</div>;
}
