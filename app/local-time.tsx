'use client';
import {useSyncExternalStore} from 'react';
const subscribe=()=>()=>{};

/** Stable SSR reference, then the device's zone after hydration. No game clock changes. */
export function useGameTimestamp() {
  const zone=useSyncExternalStore(subscribe,()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Costa_Rica',()=>'America/Costa_Rica');
  return (value: number) => {
    const format = (timeZone: string) => new Intl.DateTimeFormat('es-CR', {timeZone, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(value);
    const local = format(zone);
    return zone === 'America/Costa_Rica' ? `${local} · CR` : `${local} · ${zone} (${format('America/Costa_Rica')} CR)`;
  };
}
