import * as authSchema from "./auth.schema";
import * as companiesSchema from "./companies.schema";
import * as templatesSchema from "./templates.schema";

// Combine all schemas here
export const schema = {
    ...authSchema,
    ...companiesSchema,
    ...templatesSchema,
} as const;