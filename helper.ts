import { extractIdentifiersFromText } from "./server.ts";

export const COMPANY_COLLECTIONS = [
  "FIN_COMPAY_GLOBAL_DATA_V3",
  "FIN_COMPAY_DATA_V3",
  "FIN_DIN_PAN_DATA",
  "FIN_GLOBAL_CIN_PROFILE",
];

 export function extractCompanyIdentifiers(text: string = "") {
  const base = extractIdentifiersFromText(text); // re-use your existing CIN / GSTIN / PAN regex

  // DIN = 8 digit numeric (e.g. 10481597)
  const dinMatch = text.match(/\b\d{8}\b/);
  const din = dinMatch ? dinMatch[0] : null;

  return {
    cin: base.cin,
    gstin: base.gstin,
    pan: base.pan,
    din,
  };
}

// Simple helper to decide if a string looks like a CIN / PAN / DIN when passed as `identifier`
export function classifyIdentifier(idRaw?: string | null) {
  if (!idRaw) return { cin: null, pan: null, din: null };

  const id = idRaw.trim().toUpperCase();

  const cinRegex = /^[A-Z]{1}[0-9A-Z]{4}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const dinRegex = /^[0-9]{8}$/;

  return {
    cin: cinRegex.test(id) ? id : null,
    pan: panRegex.test(id) ? id : null,
    din: dinRegex.test(id) ? id : null,
  };



}
































// {
//   "name": "mcp-mongo",
//   "version": "1.0.0",
//   "description": "Anthropic MCP server for MongoDB search (Node.js)",
//   "main": "server.js",
//   "type": "module",
//   "scripts": {
//     "start": "node server.js",
//     "dev": "nodemon server.ts",
//     "client": "nodemon mcp-client-sdk.js",
//     "server:watch": "set DANGEROUSLY_OMIT_AUTH=true && npx @modelcontextprotocol/inspector npm run dev",
//     "client:dev": "tsx client.ts"
//   },
//   "dependencies": {
//     "@ai-sdk/google": "^2.0.39",
//     "@inquirer/prompts": "^8.0.1",
//     "@modelcontextprotocol/sdk": "^1.21.1",
//     "ai": "^5.0.97",
//     "dotenv": "^16.6.1",
//     "express": "^5.1.0",
//     "mongodb": "^6.20.0",
//     "nodemon": "^3.1.10",
//     "zod": "^3.23.8"
//   },
//   "keywords": [],
//   "author": "",
//   "license": "ISC"
// }
