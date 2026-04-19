/**
 * Hand-written OpenAPI 3.1 document for the v1 public API.
 *
 * Kept as a plain function that returns a plain object so it can be
 * imported from a Next.js route and JSON-serialized trivially. We do
 * not use `zod-to-openapi` on purpose: a hand-written spec gives us
 * precise control over wording + examples, which matters for public
 * documentation.
 *
 * TODO: auto-derive response schemas from the internal route schemas
 * once we settle on stable v1 response shapes. For now we keep them
 * loose (additionalProperties: true) so we can iterate without
 * breaking the contract.
 */

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: Record<string, unknown>;
  servers: Array<{ url: string; description?: string }>;
  security: Array<Record<string, string[]>>;
  components: Record<string, unknown>;
  paths: Record<string, unknown>;
  tags: Array<{ name: string; description?: string }>;
}

export function buildOpenApiSpec(opts?: { serverUrl?: string }): OpenApiDocument {
  const serverUrl = opts?.serverUrl ?? "https://api.sparkflow.ai";

  const schemas: Record<string, unknown> = {
    Error: {
      type: "object",
      required: ["error"],
      properties: {
        error: { type: "string" },
        issues: { type: "object", additionalProperties: true },
      },
    },
    ChatMessage: {
      type: "object",
      required: ["role", "content"],
      properties: {
        role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
        content: { type: "string" },
      },
    },
    ChatCreateRequest: {
      type: "object",
      required: ["messages"],
      properties: {
        messages: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/components/schemas/ChatMessage" },
        },
        forceSearch: { type: "boolean" },
        conversationId: { type: "string" },
      },
    },
    ChatCreateResponse: {
      type: "object",
      properties: {
        message: { type: "object", additionalProperties: true },
        meta: { type: "object", additionalProperties: true },
      },
    },
    ImageGenerateRequest: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", maxLength: 4000 },
        size: { type: "string" },
        n: { type: "integer", minimum: 1, maximum: 4 },
        negativePrompt: { type: "string", maxLength: 4000 },
        provider: { type: "string", enum: ["openai", "replicate", "google"] },
        quality: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
    DocsGenerateRequest: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        title: { type: "string" },
        style: { type: "string" },
      },
    },
    SlidesGenerateRequest: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        slideCount: { type: "integer", minimum: 1, maximum: 40 },
        theme: { type: "string" },
      },
    },
    SheetsGenerateRequest: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
    AgentRunRequest: {
      type: "object",
      required: ["goal"],
      properties: {
        agentId: { type: "string", format: "uuid" },
        goal: { type: "string", minLength: 1 },
        context: { type: "object", additionalProperties: true },
      },
    },
    TaskCreateRequest: {
      type: "object",
      required: ["goal"],
      properties: {
        goal: { type: "string", minLength: 1, maxLength: 4000 },
        context: { type: "object", additionalProperties: true },
      },
    },
    WorkflowRunRequest: {
      type: "object",
      required: ["workflowId"],
      properties: {
        workflowId: { type: "string", format: "uuid" },
        input: { type: "object", additionalProperties: true },
      },
    },
    WebhookSubscription: {
      type: "object",
      required: ["url", "events"],
      properties: {
        id: { type: "string", format: "uuid" },
        url: { type: "string", format: "uri" },
        events: { type: "array", items: { type: "string" } },
        secret: {
          type: "string",
          description: "HMAC secret. Only returned on creation.",
        },
        createdAt: { type: "string", format: "date-time" },
      },
    },
  };

  const securitySchemes = {
    BearerApiKey: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "SparkFlow API key (sf_live_...)",
    },
  } as const;

  const jsonResponse = (schema: string, description: string) => ({
    description,
    content: {
      "application/json": { schema: { $ref: `#/components/schemas/${schema}` } },
    },
  });

  const errorResponses = {
    "400": {
      description: "Invalid request",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
    "401": {
      description: "Missing or invalid API key",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
    "429": {
      description: "Rate limit exceeded",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
    "500": {
      description: "Unexpected server error",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    },
  } as const;

  const postOp = (tag: string, summary: string, requestSchema: string, responseSchema?: string) => ({
    tags: [tag],
    summary,
    operationId: `${tag}.${summary.replace(/\s+/g, "_").toLowerCase()}`,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${requestSchema}` },
        },
      },
    },
    responses: {
      "200": responseSchema
        ? jsonResponse(responseSchema, "Success")
        : {
            description: "Success",
            content: {
              "application/json": { schema: { type: "object", additionalProperties: true } },
            },
          },
      ...errorResponses,
    },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "SparkFlow Public API",
      version: "1.0.0",
      description:
        "Programmatic access to SparkFlow chat, image, docs, slides, sheets, agents, tasks, workflows, and outgoing webhooks. Authenticate with an API key (`sf_live_...`) using the `Authorization: Bearer <key>` header.",
      termsOfService: "https://sparkflow.ai/terms",
      contact: { name: "SparkFlow", email: "support@sparkflow.ai" },
    },
    servers: [{ url: serverUrl, description: "Production" }],
    security: [{ BearerApiKey: [] }],
    tags: [
      { name: "chat", description: "Chat completions." },
      { name: "image", description: "Image generation." },
      { name: "docs", description: "Document generation." },
      { name: "slides", description: "Slides generation." },
      { name: "sheets", description: "Spreadsheet generation." },
      { name: "agents", description: "Agent execution." },
      { name: "tasks", description: "Task queue." },
      { name: "workflows", description: "Workflow runs." },
      { name: "webhooks", description: "Outgoing webhook subscriptions." },
    ],
    components: {
      securitySchemes,
      schemas,
    },
    paths: {
      "/v1/chat": {
        post: postOp("chat", "Create a chat completion", "ChatCreateRequest", "ChatCreateResponse"),
      },
      "/v1/image/generate": {
        post: postOp("image", "Generate images", "ImageGenerateRequest"),
      },
      "/v1/docs/generate": {
        post: postOp("docs", "Generate a document", "DocsGenerateRequest"),
      },
      "/v1/slides/generate": {
        post: postOp("slides", "Generate a slide deck", "SlidesGenerateRequest"),
      },
      "/v1/sheets/generate": {
        post: postOp("sheets", "Generate a spreadsheet", "SheetsGenerateRequest"),
      },
      "/v1/agents/run": {
        post: postOp("agents", "Run an agent", "AgentRunRequest"),
      },
      "/v1/tasks": {
        get: {
          tags: ["tasks"],
          summary: "List tasks",
          operationId: "tasks.list",
          responses: {
            "200": {
              description: "Tasks for the caller's organization",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            ...errorResponses,
          },
        },
        post: postOp("tasks", "Enqueue a task", "TaskCreateRequest"),
      },
      "/v1/workflows/run": {
        post: postOp("workflows", "Run a workflow", "WorkflowRunRequest"),
      },
      "/v1/webhooks": {
        get: {
          tags: ["webhooks"],
          summary: "List webhook subscriptions",
          operationId: "webhooks.list",
          responses: {
            "200": jsonResponse("WebhookSubscription", "Subscriptions"),
            ...errorResponses,
          },
        },
        post: {
          tags: ["webhooks"],
          summary: "Create a webhook subscription",
          operationId: "webhooks.create",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: { type: "array", items: { type: "string" } },
                    secret: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": jsonResponse("WebhookSubscription", "Created subscription"),
            ...errorResponses,
          },
        },
      },
    },
  };
}
