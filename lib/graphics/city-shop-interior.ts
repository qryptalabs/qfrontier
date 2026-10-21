import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Handmade shop fittings. Repeated vessels are batched; only two local lights. */
export function createShopInterior(agricultural=false){
 const group=new THREE.Group(),parts=new Map<THREE.Material,THREE.BufferGeometry[]>(),textures:THREE.Texture[]=[],geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 group.name='shop-detailed-interior';const mat=(color:number,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness:metalness?.4:.8,metalness});materials.push(m);return m;};
 const walnut=mat(0x57351e),oak=mat(0xa07442),brass=mat(0xbe914c,.65),iron=mat(0x343833,.5),clay=mat(0xb9724b),linen=mat(0xc5b48b),green=mat(0x355c45),blue=mat(0x335977),red=mat(0x883937),grain=mat(0xd7ad55),paper=mat(0xe8d9b2),glass=mat(0x527e68);
 const glow=new THREE.MeshStandardMaterial({color:0xffdc8e,emissive:0xffb34d,emissiveIntensity:1.2,roughness:.6});materials.push(glow);
 const add=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>{g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);const batch=parts.get(m)??[];batch.push(g);parts.set(m,batch);};
 const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
 const cylinder=(m:THREE.Material,x:number,y:number,z:number,r:number,h:number,top=r,rx=0)=>add(new THREE.CylinderGeometry(top,r,h,10),m,x,y,z,rx);
 const ring=(x:number,y:number,z:number,r:number,rx=0)=>add(new THREE.TorusGeometry(r,.018,4,12),brass,x,y,z,rx);
 function barrel(x:number,z:number){cylinder(oak,x,1.5,z,.4,1.1,.35);for(const y of[1.06,1.38,1.9])ring(x,y,z,.39,Math.PI/2);cylinder(walnut,x,2.06,z,.35,.04);}
 for(const x of[-92.9,-75.1])for(let row=0;row<3;row++)for(let i=0;i<12;i++){
  const z=154+i*.86,y=1.29+row*.75,kind=(i+row)%5;
  if(kind===0){cylinder(clay,x,y+.12,z,.19,.32,.14);cylinder(iron,x,y+.3,z,.15,.04);box(paper,x-.21,y+.12,z,.015,.12,.16);}
  else if(kind===1){cylinder(linen,x,y+.12,z,.22,.38,.12);cylinder(grain,x,y+.32,z,.105,.02);ring(x,y+.28,z,.11,Math.PI/2);}
  else if(kind===2){for(let k=0;k<3;k++)cylinder([red,blue,green][k],x+(k-1)*.19,y+.08,z,.09,.49,.09,Math.PI/2);}
  else if(kind===3){for(const dz of[-.13,.13]){cylinder(glass,x,y+.08,z+dz,.09,.27,.085);cylinder(brass,x,y+.25,z+dz,.045,.1);}}
  else{box(walnut,x,y+.12,z,.52,.3,.5);for(const side of[-1,1])box(oak,x+side*.25,y+.12,z,.035,.3,.5);for(const h of[-.1,.1])box(brass,x,y+.12+h,z,.53,.025,.51);}
 }
 for(const x of[-91,-77]){barrel(x,152.1);barrel(x,153.2);}
 // Counter panels, dovetail-like trim, drawers, handles, receipts and an open ledger.
 for(let i=0;i<6;i++){const x=-86.65+i*1.06;box(walnut,x,1.4,153.6,.97,.75,.04);for(const dx of[-.42,.42])box(brass,x+dx,1.4,153.64,.025,.66,.035);box(brass,x,1.69,153.65,.8,.025,.025);box(brass,x,1.1,153.65,.8,.025,.025);}
 for(const x of[-85.8,-84.8]){box(green,x,2.06,153.08,.7,.09,.5);box(paper,x,2.12,153.08,.67,.04,.46);for(let i=0;i<5;i++)box(walnut,x,2.145,152.94+i*.06,.5,.003,.009);}
 box(paper,-86.6,2.12,153.04,.36,.025,.5);cylinder(iron,-86.7,2.23,153.15,.055,.15);box(brass,-86.7,2.43,153.15,.018,.4,.018);
 // Framed route map behind the merchant, wall panelling and decorative cornice.
 box(walnut,-84,3.2,151.2,3.7,1.7,.13);box(brass,-84,3.2,151.29,3.52,1.52,.04);box(paper,-84,3.2,151.32,3.4,1.4,.02);
 for(let i=0;i<7;i++)box(green,-85.35+i*.44,3.2+Math.sin(i*.7)*.35,151.34,.3,.035,.02);
 for(const x of[-93.7,-74.3])for(let z=152;z<169;z+=1.2)box(walnut,x,1.28,z,.08,.65,.08);
 for(const z of[151.35,168.65]){box(oak,-84,5.04,z,19,.12,.12);box(brass,-84,4.94,z,19,.035,.08);}
 // Suspended brass lanterns with cages and warm glass, attached to the ceiling.
 const lights:THREE.PointLight[]=[];
 for(const z of[157,164]){cylinder(iron,-84,4.75,z,.035,1.1);box(brass,-84,4.25,z,.48,.08,.48);box(glow,-84,3.94,z,.31,.5,.31);box(brass,-84,3.66,z,.48,.08,.48);for(const x of[-84.2,-83.8])for(const dz of[-.2,.2])box(iron,x,3.96,z+dz,.035,.54,.035);const light=new THREE.PointLight(0xffc779,10,12,2);light.position.set(-84,3.8,z);light.visible=false;group.add(light);lights.push(light);}
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;const c=canvas.getContext('2d');if(c){c.fillStyle=agricultural?'#345a3c':'#702b2d';c.fillRect(0,0,512,1024);for(const inset of[12,23,39,51]){c.strokeStyle=inset%2?'#d2af65':'#b58a46';c.lineWidth=5;c.strokeRect(inset,inset,512-inset*2,1024-inset*2);}c.strokeStyle='#d2af65';c.lineWidth=3;for(let y=100;y<950;y+=105){c.beginPath();c.moveTo(256,y-36);c.lineTo(300,y);c.lineTo(256,y+36);c.lineTo(212,y);c.closePath();c.stroke();for(const x of[75,437]){c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.stroke();}}for(let i=0;i<96;i++){c.fillStyle=i%2?'#fff1b80b':'#10060014';c.fillRect(0,i*11,512,1);}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;textures.push(texture);const m=new THREE.MeshStandardMaterial({map:texture,roughness:1});materials.push(m);const g=new THREE.PlaneGeometry(3,11);g.rotateX(-Math.PI/2);g.translate(-84,.98,161);geometries.push(g);group.add(new THREE.Mesh(g,m));}
 }
 for(const[m,gs]of parts){const g=mergeGeometries(gs,false)!;gs.forEach(p=>p.dispose());geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 return{group,focus(inside:boolean,near:boolean){group.visible=near;lights.forEach(l=>l.visible=inside);},dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
