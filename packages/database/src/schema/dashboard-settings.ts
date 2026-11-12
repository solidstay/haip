import { pgTable, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

/** Installation-wide presentation preferences, not property data. Deliberately
 * has no propertyId: only realm admins may change the shared staff navigation. */
export const dashboardSettings = pgTable('dashboard_settings', {
  id: varchar('id', { length: 30 }).primaryKey(),
  enabled: jsonb('enabled').$type<string[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
