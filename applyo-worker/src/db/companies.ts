import { drizzle } from "drizzle-orm/d1";
import { schema } from "./schema";
import { companyProfiles, employees } from "./companies.schema";
import { eq, and, or, sql } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { extractDomain } from "../lib/utils";

export async function upsertCompany(
  db: D1Database,
  companyName: string,
  website: string | null,
  additionalData?: {
    description?: string | null;
    techStack?: string | null;
    industry?: string | null;
    yearFounded?: number | null;
    headquarters?: string | null;
    revenue?: string | null;
    funding?: string | null;
    employeeCountMin?: number | null;
    employeeCountMax?: number | null;
  }
): Promise<number> {
  const drizzleDb = drizzle(db, { schema });

  if (!companyName || companyName.trim() === "") {
    throw new Error("Company name is required");
  }

  const normalizedName = companyName.trim();
  const conditions = [sql`LOWER(${companyProfiles.companyName}) = LOWER(${normalizedName})`];

  if (website && website.trim() !== "") {
    conditions.push(eq(companyProfiles.website, website.trim()));
  }

  const existing = await drizzleDb
    .select()
    .from(companyProfiles)
    .where(or(...conditions))
    .limit(1)
    .get();

  const updateData: {
    website?: string | null;
    description?: string | null;
    techStack?: string | null;
    industry?: string | null;
    yearFounded?: number | null;
    headquarters?: string | null;
    revenue?: string | null;
    funding?: string | null;
    employeeCountMin?: number | null;
    employeeCountMax?: number | null;
  } = {};

  if (website && website.trim() !== "") {
    updateData.website = website.trim();
  }

  if (additionalData) {
    if (additionalData.description !== undefined)
      updateData.description = additionalData.description?.trim() || null;
    if (additionalData.techStack !== undefined)
      updateData.techStack = additionalData.techStack?.trim() || null;
    if (additionalData.industry !== undefined)
      updateData.industry = additionalData.industry?.trim() || null;
    if (additionalData.yearFounded !== undefined)
      updateData.yearFounded = additionalData.yearFounded;
    if (additionalData.headquarters !== undefined)
      updateData.headquarters = additionalData.headquarters?.trim() || null;
    if (additionalData.revenue !== undefined)
      updateData.revenue = additionalData.revenue?.trim() || null;
    if (additionalData.funding !== undefined)
      updateData.funding = additionalData.funding?.trim() || null;
    if (additionalData.employeeCountMin !== undefined)
      updateData.employeeCountMin = additionalData.employeeCountMin;
    if (additionalData.employeeCountMax !== undefined)
      updateData.employeeCountMax = additionalData.employeeCountMax;
  }

  if (existing) {
    const fieldsToUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([_, v]) => v !== null && v !== undefined)
    );

    if (Object.keys(fieldsToUpdate).length > 0) {
      await drizzleDb
        .update(companyProfiles)
        .set(fieldsToUpdate)
        .where(eq(companyProfiles.id, existing.id));
    }

    return existing.id;
  }

  const result = await drizzleDb.insert(companyProfiles).values({
    companyName: normalizedName,
    website: website?.trim() || null,
    description: additionalData?.description?.trim() || null,
    techStack: additionalData?.techStack?.trim() || null,
    industry: additionalData?.industry?.trim() || null,
    yearFounded: additionalData?.yearFounded || null,
    headquarters: additionalData?.headquarters?.trim() || null,
    revenue: additionalData?.revenue?.trim() || null,
    funding: additionalData?.funding?.trim() || null,
    employeeCountMin: additionalData?.employeeCountMin || null,
    employeeCountMax: additionalData?.employeeCountMax || null,
  }).returning({ id: companyProfiles.id });

  return result[0].id;
}

export async function upsertEmployee(
  db: D1Database,
  companyId: number,
  employeeName: string,
  employeeTitle: string | null,
  email: string | null
): Promise<number> {
  const drizzleDb = drizzle(db, { schema });

  if (!employeeName || employeeName.trim() === "") {
    throw new Error("Employee name is required");
  }

  const normalizedName = employeeName.trim();

  const existing = await drizzleDb
    .select()
    .from(employees)
    .where(
      and(
        sql`LOWER(${employees.employeeName}) = LOWER(${normalizedName})`,
        eq(employees.companyId, companyId)
      )
    )
    .limit(1)
    .get();

  if (existing) {
    const updateData: { employeeTitle?: string | null; email?: string | null } = {};

    if (employeeTitle && employeeTitle.trim() !== "") {
      updateData.employeeTitle = employeeTitle.trim();
    }

    if (email && email.trim() !== "") {
      updateData.email = email.trim();
    }

    if (Object.keys(updateData).length > 0) {
      await drizzleDb
        .update(employees)
        .set(updateData)
        .where(eq(employees.id, existing.id));
    }

    return existing.id;
  } else {
    const result = await drizzleDb.insert(employees).values({
      employeeName: normalizedName,
      employeeTitle: employeeTitle?.trim() || null,
      email: email?.trim() || null,
      companyId: companyId,
    }).returning({ id: employees.id });

    return result[0].id;
  }
}

export async function findExistingCompanyAndEmployees(
  db: D1Database,
  query: string
): Promise<{
  company: typeof companyProfiles.$inferSelect;
  employees: (typeof employees.$inferSelect)[];
} | null> {
  const drizzleDb = drizzle(db, { schema });
  
  if (!query || query.trim() === "") {
    return null;
  }
  
  const normalizedQuery = query.trim();
  
  // First, try to extract and match by URL/domain (more accurate)
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/g;
  const urlMatches = normalizedQuery.match(urlPattern);
  
  if (urlMatches && urlMatches.length > 0) {
    // Extract domain from each URL match and try to find matching company
    for (const urlMatch of urlMatches) {
      const queryDomain = extractDomain(urlMatch);
      if (!queryDomain) continue;
      
      const queryDomainLower = queryDomain.toLowerCase();
      
      // Get all companies with websites and compare domains
      const companiesWithWebsites = await drizzleDb
        .select()
        .from(companyProfiles)
        .where(sql`${companyProfiles.website} IS NOT NULL`)
        .all();
      
      for (const comp of companiesWithWebsites) {
        if (!comp.website) continue;
        
        const storedDomain = extractDomain(comp.website);
        if (storedDomain && storedDomain.toLowerCase() === queryDomainLower) {
          // Found match by domain - get employees
          const companyEmployees = await drizzleDb
            .select()
            .from(employees)
            .where(eq(employees.companyId, comp.id))
            .all();
          
          return {
            company: comp,
            employees: companyEmployees,
          };
        }
      }
    }
  }
  
  // Fall back to company name matching if no URL match found
  // Extract potential company name from query
  // Remove common prefixes and look for patterns like "at [company]", "from [company]"
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  
  // Try to extract company name after "at" or "from"
  let potentialCompanyName = normalizedQueryLower;
  const atMatch = normalizedQueryLower.match(/(?:at|from|@)\s+([^,]+)/);
  if (atMatch && atMatch[1]) {
    potentialCompanyName = atMatch[1].trim();
  } else {
    // Remove common action words at the start
    potentialCompanyName = normalizedQueryLower.replace(/^(find|get|search|look\s+for|show)\s+/i, '').trim();
  }
  
  if (!potentialCompanyName || potentialCompanyName.length < 2) {
    return null;
  }
  
  // Try exact match first (case-insensitive)
  let company = await drizzleDb
    .select()
    .from(companyProfiles)
    .where(sql`LOWER(${companyProfiles.companyName}) = LOWER(${potentialCompanyName})`)
    .limit(1)
    .get();
  
  // If no exact match, try partial match (contains)
  if (!company) {
    company = await drizzleDb
      .select()
      .from(companyProfiles)
      .where(sql`LOWER(${companyProfiles.companyName}) LIKE LOWER(${`%${potentialCompanyName}%`})`)
      .limit(1)
      .get();
  }
  
  if (!company) {
    return null;
  }
  
  // Get all employees for this company
  const companyEmployees = await drizzleDb
    .select()
    .from(employees)
    .where(eq(employees.companyId, company.id))
    .all();
  
  return {
    company,
    employees: companyEmployees,
  };
}

