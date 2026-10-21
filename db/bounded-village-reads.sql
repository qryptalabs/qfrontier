-- Explicit local candidate only. Missing or old index stamps fail to the
-- declared legacy path; reads never backfill by loading foreign private state.
CREATE TABLE IF NOT EXISTS world_village_record_index (
  realm_id TEXT NOT NULL,collection TEXT NOT NULL,entity_id TEXT NOT NULL,
  record_hash TEXT NOT NULL,owner_id TEXT,player_id TEXT,kind TEXT,status TEXT,
  resource_key TEXT,from_id TEXT,to_id TEXT,due_at INTEGER,facts_json TEXT NOT NULL,
  PRIMARY KEY(realm_id,collection,entity_id),
  FOREIGN KEY(realm_id) REFERENCES world_partition_heads(realm_id)
);
CREATE INDEX IF NOT EXISTS village_index_owner ON world_village_record_index(realm_id,collection,owner_id);
CREATE INDEX IF NOT EXISTS village_index_player ON world_village_record_index(realm_id,collection,player_id);
CREATE INDEX IF NOT EXISTS village_index_resource ON world_village_record_index(realm_id,collection,resource_key,status);
CREATE INDEX IF NOT EXISTS village_index_due ON world_village_record_index(realm_id,due_at);
CREATE TABLE IF NOT EXISTS world_village_ledger_participants (
  realm_id TEXT NOT NULL,entity_id TEXT NOT NULL,player_id TEXT NOT NULL,
  PRIMARY KEY(realm_id,entity_id,player_id)
);
CREATE INDEX IF NOT EXISTS village_ledger_player ON world_village_ledger_participants(realm_id,player_id,entity_id);
CREATE TABLE IF NOT EXISTS world_village_fact_parts (
  realm_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,part_count INTEGER NOT NULL,record_hash TEXT NOT NULL,body TEXT NOT NULL,
  PRIMARY KEY(realm_id,kind,entity_id,part_index)
);
CREATE TABLE IF NOT EXISTS world_village_index_state (
  realm_id TEXT PRIMARY KEY NOT NULL,source_revision INTEGER NOT NULL,commit_token TEXT NOT NULL,
  record_count INTEGER NOT NULL,participant_count INTEGER NOT NULL,
  format INTEGER NOT NULL CHECK(format=1)
);
