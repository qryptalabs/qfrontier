"use client";

import {useEffect,useState,type RefObject} from 'react';
import {observeViewerVisibility,effectiveGraphicsQuality,graphicsDeviceHints,type ViewerVisibility} from '../../lib/graphics/viewer-lifecycle.ts';
import type {RenderQuality} from '../../lib/graphics/scene-data.ts';

export function useViewerVisibility(element:RefObject<HTMLElement|null>){
  const[state,setState]=useState<ViewerVisibility>({entered:false,visible:false});
  useEffect(()=>element.current?observeViewerVisibility(element.current,setState):undefined,[element]);
  return state;
}
export function useEffectiveGraphicsQuality(requested:RenderQuality){
  const[mobileQuality,setMobileQuality]=useState<RenderQuality>(requested);
  useEffect(()=>{const update=()=>setMobileQuality(effectiveGraphicsQuality(requested,graphicsDeviceHints()));update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[requested]);
  return requested==='auto'?mobileQuality:requested;
}
