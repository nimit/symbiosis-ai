import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import { Kafka } from "kafkajs";
import axios from "axios";
import { processLangGraphMessage } from "./agent-graph/single_user.js";

const API_BASE_URL = process.env.API_BASE_URL;

// 1. Kafka Configuration
const kafka = new Kafka({
  clientId: process.env.CLIENT_ID,
  brokers: process.env.SERVER.split(","),
  ssl: true,
  sasl: {
    mechanism: process.env.SASL_MECHANISM,
    username: process.env.SASL_USERNAME,
    password: process.env.SASL_PASSWORD,
  },
});

const consumer = kafka.consumer({ groupId: process.env.CONSUMER_GRP });

// 2. The API Reply Function
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
      error.response ? error.response.data : error.message
    );
  }
};

const runServer = async () => {
  try {
    // 3. Connect Consumer
    await consumer.connect();
    await consumer.subscribe({
      topic: process.env.TOPIC,
      fromBeginning: false,
    });

    console.log(`🎧 Listening to Kafka topic: ${process.env.TOPIC}`);
    console.log(`📡 Ready to reply via API at: ${API_BASE_URL}`);

    // 4. Run Consumer Loop
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const rawValue = message.value.toString();
        let eventData;

        try {
          eventData = JSON.parse(rawValue);
        } catch (e) {
          console.error("⚠️ Received non-JSON message, skipping.");
          return;
        }

        console.log(eventData);

        // --- FILTER ---
        // We only care about incoming messages
        if (eventData.event_type !== "message.received") {
          return;
        }

        // Extract Data
        const chatId = eventData.data.chat_id;
        const incomingText = eventData.data.text;
        const sender = eventData.data.from_phone;
        // sender is the phone number of the user - will uniquely identify the user and this will be used to get their memory from redis

        console.log(`\n📨 Incoming Kafka Event from ${sender}`);

        try {
          // 2. Send to LangGraph (Using sender as the thread_id)
          // This maintains conversation memory for this specific chat
          const graphResult = await processLangGraphMessage(
            sender,
            incomingText
          );

          // 3. Trigger API Reply only if we got a response
          // (If the graph stopped at a Human-in-the-loop checkpoint, aiResponseText might be null)
          if (graphResult) {
            if (!Array.isArray(graphResult)) {
              graphResult = [graphResult];
            }
            for (const result of graphResult) {
              await sendApiReply(chatId, result);
            }
          } else {
            console.warn(
              `Create waiting for human approval or no response generated for chat ${chatId}`
            );
          }
        } catch (err) {
          console.error("Error processing LangGraph flow:", err);
        }
      },
    });
  } catch (error) {
    console.error("🚨 Fatal Server Error:", error);
  }
};

runServer();
