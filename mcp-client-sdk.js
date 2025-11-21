// mcp-client-sdk.js
// Usage:
//   node mcp-client-sdk.js <toolName> '<json-args>'
// Examples:
//   node mcp-client-sdk.js list_databases '{}'
//   node mcp-client-sdk.js list_collections '{"database":"test"}'
//   node mcp-client-sdk.js query_mongodb '{"database":"test","collection":"coll","query":"companyName contains private"}'

const { spawn } = require("child_process");
const path = require("path");

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  const [,, toolName, argsJson] = process.argv;
  if (!toolName) {
    console.error("Usage: node mcp-client-sdk.js <toolName> '<json-args>'");
    process.exit(1);
  }
  const args = argsJson ? JSON.parse(argsJson) : {};

  // spawn server process (adjust file name/path if needed)
  const serverFile = path.join(__dirname, "mongodb-mcp-server.js");
  const child = spawn("node", [serverFile], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdout.on("data", (d) => {
    // optional: forward server stdout so you can see logs
    process.stdout.write(`[server stdout] ${d}`);
  });
  child.stderr.on("data", (d) => {
    process.stderr.write(`[server stderr] ${d}`);
  });
  child.on("exit", (code) => {
    console.log(`Server child exited with code ${code}`);
  });

  // give the server a small moment to start and register handlers
  await sleep(300);

  // lazy-require the SDK so we can try different transport constructor shapes
  let Client, StdioClientTransport;
  try {
    ({ Client } = require("@modelcontextprotocol/sdk/client/index.js"));
    ({ StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js"));
  } catch (err) {
    // fallback paths depending on installed package layout
    try {
      ({ Client } = require("@modelcontextprotocol/sdk"));
      ({ StdioClientTransport } = require("@modelcontextprotocol/sdk"));
    } catch (err2) {
      console.error("Could not require MCP SDK. Check package installation and paths.", err2);
      child.kill();
      process.exit(1);
    }
  }

  // construct transport: try object-style first, then positional fallback
  let transport;
  try {
    // many SDK versions use: new StdioClientTransport({ stdin, stdout, stderr })
    transport = new StdioClientTransport({
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
    });
  } catch (err) {
    try {
      // some older SDKs require positional args
      transport = new StdioClientTransport(child.stdin, child.stdout, child.stderr);
    } catch (err2) {
      console.error("Failed to construct StdioClientTransport with both constructor styles.", err2);
      child.kill();
      process.exit(1);
    }
  }

  // create client and connect
  const client = new Client({ name: "mcp-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);

    // Call the tool using the typical MCP call shape.
    // If your SDK uses a different method name, change client.callTool -> client.request/call etc.
    let response;
    if (typeof client.callTool === "function") {
      response = await client.callTool({ name: toolName, arguments: args });
    } else if (typeof client.request === "function") {
      response = await client.request({ name: toolName, arguments: args });
    } else if (typeof client.send === "function") {
      // last-resort guess
      response = await client.send({ name: toolName, arguments: args });
    } else {
      throw new Error("Client instance has no known call method (callTool, request, send). Inspect the SDK API.");
    }

    console.log("Tool response:", JSON.stringify(response, null, 2));
  } catch (err) {
    console.error("Error calling MCP tool:", err);
  } finally {
    try {
      // try to close transport if it has close method
      if (transport && typeof transport.close === "function") {
        await transport.close();
      }
    } catch (e) { /* ignore */ }

    // kill child when done
    child.kill();
    // small delay to allow clean exit log
    await sleep(100);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});





 