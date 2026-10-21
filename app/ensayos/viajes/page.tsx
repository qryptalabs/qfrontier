import {createMvpWorld,createPlayer} from '../../../lib/mvp/world';
import {buildMvpView} from '../../../lib/mvp/engine';
import TravelPhysicsLab from './travel-physics-lab';

/** Synthetic renderer QA only. This route never imports or opens a game store. */
export default function TravelPhysicsLabPage(){
  const now=Date.parse('2026-10-18T00:00:00Z'),world=createMvpWorld('visual-lab',now);
  const player=createPlayer(world,{ownerId:'visual-lab',requestId:'visual-lab',now,actor:null},{type:'player.create',name:'Explorador de ensayo',stationName:'Ensayo sin guardar',faction:'cartographers'});
  player.habitable={version:1,appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[]};
  return <TravelPhysicsLab initial={buildMvpView(world,0,'visual-lab',now,player.id)} initialWorld={world}/>;
}
