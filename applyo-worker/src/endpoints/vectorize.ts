import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { VectorizeHandler } from "../lib/vectorize";
import type { CloudflareBindings } from "../env.d";

export class VectorizePopulateCompaniesRoute extends OpenAPIRoute {
    schema = {
        tags: ["Vectorize"],
        summary: "Populate Company Vectors",
        description: "Generates and stores vector embeddings for companies in batches (default 50 per batch)",
        request: {
            query: z.object({
                offset: z.string().optional().default('0').transform(val => parseInt(val, 10)),
                limit: z.string().optional().default('50').transform(val => parseInt(val, 10)),
            }),
        },
        responses: {
            "200": {
                description: "Population successful",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string(),
                            processed: z.number(),
                            total: z.number(),
                            processedSoFar: z.number(),
                            remaining: z.number(),
                            progress: z.string(),
                            hasMore: z.boolean(),
                            nextOffset: z.number(),
                            errors: z.array(z.any()).optional(),
                            details: z.any().optional()
                        }),
                    },
                },
            },
            "500": { description: "Server error" }
        },
    };

    async handle(c: any) {
        const { offset, limit } = await this.getValidatedData<typeof this.schema>().then(d => d.query);
        const handler = new VectorizeHandler(c.env);
        const result = await handler.populateCompanies(offset, limit);
        return Response.json(result, { status: result.success ? 200 : 500 });
    }
}

export class VectorizePopulateEmployeesRoute extends OpenAPIRoute {
    schema = {
        tags: ["Vectorize"],
        summary: "Populate Employee Vectors",
        description: "Generates and stores vector embeddings for employees in batches (default 50 per batch)",
        request: {
            query: z.object({
                offset: z.string().optional().default('0').transform(val => parseInt(val, 10)),
                limit: z.string().optional().default('50').transform(val => parseInt(val, 10)),
            }),
        },
        responses: {
            "200": {
                description: "Population successful",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string(),
                            processed: z.number(),
                            total: z.number(),
                            processedSoFar: z.number(),
                            remaining: z.number(),
                            progress: z.string(),
                            hasMore: z.boolean(),
                            nextOffset: z.number(),
                            errors: z.array(z.any()).optional(),
                            details: z.any().optional()
                        }),
                    },
                },
            },
            "500": { description: "Server error" }
        },
    };

    async handle(c: any) {
        const { offset, limit } = await this.getValidatedData<typeof this.schema>().then(d => d.query);
        const handler = new VectorizeHandler(c.env);
        const result = await handler.populateEmployees(offset, limit);
        return Response.json(result, { status: result.success ? 200 : 500 });
    }
}

export class VectorizeSearchRoute extends OpenAPIRoute {
    schema = {
        tags: ["Vectorize"],
        summary: "Semantic Search",
        description: "Search for companies and employees using natural language",
        request: {
            query: z.object({
                q: z.string().describe("Search query"),
                type: z.enum(['companies', 'employees', 'both']).optional().default('both'),
                limit: z.string().optional().default('5').transform(val => parseInt(val, 10)),
            }),
        },
        responses: {
            "200": {
                description: "Search results",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            query: z.string(),
                            type: z.string(),
                            results: z.object({
                                companies: z.array(z.object({
                                    score: z.number(),
                                    company_name: z.string().optional(),
                                    description: z.string().optional(),
                                    industry: z.string().optional(),
                                    // allow other metadata fields
                                }).passthrough()).optional(),
                                employees: z.array(z.object({
                                    score: z.number(),
                                    employee_name: z.string().optional(),
                                    employee_title: z.string().optional(),
                                    company_name: z.string().optional(),
                                    // allow other metadata fields
                                }).passthrough()).optional(),
                            }),
                            error: z.string().optional()
                        }),
                    },
                },
            },
            "400": { description: "Bad Request" }
        },
    };

    async handle(c: any) {
        const { q, type, limit } = await this.getValidatedData<typeof this.schema>().then(d => d.query);
        const handler = new VectorizeHandler(c.env);
        
        const result = await handler.search(q, { 
            type: type as 'companies' | 'employees' | 'both', 
            limit 
        });
        
        return Response.json(result, { status: result.success ? 200 : 400 });
    }
}

export class VectorizeUpdateCompanyRoute extends OpenAPIRoute {
    schema = {
        tags: ["Vectorize"],
        summary: "Update Company Vector",
        description: "Updates the vector embedding for a specific company",
        request: {
            params: z.object({
                id: z.string().describe("Company ID"),
            }),
        },
        responses: {
            "200": {
                description: "Update successful",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string().optional(),
                            error: z.string().optional()
                        }),
                    },
                },
            },
            "404": { description: "Company not found" }
        },
    };

    async handle(c: any) {
        const { id } = await this.getValidatedData<typeof this.schema>().then(d => d.params);
        const handler = new VectorizeHandler(c.env);
        
        const result = await handler.updateCompany(parseInt(id));
        return Response.json(result, { status: result.success ? 200 : 404 });
    }
}

export class VectorizeStatsRoute extends OpenAPIRoute {
    schema = {
        tags: ["Vectorize"],
        summary: "Get Vector Stats",
        description: "Get counts of companies and employees in database vs index",
        responses: {
            "200": {
                description: "Stats retrieved",
                content: {
                    "application/json": {
                        schema: z.object({
                            companies: z.object({
                                total_in_db: z.number(),
                                indexed: z.number()
                            }),
                            employees: z.object({
                                total_in_db: z.number(),
                                indexed: z.number()
                            }),
                            success: z.boolean().optional(),
                            error: z.string().optional()
                        }),
                    },
                },
            },
        },
    };

    async handle(c: any) {
        const handler = new VectorizeHandler(c.env);
        const result = await handler.getStats();
        return Response.json(result);
    }
}

