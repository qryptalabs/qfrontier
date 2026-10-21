import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export interface RoyalGalleonOptions {scale?:number;variant?:number}
export interface RoyalShipLibrary {create(options?:RoyalGalleonOptions):THREE.Group;dispose():void}
/** Local Y=0 is the waterline; the pointed bow and bowsprit face negative Z. */
export const ROYAL_GALLEON_DIMENSIONS=Object.freeze({hullLength:36,hullBeam:10,overallLength:43.8,rigBeam:16.4,mastHeight:40,draft:3.7});
type Finish='timber'|'dark'|'gold'|'cloth'|'blue'|'glass'|'iron';
type Point=readonly[number,number,number];
const C={wood:0x926337,light:0xc89c5d,dark:0x49321f,gold:0xd8ae50,cream:0xf2e7ce,blue:0x14549a,rope:0x766349,glass:0xc5a96b,iron:0x343f42};
const standaloneOwners=new WeakMap<THREE.Group,RoyalShipLibrary>();

function finishTexture(linen=false){
  const size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const hash=(Math.imul(x+19,374761393)^Math.imul(y+31,668265263))>>>0;
    const grain=linen?((x%4===0||y%4===0)?-12:3):Math.sin(x*.55+Math.sin(y*.14)*.8)*9;
    const light=Math.round(239+grain+hash%7);pixels.set([light,light,light,255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(pixels,size,size);texture.name=linen?'royal-sail-linen':'royal-ship-timber';texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

/** Viewer-owned templates: clones share seven material batches, never another viewer's pool. */
export function createRoyalShipLibrary():RoyalShipLibrary {
  const timberTexture=finishTexture(),linenTexture=finishTexture(true),materials:Record<Finish,THREE.MeshStandardMaterial>={
    timber:new THREE.MeshStandardMaterial({vertexColors:true,map:timberTexture,roughness:.79}),
    dark:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94}),
    gold:new THREE.MeshStandardMaterial({vertexColors:true,metalness:.46,roughness:.36}),
    // Linen scatters daylight through its weave. A small intrinsic warm bounce
    // keeps the reverse of the sail legible rather than turning it pitch black.
    cloth:new THREE.MeshStandardMaterial({vertexColors:true,map:linenTexture,roughness:.94,side:THREE.DoubleSide,emissive:0xe4dcc6,emissiveIntensity:.27}),
    blue:new THREE.MeshStandardMaterial({vertexColors:true,map:linenTexture,roughness:.91,side:THREE.DoubleSide,emissive:0x17416e,emissiveIntensity:.2}),
    glass:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.24,metalness:.15,emissive:0xd9a257,emissiveIntensity:.17}),
    iron:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.67}),
  };
  const cache=new Map<number,THREE.Group>(),geometries=new Set<THREE.BufferGeometry>(),instances=new Set<THREE.Group>();let disposed=false;
  for(const[key,material]of Object.entries(materials))material.name=`royal-galleon-${key}`;

  function build(variant:number){
    const group=new THREE.Group();group.name=`royal-galleon-${variant}`;const navy=variant===2?0x233f7e:C.blue;
    const batches=new Map<Finish,THREE.BufferGeometry[]>(),cube=new THREE.BoxGeometry(1,1,1),cord=new THREE.CylinderGeometry(1,1,1,5,1,true);
    const matrix=new THREE.Matrix4(),normal=new THREE.Vector3(0,1,0),quaternion=new THREE.Quaternion(),euler=new THREE.Euler();
    function add(geometry:THREE.BufferGeometry,finish:Finish,color:number){
      const nonIndexed=geometry.index?geometry.toNonIndexed():geometry;if(nonIndexed!==geometry)geometry.dispose();
      const tint=new THREE.Color(color),values=new Float32Array(nonIndexed.getAttribute('position').count*3);
      for(let i=0;i<values.length;i+=3){values[i]=tint.r;values[i+1]=tint.g;values[i+2]=tint.b;}
      nonIndexed.setAttribute('color',new THREE.BufferAttribute(values,3));
      if(!nonIndexed.getAttribute('uv'))nonIndexed.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(values.length/3*2),2));
      if(!nonIndexed.getAttribute('normal'))nonIndexed.computeVertexNormals();
      const batch=batches.get(finish)??[];batch.push(nonIndexed);batches.set(finish,batch);
    }
    function box(finish:Finish,color:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,rz=0){matrix.compose(new THREE.Vector3(x,y,z),quaternion.setFromEuler(euler.set(rx,ry,rz)),new THREE.Vector3(w,h,d));add(cube.clone().applyMatrix4(matrix),finish,color);}
    function line(finish:Finish,color:number,a:Point,b:Point,radius=.025){
      const direction=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=direction.length();if(length<1e-7)return;
      matrix.compose(new THREE.Vector3((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2),quaternion.setFromUnitVectors(normal,direction.multiplyScalar(1/length)),new THREE.Vector3(radius,length,radius));add(cord.clone().applyMatrix4(matrix),finish,color);
    }
    function surface(finish:Finish,color:number,a:Point,b:Point,c:Point,d:Point,uvScale=1){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,uvScale,0,uvScale,1,0,0,uvScale,1,0,1],2));geometry.computeVertexNormals();add(geometry,finish,color);
    }
    function triangle(finish:Finish,color:number,a:Point,b:Point,c:Point){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));geometry.computeVertexNormals();add(geometry,finish,color);}
    function cylinder(finish:Finish,color:number,x:number,y:number,z:number,top:number,bottom:number,height:number,sides=10){add(new THREE.CylinderGeometry(top,bottom,height,sides,1).translate(x,y,z),finish,color);}
    function finial(x:number,y:number,z:number,size=.16){add(new THREE.SphereGeometry(size,8,5).translate(x,y,z),'gold',C.gold);}
    const breadth=(z:number)=>{
      const knots=[[-18,.12],[-16,1.95],[-13,3.65],[-8,4.7],[-2,5],[5,4.94],[11,4.55],[15,3.9],[18,3.12]];
      for(let i=1;i<knots.length;i++)if(z<=knots[i][0]){const[a,aw]=knots[i-1],[b,bw]=knots[i];return aw+(bw-aw)*(z-a)/(b-a);}return knots.at(-1)![1];
    };
    const sheer=(z:number)=>.67*Math.pow(Math.abs(z)/18,4)+(z>7?(z-7)/11*.28:0);
    const deck=(z:number)=>3.58+sheer(z);
    const levels=[[-3.55,.06],[-2.8,.42],[-1.7,.73],[-.5,.91],[.3,.99],[1.2,1],[2.5,.99],[3.58,.94]];
    const hullPoint=(side:number,z:number,level:number):Point=>[side*breadth(z)*levels[level][1],levels[level][0]+(levels[level][0]>0?sheer(z):0),z];
    // Curved longitudinal strakes: true faceted shell with recessed, framed ports.
    for(const side of[-1,1])for(let station=0;station<36;station++){
      const z=-18+station;
      for(let row=0;row<levels.length-1;row++){
        const window=row===5&&station%3===0&&z>-14&&z<14;
        if(!window){const a=hullPoint(side,z,row),b=hullPoint(side,z+1,row),c=hullPoint(side,z+1,row+1),d=hullPoint(side,z,row+1);surface('timber',row<3?0x634327:row%2?C.wood:0xa87943,...(side<0?[a,b,c,d]:[b,a,d,c]) as[Point,Point,Point,Point]);}
        else{
          const x=side*(breadth(z+.5)-.18),y=1.85+sheer(z+.5);
          box('dark',0x252b28,x,y,z+.5,.08,1.03,.8);
          for(const dz of[-.5,.5])box('gold',C.gold,x+side*.15,y,z+.5+dz,.16,1.27,.095);
          for(const yy of[y-.64,y+.64])box('gold',C.gold,x+side*.15,yy,z+.5,.17,.085,1.04);
          box('timber',C.dark,x+side*.13,y+.71,z+.5,.16,.16,1.13);
        }
      }
      for(const yy of[.36,2.53,3.64])line('gold',yy===.36?0xb78a3c:C.gold,[side*breadth(z)*(yy>3?.94:1),yy+sheer(z),z],[side*breadth(z+1)*(yy>3?.94:1),yy+sheer(z+1),z+1],yy>3?.105:.065);
      // Planked weather deck follows the same sheer as the shell.
      if(side===1)for(let board=0;board<14;board++){const a=-1+board/7,b=-1+(board+1)/7,wa=breadth(z)*.936,wb=breadth(z+1)*.936;surface('timber',board%3?0xc69b60:0xd5ad73,[a*wa,deck(z)+.025,z],[a*wb,deck(z+1)+.025,z+1],[b*wb,deck(z+1)+.025,z+1],[b*wa,deck(z)+.025,z]);}
    }
    // Broad, layered transom; no pointed symmetric bow at the stern.
    for(let row=0;row<levels.length-1;row++){const a=hullPoint(-1,18,row),b=hullPoint(1,18,row),c=hullPoint(1,18,row+1),d=hullPoint(-1,18,row+1);surface('timber',row%2?C.dark:C.wood,a,b,c,d);}
    line('dark',C.dark,[0,-3.52,-15.2],[0,-3.52,16.8],.13);line('gold',C.gold,[0,.3,-18],[0,5,-18.2],.14);

    function railing(a:Point,b:Point,height=.95,ornate=false){
      const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/(ornate?.52:1.1)));
      line('gold',C.gold,[a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],.065);
      line('timber',C.dark,[a[0],a[1]+.28,a[2]],[b[0],b[1]+.28,b[2]],.045);
      for(let i=0;i<=count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;box(ornate?'gold':'timber',ornate?C.gold:C.light,x,y+height/2,z,.075,height,.075);if(ornate&&i%2===0)finial(x,y+height+.04,z,.08);}
    }
    for(const side of[-1,1])for(let z=-16;z<8;z+=2)railing([side*breadth(z)*.94,deck(z),z],[side*breadth(z+2)*.94,deck(z+2),z+2],.9);

    function sternCabin(base:number,height:number,minZ:number,maxZ:number,halfWidth:number){
      box('timber',C.dark,0,base-.14,(minZ+maxZ)/2,halfWidth*2+.5,.28,maxZ-minZ+.35);
      for(const side of[-1,1]){
        box('timber',C.wood,side*halfWidth,base+height/2,(minZ+maxZ)/2,.2,height,maxZ-minZ);
        for(let z=minZ+.55;z<maxZ-.4;z+=1.15){
          box('dark',C.dark,side*(halfWidth+.11),base+height*.56,z,.07,height*.68,.83);
          box('glass',C.glass,side*(halfWidth+.16),base+height*.56,z,.045,height*.5,.65);
          for(const dz of[-.43,.43])box('gold',C.gold,side*(halfWidth+.22),base+height*.56,z+dz,.095,height*.76,.075);
          for(const yy of[base+height*.2,base+height*.56,base+height*.92])box('gold',C.gold,side*(halfWidth+.22),yy,z,.11,.065,.91);
          box('gold',C.gold,side*(halfWidth+.22),base+height*.56,z,.11,height*.7,.045);
        }
        box('blue',navy,side*(halfWidth+.15),base+.12,(minZ+maxZ)/2,.075,.2,maxZ-minZ);
      }
      box('timber',C.wood,0,base+height/2,maxZ,halfWidth*2,height,.2);
      box('timber',C.dark,0,base+height/2,minZ,halfWidth*2,height,.2);
      for(let x=-halfWidth+.55;x<halfWidth-.3;x+=1.05){
        box('dark',C.dark,x,base+height*.56,maxZ+.13,.83,height*.7,.08);box('glass',C.glass,x,base+height*.56,maxZ+.18,.64,height*.52,.035);
        for(const dx of[-.43,.43])box('gold',C.gold,x+dx,base+height*.56,maxZ+.21,.075,height*.8,.1);
        for(const yy of[base+height*.2,base+height*.56,base+height*.92])box('gold',C.gold,x,yy,maxZ+.23,.94,.065,.11);
        box('gold',C.gold,x,base+height*.56,maxZ+.23,.045,height*.72,.11);
      }
      const roof=base+height+.12;box('timber',C.light,0,roof-.1,(minZ+maxZ)/2,halfWidth*2+.45,.2,maxZ-minZ+.45);
      for(const side of[-1,1])railing([side*(halfWidth+.13),roof,minZ],[side*(halfWidth+.13),roof,maxZ+.1],.88,true);
      railing([-halfWidth-.13,roof,maxZ+.1],[halfWidth+.13,roof,maxZ+.1],.88,true);
      for(const x of[-halfWidth-.25,halfWidth+.25]){line('gold',C.gold,[x,base-.2,maxZ],[x,roof+.95,maxZ],.12);finial(x,roof+1,maxZ,.18);}
      return roof;
    }
    sternCabin(4.15,2.1,7.6,17.8,4.05);sternCabin(6.55,1.85,11.2,18.3,3.45);
    // Projecting galleries are habitable decks, with balustrades on three sides.
    for(const y of[6.25,8.45]){
      box('timber',C.light,0,y-.15,18.9,y<7?9.1:7.8,.27,1.7);
      const w=y<7?4.5:3.85;railing([-w,y,19.7],[w,y,19.7],1,true);for(const side of[-1,1])railing([side*w,y,18.1],[side*w,y,19.7],1,true);
      for(const x of[-w+.25,0,w-.25])line('gold',C.gold,[x,y-.2,19.4],[x,y-1.2,18.2],.11);
    }
    // A small quarterdeck stair and raised forecastle keep the silhouette layered.
    for(let step=0;step<9;step++)box('timber',step%2?C.light:C.wood,2.85,4.05+step*.25,6.2+step*.25,1.35,.25,.3);
    box('timber',C.wood,0,4.94,-14.65,5.75,.35,4.5);
    for(const side of[-1,1])railing([side*2.76,5.12,-16.7],[side*2.76,5.12,-12.55],.9,true);
    railing([-2.75,5.12,-16.7],[2.75,5.12,-16.7],.9,true);
    line('timber',C.dark,[0,4.8,-13.8],[0,9.2,-23.9],.18);line('gold',C.gold,[0,7.2,-19.2],[0,9.2,-23.9],.07);

    function fleur(sailPoint:(u:number,v:number,offset?:number)=>Point){
      const outline=[new THREE.Vector2(0,-.84),new THREE.Vector2(.18,-.72),new THREE.Vector2(.12,-.37),new THREE.Vector2(.39,-.3),new THREE.Vector2(.39,-.15),new THREE.Vector2(.17,-.15),new THREE.Vector2(.26,.04),new THREE.Vector2(.45,.08),new THREE.Vector2(.49,.34),new THREE.Vector2(.33,.48),new THREE.Vector2(.15,.29),new THREE.Vector2(.1,.02),new THREE.Vector2(.065,.09),new THREE.Vector2(.21,.57),new THREE.Vector2(.16,.82),new THREE.Vector2(0,1.08),new THREE.Vector2(-.16,.82),new THREE.Vector2(-.21,.57),new THREE.Vector2(-.065,.09),new THREE.Vector2(-.1,.02),new THREE.Vector2(-.15,.29),new THREE.Vector2(-.33,.48),new THREE.Vector2(-.49,.34),new THREE.Vector2(-.45,.08),new THREE.Vector2(-.26,.04),new THREE.Vector2(-.17,-.15),new THREE.Vector2(-.39,-.15),new THREE.Vector2(-.39,-.3),new THREE.Vector2(-.12,-.37),new THREE.Vector2(-.18,-.72)];
      const triangles=THREE.ShapeUtils.triangulateShape(outline,[]),positions:number[]=[];
      for(const side of[-1,1])for(const triangle of triangles){
        const[a,b,c]=triangle.map(index=>outline[index]),ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);
        // Subdivide before projecting onto the billowed cloth. A single large
        // flat emblem triangle otherwise cuts behind the curved sail surface.
        for(const face of[[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]]){
          const points=face.map(p=>sailPoint(.5+p.x*.17,.46-p.y*.2,.065*side));
          const normalZ=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);
          if(normalZ*side>0)points.reverse();for(const p of points)positions.push(...p);
        }
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();add(geometry,'gold',0xe8be58);
    }
    function squareSail(mastZ:number,mastTop:number,top:number,width:number,height:number,heraldry:boolean){
      const columns=16,rows=10;
      const point=(u:number,v:number,offset=0):Point=>[(u-.5)*width*(1-v*.12),top-v*height+Math.sin(Math.PI*u)*Math.pow(v,8)*.35,mastZ-.34-Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*Math.min(1.35,width*.095)-offset];
      for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
        const u=column/columns,v=row/rows,blue=heraldry&&column>=6&&column<10&&row<8;
        surface(blue?'blue':'cloth',blue?navy:column%3?0xfff4da:0xf2e4c6,point(u,v),point(u+1/columns,v),point(u+1/columns,v+1/rows),point(u,v+1/rows),.5);
      }
      if(heraldry){fleur(point);for(const u of[.375,.625])for(let row=0;row<8;row++)line('gold',C.gold,point(u,row/rows,.03),point(u,(row+1)/rows,.03),.025);}
      for(const u of[0,1])for(let row=0;row<rows;row++)line('dark',0xa49371,point(u,row/rows),point(u,(row+1)/rows),.028);
      for(const v of[0,1])for(let column=0;column<columns;column++)line('dark',0xa49371,point(column/columns,v),point((column+1)/columns,v),.025);
      // Vertical panel seams follow the billow; they remain fine enough that
      // the large ivory fabric reads as fabric from the panoramic camera.
      for(const u of[.125,.25,.75,.875])for(let row=0;row<rows;row++)line('cloth',0xd9cba8,point(u,row/rows,.012),point(u,(row+1)/rows,.012),.012);
      line('timber',C.dark,[-width*.55,top+.17,mastZ-.27],[width*.55,top+.17,mastZ-.27],.105);
      for(const side of[-1,1])line('dark',C.rope,[side*width*.55,top+.17,mastZ-.27],[0,Math.min(mastTop-.25,top+3.4),mastZ],.035);
      // Sheets visibly terminate at cleats on the correct side of the deck.
      for(const side of[-1,1])line('dark',C.rope,point(side<0?0:1,1),[side*Math.min(4.55,breadth(mastZ+2)*.92),deck(mastZ+2)+.2,mastZ+2],.032);
    }
    function pennant(z:number,top:number){
      const point=(u:number,v:number):Point=>[.15+u*3.25,top-v*1.05+u*.18,z+Math.sin(u*5.2)*.2];
      for(let i=0;i<8;i++){const a=i/8,b=(i+1)/8;surface('blue',navy,point(a,0),point(b,0),point(b,1),point(a,1));}
      line('gold',C.gold,point(0,0),point(1,0),.025);line('gold',C.gold,point(0,1),point(1,1),.025);
      box('gold',C.gold,1.48,top-.43,z+.13,.095,.7,.045);box('gold',C.gold,1.48,top-.4,z+.13,.58,.09,.045);
    }
    const masts=variant===1?[{z:-8,top:34,platform:18},{z:9,top:29,platform:17}]:variant===2?[{z:-10,top:30.8,platform:17},{z:2.4,top:37.6,platform:20},{z:13,top:27.4,platform:16.8}]:[{z:-9,top:32.5,platform:17.8},{z:1.7,top:39,platform:21},{z:12.4,top:28.1,platform:17.2}];
    let sailCount=0;
    for(const[mastIndex,mast]of masts.entries()){
      const base=mast.z>8?8.58:deck(mast.z),height=mast.top-base;
      cylinder('timber',C.wood,0,base+height/2,mast.z,.16,.38,height,12);
      for(let y=base+.5;y<mast.top;y+=4.1)cylinder('gold',C.gold,0,y,mast.z,.27,.27,.09,10);
      const platform=mast.platform;cylinder('timber',C.dark,0,platform,mast.z,1.04,.88,.24,10);
      for(let post=0;post<10;post++){const a=post*Math.PI/5,b=(post+1)*Math.PI/5;line('timber',C.dark,[Math.sin(a),platform,mast.z+Math.cos(a)],[Math.sin(a),platform+.84,mast.z+Math.cos(a)],.045);line('gold',C.gold,[Math.sin(a),platform+.84,mast.z+Math.cos(a)],[Math.sin(b),platform+.84,mast.z+Math.cos(b)],.04);}
      for(const side of[-1,1]){
        const x=side*Math.min(4.55,breadth(mast.z)*.93),floor=deck(mast.z);
        for(const dz of[-2,-.66,.66,2])line('dark',C.rope,[x,floor+.15,mast.z+dz],[side*.6,platform+.4,mast.z],.034);
        for(let rung=1;rung<=18;rung++){const t=rung/19,y=floor+(platform-floor)*t,xx=x+(side*.6-x)*t;line('dark',C.rope,[xx,y,mast.z-2*(1-t)],[xx,y,mast.z+2*(1-t)],.021);}
      }
      finial(0,mast.top+.22,mast.z,.17);line('gold',C.gold,[0,mast.top,mast.z],[0,mast.top+.86,mast.z],.045);pennant(mast.z,mast.top+.68);
      const main=mastIndex===1&&masts.length===3,low=mastIndex===masts.length-1&&masts.length===3;
      const sailSpecs=masts.length===2&&mastIndex===1?[[25,5.4,4.2],[19.1,8.8,5.3],[12.8,11,3.8]]:low?[[24.9,7.3,5.1],[18.3,9,6.5]]:main?[[34.7,5.4,4.2],[28.4,10.2,6.3],[19.8,14.6,8.7]]:[[28.5,5.5,4.2],[22.8,9.3,5.5],[15.3,12.6,7.2]];
      for(const[top,width,h]of sailSpecs){squareSail(mast.z,mast.top,top,width,h,main||top<23);sailCount++;}
      line('dark',C.rope,[0,mast.top-.5,mast.z],[0,base+.2,mast.z+4],.045);
    }
    for(let i=1;i<masts.length;i++)line('dark',C.rope,[0,masts[i].top-.5,masts[i].z],[0,masts[i-1].top-3,masts[i-1].z],.042);
    line('dark',C.rope,[0,masts[0].top-.2,masts[0].z],[0,9.2,-23.9],.043);
    line('dark',C.rope,[0,9.2,-23.9],[0,-.2,-17.8],.06);
    // Two curved triangular staysails connect the foremast to its bowsprit.
    // They are separate from the eight square sails and fill the bow silhouette.
    for(const[tipY,tipZ,footY,footZ]of[[27.8,-9,10.3,-22.8],[20.2,-10.4,9.8,-20.8]]){
      const tip:Point=[0,tipY,tipZ],outer:Point=[0,footY,footZ],heel:Point=[0,10.8,tipZ-.25];
      const count=12;
      const sample=(u:number,v:number):Point=>[Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*.75,tip[1]+(outer[1]-tip[1])*u+(heel[1]-tip[1])*v,tip[2]+(outer[2]-tip[2])*u+(heel[2]-tip[2])*v];
      for(let row=0;row<count;row++)for(let col=0;col<count-row;col++){
        const u=col/count,v=row/count,a=sample(u,v),b=sample(u+1/count,v),c=sample(u,v+1/count);
        triangle('cloth',C.cream,a,b,c);
        if(col+row<count-1){const d=sample(u+1/count,v+1/count);triangle('cloth',0xf5e8cd,b,d,c);}
      }
      line('dark',0xb3a380,tip,outer,.025);line('dark',0xb3a380,outer,heel,.025);line('dark',0xb3a380,heel,tip,.025);
    }

    // Capstan, companionway, helm, coiled ropes and hold cargo read at deck level.
    cylinder('timber',C.dark,0,4.25,-4.2,.58,.7,1.2,10);cylinder('gold',C.gold,0,4.91,-4.2,.72,.72,.12,10);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;line('timber',C.light,[0,4.84,-4.2],[Math.cos(a)*1.65,4.84,-4.2+Math.sin(a)*1.65],.055);}
    box('timber',C.dark,-1.75,4.15,3.8,2.3,1.05,2.4);for(let i=0;i<8;i++)box('timber',C.light,-2.75+i*.285,4.72,3.8,.22,.09,2.25);
    const helmY=7.45;for(let spoke=0;spoke<10;spoke++){const a=spoke*Math.PI/5;line('timber',C.light,[0,helmY,10],[Math.sin(a)*.72,helmY+Math.cos(a)*.72,10],.047);const b=(spoke+1)*Math.PI/5;line('gold',C.gold,[Math.sin(a)*.57,helmY+Math.cos(a)*.57,10],[Math.sin(b)*.57,helmY+Math.cos(b)*.57,10],.05);}box('timber',C.dark,0,6.95,10.16,.2,1.2,.22);
    for(const[x,z]of[[-3,-6],[-3.7,-4.8],[2.9,2.3],[3.55,3.7]]as const){const y=deck(z)+.62;cylinder('timber',C.wood,x,y,z,.48,.43,1.18,10);for(const dy of[-.4,.4])cylinder('iron',C.iron,x,y+dy,z,.5,.5,.07,10);cylinder('timber',C.light,x,y+.61,z,.44,.44,.055,10);}
    for(const[x,z]of[[-2.75,-.4],[2.75,-2.1]]as const){box('timber',C.light,x,deck(z)+.55,z,1.2,1.05,1.15);for(const dx of[-.55,.55])for(const yy of[deck(z)+.1,deck(z)+1])box('timber',C.dark,x+dx,yy,z,.08,.095,1.2);}
    for(const side of[-1,1]){
      const z=-13.2,x=side*(breadth(z)+.3),y=deck(z)+.6;line('iron',C.iron,[x,y+1,z],[x,y-1.8,z],.08);line('iron',C.iron,[x-.68,y-1.4,z],[x,y-1.8,z],.075);line('iron',C.iron,[x+.68,y-1.4,z],[x,y-1.8,z],.075);line('iron',C.iron,[x-.45,y+.55,z],[x+.45,y+.55,z],.07);
      for(let loop=0;loop<2;loop++)for(let arc=0;arc<12;arc++){const a=arc*Math.PI/6,b=(arc+1)*Math.PI/6,r=.38+loop*.09;line('dark',0xb09b70,[side*2.2+Math.sin(a)*r,deck(-11)+.08,-11+Math.cos(a)*r],[side*2.2+Math.sin(b)*r,deck(-11)+.08,-11+Math.cos(b)*r],.035);}
    }

    // Decorated stern escutcheon, lanterns and broad carved quarter galleries.
    const crestZ=19.55;
    box('blue',navy,0,7.08,crestZ,1.38,1.52,.12);
    for(const x of[-.77,.77])box('gold',C.gold,x,7.08,crestZ+.08,.12,1.76,.17);
    for(const y of[6.23,7.93])box('gold',C.gold,0,y,crestZ+.08,1.66,.12,.17);
    box('gold',C.gold,0,7.1,crestZ+.16,.12,1.04,.08);box('gold',C.gold,0,6.92,crestZ+.16,.72,.12,.08);
    for(const side of[-1,1]){
      line('gold',C.gold,[side*3.6,8.5,18.7],[side*3.8,10.05,18.7],.065);
      box('iron',C.iron,side*3.8,10.15,18.7,.48,.62,.48);box('glass',0xf5da8f,side*3.8,10.16,18.7,.38,.48,.38);
      cylinder('gold',C.gold,side*3.8,10.54,18.7,.1,.39,.28,8);
    }

    for(const[finish,parts]of batches){const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());if(!geometry)throw new Error(`Could not merge royal ship ${finish}`);geometry.computeBoundingSphere();geometries.add(geometry);const mesh=new THREE.Mesh(geometry,materials[finish]);mesh.name=`royal-galleon-${finish}`;mesh.castShadow=true;mesh.receiveShadow=finish!=='cloth'&&finish!=='blue';group.add(mesh);}
    cube.dispose();cord.dispose();group.userData.royalShip={variant,masts:masts.length,sails:sailCount,staysails:2,bow:'negative-z',waterline:0,sailFinish:'daylight-ivory',quarterdeck:'carved-lantern-gallery'};return group;
  }
  return{create(options={}){
    if(disposed)throw new Error('Royal ship library disposed');const scale=options.scale??1;if(!Number.isFinite(scale)||scale<=0||scale>10)throw new RangeError('Invalid royal ship scale');
    const variant=Number.isFinite(options.variant)?Math.abs(Math.trunc(options.variant!))%3:0;let template=cache.get(variant);if(!template){template=build(variant);cache.set(variant,template);}const group=template.clone(true);group.scale.setScalar(scale);instances.add(group);return group;
  },dispose(){if(disposed)return;disposed=true;instances.forEach(group=>group.removeFromParent());instances.clear();cache.clear();geometries.forEach(geometry=>geometry.dispose());geometries.clear();Object.values(materials).forEach(material=>material.dispose());timberTexture.dispose();linenTexture.dispose();}};
}

/** Standalone convenience. Prefer one createRoyalShipLibrary per complete viewer. */
export function createRoyalGalleon(options:RoyalGalleonOptions={}){const library=createRoyalShipLibrary();try{const group=library.create(options);standaloneOwners.set(group,library);return group;}catch(error){library.dispose();throw error;}}
export function disposeRoyalGalleon(group:THREE.Group){const library=standaloneOwners.get(group);if(library){standaloneOwners.delete(group);library.dispose();}else group.removeFromParent();}
