import { Agent } from "agents";
import { openai } from "@ai-sdk/openai";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { getAgentByName } from "agents";
import { searchWeb, peopleFinder, emailFinder } from "../tools"; 
import { extractDomain } from "../lib/utils";
import type { CloudflareBindings } from "../env.d";
import { upsertCompany, upsertEmployee } from "../db/companies";

class Orchestrator extends Agent<CloudflareBindings> {
  async onStart() {
    console.log('orchestrator agent started');
  }

  async onRequest(_request: Request): Promise<Response> {
    const body = await _request.json() as { query?: string };
    const query = body.query || "";

    if (!query) {
      return new Response(
        JSON.stringify({ error: "query is required" }),
        { 
          status: 400,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const model = openai("gpt-4o-2024-11-20");

    const tools = { 
      peopleFinder,
      emailFinder,
      searchWeb
    };

    const result = await generateText({
      model,
      tools,
      prompt: `You are an external lead enrichment agent.

      # Tools Available:
      1. searchWeb: Finds company metadata (Revenue, HQ, Domain).
      2. peopleFinder: Finds specific names/roles of leaders.
      3. emailFinder: Finds emails given Name + Domain.

      # Process:
      1. Analyze Request: Identify Company Name.
      2. Company Data: Call 'searchWeb' to find domain, revenue, HQ, etc.
      3. People Data: Call 'peopleFinder' with the company name.
      4. Email Data: Call 'emailFinder' for the people returned in step 3.
      5. Final Output: Return the comprehensive JSON.

      # Output Schema:
      {
        "company": "Company Name",
        "website": "https://company.com",
        "description": "Brief description from web",
        "techStack": "e.g. React, AWS (if found)",
        "industry": "Industry name",
        "yearFounded": 2020,
        "headquarters": "City, State, Country",
        "revenue": "e.g. $10M ARR (if found)",
        "funding": "e.g. Series A (if found)",
        "employeeCountMin": 10,
        "employeeCountMax": 50,
        "people": [
          {
            "name": "Full Name",
            "role": "Job Title",
            "emails": ["email1@domain.com"]
          }
        ]
      }

      # Rules:
      - Use 'searchWeb' aggressively to fill metadata fields (Revenue, Funding, HQ).
      - If exact numbers (revenue/funding) are not public, leave those specific fields null.
      - Only include people with at least one verified email.
      - Return raw JSON only.

      User query: ${query}`,
      toolChoice: "auto",
      stopWhen: stepCountIs(15)
    });

    let finalResult;
    try {
      let cleanText = result.text.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      else if (cleanText.startsWith('```')) cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');

      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanText = jsonMatch[0];

      finalResult = JSON.parse(cleanText);
      
      if (finalResult.people && Array.isArray(finalResult.people)) {
        finalResult.people = finalResult.people.filter((person: any) => 
          person.emails && Array.isArray(person.emails) && person.emails.length > 0
        );
      }
      
      if (!finalResult.people?.length) {
        return new Response(JSON.stringify({ message: "no emails found", state: this.state }), {
            headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const companyName = finalResult.company || "";
        const website = finalResult.website || null;
        
        console.log('[Orchestrator] Saving company:', {
          companyName,
          website,
          hasDescription: !!finalResult.description,
          hasTechStack: !!finalResult.techStack,
          hasIndustry: !!finalResult.industry,
          hasEmployeeCount: !!(finalResult.employeeCountMin || finalResult.employee_count_min),
          finalResultKeys: Object.keys(finalResult)
        });
        
        if (companyName && companyName.trim() !== "") {
          const companyData = {
            description: finalResult.description || null,
            techStack: finalResult.techStack || finalResult.tech_stack || null,
            industry: finalResult.industry || null,
            yearFounded: finalResult.yearFounded || finalResult.year_founded ? parseInt(String(finalResult.yearFounded || finalResult.year_founded)) : null,
            headquarters: finalResult.headquarters || null,
            revenue: finalResult.revenue || null,
            funding: finalResult.funding || null,
            employeeCountMin: finalResult.employeeCountMin || finalResult.employee_count_min ? parseInt(String(finalResult.employeeCountMin || finalResult.employee_count_min)) : null,
            employeeCountMax: finalResult.employeeCountMax || finalResult.employee_count_max ? parseInt(String(finalResult.employeeCountMax || finalResult.employee_count_max)) : null,
          };
          
          console.log('[Orchestrator] Extracted company data:', companyData);

          const companyId = await upsertCompany(this.env.DB, companyName, website, companyData);
          const employeeIds: number[] = [];
          
          for (const person of finalResult.people) {
            if (person.name && person.emails && person.emails.length > 0) {
              const email = person.emails[0]; 
              const role = person.role || null;
              const employeeId = await upsertEmployee(this.env.DB, companyId, person.name, role, email);
              employeeIds.push(employeeId);
            }
          }
        }
      } catch (dbError) {
        console.error("Error saving to database:", dbError);
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "parsing error" }), { status: 500 });
    }

    // favicon logic
    let favicon = null;
    if (finalResult.website) {
      const domain = extractDomain(finalResult.website);
      if (domain) favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    }

    return new Response(
      JSON.stringify({ ...finalResult, favicon, state: this.state }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

export default Orchestrator;