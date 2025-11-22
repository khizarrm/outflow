import { Agent } from "agents";
import { openai } from "@ai-sdk/openai"
import { generateText, stepCountIs } from "ai";
import { tools } from "../tools";
import { verifyEmail, normalizeUrl } from "../lib/utils";
import type { CloudflareBindings } from "../env.d";

class EmailFinder extends Agent<CloudflareBindings> {
  async onStart() {
    console.log('Agent started with state:', this.state);
  }

  async onRequest(_request: Request): Promise<Response> {
      const body = await _request.json() as { 
        firstName?: string; 
        lastName?: string; 
        company?: string; 
        domain?: string;
        company_name?: string;
        website?: string;
        role?: string;
      };
      const firstName = body.firstName || "";
      const lastName = body.lastName || "";
      const company = body.company || "";
      const domain = body.domain || "";
      const companyName = body.company_name || company || "";
      const role = body.role || "";
      const employeeName = `${firstName} ${lastName}`.trim();

      // Check if emails exist in DB first (case-insensitive by name only)
      if (employeeName && employeeName !== "Unknown") {
        const existingEmails = await this.checkEmailsInDB(employeeName);
        if (existingEmails) {
          console.log(`Found existing emails in DB for ${employeeName}`);
          return new Response(
            JSON.stringify({
              ...existingEmails,
              state: this.state,
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
      
      // @ts-expect-error - openai function accepts apiKey option, same pattern used in prospector/emailfinder
      const model = openai("gpt-4o-mini", {
        apiKey: this.env.OPENAI_API_KEY,
      });

      const result = await generateText({
          model,
          tools,
          prompt: `You are a professional email finder for executives.
Your goal: discover **likely real** email addresses for ${firstName} ${lastName} (${company}) using open-web intelligence.

1️⃣ Run 5–10 searches with searchWeb to collect clues (GitHub, press releases, Personal websites, LinkedIn, Crunchbase, RocketReach, etc.).
2️⃣ Extract only email addresses with the same domain (${domain}) or verified patterns.
3️⃣ Derive possible patterns if nothing direct shows up.

Common formats:
- {first}@{domain}
- {first}.{last}@{domain}
- {f}{last}@{domain}
- {first}{last}@{domain}
- role emails (ceo@, founders@, contact@)

4️⃣ Return ONLY valid JSON (no markdown, no explanations):

{
  "emails": [
    "person@domain.com"
  ],
  "employee_title": "CEO"
}

CRITICAL RULES:
- Return ONLY the JSON object above, nothing else - no markdown, no code blocks, no explanations
- Exclude emails which are omitted by marks such as 'o****@gmail.com'
- No markdown code blocks (\`\`\`json\`\`\`) - just raw JSON
- **MUST discover and fill in employee_title from your research:**
  - employee_title: Find the person's actual job title/role (e.g., "CEO", "Founder", "CTO", "VP of Engineering", not empty string)
  - Use **searchWeb** tool to find LinkedIn profiles, company pages, press releases, etc. to discover the title
- Prioritize results from credible domains
- Minimum 3, max 8 email results
- Use **searchWeb** tool multiple times if needed
- If no credible sources found, return 3 educated guesses based on common patterns
- Ensure the JSON is valid and parseable
- Both fields are required: emails (array) and employee_title (string)

Don't stop after using the tools, make sure to return some emails no matter what
`,
          toolChoice: "auto",
          temperature: 0,
          stopWhen: stepCountIs(10)
      });
    
    console.log("result text: ", result)

    let emailResult;
    try {
        if (!result.text || result.text.trim().length === 0) {
            throw new Error("Empty response from AI model");
        }

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

        if (!cleanText || cleanText.trim().length === 0) {
            throw new Error("No valid JSON found in response");
        }

        console.log("Cleaned text for parsing:", cleanText);
        emailResult = JSON.parse(cleanText);

        if (!emailResult.emails || !Array.isArray(emailResult.emails)) {
            throw new Error("Invalid JSON structure: missing emails array");
        }

    } catch (e) {
        console.error("Failed to parse JSON:", e);
        console.error("Raw text response:", result.text);
        emailResult = {
            emails: [],
            employee_title: "",
            error: e instanceof Error ? e.message : String(e),
            rawText: result.text
        };
    }

    let verifiedEmails: string[] = [];
    if (emailResult.emails && emailResult.emails.length > 0) {
        console.log("Verifying emails:", emailResult.emails);
        const verificationPromises = emailResult.emails.map(async (email: string) => {
            try {
                const status = await verifyEmail(email, this.env);
                console.log(`Email ${email} verification status: ${status}`);
                return (status === "valid") ? email : null;
            } catch (error) {
                console.error(`Failed to verify ${email}:`, error);
                return null;
            }
        });

        const results = await Promise.all(verificationPromises);
        verifiedEmails = results.filter((email): email is string => email !== null);
    }

    // Save to DB if we have verified emails
    if (verifiedEmails.length > 0) {
      try {
        // Use LLM-discovered employee_title if available, otherwise fall back to input
        const discoveredTitle = emailResult.employee_title && emailResult.employee_title.trim() !== "" 
          ? emailResult.employee_title.trim() 
          : (role && role.trim() !== "" ? role.trim() : "");
        
        // Ensure we use null instead of empty strings for nullable fields
        // And ensure required fields are not empty
        const websiteValue = domain && domain.trim() !== "" ? domain : null;
        const companyNameValue = companyName && companyName.trim() !== "" ? companyName : "Unknown";
        const employeeNameValue = employeeName && employeeName.trim() !== "" ? employeeName : "Unknown";
        
        // Check if a record exists for this employee name (case-insensitive)
        const existing = await this.env.DB.prepare(`
          SELECT id, email FROM companies WHERE LOWER(employee_name) = LOWER(?)
        `).bind(employeeNameValue).first<{ id: string; email: string }>();
        
        if (existing) {
          // Parse existing emails array and merge with new emails
          let existingEmails: string[] = [];
          try {
            existingEmails = JSON.parse(existing.email);
            if (!Array.isArray(existingEmails)) {
              // If it's not an array, treat it as a single email
              existingEmails = [existing.email];
            }
          } catch {
            // If parsing fails, treat it as a single email
            existingEmails = [existing.email];
          }
          
          // Merge emails, removing duplicates
          const mergedEmails = [...new Set([...existingEmails, ...verifiedEmails])];
          const emailsJson = JSON.stringify(mergedEmails);
          
          // Update existing record with merged emails
          await this.env.DB.prepare(`
            UPDATE companies 
            SET company_name = ?, website = ?, employee_name = ?, employee_title = ?, email = ?
            WHERE id = ?
          `).bind(
            companyNameValue,
            websiteValue,
            employeeNameValue,
            discoveredTitle,
            emailsJson,
            existing.id
          ).run();
          
          console.log(`Updated record for ${employeeNameValue} with ${mergedEmails.length} email(s)`);
        } else {
          // Insert new record with emails as JSON array
          const emailsJson = JSON.stringify(verifiedEmails);
          await this.env.DB.prepare(`
            INSERT INTO companies (company_name, website, employee_name, employee_title, email)
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            companyNameValue,
            websiteValue,
            employeeNameValue,
            discoveredTitle,
            emailsJson
          ).run();
          
          console.log(`Created new record for ${employeeNameValue} with ${verifiedEmails.length} email(s)`);
        }
      } catch (dbError) {
        console.error("Error saving to companies DB:", dbError);
        // Don't fail the request if DB save fails
      }
    }

    // Use LLM-discovered employee_title if available, otherwise fall back to input
    const finalEmployeeTitle = emailResult.employee_title && emailResult.employee_title.trim() !== "" 
      ? emailResult.employee_title.trim() 
      : (role && role.trim() !== "" ? role.trim() : "");

    // Limit to max 3 emails
    const limitedEmails = verifiedEmails.slice(0, 3);

    const finalResult = limitedEmails.length > 0
        ? {
            emails: limitedEmails,
            company_name: companyName,
            website: domain,
            employee_name: employeeName,
            employee_title: finalEmployeeTitle,
            verification_summary: `${limitedEmails.length} out of ${emailResult.emails.length} emails verified`
          }
        : {
            emails: [],
            company_name: companyName,
            website: domain,
            employee_name: employeeName,
            employee_title: finalEmployeeTitle,
            verification_summary: `0 out of ${emailResult.emails?.length || 0} emails verified`
          };

    return new Response(
      JSON.stringify({
        ...finalResult,
        state: this.state,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Helper function to check emails in DB by name only (case-insensitive)
  async checkEmailsInDB(employeeName: string) {
    try {
      const result = await this.env.DB.prepare(`
        SELECT email, employee_title, company_name, website 
        FROM companies 
        WHERE LOWER(employee_name) = LOWER(?)
        LIMIT 1
      `).bind(employeeName).first<{
        email: string;
        employee_title: string;
        company_name: string;
        website: string | null;
      }>();
      
      if (!result) {
        return null;
      }
      
      // Parse email JSON array
      let emails: string[] = [];
      try {
        emails = JSON.parse(result.email);
        if (!Array.isArray(emails)) {
          emails = [result.email];
        }
      } catch {
        emails = [result.email];
      }
      
      // Limit to max 3 emails
      emails = emails.slice(0, 3);
      
      // Format to match EmailFinder response
      return {
        emails,
        company_name: result.company_name,
        website: normalizeUrl(result.website) || "",
        employee_name: employeeName,
        employee_title: result.employee_title || "",
        verification_summary: `${emails.length} out of ${emails.length} emails verified`
      };
    } catch (error) {
      console.error("Error checking emails in DB:", error);
      return null;
    }
  }

}

export default EmailFinder;
