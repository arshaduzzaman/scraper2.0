const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://arshad:ReYUamXABmFjCac3@news-agent.udtkk.mongodb.net/?retryWrites=true&w=majority&appName=news-agent`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function initializeDatabase() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(client);
    console.log("Connected to MongoDB!");
  } catch (err) {
    console.log(err);
  }
}

module.exports = { initializeDatabase, client };
