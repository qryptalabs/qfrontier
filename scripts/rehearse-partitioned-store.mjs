import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteD1} from '../tests/support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';

const args=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,index,all)=>arg.startsWith('--')?[...pairs,[arg.slice(2),all[index+1]]]:pairs,[]));
if(!args['input-sql'])throw new Error('Use --input-sql <local-backup.sql> [--out <local-report.json>]');
const root=process.cwd(),output=path.resolve(root,args.out??'work/scalability-preservation-rehearsal.json');
if(!output.startsWith(`${root}${path.sep}`))throw new Error('El informe debe estar dentro de la carpeta de trabajo.');
const realm='frontier-pdf-mvp-v2',source=new DatabaseSync(':memory:'),target=createSqliteD1();
const digest=value=>createHash('sha256').update(value).digest('hex');
try{
  source.exec(await readFile(path.resolve(args['input-sql']),'utf8'));
  const row=source.prepare('SELECT revision,state FROM world_state WHERE id=?').get(realm);
  assert.ok(row,'El respaldo no contiene el mundo esperado.');
  const world=JSON.parse(row.state),originalHash=digest(row.state);
  target.sqlite.exec(await readFile(path.join(root,'drizzle/0000_odd_warlock.sql'),'utf8'));
  target.sqlite.exec(await readFile(path.join(root,'db/partitioned-world.sql'),'utf8'));
  const store=createPartitionedMvpStore(target);
  await store.insert(world);
  // This is an in-memory restoration rehearsal, never a production migration.
  // Preserve the backup revision after importing into the empty staging DB.
  target.sqlite.prepare('UPDATE world_partition_heads SET revision=? WHERE realm_id=?').run(row.revision,realm);
  const restored=await store.read();
  assert.equal(restored.revision,row.revision);
  assert.deepEqual(restored.world,world);
  assert.equal(JSON.stringify(restored.world),row.state,'El contenido y orden JSON deben conservarse exactamente.');
  const second=createPartitionedMvpStore(target);
  assert.deepEqual(await second.read(),restored);
  assert.equal(await store.compareAndSwap(row.revision,structuredClone(world)),true);
  assert.equal(await second.compareAndSwap(row.revision,structuredClone(world)),false);
  const before=await store.read(),tentative=structuredClone(world);
  tentative.rulesVersion+='-local-rollback-probe';
  target.failNext({phase:'after-statement',statementIndex:0,error:new Error('local-rollback-probe')});
  await assert.rejects(store.compareAndSwap(before.revision,tentative),/local-rollback-probe/);
  assert.deepEqual(await store.read(),before);
  assert.equal(source.prepare('SELECT state FROM world_state WHERE id=?').get(realm).state,row.state);
  const sizes=target.sqlite.prepare('SELECT max(length(CAST(body AS BLOB))) AS maximum,count(*) AS parts FROM world_partition_parts WHERE realm_id=?').get(realm);
  const head=target.sqlite.prepare('SELECT record_count FROM world_partition_heads WHERE realm_id=?').get(realm);
  const report={createdAt:new Date().toISOString(),mode:'local-in-memory-restoration-rehearsal',networkRequests:0,productionWrites:0,sourceRevision:row.revision,sourceBytes:Buffer.byteLength(row.state),sourceSha256:originalHash,restoredSha256:digest(JSON.stringify(restored.world)),exactJsonPreserved:true,players:Object.keys(world.players).length,jobs:Object.keys(world.jobs).length,receipts:Object.keys(world.receipts).length,recordCount:head.record_count,partCount:sizes.parts,maximumBodyBytes:sizes.maximum,checks:{sameRevision:true,allFieldsAndOrdering:true,staleCasRejected:true,sqlRollback:true,sourceUnchanged:true},limitations:['Local SQLite models D1 SQL semantics; this is not a Cloudflare capacity test.','No live backend selection or migration was performed.','A production import needs maintenance/fencing and an independently verified backup.']};
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{source.close();target.close();}
