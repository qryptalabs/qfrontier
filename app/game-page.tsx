import MvpClient from './mvp-client';
import { requireChatGPTUser } from './chatgpt-auth';
import GameAvailability from './game-availability';
import { getMvpStore } from '../lib/mvp/store';
import { readMvpView } from '../lib/mvp/engine';
import { isMvpStorageUnavailableError } from '../lib/mvp/storage-availability';
import { normalizeGameNavigation, parseGameNavigation } from '../lib/client/navigation';

export type GameSearchParams=Record<string,string|string[]|undefined>;

/** Root and canonical routes share authentication, storage recovery and own-profile checks. */
export async function renderGamePage(pathname:string,searchParams?:Promise<GameSearchParams>) {
  const values=await searchParams,search=new URLSearchParams();
  for(const [key,value] of Object.entries(values??{})){
    if(typeof value==='string')search.set(key,value);
    else if(Array.isArray(value)&&typeof value[0]==='string')search.set(key,value[0]);
  }
  const searchString=search.size?`?${search}`:'',requested=parseGameNavigation({pathname,search:searchString});
  // Access redirects must not be caught as storage failures; preserve invitation links too.
  const user=await requireChatGPTUser(`${pathname}${searchString}`);
  try{
    const store=getMvpStore();
    let view=await readMvpView(store,user.userId);
    let navigation=normalizeGameNavigation(requested,{profiles:view.players,selectedProfileId:view.player?.id,isAdmin:!!view.admin});
    // Check the session's own list before passing any requested profile to storage.
    if(navigation.profileId&&navigation.profileId!==view.player?.id){
      view=await readMvpView(store,user.userId,navigation.profileId,view.now);
      navigation=normalizeGameNavigation(navigation,{profiles:view.players,selectedProfileId:view.player?.id,isAdmin:!!view.admin});
    }
    return <MvpClient initialView={view} initialNavigation={navigation}/>;
  }catch(error){
    if(!isMvpStorageUnavailableError(error))throw error;
    return <GameAvailability initialNavigation={requested}/>;
  }
}
