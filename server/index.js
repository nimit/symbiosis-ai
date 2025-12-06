import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import express from "express"; // 1. Replacement for Kafka
import axios from "axios";
import { processLangGraphMessage } from "./agent-graph/single_user.js";
import redis, { populateRedis } from "./agent-graph/db.js";
import { processRoastMessage } from "./agent-graph/roast_graph.js";
import { processDebateMessage } from "./agent-graph/debate_graph.js";

const API_BASE_URL = process.env.API_BASE_URL;
const PORT = 8080;

// 2. Initialize Express
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// 3. The API Reply Function (Kept exactly the same)
const sendApiReply = async (chatId, graphResult) => {
  const url = `${API_BASE_URL}/chats/${chatId}/chat_messages`;

  const payload = {
    message: graphResult,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `✅ API Reply Sent to chat ${chatId}. Status: ${response.status}`
    );
  } catch (error) {
    console.error(
      `❌ API Error for chat ${chatId}:`,
      error.response ? error.response.data : error.message,
      error
    );
  }
};

const startDebate = async (chatId) => {
  return Promise.all([
    sendApiReply(chatId, {
      text: "*crickets*.... congratulations! you are invited to a debate with each other. reply to start",
    }),
    redis.set(`chatid-${chatId}-mode`, "debate"),
  ]);
};

const startRoast = async (chatId) => {
  return Promise.all([
    sendApiReply(chatId, {
      text: "looks like i am roasting you guys. save each other if you can. reply to start",
    }),
    redis.set(`chatid-${chatId}-mode`, "roast"),
  ]);
};

// 4. Server Route (Replaces Consumer Loop)
app.post("/", async (req, res) => {
  try {
    // In Kafka, we parsed string. In Express, req.body is already JSON.
    const eventData = req.body;

    // --- FILTER ---
    // We only care about incoming messages
    if (eventData.event_type !== "message.received") {
      return res.status(200).send("Ignored event type");
    }

    // Extract Data
    const chatId = eventData.data.chat_id;
    const incomingText = eventData.data.text;
    const sender = eventData.data.from_phone;

    console.log(`\n📨 Incoming Webhook Event from ${sender}`);

    // 2. Send to LangGraph (Using sender as the thread_id)
    let graphResult;

    // Note: processDebateMessage/Roast were used in your snippet but not imported.
    // Assuming they are available in scope or part of your environment.
    const mode = await redis.get(`chatid-${chatId}-mode`);
    if (mode === "debate") {
      console.log("debate mode");
      graphResult = await processDebateMessage(sender, incomingText);
    } else if (mode === "roast") {
      console.log("roast mode");
      graphResult = await processRoastMessage(sender, incomingText);
    } else {
      if (incomingText == "gc:debate") {
        await startDebate(chatId);
        return res.status(200).send("Debate Started");
      } else if (incomingText == "gc:roast") {
        await startRoast(chatId);
        return res.status(200).send("Roast Started");
      }
      graphResult = await processLangGraphMessage(sender, incomingText);
    }

    // 3. Trigger API Reply only if we got a response
    if (graphResult) {
      if (!Array.isArray(graphResult)) {
        graphResult = [graphResult];
      }
      for (const result of graphResult) {
        await sendApiReply(chatId, result);
      }
    } else {
      console.warn(`No response generated for chat ${chatId}`);
    }

    // Send HTTP success back to the caller
    res.status(200).send("Processed");
  } catch (err) {
    console.error("Error processing LangGraph flow:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 5. Start Server
const runServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`🎧 Server listening on port ${PORT}`);
      console.log(`📡 Ready to reply via API at: ${API_BASE_URL}`);
    });
  } catch (error) {
    console.error("🚨 Fatal Server Error:", error);
  }
};

// for testing
// await populateRedis();
await runServer();
