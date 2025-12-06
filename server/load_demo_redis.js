import { populateRedis } from "./agent-graph/db.js";

await populateRedis();
process.exit(0);
