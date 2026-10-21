import * as THREE from 'three';

/** Shared, deterministic masonry grain. No network images or canvas allocations. */
export function createUrbanMasonryMaterial(){
  const size=64,bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const seed=(Math.imul(x+17,374761393)^Math.imul(y+29,668265263))>>>0;
    const grain=151+(seed%49)-24,edge=Math.min(x,y,size-1-x,size-1-y),v=edge<2?72:grain;
    bytes.set([v,v,v,255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(bytes,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.91,bumpMap:texture,bumpScale:.035});
  material.name='urban-cut-stone';let disposed=false;
  return{material,dispose(){if(disposed)return;disposed=true;material.dispose();texture.dispose();}};
}

/** Fit a new architecture kit into an existing physical footprint, including yaw.
 * This is purely a renderer adapter: authoritative buildings/roads never move. */
export function architectureFootprintScale(model:THREE.Object3D,width:number,depth:number,yaw=0):number{
  model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);
  const rotor=model.getObjectByName('windmill-rotor');
  if(rotor){
    const saved=rotor.rotation.z;
    try{for(let i=0;i<64;i++){rotor.rotation.z=i*Math.PI/32;model.updateMatrixWorld(true);box.expandByObject(model);}}
    finally{rotor.rotation.z=saved;model.updateMatrixWorld(true);}
    // Covers extrema between the sampled angles, without changing the animation.
    box.expandByScalar(.015);
  }
  if(box.isEmpty())return 1;
  // Bounds are relative to the building origin, not their own centre: balconies
  // and shop windows can extend farther on one side of an otherwise narrow kit.
  const c=Math.cos(yaw),s=Math.sin(yaw);let halfX=0,halfZ=0;
  for(const x of[box.min.x,box.max.x])for(const z of[box.min.z,box.max.z]){halfX=Math.max(halfX,Math.abs(x*c+z*s));halfZ=Math.max(halfZ,Math.abs(-x*s+z*c));}
  if(!Number.isFinite(halfX+halfZ)||halfX<=0||halfZ<=0||width<=0||depth<=0)return 1;
  return Math.min(1,width/(halfX*2),depth/(halfZ*2));
}

/** Street setts and low kerbs remain within the existing road, below foot height. */
export function urbanPavingLayout(width:number,length:number,index:number){
  if(!Number.isFinite(width+length)||width<=0||length<=0)return[];
  const columns=Math.max(2,Math.min(7,Math.round(width/.64))),rows=Math.max(1,Math.min(3,Math.ceil(length/.55))),pieces:{x:number;z:number;width:number;depth:number;tone:number}[]=[];
  const kerb=Math.min(.19,width*.08),usable=width-kerb*2;
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const cell=usable/columns,x=-usable/2+cell*(col+.5),z=-length/2+length/rows*(row+.5);
    pieces.push({x,z,width:cell-.035,depth:length/rows-.035,tone:(index*7+col*3+row*11)%5});
  }
  for(const side of[-1,1])pieces.push({x:side*(width/2-kerb/2),z:0,width:kerb-.025,depth:length-.025,tone:5});
  return pieces;
}
