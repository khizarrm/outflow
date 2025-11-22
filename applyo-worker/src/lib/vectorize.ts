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

    async populateCompanies(offset: number = 0, limit: number = 50) {
        try {
            const db = drizzle(this.env.DB, { schema });
            
            // Get total count first
            const totalCountResult = await db.select({ count: sql<number>`count(*)` }).from(companyProfiles).get();
            const totalCount = totalCountResult?.count || 0;
            
            const companies = await db.select()
                .from(companyProfiles)
                .limit(limit)
                .offset(offset)
                .all();

            if (!companies || companies.length === 0) {
                return {
                    success: false,
                    message: 'No companies found in this batch',
                    processed: 0,
                    total: totalCount,
                    processedSoFar: offset,
                    remaining: totalCount - offset,
                    progress: `${offset} out of ${totalCount}`,
                    hasMore: false,
                    nextOffset: offset
                };
            }

            const errors = [];
            const CONCURRENT_LIMIT = 3;
            let totalInserted = 0;
            let lastInsertResult = null;

            for (let i = 0; i < companies.length; i += CONCURRENT_LIMIT) {
                const batch = companies.slice(i, i + CONCURRENT_LIMIT);

                const batchPromises = batch.map(async (company) => {
                    try {
                        const textToEmbed = `${company.companyName} ${company.website || ''} ${company.description || ''} ${company.techStack || ''} ${company.industry || ''}`;

                        const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                            text: textToEmbed
                        }) as { data: number[][] };

                        return {
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
                        };
                    } catch (error) {
                        errors.push({ company: company.companyName, error: (error as Error).message });
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                const validVectors = batchResults.filter(v => v !== null);

                if (validVectors.length > 0) {
                    lastInsertResult = await this.env.COMPANY_VECTORS.insert(validVectors);
                    totalInserted += validVectors.length;
                }
            }

            const hasMore = companies.length === limit;
            const nextOffset = offset + totalInserted;
            const processedSoFar = offset + totalInserted;
            const remaining = totalCount - processedSoFar;

            if (totalInserted > 0) {
                return {
                    success: true,
                    message: `Processed ${totalInserted} company vectors: ${processedSoFar} out of ${totalCount}`,
                    processed: totalInserted,
                    total: totalCount,
                    processedSoFar: processedSoFar,
                    remaining: remaining,
                    progress: `${processedSoFar} out of ${totalCount}`,
                    hasMore,
                    nextOffset,
                    errors: errors.length > 0 ? errors : undefined,
                    details: lastInsertResult
                };
            } else {
                return {
                    success: false,
                    message: "No vectors generated",
                    processed: 0,
                    total: totalCount,
                    processedSoFar: offset,
                    remaining: totalCount - offset,
                    progress: `${offset} out of ${totalCount}`,
                    hasMore: false,
                    nextOffset: offset,
                    errors
                };
            }

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async populateEmployees(offset: number = 0, limit: number = 50) {
        try {
            const db = drizzle(this.env.DB, { schema });

            // Get total count first
            const totalCountResult = await db.select({ count: sql<number>`count(*)` }).from(employees).get();
            const totalCount = totalCountResult?.count || 0;

            const result = await db.select({
                employee: employees,
                company: companyProfiles
            })
            .from(employees)
            .innerJoin(companyProfiles, eq(employees.companyId, companyProfiles.id))
            .limit(limit)
            .offset(offset)
            .all();

            if (!result || result.length === 0) {
                return {
                    success: false,
                    message: 'No employees found in this batch',
                    processed: 0,
                    total: totalCount,
                    processedSoFar: offset,
                    remaining: totalCount - offset,
                    progress: `${offset} out of ${totalCount}`,
                    hasMore: false,
                    nextOffset: offset
                };
            }

            const vectors = [];
            const errors = [];

            for (const row of result) {
                const { employee, company } = row;
                try {
                    const textToEmbed = `${employee.employeeName} ${employee.employeeTitle || ''} ${company.companyName} ${company.description || ''} ${company.industry || ''}`;

                    const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                        text: textToEmbed
                    }) as { data: number[][] };

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

            const hasMore = result.length === limit;
            const nextOffset = offset + vectors.length;
            const processedSoFar = offset + vectors.length;
            const remaining = totalCount - processedSoFar;

            if (vectors.length > 0) {
                const inserted = await this.env.EMPLOYEE_VECTORS.insert(vectors);
                return {
                    success: true,
                    message: `Processed ${vectors.length} employee vectors: ${processedSoFar} out of ${totalCount}`,
                    processed: vectors.length,
                    total: totalCount,
                    processedSoFar: processedSoFar,
                    remaining: remaining,
                    progress: `${processedSoFar} out of ${totalCount}`,
                    hasMore,
                    nextOffset,
                    errors: errors.length > 0 ? errors : undefined,
                    details: inserted
                };
            } else {
                return {
                    success: false,
                    message: "No vectors generated",
                    processed: 0,
                    total: totalCount,
                    processedSoFar: offset,
                    remaining: totalCount - offset,
                    progress: `${offset} out of ${totalCount}`,
                    hasMore: false,
                    nextOffset: offset,
                    errors
                };
            }

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

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

            const queryEmbedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: query
            }) as { data: number[][] };

            const results: any = {};

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

    async updateCompany(companyId: number) {
        try {
            const db = drizzle(this.env.DB, { schema });
            const company = await db.select().from(companyProfiles).where(eq(companyProfiles.id, companyId)).get();

            if (!company) {
                return { success: false, error: 'Company not found' };
            }

            const textToEmbed = `${company.companyName} ${company.website || ''} ${company.description || ''} ${company.techStack || ''} ${company.industry || ''}`;
            const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: textToEmbed
            }) as { data: number[][] };

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

    async updateEmployee(employeeId: number) {
        try {
            const db = drizzle(this.env.DB, { schema });

            const result = await db.select({
                employee: employees,
                company: companyProfiles
            })
            .from(employees)
            .innerJoin(companyProfiles, eq(employees.companyId, companyProfiles.id))
            .where(eq(employees.id, employeeId))
            .limit(1)
            .get();

            if (!result) {
                return { success: false, error: 'Employee not found' };
            }

            const { employee, company } = result;
            const textToEmbed = `${employee.employeeName} ${employee.employeeTitle || ''} ${company.companyName} ${company.description || ''} ${company.industry || ''}`;

            const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
                text: textToEmbed
            }) as { data: number[][] };

            await this.env.EMPLOYEE_VECTORS.upsert([{
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
            }]);

            return { success: true, message: `Updated vector for ${employee.employeeName}` };

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    async getStats() {
        try {
            const db = drizzle(this.env.DB, { schema });
            
            const companyCount = await db.select({ count: sql<number>`count(*)` }).from(companyProfiles).get();
            const employeeCount = await db.select({ count: sql<number>`count(*)` }).from(employees).get();

            return {
                companies: {
                    total_in_db: companyCount?.count || 0,
                    indexed: companyCount?.count || 0
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

