import { geographicWorldBounds } from './world-navigation.ts';
import type { Camera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraMode = '2d' | '3d';
export const WORLD_CAMERA_FOV = 42;
export const WORLD_CAMERA_DEFAULT_TILT = 53;
export function cameraTilt(value:number):number {
  return Number.isFinite(value)?Math.max(30,Math.min(75,value)):WORLD_CAMERA_DEFAULT_TILT;
}
/** Drain public OrbitControls damping without moving its observed position.
 * The caller suppresses change callbacks while this update is performed. */
export function flushCameraMomentum(controls:OrbitControls<Camera>):void {
  const target=controls.target.clone(),camera=controls.object,position=camera.position.clone(),orientation=camera.quaternion.clone(),damping=controls.enableDamping;
  try{controls.enableDamping=false;controls.update();}
  finally{controls.enableDamping=damping;controls.target.copy(target);camera.position.copy(position);camera.quaternion.copy(orientation);camera.updateMatrixWorld();}
}
export function worldViewHalfHeight(level:number):number {
  return 95*Math.pow(.5,(Math.max(5.6,Math.min(10,Number.isFinite(level)?level:7))-6)*.74);
}
/** Equal target-plane scale lets either projection keep the observed place stable. */
export function worldCameraFrame(level:number,aspect:number,mode:CameraMode,tilt=53,heading=.636){
  const halfHeight=worldViewHalfHeight(level),safeAspect=Number.isFinite(aspect)?Math.max(.1,Math.min(10,aspect)):1;
  const elevation=mode==='2d'?90:cameraTilt(tilt),distance=mode==='2d'?500:halfHeight/Math.tan(WORLD_CAMERA_FOV*Math.PI/360),a=elevation*Math.PI/180;
  const azimuth=Number.isFinite(heading)?heading:.636;
  return{halfHeight,halfWidth:halfHeight*safeAspect,aspect:safeAspect,elevation,distance,
    offset:{x:Math.sin(azimuth)*Math.cos(a)*distance,y:Math.sin(a)*distance,z:Math.cos(azimuth)*Math.cos(a)*distance}};
}
/** Stream the visible ground polygon through the same eye-space depth used by fog.
 * Near corners remain covered even when the camera is tilted toward the horizon. */
export function worldStreamWindow(point:{x:number;y:number},level:number,aspect:number,mode:CameraMode,tilt:number,heading:number,performance=false){
  const frame=worldCameraFrame(level,aspect,mode,tilt,heading),a=(Number.isFinite(heading)?heading:.636),sin=Math.sin(a),cos=Math.cos(a);
  const anchor={x:Number.isFinite(point.x)?point.x:0,y:Number.isFinite(point.y)?point.y:0};
  const fogNear=mode==='2d'?1000:frame.distance+Math.min(64,frame.halfHeight*.55);
  const fogFar=mode==='2d'?2000:frame.distance+Math.max(75,Math.min(performance?135:175,frame.halfHeight*1.9));
  const points:{x:number;y:number}[]=[];
  // Include the top-down footprint as well so camera transitions cannot reveal an edge.
  for(const u of[-1,1])for(const v of[-1,1])points.push({x:cos*u*frame.halfWidth-sin*v*frame.halfHeight,y:-sin*u*frame.halfWidth-cos*v*frame.halfHeight});
  if(mode==='3d'){
    const e=frame.elevation*Math.PI/180,se=Math.sin(e),ce=Math.cos(e),tan=Math.tan(WORLD_CAMERA_FOV*Math.PI/360),eyeY=frame.distance*se;
    // The height margin covers stepped cliffs and roofs above the focus plane.
    for(const plane of[-32,0,32]){
      if(eyeY-plane<=.5)continue;
      const highest=Math.min(1,(se-(eyeY-plane)/fogFar)/(tan*ce));
      for(const u of[-1,1])for(const v of[-1,highest]){
        const dy=-se+v*tan*ce,t=(eyeY-plane)/-dy;
        points.push({x:frame.offset.x+t*(-sin*ce+u*tan*frame.aspect*cos-v*tan*sin*se),y:frame.offset.z+t*(-cos*ce-u*tan*frame.aspect*sin-v*tan*cos*se)});
      }
    }
  }
  const padding=24,minX=anchor.x+Math.min(...points.map(p=>p.x))-padding,maxX=anchor.x+Math.max(...points.map(p=>p.x))+padding,minY=anchor.y+Math.min(...points.map(p=>p.y))-padding,maxY=anchor.y+Math.max(...points.map(p=>p.y))+padding;
  const minCx=Math.floor(minX/64),maxCx=Math.floor(maxX/64),minCy=Math.floor(minY/64),maxCy=Math.floor(maxY/64);
  const center={x:Math.max(geographicWorldBounds.minX,Math.min(geographicWorldBounds.maxX,(minX+maxX)/2)),y:Math.max(geographicWorldBounds.minY,Math.min(geographicWorldBounds.maxY,(minY+maxY)/2))};
  return{center,radius:Math.ceil(Math.max(maxCx-minCx,maxCy-minCy)/2),reach:Math.hypot(center.x-anchor.x,center.y-anchor.y),minCx,maxCx,minCy,maxCy,fogNear,fogFar};
}

/** Walkers keep one owner chunk while their routes cross neighboring chunks.
 * Retain that small district whenever any of it intersects the camera window. */
export function retainedSettlementChunks(view:{minCx:number;maxCx:number;minCy:number;maxCy:number},places:readonly {x:number;y:number;width:number;depth:number}[]):{cx:number;cy:number}[]{
  const result=new Map<string,{cx:number;cy:number}>();
  for(const place of places){
    const minCx=Math.floor((place.x-place.width/2)/64),maxCx=Math.floor((place.x+place.width/2)/64),minCy=Math.floor((place.y-place.depth/2)/64),maxCy=Math.floor((place.y+place.depth/2)/64);
    if(maxCx<view.minCx||minCx>view.maxCx||maxCy<view.minCy||minCy>view.maxCy)continue;
    for(let cx=minCx;cx<=maxCx;cx++)for(let cy=minCy;cy<=maxCy;cy++)result.set(`${cx}:${cy}`,{cx,cy});
  }
  return [...result.values()];
}
