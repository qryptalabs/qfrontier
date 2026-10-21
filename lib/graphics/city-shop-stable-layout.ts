import type {RoyalObstacle} from './royal-harbor-layout.ts';

/** The existing yard, in metres. No saved asset position or pickup is moved. */
export const CITY_STABLE=Object.freeze({x:-123,z:149.8,y:.92,width:24,depth:8,height:7,frontZ:153.8,
 entrance:{x:-131,y:.92,z:157},inside:{x:-131,y:.92,z:150},garage:{x:-120,y:.92,z:150}});
export const stableInside=(x:number,z:number)=>x>-134.6&&x<-111.4&&z>146.2&&z<154;

/** Solids match the prepared shell; the two front openings stay unobstructed. */
export function cityStableObstacles():RoyalObstacle[]{
 const solid=(x:number,z:number,w:number,d:number,h:number,minY=.92):RoyalObstacle=>({x,z,halfWidth:w/2,halfDepth:d/2,minY,maxY:minY+h,allowEgress:true});
 return[
  solid(-123,145.8,24,.45,4.4),solid(-135,149.8,.45,8,4.4),solid(-111,149.8,.45,8,4.4),
  solid(-128,153.8,.35,.35,4.4),solid(-128,149.4,.16,5.4,1.3),
  solid(-127.9,152.55,.2,2.3,2.9),
  solid(-134,149.1,.65,3.2,.65),solid(-131.4,146.55,3.8,.7,1.05),
  solid(-113,146.55,2.8,.7,1.25),
  // Clearance above a horse, its harness and the player; it clips camera booms.
  solid(-123,149.8,24,8,2.6,5.32),
 ];
}
