import * as THREE from 'three';
import {createFishingModelLibrary,type FishingBoat,type FishingHaulage} from './fishing-community-models.ts';
import {maritimeBoatPose} from './maritime-water.ts';
import {sampleWorld} from './world-geography.ts';
import {EXPLORATION_PUBLIC_LANDINGS} from '../mvp/exploration-network-data.ts';
import type {ExplorationBoatPose} from '../mvp/exploration-vessel.ts';

export type ExplorationVehicleMode='walk'|'carriage'|'boat';
export interface ExplorationVehiclePose {foot:{x:number;y:number;z:number};mode:ExplorationVehicleMode;boarding?:boolean}

/** Find the visible pier edge along a passenger's actual line toward the deck seat. */
function pierExit(port:typeof EXPLORATION_PUBLIC_LANDINGS[number],to:{x:number;y:number}){
  const end=port.end??port.water,dx=end.x-port.land.x,dy=end.y-port.land.y,length=Math.hypot(dx,dy),tx=dx/(length||1),ty=dy/(length||1),u=(port.water.x-port.land.x)*tx+(port.water.y-port.land.y)*ty,v=-(port.water.x-port.land.x)*ty+(port.water.y-port.land.y)*tx,du=(to.x-port.water.x)*tx+(to.y-port.water.y)*ty,dv=-(to.x-port.water.x)*ty+(to.y-port.water.y)*tx;
  let fraction=1;for(const[position,direction,low,high]of[[u,du,0,length],[v,dv,-port.width/2,port.width/2]])if(direction>1e-8)fraction=Math.min(fraction,(high-position)/direction);else if(direction<-1e-8)fraction=Math.min(fraction,(low-position)/direction);
  const t=Math.max(0,Math.min(.999,fraction));return{fraction:t,x:port.water.x+(to.x-port.water.x)*t,y:port.water.y+(to.y-port.water.y)*t};
}
function vesselEntry(from:{x:number;y:number},to:{x:number;y:number},vehicle:{x:number;y:number},heading:number){const c=Math.cos(heading),s=Math.sin(heading),dx=from.x-vehicle.x,dy=from.y-vehicle.y,x=dx*c-dy*s,z=dx*s+dy*c,ux=(to.x-from.x)*c-(to.y-from.y)*s,uz=(to.x-from.x)*s+(to.y-from.y)*c;let fraction=0;for(const[position,direction,low,high]of[[x,ux,-1.035,1.035],[z,uz,-1.9,1.9]])if(Math.abs(direction)>1e-8)fraction=Math.max(fraction,Math.min((low-position)/direction,(high-position)/direction));const t=Math.max(0,Math.min(.999,fraction));return{fraction:t,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};}

/** Vehicle meshes accompany confirmed passenger positions. This layer never computes a route. */
export function createExplorationTransportLayer(heightAt:(x:number,y:number)=>number){
  const group=new THREE.Group();group.name='confirmed-exploration-vehicles';const library=createFishingModelLibrary(),entries=new Map<string,{mode:'boat'|'carriage';vehicle:FishingBoat|FishingHaulage;gangway?:THREE.Mesh;steps?:THREE.Mesh}>(),seat=new THREE.Vector3(),gangwayGeometry=new THREE.BoxGeometry(1,1,1),gangwayMaterial=new THREE.MeshStandardMaterial({color:0xb38b56,roughness:.93}),ports=new Map(EXPLORATION_PUBLIC_LANDINGS.map(port=>[port.id,port]));let disposed=false,frozenVisualSeconds:number|null=null;
  const release=(entry:{vehicle:FishingBoat|FishingHaulage;gangway?:THREE.Mesh;steps?:THREE.Mesh})=>{entry.gangway?.removeFromParent();entry.steps?.removeFromParent();entry.vehicle.dispose();};
  const plank=(mesh:THREE.Mesh,a:{x:number;y:number;height:number},b:{x:number;y:number;height:number},width:number,origin:{x:number;y:number})=>{const dx=b.x-a.x,dz=b.y-a.y,dy=b.height-a.height,length=Math.hypot(dx,dz),pitch=-Math.atan2(dy,length),angle=Math.atan2(dx,dz),normal={x:Math.sin(angle)*Math.sin(pitch),y:Math.cos(pitch),z:Math.cos(angle)*Math.sin(pitch)};mesh.visible=true;mesh.position.set((a.x+b.x)/2-origin.x-normal.x*.06,(a.height+b.height)/2-normal.y*.06,(a.y+b.y)/2-origin.y-normal.z*.06);mesh.rotation.set(pitch,angle,0,'YXZ');mesh.scale.set(width,.12,Math.hypot(length,dy)+.02);};
  return{group,
    update(id:string,position:{x:number;y:number},mode:ExplorationVehicleMode,heading:number,now:number,origin:{x:number;y:number},reducedMotion=false,boatPose?:ExplorationBoatPose|null,moving=true):ExplorationVehiclePose {
      const visualSeconds=reducedMotion?(frozenVisualSeconds??=now/1000):now/1000;if(!reducedMotion)frozenVisualSeconds=null;
      let entry=entries.get(id);if(mode==='walk'){if(entry)release(entry);entries.delete(id);return{foot:{x:position.x,y:heightAt(position.x,position.y)+.07,z:position.y},mode};}
      if(entry?.mode!==mode){if(entry)release(entry);entry={mode,vehicle:mode==='boat'?library.boat(id):library.haulage('horse',17)};entry.vehicle.group.name=`exploration-${mode}-${id}`;group.add(entry.vehicle.group);entries.set(id,entry);}
      const model=entry.vehicle.group;
      if(mode==='boat'){
        const vehicle=boatPose?.vehicle??position,yaw=boatPose?.heading??heading,wave=maritimeBoatPose(vehicle.x,vehicle.y,visualSeconds,yaw),base=sampleWorld(vehicle.x,vehicle.y).waterLevel+.08+wave.height;model.position.set(vehicle.x-origin.x,base,vehicle.y-origin.y);model.rotation.set(wave.pitch,yaw,wave.roll,'YXZ');(entry.vehicle as FishingBoat).animate(visualSeconds,boatPose?.boarding||!moving?0:12,boatPose?.boarding||!moving?'moored':'sailing',false);
        seat.set(.42,.48,.45).applyEuler(model.rotation);if(entry.gangway)entry.gangway.visible=false;if(entry.steps)entry.steps.visible=false;
        const stage=boatPose?.boarding,port=stage?ports.get(stage.fromPortId??stage.toPortId??''):undefined;
        if(stage&&port&&boatPose){const alpha=stage.kind==='boarding'?stage.progress:1-stage.progress,c=Math.cos(yaw),s=Math.sin(yaw),target={x:vehicle.x+.42*c+.45*s,y:vehicle.y-.42*s+.45*c},edge=pierExit(port,target),aboard=vesselEntry(port.water,target,vehicle,yaw),deck=base+seat.y,gunwale=base+.79,entryFraction=Math.max(edge.fraction+1e-5,aboard.fraction),footY=alpha<=edge.fraction?port.deckHeight+.07:alpha<=entryFraction?port.deckHeight+(gunwale-port.deckHeight)*(alpha-edge.fraction)/(entryFraction-edge.fraction)+.07:gunwale+(deck-gunwale)*(alpha-entryFraction)/(1-entryFraction)+.07;
          for(const[key,name]of[['gangway','gangway'],['steps','boarding-steps']]as const){const mesh=entry[key]??=new THREE.Mesh(gangwayGeometry,gangwayMaterial);if(!mesh.parent){mesh.name=`exploration-${name}-${id}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}}
          plank(entry.gangway!,{...edge,height:port.deckHeight},{...aboard,height:gunwale},.9,origin);plank(entry.steps!,{...aboard,height:gunwale},{...target,height:deck},.5,origin);
          return{foot:{x:boatPose.passenger.x,y:footY,z:boatPose.passenger.y},mode,boarding:true};
        }
        return{foot:{x:boatPose?.passenger.x??position.x+seat.x,y:base+seat.y+.07,z:boatPose?.passenger.y??position.y+seat.z},mode};
      }
      const base=heightAt(position.x,position.y),forward={x:Math.sin(heading),y:Math.cos(heading)},front=heightAt(position.x+forward.x*2,position.y+forward.y*2),back=heightAt(position.x-forward.x*2,position.y-forward.y*2);model.position.set(position.x-origin.x,base,position.y-origin.y);model.rotation.set(Math.max(-.25,Math.min(.25,-Math.atan2(front-back,4))),heading,0,'YXZ');(entry.vehicle as FishingHaulage).animate(visualSeconds,moving?8:0,false);
      seat.set(0,.99,-.6).applyEuler(model.rotation);return{foot:{x:position.x+seat.x,y:base+seat.y+.07,z:position.y+seat.z},mode};
    },
    retain(ids:ReadonlySet<string>){for(const[id,entry]of entries)if(!ids.has(id)){release(entry);entries.delete(id);}},
    dispose(){if(disposed)return;disposed=true;for(const entry of entries.values())release(entry);entries.clear();library.dispose();gangwayGeometry.dispose();gangwayMaterial.dispose();group.clear();group.removeFromParent();},
  };
}
