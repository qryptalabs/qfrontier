import * as THREE from 'three';
import type {RoyalKingdomSnapshot} from '../mvp/royal-kingdom.ts';
import type {LivingActorLibrary} from './living-actors.ts';
export function royalPlayerActor(people:LivingActorLibrary,profile:NonNullable<RoyalKingdomSnapshot['appearance']>){
 const role=profile.profession==='farmer'?'farmer':profile.profession==='carpenter'?'builder':'worker',actor=people.getForBiome(role,profile.appearance==='frost'?'ice':profile.appearance==='amber'?'desert':'forest',17),owned:THREE.BufferGeometry[]=[];
 const skins=[0xc99a73,0x94674d,0xd9b18a,0xb17c59].map(v=>new THREE.Color(v)),hair=new THREE.Color(0x574331),skinTarget=new THREE.Color(profile.skin==='light'?0xd9b18a:profile.skin==='deep'?0x94674d:0xc99a73),hairTarget=new THREE.Color(profile.hair==='black'?0x282c2b:profile.hair==='silver'?0xc9cbc1:0x574331),value=new THREE.Color();
 actor.group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!o.geometry.attributes.color)return;const g=o.geometry.clone(),colors=g.attributes.color;for(let i=0;i<colors.count;i++){value.fromBufferAttribute(colors,i);if(skins.some(c=>Math.abs(c.r-value.r)+Math.abs(c.g-value.g)+Math.abs(c.b-value.b)<1e-5))colors.setXYZ(i,skinTarget.r,skinTarget.g,skinTarget.b);else if(Math.abs(hair.r-value.r)+Math.abs(hair.g-value.g)+Math.abs(hair.b-value.b)<1e-5)colors.setXYZ(i,hairTarget.r,hairTarget.g,hairTarget.b);}colors.needsUpdate=true;o.geometry=g;owned.push(g);});
 const cargo=new THREE.Group();cargo.name='royal-cargo';cargo.visible=false;const plankGeometry=new THREE.BoxGeometry(.22,.12,1),plankMaterial=new THREE.MeshStandardMaterial({color:0x99683d,roughness:.85});owned.push(plankGeometry);for(const side of[-1,1]){const plank=new THREE.Mesh(plankGeometry,plankMaterial);plank.position.set(side*.14,1.08,-.44);plank.rotation.x=Math.PI/2;cargo.add(plank);}actor.group.add(cargo);
 actor.group.scale.setScalar(.9);return{actor,dispose(){actor.dispose();owned.forEach(g=>g.dispose());plankMaterial.dispose();}};
}
