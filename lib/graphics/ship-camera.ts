import * as THREE from 'three';

/** Camera occlusion uses the visible imported geometry, including cloth and
 * rigging. Logical floor colliders alone cannot represent a generated sail. */
export function clipTripoShipCamera(model:THREE.Object3D,from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}){
 const origin=new THREE.Vector3(from.x,from.y,from.z),direction=new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z),distance=direction.length();
 if(distance<.001)return{...to};direction.multiplyScalar(1/distance);model.updateWorldMatrix(true,true);
 const meshes:THREE.Mesh[]=[];model.traverseVisible(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 const ray=new THREE.Raycaster(origin,direction,.05,distance+.3),hit=ray.intersectObjects(meshes,false)[0];
 if(!hit)return{...to};const at=origin.addScaledVector(direction,Math.max(.06,Math.min(distance,hit.distance-.3)));return{x:at.x,y:at.y,z:at.z};
}
