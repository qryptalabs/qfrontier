import type { Job } from './types.ts';

export const TEST_BOOST_WINDOW_SECONDS=86400;
export const TEST_BOOST_LIMIT_SECONDS=1800;
export const TEST_BOOST_MAX_REDUCTION_PERCENT=20;
interface BoostTiming {mode:'test';reservedAt:number;baseSeconds:number;durationSeconds:number;savedSeconds:number}
export type TestBoostReservation=BoostTiming&({version:1}|{version:2;passCost:1});
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
/** Historical v1 timings remain intact; only an explicit v2 reservation consumes a pass. */
export function jobTestBoost(job:Job):TestBoostReservation|null {
  const value=job.payload.testBoost;if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const b=value as Partial<BoostTiming>&{version?:unknown;passCost?:unknown};
  if((job.kind!=='craft'&&job.kind!=='farm')||(b.version!==1&&b.version!==2)||b.version===2&&b.passCost!==1||b.mode!=='test'||!Number.isSafeInteger(b.reservedAt)||b.reservedAt!==job.createdAt
    ||!positive(b.baseSeconds)||!positive(b.durationSeconds)||!positive(b.savedSeconds)||b.baseSeconds-b.durationSeconds!==b.savedSeconds
    ||b.savedSeconds>Math.floor(b.baseSeconds/5)||b.savedSeconds>TEST_BOOST_LIMIT_SECONDS)return null;
  const timing:BoostTiming={mode:'test',reservedAt:b.reservedAt!,baseSeconds:b.baseSeconds,durationSeconds:b.durationSeconds,savedSeconds:b.savedSeconds};
  return b.version===2?{version:2,...timing,passCost:1}:{version:1,...timing};
}
