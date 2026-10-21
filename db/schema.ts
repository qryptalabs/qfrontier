import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A small alpha realm is committed as one revision so exchanges, escrow,
// resources and command receipts always change atomically.
export const worldState = sqliteTable("world_state", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});
