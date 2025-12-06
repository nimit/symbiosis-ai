import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { Kafka } from 'kafkajs';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL;

// 1. Kafka Configuration
const kafka = new Kafka({
  clientId: process.env.CLIENT_ID,
  brokers: process.env.SERVER.split(','),
  ssl: true,
  sasl: {
    mechanism: process.env.SASL_MECHANISM,
    username: process.env.SASL_USERNAME,
    password: process.env.SASL_PASSWORD
  }
});

const consumer = kafka.consumer({ groupId: process.env.CONSUMER_GRP });

// 2. The API Reply Function
const sendApiReply = async (chatId, originalText) => {
  const url = `${API_BASE_URL}/chats/${chatId}/chat_messages`;
  const payload = {
    message: {
      text: `Auto-Reply: received "${originalText}"`
    }
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`, // Using API_KEY from .env
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ API Reply Sent to chat ${chatId}. Status: ${response.status}`);
  } catch (error) {
    console.error(`❌ API Error for chat ${chatId}:`, error.response ? error.response.data : error.message);
  }
};

const runServer = async () => {
  try {
    // 3. Connect Consumer
    await consumer.connect();
    await consumer.subscribe({ 
      topic: process.env.TOPIC, 
      fromBeginning: false 
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
        if (eventData.event_type !== 'message.received') {
          return; 
        }

        // Extract Data
        const chatId = eventData.data.chat_id;
        const incomingText = eventData.data.text;
        const sender = eventData.data.from_phone;

        console.log(`\n📨 Incoming Kafka Event from ${sender}`);

        // 5. Trigger API Reply
        await sendApiReply(chatId, incomingText);
      },
    });

  } catch (error) {
    console.error('🚨 Fatal Server Error:', error);
  }
};

runServer();