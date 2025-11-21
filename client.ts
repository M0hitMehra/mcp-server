import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { confirm, input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CreateMessageRequestSchema,
  Prompt,
  PromptMessage,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { generateText, jsonSchema } from "ai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? "AIzaSyAIODeRl2aWYPUT54dfAjXzJWLDeNqKjG8",
});

const mcp = new Client(
  {
    name: "finconic-mcp-client",
    version: "1.0.0",
  },
  {
    capabilities: {
      sampling: {},
    },
  }
);

// This assumes your compiled server is at build/server.js
const transport = new StdioClientTransport({
  command: "node",
  args: ["./server.ts"],
  stderr: "inherit",
});

async function main() {
  await mcp.connect(transport);

  const [{ tools } ] =
    await Promise.all([
      mcp.listTools(),
      // mcp.listResources(),
      // mcp.listResourceTemplates(),
      // mcp.listPrompts(),
    ]);

  // If the MCP server ever asks the client to "sample" (LLM call),
  // we answer with Gemini here.
  mcp.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const texts: string[] = [];

    for (const message of request.params.messages) {
      const text = await handleServerMessagePrompt(message);
      if (text != null) texts.push(text);
    }

    return {
      role: "user",
      model: "gemini-2.0-flash",
      stopReason: "endTurn",
      content: {
        type: "text",
        text: texts.join("\n"),
      },
    };
  });

  console.log("Connected successfully. Tools available:");
  for (const t of tools) {
    console.log(`- ${t.name} :: ${t.description}`);
  }

  while (true) {
    const option = await select({
      message: "What would you like to do?",
      choices: ["Query (LLM + tools)", "Tools", "Resources", "Prompts"],
    });

    switch (option) {
      case "Tools": {
        const toolName = await select({
          message: "Select a tool",
          choices: (tools as any[])?.map((tool: any) => ({
            name: tool.annotations?.title || tool.name,
            value: tool.name,
            description: tool.description || "No description available",
          })),
        });

        const tool = tools.find((tool) => tool.name === toolName);

        if (!tool) {
          console.error("Tool not found.");
        } else {
          await handleTool(tool);
        }

        break;
      }

      case "Resources": {
        const resourceUri = await select({
          message: "Select a resource",
          choices: [
            ...(resources as any[])?.map((resource: any) => ({
              name: resource.name,
              value: resource.uri,
              description:
                resource.description || "No description available",
            })),
            ...(resourceTemplates as any[])?.map((template: any) => ({
              name: template.name,
              value: template.uriTemplate,
              description:
                template.description || "No description available",
            })),
          ],
        });

        const uri =
          resources.find((resource) => resource.uri === resourceUri)?.uri ??
          resourceTemplates?.find((t) => t.uriTemplate === resourceUri)
            ?.uriTemplate;

        if (!uri) {
          console.error("Resource not found.");
        } else {
          await handleResource(uri);
        }

        break;
      }

      case "Prompts": {
        const promptName = await select({
          message: "Select a prompt",
          choices: prompts.map((prompt) => ({
            name: prompt.name,
            value: prompt.name,
            description: prompt.description,
          })),
        });

        const prompt = prompts.find((p) => p.name === promptName);
        if (!prompt) {
          console.error("Prompt not found.");
        } else {
          await handlePrompt(prompt);
        }

        break;
      }

      case "Query (LLM + tools)": {
        await handleQuery(tools);
        break;
      }
    }
  }
}

/**
 * Generic "chat" entrypoint:
 *  - You type a natural language query
 *  - Gemini can decide to call MCP tools (multi-collection-search, multi-company-search, etc.)
 */
async function handleQuery(tools: Tool[]) {
  const query = await input({ message: "Enter your query" });

  const { text, toolResults } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: query,
    tools: tools.reduce(
      (obj, tool) => ({
        ...obj,
        [tool.name]: {
          description: tool.description,
          parameters: jsonSchema(tool.inputSchema),
          execute: async (args: Record<string, any>) => {
            const res = await mcp.callTool({
              name: tool.name,
              arguments: args,
            });
            return res;
          },
        },
      }),
      {} as Record<string, any>
    ),
  });

  const fallback =
    // @ts-expect-error – SDK typing is loose for content
    toolResults?.[0]?.result?.content?.[0]?.text || "No text generated.";

  console.log(text || fallback);
}

/**
 * Run an MCP prompt template (if your server defines any).
 */
async function handlePrompt(prompt: Prompt) {
  const args: Record<string, string> = {};

  for (const arg of prompt.arguments ?? []) {
    args[arg.name] = await input({
      message: `Enter a value for ${arg.name}:`,
    });
  }

  const res = await mcp.getPrompt({
    name: prompt.name,
    arguments: args,
  });

  for (const message of res.messages) {
    console.log(await handleServerMessagePrompt(message));
  }
}

/**
 * When the server sends a text message as a "prompt",
 * optionally run it through Gemini and send back text.
 */
async function handleServerMessagePrompt(message: PromptMessage) {
  if (message.content.type !== "text") return;

  console.log("\n--- SERVER MESSAGE ---");
  console.log(message.content.text);
  console.log("----------------------\n");

  const run = await confirm({
    message: "Would you like to run this with Gemini?",
    default: true,
  });

  if (!run) return;

  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: message.content.text,
  });

  return text;
}

/**
 * Manual tool invocation.
 * Useful for directly testing:
 *  - multi-collection-search
 *  - multi-company-search
 *  - insert-document, update-documents, etc.
 */
async function handleTool(tool: Tool) {
  const schema: any = tool.inputSchema || { type: "object", properties: {} };
  const properties = schema.properties ?? {};
  const required: string[] = schema.required ?? [];

  const args: Record<string, any> = {};

  for (const [key, value] of Object.entries<any>(properties)) {
    const isRequired = required.includes(key);
    const type = value.type ?? "string";

    const answer = await input({
      message: `Enter a value for ${key} (type: ${type}${
        isRequired ? ", required" : ", optional"
      }) :`,
    });

    if (!answer && !isRequired) continue;

    args[key] = coerceByType(answer, value);
  }

  const res = await mcp.callTool({
    name: tool.name,
    arguments: args,
  });

  // Simple text-first logging; you can inspect full response if needed
  const content = res.content ?? [];
  for (const item of content as any[]) {
    if (item.type === "text") {
      console.log("\n--- TOOL RESPONSE ---");
      console.log(item.text);
      console.log("---------------------\n");
    }
  }
}

/**
 * Resource reading helper.
 */
async function handleResource(uri: string) {
  let finalUri = uri;

  const paramsMatches = uri.match(/{([^}]+)}/g);

  if (paramsMatches !== null) {
    for (const paramsMatch of paramsMatches) {
      const paramName = paramsMatch.replace("{", "").replace("}", "");
      const paramValue = await input({
        message: `Enter a value for ${paramName}:`,
      });

      finalUri = finalUri.replace(paramsMatch, paramValue);
    }
  }

  const res = await mcp.readResource({
    uri: finalUri,
  });

  const first = res.contents[0];
  if (first?.text) {
    try {
      console.log(
        JSON.stringify(JSON.parse(first.text as string), null, 2)
      );
    } catch {
      console.log(first.text);
    }
  } else {
    console.log(res);
  }
}

/**
 * Try to make CLI input match the tool schema:
 * - numbers -> Number
 * - booleans -> true/false
 * - objects/arrays -> JSON.parse
 */
function coerceByType(raw: string, schema: any): any {
  const type = schema.type;

  if (type === "number" || type === "integer") {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      console.warn(`Warning: "${raw}" is not a valid number, passing as string.`);
      return raw;
    }
    return n;
  }

  if (type === "boolean") {
    const lower = raw.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }

  if (type === "object" || type === "array") {
    try {
      return JSON.parse(raw);
    } catch {
      console.warn(
        `Warning: "${raw}" is not valid JSON for ${type}, passing as string.`
      );
      return raw;
    }
  }

  // default: string
  return raw;
}

main().catch((err) => {
  console.error("Client error:", err);
  process.exit(1);
});
