-- Explicit opt-in read plane. Apply only together with partitioned-world.sql.
-- These derived tables never replace the authoritative economic records.
CREATE TABLE IF NOT EXISTS world_read_model_state (
  realm_id TEXT PRIMARY KEY NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  commit_token TEXT NOT NULL,
  public_revision INTEGER,
  public_token TEXT,
  actor_count INTEGER NOT NULL CHECK (actor_count >= 0),
  entity_count INTEGER NOT NULL CHECK (entity_count > 0),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);

CREATE TABLE IF NOT EXISTS world_entity_versions (
  realm_id TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  fingerprint TEXT NOT NULL,
  PRIMARY KEY (realm_id, entity_key),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);

CREATE TABLE IF NOT EXISTS world_public_actor_heads (
  realm_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  player_ordinal INTEGER NOT NULL CHECK (player_ordinal >= 0),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  source_version INTEGER NOT NULL CHECK (source_version >= 1),
  as_of INTEGER NOT NULL,
  next_due_at INTEGER,
  part_count INTEGER NOT NULL CHECK (part_count >= 1),
  record_hash TEXT NOT NULL,
  PRIMARY KEY (realm_id, player_id),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);
CREATE INDEX IF NOT EXISTS world_public_actors_owner ON world_public_actor_heads (realm_id, owner_id, player_id);
CREATE TABLE IF NOT EXISTS world_public_actor_parts (
  realm_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  part_index INTEGER NOT NULL CHECK (part_index >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY (realm_id, player_id, part_index),
  FOREIGN KEY (realm_id, player_id) REFERENCES world_public_actor_heads(realm_id, player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_player_view_heads (
  realm_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  selected_player_id TEXT,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  as_of INTEGER NOT NULL,
  next_due_at INTEGER,
  dependencies TEXT NOT NULL,
  part_count INTEGER NOT NULL CHECK (part_count >= 1),
  record_hash TEXT NOT NULL,
  PRIMARY KEY (realm_id, owner_id, selection_id),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);
CREATE TABLE IF NOT EXISTS world_player_view_parts (
  realm_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  part_index INTEGER NOT NULL CHECK (part_index >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY (realm_id, owner_id, selection_id, part_index),
  FOREIGN KEY (realm_id, owner_id, selection_id) REFERENCES world_player_view_heads(realm_id, owner_id, selection_id) ON DELETE CASCADE
);
