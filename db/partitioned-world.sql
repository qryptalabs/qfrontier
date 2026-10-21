-- Opt-in staging schema. This file is deliberately outside drizzle/ migrations.
-- Creating these empty tables does not select a backend or migrate world_state.
CREATE TABLE IF NOT EXISTS world_partition_heads (
  realm_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  format INTEGER NOT NULL CHECK (format = 1),
  commit_token TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count > 0),
  part_count INTEGER NOT NULL CHECK (part_count >= record_count),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_partition_parts (
  realm_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  part_index INTEGER NOT NULL CHECK (part_index >= 0),
  part_count INTEGER NOT NULL CHECK (part_count > part_index),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  record_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (realm_id, collection, entity_id, part_index),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);
