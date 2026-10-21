import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {auditReadD1} from './support/read-audit-d1.ts';

test('read auditor measures actual UTF-8 rows and detects a bulk private read rather than trusting a capability flag',async()=>{
  const binding=createSqliteD1(),marker='FOREIGN_PRIVATE_SENTINEL',privateBody=marker+'🔒'.repeat(10000);
  try{
    binding.sqlite.exec('CREATE TABLE world_partition_parts (collection TEXT,entity_id TEXT,body TEXT)');
    binding.sqlite.prepare('INSERT INTO world_partition_parts VALUES (?,?,?)').run('players','own','aldea');
    binding.sqlite.prepare('INSERT INTO world_partition_parts VALUES (?,?,?)').run('players','foreign',privateBody);
    const audit=auditReadD1(binding,[marker]),db=audit.database;
    await db.batch([db.prepare('SELECT collection,entity_id,body FROM world_partition_parts WHERE entity_id=?').bind('own')]);
    assert.deepEqual(audit.summary().partitionKeys,[{collection:'players',entityId:'own'}]);assert.deepEqual(audit.summary().sentinelMatches,[]);assert.ok(audit.summary().returnedCellBytes<100);
    audit.reset();await db.prepare('SELECT collection,entity_id,body FROM world_partition_parts').all();
    assert.deepEqual(audit.summary().sentinelMatches,[marker]);assert.equal(audit.summary().returnedRows,2);assert.ok(audit.summary().returnedCellBytes>=Buffer.byteLength(privateBody,'utf8'));
    assert.equal(audit.traces.some(trace=>JSON.stringify(trace).includes(privateBody)),false,'The audit reports evidence without copying private payloads.');
  }finally{binding.close();}
});

test('read auditor preserves real SQL rollback and rejects statements that bypass instrumentation',async()=>{
  const binding=createSqliteD1();
  try{
    binding.sqlite.exec('CREATE TABLE qa_values (id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
    const audit=auditReadD1(binding),db=audit.database;
    await assert.rejects(db.batch([db.prepare('INSERT INTO qa_values VALUES (?,?)').bind(1,'first'),db.prepare('INSERT INTO qa_values VALUES (?,?)').bind(1,'duplicate')]));
    assert.equal(binding.sqlite.prepare('SELECT COUNT(*) AS n FROM qa_values').get()!.n,0);assert.equal(audit.summary().failed,2);
    await assert.rejects(db.batch([binding.prepare('SELECT * FROM qa_values')]),/unaudited/);
  }finally{binding.close();}
});
