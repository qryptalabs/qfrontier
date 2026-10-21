import type {LivingActor} from './living-actors.ts';

/** Empty hands rest at the sides. Greet once on approach, never loop a carrying pose. */
export function createShopMerchantMotion(actor:LivingActor){
 const at=(name:string)=>actor.group.getObjectByName(name)!,torso=at('actor-torso'),head=at('actor-head'),left=at('actor-left-shoulder'),right=at('actor-right-shoulder'),leftElbow=at('actor-left-elbow'),rightElbow=at('actor-right-elbow');
 let armed=true,greetedAt=-Infinity,previousTime=-Infinity;
 return{update(time:number,distance:number,reduced=false){
  const t=Number.isFinite(time)?time:0;if(t<previousTime)greetedAt=-Infinity;previousTime=t;
  if(distance>6)armed=true;
  if(distance<4&&armed){armed=false;greetedAt=reduced?-Infinity:t;}
  const age=t-greetedAt,greeting=!reduced&&distance<6&&age>=0&&age<2.4?Math.sin(Math.PI*age/2.4)**2:0;
  actor.animate(t,false,false);
  const breath=reduced?0:Math.sin(t*1.7+1.2),shift=reduced?0:Math.sin(t*.46+.7);
  torso.position.y=breath*.006;torso.rotation.set(0,0,shift*.012);
  head.rotation.set(greeting*.035,reduced?0:Math.sin(t*.63)*.045,0);
  left.rotation.set(-.045+breath*.012,0,.045);leftElbow.rotation.set(-.13,0,0);
  right.rotation.set(-.04-.68*greeting,0,-.045-.15*greeting);rightElbow.rotation.set(-.14-.58*greeting,0,0);
  return greeting;
 }};
}
