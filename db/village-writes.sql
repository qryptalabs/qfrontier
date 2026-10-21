-- Explicit opt-in, alongside partitioned-world.sql and player-read-model.sql.
-- A transaction-local authority row guards EVERY child mutation. It is removed
-- in the same batch; no process-local lock or permanent growing lock log exists.
CREATE TABLE IF NOT EXISTS world_village_write_operations (
  realm_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  PRIMARY KEY (realm_id, operation_id),
  FOREIGN KEY (realm_id) REFERENCES world_partition_heads(realm_id)
);
