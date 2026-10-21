import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {citadelWorldPoint,ROYAL_CITADEL_COURT_Y,ROYAL_CITADEL_TRANSFORM,ROYAL_CITADEL_BASELINE} from './royal-citadel-layout.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';

export type RoyalCitadelGroundHeight=(x:number,z:number)=>number|null;
export interface RoyalCitadelGardenObstacle {readonly x:number;readonly z:number;readonly y:number;readonly height:number;readonly halfWidth:number;readonly halfDepth:number}
export const ROYAL_CITADEL_PUBLIC_PLAZA=Object.freeze({
  minX:citadelWorldPoint(-47,0,0).x,maxX:citadelWorldPoint(47,0,0).x,
  minZ:citadelWorldPoint(0,0,43).z,maxZ:citadelWorldPoint(0,0,70).z,
  y:ROYAL_CITADEL_COURT_Y,centralAvenueHalfWidth:citadelWorldPoint(6.5,0,0).x,
});
type Finish='paving'|'stone'|'bronze'|'foliage'|'flower'|'wood'|'water';
type Point={x:number;y:number;z:number};
const COURT_SCALE=ROYAL_CITADEL_TRANSFORM.scale/ROYAL_CITADEL_BASELINE.scale;
const MONUMENT_SCALE=8;
const FOUNTAIN_SCALE=8;
/** Position belongs to the enlarged architecture; objects and their working
 * clearances remain measured in human world metres. */
export const ROYAL_CITADEL_WORK_SITES=Object.freeze({
  bench:Object.freeze(citadelWorldPoint(59,1.3,22)),
  stonePile:Object.freeze(citadelWorldPoint(62.15,1.3,30)),
  planter:Object.freeze(citadelWorldPoint(-59,1.3,19)),
});
/** A real garden and sculpture court, in shared city coordinates. Its timers
 * animate fountain water only; no inventory or saved world is read or changed. */
export function createRoyalCitadelGardens(options:{groundHeight?:RoyalCitadelGroundHeight}={}){
  const group=new THREE.Group();group.name='royal-citadel-formal-gardens-and-monuments';
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),batches=new Map<Finish,THREE.BufferGeometry[]>(),obstacles:RoyalCitadelGardenObstacle[]=[];
  const finishes:Record<Finish,THREE.MeshStandardMaterial>={
    paving:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96}),
    stone:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86}),
    bronze:new THREE.MeshStandardMaterial({vertexColors:true,metalness:.72,roughness:.38}),
    foliage:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98}),
    flower:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}),
    wood:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82}),
    water:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.19,metalness:.25,transparent:true,opacity:.76,depthWrite:false}),
  };
  Object.values(finishes).forEach(m=>materials.add(m));applyRoyalSurfaceDetail(finishes.stone,'masonry');applyRoyalSurfaceDetail(finishes.wood,'wood');
  const unit=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();
  let enlargement:{origin:Point;factor:number}|null=null;
  function monumental(origin:Point,factor:number,build:()=>void){enlargement={origin,factor};try{build();}finally{enlargement=null;}}
  const at=(lx:number,lz:number):Point=>{const w=citadelWorldPoint(lx,1.3,lz);return{...w,y:options.groundHeight?.(w.x,w.z)??w.y};};
  function add(finish:Finish,colour:number,source:THREE.BufferGeometry,x:number,y:number,z:number,w=1,h=1,d=1,rx=0,ry=0,rz=0){
    const g=source.index?source.toNonIndexed():source.clone();matrix.compose(p.set(x,y,z),q.setFromEuler(new THREE.Euler(rx,ry,rz)),s.set(w,h,d));g.applyMatrix4(matrix);
    if(enlargement){const{origin,factor}=enlargement;g.translate(-origin.x,-origin.y,-origin.z).scale(factor,factor,factor).translate(origin.x,origin.y,origin.z);}
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
    if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const rgb=new Float32Array(g.attributes.position.count*3),c=new THREE.Color(colour);for(let i=0;i<rgb.length;i+=3)c.toArray(rgb,i);g.setAttribute('color',new THREE.BufferAttribute(rgb,3));
    const list=batches.get(finish)??[];list.push(g);batches.set(finish,list);
  }
  const box=(finish:Finish,colour:number,x:number,y:number,z:number,w:number,h:number,d:number,ry=0,rz=0)=>add(finish,colour,unit,x,y,z,w,h,d,0,ry,rz);
  function primitive(finish:Finish,colour:number,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0){add(finish,colour,g,x,y,z,1,1,1,rx,ry,rz);g.dispose();}
  function beam(finish:Finish,colour:number,a:Point,b:Point,width:number,depth=width){const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),angles=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));add(finish,colour,unit,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,width,delta.length(),depth,angles.x,angles.y,angles.z);}
  const pale=0xd9ceb0,light=0xeee2c7,dark=0xa6a18b,bronze=0xa78a49,patina=0x537e6c,gold=0xdfb55e;
  function obstacle(x:number,y:number,z:number,w:number,d:number,height:number){if(enlargement){const{origin,factor}=enlargement;x=origin.x+(x-origin.x)*factor;y=origin.y+(y-origin.y)*factor;z=origin.z+(z-origin.z)*factor;w*=factor;d*=factor;height*=factor;}obstacles.push(Object.freeze({x,z,y,height,halfWidth:w/2,halfDepth:d/2}));}
  // Large processional paving has actual courses and a sun medallion, leaving
  // an unobstructed avenue through both gates rather than a decorative blocker.
  const pavingBase=at(0,56.5);box('paving',0xb6ae92,pavingBase.x,pavingBase.y-.025,pavingBase.z,286*COURT_SCALE,.04,83*COURT_SCALE);
  for(let lx=-45;lx<=45;lx+=2)for(let lz=44;lz<=69;lz+=2){const w=at(lx,lz),central=Math.abs(lx)<6.5;box('paving',central?((lx+lz)%4?light:pale):((lx+lz)%6?0xc6bd9f:0xb9b298),w.x,w.y+.035,w.z,5.95*COURT_SCALE,.07,5.95*COURT_SCALE);}
  for(const side of[-1,1]){
    for(const lx of[18.2,34.8])for(const lz of[47.5,65]){
      const w=at(side*lx,lz),width=(lx<20?27:35)*COURT_SCALE,depth=15.2*COURT_SCALE;
      box('stone',dark,w.x,w.y+.32,w.z,width+1.6,.65,depth+1.6);box('foliage',0x526637,w.x,w.y+.68,w.z,width,.18,depth);
      for(const dz of[-1,1])box('stone',pale,w.x,w.y+.57,w.z+dz*(depth/2+.35),width+1.5,.48,.7);
      for(const dx of[-1,1])box('stone',pale,w.x+dx*(width/2+.35),w.y+.57,w.z,.7,.48,depth);
      // Clipped box hedges and four flower beds form a legible parterre motif.
      for(const dz of[-1,1])box('foliage',0x365c32,w.x,w.y+1.12,w.z+dz*(depth/2-1.1),width-1.2,1.05,1.3);
      for(const dx of[-1,1])box('foliage',0x466f38,w.x+dx*(width/2-1.1),w.y+1.12,w.z,1.3,1.05,depth-2.2);
      for(const dx of[-1,1])for(const dz of[-1,1]){
        const bx=w.x+dx*width*.25,bz=w.z+dz*depth*.23,bedWidth=width*.34,bedDepth=depth*.27;box('foliage',0x6f7c37,bx,w.y+.88,bz,bedWidth,.24,bedDepth);
        // Long colour ribbons read as dense formal planting from the distant
        // palace camera. Individually modelled blossoms retain a human size.
        for(let ribbon=-1;ribbon<=1;ribbon++)box('flower',[0xe1ce86,0xb8698b,0xeee0bc][ribbon+1],bx,w.y+1.07,bz+ribbon*bedDepth*.27,bedWidth-1,.16,Math.max(1,bedDepth*.15));
        for(let i=0;i<20;i++){const x=bx+(i%5-2)*(bedWidth-2)/5,z=bz+(Math.floor(i/5)-1.5)*(bedDepth-2)/4;primitive('foliage',0x3f743b,new THREE.CylinderGeometry(.12,.18,.6,5),x,w.y+1.18,z);primitive('flower',[0xe1ce86,0xeee0bc,0xb8698b,0xcaa94d][Math.floor(i/5)%4],new THREE.IcosahedronGeometry(.34,0),x,w.y+1.57,z);}
      }
      obstacle(w.x,w.y,w.z,width+1.6,depth+1.6,1.75);
    }
    // Paired water basins are outside the circulation loop and the central road.
    const f=at(side*41.5,55.7),r=6.5;
    monumental(f,FOUNTAIN_SCALE,()=>{
    primitive('stone',dark,new THREE.CylinderGeometry(r+.9,r+1.2,.8,24),f.x,f.y+.4,f.z);
    primitive('stone',light,new THREE.TorusGeometry(r,.65,6,32),f.x,f.y+1.18,f.z,Math.PI/2);
    primitive('water',0x4dadaf,new THREE.CylinderGeometry(r-.55,r-.55,.1,32),f.x,f.y+.98,f.z);
    primitive('stone',pale,new THREE.CylinderGeometry(1.1,1.7,3.7,12),f.x,f.y+2.4,f.z);
    primitive('stone',light,new THREE.CylinderGeometry(2.8,1.4,.7,16),f.x,f.y+4.3,f.z);
    primitive('bronze',gold,new THREE.SphereGeometry(.5,12,8),f.x,f.y+5.05,f.z);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,points=Array.from({length:13},(_,j)=>{const t=j/12,distance=t*4.7;return new THREE.Vector3(f.x+Math.cos(a)*distance,f.y+4.8+2.2*Math.sin(t*Math.PI)-3.8*t,f.z+Math.sin(a)*distance);});primitive('water',0xb8eee0,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.065,4,false),0,0,0);}
    obstacle(f.x,f.y,f.z,2*(r+1.2),2*(r+1.2),5.5);
    });
    // Rest benches face the monuments; garden tools and waterbutts have a
    // visible destination for the gardeners' repeated maintenance actions.
    for(const lz of[51.7,61.5]){const b=at(side*13.8,lz);box('wood',0x9e7649,b.x,b.y+1.2,b.z,7,.35,1.8);box('wood',0x825d39,b.x,b.y+2.0,b.z+side*.75,7,1.3,.3);for(const dx of[-2.6,2.6])box('bronze',0x526562,b.x+dx,b.y+.55,b.z,.3,1.1,1.5);obstacle(b.x,b.y,b.z,7,2.1,2.7);}
    for(const lx of[14,43])for(const lz of[44.2,69]){const t=at(side*lx,lz);primitive('stone',pale,new THREE.CylinderGeometry(1.35,1.65,1.0,8),t.x,t.y+.5,t.z);primitive('foliage',0x345f39,new THREE.CylinderGeometry(.5,.7,3.2,6),t.x,t.y+2.5,t.z);primitive('foliage',0x4a773e,new THREE.SphereGeometry(2.5,8,6),t.x,t.y+5.0,t.z);obstacle(t.x,t.y,t.z,4.5,4.5,7.6);}
  }
  function pedestal(w:Point,width=10){for(let i=0;i<4;i++)box('stone',i%2?light:pale,w.x,w.y+.5+i*.85,w.z,width-i*.7,.9,width-i*.7);box('stone',dark,w.x,w.y+4,w.z,width-1.4,1.2,width-1.4);for(const side of[-1,1])box('bronze',bronze,w.x,w.y+3,w.z+side*(width/2-1.02),width-3,1.6,.15);obstacle(w.x,w.y,w.z,width,width,15.5);}
  // The king is a sculpted body with crown, cuirass, cloak and grounded sword.
  const king=at(-27.2,55.7);monumental(king,MONUMENT_SCALE,()=>{pedestal(king,10.7);
  const ky=king.y+4.65;
  for(const sign of[-1,1]){box('bronze',bronze,king.x+sign*.8,ky+2.1,king.z,.95,4.1,1);box('bronze',patina,king.x+sign*.8,ky+.4,king.z+.4,1.1,.8,1.7);}
  box('bronze',bronze,king.x,ky+5.1,king.z,3.7,3.0,1.7);primitive('bronze',bronze,new THREE.SphereGeometry(1.12,12,10),king.x,ky+7.9,king.z);
  box('bronze',patina,king.x,ky+4.4,king.z-.95,4.2,5.7,.46);box('bronze',gold,king.x,ky+5.3,king.z+.91,1.55,1.8,.15);
  for(const sign of[-1,1]){primitive('bronze',gold,new THREE.SphereGeometry(.8,8,6),king.x+sign*2.0,ky+6.15,king.z);beam('bronze',bronze,{x:king.x+sign*1.9,y:ky+6.0,z:king.z},{x:king.x+sign*2.2,y:ky+3.7,z:king.z+1.0},.85);}
  primitive('bronze',gold,new THREE.CylinderGeometry(1.15,1.1,.55,10),king.x,ky+8.8,king.z);for(let i=0;i<8;i++){const a=i*Math.PI/4;primitive('bronze',gold,new THREE.ConeGeometry(.15,.65,4),king.x+Math.sin(a)*.94,ky+9.38,king.z+Math.cos(a)*.94);}
  box('bronze',0xd6c990,king.x+2.2,ky+2,king.z+1.3,.25,4.4,.16);box('bronze',gold,king.x+2.2,ky+4.1,king.z+1.3,1.4,.22,.32);
  });
  // The opposing monument depicts a royal standard and three soldiers protecting
  // a fallen shield, rather than a second copy of the king.
  const battle=at(27.2,55.7);monumental(battle,MONUMENT_SCALE,()=>{pedestal(battle,12);
  for(let i=0;i<3;i++){const x=battle.x+(i-1)*2.45,yy=battle.y+4.7+(i===1?.5:0),z=battle.z+(i===1?-1:1);for(const sign of[-1,1])box('bronze',patina,x+sign*.38,yy+1.45,z,.65,2.9,.75);box('bronze',bronze,x,yy+3.8,z,1.9,2.4,1.2);primitive('bronze',bronze,new THREE.SphereGeometry(.75,10,8),x,yy+5.65,z);primitive('bronze',gold,new THREE.ConeGeometry(.83,.9,10),x,yy+6.15,z);box('bronze',patina,x-.95,yy+3.3,z+.48,.23,2.3,1.45);box('bronze',gold,x-.95,yy+3.3,z+1.22,.12,1.25,.15);beam('bronze',bronze,{x:x+.9,y:yy+4.4,z},{x:x+1.3,y:yy+3.3,z:z+.6},.6);}
  box('bronze',gold,battle.x,battle.y+11.8,battle.z-1,.16,10.8,.16);box('bronze',patina,battle.x+1.5,battle.y+15.4,battle.z-1,3.1,3.2,.18);box('bronze',gold,battle.x+1.5,battle.y+15.4,battle.z-.87,.22,2.4,.12);
  });
  // Working annexes lie between the inner and outer curtain walls, clear of
  // the two branched palace staircases and the ceremonial central axis.
  const bench=at(59,22);box('wood',0xa68050,bench.x,bench.y+1.7,bench.z,5.3,.45,2.5);for(const dx of[-2,2])for(const dz of[-.85,.85])box('wood',0x705338,bench.x+dx,bench.y+.8,bench.z+dz,.35,1.6,.35);box('stone',pale,bench.x,bench.y+2.3,bench.z,2.0,.7,1.3);obstacle(bench.x,bench.y,bench.z,5.3,2.5,3.0);
  const stonePile=at(62.15,30);for(let i=0;i<5;i++)box('stone',i%2?pale:dark,stonePile.x+(i%2-.5)*.8,stonePile.y+.35+Math.floor(i/2)*.48,stonePile.z+(i%2?-.4:.4),.9,.55,1.1);obstacle(stonePile.x,stonePile.y,stonePile.z,1.8,2,1.6);
  const planter=at(-59,19);box('stone',pale,planter.x,planter.y+.8,planter.z,5.5,1.6,3.2);box('foliage',0x527345,planter.x,planter.y+1.65,planter.z,4.7,.2,2.5);for(let i=0;i<7;i++)primitive('flower',i%2?0xd7b46a:0xe7d9bb,new THREE.IcosahedronGeometry(.43,0),planter.x-2+i*.65,planter.y+2.15,planter.z);obstacle(planter.x,planter.y,planter.z,5.5,3.2,2.6);
  for(const[finish,parts]of batches){const g=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());geometries.add(g);g.computeBoundingSphere();const mesh=new THREE.Mesh(g,finishes[finish]);mesh.name=`royal-citadel-garden:${finish}`;mesh.castShadow=finish!=='water';mesh.receiveShadow=true;group.add(mesh);}unit.dispose();
  const sprayGeometry=new THREE.SphereGeometry(.1,4,3),sprayMaterial=new THREE.MeshBasicMaterial({color:0xd3f1e9,transparent:true,opacity:.75,depthWrite:false});geometries.add(sprayGeometry);materials.add(sprayMaterial);
  const spray=new THREE.InstancedMesh(sprayGeometry,sprayMaterial,64);spray.name='royal-citadel-fountain-moving-droplets';spray.frustumCulled=false;group.add(spray);const dummy=new THREE.Object3D();
  let disposed=false;function update(seconds:number){if(disposed)return;const time=Number.isFinite(seconds)?seconds:0;for(let i=0;i<64;i++){const f=at((i<32?-1:1)*41.5,55.7),a=(i%8)*Math.PI/4,t=((time*.45+Math.floor(i/8)*.25)%1+1)%1;dummy.position.set(f.x+Math.cos(a)*4.7*t*FOUNTAIN_SCALE,f.y+(4.8+2.2*Math.sin(t*Math.PI)-3.8*t)*FOUNTAIN_SCALE,f.z+Math.sin(a)*4.7*t*FOUNTAIN_SCALE);dummy.scale.setScalar((.65+.4*t)*FOUNTAIN_SCALE);dummy.updateMatrix();spray.setMatrixAt(i,dummy.matrix);}spray.instanceMatrix.needsUpdate=true;}
  update(0);group.userData.royalCitadelGardens={parterres:8,statues:2,fountains:2,centralAvenue:'open',simulation:false};
  return{group,obstacles,metrics:{parterres:8,statues:2,fountains:2},update,dispose(){if(disposed)return;disposed=true;group.removeFromParent();spray.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}};
}
