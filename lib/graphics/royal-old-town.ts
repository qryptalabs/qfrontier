import {tavernSupplyPose,type TavernSupplySchedule} from './tavern-supply-route.ts';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {OLD_TOWN_VENUES,OLD_TOWN_SQUARE,oldTownInside,type OldTownVenue} from './royal-old-town-plan.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {createLivingActorLibrary} from './living-actors.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import type {SoundEmitter} from '../audio/model.ts';

/** Walkable, open-door civic interiors. Ambient work never mints inventory. */
export function createRoyalOldTown(){
 const group=new T.Group();group.name='royal-medieval-port-quarter';
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>(),obstacles:RoyalObstacle[]=[];
 const people=createLivingActorLibrary(),actors:ReturnType<typeof people.get>[]=[],roofs:{venue:OldTownVenue;group:T.Group;light:T.PointLight}[]=[],markers:T.Mesh[]=[];
 const mat=(color:number,wood=false)=>{const m=new T.MeshStandardMaterial({color,roughness:wood?.86:.95});materials.add(m);applyRoyalSurfaceDetail(m,wood?'wood':'masonry');return m;};
 const stone=mat(0xcbbfa0),plaster=mat(0xe8d8b3),oak=mat(0x765033,true),dark=mat(0x3e3027,true),brass=mat(0xc6a35c),red=mat(0x9c4c32),clay=mat(0x91452f),blue=mat(0x315a76),green=mat(0x668347),iron=mat(0x555952),fish=mat(0x94afb0),cloth=mat(0xbd9861);
 const glow=new T.MeshStandardMaterial({color:0xffbd64,emissive:0xff7c25,emissiveIntensity:.8,roughness:.6});materials.add(glow);
 const batches=new Map<T.Group,Map<T.Material,T.BufferGeometry[]>>();
 const add=(owner:T.Group,g:T.BufferGeometry,m:T.Material)=>{let batch=batches.get(owner);if(!batch){batch=new Map();batches.set(owner,batch);}const gs=batch.get(m)??[];gs.push(g);batch.set(m,gs);};
 const box=(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,owner=group,angle=0)=>{const g=new T.BoxGeometry(w,h,d);g.rotateZ(angle);g.translate(x,y,z);add(owner,g,m);};
 const solid=(x:number,y:number,z:number,w:number,h:number,d:number)=>obstacles.push({x,z,halfWidth:w/2,halfDepth:d/2,minY:y,maxY:y+h});
 const furniture=(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{box(m,x,y+h/2,z,w,h,d);solid(x,y,z,w,h,d);};
 function sign(v:OldTownVenue){
  const x=v.doorX+(v.id==='tavern'?3.8:-.3),z=v.doorZ+(v.id==='tavern'?.8:3.5),y=v.floor+3.1;
  box(dark,x,y+.7,z,.12,.12,1.1);box(oak,x,y,z,2.6,.86,.16);box(brass,x,y+.38,z,2.6,.07,.19);box(brass,x,y-.38,z,2.6,.07,.19);
  if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');if(ctx){ctx.fillStyle='#392a1e';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#cfac69';ctx.lineWidth=5;ctx.strokeRect(9,9,494,142);ctx.fillStyle='#f5e5b4';ctx.font='bold 35px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(v.name.replace('Taberna ','').replace('Herrería ','').replace('Almacén ','').toUpperCase(),256,80,470);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.NearestFilter;textures.add(tex);const m=new T.MeshStandardMaterial({map:tex,roughness:1});materials.add(m);const g=new T.PlaneGeometry(2.5,.77);geometries.add(g);const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z+.09);group.add(mesh);}}
 }
 function host(v:OldTownVenue,x:number,z:number,role:'merchant'|'worker'|'builder',variant:number){const a=people.get(role,variant);a.group.name='old-town-host-'+v.id;a.group.scale.setScalar(.9);a.group.position.set(x,v.floor,z);a.group.rotation.y=v.id==='smithy'?Math.PI:0;const load=a.group.getObjectByName('actor-load');if(load)load.visible=false;group.add(a.group);actors.push(a);return a;}
 for(const v of OLD_TOWN_VENUES){
  const {x,z,width:w,depth:d,floor:y}=v,roof=new T.Group();roof.name='old-town-roof-'+v.id;group.add(roof);
  box(oak,x,y-.09,z,w,.18,d);for(let i=0;i<Math.floor(w/.32);i++)box(dark,x-w/2+.16+i*.32,y+.008,z,.015,.012,d);
  // Continuous walls except the actual 2.6 m door, never a painted doorway.
  const westDoor=v.id!=='tavern',doorWidth=2.8,wallH=3.6;
  if(westDoor){for(const side of[-1,1]){const length=(d-doorWidth)/2;box(stone,x-w/2,y+wallH/2,z+side*(doorWidth/2+length/2),.42,wallH,length);solid(x-w/2,y,z+side*(doorWidth/2+length/2),.42,wallH,length);}box(oak,x-w/2,y+3.25,z,.45,.7,doorWidth);solid(x-w/2,y+2.9,z,.45,.7,doorWidth);}
  else{box(stone,x-w/2,y+wallH/2,z,.42,wallH,d);solid(x-w/2,y,z,.42,wallH,d);}
  box(stone,x+w/2,y+wallH/2,z,.42,wallH,d);solid(x+w/2,y,z,.42,wallH,d);
  box(stone,x,y+wallH/2,z-d/2,w,.42+wallH,d*.0+.42);solid(x,y,z-d/2,w,wallH,.42);
  if(!westDoor){for(const side of[-1,1]){const length=(w-doorWidth)/2;box(stone,x+side*(doorWidth/2+length/2),y+wallH/2,z+d/2,length,wallH,.42);solid(x+side*(doorWidth/2+length/2),y,z+d/2,length,wallH,.42);}box(oak,x,y+3.25,z+d/2,doorWidth,.7,.5);solid(x,y+2.9,z+d/2,doorWidth,.7,.5);}
  else{box(stone,x,y+wallH/2,z+d/2,w,wallH,.42);solid(x,y,z+d/2,w,wallH,.42);}
  // Open oak leaves are parked against the facade, with iron hinges.
  for(const side of[-1,1]){const dx=westDoor?x-w/2-.3:x+side*2.3,dz=westDoor?z+side*2.3:z+d/2+.3;box(oak,dx,y+1.35,dz,westDoor?.2:1.35,2.7,westDoor?1.35:.2);for(const h of[.65,2])box(iron,dx,y+h,dz,westDoor?.24:1.4,.12,westDoor?1.4:.24);solid(dx,y,dz,westDoor?.25:1.4,2.7,westDoor?1.4:.25);}
  for(const sx of[-1,1])for(const sz of[-1,1])box(dark,x+sx*(w/2+.04),y+2,z+sz*(d/2+.04),.23,4,.23);
  for(const sz of[-1,1]){box(dark,x,y+3.6,z+sz*d/2,w+.5,.22,.25);for(let col=0;col<5;col++)box(dark,x-w/2+col*w/4,y+5,z+sz*d/2,.18,2.6,.22);box(plaster,x,y+5,z+sz*d/2,w,2.6,.18,roof);}
  for(const sx of[-1,1])box(plaster,x+sx*w/2,y+5,z,.18,2.6,d,roof);
  box(oak,x,y+3.75,z,w+.2,.18,d+.2,roof);for(const dz of[-d*.25,d*.25])box(dark,x,y+3.47,z+dz,w,.2,.24);
  for(const sz of[-1,1])for(const dx of[-w*.29,w*.29]){box(dark,x+dx,y+4.95,z+sz*(d/2+.16),1.15,1.5,.16,roof);box(blue,x+dx,y+4.95,z+sz*(d/2+.25),.9,1.2,.08,roof);box(brass,x+dx,y+4.95,z+sz*(d/2+.3),.07,1.2,.08,roof);for(const side of[-1,1])box(green,x+dx+side*.72,y+4.95,z+sz*(d/2+.17),.34,1.45,.15,roof);}
  const rise=3,half=w/2+.65,slope=Math.atan2(rise,half),length=Math.hypot(half,rise);for(const side of[-1,1]){box(red,x+side*half/2,y+6.4+rise/2,z,length,.2,d+1.2,roof,-side*slope);for(let row=0;row<11;row++)for(let col=0;col<Math.ceil(d/.7);col++)box(row%3?red:clay,x+side*half*(row+.5)/11,y+6.4+rise*(1-(row+.5)/11)+.14,z-d/2+.35+col*.7,length/11+.05,.08,.64,roof,-side*slope);}
  box(stone,x+w*.28,y+7,z-d*.2,.7,3,.8,roof);box(dark,x+w*.28,y+8.55,z-d*.2,.8,.12,.9,roof);
  // Lanterns and furnished interiors are visible at street level through the door.
  for(const dx of[-w*.28,w*.28]){box(iron,x+dx,y+3.25,z,.045,.5,.045);box(brass,x+dx,y+2.95,z,.5,.1,.5);box(glow,x+dx,y+2.68,z,.32,.43,.32);box(brass,x+dx,y+2.42,z,.5,.1,.5);}
  const light=new T.PointLight(0xffc57c,14,18,2);light.position.set(x,y+2.8,z);light.visible=false;group.add(light);roofs.push({venue:v,group:roof,light});sign(v);
  const markerGeometry=new T.ConeGeometry(.42,1,4);markerGeometry.rotateZ(Math.PI);geometries.add(markerGeometry);const marker=new T.Mesh(markerGeometry,brass);marker.name='old-town-open-door-marker-'+v.id;marker.position.set(v.doorX+(westDoor?-1.1:0),y+3.7,v.doorZ+(westDoor?0:1.1));marker.userData.baseY=marker.position.y;group.add(marker);markers.push(marker);
  if(v.id==='tavern'){
   furniture(oak,x,y,z-3.4,10,1.05,.9);for(const dx of[-5,5])for(const dz of[.4,3.8]){furniture(oak,x+dx,y,z+dz,2.5,.8,1.3);for(const side of[-1,1])furniture(dark,x+dx,y,z+dz+side*1.1,2.6,.45,.35);for(const ox of[-.65,.65])box(cloth,x+dx+ox,y+.92,z+dz,.21,.24,.21);}
   box(stone,x+6,y+1,z-4.1,2,2,1.2);box(dark,x+6,y+.7,z-3.45,1.3,1.2,.08);box(glow,x+6,y+.34,z-3.35,.95,.35,.15);solid(x+6,y,z-4,2,2,1.5);for(let i=0;i<7;i++){box(blue,x-3.5+i*1.1,y+1.19,z-3.4,.2,.28,.2);box(blue,x-3.5+i*1.1,y+1.37,z-3.4,.1,.12,.1);}host(v,x,z-4.55,'merchant',24);
  }else if(v.id==='smithy'){
   furniture(stone,x+4,y,z-4,3,1.7,2.8);box(dark,x+4,y+1.74,z-4,2.5,.08,2.3);box(glow,x+4,y+1.85,z-4,2,.13,1.7);box(iron,x+4,y+2.6,z-4,3,.25,2.8);box(stone,x+4,y+3,z-5,.8,6,.9,roof);
   furniture(iron,x,y,z-1,1.3,.88,.72);box(iron,x-.75,y+.85,z-1,.45,.3,.42);furniture(oak,x+4,y,z+4.8,4,.9,1.2);for(let i=0;i<8;i++){box(iron,x+2.4+i*.42,y+1,z+4.8,.18,.12,.75);box(dark,x-4,y+1.7,z-5+i*.55,.13,1,.15);box(iron,x-4,y+2.2,z-5+i*.55,.5,.2,.15);}host(v,x,z+.4,'builder',31);
  }else{
   for(const sx of[-1,1])for(const zz of[-4,1,5]){if(sx<0&&zz===1)continue;const xx=x+sx*4.7;for(const level of[.25,1.3,2.3]){furniture(oak,xx,y+level,z+zz,2.7,.15,2);for(let i=0;i<3;i++)box(level>1?cloth:fish,xx-.8+i*.8,y+level+.3,z+zz,.65,.45,.75);}for(const ox of[-1.3,1.3])box(dark,xx+ox,y+1.5,z+zz,.15,3,.15);solid(xx,y,z+zz,2.7,3,2);}
   furniture(oak,x+1,y,z-6.2,5,.9,1);host(v,x+2,z-6.8,'worker',19);box(cloth,x+1,y+1.01,z-6.2,2,.025,.6);
  }
 }
 // Market square: a well, produce stalls and hanging pennants leave its walking cross free.
 const q=OLD_TOWN_SQUARE;furniture(stone,q.x-7,.92,q.z-5,2.7,.8,2.7);box(blue,q.x-7,1.77,q.z-5,2.2,.03,2.2);for(const sign of[-1,1]){box(oak,q.x-7+sign*1.25,2.5,q.z-5,.16,3.2,.16);box(red,q.x-7+sign*.8,4.4,q.z-5,1.9,.15,3.2,group,-sign*.5);}
 for(const x of[80,94]){furniture(oak,x,.92,194,4,.9,1.3);for(let i=0;i<9;i++)box(i%2?green:cloth,x-1.6+i*.4,2,194,.28,.23,.5);for(const side of[-1,1])box(dark,x+side*2.2,2.3,194,.1,2.8,.1);box(x<90?red:blue,x,3.6,194,4.7,.14,2.4);}
 // High clotheslines, banners and stacked barrels give alleys domestic scale.
 for(const [x,z]of[[82,158],[93,211],[87,243]]){box(dark,x,5.1,z,17,.045,.045);for(let i=0;i<6;i++)box(i%3?cloth:blue,x-6+i*2.3,4.65,z,.9,.9,.035);}
 for(const [x,z]of[[54,174],[53,247],[126,228],[123,259]]){for(const dx of[-.45,.45]){const g=new T.CylinderGeometry(.34,.39,.85,8);g.translate(x+dx,1.345,z);add(group,g,oak);for(const y of[1.1,1.55]){const ring=new T.CylinderGeometry(.4,.4,.06,8);ring.translate(x+dx,y,z);add(group,ring,iron);}}solid(x,.92,z,1.7,.9,.8);}
 for(const [i,p]of[{x:79,z:147,y:1.2},{x:89,z:147,y:1.2},{x:80,z:192.5,y:.92},{x:94,z:192.5,y:.92},{x:44,z:230,y:.92}].entries()){const a=people.get(i%2?'merchant':'worker',50+i);a.group.name=i<2?'old-town-tavern-patron-'+i:'old-town-stallkeeper-'+i;a.group.scale.setScalar(.9);a.group.position.set(p.x,p.y,p.z);a.group.rotation.y=Math.PI;const load=a.group.getObjectByName('actor-load');if(load)load.visible=false;group.add(a.group);actors.push(a);}
 for(const [owner,parts]of batches)for(const [m,gs]of parts){const g=mergeGeometries(gs,false)!;gs.forEach(g=>g.dispose());geometries.add(g);const mesh=new T.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;owner.add(mesh);}
 const courier=people.get('worker',61);courier.group.name='ribera-supply-courier';courier.group.scale.setScalar(.9);courier.group.visible=false;group.add(courier.group);
 let supply:TavernSupplySchedule|null=null,supplyNow=0,supplyAnchor=0,deliveryPose:ReturnType<typeof tavernSupplyPose>|null=null;
 const pantryStock:T.Group[]=[];for(let i=0;i<6;i++){const g=new T.Group();g.name='tavern-real-supply-'+i;g.visible=false;group.add(g);pantryStock.push(g);box(cloth,86.2+i*.4,1.25,137,.3,.55,.36,g);box(blue,86.2+i*.4,1.61,137,.18,.23,.18,g);}
 for(const owner of pantryStock){const parts=batches.get(owner);if(!parts)continue;for(const [m,gs]of parts){const g=mergeGeometries(gs,false)!;gs.forEach(g=>g.dispose());geometries.add(g);const mesh=new T.Mesh(g,m);mesh.castShadow=true;owner.add(mesh);}}
 let focus={x:0,z:0},disposed=false,hammering=false;
 return{group,obstacles,venues:OLD_TOWN_VENUES,setSupply(view:{worker:TavernSupplySchedule|null;batches:number},now:number){if(now<supplyNow)return;supply=view.worker;supplyNow=now;supplyAnchor=typeof performance!=='undefined'?performance.now():0;pantryStock.forEach((g,i)=>g.visible=i<view.batches);},setFocus(x:number,z:number,cutaway=false){focus={x,z};const inside=oldTownInside(x,z);for(const r of roofs){r.group.visible=!cutaway||inside?.id!==r.venue.id;r.light.visible=inside?.id===r.venue.id;}},sounds():SoundEmitter[]{return hammering&&Math.hypot(focus.x-138,focus.z-190)<30?[{id:'old-town-forge',kind:'hammer',x:138,y:1.8,z:189,inside:true,radius:20,volume:.4}]:[];},update(t:number,reduced:boolean){if(supply){deliveryPose=tavernSupplyPose(supply,supplyNow+(typeof performance!=='undefined'?performance.now()-supplyAnchor:0));courier.group.visible=deliveryPose.active;courier.group.position.set(deliveryPose.x,deliveryPose.y,deliveryPose.z);courier.group.rotation.y=deliveryPose.yaw;courier.animate(reduced?0:t,!reduced&&deliveryPose.walking,!reduced&&deliveryPose.working);const load=courier.group.getObjectByName('actor-load');if(load)load.visible=deliveryPose.carrying;for(const side of['left','right']){const arm=courier.group.getObjectByName('actor-'+side+'-shoulder'),elbow=courier.group.getObjectByName('actor-'+side+'-elbow');if(arm)arm.rotation.x=deliveryPose.carrying?-.75:deliveryPose.walking?Math.sin(t*6.4)*(side==='left'?1:-1)*.35:-.1;if(elbow)elbow.rotation.x=deliveryPose.carrying?-.65:-.15;}}else{courier.group.visible=false;deliveryPose=null;}hammering=!reduced&&t%8<6;for(const marker of markers){marker.position.y=marker.userData.baseY+(reduced?0:Math.sin(t*2)*.12);marker.rotation.y=reduced?0:t*.5;}for(const [i,a]of actors.entries()){a.animate(reduced?0:t,false,i===1&&hammering);if(i!==1)for(const side of['left','right']){const arm=a.group.getObjectByName('actor-'+side+'-shoulder'),elbow=a.group.getObjectByName('actor-'+side+'-elbow');if(arm)arm.rotation.x=-.1;if(elbow)elbow.rotation.x=-.17;}if(i===3||i===4)for(const side of['left','right']){const hip=a.group.getObjectByName('actor-'+side+'-hip'),knee=a.group.getObjectByName('actor-'+side+'-knee');if(hip)hip.rotation.x=-1.35;if(knee)knee.rotation.x=1.4;}}},colliders(){return [...actors,...(courier.group.visible?[courier]:[])].map(a=>({x:a.group.position.x,z:a.group.position.z,halfWidth:.32,halfDepth:.32,minY:a.group.position.y,maxY:a.group.position.y+1.9,allowEgress:true}));},dispose(){if(disposed)return;disposed=true;group.removeFromParent();courier.dispose();actors.forEach(a=>a.dispose());people.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();}};
}
