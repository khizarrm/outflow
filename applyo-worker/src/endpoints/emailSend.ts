import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { schema } from "../db";

export class ProtectedEmailSendRoute extends OpenAPIRoute {
    schema = {
        tags: ["Protected 🔒"],
        summary: "Send Email",
        description: "Send an email using the authenticated user's Google account. Requires authentication via session cookie.",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: z.object({
                            to: z.string().email().describe("Recipient email address"),
                            subject: z.string().min(1).describe("Email subject"),
                            body: z.string().min(1).describe("Email body content"),
                        }),
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "Email sent successfully",
                content: {
                    "application/json": {
                        schema: z.object({
                            success: z.boolean(),
                            message: z.string(),
                            messageId: z.string().optional(),
                        }),
                    },
                },
            },
            "401": {
                description: "Unauthorized - No valid session or missing Google account",
                content: {
                    "application/json": {
                        schema: z.object({
                            error: z.string(),
                            message: z.string(),
                        }),
                    },
                },
            },
            "500": {
                description: "Internal Server Error",
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
        const data = await this.getValidatedData<typeof this.schema>();
        const env = c.env;

        try {
            // 1. Verify Session
            const session = await auth.api.getSession({
                headers: c.req.raw.headers,
            });

            if (!session?.session || !session?.user) {
                return Response.json(
                    { error: "Unauthorized", message: "Please login first" },
                    { status: 401 }
                );
            }

            // 2. Get User's Google Credentials
            const db = drizzle(env.DB, { schema });
            
            const account = await db.query.accounts.findFirst({
                where: (accounts, { and, eq }) => and(
                    eq(accounts.userId, session.user.id),
                    eq(accounts.providerId, "google")
                ),
            });

            if (!account || !account.accessToken) {
                return Response.json(
                    { error: "Unauthorized", message: "No linked Google account found. Please sign in with Google." },
                    { status: 401 }
                );
            }

            // 3. Send Email via Gmail API
            const { to, subject, body } = data.body;

            // Construct the raw email
            const emailContent = [
                `To: ${to}`,
                `Subject: ${subject}`,
                "Content-Type: text/plain; charset=utf-8",
                "MIME-Version: 1.0",
                "",
                body
            ].join("\r\n");

            // Base64Url encode
            const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${account.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    raw: encodedEmail
                }),
            });

            if (!gmailResponse.ok) {
                const errorData = await gmailResponse.json() as any;
                console.error("Gmail API Error:", errorData);
                return Response.json(
                    { error: "Gmail API Error", message: errorData.error?.message || "Failed to send email" },
                    { status: gmailResponse.status === 401 ? 401 : 500 }
                );
            }

            const result = await gmailResponse.json() as any;

            return {
                success: true,
                message: "Email sent successfully",
                messageId: result.id,
            };

        } catch (error) {
            console.error("Email send error:", error);
            return Response.json(
                { error: "Internal server error", message: (error as Error).message },
                { status: 500 }
            );
        }
    }
}

