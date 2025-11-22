import type { D1Database, IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { anonymous } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../db";
import type { CloudflareBindings } from "../env.d";

function createAuth(env?: CloudflareBindings, cf?: IncomingRequestCfProperties) {
    const db = env?.DB ? drizzle(env.DB, { schema, logger: true }) : ({} as any);

    return betterAuth({
        secret: env?.BETTER_AUTH_SECRET || "fallback-secret-for-dev",
        trustedOrigins: [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://applyo-worker.applyo.workers.dev",
            "https://applyo-frontend.applyo.workers.dev",
            "https://try-outreach.vercel.app"
        ],
        ...withCloudflare(
            {
                autoDetectIpAddress: true,
                geolocationTracking: true,
                cf: cf || {},
                d1: env?.DB
                    ? {
                          db,
                          options: {
                              usePlural: true,
                              debugLogs: true,
                          },
                      }
                    : undefined,
                kv: env?.KV,
            },
            {
                socialProviders: {
                    google: {
                        clientId: env?.GOOGLE_CLIENT_ID || "",
                        clientSecret: env?.GOOGLE_CLIENT_SECRET || "",
                        scope: [
                            "openid",
                            "email",
                            "profile",
                            "https://www.googleapis.com/auth/gmail.readonly",
                            "https://www.googleapis.com/auth/gmail.send"
                        ],
                        accessType: "offline",
                        prompt: "consent"
                    }
                },
                plugins: [anonymous()],
                rateLimit: {
                    enabled: true,
                },
            }
        ),
        ...(env
            ? {}
            : {
                  database: drizzleAdapter({} as D1Database, {
                      provider: "sqlite",
                      usePlural: true,
                      debugLogs: true,
                  }),
              }),
    });
}

// Export for CLI schema generation
export const auth = createAuth();

// Export for runtime usage
export { createAuth };
