import * as THREE from 'three';
import {shopTradeRoad} from './city-shop-route.ts';
export function createShopRoadSigns(floor:(x:number,z:number)=>number|null){
 const group=new THREE.Group(),geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];group.name='signed-camino-real-trade-road';
 const wood=new THREE.MeshStandardMaterial({color:0x75522e,roughness:.9});materials.push(wood);const road=shopTradeRoad('corona-del-alba');
 for(const index of[4,5,7,9]){const p=road[index],x=p.x+7.5,z=p.z,y=floor(x,z)??0,g=new THREE.BoxGeometry(.14,2.9,.14);geometries.push(g);const pole=new THREE.Mesh(g,wood);pole.position.set(x,y+1.45,z);group.add(pole);
  if(typeof document==='undefined')continue;const c=document.createElement('canvas');c.width=640;c.height=176;const ctx=c.getContext('2d');if(!ctx)continue;ctx.fillStyle='#233f31';ctx.fillRect(0,0,640,176);ctx.strokeStyle='#cfb979';ctx.lineWidth=6;ctx.strokeRect(5,5,630,166);ctx.fillStyle='#eee1ba';ctx.font='bold 30px Georgia';ctx.textAlign='center';ctx.fillText('CAMINO REAL',320,44);ctx.font='23px Georgia';ctx.fillText('← Corona del Alba · Paso del Norte →',320,94);ctx.font='18px Georgia';ctx.fillText('Casas de suministros · Ruta comercial',320,140);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);const m=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});materials.push(m);const geometry=new THREE.PlaneGeometry(3.8,1.04);geometries.push(geometry);const board=new THREE.Mesh(geometry,m);board.position.set(x,y+2.35,z);group.add(board);
 }
 return{group,dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
