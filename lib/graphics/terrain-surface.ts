export interface TerrainSurfaceCell {minX:number;maxX:number;minY:number;maxY:number;height:number}
export interface TerrainSurfaceGrid {
  readonly step:number;
  /** Record only top faces actually emitted by the terrain builder. Coordinates are chunk-local. */
  record(x:number,y:number,width:number,depth:number,height:number):void;
  /** Global coordinates. Null means this chunk has no terrain top here (authored layer or unloaded). */
  heightAt(x:number,y:number):number|null;
}

/** A constant-time cell lookup, with tiny local lists only where prepared land splits a cell. */
export function createTerrainSurfaceGrid(cx:number,cy:number,step:number,size=64):TerrainSurfaceGrid {
  if(!Number.isInteger(cx)||!Number.isInteger(cy)||![2,4,8].includes(step)||size%step!==0)throw new RangeError('Invalid rendered terrain grid');
  const count=size/step,heights=new Float32Array(count*count);heights.fill(NaN);
  const subdivisions=new Map<number,TerrainSurfaceCell[]>(),originX=cx*size,originY=cy*size;
  const index=(x:number,y:number)=>Math.floor(y/step)*count+Math.floor(x/step);
  return{step,
    record(x,y,width,depth,height){
      if(![x,y,width,depth,height].every(Number.isFinite)||x<0||y<0||x>=size||y>=size||width<=0||depth<=0)throw new RangeError('Invalid rendered terrain surface');
      const key=index(x,y),full=Math.abs(x%step)<1e-7&&Math.abs(y%step)<1e-7&&Math.abs(width-step)<1e-7&&Math.abs(depth-step)<1e-7;
      if(full){heights[key]=height;return;}
      const parts=subdivisions.get(key)??[];parts.push({minX:x,maxX:x+width,minY:y,maxY:y+depth,height:Math.fround(height)});subdivisions.set(key,parts);
    },
    heightAt(x,y){
      const localX=x-originX,localY=y-originY;if(!Number.isFinite(localX)||!Number.isFinite(localY)||localX<0||localY<0||localX>=size||localY>=size)return null;
      const key=index(localX,localY),parts=subdivisions.get(key);
      if(parts){const cell=parts.find(p=>localX>=p.minX-1e-8&&localX<p.maxX&&localY>=p.minY-1e-8&&localY<p.maxY);return cell?.height??null;}
      const height=heights[key];return Number.isFinite(height)?height:null;
    },
  };
}
