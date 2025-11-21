import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../db";
import { eq, desc, and } from "drizzle-orm";
import { templates } from "../db/templates.schema";

export class ProtectedTemplatesListRoute extends OpenAPIRoute {
  schema = {
    tags: ["Protected 🔒"],
    summary: "List User Templates",
    responses: {
      "200": {
        description: "Templates retrieved",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              templates: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  subject: z.string(),
                  body: z.string(),
                  createdAt: z.string(),
                  updatedAt: z.string(),
                })
              ),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    const auth = c.get("auth");
    const env = c.env;
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const db = drizzle(env.DB, { schema });
    const userTemplates = await db.query.templates.findMany({
      where: eq(templates.userId, session.user.id),
      orderBy: [desc(templates.createdAt)],
    });

    return {
      success: true,
      templates: userTemplates.map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt).toISOString(),
        updatedAt: new Date(t.updatedAt).toISOString(),
      })),
    };
  }
}

export class ProtectedTemplatesCreateRoute extends OpenAPIRoute {
  schema = {
    tags: ["Protected 🔒"],
    summary: "Create Template",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string(),
              subject: z.string(),
              body: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Template created",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              template: z.object({
                id: z.string(),
                name: z.string(),
                subject: z.string(),
                body: z.string(),
                createdAt: z.string(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    const auth = c.get("auth");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { name, subject, body } = await this.getValidatedData<typeof this.schema>().then(d => d.body);
    const db = drizzle(c.env.DB, { schema });
    
    const newTemplate = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      name,
      subject,
      body,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(templates).values(newTemplate);

    return {
      success: true,
      template: {
          ...newTemplate,
          createdAt: newTemplate.createdAt.toISOString(),
      },
    };
  }
}

export class ProtectedTemplatesUpdateRoute extends OpenAPIRoute {
  schema = {
    tags: ["Protected 🔒"],
    summary: "Update Template",
    request: {
      params: z.object({
        id: z.string().describe("Template ID"),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              subject: z.string().optional(),
              body: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Template updated",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              template: z.object({
                id: z.string(),
                name: z.string(),
                subject: z.string(),
                body: z.string(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            }),
          },
        },
      },
      "404": { description: "Template not found" },
    },
  };

  async handle(c: any) {
    const auth = c.get("auth");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await this.getValidatedData<typeof this.schema>().then(d => d.params);
    const { name, subject, body } = await this.getValidatedData<typeof this.schema>().then(d => d.body);
    const db = drizzle(c.env.DB, { schema });
    
    const result = await db.update(templates)
      .set({ 
        name, 
        subject, 
        body, 
        updatedAt: new Date() 
      })
      .where(and(eq(templates.id, id), eq(templates.userId, session.user.id)))
      .returning();

    if (!result.length) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    const updated = result[0];
    return {
      success: true,
      template: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }
}

export class ProtectedTemplatesDeleteRoute extends OpenAPIRoute {
  schema = {
    tags: ["Protected 🔒"],
    summary: "Delete Template",
    request: {
      params: z.object({
        id: z.string().describe("Template ID"),
      }),
    },
    responses: {
      "200": {
        description: "Template deleted",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
      "404": {
        description: "Template not found",
      },
    },
  };

  async handle(c: any) {
    const auth = c.get("auth");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await this.getValidatedData<typeof this.schema>().then(d => d.params);
    const db = drizzle(c.env.DB, { schema });
    
    const result = await db.delete(templates).where(
      and(
        eq(templates.id, id),
        eq(templates.userId, session.user.id)
      )
    ).returning();

    if (!result.length) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    return { success: true };
  }
}
