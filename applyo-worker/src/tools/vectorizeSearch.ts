import { tool } from "ai";
import { z } from "zod";
import { VectorizeHandler } from "../lib/vectorize";
import type { CloudflareBindings } from "../env.d";

export const vectorizeSearch = tool({
    description: "Search for companies and employees using semantic search. This searches through company profiles and employee records to find relevant matches based on meaning, not just keywords. Use this to find companies by industry, tech stack, or description, or to find employees by role, company, or expertise.",
    inputSchema: z.object({
        query: z.string().describe("The search query in natural language (e.g., 'AI companies in San Francisco', 'CTOs at semiconductor companies', 'Anthropic employees')"),
        type: z.enum(['companies', 'employees', 'both']).optional().describe("What to search for: 'companies' for company profiles only, 'employees' for people only, 'both' for everything (default)"),
        limit: z.number().optional().describe("Maximum number of results to return per type (default: 5)")
    }),
    execute: async ({ query, type, limit }, options) => {
        console.log('[vectorizeSearch] Starting search:', { query, type: type || 'both', limit: limit || 5 });
        
        const env = ((options as any)?.env ?? process.env) as CloudflareBindings;
        if (!env) {
            console.error('[vectorizeSearch] Error: environment bindings are missing');
            throw new Error("Vectorize search tool - environment bindings are missing");
        }
        
        try {
            const handler = new VectorizeHandler(env);
            const searchOptions = { 
                type: type || 'both' as 'companies' | 'employees' | 'both', 
                limit: limit || 5 
            };
            
            console.log('[vectorizeSearch] Calling VectorizeHandler.search with options:', searchOptions);
            const result = await handler.search(query, searchOptions);
            
            if (!result.success) {
                console.error('[vectorizeSearch] Search failed:', result.error);
                return {
                    success: false,
                    error: result.error || 'Search failed',
                    companies: [],
                    employees: []
                };
            }
            
            const companyCount = result.results.companies?.length || 0;
            const employeeCount = result.results.employees?.length || 0;
            console.log('[vectorizeSearch] Search successful:', { 
                query: result.query, 
                type: result.type,
                companyResults: companyCount,
                employeeResults: employeeCount
            });
            
            return {
                success: true,
                query: result.query,
                companies: result.results.companies || [],
                employees: result.results.employees || []
            };
        } catch (error) {
            console.error('[vectorizeSearch] Exception during search:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                companies: [],
                employees: []
            };
        }
    }
});

