import { tool } from "ai";
import { z } from "zod";
import Exa from 'exa-js'

export const searchWeb = tool({
    description: "Fast web search. Use specific queries (e.g. 'Apple revenue 2024', 'Stripe headquarters').",
    
    inputSchema: z.object({
      query: z.string().describe("Specific keywords to search for.")
    }),
  
    execute: async ({ query }, options) => {
      const env = ((options as any)?.env ?? process.env) as {
        EXA_API_KEY?: string;
      };
      if (!env?.EXA_API_KEY) {
        throw new Error("Search tool - EXA_API_KEY is missing");
      }
  
      const exa = new Exa(env.EXA_API_KEY);
  
      try {
        const result = await exa.searchAndContents(
          query,
          {
            type: "fast",           
            useAutoprompt: false,   // Critical: saves ~1-2s by skipping query rewriting
            numResults: 3,          // Optimization: low payload
            text: {
              maxCharacters: 1000   // Optimization: limits context window usage
            }
          }
        );
  
        return {
          results: result.results.map((r) => ({
            title: r.title || "No title",
            url: r.url,
            content: r.text 
          }))
        };
  
      } catch (error) {
        console.error("Search failed:", error);
        return { results: [] }; 
      }
    }
  });

