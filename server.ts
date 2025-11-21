import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import {
  classifyIdentifier,
  COMPANY_COLLECTIONS,
  extractCompanyIdentifiers,
} from "./helper.ts";



console.log("hello")

const MONGO_URI =
  "mongodb+srv://finconic-dev:f0WW8QlcQxZwErVq@finconic-dev.genkn2z.mongodb.net/";
let mongoClient: MongoClient | null = null;
const DB_NAME = process.env.MONGO_DB_NAME || "finconic-dev";

const COLLECTIONS = ["FIN_GST_GLOBAL_PROFILE", "FIN_GST_GLOBAL_SEARCH"];

const server = new McpServer({
  name: "finconic",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

// Track registered tools for HTTP access
const registeredTools = new Map<string, {
  description: string;
  inputSchema: any;
  handler: (args: any, extra?: any) => Promise<any>;
}>();

const originalTool = server.tool.bind(server);
server.tool = (name: string, ...args: any[]) => {
  const description = args[0] as string;
  const schema = args[1] as any;
  let handler: any;

  if (typeof args[2] === 'function') {
    handler = args[2];
  } else {
    handler = args[3];
  }

  registeredTools.set(name, { description, inputSchema: schema, handler });
  return originalTool(name, ...args);
};

// Connect to MongoDB
async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("Connected to MongoDB");
  }
  return mongoClient;
}

// Register create-user tool
server.tool(
  "create-user",
  "Create a new user in the MongoDB database",
  {
    database: z.string().describe("Database name"),
    collection: z.string().describe("Collection name (e.g., 'users')"),
    name: z.string(),
    email: z.string(),
    address: z.string(),
    phone: z.string(),
  },
  {
    title: "Create User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const { database, collection, ...userData } = params;
      const result = await createUser(database, collection, userData);
      return {
        content: [
          {
            type: "text",
            text: `Successfully created user with ID: ${result.insertedId}`,
          },
        ],
      };
    } catch (error) {
      console.error("create-user handler error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create user: ${error instanceof Error ? error.message : "Unknown error"
              }`,
          },
        ],
      };
    }
  }
);

// Register query tool for flexible MongoDB queries
server.tool(
  "query-documents",
  "Query documents from a MongoDB collection with flexible filter conditions",
  {
    database: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    filter: z
      .record(z.any())
      .describe(
        "MongoDB filter object (e.g., {name: {$regex: 'private', $options: 'i'}})"
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of documents to return (default: 100)"),
    skip: z
      .number()
      .optional()
      .describe("Number of documents to skip (default: 0)"),
    sort: z
      .record(z.union([z.literal(1), z.literal(-1)]))
      .optional()
      .describe("Sort order (e.g., {createdAt: -1})"),
  },
  {
    title: "Query Documents",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const documents = await queryDocuments(
        params.database,
        params.collection,
        params.filter,
        params.limit,
        params.skip,
        params.sort
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: documents.length,
                documents: documents,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error("query-documents handler error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to query documents: ${error instanceof Error ? error.message : "Unknown error"
              }`,
          },
        ],
      };
    }
  }
);

server.tool(
  "insert-document",
  "Insert a single document into a MongoDB collection",
  {
    database: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    document: z.record(z.any()).describe("Document to insert as a JSON object"),
  },
  {
    title: "Insert Document",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const result = await insertDocument(
        params.database,
        params.collection,
        params.document
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted document with ID: ${result.insertedId}`,
          },
        ],
      };
    } catch (error) {
      console.error("insert-document handler error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to insert document: ${error instanceof Error ? error.message : "Unknown error"
              }`,
          },
        ],
      };
    }
  }
);

// Register update-documents tool
server.tool(
  "update-documents",
  "Update documents in a MongoDB collection matching a filter",
  {
    database: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    filter: z.record(z.any()).describe("Filter to match documents"),
    update: z
      .record(z.any())
      .describe("Update operations (e.g., {$set: {status: 'active'}})"),
    updateMany: z
      .boolean()
      .optional()
      .describe(
        "Update all matching documents (true) or just first one (false, default)"
      ),
  },
  {
    title: "Update Documents",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const result = await updateDocuments(
        params.database,
        params.collection,
        params.filter,
        params.update,
        params.updateMany
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully updated ${result.modifiedCount} document(s). Matched: ${result.matchedCount}`,
          },
        ],
      };
    } catch (error) {
      console.error("update-documents handler error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to update documents: ${error instanceof Error ? error.message : "Unknown error"
              }`,
          },
        ],
      };
    }
  }
);

// Register delete-documents tool
server.tool(
  "delete-documents",
  "Delete documents from a MongoDB collection matching a filter",
  {
    database: z.string().describe("Database name"),
    collection: z.string().describe("Collection name"),
    filter: z.record(z.any()).describe("Filter to match documents to delete"),
    deleteMany: z
      .boolean()
      .optional()
      .describe(
        "Delete all matching documents (true) or just first one (false, default)"
      ),
  },
  {
    title: "Delete Documents",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const result = await deleteDocuments(
        params.database,
        params.collection,
        params.filter,
        params.deleteMany
      );
      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted ${result.deletedCount} document(s)`,
          },
        ],
      };
    } catch (error) {
      console.error("delete-documents handler error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to delete documents: ${error instanceof Error ? error.message : "Unknown error"
              }`,
          },
        ],
      };
    }
  }
);

export function extractIdentifiersFromText(text = "") {
  const cinRegex = /([A-Z]{1}[0-9A-Z]{4}[0-9]{4}[A-Z]{3}[0-9]{6})/i;
  const gstinRegex = /([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3})/i;
  const panRegex = /([A-Z]{5}[0-9]{4}[A-Z]{1})/i;

  const cinMatch = text.match(cinRegex);
  const gstinMatch = text.match(gstinRegex);
  const panMatch = text.match(panRegex);

  return {
    cin: cinMatch ? cinMatch[0].toUpperCase() : null,
    gstin: gstinMatch ? gstinMatch[0].toUpperCase() : null,
    pan: panMatch ? panMatch[0].toUpperCase() : null,
  };
}

function collectStatusesFromDoc(doc: any) {
  // Known status keys across your schemas
  const statusKeys = [
    "authStatus",
    "einvoiceStatus",
    "ekycVFlag",
    "adhrVFlag",
    "isFieldVisitConducted",
    "mandatedeInvoice",
    "percentTaxInCash",
    "rgdt",
    "sts",
    "stj",
    "cinStatus",
    "gst",
    "gstin",
    "pan",
    "liabilityPaid",
    "ewayBill",
    "filingTable",
  ];

  const statuses: any = {};
  for (const k of statusKeys) {
    // look at root
    if (doc[k] !== undefined) statuses[k] = doc[k];
    // look inside profile
    else if (doc.profile && doc.profile[k] !== undefined)
      statuses[k] = doc.profile[k];
  }

  // Normalize filingTable to expose filing statuses (if present)
  if (doc.filingTable) {
    try {
      const filing = doc.filingTable;
      if (filing.filingStatus) {
        statuses.filingStatus = filing.filingStatus;
      }
      if (filing.status) statuses.filingTableStatus = filing.status;
    } catch (e) {
      // ignore
    }
  }

  // ewayBill summary
  if (doc.ewayBill) {
    statuses.ewayBill = doc.ewayBill;
  }

  // liabilityPaid summary
  if (doc.liabilityPaid) statuses.liabilityPaid = doc.liabilityPaid;

  return statuses;
}

server.tool(
  "multi-collection-search",
  "Search multiple static collections for documents matching a filter or free-text query (CIN/GSTIN/PAN aware) — enhanced to return consolidated status fields",
  {
    filter: z
      .record(z.any())
      .optional()
      .describe("MongoDB filter object to apply across collections"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of documents to return (default 100)"),
    skip: z
      .number()
      .optional()
      .describe("Number of documents to skip (default 0)"),
    sort: z
      .record(z.union([z.literal(1), z.literal(-1)]))
      .optional()
      .describe("Sort order (e.g., {timestamp: -1})"),
    queryString: z
      .string()
      .optional()
      .describe(
        "Natural language query string — will be parsed for CIN/GSTIN/PAN if provided"
      ),
    identifier: z
      .string()
      .optional()
      .describe(
        "Explicit identifier (CIN or GSTIN or PAN) — if provided will be used to search specific fields"
      ),
  },
  {
    title: "Multi-collection search",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  // Note: MCP SDK expects (args, extra) signature. We return payload as text (JSON-string) to avoid strict union typing issues in some SDK versions.
  async (params, _extra) => {
    const {
      filter = {},
      limit = 100,
      skip = 0,
      sort = {},
      queryString,
      identifier,
    } = params;

    const client = await getMongoClient();
    const db = client.db(DB_NAME);

    // Derive identifiers from inputs
    const fromText = extractIdentifiersFromText(queryString || "");
    const explicitId = identifier ? identifier.trim().toUpperCase() : null;
    const cin = explicitId || fromText.cin;
    const gstin = explicitId || fromText.gstin;
    const pan = explicitId || fromText.pan;

    // If queryString contains words like 'private', use that as text match
    const isPrivateSearch = !!(queryString && / private /i.test(queryString));

    const searches = COLLECTIONS.map(async (colName) => {
      const collection = db.collection(colName);

      if (Object.keys(filter).length > 0) {
        const docs = await collection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();
        return {
          collection: colName,
          matchedBy: "filter",
          count: docs.length,
          docs,
        };
      }

      const orClauses: any[] = [];

      if (cin) {
        orClauses.push({ CIN: { $regex: `^${cin}$`, $options: "i" } });
        orClauses.push({
          "profile.cin": { $regex: `^${cin}$`, $options: "i" },
        });
        orClauses.push({ cin: { $regex: `^${cin}$`, $options: "i" } });
      }
      if (gstin) {
        orClauses.push({ gst: { $regex: `^${gstin}$`, $options: "i" } });
        orClauses.push({ gstin: { $regex: `^${gstin}$`, $options: "i" } });
        orClauses.push({
          "profile.gstin": { $regex: `^${gstin}$`, $options: "i" },
        });
      }
      if (pan) {
        orClauses.push({ pan: { $regex: `^${pan}$`, $options: "i" } });
        orClauses.push({
          "profile.pan": { $regex: `^${pan}$`, $options: "i" },
        });
      }

      if (!cin && !gstin && !pan && queryString) {
        const q = queryString.trim();
        orClauses.push({ "profile.tradeNam": { $regex: q, $options: "i" } });
        orClauses.push({ "profile.lgnm": { $regex: q, $options: "i" } });
        orClauses.push({
          "profile.contacted.name": { $regex: q, $options: "i" },
        });
        orClauses.push({ "address.pradr.addr": { $regex: q, $options: "i" } });
      }

      // Special: if user asked for 'private' in name, ensure we hit tradeNam and lgnm with 'private' regex
      if (isPrivateSearch) {
        orClauses.push({
          "profile.tradeNam": { $regex: "private", $options: "i" },
        });
        orClauses.push({
          "profile.lgnm": { $regex: "private", $options: "i" },
        });
      }

      if (orClauses.length === 0) {
        return { collection: colName, matchedBy: "none", count: 0, docs: [] };
      }

      const mongoQuery = { $or: orClauses };
      const docs = await collection
        .find(mongoQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      // For each doc, attach a consolidated `statuses` object with all relevant status fields
      const docsWithStatuses = docs.map((d: any) => {
        const statuses = collectStatusesFromDoc(d);
        // include canonical identifiers for easy reading
        return {
          _id: d._id,
          cin: d.CIN || d.cin || (d.profile && d.profile.cin) || null,
          gst: d.gst || null,
          gstin: d.gstin || (d.profile && d.profile.gstin) || null,
          pan: d.pan || null,
          tradeNam: (d.profile && d.profile.tradeNam) || d.name || null,
          collection: colName,
          statuses,
          // keep original doc limited to reduce payload — you can extend this if you want full docs
          raw: d,
        };
      });

      return {
        collection: colName,
        matchedBy: "identifier_or_text",
        count: docsWithStatuses.length,
        docs: docsWithStatuses,
      };
    });

    const results = await Promise.all(searches);

    const summary = results.map((r) => ({
      collection: r.collection,
      matchedBy: r.matchedBy,
      count: r.count,
    }));

    const responsePayload = {
      queryUsed: {
        filter: Object.keys(filter).length ? filter : undefined,
        queryString,
        identifier,
      },
      db: DB_NAME,
      collectionsSearched: COLLECTIONS,
      summary,
      results: results.map((r) => ({
        collection: r.collection,
        matchedBy: r.matchedBy,
        count: r.count,
        docs: r.docs,
      })),
      timestamp: new Date().toISOString(),
    };

    // Return as text (stringified JSON) to avoid SDK union typing issues for content items.
    return {
      content: [
        {
          type: "text",
          text: `Search completed across ${COLLECTIONS.length
            } collections. Summary: ${JSON.stringify(summary)}`,
        },
        { type: "text", text: JSON.stringify(responsePayload) },
      ],
    };
  }
);

server.tool(
  "multi-company-search",
  "Search across company master, DIN-PAN, and CIN-profile collections (CIN/DIN/PAN/company-name aware)",
  {
    filter: z
      .record(z.any())
      .optional()
      .describe(
        "MongoDB filter object to apply across company-related collections"
      ),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of documents to return (default 50)"),
    skip: z
      .number()
      .optional()
      .describe("Number of documents to skip (default 0)"),
    sort: z
      .record(z.union([z.literal(1), z.literal(-1)]))
      .optional()
      .describe("Sort order (e.g., {updatedDate: -1})"),
    queryString: z
      .string()
      .optional()
      .describe(
        "Free text query — CIN / DIN / PAN / company name will be auto-detected where possible"
      ),
    identifier: z
      .string()
      .optional()
      .describe(
        "Explicit identifier (CIN or DIN or PAN) — if provided, will be used to search specific fields"
      ),
  },
  {
    title: "Multi company search",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (params, _extra) => {
    console.log("Hello world")

    const {
      filter = {},
      limit = 50,
      skip = 0,
      sort = {},
      queryString,
      identifier,
    } = params;

    const client = await getMongoClient();
    const db = client.db(DB_NAME);

    // 1) Derive identifiers from text + explicit identifier
    const fromText = extractCompanyIdentifiers(queryString || "");
    const fromId = classifyIdentifier(identifier);

    const cin = fromId.cin || fromText.cin;
    const pan = fromId.pan || fromText.pan;
    const din = fromId.din || fromText.din;
    const freeText = queryString?.trim();

    const searches = COMPANY_COLLECTIONS.map(async (colName) => {
      const collection = db.collection(colName);

      // If a raw filter is provided, apply it as-is
      if (Object.keys(filter).length > 0) {
        console.log("filter", filter);

        // Check if any filter value is a number
        const hasNumericValue = Object.values(filter).some(
          (v) => typeof v === "number"
        );

        let mongoFilter = filter;

        if (hasNumericValue) {
          // Build a "string version" of the same filter
          const stringifiedFilter = Object.fromEntries(
            Object.entries(filter).map(([key, value]) => {
              if (typeof value === "number") {
                return [key, String(value)]; // "123"
              }
              return [key, value];
            })
          );

          // Match documents that satisfy either numeric or string version
          mongoFilter = { $or: [filter, stringifiedFilter] };
        }

        const docs = await collection
          .find(mongoFilter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();

        return {
          collection: colName,
          matchedBy: hasNumericValue ? "filter-number-or-string" : "filter",
          count: docs.length,
          docs,
        };
      }

      const orClauses: any[] = [];

      const freeText_hasColon = freeText?.includes(":");
      let freeText_key: string = "";
      let freeText_value: string = "";

      if (freeText_hasColon) {
        let cleaned = (freeText ?? "")
          .replace(/\r?\n/g, "")   // remove real newlines
          .replace(/\\n/g, "")     // remove literal "\n"
          .replace(/[^a-zA-Z0-9]/g, ""); // remove ALL non-alphanumeric characters


        const [key = "", value = ""] = cleaned.split(":");

        console.log(`key = ${key}, value = ${value}`, freeText);
        freeText_key = key;
        freeText_value = value;


        orClauses.push({
          [freeText_key]: { $regex: freeText_value, $options: "i" },
        });

        orClauses.push({
          [freeText_key]: Number.parseInt(freeText_value),
        });
      }

      const identifier_hasColon = identifier?.includes(":");
      let identifier_key: string = "";
      let identifier_value: string = "";

      if (identifier_hasColon) {
        let cleaned = (identifier ?? "")
          .replace(/\r?\n/g, "")   // remove real newlines
          .replace(/\\n/g, "")     // remove literal "\n"
          .replace(/[^a-zA-Z0-9]/g, ""); // remove ALL non-alphanumeric characters

        const [key = "", value = ""] = cleaned.split(":");

        console.log(`key = ${key}, value = ${value}`, identifier);



        orClauses.push({
          [key]: { $regex: value, $options: "i" },
        });

        orClauses.push({
          [key]: Number.parseInt(value),
        });
      }

      // 2) Collection-specific query logic
      if (
        colName === "FIN_COMPAY_GLOBAL_DATA_V3" ||
        colName === "FIN_COMPAY_DATA_V3"
      ) {
        // These collections look like ROC / company master data
        // Fields: cnNmbr (CIN), cmpnyNm, state, cmpnySts, etc.
        if (cin) {
          orClauses.push({ cnNmbr: { $regex: `^${cin}$`, $options: "i" } });
        }
        if (!cin && freeText) {
          // Company name search
          orClauses.push({ cmpnyNm: { $regex: freeText, $options: "i" } });
          // optionally state / ROC names if user types them
          orClauses.push({ state: { $regex: freeText, $options: "i" } });
          orClauses.push({ rocCode: { $regex: freeText, $options: "i" } });
        }
      } else if (colName === "FIN_DIN_PAN_DATA") {
        // DIN-PAN mapping collection :contentReference[oaicite:2]{index=2}
        if (din) {
          orClauses.push({ DIN: din });
          orClauses.push({ _DIN: { $eq: Number(din) } });
        }
        if (pan) {
          orClauses.push({ PAN: { $regex: `^${pan}$`, $options: "i" } });
        }
        if (!din && !pan && freeText) {
          // Name-based search
          orClauses.push({ firstName: { $regex: freeText, $options: "i" } });
          orClauses.push({ lastName: { $regex: freeText, $options: "i" } });
          orClauses.push({
            fatherFirstName: { $regex: freeText, $options: "i" },
          });
          orClauses.push({
            [freeText_key]: { $regex: freeText_value, $options: "i" },
          });

          orClauses.push({
            [freeText_key]: Number.parseInt(freeText_value),
          });
        }
      } else if (colName === "FIN_GLOBAL_CIN_PROFILE") {
        // CIN-centric company profile with nested directorData and companyData :contentReference[oaicite:3]{index=3}
        if (cin) {
          orClauses.push({ CIN: { $regex: `^${cin}$`, $options: "i" } });
          orClauses.push({
            "companyData.CIN": { $regex: `^${cin}$`, $options: "i" },
          });
        }
        if (din) {
          // directorData[].DIN
          orClauses.push({ "profile.directorData.DIN": din });
          // directorData[].MCAUserRole[].din
          orClauses.push({ "profile.directorData.MCAUserRole.din": din });
          orClauses.push({
            [freeText_key]: { $regex: freeText_value, $options: "i" },
          });

          orClauses.push({
            [freeText_key]: Number.parseInt(freeText_value),
          });
        }
        if (!cin && !din && freeText) {
          // Company name search
          orClauses.push({
            "companyData.company": { $regex: freeText, $options: "i" },
          });
          orClauses.push({
            [freeText_key]: { $regex: freeText_value, $options: "i" },
          });

          orClauses.push({
            [freeText_key]: Number.parseInt(freeText_value),
          });
        }
      }

      if (orClauses.length === 0) {
        return {
          collection: colName,
          matchedBy: "none",
          count: 0,
          docs: [],
        };
      }

      const mongoQuery = { $or: orClauses };

      const docs = await collection
        .find(mongoQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      // 3) Normalize output per doc to give a quick view + keep raw
      const docsSummarised = docs.map((d: any) => {
        if (
          colName === "FIN_COMPAY_GLOBAL_DATA_V3" ||
          colName === "FIN_COMPAY_DATA_V3"
        ) {
          return {
            _id: d._id,
            collection: colName,
            CIN: d.cnNmbr || null,
            companyName: d.cmpnyNm || null,
            status: d.cmpnySts || null,
            state: d.state || null,
            rocCode: d.rocCode || null,
            raw: d,
          };
        }

        if (colName === "FIN_DIN_PAN_DATA") {
          const fullName = [d.firstName, d.middleName, d.lastName]
            .filter(Boolean)
            .join(" ");
          return {
            _id: d._id,
            collection: colName,
            DIN: d.DIN || null,
            PAN: d.PAN || null,
            name: fullName || null,
            DINStatus: d.DINStatus || null,
            dateOfBirth: d.dateOfBirth || null,
            raw: d,
          };
        }

        if (colName === "FIN_GLOBAL_CIN_PROFILE") {
          const cd = d.companyData || {};
          return {
            _id: d._id,
            collection: colName,
            CIN: d.CIN || cd.CIN || null,
            companyName: cd.company || null,
            rocName: cd.rocName || null,
            companyStatus: cd.llpStatus || null,
            dateOfIncorporation: cd.dateOfIncorporation || null,
            directors:
              (d.profile &&
                d.profile.directorData &&
                d.profile.directorData.map((dr: any) => ({
                  DIN: dr.DIN,
                  name: [dr.FirstName, dr.MiddleName, dr.LastName]
                    .filter(Boolean)
                    .join(" "),
                  PAN: dr.PAN,
                  dateOfAppointment: dr.dateOfAppointment,
                }))) ||
              [],
            raw: d,
          };
        }

        // Fallback (shouldn't really hit)
        return { _id: d._id, collection: colName, raw: d };
      });

      return {
        collection: colName,
        matchedBy: "identifier_or_text",
        count: docsSummarised.length,
        docs: docsSummarised,
        orClauses: orClauses ?? [],
      };
    });

    const results = await Promise.all(searches);

    const summary = results.map((r) => ({
      collection: r.collection,
      matchedBy: r.matchedBy,
      count: r.count,
    }));

    const responsePayload = {
      queryUsed: {
        filter: Object.keys(filter).length ? filter : undefined,
        queryString,
        identifier,
        resolved: { cin, din, pan },
      },
      db: DB_NAME,
      collectionsSearched: COMPANY_COLLECTIONS,
      summary,
      results,
      timestamp: new Date().toISOString(),
    };


    console.log("Hello world")

    return {
      content: [
        {
          type: "text",
          text: `Company search completed across ${COMPANY_COLLECTIONS.length
            } collections. Summary: ${JSON.stringify(summary)}`,
        },
        {
          type: "text",
          text: JSON.parse(JSON.stringify(responsePayload, null, 2)),
        },
      ],
    };
  }
);

async function main() {
  const httpPort = process.env.HTTP_PORT || 8443; // Default to 8443 for HTTP

  if (process.env.TRANSPORT === 'http' || process.env.HTTP_PORT) {
    const app = express();
    app.use(express.json());

    // sksd

    // CORS
    app.use((req: any, res: any, next: any) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });

    // Manifest endpoint
    app.get("/.well-known/mcp-manifest.json", (req: any, res: any) => {
      // Convert tools map to manifest format
      // Note: We are sending Zod schemas directly which might not be perfect JSON Schema,
      // but for this task it's a reasonable approximation or we'd need a converter.
      // Ideally we'd use `zod-to-json-schema`.
      // Let's try to produce a reasonable schema shape.

      const tools = Array.from(registeredTools.entries()).map(([id, tool]) => {
        // Basic conversion of Zod schema to JSON schema-like structure
        // This is a hack because we don't have zod-to-json-schema installed
        const shape = tool.inputSchema._def?.shape ? tool.inputSchema.shape : {};
        const properties: Record<string, any> = {};
        for (const [key, value] of Object.entries(shape)) {
          const zType = (value as any)._def?.typeName;
          let type = 'string';
          if (zType === 'ZodNumber') type = 'number';
          if (zType === 'ZodBoolean') type = 'boolean';
          if (zType === 'ZodArray') type = 'array';
          if (zType === 'ZodObject') type = 'object';

          properties[key] = { type, description: (value as any).description };
        }

        return {
          name: id, // Frontend expects 'name' (from my implementation) or 'id'? 
          // My frontend uses `tool.name`.
          description: tool.description,
          inputSchema: {
            type: "object",
            properties
          }
        };
      });

      res.json({
        name: "finconic",
        version: "1.0.0",
        tools
      });
    });

    // Call endpoint
    app.post("/mcp/call", async (req: any, res: any) => {
      const { tool, inputs } = req.body;
      const registered = registeredTools.get(tool);

      if (!registered) {
        return res.status(404).json({ error: "Tool not found" });
      }

      try {
        // We need to validate inputs against Zod schema
        // registered.inputSchema.parse(inputs); // Optional: let the handler do it or do it here

        const result = await registered.handler(inputs);



        function parseMcpContent(response: any) {
          const parsed = [];

          for (const block of response.content) {
            if (block.type === "text") {
              const text = block.text;

              try {
                // attempt JSON parse
                const json = JSON.parse(text);
                parsed.push(json);
              } catch (e) {
                // not JSON → keep raw text
                parsed.push(text);
              }
            }
          }

          return parsed;
        }



        console.log(result)

        res.json({ data: parseMcpContent(result) });
      } catch (error) {
        console.error("Tool execution error:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    });

    app.listen(httpPort, () => {
      console.log(`MCP Server listening on HTTP port ${httpPort}`);
    });

    // Also connect Stdio if needed, but usually one or the other.
    // We'll skip Stdio if HTTP is active to avoid conflicts or just keep it.
    // console.log("MCP Server connected and ready (HTTP)");
  } else {
    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("MCP Server connected and ready-1111");
  }
}

/** Create a user in MongoDB */
async function createUser(
  database: string,
  collection: string,
  user: {
    name: string;
    email: string;
    phone: string;
    address: string;
  }
) {
  const client = await getMongoClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const result = await coll.insertOne({
    ...user,
    createdAt: new Date(),
  });

  return result;
}

/** Query documents with flexible filters */
async function queryDocuments(
  database: string,
  collection: string,
  filter: Record<string, any>,
  limit: number = 100,
  skip: number = 0,
  sort?: Record<string, 1 | -1>
) {
  const client = await getMongoClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  let query = coll.find(filter).skip(skip).limit(limit);

  if (sort) {
    query = query.sort(sort);
  }

  const documents = await query.toArray();
  return documents;
}

/** Insert a document */
async function insertDocument(
  database: string,
  collection: string,
  document: Record<string, any>
) {
  const client = await getMongoClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const result = await coll.insertOne({
    ...document,
    createdAt: new Date(),
  });

  return result;
}

/** Update documents */
async function updateDocuments(
  database: string,
  collection: string,
  filter: Record<string, any>,
  update: Record<string, any>,
  updateMany: boolean = false
) {
  const client = await getMongoClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const result = updateMany
    ? await coll.updateMany(filter, update)
    : await coll.updateOne(filter, update);

  return result;
}

/** Delete documents */
async function deleteDocuments(
  database: string,
  collection: string,
  filter: Record<string, any>,
  deleteMany: boolean = false
) {
  const client = await getMongoClient();
  const db = client.db(database);
  const coll = db.collection(collection);

  const result = deleteMany
    ? await coll.deleteMany(filter)
    : await coll.deleteOne(filter);

  return result;
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

main().catch(async (err) => {
  console.error("Fatal error starting server:", err);
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(1);
});
