import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const ROYAL_CITADEL_FLAG_PLAN=Object.freeze([
  {id:'royal-crown',x:8,y:140.7,z:-23,width:8.5,height:4.8,mast:6.8,yaw:.14},
  {id:'western-belfry',x:-41,y:107.7,z:-8,width:7.0,height:4.2,mast:6,yaw:-.1},
  {id:'eastern-crown',x:40,y:97.7,z:-25,width:6.3,height:3.8,mast:5.5,yaw:.1},
  {id:'western-spire',x:-24,y:105.7,z:-26,width:6.8,height:4.1,mast:5.8,yaw:-.2},
  {id:'eastern-spire',x:23,y:110.7,z:-24,width:6.8,height:4.1,mast:5.8,yaw:.12},
  ...[-1,1].flatMap(sign=>[
    {id:`outer-gate-${sign}`,x:sign*14,y:23.95,z:75.5,width:5.0,height:3.0,mast:4.5,yaw:sign*.15},
    {id:`outer-bastion-${sign}`,x:sign*63,y:14.3,z:65,width:4.8,height:2.9,mast:4.3,yaw:sign*.12},
    {id:`outer-rear-${sign}`,x:sign*63,y:22.95,z:-38,width:4.8,height:2.9,mast:4.3,yaw:-sign*.13},
    {id:`palace-entry-${sign}`,x:sign*25.8,y:65.7,z:14.3,width:5.7,height:3.4,mast:5.0,yaw:sign*.1},
  ]),
]);

/** Actual cloth geometry, pinned down its mast edge. Every instance owns its
 * finite dynamic buffers; opening two viewers cannot mutate the other's flags.
 * Coordinates are local to the palace and accept the same scene transform. */
export function createRoyalCitadelFlags(){
  const group=new THREE.Group();group.name='royal-citadel-wind-banners';
  const columns=24,rows=12,stride=(columns+1)*(rows+1),count=stride*ROYAL_CITADEL_FLAG_PLAN.length;
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),uvs=new Float32Array(count*2),indices:number[]=[],blue=new THREE.Color(0x114e93),gold=new THREE.Color(0xf2cc68),edge=new THREE.Color(0x81a7c0);
  const supportParts:THREE.BufferGeometry[]=[],supportUnit=new THREE.CylinderGeometry(.055,.075,1,8),capUnit=new THREE.SphereGeometry(.13,8,6);
  for(let flagIndex=0;flagIndex<ROYAL_CITADEL_FLAG_PLAN.length;flagIndex++){
    const flag=ROYAL_CITADEL_FLAG_PLAN[flagIndex],offset=flagIndex*stride;
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const vertex=offset+row*(columns+1)+column,u=column/columns,v=row/rows;
      uvs[vertex*2]=u;uvs[vertex*2+1]=v;
      // The gold crown and fleur-de-lis are woven into the blue cloth, so the
      // heraldry follows every fold instead of floating in front of the flag.
      const x=(u-.49)*2,y=(v-.49)*2,crown=v>.18&&v<.29&&u>.32&&u<.67&&(v>.25||Math.abs((u-.32)*19%1-.5)<.28);
      const stem=Math.abs(x)<.055&&y>-.32&&y<.58,arms=Math.abs(y-.13)<.045&&Math.abs(x)<.35;
      const petals=((x-.18)**2/.018+(y+.18)**2/.07<1)||((x+.18)**2/.018+(y+.18)**2/.07<1)||(x*x/.014+(y+.33)**2/.08<1);
      const footer=Math.abs(y-.49)<.045&&Math.abs(x)<.18,border=column===columns||row===0||row===rows;
      const color=crown||stem||arms||petals||footer?gold:border?edge:blue;
      colors.set([color.r,color.g,color.b],vertex*3);
      if(row<rows&&column<columns){const a=vertex,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d);}
    }
    const pole=supportUnit.clone();pole.scale(1,flag.mast,1);pole.translate(flag.x,flag.y+flag.mast/2,flag.z);supportParts.push(pole);
    const cap=capUnit.clone();cap.translate(flag.x,flag.y+flag.mast+.1,flag.z);supportParts.push(cap);
  }
  supportUnit.dispose();capUnit.dispose();
  const clothGeometry=new THREE.BufferGeometry();clothGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));clothGeometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));clothGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));clothGeometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));clothGeometry.setIndex(indices);
  const clothMaterial=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.91,metalness:.03});
  const cloth=new THREE.Mesh(clothGeometry,clothMaterial);cloth.name='royal-blue-gold-animated-cloth';cloth.castShadow=true;cloth.receiveShadow=false;cloth.frustumCulled=false;group.add(cloth);
  const supportGeometry=mergeGeometries(supportParts,false)!;supportParts.forEach(part=>part.dispose());const supportMaterial=new THREE.MeshStandardMaterial({color:0xd3ac56,metalness:.62,roughness:.34});const supports=new THREE.Mesh(supportGeometry,supportMaterial);supports.name='royal-banner-masts';supports.castShadow=true;supports.receiveShadow=true;group.add(supports);
  let disposed=false;
  function update(seconds:number){
    if(disposed)return;const time=Number.isFinite(seconds)?seconds:0;
    for(let flagIndex=0;flagIndex<ROYAL_CITADEL_FLAG_PLAN.length;flagIndex++){
      const flag=ROYAL_CITADEL_FLAG_PLAN[flagIndex],offset=flagIndex*stride,c=Math.cos(flag.yaw),s=Math.sin(flag.yaw),phase=flagIndex*.63;
      for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
        const vertex=offset+row*(columns+1)+column,u=column/columns,v=row/rows,a=time*1.45+u*8+v*1.5+phase,b=time*2.6+u*15-v*4+phase,fall=Math.sin(time*1.15+u*7+phase),wave=Math.sin(a)*u*.14+Math.sin(b)*u*.04;
        const localX=u*flag.width,localY=-v*flag.height+fall*u*.065,localZ=wave;
        positions[vertex*3]=flag.x+c*localX+s*localZ;positions[vertex*3+1]=flag.y+flag.mast-.45+localY;positions[vertex*3+2]=flag.z-s*localX+c*localZ;
        const dzdu=Math.sin(a)*.14+Math.cos(a)*u*1.12+Math.sin(b)*.04+Math.cos(b)*u*.6,dzdv=Math.cos(a)*u*.21-Math.cos(b)*u*.16;
        const nx=-dzdu/flag.width,ny=dzdv/flag.height,length=Math.hypot(nx,ny,1);normals[vertex*3]=(c*nx+s)/length;normals[vertex*3+1]=ny/length;normals[vertex*3+2]=(-s*nx+c)/length;
      }
    }
    clothGeometry.attributes.position.needsUpdate=true;clothGeometry.attributes.normal.needsUpdate=true;
  }
  update(0);clothGeometry.computeBoundingBox();clothGeometry.computeBoundingSphere();
  const metrics=Object.freeze({flags:ROYAL_CITADEL_FLAG_PLAN.length,drawCalls:2,vertices:count,triangles:indices.length/3,wind:'coherent-positive-x',anchoredEdge:'mast',heraldry:'blue-gold-crown-fleur-de-lis'});
  group.userData.royalFlags=metrics;
  function dispose(){if(disposed)return;disposed=true;clothGeometry.dispose();clothMaterial.dispose();supportGeometry.dispose();supportMaterial.dispose();group.clear();}
  return{group,update,dispose,metrics};
}
