'use client';
import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {createLevelNotificationStore} from '../lib/client/level-notifications';
import type {ActivityProgressionView} from '../lib/mvp/activity-progression';

export function useLevelNotifications(activity:ActivityProgressionView|null|undefined,revision:number,paused=false){
  const profileId=paused?null:activity?.playerId,level=activity?.progression.level;
  const store=useMemo(()=>createLevelNotificationStore(profileId),[profileId]);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getServerSnapshot);
  useEffect(()=>{if(level&&!paused)store.observe(level,revision);},[level,revision,paused,store]);
  useEffect(()=>{if(!store.storageKey)return;const reload=(e:StorageEvent)=>{if(e.key===null||e.key===store.storageKey)store.reload();};window.addEventListener('storage',reload);return()=>window.removeEventListener('storage',reload);},[store]);
  return{store,snapshot};
}
