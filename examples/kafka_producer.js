// Node.js Kafka Producer Example
// Install: npm install kafkajs

const { Kafka } = require('kafkajs');

// Kafka Configuration
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

const producer = kafka.producer();

async function sendMessage() {
  await producer.connect();
  
  const message = {
    event: 'test_message',
    data: {
      message: 'Hello from serial-builder!',
      timestamp: new Date().toISOString()
    }
  };

  try {
    const result = await producer.send({
      topic: process.env.TOPIC,
      messages: [
        {
          value: JSON.stringify(message)
        }
      ]
    });

    console.log('Message sent successfully!');
    console.log('Result:', result);
  } catch (error) {
    console.error('Error sending message:', error);
  } finally {
    await producer.disconnect();
  }
}

sendMessage();