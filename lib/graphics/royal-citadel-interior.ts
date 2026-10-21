import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {ROYAL_INTERIOR_ROOMS,ROYAL_INTERIOR_STAIRS,ROYAL_INTERIOR_DAIS,ROYAL_INTERIOR_TOWER,ROYAL_INTERIOR_FLOOR,type RoyalInteriorRect} from './royal-citadel-interior-layout.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';

type Finish='marble'|'stone'|'gold'|'wood'|'velvet'|'glass'|'flame';
type Point={x:number;y:number;z:number};
const IVORY=0xe2d8bd,PALE=0xc3baa2,GOLD=0xd2a447,BLUE=0x163f70,RED=0x812d38,TAU=Math.PI*2;
/** Furnished public interiors occupy the real palace shell. Every room, tread,
 * portal and balcony is in world coordinates shared with navigation. No saved
 * position, game resource, network request or economy is changed here. */
export function createRoyalCitadelInterior(){
  const group=new THREE.Group();group.name='royal-citadel-public-interior';
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),obstacles:RoyalObstacle[]=[],sectors=new Map<string,{group:THREE.Group;parts:Map<Finish,THREE.BufferGeometry[]>;center:Point;reach:number}>();
  const finishes:Record<Finish,THREE.MeshStandardMaterial>={
    marble:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.41,metalness:.05}),
    stone:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82}),
    gold:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.48,emissive:0x6f4814,emissiveIntensity:.1}),
    wood:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.68}),
    velvet:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98}),
    glass:new THREE.MeshStandardMaterial({vertexColors:true,emissive:0x436585,emissiveIntensity:.18,roughness:.26,metalness:.08}),
    flame:new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffc66b,emissiveIntensity:1.1,roughness:.5}),
  };
  Object.values(finishes).forEach(m=>materials.add(m));applyRoyalSurfaceDetail(finishes.stone,'masonry');applyRoyalSurfaceDetail(finishes.wood,'wood');
  const unit=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10),sphere=new THREE.SphereGeometry(1,10,6),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();
  let active='vestibule',chandeliers=0,candelabras=0,doors=0,tables=0,royalSeats=0,consoles=0,bookcases=0,statues=0,lions=0;
  function sector(id:string,center:Point,reach=500){const node=new THREE.Group();node.name=`royal-interior-sector:${id}`;group.add(node);sectors.set(id,{group:node,parts:new Map(),center,reach});active=id;}
  function add(finish:Finish,colour:number,source:THREE.BufferGeometry,x=0,y=0,z=0,w=1,h=1,d=1,rx=0,ry=0,rz=0){
    const geometry=source.index?source.toNonIndexed():source.clone();matrix.compose(p.set(x,y,z),q.setFromEuler(new THREE.Euler(rx,ry,rz)),scale.set(w,h,d));geometry.applyMatrix4(matrix);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    const color=new THREE.Color(colour),rgb=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<rgb.length;i+=3)color.toArray(rgb,i);geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));
    const batches=sectors.get(active)!.parts,list=batches.get(finish)??[];list.push(geometry);batches.set(finish,list);
  }
  const box=(finish:Finish,color:number,x:number,y:number,z:number,w:number,h:number,d:number,ry=0)=>add(finish,color,unit,x,y,z,w,h,d,0,ry);
  function obstacle(id:string,x:number,z:number,w:number,d:number,minY:number,maxY:number){obstacles.push({...{x,z,halfWidth:w/2,halfDepth:d/2,minY,maxY},id} as RoyalObstacle);}
  function beam(finish:Finish,color:number,a:Point,b:Point,width:number,depth=width){const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),mid=new THREE.Vector3(a.x+b.x,a.y+b.y,a.z+b.z).multiplyScalar(.5),rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));add(finish,color,unit,mid.x,mid.y,mid.z,width,delta.length(),depth,rotation.x,rotation.y,rotation.z);}
  function ring(finish:Finish,color:number,x:number,y:number,z:number,r:number,tube:number,vertical=false){const g=new THREE.TorusGeometry(r,tube,5,36);add(finish,color,g,x,y,z,1,1,1,vertical?0:Math.PI/2);g.dispose();}
  function candle(x:number,y:number,z:number,size=1){add('gold',GOLD,cylinder,x,y+.22*size,z,.28*size,.44*size,.28*size);add('marble',0xf0ddb1,cylinder,x,y+.6*size,z,.16*size,.7*size,.16*size);add('flame',0xffe3a0,sphere,x,y+1.05*size,z,.12*size,.25*size,.12*size);}
  function candelabra(x:number,y:number,z:number,height=2.6){
    candelabras++;add('gold',GOLD,cylinder,x,y+.15,z,.62,.3,.62);add('gold',GOLD,cylinder,x,y+height*.45,z,.11,height*.85,.11);add('gold',0xf0c76a,sphere,x,y+height*.62,z,.26,.31,.26);
    for(const side of[-1,0,1]){const xx=x+side*.7;beam('gold',GOLD,{x,y:y+height*.65,z},{x:xx,y:y+height-.5,z},.08);candle(xx,y+height-.4,z,.65);}
    obstacle(`candelabra-${candelabras}`,x,z,1.6,.8,y,y+height+1);
  }
  function chandelier(x:number,floorY:number,z:number,ceilingY:number,radius=6){
    chandeliers++;const y=ceilingY-11;beam('gold',GOLD,{x,y:ceilingY-.1,z},{x,y:y+1.1,z},.16);ring('gold',GOLD,x,ceilingY-.3,z,1,.16);ring('gold',GOLD,x,y,z,radius,.2);ring('gold',0xf0c76a,x,y+2.4,z,radius*.56,.17);
    for(let arm=0;arm<12;arm++){const a=arm*TAU/12,xx=x+Math.cos(a)*radius,zz=z+Math.sin(a)*radius;beam('gold',GOLD,{x,y:y+3,z},{x:xx,y:y+.25,z:zz},.11);candle(xx,y+.1,zz,.9);if(arm%2===0)candle(x+Math.cos(a)*radius*.56,y+2.55,z+Math.sin(a)*radius*.56,.8);}
    add('glass',0x78a4b9,sphere,x,y-.8,z,1,1.6,1);for(let i=0;i<12;i++){const a=i*TAU/12;add('glass',i%2?0xc9e1d3:0x86adc2,sphere,x+Math.cos(a)*radius*.8,y-1.0,z+Math.sin(a)*radius*.8,.18,.75,.18);}
    void floorY;
  }
  function table(x:number,y:number,z:number,w=5,d=2.4){
    tables++;box('wood',0x68472e,x,y+1.15,z,w,.24,d);box('gold',GOLD,x,y+1.3,z,w+.15,.07,d+.15);
    for(const sx of[-1,1])for(const sz of[-1,1])box('wood',0x553b29,x+sx*(w/2-.35),y+.55,z+sz*(d/2-.3),.25,1.1,.25);
    for(let i=-1;i<=1;i++){add('gold',GOLD,cylinder,x+i*.7,y+1.42,z,.18,.2,.18);add('glass',0xc4d3d0,sphere,x+i*.7,y+1.68,z,.22,.23,.22);}obstacle(`service-table-${tables}`,x,z,w,d,y,y+1.9);
  }
  function carpet(minX:number,maxX:number,minZ:number,maxZ:number,y:number,color=RED){
    const w=maxX-minX,d=maxZ-minZ,x=(minX+maxX)/2,z=(minZ+maxZ)/2;
    box('velvet',color,x,y+.022,z,w,.044,d);for(const side of[-1,1]){box('gold',GOLD,x+side*(w/2-.22),y+.05,z,.18,.012,d-.3);box('gold',GOLD,x,y+.05,z+side*(d/2-.2),w-.2,.012,.16);}
    for(let zz=minZ+5;zz<maxZ-3;zz+=9){box('gold',0xd5b15d,x,y+.052,zz,.45,.015,.45,Math.PI/4);for(const side of[-1,1])box('gold',0xb18e4c,x+side*(w/2-.6),y+.051,zz,.18,.012,1.2);}
    for(const side of[-1,1])for(const offset of[.4,.72])box('velvet',0xd6bc79,x+side*(w/2-offset),y+.056,z,.075,.008,d-1);
    for(let zz=minZ+8;zz<maxZ-5;zz+=18){
      for(let petal=0;petal<8;petal++){const a=petal*TAU/8;box('velvet',0xd9bd77,x+Math.cos(a)*1.1,y+.06,zz+Math.sin(a)*1.1,.7,.009,.7,a);}
      box('velvet',color===BLUE?0x557e9c:0xb45c61,x,y+.062,zz,1.1,.01,1.1,Math.PI/4);box('velvet',0xe2cb8b,x,y+.069,zz,.38,.006,.38,Math.PI/4);
      for(const side of[-1,1])for(let chain=0;chain<4;chain++)box('velvet',0xc7a25d,x+side*(w/2-1),y+.06,zz-2+chain*1.1,.34,.009,.65,Math.PI/4);
    }
    for(const end of[minZ,maxZ])for(let xx=minX+.25;xx<maxX;xx+=.28){box('velvet',0xe6d4a3,xx,y+.026,end+(end===minZ?-.16:.16),.055,.035,.35);}
  }
  function royalCrest(x:number,y:number,z:number,size=1){
    box('gold',GOLD,x,y,z,.12*size,1.5*size,.12);box('gold',GOLD,x,y-.25*size,z,.9*size,.12*size,.14);
    for(const sign of[-1,0,1])add('gold',0xe8c775,sphere,x+sign*.34*size,y+.38*size,z,.22*size,.5*size,.12,0,0,-sign*.5);
    box('gold',GOLD,x,y+1.1*size,z,1.1*size,.12*size,.15);for(const sign of[-1,0,1])box('gold',GOLD,x+sign*.4*size,y+1.3*size,z,.12*size,.4*size,.15);
  }
  function royalSeat(x:number,y:number,z:number,yaw=0){
    royalSeats++;const c=Math.cos(yaw),sn=Math.sin(yaw),at=(u:number,v:number)=>({x:x+c*u+sn*v,z:z-sn*u+c*v});
    const b=(finish:Finish,color:number,u:number,yy:number,v:number,w:number,h:number,d:number)=>{const p=at(u,v);box(finish,color,p.x,y+yy,p.z,w,h,d,yaw);};
    b('wood',0x65432b,0,.7,0,5.6,.4,2.3);b('velvet',royalSeats%2?BLUE:RED,0,1.02,.05,5.1,.4,2.1);b('wood',0x503622,0,1.8,-1.06,5.7,2.5,.28);b('velvet',royalSeats%2?BLUE:RED,0,1.85,-.85,5.1,1.9,.24);
    for(const sign of[-1,1]){b('wood',0x6d482b,sign*2.7,1.5,0,.35,1.7,2.6);b('gold',GOLD,sign*2.7,2.35,0,.45,.18,2.7);for(const zz of[-.85,.85])b('wood',0x5c3d29,sign*2.35,.31,zz,.24,.62,.26);}
    for(let col=-3;col<=3;col++){b('gold',GOLD,col*.65,1.83,-.68,.065,.065,.06);b('gold',GOLD,col*.65,2.95,-1.03,.18,.16,.22);}
    b('gold',GOLD,0,3.01,-1.04,5.8,.1,.4);b('gold',GOLD,0,.75,1.2,5.7,.12,.1);
    obstacle(`royal-upholstered-seat-${royalSeats}`,x,z,Math.abs(c)*5.9+Math.abs(sn)*2.8,Math.abs(sn)*5.9+Math.abs(c)*2.8,y,y+3.2);
  }
  function royalConsole(x:number,y:number,z:number,yaw=0){
    consoles++;const c=Math.cos(yaw),sn=Math.sin(yaw),at=(u:number,v:number)=>({x:x+c*u+sn*v,z:z-sn*u+c*v});
    const b=(finish:Finish,color:number,u:number,yy:number,v:number,w:number,h:number,d:number)=>{const p=at(u,v);box(finish,color,p.x,y+yy,p.z,w,h,d,yaw);};
    b('wood',0x65432b,0,.85,0,4.4,1.4,1.4);b('marble',0xf0e4c9,0,1.62,0,4.8,.18,1.7);b('gold',GOLD,0,1.5,0,4.65,.12,1.6);
    for(const sign of[-1,1]){b('wood',0x91643b,sign*1.08,.95,.73,1.9,.83,.12);b('gold',GOLD,sign*1.08,.95,.82,.34,.08,.09);for(const zz of[-.5,.5])b('gold',GOLD,sign*1.9,.15,zz,.22,.3,.22);}
    const v=at(0,0);add('glass',0x4385a1,sphere,v.x,y+2.25,v.z,.48,.68,.48);add('gold',GOLD,cylinder,v.x,y+2.82,v.z,.21,.16,.21);for(const side of[-1,1])candle(v.x+side*1.5,y+1.72,v.z,.65);
    obstacle(`royal-inlaid-console-${consoles}`,x,z,Math.abs(c)*4.8+Math.abs(sn)*1.8,Math.abs(sn)*4.8+Math.abs(c)*1.8,y,y+3);
  }
  function royalBookcase(x:number,y:number,z:number,side:number){
    bookcases++;box('wood',0x503a2a,x,y+4.5,z,2.5,9,12);box('gold',GOLD,x-side*1.32,y+9,z,.15,.3,12.4);
    for(let shelf=0;shelf<4;shelf++){const yy=y+.55+shelf*2.12;box('wood',0x986a3c,x-side*1.35,yy,z,.4,.17,11.6);for(let book=0;book<18;book++){const zz=z-5.3+book*.62,h=1.25+(book%4)*.16;colorBook(x-side*1.35,yy+h/2+.12,zz,h,book+shelf);}}
    function colorBook(xx:number,yy:number,zz:number,h:number,seed:number){box('velvet',[BLUE,RED,0x315b47,0x987a45][seed%4],xx,yy,zz,.65,h,.5);for(const band of[-1,1])box('gold',GOLD,xx-side*.36,yy+band*h*.32,zz,.08,.06,.48);}
    obstacle(`royal-library-${bookcases}`,x,z,3.5,12.4,y,y+9.3);
  }
  function lion(x:number,y:number,z:number,scale=1){
    lions++;const color=0xd5b777;box('marble',IVORY,x,y+.3*scale,z,3.8*scale,.6*scale,5*scale);
    add('gold',color,sphere,x,y+1.8*scale,z,1.15*scale,1.25*scale,1.9*scale);add('gold',0xaf823d,sphere,x,y+3*scale,z+1.0*scale,1.25*scale,1.3*scale,.85*scale);add('gold',0xe4c77f,sphere,x,y+3.15*scale,z+1.45*scale,.8*scale,.85*scale,.72*scale);
    for(const side of[-1,1]){for(const zz of[-1.1,1.25]){add('gold',color,cylinder,x+side*.78*scale,y+1.05*scale,z+zz*scale,.3*scale,1.5*scale,.3*scale);add('gold',0xe3c887,sphere,x+side*.78*scale,y+.5*scale,z+(zz+.22)*scale,.42*scale,.24*scale,.65*scale);}add('gold',color,sphere,x+side*.65*scale,y+3.85*scale,z+1.1*scale,.24*scale,.3*scale,.2*scale);add('glass',0x203c4b,sphere,x+side*.28*scale,y+3.38*scale,z+2.03*scale,.08*scale,.1*scale,.08*scale);}
    for(let i=0;i<12;i++){const a=i*TAU/12;add('gold',i%2?GOLD:0xe7c67c,sphere,x+Math.cos(a)*1.05*scale,y+(3+Math.sin(a)*1.05)*scale,z+.96*scale,.23*scale,.4*scale,.34*scale);}
    obstacle(`royal-lion-${lions}`,x,z,3.9*scale,5.1*scale,y,y+4.3*scale);
  }
  function royalStatue(x:number,y:number,z:number,index:number){
    statues++;const stone=index%2?0xbec8c5:0xe6dcc2;
    box('marble',IVORY,x,y+.3,z,4.1,.6,4.1);box('marble',PALE,x,y+1.05,z,3.3,.9,3.3);box('gold',GOLD,x,y+1.55,z,3.65,.17,3.65);
    for(const side of[-1,1]){add('marble',stone,cylinder,x+side*.43,y+2.35,z,.32,1.5,.34);box('marble',stone,x+side*.43,y+1.8,z+.24,.7,.3,1.1);}
    add('marble',stone,cylinder,x,y+3.9,z,.95,2.15,.65);box('marble',stone,x,y+3.85,z-.49,1.8,2.3,.26);add('marble',stone,sphere,x,y+5.55,z,.55,.69,.52);
    for(const side of[-1,1]){beam('marble',stone,{x:x+side*.85,y:y+4.75,z},{x:x+side*1.1,y:y+3.5,z:z+.25},.37,.4);add('marble',stone,sphere,x+side*1.1,y+3.4,z+.25,.25,.26,.24);}
    if(index%2){box('marble',stone,x-1.1,y+3.4,z+.55,.9,1.55,.23);box('gold',GOLD,x-1.1,y+3.4,z+.7,.1,1.2,.08);beam('marble',stone,{x:x+1.1,y:y+3.2,z:z+.25},{x:x+1.1,y:y+6.6,z:z+.25},.12);}
    else{for(let i=0;i<7;i++){const a=i*TAU/7;box('gold',GOLD,x+Math.cos(a)*.47,y+6.2,z+Math.sin(a)*.47,.16,.45,.16);}box('gold',GOLD,x,y+6.0,z,1.12,.14,1.05);}
    box('gold',GOLD,x,y+1.04,z+1.69,1.8,.5,.06);for(let i=0;i<=index%3;i++)box('wood',0x4e3b28,x+(i-index%3/2)*.22,y+1.04,z+1.73,.06,.3,.04);
    obstacle(`royal-historic-statue-${statues}`,x,z,4.2,4.2,y,y+6.7);
  }
  function portal(span:number,height:number,width:number,clearHeight:number,depth:number){const s=new THREE.Shape();s.moveTo(-span/2,0);s.lineTo(-width/2,0);s.lineTo(-width/2,clearHeight*.72);for(let i=1;i<=24;i++){const a=Math.PI-i*Math.PI/24;s.lineTo(Math.cos(a)*width/2,clearHeight*.72+Math.sin(a)*clearHeight*.28);}s.lineTo(width/2,0);s.lineTo(span/2,0);s.lineTo(span/2,height);s.lineTo(-span/2,height);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:1});g.translate(0,0,-depth/2);return g;}
  function royalDoor(x:number,y:number,z:number,width:number,height:number,yaw=0){
    doors++;const c=Math.cos(yaw),s=Math.sin(yaw),at=(u:number,n:number)=>({x:x+c*u+s*n,z:z-s*u+c*n});
    for(const sign of[-1,1]){
      const post=at(sign*(width/2+.7),0);box('marble',IVORY,post.x,y+height/2,post.z,1.4,height,1.8,yaw);box('gold',GOLD,post.x,y+height+.3,post.z,2,.6,2.1,yaw);
      const leafWidth=width/2-.25,open=-sign*Math.PI*.44,hinge=at(sign*width/2,0),leafYaw=yaw+open,leafCenter={x:hinge.x-sign*Math.cos(leafYaw)*leafWidth/2,z:hinge.z+sign*Math.sin(leafYaw)*leafWidth/2};
      box('wood',0x613e27,leafCenter.x,y+height*.45,leafCenter.z,leafWidth,height*.9,.48,leafYaw);
      const lc=Math.cos(leafYaw),ls=Math.sin(leafYaw);for(const row of[.18,.43,.68])for(const col of[-.24,.24]){const u=col*leafWidth,xx=leafCenter.x+lc*u+ls*.27,zz=leafCenter.z-ls*u+lc*.27;box('wood',0x926239,xx,y+height*row,zz,leafWidth*.4,height*.18,.18,leafYaw);for(const edge of[-1,1])box('gold',GOLD,xx+edge*lc*leafWidth*.2,y+height*row,zz-edge*ls*leafWidth*.2,.08,height*.19,.1,leafYaw);}
      for(const yy of[.08,.33,.58,.83])box('gold',GOLD,leafCenter.x,y+height*yy,leafCenter.z,leafWidth+.1,.12,.62,leafYaw);
      const handle={x:leafCenter.x-sign*lc*leafWidth*.32+ls*.42,z:leafCenter.z+sign*ls*leafWidth*.32+lc*.42};box('gold',0xf1cd76,handle.x,y+height*.42,handle.z,.14,1.2,.16,leafYaw);
      const absC=Math.abs(lc),absS=Math.abs(ls);obstacle(`open-royal-door-${doors}-${sign}`,leafCenter.x,leafCenter.z,absC*leafWidth+absS*.55,absS*leafWidth+absC*.55,y,y+height*.9);
    }
    const cap=at(0,0);box('gold',GOLD,cap.x,y+height+.65,cap.z,width+3,.5,2,yaw);
  }
  function wallSegment(room:RoyalInteriorRect,side:number,start:number,end:number){
    if(room.id==='tower-approach'&&side<2)end=Math.min(end,ROYAL_INTERIOR_TOWER.x-85);
    if(end-start<.01)return;const alongX=side<2,length=end-start,x=alongX?(start+end)/2:side===2?room.minX:room.maxX,z=alongX?side===0?room.minZ:room.maxZ:(start+end)/2;
    box('stone',side%2?PALE:IVORY,x,room.y+room.ceiling/2,z,alongX?length:1.4,room.ceiling,alongX?1.4:length);obstacle(`${room.id}-wall-${side}-${start}`,x,z,alongX?length:1.4,alongX?1.4:length,room.y,room.y+room.ceiling);
    box('marble',0xb3a88d,x,room.y+.4,z,alongX?length:1.7,.8,alongX?1.7:length);box('gold',GOLD,x,room.y+4.7,z,alongX?length:1.52,.13,alongX?1.52:length);box('marble',IVORY,x,room.y+room.ceiling-.65,z,alongX?length:1.8,1.3,alongX?1.8:length);
  }
  const connections=[...ROYAL_INTERIOR_ROOMS,{id:'stairs-volume',minX:0,maxX:120,minZ:-3750,maxZ:-3730,y:ROYAL_INTERIOR_FLOOR,ceiling:80}];
  for(const room of ROYAL_INTERIOR_ROOMS){
    const x=(room.minX+room.maxX)/2,z=(room.minZ+room.maxZ)/2,w=room.maxX-room.minX,d=room.maxZ-room.minZ;sector(room.id,{x,y:room.y+room.ceiling/2,z},Math.max(500,Math.hypot(w,d)+180));
    // Tiles replace the floor rather than layering a grid onto a coplanar slab.
    const cols=Math.ceil(w/8),rows=Math.ceil(d/8);for(let col=0;col<cols;col++)for(let row=0;row<rows;row++)box('marble',(col+row)%2?0xcfc5ac:0xe6ddc7,room.minX+(col+.5)*w/cols,room.y-.14,room.minZ+(row+.5)*d/rows,w/cols,.28,d/rows);
    box('wood',0x574632,x,room.y+room.ceiling+.35,z,w,.7,d);
    for(let xx=room.minX+8;xx<room.maxX;xx+=16)box('gold',0xb49454,xx,room.y+room.ceiling-.25,z,.24,.22,d);for(let zz=room.minZ+8;zz<room.maxZ;zz+=16)box('gold',0xb49454,x,room.y+room.ceiling-.25,zz,w,.22,.24);
    for(let side=0;side<4;side++){
      const alongX=side<2,start=alongX?room.minX:room.minZ,end=alongX?room.maxX:room.maxZ,fixed=alongX?(side===0?room.minZ:room.maxZ):(side===2?room.minX:room.maxX),cuts=[start,end];
      for(const other of connections)if(other.id!==room.id){cuts.push(Math.max(start,Math.min(end,alongX?other.minX:other.minZ)),Math.max(start,Math.min(end,alongX?other.maxX:other.maxZ)));}
      const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
      for(let i=0;i<sorted.length-1;i++){
        const middle=(sorted[i]+sorted[i+1])/2,wx=alongX?middle:fixed,wz=alongX?fixed:middle;
        const open=connections.some(other=>other.id!==room.id&&wx>=other.minX-.01&&wx<=other.maxX+.01&&wz>=other.minZ-.01&&wz<=other.maxZ+.01&&other.y<=room.y+3&&other.y+other.ceiling>=room.y+3)
          ||room.id==='vestibule'&&side===1&&middle>=-100&&middle<=100
          ||room.id==='tower-approach'&&side===3;
        if(!open)wallSegment(room,side,sorted[i],sorted[i+1]);
      }
    }
    if(w>45&&d>45){
      for(const side of[-1,1])for(let zz=room.minZ+20;zz<room.maxZ-10;zz+=35){const px=side*(w/2-5)+x;add('marble',IVORY,cylinder,px,room.y+room.ceiling/2,zz,1.3,room.ceiling,1.3);add('gold',GOLD,cylinder,px,room.y+1,zz,1.8,1,1.8);add('marble',IVORY,cylinder,px,room.y+room.ceiling-1,zz,2.1,1.7,2.1);obstacle(`${room.id}-column-${side}-${zz}`,px,zz,3.6,3.6,room.y,room.y+room.ceiling);}
      for(let zz=room.minZ+30;zz<room.maxZ-10;zz+=65)chandelier(x,room.y,zz,room.y+room.ceiling,room.id==='throne'?7.5:6);
      carpet(x-7,x+7,room.minZ+3,room.maxZ-3,room.y,room.id==='throne'?BLUE:RED);
    }
  }
  active='reception';
  const entryWall=portal(320,54,32,22,1.5);add('stone',IVORY,entryWall,0,ROYAL_INTERIOR_FLOOR,-3580);entryWall.dispose();royalDoor(0,ROYAL_INTERIOR_FLOOR,-3580,32,21);
  for(const side of[-1,1]){obstacle(`reception-portal-${side}`,side*88,-3580,144,1.5,ROYAL_INTERIOR_FLOOR,ROYAL_INTERIOR_FLOOR+54);candelabra(side*22,ROYAL_INTERIOR_FLOOR,-3588,3.8);candelabra(side*112,ROYAL_INTERIOR_FLOOR,-3650,3.8);}
  table(85,ROYAL_INTERIOR_FLOOR,-3612.8,5,2);candelabra(88,ROYAL_INTERIOR_FLOOR,-3613.5,2.6);
  for(const side of[-1,1]){royalSeat(side*112,ROYAL_INTERIOR_FLOOR,-3683,side*Math.PI/2);royalSeat(side*124,ROYAL_INTERIOR_FLOOR,-3691,Math.PI);royalConsole(side*126,ROYAL_INTERIOR_FLOOR,-3672);royalBookcase(side*154,ROYAL_INTERIOR_FLOOR,-3657,side);royalStatue(side*130,ROYAL_INTERIOR_FLOOR,-3638,side<0?0:1);}
  active='throne';const upperY=ROYAL_INTERIOR_FLOOR+36;
  const throneWall=portal(180,50,26,20,1.4);add('stone',IVORY,throneWall,0,upperY,-3778);throneWall.dispose();royalDoor(0,upperY,-3778,26,19);
  for(const side of[-1,1]){obstacle(`throne-portal-${side}`,side*51.5,-3778,77,1.4,upperY,upperY+50);candelabra(side*20,upperY,-3800,4.2);candelabra(side*37,upperY,-3898,4.2);}
  table(75,upperY,-3807.2,5.8,1.8);
  const dais=ROYAL_INTERIOR_DAIS;box('marble',IVORY,0,dais.y-.6,(dais.minZ+dais.maxZ)/2,dais.maxX-dais.minX,1.2,dais.maxZ-dais.minZ);
  for(let i=0;i<dais.steps;i++){const top=upperY+i/dais.steps*1.2,z=dais.stairMaxZ-(i+.5)*(dais.stairMaxZ-dais.stairMinZ)/dais.steps;box('marble',IVORY,0,top-.2,z,64,.4,.5);}
  carpet(-11,11,dais.minZ+1,dais.maxZ-1,dais.y,BLUE);
  const throneZ=-3918;box('gold',GOLD,0,dais.y+1.5,throneZ,5.2,3,4);box('velvet',BLUE,0,dais.y+3,throneZ+.25,4.4,.5,3.4);box('wood',0x65452f,0,dais.y+5.5,throneZ-1.7,5.1,6.5,.7);box('velvet',BLUE,0,dais.y+5.3,throneZ-1.2,4.1,5.3,.55);
  for(const side of[-1,1]){box('gold',GOLD,side*2.6,dais.y+3.8,throneZ, .45,2.8,4);add('gold',0xe8c367,sphere,side*2.6,dais.y+5.4,throneZ+1.3,.7,.8,.7);box('gold',GOLD,side*2.7,dais.y+5.7,throneZ-1.7,.4,7.2,.6);}
  for(let i=-2;i<=2;i++)add('gold',0xe2ba59,sphere,i*.55,dais.y+9+Math.abs(i)*.2,throneZ-1.7,.24,.38,.24);
  for(let row=0;row<5;row++)for(let col=0;col<5;col++)add('gold',GOLD,sphere,(col-2)*.65,dais.y+3.5+row*.8,throneZ-.88,.065,.065,.065);
  obstacle('royal-throne',0,throneZ,12,6.8,dais.y,dais.y+23);
  for(const side of[-1,1]){const x=side*14;add('marble',IVORY,cylinder,x,dais.y+16.5,throneZ-3,1.2,33,1.2);box('gold',GOLD,x,dais.y+24,throneZ-3,2.7,.8,2.7);box('velvet',BLUE,x,dais.y+19,throneZ-3,3.5,10,.16);obstacle(`throne-baldachin-${side}`,x,throneZ-3,2.5,2.5,dais.y,dais.y+34);}
  box('gold',GOLD,0,dais.y+24,throneZ-2,31,.65,8);box('velvet',BLUE,0,dais.y+24.4,throneZ-2,30,.2,7.6);
  // A monumental carved surround keeps the throne central while the seat
  // and the existing dais remain usable from the same public stairs.
  box('wood',0x61432e,0,dais.y+7.8,throneZ-2.2,10.8,15.6,.9);box('velvet',BLUE,0,dais.y+8.0,throneZ-1.68,8.5,13.8,.28);
  for(const side of[-1,1]){box('gold',GOLD,side*5.35,dais.y+8.2,throneZ-1.8,.5,16.2,.7);for(let i=0;i<9;i++)add('gold',0xe5c581,sphere,side*5.35,dais.y+1.4+i*1.7,throneZ-1.37,.32,.4,.2);}
  box('gold',GOLD,0,dais.y+16,throneZ-1.85,11.5,.7,.8);royalCrest(0,dais.y+18,throneZ-1.35,2.2);
  for(const side of[-1,1]){lion(side*8.5,dais.y,throneZ,.95);box('velvet',side<0?BLUE:RED,side*16.1,dais.y+18,throneZ-3,2.7,30,.22);for(let fold=0;fold<5;fold++)box('gold',GOLD,side*(15+fold*.45),dais.y+18,throneZ-2.8,.05,29,.08);}
  box('gold',GOLD,0,dais.y+33,throneZ-2,38,1.1,11);box('wood',0x67472f,0,dais.y+33.6,throneZ-2,37,.6,10);for(let x=-17;x<=17;x+=2.1)royalCrest(x,dais.y+34.7,throneZ+3.5,.6);
  for(const side of[-1,1])for(const zz of[-3835,-3864])royalSeat(side*32,upperY,zz,-side*Math.PI/2);
  for(const side of[-1,1]){royalConsole(side*82,upperY,-3850,side*Math.PI/2);royalStatue(side*43,upperY,-3896,side<0?2:3);}
  // The royal backdrop uses smooth ivory inlay, carved gold frames and woven
  // heraldry instead of exposing the structural brick shader behind the throne.
  const royalBackZ=-3929.05;
  for(const [x,width]of[[-73,25],[-43,25],[0,51],[43,25],[73,25]] as const){
    box('marble',0xeee4ca,x,upperY+24,royalBackZ,width,44,.35);
    for(const side of[-1,1]){box('gold',0xe2bd67,x+side*(width/2-.5),upperY+24,royalBackZ+.28,.4,43,.18);box('gold',0xe2bd67,x,upperY+24+side*21,royalBackZ+.28,width-.7,.35,.18);}
    box('marble',0xf5ead0,x,upperY+4.5,royalBackZ+.35,width-1.7,5,.22);
  }
  for(const x of[-87,-58,-28,28,58,87]){
    box('marble',0xebdfc1,x,upperY+24,royalBackZ+.75,2.1,46,1.1);box('gold',0xe4bd61,x,upperY+46.3,royalBackZ+.95,3.6,.7,1.5);box('gold',GOLD,x,upperY+2.2,royalBackZ+.95,3.4,.55,1.5);
    for(const stripe of[-.55,0,.55])box('gold',0xb9944e,x+stripe,upperY+24,royalBackZ+1.33,.09,40,.12);
  }
  for(const y of[7.8,43.5,46.8]){box('marble',0xf1e5c8,0,upperY+y,royalBackZ+.7,178,.75,1.3);box('gold',0xe0b95f,0,upperY+y+.46,royalBackZ+1.25,178,.19,.15);}
  for(let x=-78;x<=78;x+=12){
    add('gold',0xd9b65e,sphere,x,upperY+8.25,royalBackZ+1.45,.65,.65,.15);box('gold',GOLD,x,upperY+10.6,royalBackZ+.6,.22,2.7,.15);box('gold',GOLD,x,upperY+10.8,royalBackZ+.7,2.5,.2,.15);for(const side of[-1,1])beam('gold',GOLD,{x:x+side*.6,y:upperY+11.8,z:royalBackZ+.7},{x:x+side*1.5,y:upperY+13,z:royalBackZ+.7},.18,.12);
  }
  for(const side of[-1,1]){
    const x=side*47,z=royalBackZ+1.7,top=upperY+40;
    box('gold',0xe7c471,x,top+.5,z,19,.35,.4);add('gold',GOLD,sphere,x-9.8,top+.5,z,.4,.4,.4);add('gold',GOLD,sphere,x+9.8,top+.5,z,.4,.4,.4);
    // Individual raised folds and borders are geometry on the same hanging.
    for(let fold=0;fold<16;fold++){const xx=x-8.5+(fold+.5)*17/16;box('velvet',side<0?0x285e94:0xa43d49,xx,top-15,z+Math.sin(fold*Math.PI*.5)*.12,17/16,30,.16);}
    for(const border of[-1,1])box('gold',0xd9b359,x+border*8.15,top-15,z+.2,.2,29.5,.12);
    box('gold',0xe1ba62,x,top-29.3,z+.2,16.3,.25,.13);
    const emblemY=top-13;
    box('gold',0xedcb77,x,emblemY-1,z+.37,.65,11,.18);box('gold',0xedcb77,x,emblemY-1.4,z+.37,6.5,.6,.18);
    for(const petal of[-1,0,1])add('gold',0xe9c777,sphere,x+petal*2.1,emblemY+2.6-Math.abs(petal)*1.3,z+.42,petal===0?1.1:1.4,petal===0?3.1:2.5,.19,0,0,-petal*.55);
    box('gold',0xedcb77,x,emblemY-5.8,z+.37,4.4,.55,.18);
    box('gold',0xedcb77,x,emblemY+7.5,z+.37,7,.7,.18);for(const spike of[-1,0,1])box('gold',0xedcb77,x+spike*2.5,emblemY+8.6,z+.37,.6,2.2,.2);
  }
  chandelier(0,upperY,-3890,upperY+35,9);
  active='east-gallery';for(let x=190;x<490;x+=60){box('wood',0x6e4c32,x,upperY+6,-3779,15,10,.3);box('gold',GOLD,x,upperY+6,-3778.7,15.7,10.7,.18);box('velvet',x%120===10?RED:BLUE,x,upperY+6,-3778.5,14.8,9.8,.08);for(let i=0;i<5;i++)box('gold',GOLD,x-5+i*2.5,upperY+3+i*.8,-3778.35,.35,3.2,.1);}
  for(const [i,x]of[220,340,460].entries()){royalStatue(x,upperY,-3777.5,i+4);royalSeat(x+24,upperY,-3762.1,Math.PI);}
  active='gallery';for(const side of[-1,1]){royalConsole(side*112,upperY,-3777.6);royalStatue(side*140,upperY,-3775,side<0?7:8);}
  // Imperial stairs are actual 15 cm treads, with no sloping surrogate.
  const stair=ROYAL_INTERIOR_STAIRS;sector('imperial-stairs',{x:60,y:stair.startY+30,z:-3740},450);
  for(let i=0;i<stair.steps;i++){const top=stair.startY+(i+1)/stair.steps*(stair.endY-stair.startY),x=stair.minX+(i+.5)*(stair.maxX-stair.minX)/stair.steps;box('marble',i%4?IVORY:PALE,x,(stair.startY+top)/2,-3740,(stair.maxX-stair.minX)/stair.steps,top-stair.startY,20);}
  box('wood',0x634f35,60,stair.endY+36,-3740,120,.8,20);
  for(const side of[-1,1]){const z=-3740+side*10.6;beam('gold',GOLD,{x:0,y:stair.startY+1.3,z},{x:120,y:stair.endY+1.3,z},.14);for(let x=0;x<=120;x+=3){const y=stair.startY+x/120*36;box('gold',GOLD,x,y+.65,z,.12,1.3,.12);}}
  const balusterShape=[new THREE.Vector2(.2,0),new THREE.Vector2(.22,.1),new THREE.Vector2(.12,.22),new THREE.Vector2(.085,.4),new THREE.Vector2(.17,.57),new THREE.Vector2(.13,.76),new THREE.Vector2(.075,.94),new THREE.Vector2(.16,1.12),new THREE.Vector2(.18,1.2)],balusterGeometry=new THREE.LatheGeometry(balusterShape,8);
  for(const side of[-1,1]){
    const z=-3740+side*10.7;
    for(let x=1.5;x<120;x+=2.5){const y=stair.startY+x/120*36;add('marble',IVORY,balusterGeometry,x,y,z);add('gold',GOLD,cylinder,x,y+.61,z,.19,.1,.19);}
    beam('wood',0x6c442b,{x:0,y:stair.startY+1.35,z},{x:120,y:stair.endY+1.35,z},.32,.4);
    beam('gold',GOLD,{x:0,y:stair.startY+1.55,z},{x:120,y:stair.endY+1.55,z},.09,.3);
    for(const x of[0,30,60,90,120]){const y=stair.startY+x/120*36;box('marble',IVORY,x,y+.7,z,.72,1.4,.72);box('gold',GOLD,x,y+1.45,z,.9,.14,.9);add('gold',0xe4c77e,sphere,x,y+1.78,z,.3,.34,.3);}
  }
  balusterGeometry.dispose();
  // A continuous, supported spiral fits within the real east tower's shell.
  const tower=ROYAL_INTERIOR_TOWER,endAngle=tower.startAngle+tower.steps*tower.stride/tower.radius;
  sector('tower-stairs',{x:tower.x,y:(tower.startY+tower.endY)/2,z:tower.z},1000);
  add('stone',PALE,cylinder,tower.x,(tower.startY+tower.endY)/2,tower.z,8,tower.endY-tower.startY,8);obstacle('tower-central-support',tower.x,tower.z,16,16,tower.startY,tower.endY);
  const spiralVertices:number[]=[];const tri=(a:number[],b:number[],c:number[])=>spiralVertices.push(...a,...b,...c),quad=(a:number[],b:number[],c:number[],d:number[])=>{tri(a,b,d);tri(b,c,d);};
  function wedge(a:number,b:number,r1:number,r2:number,top:number,thickness:number){const point=(r:number,angle:number,y:number)=>[tower.x+Math.cos(angle)*r,y,tower.z+Math.sin(angle)*r],a1=point(r1,a,top),a2=point(r2,a,top),b1=point(r1,b,top),b2=point(r2,b,top),c1=point(r1,a,top-thickness),c2=point(r2,a,top-thickness),d1=point(r1,b,top-thickness),d2=point(r2,b,top-thickness);quad(a1,b1,b2,a2);quad(c2,d2,d1,c1);quad(c1,a1,a2,c2);quad(d2,b2,b1,d1);quad(c1,d1,b1,a1);quad(c2,a2,b2,d2);}
  for(let i=0;i<tower.steps;i++){const a=tower.startAngle+i*tower.stride/tower.radius,b=a+tower.stride/tower.radius,top=tower.startY+(i+1)/tower.steps*(tower.endY-tower.startY);wedge(a,b,tower.radius-4,tower.radius+4,top,.3);}
  const stairsGeometry=new THREE.BufferGeometry();stairsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(spiralVertices,3));stairsGeometry.computeVertexNormals();add('marble',IVORY,stairsGeometry);stairsGeometry.dispose();spiralVertices.length=0;
  for(let i=0;i<tower.steps;i+=16)for(const side of[-1,1]){const j=Math.min(tower.steps,i+16),a=tower.startAngle+i*tower.stride/tower.radius,b=tower.startAngle+j*tower.stride/tower.radius,r=tower.radius+side*5,ya=tower.startY+i/tower.steps*(tower.endY-tower.startY),yb=tower.startY+j/tower.steps*(tower.endY-tower.startY),ax=tower.x+Math.cos(a)*r,az=tower.z+Math.sin(a)*r,bx=tower.x+Math.cos(b)*r,bz=tower.z+Math.sin(b)*r;beam('gold',GOLD,{x:ax,y:ya+1.2,z:az},{x:bx,y:yb+1.2,z:bz},.12);box('gold',GOLD,ax,ya+.6,az,.12,1.2,.12);}
  active='tower-approach';royalDoor(689,upperY,tower.z,12,15,-Math.PI/2);
  sector('tower-lookout',{x:tower.x,y:tower.endY+6,z:tower.z},400);
  const platformVertices:number[]=[];
  const platformTriangles:number[]=[];function platformQuad(a:number,b:number,r1:number,r2:number){const y=tower.endY,at=(r:number,t:number)=>[tower.x+Math.cos(t)*r,y,tower.z+Math.sin(t)*r],p1=at(r1,a),p2=at(r2,a),p3=at(r2,b),p4=at(r1,b);platformTriangles.push(...p1,...p4,...p2,...p4,...p3,...p2);}
  const normalized=(a:number)=>(a%TAU+TAU)%TAU,holeStart=normalized(endAngle-.8),holeEnd=normalized(endAngle+.05),angles=[...Array.from({length:161},(_,i)=>i*TAU/160),holeStart,holeEnd].sort((a,b)=>a-b);
  const inHole=(a:number)=>{const value=normalized(a-(endAngle-.8));return value<=.85;};
  for(let i=0;i<angles.length-1;i++)for(const[r1,r2]of[[48,55],[55,65],[65,81]])if(r1!==55||!inHole((angles[i]+angles[i+1])/2))platformQuad(angles[i],angles[i+1],r1,r2);
  platformQuad(endAngle,endAngle+.06,56,64);
  platformVertices.push(...platformTriangles);const platform=new THREE.BufferGeometry();platform.setAttribute('position',new THREE.Float32BufferAttribute(platformVertices,3));platform.computeVertexNormals();add('marble',IVORY,platform);platform.dispose();
  for(let i=0;i<128;i++)for(const r of[48.6,80.5]){const a=i*TAU/128,b=(i+1)*TAU/128;if(r===48.6&&inHole((a+b)/2))continue;const ax=tower.x+Math.cos(a)*r,az=tower.z+Math.sin(a)*r,bx=tower.x+Math.cos(b)*r,bz=tower.z+Math.sin(b)*r;beam('gold',GOLD,{x:ax,y:tower.endY+1.2,z:az},{x:bx,y:tower.endY+1.2,z:bz},.13);box('stone',IVORY,ax,tower.endY+.58,az,.2,1.16,.2);}
  for(let i=0;i<8;i++){const a=i*TAU/8;box('gold',GOLD,tower.x+Math.cos(a)*76,tower.endY+.4,tower.z+Math.sin(a)*76,2,.8,1.2,a);}
  unit.dispose();cylinder.dispose();sphere.dispose();
  let drawCalls=0,triangles=0;
  for(const[id,entry]of sectors){for(const[finish,parts]of entry.parts){if(!parts.length)continue;const geometry=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.add(geometry);const mesh=new THREE.Mesh(geometry,finishes[finish]);mesh.name=`royal-interior:${id}:${finish}`;mesh.castShadow=finish!=='flame'&&finish!=='glass';mesh.receiveShadow=true;entry.group.add(mesh);drawCalls++;triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;}entry.parts.clear();}
  const lights=Array.from({length:4},()=>{const light=new THREE.PointLight(0xffd498,1600,100,2);light.castShadow=false;group.add(light);return light;});
  const metrics=Object.freeze({royalSeats,consoles,bookcases,statues,lions,carpetFinish:'woven-medallions-double-braid-fringes',ornamentalBalusters:96,throneSurroundHeight:36,rooms:ROYAL_INTERIOR_ROOMS.length,sectors:sectors.size,chandeliers,candelabras,doors,tables,towerSteps:tower.steps,imperialSteps:stair.steps,drawCalls,triangles,lights:4,royalIvoryPanels:5,heraldicStandards:2,royalPendant:{x:0,y:upperY+24,z:-3890,radius:9},throne:{x:0,y:dais.y,z:throneZ},towerPortal:{x:689,y:upperY,z:tower.z,width:12,height:15},lookoutY:tower.endY});group.userData.royalInterior=metrics;
  let disposed=false;
  function setFocus(x:number,y:number,z:number){if(disposed)return;const ranked=[...sectors.values()].map(sector=>({sector,distance:Math.hypot(x-sector.center.x,y-sector.center.y,z-sector.center.z)})).sort((a,b)=>a.distance-b.distance);for(const row of ranked)row.sector.group.visible=row.distance<row.sector.reach;
    for(let i=0;i<lights.length;i++){const r=ranked[i];lights[i].visible=!!r&&r.distance<450;if(r)lights[i].position.set(r.sector.center.x,r.sector.center.y+2,r.sector.center.z);}}
  function update(seconds:number){if(disposed)return;const t=Number.isFinite(seconds)?seconds:0;finishes.flame.emissiveIntensity=1.1+Math.sin(t*3.1)*.04+Math.sin(t*7.3)*.025;for(let i=0;i<lights.length;i++)lights[i].intensity=1600*(1+Math.sin(t*2.7+i*1.8)*.025);}
  function dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();group.clear();}
  setFocus(0,ROYAL_INTERIOR_FLOOR,-3535);return{group,obstacles,metrics,setFocus,update,dispose};
}
