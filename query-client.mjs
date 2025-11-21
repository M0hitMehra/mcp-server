// import { MongoClient } from "mongodb";

// const MONGODB_URI =
//   "mongodb+srv://finconic-dev:f0WW8QlcQxZwErVq@finconic-dev.genkn2z.mongodb.net/";

// async function queryDocuments() {
//   let client = null;
//   try {
//     client = new MongoClient(MONGODB_URI);
//     await client.connect();
//     console.log("Connected to MongoDB");

//     const db = client.db("finconic-dev");
//     const collection = db.collection("FIN_GST_GLOBAL_SEARCH");

//     // Query for documents containing "private" in name field
//     const query = { name: { $regex: "private", $options: "i" } };
//     const results = await collection.find(query).limit(25).toArray();

//     console.log(
//       `\n✓ Found ${results.length} documents containing "private" in name:\n`
//     );
//     console.log(JSON.stringify(results, null, 2));

//     if (results.length > 0) {
//       console.log(
//         `\n✓ Query successful! Retrieved ${results.length} documents.`
//       );
//     }
//   } catch (error) {
//     console.error("Error querying MongoDB:", error.message);
//   } finally {
//     if (client) {
//       await client.close();
//       console.log("\nConnection closed");
//     }
//   }
// }

// queryDocuments();
