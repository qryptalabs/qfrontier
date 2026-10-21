import {readOfflineGlb} from '../tests/helpers/glb-offline.ts';
import * as T from 'three';
for(const kind of ['galleon','fishing']){
 const{gltf}=await readOfflineGlb(`work/tripo-ships-20261019/${kind}-export.glb`);
 const root=new T.Group();root.add(gltf.scene);if(kind==='galleon'){gltf.scene.scale.setScalar(30);gltf.scene.rotation.y=Math.PI;gltf.scene.position.y=-2.8;}else{gltf.scene.scale.setScalar(9);gltf.scene.rotation.y=Math.PI/2;gltf.scene.position.y=-.6;}
 root.updateMatrixWorld(true);const ray=new T.Raycaster();const samples=[];
 for(const z of kind==='galleon'?[-10,-6,0,4,8,11]:[-3,0,3])for(const x of kind==='galleon'?[-2,0,2]:[-.8,.8]){
  ray.set(new T.Vector3(x,kind==='galleon'?4:2.2,z),new T.Vector3(0,-1,0));samples.push({x,z,hits:ray.intersectObject(root,true).slice(0,4).map(h=>({y:+h.point.y.toFixed(3),part:h.object.name}))});
 }console.log(JSON.stringify({kind,samples}));
}
