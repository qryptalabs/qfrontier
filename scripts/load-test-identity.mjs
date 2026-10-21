import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const hash=body=>createHash('sha256').update(body).digest('hex');
const corpus=entries=>hash(entries.map(e=>`${e.path}:${e.sha256}`).sort().join('\n'));

/** Candidate mode is explicit. The original reference is never rewritten to
 * bless new code, and reports keep both the reference and actual identities.
 * @param {{source:string,metadataPath:string,mode?:string,label?:string}} options
 */
export async function inspectLoadEngine({source,metadataPath,mode='baseline',label=undefined}){
  assert.ok(['baseline','candidate'].includes(mode),'--engine-mode must be baseline or candidate.');
  if(mode==='candidate')assert.ok(typeof label==='string'&&label.trim().length>=2,'Candidate runs require --engine-label.');
  const metadataText=await readFile(metadataPath,'utf8'),metadata=JSON.parse(metadataText),reference=metadata.sourceFilesAndHashes.filter(e=>e.path.startsWith('lib/'));
  assert.ok(reference.length,'Source reference contains no library hashes.');
  for(const entry of reference)assert.ok(!entry.path.split('/').includes('..')&&!entry.path.includes('\\'),'Unsafe source-reference path.');
  const actual=[];
  async function walk(directory,prefix){for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${prefix}/${entry.name}`,absolute=join(directory,entry.name);if(entry.isDirectory())await walk(absolute,path);else if(entry.isFile())actual.push({path,sha256:hash(await readFile(absolute))});else throw new Error(`Source links are not accepted: ${path}`);}}
  await walk(resolve(source,'lib'),'lib');actual.sort((a,b)=>a.path.localeCompare(b.path));
  const lookup=new Map(actual.map(e=>[e.path,e.sha256])),expected=new Map(reference.map(e=>[e.path,e.sha256]));
  const changes=reference.flatMap(e=>lookup.get(e.path)===e.sha256?[]:[{path:e.path,kind:lookup.has(e.path)?'changed':'missing',expectedSha256:e.sha256,actualSha256:lookup.get(e.path)??null}]);
  const added=actual.filter(e=>!expected.has(e.path)).map(e=>({...e,kind:'added'}));
  if(mode==='baseline')assert.equal(changes.length,0,`Immutable source mismatch: ${changes.map(e=>e.path).join(', ')}`);
  const sourceLibSha256=corpus(reference.map(e=>({path:e.path,sha256:lookup.get(e.path)??'MISSING'})));
  return{metadata,sourceLibSha256,engineIdentity:{mode,label:label??'immutable-reference',referenceRelease:metadata.deployedVersion??metadata.release??null,referenceManifestSha256:hash(metadataText),referenceCorpusSha256:corpus(reference),referenceActualSha256:sourceLibSha256,fullCorpusSha256:corpus(actual),entrySha256:lookup.get('lib/mvp/engine.ts')??null,checkedReferenceFiles:reference.length,referenceFilesMatch:changes.length===0,changes,additionalFiles:added,releaseStatus:mode==='candidate'?'unpublished-candidate':'reference-engine'}};
}
