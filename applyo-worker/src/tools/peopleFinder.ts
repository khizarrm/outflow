import { tool } from "ai";
import { z } from "zod";
import Exa from 'exa-js'
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

const PersonSchema = z.object({
  name: z.string().describe("Full legal name"),
  role: z.string().describe("Exact job title")
});

const PeopleResultSchema = z.object({
  people: z.array(PersonSchema).min(1).max(5)
});

export const peopleFinder = tool({
    description: "Finds key executives (CEO, Founders, VP) for a given company.",
    
    inputSchema: z.object({
      company: z.string().describe("Company name"),
      website: z.string().optional().describe("Company website domain (e.g. stripe.com)"),
    }),
    
    execute: async ({ company, website }, options) => {
      
      console.log("caling ppl finder tool")
      const env = ((options as any)?.env ?? process.env) as any; 
      
      if (!env?.EXA_API_KEY) {
        throw new Error("People finder - EXA_API_KEY is missing");
      }

      console.log("doing company research via exa");
      const exa = new Exa(env.EXA_API_KEY);
      
      const queries = [
        `${company} leadership team executives`,
        `${company} CEO CTO founder`
      ];
  
      const searchResults = await Promise.all(
        queries.map(async (q) => {
          try {
            return await exa.searchAndContents(
              q,
              {
                type: "fast",
                useAutoprompt: false,
                numResults: 3,
                text: { maxCharacters: 1000 }
              }
            );
          } catch (e) {
            console.error(`exa query failed for "${q}":`, e);
            return { results: [] }; 
          }
        })
      );
  
      const combinedContent = searchResults
        .flatMap(r => r.results || [])
        .map(r => `Source: ${r.title}\nContent: ${r.text}`)
        .join("\n\n---\n\n");
  
      if (!combinedContent) {
        return { people: [] };
      }
  
      // 4. llm extraction
      try {
       
        const { object } = await generateObject({
             // @ts-expect-error - openai function accepts apiKey option, same pattern used in prospector/emailfinder
          model: openai("gpt-4o-mini", { apiKey: env.OPENAI_API_KEY }),
          schema: PeopleResultSchema,
          prompt: `
            Extract up to 5 current leadership figures (C-Level, Founders, VPs) for ${company}.
            
            Priority:
            1. Founders / CEO
            2. C-Suite (CTO, CFO, COO)
            3. VPs / Heads of Departments
            
            Strictly ignore: Board members, advisors, or investors.
            
            Search Context:
            ${combinedContent}
          `,
        });
  
        return { people: object.people };
      } catch (error) {
        console.error("llm extraction failed:", error);
        return { people: [] };
      }
    }
  });

