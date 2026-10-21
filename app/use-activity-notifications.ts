'use client';
import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {createActivityNotificationStore} from '../lib/client/activity-notifications';
import type {ActivityProgressionView} from '../lib/mvp/activity-progression';

/** Only presentation acknowledgements live in this browser. XP comes from the server view. */
export function useActivityNotifications(activity:ActivityProgressionView|null|undefined,revision:number,paused=false){
  const profileId=paused?null:activity?.playerId;
  const store=useMemo(()=>createActivityNotificationStore(profileId),[profileId]);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  useEffect(()=>{if(activity&&!paused)store.update(activity.completions,revision);},[activity,revision,paused,store]);
  useEffect(()=>{
    if(!store.storageKey)return;
    const reload=(event:StorageEvent)=>{if(event.key===store.storageKey||event.key===null)store.reload();};
    window.addEventListener('storage',reload);return()=>window.removeEventListener('storage',reload);
  },[store]);
  return{store,snapshot};
}
