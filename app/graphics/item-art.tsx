'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ItemAtlas } from '../../lib/graphics/item-atlas';
import {Axe,Backpack,Box,Building2,Cog,Compass,Diamond,Droplets,FlaskConical,Flame,Flower2,Gem,Hammer,Leaf,Pickaxe,ScrollText,Shield,Shirt,Sprout,Swords,TreePine,Truck,Utensils,Wheat,Zap,type LucideIcon} from 'lucide-react';

type Props = { id: string; size?: number; className?: string };
let atlasWarningReported = false;

const fallbackIcons:Record<string,LucideIcon>={timber:TreePine,plank:Box,stone:Pickaxe,water:Droplets,ration:Utensils,grain:Wheat,biomass:Leaf,fiber:Flower2,cloth:Shirt,seed:Sprout,nutrient:FlaskConical,iron_ore:Pickaxe,copper_ore:Pickaxe,silica:Diamond,crystal_shard:Gem,data_fragment:ScrollText,energy:Zap,fuel:Flame,tool:Hammer,axe:Axe,equipment:Backpack,herbs:Leaf,iron_ingot:Box,copper_wire:Zap,alloy:Diamond,glass:Gem,bread:Utensils,preserved_food:Utensils,medkit:FlaskConical,repair_kit:Hammer,drill_module_i:Cog,drill_module_ii:Cog,pickaxe:Pickaxe,scanner:Compass,cart:Truck,weather_cloak:Shirt,camp_kit:Backpack,guard_armor:Shield,spear:Swords,arrow_bundle:Swords,bridge_kit:Building2,memory_core:Zap,ancient_map:ScrollText,artifact_frame:Gem,season_relic:Gem};


export default function ItemArt({ id, size = 36, className = '' }: Props) {
  const target = useRef<HTMLSpanElement>(null);
  const [atlas, setAtlas] = useState<ItemAtlas | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let started = false;
    let observer: IntersectionObserver | undefined;
    const start = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      void import('../../lib/graphics/item-atlas')
        .then(module => module.getItemAtlas())
        .then(value => { if (active) setAtlas(value); })
        // Inventory text remains available when WebGL is disabled or lost.
        .catch(error => {
          if (!atlasWarningReported) {
            atlasWarningReported = true;
            console.warn('[QFrontier] No se pudo preparar el atlas de modelos 3D.', error);
          }
          if (active) setFailed(true);
        });
    };
    if (typeof IntersectionObserver === 'undefined') start();
    else if (target.current) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) start();
      }, { rootMargin: '160px' });
      observer.observe(target.current);
    }
    return () => { active = false; observer?.disconnect(); };
  }, []);

  const index = atlas?.index[id] ?? -1;
  const ready = !!atlas && index >= 0;
  const Fallback=fallbackIcons[id]??(id.startsWith('building:')?Building2:id.startsWith('unit:scout')?Compass:id.startsWith('unit:guard')?Shield:id.startsWith('unit:ranged')?Swords:id.startsWith('unit:engineer')?Hammer:id.includes('tool')?Hammer:id.includes('ore')?Pickaxe:id.includes('cart')?Truck:Cog);
  const length = Number.isFinite(size) ? Math.max(16, Math.min(size, 256)) : 36;
  const style: CSSProperties = {
    display: 'inline-block', position: 'relative', verticalAlign: 'middle',
    flex: '0 0 auto', width: length, height: length, overflow: 'hidden',
    ...(ready ? {
      backgroundImage: `url("${atlas.url}")`, backgroundRepeat: 'no-repeat',
      backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
      backgroundPosition: `${((index % atlas.columns) / (atlas.columns - 1)) * 100}% ${(Math.floor(index / atlas.columns) / Math.max(atlas.rows - 1, 1)) * 100}%`,
    } : {}),
  };

  return <span ref={target} className={`q-item-art ${className}`.trim()} style={style} aria-hidden="true" data-render={ready ? '3d' : failed || (atlas && index < 0) ? 'fallback' : 'loading'}>
    {!ready && <Fallback size={Math.round(length*.62)} strokeWidth={1.65} style={{position:'absolute',left:'19%',top:'19%',color:id==='water'?'#6faca6':id==='ration'||id==='grain'?'#b69655':'#6f926c',filter:'drop-shadow(1px 2px 1px #203f2922)'}}/>}
  </span>;
}
