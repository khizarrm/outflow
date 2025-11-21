import type { CloudflareBindings } from "../env.d";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../db";
import { companyProfiles, employees } from "../db/companies.schema";
import { eq, sql } from "drizzle-orm";

export class VectorizeHandler {
    private env: CloudflareBindings;

    constructor(env: CloudflareBindings) {
        this.env = env;
    }

    // ============ POPULATION METHODS ============

    async populateCompanies() {
        try {
            const db = drizzle(this.env.DB, { schema });
            const companies = await db.select().from(companyProfiles).all();

            if (!companies || companies.length === 0) {
                return { success: false, message: 'No companies found in database' };
            }

            const vectors = [];
            const errors = [];

            for (const company of companies) {
                try {
                    // Generate embedding text
                    const textToEmbed = `${company.companyName} ${company.description || ''} ${company.techStack || ''} ${company.industry || ''}`;

                    // Generate embedding
                    const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                        text: textToEmbed
                    }) as { data: number[][] }; // simple type assertion

                    // Prepare vector
                    vectors.push({
                        id: `company_${company.id}`,
                        values: embedding.data[0],
                        metadata: {
                            company_id: company.id.toString(),
                            company_name: company.companyName,
                            website: company.website || '',
                            year_founded: company.yearFounded?.toString() || '',
                            description: company.description || '',
                            tech_stack: company.techStack || '',
                            employee_count_min: company.employeeCountMin?.toString() || '',
                            employee_count_max: company.employeeCountMax?.toString() || '',
                            revenue: company.revenue || '',
                            funding: company.funding || '',
                            headquarters: company.headquarters || '',
                            industry: company.industry || ''
                        }
                    });
                } catch (error) {
                    errors.push({ company: company.companyName, error: (error as Error).message });
                }
            }

            if (vectors.length > 0) {
                // Insert vectors into Vectorize (batch operation)
                // Vectorize insert limits batch size, usually 1000. Assuming < 1000 for now or the caller handles batches.
                // The user said "7 companies" so we are fine.
                const inserted = await this.env.COMPANY_VECTORS.insert(vectors);
                return {
                    success: true,
                    message: `Populated ${vectors.length} company vectors`,
                    errors: errors.length > 0 ? errors : undefined,
                    details: inserted
                };
            } else {
                return {
                    success: false,
                    message: "No vectors generated",
                    errors
                };
            }

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async populateEmployees() {
        try {
            const db = drizzle(this.env.DB, { schema });
            
            // Join employees with company profiles
            const result = await db.select({
                employee: employees,
                company: companyProfiles
            })
            .from(employees)
            .innerJoin(companyProfiles, eq(employees.companyId, companyProfiles.id))
            .all();

            if (!result || result.length === 0) {
                return { success: false, message: 'No employees found in database' };
            }

            const vectors = [];
            const errors = [];

            for (const row of result) {
                const { employee, company } = row;
                try {
                    // Generate embedding text - includes person + company context
                    const textToEmbed = `${employee.employeeName} ${employee.employeeTitle || ''} ${company.companyName} ${company.description || ''} ${company.industry || ''}`;

                    // Generate embedding
                    const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                        text: textToEmbed
                    }) as { data: number[][] };

                    // Store with full metadata
                    vectors.push({
                        id: `employee_${employee.id}`,
                        values: embedding.data[0],
                        metadata: {
                            employee_id: employee.id.toString(),
                            employee_name: employee.employeeName,
                            employee_title: employee.employeeTitle || '',
                            email: employee.email || '',
                            company_id: company.id.toString(),
                            company_name: company.companyName,
                            company_website: company.website || '',
                            company_description: company.description || '',
                            company_industry: company.industry || '',
                            company_year_founded: company.yearFounded?.toString() || '',
                            company_tech_stack: company.techStack || ''
                        }
                    });
                } catch (error) {
                    errors.push({ employee: employee.employeeName, error: (error as Error).message });
                }
            }

            if (vectors.length > 0) {
                const inserted = await this.env.EMPLOYEE_VECTORS.insert(vectors);
                return {
                    success: true,
                    message: `Populated ${vectors.length} employee vectors`,
                    errors: errors.length > 0 ? errors : undefined,
                    details: inserted
                };
            } else {
                 return {
                    success: false,
                    message: "No vectors generated",
                    errors
                };
            }

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    // ============ SEARCH METHODS ============

    async search(query: string, options: { type?: 'companies' | 'employees' | 'both', limit?: number, filter?: any } = {}) {
        try {
            const {
                type = 'both',
                limit = 5,
                filter = {}
            } = options;

            if (!query) {
                return { success: false, error: 'Query is required' };
            }

            // Generate embedding for the search query
            const queryEmbedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: query
            }) as { data: number[][] };

            const results: any = {};

            // Search companies if requested
            if (type === 'companies' || type === 'both') {
                const companyResults = await this.env.COMPANY_VECTORS.query(
                    queryEmbedding.data[0],
                    {
                        topK: limit,
                        returnMetadata: true,
                        filter: filter.companies || undefined
                    }
                );

                results.companies = companyResults.matches.map(match => ({
                    score: match.score,
                    ...match.metadata
                }));
            }

            // Search employees if requested
            if (type === 'employees' || type === 'both') {
                const employeeResults = await this.env.EMPLOYEE_VECTORS.query(
                    queryEmbedding.data[0],
                    {
                        topK: limit,
                        returnMetadata: true,
                        filter: filter.employees || undefined
                    }
                );

                results.employees = employeeResults.matches.map(match => ({
                    score: match.score,
                    ...match.metadata
                }));
            }

            return {
                success: true,
                query: query,
                type: type,
                results: results
            };

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    // ============ UTILITY METHODS ============

    async updateCompany(companyId: number) {
        try {
            const db = drizzle(this.env.DB, { schema });
            const company = await db.select().from(companyProfiles).where(eq(companyProfiles.id, companyId)).get();

            if (!company) {
                return { success: false, error: 'Company not found' };
            }

            // Generate new embedding
            const textToEmbed = `${company.companyName} ${company.description || ''} ${company.techStack || ''} ${company.industry || ''}`;
            const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: textToEmbed
            }) as { data: number[][] };

            // Upsert (insert or update) the vector
            await this.env.COMPANY_VECTORS.upsert([{
                id: `company_${company.id}`,
                values: embedding.data[0],
                metadata: {
                    company_id: company.id.toString(),
                    company_name: company.companyName,
                    website: company.website || '',
                    year_founded: company.yearFounded?.toString() || '',
                    description: company.description || '',
                    tech_stack: company.techStack || '',
                    employee_count_min: company.employeeCountMin?.toString() || '',
                    employee_count_max: company.employeeCountMax?.toString() || '',
                    revenue: company.revenue || '',
                    funding: company.funding || '',
                    headquarters: company.headquarters || '',
                    industry: company.industry || ''
                }
            }]);

            return { success: true, message: `Updated vector for ${company.companyName}` };

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async getStats() {
        try {
            const db = drizzle(this.env.DB, { schema });
            
            // Get counts from D1
            const companyCount = await db.select({ count: sql<number>`count(*)` }).from(companyProfiles).get();
            const employeeCount = await db.select({ count: sql<number>`count(*)` }).from(employees).get();

            return {
                companies: {
                    total_in_db: companyCount?.count || 0,
                    indexed: companyCount?.count || 0 // Assuming all are indexed
                },
                employees: {
                    total_in_db: employeeCount?.count || 0,
                    indexed: employeeCount?.count || 0
                }
            };

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
}

