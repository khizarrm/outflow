import { tool } from "ai";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import Exa from "exa-js";
import { verifyEmail } from "../lib/utils";

const EmailExtractionSchema = z.object({
  emails: z.array(z.string().email()).describe("List of potential email addresses found or derived"),
  employee_title: z.string().describe("The person's likely job title (e.g. CEO, Founder)")
});

export const emailFinder = tool({
  description: "Finds verified emails and job titles for a specific person at a company.",
  
  inputSchema: z.object({
    name: z.string().describe("Full name of the person (e.g. 'Tobi Lütke')"),
    domain: z.string().describe("Company domain (e.g. 'shopify.com')"),
    company: z.string().optional().describe("Company name (e.g. 'Shopify')")
  }),

  execute: async ({ name, domain, company }, options) => {
    console.log("calling email finder tool")
    const env = ((options as any)?.env ?? process.env) as any;
    
    if (!env.EXA_API_KEY || !env.OPENAI_API_KEY) {
      throw new Error("Missing API keys for emailFinder tool");
    }
    const exa = new Exa(env.EXA_API_KEY);
    const queries = [
      `${name} ${company || domain} email address contact info`,
      `${name} ${company || domain} linkedin profile`,
      `${name} ${company || domain} rocketreach` 
    ];
    let searchContext = "";
    
    try {
      const searchResults = await Promise.all(
        queries.map(q => 
          exa.searchAndContents(q, {
            type: "fast",
            useAutoprompt: false,
            numResults: 2, 
            text: { maxCharacters: 1000 }
          }).catch(e => ({ results: [] }))
        )
      );
      searchContext = searchResults
        .flatMap(r => r.results || [])
        .map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.text}`)
        .join("\n---\n");
    } catch (err) {
      console.error("Exa search failed:", err);
    }
    // 2. INTELLIGENT EXTRACTION
    let extractedData = { emails: [], employee_title: "Unknown" };
    try {
      const { object } = await generateObject({
        // @ts-expect-error - openai function accepts apiKey option, same pattern used in prospector/emailfinder
        model: openai("gpt-4o-mini", { apiKey: env.OPENAI_API_KEY }),
        schema: EmailExtractionSchema,
        prompt: `
          Task: Find the email address and job title for **${name}** at **${domain}**.

          Context from Web Search (LinkedIn, RocketReach, Official Site):

          ${searchContext}

          Instructions:

          1. Look for direct email mentions in the context (especially from RocketReach snippets).

          2. If no direct email is found, generate 3 "best guess" permutations based on the domain @${domain}.
             - Common patterns: first.last@, first@, f.last@, first_last@

          3. Extract their likely Job Title from the context.

          Return strictly JSON.

        `,
      });
      
      extractedData = object as any;
    } catch (error) {
      console.error("LLM extraction failed:", error);
      // Fail gracefully
      return { emails: [], employee_title: "", verification_summary: "Extraction failed" };
    }
    // 3. VERIFICATION
    const uniqueEmails = [...new Set(extractedData.emails)]; 
    const verifiedEmails: string[] = [];
    if (uniqueEmails.length > 0) {
      console.log(`Verifying ${uniqueEmails.length} candidates for ${name}...`);
      
      const checks = await Promise.all(
        uniqueEmails.map(async (email) => {
          try {
            const status = await verifyEmail(email, env);
            return status === "valid" ? email : null;
          } catch { 
            return null; 
          }
        })
      );
      verifiedEmails.push(...checks.filter((e): e is string => e !== null));
    }
    // 4. FINAL OUTPUT
    return {
      name,
      company: company || "Unknown",
      domain,
      employee_title: extractedData.employee_title,
      emails: verifiedEmails.slice(0, 3),
      verification_summary: `${verifiedEmails.length} valid out of ${uniqueEmails.length} candidates`
    };
  }
});

