import { Agent } from "agents";
import { openai } from "@ai-sdk/openai"
import { generateText, stepCountIs } from "ai";
import { tools } from "../tools";

class Prospects extends Agent {
  async onStart() {
    console.log('Agent started with state:', this.state);
  }

  async onBeforeTool({ name, args }) {
    console.log("[TOOL_CALL]", name, args);
  }

  async onAfterTool({ name, result }) {
    console.log("[TOOL_RESULT]", name, result);
  }

  async onRequest(_request: Request): Promise<Response> {
      const body = await _request.json() as { summary?: string; preferences?: string; location?: string };
      const summary = body.summary || "";
      const preferences = body.preferences || "";
      const location = body.location || "";

      // @ts-expect-error - openai function accepts apiKey option, same pattern used in prospector/emailfinder
      const model = openai("gpt-4o-2024-11-20", {
        apiKey: this.env.OPENAI_API_KEY,
      });

      const result = await generateText({
          model,
          tools, 
          prompt: 
          `You are given a short professional summary (100–200 words) describing the user’s background, interests, and skills.

          Your task:

          1. Understand the candidate.
            - Infer their core skills, tech stack, likely roles, preferred environments, and target industries.
            - Use reasonable inference if something is not explicitly stated.
            - If a location is provided, factor it into industries/companies.

          2. Use the searchWeb tool (up to 5 times) to find real companies that strongly match the candidate’s inferred profile AND their stated preferences.
            - Prefer startups and growth-stage companies.
            - You may use additional tool calls to find each company’s correct official domain.
            - Prioritize the user’s stated preferences above everything else.

          3. Return exactly 10 companies in JSON format only, with this schema:

          {
            "companies": [
              {
                "company": "Company Name",
                "summary": "One-sentence factual summary in plain language.",
                "reason": "One brief sentence explaining why this company matches the candidate.",
                "company_website": "official domain only"
              }
            ]
          }

          Rules:
          - EXACTLY 10 companies.
          - No markdown. No commentary. No code fences. Output only the JSON object.
          - Keep sentences short, clear, and factual.
          - No extra keys or formatting.
          - Do not return an empty result; always summarize and use tool data before responding.

          Inputs:
          <user_summary>${summary}</user_summary>
          <user_preferences>${preferences}</user_preferences>
          ${location ? `<location>${location}</location>` : ''}`,          
          toolChoice: "auto",
          stopWhen: stepCountIs(10)
      });

    let companies;
    try {
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
        
        console.log("Cleaned text for parsing:", cleanText);
        companies = JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse JSON:", e);
        console.error("Raw text response:", result.text);
        companies = { 
            companies: [], 
            error: "Failed to parse response", 
            rawText: result.text,
            parseError: e instanceof Error ? e.message : String(e)
        };
    }

    return new Response(
      JSON.stringify({
        ...companies,
        state: this.state,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  
}

export default Prospects;
