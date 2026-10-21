import {shopHandlingPose,type ShopHandlingSchedule} from './shop-handling-motion.ts';
import {createShopTransport} from './city-shop-transport.ts';
export {createShopTransport} from './city-shop-transport.ts';
import {createCityGranary} from './city-granary.ts';
import {createCityStable} from './city-shop-stable.ts';
import {createTripoVoxelPilot,VOXEL_PILOT_SPECS} from './tripo-voxel-pilot.ts';
import {createTripoResidentLibrary} from './tripo-resident.ts';
import {shopPackerMotion} from './shop-packer-motion.ts';
import {createShopMerchantMotion} from './shop-merchant-motion.ts';
import * as THREE from 'three';

import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

import {ROYAL_SHOP as S,shopInside,shopObstacles,shopAssetPosition,shopAssetObstacles} from './city-shop-layout.ts';

import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';

import {createLivingActorLibrary} from './living-actors.ts';

import {createShopInterior} from './city-shop-interior.ts';

import {SHOP_SITES,siteOffset,type ShopCity} from './city-shop-sites.ts';

import type {ShopSnapshot} from '../mvp/city-shop.ts';



/** One building shared by the globe and the walking scene; interiors are near-only. */

export function createCityShopModel(city:ShopCity='corona-del-alba'){

 const site=SHOP_SITES[city],offset=siteOffset(city);

 const group=new THREE.Group();group.name=city==='corona-del-alba'?'city-shop-suministros-del-alba':'city-shop-la-espiga-del-norte';group.position.set(offset.x,offset.y,offset.z);const detail=new THREE.Group(),roof=new THREE.Group(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();group.add(detail,roof);

 const cabinetFallback=new THREE.Group();cabinetFallback.name='shop-original-back-cabinet';group.add(cabinetFallback);
 const cube=new THREE.BoxGeometry();geometries.add(cube);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),roofBatches=new Map<THREE.Material,THREE.BufferGeometry[]>(),cabinetBatches=new Map<THREE.Material,THREE.BufferGeometry[]>();

 const mat=(color:number,kind?:'wood'|'masonry')=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85});materials.add(m);if(kind)applyRoyalSurfaceDetail(m,kind);return m;};

 const stone=mat(0xbfb79e,'masonry'),wood=mat(0x78502f,'wood'),lightWood=mat(0xb28a54,'wood'),cream=mat(0xe5d9b2),blue=mat(city==='paso-del-norte'?0x355a3b:0x244c60),gold=mat(0xd6b163),tile=mat(0xa85736),red=mat(0x95462c);

 function box(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,target=detail,rx=0){const geo=cube.clone();geo.scale(w,h,d);geo.rotateX(rx);geo.translate(x,y,z);const batchesFor=target===roof?roofBatches:target===cabinetFallback?cabinetBatches:batches;if(!batchesFor.has(m))batchesFor.set(m,[]);batchesFor.get(m)!.push(geo);}

 const y=S.y;

 box(stone,-84,y-.16,160,20.5,.32,18.5);for(const x of[-94,-74])box(cream,x,y+2.2,160,.3,4.4,18);box(cream,-84,y+2.2,151,20,4.4,.3);

 for(const x of[-89.9,-78.1])box(cream,x,y+2.2,169,8.2,4.4,.3);box(wood,-84,y+3.73,169,3.7,.35,.42);

 for(const x of[-94,-89,-79,-74])box(wood,x,y+2.2,169.22,.22,4.4,.25);for(const h of[.15,2.7,4.35])box(wood,-84,y+h,169.2,20,.2,.25);

 for(const side of[-1,1]){box(wood,-84+side*1.8,y+1.6,169,.15,3.2,.45);box(wood,-84+side*2.55,y+1.6,169.15,1.25,3.1,.18);for(const h of[.45,1.55,2.65])box(gold,-84+side*2.55,y+h,169.29,1.14,.05,.05);}

 for(const x of[-90,-78]){box(blue,x,y+1.5,169.24,3.7,2,.12);for(const dx of[-1.85,0,1.85])box(gold,x+dx,y+1.5,169.34,.06,2.1,.06);box(wood,x,y+1.5,169.35,3.8,.08,.08);}

 // The inner ceiling stays visible when the exterior roof is cut away for walking.

 box(cream,-84,y+4.4,160,20,.14,18);for(const x of[-93,-89,-84,-79,-75])box(wood,x,y+4.23,160,.22,.2,17.7);

 for(const z of[151.4,155,160,165,168.6])box(lightWood,-84,y+4.23,z,19.7,.2,.18);

 // A pitched tiled roof, with exposed rafters, carved cornices and a blue awning.

 for(const side of[-1,1]){box(tile,-84,y+5.2,160+side*4.7,22,.24,10.1,roof,side*.24);for(let x=-94.5;x<=-73.5;x+=.6)box(lightWood,x,y+4.5,160+side*8.8,.1,.2,1.9,roof);}

 box(gold,-84,y+6.4,160,22,.18,.2,roof);box(blue,-84,y+3.3,171,7,.12,3.4,detail,-.11);for(const x of[-87.5,-80.5])box(wood,x,y+1.5,172.5,.15,3,.15);

 box(wood,-84,y+3.65,169.65,10,.95,.2);box(gold,-84,y+4.16,169.67,10.3,.08,.26);box(gold,-84,y+3.15,169.67,10.3,.08,.26);

 // Shelves, separate objects on each shelf, counter, scales and the ledger.

 for(const x of[-92.9,-75.1]){for(const z of[153.8,158.8,163.8])box(wood,x,y+1.3,z,1,2.6,.12);for(const h of[.3,1.05,1.8,2.55])box(lightWood,x,y+h,159,1.3,.13,11.6);}

 box(wood,-84,y+.48,153.1,6.4,.96,.85);box(lightWood,-84,y+1.04,153.1,6.7,.14,1.05);box(blue,-84,y+.55,153.58,4.6,.55,.03);box(gold,-84,y+.55,153.61,4.3,.035,.04);

 box(cream,-85.3,y+1.18,153.1,.75,.1,.5);box(gold,-82.5,y+1.4,153.1,.1,.7,.1);box(gold,-82.5,y+1.7,153.1,1.2,.06,.06);for(const x of[-83,-82])box(gold,x,y+1.5,153.1,.35,.05,.35);

 for(const x of[-89,-79])for(let i=0;i<3;i++){const h=y+.42+i*.7,target=x===-89?cabinetFallback:detail;box(lightWood,x,h,151.9,2,.65,.9,target);for(const dx of[-.9,.9])box(wood,x+dx,h,152.37,.09,.62,.06,target);for(const dy of[-.27,.27])box(wood,x,h+dy,152.37,1.9,.07,.06,target);for(const dx of[-.85,.85])for(const dy of[-.24,.24])box(gold,x+dx,h+dy,152.41,.035,.035,.025,target);}

 for(let x=-92;x<=-76;x+=1)for(let z=155;z<168;z+=1)box(stone,x,y-.025,z,.98,.05,.98);

 box(red,-84,y+.01,161,3,.035,11);for(const x of[-85.38,-82.62])box(gold,x,y+.035,161,.08,.025,10.8);


 // Forecourt, public footpath, fenced collection yard and sheltered stable.

 box(stone,-84,.86,174.5,8,.12,11);box(stone,-123,.86,172.2,25,.12,15.6);

 for(const x of[-136,-110]){for(let z=147;z<=168;z+=3)box(wood,x,y+.65,z,.15,1.3,.15);for(const h of[.4,1.05])box(lightWood,x,y+h,157.5,.12,.12,21);}

 if(city==='paso-del-norte'){for(let x=-136;x<=-110;x+=3)box(wood,x,y+.65,147,.15,1.3,.15);for(const h of[.4,1.05])box(lightWood,-123,y+h,147,26,.12,.12);}

 if(city==='paso-del-norte'){box(tile,-123,y+3.8,150,25,.2,6);for(const x of[-135,-129,-123,-117,-111])box(wood,x,y+1.8,151,.2,3.6,.2);for(const x of[-131,-123,-115])box(wood,x,y+.5,148,2,.8,.8);}
 const stable=city==='corona-del-alba'?createCityStable():null;if(stable)group.add(stable.group);

 for(let i=0;i<3;i++){const x=-132+i*8;for(const z of[158,168])box(gold,x,y+.025,z,5,.025,.08);for(const dx of[-2.5,2.5])box(gold,x+dx,y+.025,163,.08,.025,10);}

 for(const [m,parts] of batches){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;detail.add(mesh);}

 for(const [m,parts] of roofBatches){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;roof.add(mesh);}
 for(const [m,parts] of cabinetBatches){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;cabinetFallback.add(mesh);}
 const shelfPilot=city==='corona-del-alba'?createTripoVoxelPilot(VOXEL_PILOT_SPECS.shelf,[{x:-89,y,z:151.9}],cabinetFallback):null;if(shelfPilot)group.add(shelfPilot.group);

 const sign=new THREE.Group();sign.name='shop-identification';group.add(sign);

 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=144;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#253e3d';ctx.fillRect(0,0,1024,144);ctx.strokeStyle='#d6b163';ctx.lineWidth=5;ctx.strokeRect(9,9,1006,126);ctx.fillStyle='#f1e5bd';ctx.font='bold 53px Georgia';ctx.textAlign='center';ctx.fillText(site.name.toUpperCase(),512,75);ctx.font='22px Georgia';ctx.fillStyle='#d6b163';ctx.fillText(city==='paso-del-norte'?'COSECHAS · SEMILLAS · CARRETAS':'RECURSOS · CABALLERIZAS · CARRUAJES',512,115);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);const m=new THREE.MeshBasicMaterial({map:texture});materials.add(m);const g=new THREE.PlaneGeometry(9.8,1.38);geometries.add(g);const board=new THREE.Mesh(g,m);board.position.set(-84,y+4,169.82);sign.add(board);}}

 const doors:THREE.Group[]=[];for(const side of[-1,1]){const hinge=new THREE.Group();hinge.position.set(-84+side*1.8,y,169);group.add(hinge);for(const [m,trim]of [[wood,false],[gold,true]]as const){const pieces:THREE.BufferGeometry[]=[];const add=(x:number,yy:number,w:number,h:number,d:number)=>{const g=cube.clone();g.scale(w,h,d);g.translate(x,yy,0);pieces.push(g);};if(!trim)add(-side*.88,1.6,1.76,3.2,.14);else{for(const h of[.24,1.58,2.95])add(-side*.88,h,1.55,.055,.2);for(const x of[.14,1.6])add(-side*x,1.6,.055,2.76,.2);}const g=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;hinge.add(mesh);}doors.push(hinge);}
 const packing=new THREE.Group();packing.name='physical-order-collection';group.add(packing);const table=new THREE.Mesh(cube,wood);table.position.set(-98,y+.85,156.3);table.scale.set(2,.18,1.4);packing.add(table);for(const x of[-98.8,-97.2]){const leg=new THREE.Mesh(cube,wood);leg.position.set(x,y+.4,156.3);leg.scale.set(.15,.8,1.2);packing.add(leg);}const packages:THREE.Mesh[]=[];for(let i=0;i<4;i++){const parcel=new THREE.Mesh(cube,lightWood);parcel.position.set(-98+(i%2-.5)*.8,y+1.15+Math.floor(i/2)*.5,156.3);parcel.scale.set(.7,.45,.6);parcel.castShadow=true;parcel.visible=false;packing.add(parcel);packages.push(parcel);}
 const markerGeo=new THREE.ConeGeometry(.65,1.2,3);markerGeo.rotateZ(Math.PI);geometries.add(markerGeo);const markerMat=new THREE.MeshBasicMaterial({color:0xefcd73,transparent:true,opacity:.88});materials.add(markerMat);const marker=new THREE.Mesh(markerGeo,markerMat);marker.name='shop-inverted-entry-marker';marker.position.set(-84,y+3.3,173.2);group.add(marker);

 const people=createLivingActorLibrary(),worker=people.get('worker',19),merchant=people.get('merchant',city==='corona-del-alba'?8:15);worker.group.position.set(-98,y,153);worker.group.name='shop-order-packer';group.add(worker.group);merchant.group.position.set(S.merchant.x,y,S.merchant.z);merchant.group.name='suministros-del-alba-merchant';group.add(merchant.group);
 const residentLibrary=createTripoResidentLibrary(),workerSkin=residentLibrary?.attach(worker),merchantSkin=residentLibrary?.attach(merchant);
 const merchantLoad=merchant.group.getObjectByName('actor-load');if(merchantLoad)merchantLoad.visible=false;
 const merchantMotion=createShopMerchantMotion(merchant);merchantMotion.update(0,Infinity);
 const workerLoad=worker.group.getObjectByName('actor-load');if(workerLoad){workerLoad.children.forEach(c=>c.visible=false);const parcel=new THREE.Mesh(cube,lightWood);parcel.name='shop-carried-parcel';parcel.scale.set(.65,.4,.5);parcel.castShadow=true;workerLoad.add(parcel);}

 const granary=city==='paso-del-norte'?createCityGranary():null;if(granary){granary.group.position.y=.92;group.add(granary.group);}
 const furnishing=createShopInterior(city==='paso-del-norte');group.add(furnishing.group);

 const parked:ReturnType<typeof createShopTransport>[]=[],display:ReturnType<typeof createShopTransport>[]=[];for(const [i,kind]of(['horse','cart','carriage']as const).entries()){const model=createShopTransport(kind);model.group.position.set(-132+i*8,y,159);group.add(model.group);display.push(model);}

 let disposed=false,focus={x:0,y:0,z:0},snapshot:ShopSnapshot|null=null,lastAssets='',snapshotAt=0,previewHandling:ShopHandlingSchedule|null=null,doorOpen=0,delivered=0;

 return{group,setHandlingPreview(next:ShopHandlingSchedule|null){previewHandling=next;},getWorkerObstacle(){if(!worker.group.visible)return[];return[{x:worker.group.position.x+offset.x,z:worker.group.position.z+offset.z,halfWidth:.38,halfDepth:.38,minY:y+offset.y,maxY:y+offset.y+1.8,allowEgress:true}];},getHandlingSound(){const h=previewHandling??snapshot?.worker;if(!h||h.cityId!==city)return[];const at=previewHandling?performance.now():snapshot!.now+performance.now()-snapshotAt,p=shopHandlingPose(h,at);if(p.phase==='idle')return[];return[{id:'shop-worker-'+city,kind:p.walking?'worker-step' as const:'crate' as const,x:p.x,y:p.y+1,z:p.z,radius:18,volume:.5}];},setGranary(units:number){delivered=Math.max(delivered,units);granary?.setDelivered(delivered);},obstacles:shopObstacles(city),getAssetObstacles(){return shopAssetObstacles(snapshot?.assets??[],snapshot?.rig??undefined).filter(o=>Math.hypot(o.x-site.x,o.z-site.z)<100);},setFocus(x:number,y:number,z:number){x-=offset.x;y-=offset.y;z-=offset.z;focus={x,y,z};stable?.setFocus(x,y,z);const close=Math.hypot(x+100,z-160)<110;detail.visible=true;furnishing.focus(shopInside(x,z),close);shelfPilot?.setFocus(x,z,shopInside(x,z)&&y<6);worker.group.visible=close;merchant.group.visible=close;for(const m of [...display,...parked])m.setNear(Math.hypot(x-m.group.position.x,z-m.group.position.z)<45);workerSkin?.setNear(Math.hypot(x-worker.group.position.x,z-worker.group.position.z)<28);merchantSkin?.setNear(Math.hypot(x-S.merchant.x,z-S.merchant.z)<28);roof.visible=!(shopInside(x,z)&&y<6);sign.visible=Math.hypot(x+84,z-160)<260;},setSnapshot(next:ShopSnapshot){delivered=Math.max(delivered,next.granary.delivered);granary?.setDelivered(delivered);snapshot=next;snapshotAt=performance.now();const pending=next.orders.filter(o=>o.cityId===city&&o.collectedAt===null).length;packages.forEach((p,i)=>p.visible=i<Math.min(4,pending));const key=JSON.stringify([next.assets,next.rig]);if(key===lastAssets)return;lastAssets=key;parked.splice(0).forEach(p=>p.dispose());const assets=next.assets.filter(a=>a.id!==next.rig?.animalId&&a.id!==next.rig?.vehicleId);for(const [i,a]of assets.slice(0,6).entries()){if(a.cityId!==city)continue;const model=createShopTransport(a.kind);const pos=shopAssetPosition(i,city);model.group.position.set(pos.x-offset.x,pos.y-offset.y,pos.z-offset.z);group.add(model.group);parked.push(model);}},update(t:number,reduced=false){stable?.update(t,reduced);const desired=shopInside(focus.x,focus.z)||Math.hypot(focus.x+84,focus.z-169)<9?1:0;doorOpen=reduced?desired:doorOpen+(desired-doorOpen)*.14;doors.forEach((d,i)=>d.rotation.y=(i===0?1:-1)*doorOpen*Math.PI*.48);const lastOrder=snapshot?.orders.filter(o=>o.cityId===city&&o.collectedAt===null&&snapshot!.goods.some(g=>g.id===o.good&&g.kind==='resource')).reduce<(NonNullable<typeof snapshot>['orders'][number])|null>((latest,o)=>!latest||o.at>latest.at?o:latest,null),age=lastOrder?(snapshot!.now+performance.now()-snapshotAt-lastOrder.at)/1000:999,handling=previewHandling??snapshot?.worker??(snapshot?.handling?.cityId===city?snapshot.handling:null),hp=handling&&handling.cityId===city?shopHandlingPose(handling,previewHandling?performance.now():snapshot!.now+performance.now()-snapshotAt):null,pose=hp?{...hp,x:hp.x-offset.x,z:hp.z-offset.z}: {...shopPackerMotion(age,!!lastOrder),x:-98};worker.group.position.set(pose.x,y,pose.z);worker.group.rotation.y=pose.yaw;if(workerLoad)workerLoad.visible=pose.carrying;worker.animate(t,pose.walking&&!reduced,pose.working&&!reduced);workerSkin?.sync(pose.walking&&!reduced,pose.working&&!reduced,pose.carrying);marker.position.y=y+3.3+(reduced?0:Math.sin(t*2)*.13);marker.rotation.y=reduced?0:t*.5;merchantMotion.update(t,Math.hypot(focus.x+84,focus.z-155.7),reduced);merchantSkin?.sync(false,false,false,true);display.forEach(m=>{m.group.visible=true;m.animate(t,0);});parked.forEach(m=>m.animate(t,0));},dispose(){if(disposed)return;disposed=true;stable?.dispose();residentLibrary?.dispose();shelfPilot?.dispose();parked.forEach(m=>m.dispose());display.forEach(m=>m.dispose());people.dispose();furnishing.dispose();granary?.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.removeFromParent();group.clear();}};

}

