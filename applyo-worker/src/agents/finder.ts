import { Agent } from "agents";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { vectorizeSearch } from "../lib/tools";
import type { CloudflareBindings } from "../env.d";

class FinderV2 extends Agent<CloudflareBindings> {
  async onStart() {
    console.log('Researcher agent started');
  }

  async onRequest(_request: Request): Promise<Response> {
    const body = await _request.json() as { query?: string };
    const query = body.query || "";

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // @ts-expect-error - openai function accepts apiKey option
    const model = openai("gpt-4o", {
      apiKey: this.env.OPENAI_API_KEY,
    });

    const vectorizeSearchTool = tool({
      description: vectorizeSearch.description,
      inputSchema: vectorizeSearch.inputSchema,
      execute: async (params) => {
        return await vectorizeSearch.execute(params, { env: this.env } as any);
      }
    });

    const tools = { vectorizeSearch: vectorizeSearchTool };

    const prompt = `You are a smart research assistant that helps users find information about companies and employees. Users call to you with the intent to either find companies that align with their interests,
    or to find emails at specific companies. The goal is for the user to find these emails to reach out to for internship oppurtunities. 

**Phase 1: Analyze & Configure Search**
1. **Determine "type":**
   - "people at X", "emails for X", "employees" → use "type='employees'"
   - "companies like X", "startups in Y", "industry search" → use "type='companies'"
   - Specific company name (e.g., "Anthropic", "Artificial Societies") → use "type='both'" (to get profile + emails)
   - Ambiguous → use "type='both'"

2. **Determine "limit:**"
   - **ALWAYS use "limit: 5" to "10"**, even for single company queries.
   - *Reasoning:* Vector search is fuzzy. The exact match might be result #3. We must fetch a batch to ensure we catch it, then filter later.

**Phase 2: Strict Filtering (Internal Thought Process)**
- **For Specific Entity Queries (e.g., "Artificial Societies"):**
  - Scan the results. Is there an exact or near-exact name match?
  - **IF YES:** Discard all other results. ONLY report on that one company. Do not show "similar" companies unless the user asked for comparisons.
  - **IF NO:** Report that the specific company wasn't found, and offer the similar matches found as alternatives.
- **For Broad Queries (e.g., "AI companies"):**
  - Keep all relevant results.

**Phase 3: Synthesize Response (CRITICAL - YOU MUST DO THIS)**
After using the vectorizeSearch tool, you MUST generate a final markdown response that synthesizes your findings. Do not stop after calling the tool - you must provide a complete answer.

- **Company Info:** Name, one-sentence description, location, tech stack.
- **Emails/People:** consistently check "employees" array and list names + emails.
- **Format:** Clean, concise, conversational markdown. No formatting clutter.
- **IMPORTANT:** After using any tools, you MUST write a complete markdown response summarizing your findings. Never stop without providing a final answer.

User query: ${query}`;

    try {
      const result = await generateText({
        model,
        tools,
        prompt,
        toolChoice: "auto",
        stopWhen: stepCountIs(10)
      });

      // Validate that we got a text response
      if (!result.text || result.text.trim().length === 0) {
        console.error("Empty response from AI model. Finish reason:", result.finishReason);
        console.error("Result steps:", result.steps?.length);
        return new Response(
          "I apologize, but I wasn't able to generate a response. Please try again with a different query.",
          {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }

      return new Response(
        result.text,
        {
          headers: { "Content-Type": "text/markdown" },
        }
      );
    } catch (error) {
      console.error("Researcher agent error:", error);
      return new Response(
        `Error: Failed to complete research. ${error instanceof Error ? error.message : String(error)}`,
        {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }
      );
    }
  }
}

export default FinderV2;