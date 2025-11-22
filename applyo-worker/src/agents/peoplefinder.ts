import { Agent } from "agents";
import { normalizeUrl } from "../lib/utils";
import type { CloudflareBindings } from "../env.d";
import { tools } from "../tools";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

class PeopleFinder extends Agent<CloudflareBindings> {
  
  async onStart() {
    console.log('ppl finder started with state:', this.state);
  }

  async onRequest(_request: Request): Promise<Response> {
      const body = await _request.json() as {
        company?: string;
        website?: string;
        notes?: string;
      };
      const company = body.company || "";
      const website = body.website || "";
      const notes = body.notes || "";

      if (!company) {
        return new Response(
          JSON.stringify({ error: "Company name is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const existingPeople = await this.checkPeopleInDB(company);
      if (existingPeople) {
        return new Response(
          JSON.stringify({
            ...existingPeople,
            state: this.state,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      try {
        const searchQuery = `"${company}" founder ceo "c-suite" leadership team site:${website || '*'}`;
        
        const searchResponse = await tools.searchWeb.execute({ 
          query: searchQuery 
        }, {
          env: this.env
        } as any);

        const responseData = searchResponse as { results: Array<{ title: string; url: string; content: string }> };
        const searchSnippets = responseData.results
          .map(r => `
          source url: ${r.url}
          content: ${r.content}
          ---`)
          .join('\n');

        if (!searchSnippets) {
          return new Response(
            JSON.stringify({
              company: company,
              website: website || "",
              people: [],
              error: "No search results found",
              state: this.state,
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const PeopleSchema = z.object({
          company: z.string().describe("The official company name"),
          website: z.union([z.string().url(), z.literal("")]).describe("The official company website URL (extract from search results if not provided, or empty string if not found)"),
          people: z.array(
            z.object({
              name: z.string().describe("Full legal name (first and last name)"),
              role: z.string().describe("Exact job title/role at the company")
            })
          ).max(3).describe("Array of up to 3 high-ranking individuals")
        });

        const extractionPrompt = `You are an expert data extraction assistant. Your task is to extract exactly 3 high-ranking individuals from the following search results.
        ### Instructions
        1. **Priority:** Find in this order: founders, CEOs, C-suite, VPs.
        2. **Quantity:** Return a minimum of 3 people.
        3. **Focus:** Find current, active leadership.
        4. **Use searchWeb tool if needed:** If the search results below don't contain enough information to find 3 high-ranking individuals, use the searchWeb tool to search for more specific information (e.g., "${company} leadership team", "${company} executives", "${company} founders").
        5. **Failure:** If you cannot find relevant people after using searchWeb if needed, the "people" array must be empty (e.g., "people": []).

        ${notes ? `Additional context: ${notes}` : ''}

        ### Initial Search Results:
        """
        ${searchSnippets}
        """
        `;

        const searchWebWithEnv = tool({
          description: "Search the web for information. Use this to find people, companies, or any other information online.",
          inputSchema: z.object({
            query: z.string().describe("The search query to find information on the web")
          }),
          execute: async ({ query }) => {
            return await tools.searchWeb.execute({ query }, { env: this.env } as any);
          }
        });

        const extractionTools = { searchWeb: searchWebWithEnv };

        // @ts-expect-error - openai function accepts apiKey option, same pattern used in prospector/emailfinder
        const model = openai("gpt-4o-mini", {
          apiKey: this.env.OPENAI_API_KEY,
        });

        const extractionPromptWithSchema = `${extractionPrompt}
        IMPORTANT: You must return ONLY valid JSON that matches this exact schema:
        {
          "company": "string",
          "website": "string (URL or empty string)",
          "people": [
            {
              "name": "string",
              "role": "string"
            }
          ]
        }

        Return ONLY the JSON object, no markdown, no code blocks, no explanations.`;

        const result = await generateText({
          model,
          tools: extractionTools,
          toolChoice: "auto",
          prompt: extractionPromptWithSchema,
          stopWhen: stepCountIs(10)
        });

        let cleanText = result.text.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanText = jsonMatch[0];
        }

        let extractedData;
        try {
          const parsed = JSON.parse(cleanText);
          extractedData = PeopleSchema.parse(parsed);
        } catch (e) {
          console.error("Failed to parse or validate JSON:", e);
          console.error("Raw text response:", result.text);
          throw new Error(`Failed to extract structured data: ${e instanceof Error ? e.message : String(e)}`);
        }

        const people = {
          company: extractedData.company,
          website: extractedData.website || website || "",
          people: extractedData.people
        };

        return new Response(
          JSON.stringify({
            ...people,
            state: this.state,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );

      } catch (error) {
        console.error("Search tool error:", error);
        return new Response(
          JSON.stringify({
            company: company,
            website: website || "",
            people: [],
            error: "Failed to complete research",
            errorMessage: error instanceof Error ? error.message : String(error),
            state: this.state,
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
  }

  async checkPeopleInDB(companyName: string) {
    try {
      const results = await this.env.DB.prepare(`
        SELECT DISTINCT company_name, website, employee_name, employee_title 
        FROM companies 
        WHERE LOWER(company_name) = LOWER(?)
      `).bind(companyName).all<{
        company_name: string;
        website: string | null;
        employee_name: string;
        employee_title: string;
      }>();
      
      if (!results.results || results.results.length === 0) {
        return null;
      }
      
      return {
        company: results.results[0].company_name,
        website: normalizeUrl(results.results[0].website) || "",
        people: results.results.map(row => ({
          name: row.employee_name,
          role: row.employee_title || ""
        }))
      };
    } catch (error) {
      console.error("Error checking people in DB:", error);
      return null;
    }
  }

}

export default PeopleFinder;
