import * as THREE from 'three';
import {royalRiverEdge} from './royal-harbor-layout.ts';

export const ROYAL_HARBOR_WATER_EXTENT=Object.freeze({riverStartZ:-120,oceanStartZ:760,maxZ:30000,halfWidth:18000});
/** The visible banks are straight segments sampled every fifteen metres from
 * z=-125. Reuse those exact segments, including the short inlet at -120. */
export function royalHarborBankEdge(z:number){
  const lower=-125+Math.floor((z+125)/15)*15,t=(z-lower)/15;
  return THREE.MathUtils.lerp(royalRiverEdge(lower),royalRiverEdge(Math.min(760,lower+15)),t);
}
export function royalHarborWaterAt(x:number,z:number){
  const e=ROYAL_HARBOR_WATER_EXTENT;
  return Number.isFinite(x+z)&&Math.abs(x)<=e.halfWidth&&z>=e.riverStartZ&&z<=e.maxZ&&(z>=e.oceanStartZ||Math.abs(x)<=royalHarborBankEdge(z));
}

/** Water has a physical shoreline instead of an infinite plane below land.
 * Four metres between the old sea plane and distant terrain were smaller
 * than the perspective depth precision, causing cyan terrain stripes. This
 * removes the overlapping water completely, for both rendering qualities.
 * Reflector owns a local XY plane; a plain water mesh owns the rotated XZ one. */
export function createRoyalHarborWaterGeometry(orientation:'world'|'reflector'='world'){
  const e=ROYAL_HARBOR_WATER_EXTENT,zs:number[]=[e.riverStartZ];for(let z=-110;z<=e.oceanStartZ;z+=15)zs.push(z);
  const outline:[number,number][]=[[-e.halfWidth,e.maxZ],[e.halfWidth,e.maxZ],[e.halfWidth,e.oceanStartZ]];
  for(const z of [...zs].reverse())outline.push([royalHarborBankEdge(z),z]);
  for(const z of zs)outline.push([-royalHarborBankEdge(z),z]);
  outline.push([-e.halfWidth,e.oceanStartZ]);
  const shape=new THREE.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geometry=new THREE.ShapeGeometry(shape,1);geometry.name='royal-harbor-coastline-water';
  if(orientation==='world')geometry.rotateX(-Math.PI/2);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.royalWater={...e,orientation,shoreline:'rendered-bank-segments',underCitadel:false};
  return geometry;
}
