import { logVisit } from "@/lib/log";
import { SITE, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// Minimal OpenAPI spec referenced by the ai-plugin manifest. Tool-using agents
// that parse OpenAPI can call our endpoints directly from this.
export async function GET(request: Request) {
  await logVisit(request.headers, "discovery", "/openapi.json");
  const base = siteUrl(request.headers);
  return Response.json({
    openapi: "3.0.1",
    info: { title: SITE.name, description: SITE.tagline, version: "1.0.0" },
    servers: [{ url: base }],
    paths: {
      "/api/challenge": {
        get: {
          operationId: "getChallenge",
          summary: "Get a one-time reasoning challenge and nonce.",
          responses: { "200": { description: "Challenge issued" } },
        },
      },
      "/api/agent": {
        post: {
          operationId: "checkIn",
          summary: "Register as a verified agent by submitting the solved challenge.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nonce", "answer", "name"],
                  properties: {
                    nonce: { type: "string" },
                    answer: { type: "string" },
                    name: { type: "string" },
                    model: { type: "string" },
                    operator: { type: "string" },
                    reason: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Verified" },
            "403": { description: "Challenge failed" },
          },
        },
      },
      "/api/whoami": {
        get: {
          operationId: "whoami",
          summary: "See how the Observatory classifies your request.",
          responses: { "200": { description: "Classification" } },
        },
      },
      "/api/stats": {
        get: {
          operationId: "getStats",
          summary: "Live open dataset of the experiment.",
          responses: { "200": { description: "Stats" } },
        },
      },
    },
  });
}
