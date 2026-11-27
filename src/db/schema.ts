import { pgTable, serial, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const hollowScores = pgTable("hollow_scores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 12 }).notNull(),
  score: integer("score").notNull(),
  fuses: integer("fuses").notNull().default(0),
  timeSec: integer("time_sec").notNull().default(0),
  difficulty: varchar("difficulty", { length: 12 }).notNull().default("normal"),
  escaped: boolean("escaped").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
