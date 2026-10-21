import * as THREE from 'three';
import { FISHING_COMMUNITIES,getFishingCommunityData,resolveFishingCommunity } from './fishing-network-data.ts';
import { createFishingCommunityRenderer,fishingStateForSnapshot,type FishingCommunityController,type FishingCommunityOptions,type FishingRenderSite } from './fishing-community.ts';

/** Geometry is local to a port; world-time cargo and positions exist without it. */
export function createFishingNetworkRenderer(options:FishingCommunityOptions):FishingCommunityController{
  const group=new THREE.Group();group.name='fishing-network';
  const loaded=new Map<string,FishingCommunityController>(),data=new Map(FISHING_COMMUNITIES.map(community=>[community.id,getFishingCommunityData(community.id)]));
  let origin={x:0,y:0},focus={x:0,y:0},level=7,quality=options.quality,seconds=0,followedId:string|null=null,disposed=false;
  const nearest=()=>FISHING_COMMUNITIES.reduce((best,community)=>Math.hypot(focus.x-community.dock.x,focus.y-community.dock.y)<Math.hypot(focus.x-best.dock.x,focus.y-best.dock.y)?community:best,FISHING_COMMUNITIES[0]);
  const active=()=>followedId?resolveFishingCommunity(followedId)??nearest():nearest();
  function ensure(id:string){let renderer=loaded.get(id);if(renderer)return renderer;const value=data.get(id)!;const site:FishingRenderSite={...value.community,toWorld:value.toWorld,toTemplate:value.toTemplate,snapshot:value.snapshot,surfaceHeight:value.surfaceHeight};renderer=createFishingCommunityRenderer({...options,quality,site});loaded.set(id,renderer);group.add(renderer.group);return renderer;}
  const controller:FishingCommunityController={group,
    setView(nextOrigin,nextFocus,nextLevel,nextQuality=quality){origin={...nextOrigin};focus={...nextFocus};level=nextLevel;quality=nextQuality;for(const renderer of loaded.values())renderer.setView(origin,focus,level,quality);},
    animate(time,reducedMotion){if(disposed)return;seconds=time;const followed=followedId?resolveFishingCommunity(followedId)?.id:null;
      for(const community of FISHING_COMMUNITIES){const near=level>=5.6&&Math.hypot(focus.x-community.dock.x,focus.y-community.dock.y)<900,wanted=near||followed===community.id;
        if(wanted){const renderer=ensure(community.id);renderer.setView(origin,focus,level,quality);renderer.follow(followed===community.id?followedId:null);renderer.animate(seconds,reducedMotion);}
        else{const renderer=loaded.get(community.id);if(renderer){renderer.dispose();loaded.delete(community.id);}}
      }
      group.visible=loaded.size>0;
    },
    follow(id){followedId=id&&resolveFishingCommunity(id)?id:null;for(const[communityId,renderer]of loaded)renderer.follow(resolveFishingCommunity(followedId??'')?.id===communityId?followedId:null);},
    position(id){const community=resolveFishingCommunity(id);if(!community)return null;const renderer=loaded.get(community.id);if(renderer){const position=renderer.position(id);if(position)return position;}const snapshot=data.get(community.id)!.snapshot(seconds),entity=[...snapshot.boats,...snapshot.carts,...snapshot.workers].find(value=>value.id===id);return entity?{x:entity.x,y:entity.y}:null;},
    getState(){const community=active(),available=!!followedId||Math.hypot(focus.x-community.dock.x,focus.y-community.dock.y)<900;if(!available)return{available:false,communityId:community.id,communityName:community.name,activities:[],followedId};const renderer=loaded.get(community.id);return renderer?{...renderer.getState(),followedId}:fishingStateForSnapshot(data.get(community.id)!.snapshot(seconds),community,followedId);},
    pickables(){return[...loaded.values()].flatMap(renderer=>renderer.pickables());},
    dispose(){if(disposed)return;disposed=true;loaded.forEach(renderer=>renderer.dispose());loaded.clear();group.clear();group.removeFromParent();},
  };
  return controller;
}
