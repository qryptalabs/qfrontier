import * as THREE from 'three';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Linear-light rendering with short-range cavity shadows, shared by live view
 * and exported images. AO resolution is bounded independently from output pixels. */
export function createCinematicPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.OrthographicCamera){
 const color=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true,samples:2});
 const ao=new SSAOPass(scene,camera,1,1,16),output=new OutputPass();
 ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA=0;
 ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA=0;
 ao.kernelRadius=.88;ao.minDistance=.0004;ao.maxDistance=.024;
 let aoWidth=0,aoHeight=0;
 return {
  render(width:number,height:number,target:THREE.WebGLRenderTarget|null=null,cavityShadows=true){
   color.setSize(width,height);
   const ratio=Math.min(.72,1440/Math.max(width,height)),w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
   if(w!==aoWidth||h!==aoHeight){aoWidth=w;aoHeight=h;ao.setSize(w,h);}
   ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
   ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
   renderer.setRenderTarget(color);renderer.clear();renderer.render(scene,camera);
   if(cavityShadows){
    // Translucent sky effects must not become solid foreground occluders.
    const hidden:THREE.Object3D[]=[];
    scene.traverse(object=>{if(object instanceof THREE.Mesh&&object.visible){const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.every(mat=>mat.transparent)){hidden.push(object);object.visible=false;}}});
    try{ao.render(renderer,color,color,0,false);}finally{hidden.forEach(object=>{object.visible=true;});}
   }
   output.renderToScreen=target===null;output.render(renderer,target??color,color,0,false);
  },
  dispose(){
   color.dispose();ao.dispose();
   // These two allocations are not released by r186's SSAOPass.dispose().
   ao.ssaoMaterial.dispose();ao.noiseTexture?.dispose();output.dispose();
  },
 };
}
