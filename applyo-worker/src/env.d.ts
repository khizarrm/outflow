import type { D1Database, KVNamespace, VectorizeIndex, Ai } from "@cloudflare/workers-types";
import type { AgentNamespace } from "agents";
import type Prospects from "./agents/prospector";
import type PeopleFinder from "./agents/peoplefinder";
import type EmailFinder from "./agents/emailfinder";
import type Orchestrator from "./agents/orchestrator";

export interface CloudflareBindings {
    DB: D1Database;
    KV?: KVNamespace;
    COMPANY_VECTORS: VectorizeIndex;
    EMPLOYEE_VECTORS: VectorizeIndex;
    AI: Ai;
    Prospects: AgentNamespace<Prospects>;
    PeopleFinder: AgentNamespace<PeopleFinder>;
    EmailFinder: AgentNamespace<EmailFinder>;
    Orchestrator: AgentNamespace<Orchestrator>;
    EXA_API_KEY: string;
    ZEROBOUNCE_API_KEY: string;
    OPENAI_API_KEY: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    BETTER_AUTH_SECRET?: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends CloudflareBindings {
            // Additional environment variables can be added here
        }
    }
}