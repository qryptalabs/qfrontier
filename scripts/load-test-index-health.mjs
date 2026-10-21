/** Read-only diagnostic used only after workload/drain, or by dedicated tests.
 * No account IDs, commit tokens or record bodies are returned. Counts describe
 * SQL storage, not D1 billed/visited rows or a repair of the derived index.
 */
export function readPartitionedIndexHealth(sqlite,realm='frontier-pdf-mvp-v2'){
  const row=sqlite.prepare(`SELECT h.revision AS headRevision,h.record_count AS headRecordCount,h.part_count AS headPartCount,
    m.source_revision AS metadataRevision,s.source_revision AS indexRevision,
    (m.source_revision=h.revision AND m.commit_token=h.commit_token) AS metadataStampMatches,
    (m.public_revision=h.revision AND m.public_token=h.commit_token) AS publicStampMatches,
    (s.source_revision=h.revision AND s.commit_token=h.commit_token AND s.format=1) AS indexStampMatches,
    s.record_count AS indexRecordCount,s.participant_count AS participantCount,m.entity_count AS entityCount,m.actor_count AS actorCount,
    (SELECT COUNT(*) FROM world_partition_parts p WHERE p.realm_id=h.realm_id AND p.part_index=0) AS actualRecordCount,
    (SELECT COUNT(*) FROM world_partition_parts p WHERE p.realm_id=h.realm_id) AS actualPartCount,
    (SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id) AS actualIndexRecordCount,
    (SELECT COUNT(*) FROM world_village_ledger_participants lp WHERE lp.realm_id=h.realm_id) AS actualParticipantCount,
    (SELECT COUNT(*) FROM world_entity_versions v WHERE v.realm_id=h.realm_id) AS actualEntityCount,
    (SELECT COUNT(*) FROM world_public_actor_heads a WHERE a.realm_id=h.realm_id) AS actualActorCount,
    (SELECT COUNT(*) FROM world_partition_parts p WHERE p.realm_id=h.realm_id AND p.collection='players' AND p.part_index=0) AS actualPlayerCount,
    (SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id AND NOT EXISTS(SELECT 1 FROM world_partition_parts p WHERE p.realm_id=i.realm_id AND p.collection=i.collection AND p.entity_id=i.entity_id AND p.part_index=0)) AS orphanIndexRecords,
    (SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id AND i.collection='events' AND NOT EXISTS(SELECT 1 FROM world_partition_parts p WHERE p.realm_id=i.realm_id AND p.collection=i.collection AND p.entity_id=i.entity_id AND p.part_index=0)) AS orphanIndexEvents,
    (SELECT COUNT(*) FROM world_partition_parts p WHERE p.realm_id=h.realm_id AND p.part_index=0 AND NOT EXISTS(SELECT 1 FROM world_village_record_index i WHERE i.realm_id=p.realm_id AND i.collection=p.collection AND i.entity_id=p.entity_id)) AS missingIndexRecords,
    (SELECT COUNT(*) FROM world_village_record_index i JOIN world_partition_parts p ON p.realm_id=i.realm_id AND p.collection=i.collection AND p.entity_id=i.entity_id AND p.part_index=0 WHERE i.realm_id=h.realm_id AND i.record_hash<>p.record_hash) AS recordHashMismatches
    FROM world_partition_heads h LEFT JOIN world_read_model_state m ON m.realm_id=h.realm_id LEFT JOIN world_village_index_state s ON s.realm_id=h.realm_id WHERE h.realm_id=?`).get(realm);
  if(!row)return{indexHealthy:false,headPresent:false};
  const result={...row,headPresent:true};
  for(const key of['metadataStampMatches','publicStampMatches','indexStampMatches'])result[key]=result[key]===1;
  result.indexHealthy=result.metadataStampMatches&&result.publicStampMatches&&result.indexStampMatches&&
    result.headRecordCount===result.actualRecordCount&&result.headPartCount===result.actualPartCount&&
    result.indexRecordCount===result.actualIndexRecordCount&&result.indexRecordCount===result.headRecordCount&&
    result.participantCount===result.actualParticipantCount&&result.entityCount===result.actualEntityCount&&
    result.actorCount===result.actualActorCount&&result.actorCount===result.actualPlayerCount&&
    result.orphanIndexRecords===0&&result.missingIndexRecords===0&&result.recordHashMismatches===0;
  return result;
}
