import { Agent } from "agents";
import { VectorizeHandler } from "../lib/vectorize";
import type { CloudflareBindings } from "../env.d";

class FinderV2 extends Agent<CloudflareBindings> {
  async onStart() {
    console.log('Finder agent started');
  }

  async onRequest(_request: Request): Promise<Response> {
    const body = await _request.json() as { query?: string; type?: 'companies' | 'employees' | 'both' };
    const query = body.query || "";
    const type = body.type || 'both';

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    try {
      const handler = new VectorizeHandler(this.env);
      const result = await handler.search(query, { 
        type, 
        limit: 5 
      });

      if (!result.success) {
        return new Response(
          JSON.stringify({ 
            company: "",
            people: [],
            state: this.state,
            error: result.error || "Search failed"
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      const companies = result.results.companies || [];
      const employees = result.results.employees || [];

      // Check if any result has score > 0.7
      const hasHighScore = 
        companies.some((c: any) => c.score > 0.7) || 
        employees.some((e: any) => e.score > 0.7);

      if (hasHighScore) {
        // Get the highest scoring company
        const topCompany = companies.length > 0 
          ? companies.reduce((prev: any, curr: any) => 
              (curr.score > prev.score ? curr : prev), companies[0])
          : null;

        // Get company name from top company or from employees
        const companyName = topCompany?.company_name || 
          (employees.length > 0 ? employees[0]?.company_name : "");

        // Filter and format employees with score > 0.7
        const highScoreEmployees = employees
          .filter((e: any) => e.score > 0.7)
          .map((e: any) => ({
            name: e.employee_name || "",
            role: e.employee_title || "",
            emails: e.email ? [e.email] : []
          }));

        return new Response(
          JSON.stringify({
            company: companyName,
            people: highScoreEmployees,
            state: this.state,
            error: ""
          }),
          {
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // If no high scores, return original format
      return new Response(
        JSON.stringify({
          query: result.query,
          type: result.type,
          companies: companies,
          employees: employees
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      console.error("Finder agent error:", error);
      return new Response(
        JSON.stringify({ 
          company: "",
          people: [],
          state: this.state,
          error: `Failed to complete search. ${error instanceof Error ? error.message : String(error)}`
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
}

export default FinderV2;