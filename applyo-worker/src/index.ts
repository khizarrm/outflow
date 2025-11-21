import { fromHono } from "chanfana";
import { OpenAPIRoute } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import type { CloudflareBindings } from "./env.d";
import Prospects from "./agents/prospector";
import PeopleFinder from "./agents/peoplefinder";
import EmailFinder from "./agents/emailfinder";
import Orchestrator from "./agents/orchestrator";
import { ProtectedEmailSendRoute } from "./endpoints/emailSend";
import { Agent, AgentNamespace, getAgentByName, routeAgentRequest } from 'agents';
import { z } from "zod";
import { ProtectedTemplatesCreateRoute, ProtectedTemplatesListRoute, ProtectedTemplatesDeleteRoute, ProtectedTemplatesUpdateRoute } from "./endpoints/templates";
import { VectorizePopulateCompaniesRoute, VectorizePopulateEmployeesRoute, VectorizeSearchRoute, VectorizeStatsRoute, VectorizeUpdateCompanyRoute } from "./endpoints/vectorize";


interface Env {
  Prospects: AgentNamespace<Prospects>;
  PeopleFinder: AgentNamespace<PeopleFinder>;
  EmailFinder: AgentNamespace<EmailFinder>;
  Orchestrator: AgentNamespace<Orchestrator>;
}

type Variables = {
    auth: ReturnType<typeof createAuth>;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// Global CORS configuration for all routes
app.use(
    "*",
    cors({
        origin: (origin) => {
            const allowed = [
                "http://localhost:3000",
                "http://localhost:3001",
                "https://applyo-frontend.applyo.workers.dev",
                "https://outreach-umber.vercel.app"
            ];
            return allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin) ? origin : allowed[0];
        },
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    })
);

// Create OpenAPI instance
const openapi = fromHono(app, {
    docs_url: "/",
    schema: {
        info: {
            title: "Applyo API",
            version: "1.0.0",
            description: `A modern API with seamless cookie-based authentication.

**Quick Start:**
1. Login at [/dashboard](/dashboard) (click "Login Anonymously")
2. Come back here and test any endpoint
3. Your session is automatically handled - no tokens needed!

**Protected Endpoints:**
Protected endpoints are marked with a 🔒 badge and require you to be logged in. Public endpoints can be tested without authentication.`,
        },
    },
});

// Middleware to initialize auth instance for each request
app.use("*", async (c, next) => {
    const auth = createAuth(c.env, (c.req.raw as any).cf || {});
    c.set("auth", auth);
    await next();
});

// Handle all auth routes
app.all("/api/auth/*", async c => {
    const auth = c.get("auth");
    return auth.handler(c.req.raw);
});

// ============= DEMO API ROUTES =============

// Public Hello Route
class PublicHelloRoute extends OpenAPIRoute {
    schema = {
        tags: ["Public"],
        summary: "Public Hello Endpoint",
        description: "A public endpoint that doesn't require authentication",
        responses: {
            "200": {
                description: "Successful response",
                content: {
                    "application/json": {
                        schema: z.object({
                            message: z.string(),
                            timestamp: z.string(),
                            authenticated: z.boolean(),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: any) {
        return {
            message: "Hello! This is a public endpoint.",
            timestamp: new Date().toISOString(),
            authenticated: false,
        };
    }
}

// Public Info Route
class PublicInfoRoute extends OpenAPIRoute {
    schema = {
        tags: ["Public"],
        summary: "Server Information",
        description: "Get information about the API service",
        responses: {
            "200": {
                description: "Server information",
                content: {
                    "application/json": {
                        schema: z.object({
                            service: z.string(),
                            version: z.string(),
                            environment: z.string(),
                            features: z.array(z.string()),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: any) {
        return {
            service: "Applyo API",
            version: "1.0.0",
            environment: "cloudflare-workers",
            features: ["authentication", "rate-limiting", "geolocation"],
        };
    }
}

class ProspectorRoute extends OpenAPIRoute {
    schema = {
      tags: ["Agents"],
      summary: "Call Prospects Agent",
      description: "Proxy request to the Prospects Agent (Cloudflare Agent)",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                summary: z.string().describe("Professional summary describing the user's background, interests, and skills"),
                preferences: z.string().optional().describe("Additional work preferences and requirements"),
                location: z.string().optional().describe("Geographic location or region for contextualizing company search"),
              }),
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Agent response",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string().optional(),
                result: z.any().optional(),
              }),
            },
          },
        },
      },
    };

    async handle(c: any) {
      const env = c.env;

      const reqData = await this.getValidatedData<typeof this.schema>();
      const body = JSON.stringify(reqData.body);

      // manually call the agent
      const agent = await getAgentByName(env.Prospects, "main");
      const resp = await agent.fetch(
        new Request("http://internal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );

      return resp;
    }
  }

class PeopleFinderRoute extends OpenAPIRoute {
    schema = {
      tags: ["Agents"],
      summary: "Call PeopleFinder Agent",
      description: "Find high-ranking individuals at a company. The agent will search for founders, executives, and C-suite leaders.",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                company: z.string().min(1).describe("Company name to search for people"),
                website: z.string().optional().describe("Optional: Company website URL if already known"),
                notes: z.string().optional().describe("Optional: Additional context about the company to help with search"),
              }),
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Agent response with company name, website, and up to 3 high-ranking individuals",
          content: {
            "application/json": {
              schema: z.object({
                company: z.string(),
                website: z.string(),
                people: z.array(
                  z.object({
                    name: z.string(),
                    role: z.string(),
                  })
                ).optional(),
                state: z.any().optional(),
                error: z.string().optional(),
                rawText: z.string().optional(),
                parseError: z.string().optional(),
              }),
            },
          },
        },
        "400": {
          description: "Bad request - missing required company parameter",
          content: {
            "application/json": {
              schema: z.object({
                error: z.string(),
              }),
            },
          },
        },
      },
    };

    async handle(c: any) {
      const env = c.env;

      const reqData = await this.getValidatedData<typeof this.schema>();
      const body = JSON.stringify(reqData.body);

      // manually call the agent
      const agent = await getAgentByName(env.PeopleFinder, "main");
      const resp = await agent.fetch(
        new Request("http://internal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );

      return resp;
    }
  }

class EmailFinderRoute extends OpenAPIRoute {
    schema = {
      tags: ["Agents"],
      summary: "Call EmailFinder Agent",
      description: "Find likely professional email addresses for a person at a company using open-web intelligence",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                firstName: z.string().min(1).describe("Person's first name"),
                lastName: z.string().min(1).describe("Person's last name"),
                company: z.string().min(1).describe("Company name"),
                domain: z.string().min(1).describe("Company domain (e.g., shopify.com)"),
              }),
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Agent response with discovered email addresses",
          content: {
            "application/json": {
              schema: z.object({
                emails: z.array(z.string()).describe("List of discovered email addresses"),
                pattern_found: z.string().describe("Email pattern discovered (e.g., firstname.lastname)"),
                research_notes: z.string().describe("Summary of where clues came from"),
                state: z.any().optional(),
                error: z.string().optional(),
              }),
            },
          },
        },
      },
    };

    async handle(c: any) {
      const env = c.env;

      const reqData = await this.getValidatedData<typeof this.schema>();
      const body = JSON.stringify(reqData.body);

      // manually call the agent
      const agent = await getAgentByName(env.EmailFinder, "main");
      const resp = await agent.fetch(
        new Request("http://internal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );

      return resp;
    }
  }

class OrchestratorRoute extends OpenAPIRoute {
    schema = {
      tags: ["Agents"],
      summary: "Call Orchestrator Agent",
      description: "Find emails for people at a company. Takes a query like 'find founder emails at datacurve' or just 'datacurve'",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                query: z.string().min(1).describe("Query like 'find founder emails at datacurve' or just 'datacurve'"),
              }),
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Agent response with people and their emails",
          content: {
            "application/json": {
              schema: z.object({
                company: z.string().describe("Company name"),
                people: z.array(
                  z.object({
                    name: z.string().describe("Person's full name"),
                    role: z.string().describe("Job title"),
                    emails: z.array(z.string()).describe("List of email addresses"),
                  })
                ).describe("List of people with their emails"),
                state: z.any().optional(),
                error: z.string().optional(),
              }),
            },
          },
        },
      },
    };

    async handle(c: any) {
      const env = c.env;

      const reqData = await this.getValidatedData<typeof this.schema>();
      const body = JSON.stringify(reqData.body);

      // manually call the agent
      const agent = await getAgentByName(env.Orchestrator, "main");
      const resp = await agent.fetch(
        new Request("http://internal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      );

      return resp;
    }
  }

// Protected Profile Route
class ProtectedProfileRoute extends OpenAPIRoute {
    schema = {
        tags: ["Protected 🔒"],
        summary: "Get User Profile",
        description: "Get the authenticated user's profile information. Login at /dashboard first, then your session cookie will automatically authenticate you.",
        responses: {
            "200": {
                description: "User profile retrieved successfully",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            user: z.object({
                                id: z.string(),
                                email: z.string().nullable(),
                                name: z.string().nullable(),
                                createdAt: z.string(),
                            }),
                            session: z.object({
                                id: z.string(),
                                expiresAt: z.string(),
                            }),
                        }),
                    },
                },
            },
            "401": {
                description: "Unauthorized - No valid session",
                content: {
                    "application/json": {
                        schema: z.object({
                            error: z.string(),
                            message: z.string(),
                        }),
                    },
                },
            },
        },
    };

    async handle(c: any) {
        const auth = c.get("auth");

        try {
            const session = await auth.api.getSession({
                headers: c.req.raw.headers,
            });

            if (!session?.session || !session?.user) {
                return Response.json(
                    { error: "Unauthorized", message: "Please login first" },
                    { status: 401 }
                );
            }

            return {
                success: true,
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    createdAt: session.user.createdAt,
                },
                session: {
                    id: session.session.id,
                    expiresAt: session.session.expiresAt,
                },
            };
        } catch (error) {
            return Response.json(
                { error: "Internal server error", message: (error as Error).message },
                { status: 500 }
            );
        }
    }
}

// Protected Create Item Route
class ProtectedCreateItemRoute extends OpenAPIRoute {
    schema = {
        tags: ["Protected 🔒"],
        summary: "Create Item",
        description: "Create a new item (demo endpoint). Requires authentication via session cookie.",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: z.object({
                            name: z.string().min(1).describe("Item name"),
                            description: z.string().optional().describe("Item description"),
                            category: z.string().optional().describe("Item category"),
                        }),
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "Item created successfully",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string(),
                            item: z.object({
                                id: z.string(),
                                name: z.string(),
                                description: z.string().optional(),
                                category: z.string().optional(),
                                createdBy: z.string(),
                                createdAt: z.string(),
                            }),
                        }),
                    },
                },
            },
            "401": {
                description: "Unauthorized - No valid session",
            },
        },
    };

    async handle(c: any) {
        const auth = c.get("auth");
        const data = await this.getValidatedData<typeof this.schema>();

        try {
            const session = await auth.api.getSession({
                headers: c.req.raw.headers,
            });

            if (!session?.session || !session?.user) {
                return Response.json(
                    { error: "Unauthorized", message: "Please login first" },
                    { status: 401 }
                );
            }

            const body = data.body;

            return {
                success: true,
                message: "Item created successfully",
                item: {
                    id: crypto.randomUUID(),
                    ...body,
                    createdBy: session.user.id,
                    createdAt: new Date().toISOString(),
                },
            };
        } catch (error) {
            return Response.json(
                { error: "Internal server error", message: (error as Error).message },
                { status: 500 }
            );
        }
    }
}

// Protected List Items Route
class ProtectedListItemsRoute extends OpenAPIRoute {
    schema = {
        tags: ["Protected 🔒"],
        summary: "List User Items",
        description: "Get all items created by the authenticated user. Requires authentication via session cookie.",
        responses: {
            "200": {
                description: "Items retrieved successfully",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            items: z.array(
                                z.object({
                                    id: z.string(),
                                    name: z.string(),
                                    description: z.string(),
                                    createdBy: z.string(),
                                    createdAt: z.string(),
                                })
                            ),
                            total: z.number(),
                        }),
                    },
                },
            },
            "401": {
                description: "Unauthorized - No valid session",
            },
        },
    };

    async handle(c: any) {
        const auth = c.get("auth");

        try {
            const session = await auth.api.getSession({
                headers: c.req.raw.headers,
            });

            if (!session?.session || !session?.user) {
                return Response.json(
                    { error: "Unauthorized", message: "Please login first" },
                    { status: 401 }
                );
            }

            return {
                success: true,
                items: [
                    {
                        id: "1",
                        name: "Sample Item 1",
                        description: "This is a demo item",
                        createdBy: session.user.id,
                        createdAt: new Date().toISOString(),
                    },
                    {
                        id: "2",
                        name: "Sample Item 2",
                        description: "Another demo item",
                        createdBy: session.user.id,
                        createdAt: new Date().toISOString(),
                    },
                ],
                total: 2,
            };
        } catch (error) {
            return Response.json(
                { error: "Internal server error", message: (error as Error).message },
                { status: 500 }
            );
        }
    }
}

// Protected Delete Item Route
class ProtectedDeleteItemRoute extends OpenAPIRoute {
    schema = {
        tags: ["Protected 🔒"],
        summary: "Delete Item",
        description: "Delete an item by ID. Requires authentication via session cookie.",
        request: {
            params: z.object({
                id: z.string().describe("Item ID to delete"),
            }),
        },
        responses: {
            "200": {
                description: "Item deleted successfully",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string(),
                            deletedBy: z.string(),
                        }),
                    },
                },
            },
            "401": {
                description: "Unauthorized - No valid session",
            },
        },
    };

    async handle(c: any) {
        const auth = c.get("auth");
        const data = await this.getValidatedData<typeof this.schema>();

        try {
            const session = await auth.api.getSession({
                headers: c.req.raw.headers,
            });

            if (!session?.session || !session?.user) {
                return Response.json(
                    { error: "Unauthorized", message: "Please login first" },
                    { status: 401 }
                );
            }

            const id = data.params.id;

            return {
                success: true,
                message: `Item ${id} deleted successfully`,
                deletedBy: session.user.id,
            };
        } catch (error) {
            return Response.json(
                { error: "Internal server error", message: (error as Error).message },
                { status: 500 }
            );
        }
    }
}

// Register routes
openapi.get("/api/public/hello", PublicHelloRoute);
openapi.get("/api/public/info", PublicInfoRoute);
openapi.get("/api/protected/profile", ProtectedProfileRoute);
openapi.post("/api/protected/items", ProtectedCreateItemRoute);
openapi.get("/api/protected/items", ProtectedListItemsRoute);
openapi.delete("/api/protected/items/:id", ProtectedDeleteItemRoute);
openapi.post("/api/agents/prospects", ProspectorRoute);
openapi.post("/api/agents/peoplefinder", PeopleFinderRoute);
openapi.post("/api/agents/emailfinder", EmailFinderRoute);
openapi.post("/api/agents/orchestrator", OrchestratorRoute);
openapi.post("/api/protected/email/send", ProtectedEmailSendRoute);
openapi.post("/api/protected/templates", ProtectedTemplatesCreateRoute);
openapi.get("/api/protected/templates", ProtectedTemplatesListRoute);
openapi.delete("/api/protected/templates/:id", ProtectedTemplatesDeleteRoute);
openapi.put("/api/protected/templates/:id", ProtectedTemplatesUpdateRoute);

// Vectorize Routes
openapi.post("/api/vectorize/populate-companies", VectorizePopulateCompaniesRoute);
openapi.post("/api/vectorize/populate-employees", VectorizePopulateEmployeesRoute);
openapi.get("/api/vectorize/search", VectorizeSearchRoute);
openapi.get("/api/vectorize/stats", VectorizeStatsRoute);
openapi.post("/api/vectorize/update-company/:id", VectorizeUpdateCompanyRoute);


// ============= END DEMO API ROUTES =============

// Middleware to inject authentication status banner into Swagger UI
app.use("/*", async (c, next) => {
    await next();
    
    // Only modify HTML responses for the docs page
    if (c.req.path === "/" && c.res.headers.get("content-type")?.includes("text/html")) {
        const originalHTML = await c.res.text();
        
        // Inject custom authentication status banner
        const customHTML = originalHTML.replace(
            '<div id="swagger-ui"></div>',
            `
            <div id="auth-status-banner" style="display: none; position: sticky; top: 0; z-index: 9999; padding: 16px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); backdrop-filter: blur(10px);">
                <div style="max-width: 1460px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                            ✅
                        </div>
                        <div>
                            <strong style="font-size: 1.125rem; display: block; margin-bottom: 4px;">You're Authenticated!</strong>
                            <p style="margin: 0; font-size: 0.875rem; opacity: 0.95;">Session active • All endpoints unlocked • No tokens needed</p>
                        </div>
                    </div>
                    <a href="/dashboard" style="background: rgba(255,255,255,0.25); color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.875rem; border: 1px solid rgba(255,255,255,0.3); transition: all 0.2s; backdrop-filter: blur(4px); box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        Dashboard →
                    </a>
                </div>
            </div>
            <div id="not-auth-banner" style="display: none; position: sticky; top: 0; z-index: 9999; padding: 16px 24px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); backdrop-filter: blur(10px);">
                <div style="max-width: 1460px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                            🚀
                        </div>
                        <div>
                            <strong style="font-size: 1.125rem; display: block; margin-bottom: 4px;">Ready to Get Started?</strong>
                            <p style="margin: 0; font-size: 0.875rem; opacity: 0.95;">Login to unlock protected endpoints • Public endpoints work without auth</p>
                        </div>
                    </div>
                    <a href="/dashboard" style="background: white; color: #2563eb; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.875rem; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        Login Now →
                    </a>
                </div>
            </div>
            <div id="swagger-ui"></div>
            
            <!-- Floating Dashboard Button -->
            <a href="/dashboard" id="dashboard-btn" style="position: fixed; bottom: 32px; right: 32px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 24px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 0.9rem; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4); z-index: 9998; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease; border: 2px solid rgba(255,255,255,0.2);">
                <span style="font-size: 1.2rem;">🎯</span>
                <span id="dashboard-btn-text">Login</span>
            </a>
            
            <style>
                #dashboard-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 32px rgba(59, 130, 246, 0.5);
                }
                
                #dashboard-btn.authenticated {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
                }
                
                #dashboard-btn.authenticated:hover {
                    box-shadow: 0 12px 32px rgba(16, 185, 129, 0.5);
                }
            </style>
            
            <script>
                // Check authentication status on page load
                (async function checkAuth() {
                    try {
                        const response = await fetch('/api/auth/get-session', { credentials: 'include' });
                        if (response.ok) {
                            const data = await response.json();
                            if (data?.session) {
                                document.getElementById('auth-status-banner').style.display = 'block';
                                // Update dashboard button
                                const btn = document.getElementById('dashboard-btn');
                                const btnText = document.getElementById('dashboard-btn-text');
                                btn.classList.add('authenticated');
                                btnText.textContent = 'Dashboard';
                            } else {
                                document.getElementById('not-auth-banner').style.display = 'block';
                            }
                        } else {
                            document.getElementById('not-auth-banner').style.display = 'block';
                        }
                    } catch (error) {
                        document.getElementById('not-auth-banner').style.display = 'block';
                    }
                })();
            </script>
            `
        );
        
        return c.html(customHTML);
    }
});

// Dashboard page with anonymous login
app.get("/dashboard", async c => {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard - Better Auth Cloudflare (Hono)</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin: 20px 0; }
        .header { text-align: center; margin-bottom: 24px; }
        .title { font-size: 2rem; font-weight: bold; margin: 0; }
        .subtitle { color: #6b7280; font-size: 0.875rem; margin: 8px 0 0 0; }
        .content { space-y: 16px; }
        .info-row { margin: 12px 0; }
        .info-row strong { display: inline-block; width: 120px; }
        button { padding: 8px 16px; margin: 8px 4px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; }
        .primary-btn { background: #3b82f6; color: white; border-color: #3b82f6; }
        .danger-btn { background: #ef4444; color: white; border-color: #ef4444; }
        footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; padding: 16px; font-size: 0.875rem; color: #6b7280; background: white; border-top: 1px solid #e5e7eb; }
        footer a { color: #3b82f6; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h1 class="title">Dashboard - Hono</h1>
            <p class="subtitle">Powered by better-auth-cloudflare</p>
            <div style="margin-top: 16px;">
                <a href="/" style="color: #3b82f6; text-decoration: underline; font-size: 0.9rem;">📚 View API Documentation (Swagger UI)</a>
            </div>
        </div>
        
        <div id="status">Loading...</div>
        
        <div id="not-logged-in" style="display:none;">
            <button onclick="loginAnonymously()" class="primary-btn">Login Anonymously</button>
        </div>
        
        <div id="logged-in" style="display:none;">
            <div class="content">
                <p>Welcome, <span id="user-name" style="font-weight: 600;"></span>!</p>
                <div id="user-info"></div>
                <div id="geolocation-info"></div>
                
                <!-- Authentication Info -->
                <div style="margin-top: 24px; padding: 16px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 1.5rem;">✅</span>
                        <strong style="color: #047857;">You're Authenticated!</strong>
                    </div>
                    <p style="margin: 8px 0 0 0; font-size: 0.875rem; color: #065f46;">
                        Your session is active. You can now test all protected API endpoints in the 
                        <a href="/" style="color: #059669; text-decoration: underline; font-weight: 600;">Swagger UI</a>. 
                        The authentication cookie will automatically be sent with each request.
                    </p>
                </div>
                
                <div style="margin-top: 24px;">
                    <a href="/" style="text-decoration: none;">
                        <button class="primary-btn">🚀 Go to API Docs</button>
                    </a>
                    <button onclick="tryProtectedRoute()" class="primary-btn">Try Protected Route</button>
                    <button onclick="logout()">Logout</button>
                </div>
            </div>
        </div>
        
        <div id="protected-result"></div>
    </div>
    
    <footer>
        Powered by 
        <a href="https://github.com/zpg6/better-auth-cloudflare" target="_blank" rel="noopener noreferrer">better-auth-cloudflare</a>
        | 
        <a href="https://www.npmjs.com/package/better-auth-cloudflare" target="_blank" rel="noopener noreferrer">npm package</a>
    </footer>

    <script>
        let currentUser = null;

        async function checkStatus() {
            try {
                const response = await fetch('/api/auth/get-session', {
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    showNotLoggedIn();
                    return;
                }
                
                const text = await response.text();
                
                if (!text || text.trim() === '') {
                    showNotLoggedIn();
                    return;
                }
                
                const result = JSON.parse(text);
                
                if (result?.session) {
                    currentUser = result.user;
                    await showLoggedIn();
                } else {
                    showNotLoggedIn();
                }
            } catch (error) {
                console.error('Error checking status:', error);
                showNotLoggedIn();
            }
        }

        async function loginAnonymously() {
            try {
                // First check if already logged in
                await checkStatus();
                if (currentUser) {
                    return;
                }
                
                const response = await fetch('/api/auth/sign-in/anonymous', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
                
                const text = await response.text();
                
                if (!response.ok) {
                    // Handle specific error for already anonymous
                    if (text.includes('ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY')) {
                        alert('You are already logged in anonymously!');
                        await checkStatus(); // Refresh status
                        return;
                    }
                    alert('Anonymous login failed: HTTP ' + response.status + ' - ' + text);
                    return;
                }
                
                const result = JSON.parse(text);
                
                if (result.user) {
                    currentUser = result.user;
                    await showLoggedIn();
                } else {
                    alert('Anonymous login failed: ' + (result.error?.message || 'Unknown error'));
                }
            } catch (error) {
                console.error('Anonymous login error:', error);
                alert('Anonymous login failed: ' + error.message);
            }
        }

        async function logout() {
            try {
                await fetch('/api/auth/sign-out', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
                currentUser = null;
                showNotLoggedIn();
                document.getElementById('protected-result').innerHTML = '';
            } catch (error) {
                alert('Logout failed: ' + error.message);
            }
        }

        async function clearSession() {
            try {
                // Clear cookies by setting them to expire
                document.cookie.split(";").forEach(function(c) { 
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                });
                
                // Force logout
                await logout();
                
                // Refresh page to clear any cached state
                window.location.reload();
            } catch (error) {
                console.error('Error clearing session:', error);
                window.location.reload();
            }
        }

        async function tryProtectedRoute() {
            try {
                const response = await fetch('/protected', {
                    credentials: 'include'
                });
                const text = await response.text();
                
                document.getElementById('protected-result').innerHTML = 
                    '<h3>Protected Route Result:</h3><div style="border:1px solid #ccc; padding:10px; margin:10px 0;">' + text + '</div>';
            } catch (error) {
                document.getElementById('protected-result').innerHTML = 
                    '<h3>Protected Route Error:</h3><div style="border:1px solid red; padding:10px; margin:10px 0;">' + error.message + '</div>';
            }
        }

        async function showLoggedIn() {
            document.getElementById('status').innerHTML = 'Status: Logged In';
            document.getElementById('not-logged-in').style.display = 'none';
            document.getElementById('logged-in').style.display = 'block';
            
            if (currentUser) {
                document.getElementById('user-name').textContent = currentUser.name || currentUser.email || 'User';
                
                document.getElementById('user-info').innerHTML = 
                    '<div class="info-row"><strong>Email:</strong> ' + (currentUser.email || 'Anonymous') + '</div>' +
                    '<div class="info-row"><strong>User ID:</strong> ' + currentUser.id + '</div>';
                
                // Fetch geolocation data
                try {
                    const geoResponse = await fetch('/api/auth/cloudflare/geolocation', {
                        credentials: 'include'
                    });
                    
                    if (geoResponse.ok) {
                        const geoData = await geoResponse.json();
                        document.getElementById('geolocation-info').innerHTML = 
                            '<div class="info-row"><strong>Timezone:</strong> ' + (geoData.timezone || 'Unknown') + '</div>' +
                            '<div class="info-row"><strong>City:</strong> ' + (geoData.city || 'Unknown') + '</div>' +
                            '<div class="info-row"><strong>Country:</strong> ' + (geoData.country || 'Unknown') + '</div>' +
                            '<div class="info-row"><strong>Region:</strong> ' + (geoData.region || 'Unknown') + '</div>' +
                            '<div class="info-row"><strong>Region Code:</strong> ' + (geoData.regionCode || 'Unknown') + '</div>' +
                            '<div class="info-row"><strong>Data Center:</strong> ' + (geoData.colo || 'Unknown') + '</div>' +
                            (geoData.latitude ? '<div class="info-row"><strong>Latitude:</strong> ' + geoData.latitude + '</div>' : '') +
                            (geoData.longitude ? '<div class="info-row"><strong>Longitude:</strong> ' + geoData.longitude + '</div>' : '');
                    } else {
                        document.getElementById('geolocation-info').innerHTML = '<div class="info-row"><strong>Geolocation:</strong> Unable to fetch</div>';
                    }
                } catch (error) {
                    document.getElementById('geolocation-info').innerHTML = '<div class="info-row"><strong>Geolocation:</strong> Error fetching data</div>';
                }
            }
        }

        function showNotLoggedIn() {
            document.getElementById('status').innerHTML = 'Status: Not Logged In';
            document.getElementById('not-logged-in').style.display = 'block';
            document.getElementById('logged-in').style.display = 'none';
        }

        // Check status on page load
        checkStatus();
    </script>
</body>
</html>
  `;
    return c.html(html);
});

// Protected route that shows different content based on auth status
app.get("/protected", async c => {
    const auth = c.get("auth");

    try {
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (session?.session && session?.user) {
            return c.html(`
                <h2>🔒 Protected Content - You're In!</h2>
                <p>Welcome to the protected area!</p>
                <p><strong>User ID:</strong> ${session.user.id}</p>
                <p><strong>Session ID:</strong> ${session.session.id}</p>
                <p><strong>Created At:</strong> ${new Date(session.user.createdAt).toLocaleString()}</p>
                <p>This content is only visible to authenticated users (including anonymous ones)!</p>
            `);
        } else {
            return c.html(
                `
                <h2>❌ Access Denied</h2>
                <p>You need to be logged in to see this content.</p>
                <p>Go back and login anonymously first!</p>
            `,
                401
            );
        }
    } catch (error) {
        return c.html(
            `
            <h2>❌ Error</h2>
            <p>Error checking authentication: ${(error as Error).message}</p>
        `,
            500
        );
    }
});


// Simple health check
app.get("/health", c => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default {
    async fetch(request, env, ctx) {
      // First let Cloudflare handle any /agents/... requests automatically
      const agentResponse = await routeAgentRequest(request, env)
      if (agentResponse) return agentResponse;
      return openapi.fetch(request, env, ctx);
    }
  };

export { Prospects, PeopleFinder, EmailFinder, Orchestrator }; 
