// const { MongoClient } = require("mongodb");
// const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
// const {
//   StdioServerTransport,
// } = require("@modelcontextprotocol/sdk/server/stdio.js");
// const {
//   CallToolRequestSchema,
//   ListToolsRequestSchema,
// } = require("@modelcontextprotocol/sdk/types.js");

// const MONGODB_URI =
//   "mongodb+srv://finconic-dev:f0WW8QlcQxZwErVq@finconic-dev.genkn2z.mongodb.net/";

// class MongoDBMCPServer {
//   constructor() {
//     this.server = new Server(
//       {
//         name: "mongodb-query-server",
//         version: "1.0.0",
//       },
//       {
//         capabilities: {
//           tools: {},
//         },
//       }
//     );

//     this.mongoClient = null;
//     this.setupHandlers();
//     this.setupErrorHandling();
//   }

//   setupErrorHandling() {
//     this.server.onerror = (error) => {
//       console.error("[MCP Error]", error);
//     };

//     process.on("SIGINT", async () => {
//       await this.cleanup();
//       process.exit(0);
//     });
//   }

//   async connectMongoDB() {
//     if (!this.mongoClient) {
//       this.mongoClient = new MongoClient(MONGODB_URI);
//       await this.mongoClient.connect();
//       console.error("Connected to MongoDB");
//     }
//     return this.mongoClient;
//   }

//   setupHandlers() {
//     this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
//       tools: [
//         {
//           name: "query_mongodb",
//           description:
//             'Query MongoDB database with natural language. Supports filtering documents by field values (e.g., "list documents where companyName contains private")',
//           inputSchema: {
//             type: "object",
//             properties: {
//               database: {
//                 type: "string",
//                 description: "Database name to query",
//               },
//               collection: {
//                 type: "string",
//                 description: "Collection name to query",
//               },
//               query: {
//                 type: "string",
//                 description:
//                   'Natural language query (e.g., "find all documents where companyName contains private")',
//               },
//             },
//             required: ["database", "collection", "query"],
//           },
//         },
//         {
//           name: "list_databases",
//           description: "List all databases in MongoDB",
//           inputSchema: {
//             type: "object",
//             properties: {},
//           },
//         },
//         {
//           name: "list_collections",
//           description: "List all collections in a database",
//           inputSchema: {
//             type: "object",
//             properties: {
//               database: {
//                 type: "string",
//                 description: "Database name",
//               },
//             },
//             required: ["database"],
//           },
//         },
//       ],
//     }));

//     this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
//       try {
//         const client = await this.connectMongoDB();

//         switch (request.params.name) {
//           case "list_databases": {
//             const adminDb = client.db().admin();
//             const dbs = await adminDb.listDatabases();
//             return {
//               content: [
//                 {
//                   type: "text",
//                   text: JSON.stringify(dbs.databases, null, 2),
//                 },
//               ],
//             };
//           }

//           case "list_collections": {
//             const dbName = request.params.arguments.database;
//             const db = client.db(dbName);
//             const collections = await db.listCollections().toArray();
//             return {
//               content: [
//                 {
//                   type: "text",
//                   text: JSON.stringify(collections, null, 2),
//                 },
//               ],
//             };
//           }

//           case "query_mongodb": {
//             const { database, collection, query } = request.params.arguments;
//             const db = client.db(database);
//             const coll = db.collection(collection);

//             // Parse natural language query into MongoDB query
//             const mongoQuery = this.parseNaturalLanguageQuery(query);

//             const results = await coll.find(mongoQuery).limit(100).toArray();

//             return {
//               content: [
//                 {
//                   type: "text",
//                   text: JSON.stringify(
//                     {
//                       query: mongoQuery,
//                       count: results.length,
//                       results: results,
//                     },
//                     null,
//                     2
//                   ),
//                 },
//               ],
//             };
//           }

//           default:
//             throw new Error(`Unknown tool: ${request.params.name}`);
//         }
//       } catch (error) {
//         return {
//           content: [
//             {
//               type: "text",
//               text: `Error: ${error.message}`,
//             },
//           ],
//           isError: true,
//         };
//       }
//     });
//   }

//   parseNaturalLanguageQuery(query) {
//     const lowerQuery = query.toLowerCase();
//     const mongoQuery = {};

//     // Pattern: "field contains value" or "field includes value"
//     const containsMatch = lowerQuery.match(
//       /(\w+)\s+(contains|includes)\s+(.+)/
//     );
//     if (containsMatch) {
//       const field = containsMatch[1];
//       const value = containsMatch[3].trim();
//       mongoQuery[field] = { $regex: value, $options: "i" };
//       return mongoQuery;
//     }

//     // Pattern: "field equals value" or "field is value"
//     const equalsMatch = lowerQuery.match(/(\w+)\s+(equals|is|=)\s+(.+)/);
//     if (equalsMatch) {
//       const field = equalsMatch[1];
//       const value = equalsMatch[3].trim();
//       mongoQuery[field] = value;
//       return mongoQuery;
//     }

//     // Pattern: "field > value" or "field < value"
//     const comparisonMatch = lowerQuery.match(/(\w+)\s*(>|<|>=|<=)\s*(\d+)/);
//     if (comparisonMatch) {
//       const field = comparisonMatch[1];
//       const operator = comparisonMatch[2];
//       const value = parseFloat(comparisonMatch[3]);
//       const opMap = { ">": "$gt", "<": "$lt", ">=": "$gte", "<=": "$lte" };
//       mongoQuery[field] = { [opMap[operator]]: value };
//       return mongoQuery;
//     }

//     // Default: return empty query (returns all documents)
//     return mongoQuery;
//   }

//   async cleanup() {
//     if (this.mongoClient) {
//       await this.mongoClient.close();
//       console.error("MongoDB connection closed");
//     }
//   }

//   async run() {
//     const transport = new StdioServerTransport();
//     await this.server.connect(transport);
//     console.error("MongoDB MCP server running on stdio");
//   }
// }

// const server = new MongoDBMCPServer();
// server.run().catch(console.error);


