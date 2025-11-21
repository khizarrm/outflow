import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const companyProfiles = sqliteTable("company_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  website: text("website"),
  yearFounded: integer("year_founded"),
  description: text("description"),
  techStack: text("tech_stack"),
  employeeCountMin: integer("employee_count_min"),
  employeeCountMax: integer("employee_count_max"),
  revenue: text("revenue"),
  funding: text("funding"),
  headquarters: text("headquarters"),
  industry: text("industry"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeName: text("employee_name").notNull(),
  employeeTitle: text("employee_title"),
  email: text("email"),
  companyId: integer("company_id").references(() => companyProfiles.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
