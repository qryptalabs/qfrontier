import * as THREE from 'three';
import {explorationLegAt,explorationHoldAt,type ExplorationMovement,type PublicExplorationState} from '../mvp/exploration-data.ts';
import {publicInfrastructureAt,publicRoadAt} from '../mvp/exploration-network-data.ts';
import {sampleWorld} from './world-geography.ts';
import {physicalTerrainSample} from './world-collision.ts';
import type {SceneInput} from './scene-data.ts';

interface TrafficHold {pointIndex:number;startsAt:number;endsAt:number;resourceId:string}
export interface ExplorationTrafficLayerOptions {holdAt?:(movement:ExplorationMovement|undefined,now:number)=>TrafficHold|undefined|null}
const RADIUS=96,MAX_QUADS=512,MAX_MARKERS=64,HALF_WIDTH=.9;

/** A transient guide for confirmed home access, never a constructed public road or collision surface. */
export function createExplorationTrafficLayer(heightAt:(x:number,y:number)=>number,options:ExplorationTrafficLayerOptions={}){
  const group=new THREE.Group();group.name='active-exploration-access-and-yields';
  const holdAt=options.holdAt??explorationHoldAt;
  let geometry=new THREE.BufferGeometry();
  const material=new THREE.MeshStandardMaterial({color:0xb49e74,roughness:1,transparent:true,opacity:.32,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),trail=new THREE.Mesh(geometry,material);
  trail.name='sendero-de-incorporacion-activo';trail.userData.label='Sendero de incorporación activo';trail.receiveShadow=true;group.add(trail);
  const ringGeometry=new THREE.RingGeometry(.8,1,24);ringGeometry.rotateX(-Math.PI/2);
  const ringMaterial=new THREE.MeshBasicMaterial({color:0xe9bb66,transparent:true,opacity:.82,depthWrite:false}),rings=new THREE.InstancedMesh(ringGeometry,ringMaterial,MAX_MARKERS),matrix=new THREE.Object3D();
  rings.name='traffic-yield-markers';rings.userData.label='Cediendo el paso';rings.count=0;group.add(rings);
  let key='',anchor={x:0,y:0},disposed=false;
  function actors(input:SceneInput){return(input.view.habitable?.actors??[]).map(actor=>({id:actor.playerId,state:actor.playerId===input.player?.id?input.player?.habitable?.exploration??actor.state.exploration:actor.state.exploration})).filter((actor):actor is{id:string;state:PublicExplorationState}=>!!actor.state);}
  function segments(state:PublicExplorationState,now:number){
    const move=state.movement;if(!move||now>=move.endsAt)return[];
    const leg=explorationLegAt(state,now),indices=new Set<number>();
    if(leg&&now>=leg.startsAt&&leg.mode!=='boat'&&leg.routeId?.startsWith('home-access:'))for(let i=leg.fromIndex+1;i<=leg.toIndex;i++)indices.add(i);
    // Only the two already-confirmed walking segments entering/leaving a lay-by.
    // The road itself is not repainted and no scenery is cleared by this layer.
    for(const hold of move.holds??[]){if(hold.endsAt<=now)continue;const land=move.legs?.find(part=>part.mode==='walk'&&hold.pointIndex>=part.fromIndex&&hold.pointIndex<=part.toIndex&&hold.startsAt>=part.startsAt&&hold.endsAt<=part.endsAt);if(!land)continue;
      if(hold.pointIndex>land.fromIndex)indices.add(hold.pointIndex);if(hold.pointIndex<land.toIndex)indices.add(hold.pointIndex+1);
    }
    return[...indices].sort((a,b)=>a-b).map(index=>({a:move.points[index-1],b:move.points[index]}));
  }
  function rebuild(entries:ReturnType<typeof actors>,now:number,focus:{x:number;y:number}){
    const vertices:number[]=[];let quads=0;
    for(const actor of entries){
      for(const{a,b}of segments(actor.state,now)){
        if(quads>=MAX_QUADS)break;
        const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<1e-6)continue;
        if(Math.max(a.x,b.x)<focus.x-RADIUS||Math.min(a.x,b.x)>focus.x+RADIUS||Math.max(a.y,b.y)<focus.y-RADIUS||Math.min(a.y,b.y)>focus.y+RADIUS)continue;
        const count=Math.ceil(length/1.25),sx=dy/length*HALF_WIDTH,sy=-dx/length*HALF_WIDTH;
        for(let i=0;i<count&&quads<MAX_QUADS;i++){
          const t=(i+.5)/count,center={x:a.x+dx*t,y:a.y+dy*t};if(Math.hypot(center.x-focus.x,center.y-focus.y)>RADIUS||publicInfrastructureAt(center)||publicRoadAt(center)||sampleWorld(center.x,center.y).water||!physicalTerrainSample(center).walkable)continue;
          const p={x:a.x+dx*i/count,y:a.y+dy*i/count},q={x:a.x+dx*(i+1)/count,y:a.y+dy*(i+1)/count},corners=[[p.x-sx,p.y-sy],[q.x-sx,q.y-sy],[q.x+sx,q.y+sy],[p.x+sx,p.y+sy]];
          // Support comes from the currently drawn terrain; this guide grants no traversability.
          if(corners.some(([x,y])=>sampleWorld(x,y).water||!physicalTerrainSample({x,y}).walkable))continue;
          const face=corners.map(([x,y])=>[x-anchor.x,heightAt(x,y)+.024,y-anchor.y]);
          if(face.some(vertex=>!Number.isFinite(vertex[1])))continue;
          for(const index of[0,1,2,0,2,3])vertices.push(...face[index]);quads++;
        }
      }
    }
    const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));next.computeVertexNormals();next.computeBoundingSphere();const previous=geometry;geometry=next;trail.geometry=next;previous.dispose();trail.visible=quads>0;
  }
  return{group,
    update(input:SceneInput,now:number,focus:{x:number;y:number},origin:{x:number;y:number},terrainRevision=''){
      if(disposed)return;
      const entries=actors(input),nextAnchor={x:Math.floor(focus.x/64)*64,y:Math.floor(focus.y/64)*64},clip={x:Math.floor(focus.x/16),y:Math.floor(focus.y/16)},active=entries.map(actor=>({id:actor.id,segments:segments(actor.state,now)})).filter(actor=>actor.segments.length),nextKey=JSON.stringify([nextAnchor,clip,terrainRevision,active]);
      if(nextKey!==key){key=nextKey;anchor=nextAnchor;rebuild(entries,now,focus);}group.position.set(anchor.x-origin.x,0,anchor.y-origin.y);
      let count=0;
      for(const actor of entries){const hold=holdAt(actor.state.movement,now),move=actor.state.movement;if(!hold||!move||count>=MAX_MARKERS)continue;const point=move.points[hold.pointIndex];if(!point||Math.hypot(point.x-focus.x,point.y-focus.y)>RADIUS)continue;matrix.position.set(point.x-anchor.x,heightAt(point.x,point.y)+.19,point.y-anchor.y);matrix.updateMatrix();rings.setMatrixAt(count++,matrix.matrix);}
      rings.count=count;rings.visible=count>0;rings.instanceMatrix.needsUpdate=true;if(count)rings.computeBoundingSphere();
    },
    dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();rings.dispose();ringGeometry.dispose();ringMaterial.dispose();group.clear();group.removeFromParent();},
  };
}
