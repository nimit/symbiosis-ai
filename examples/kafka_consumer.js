// Node.js Kafka Consumer Example
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

const consumer = kafka.consumer({ 
  groupId: process.env.CONSUMER_GRP
});

async function consumeMessages() {
  await consumer.connect();
  await consumer.subscribe({ 
    topic: process.env.TOPIC,
    fromBeginning: true 
  });

  console.log('Listening to topic: ' + process.env.TOPIC);
  console.log('Waiting for messages... (Press Ctrl+C to stop)');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log('\nReceived message:');
      console.log('Topic:', topic);
      console.log('Partition:', partition);
      console.log('Offset:', message.offset);
      console.log('Value:', message.value.toString());
    }
  });
}

consumeMessages().catch(console.error);