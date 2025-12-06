import os
import json
import ssl
import asyncio
import aiohttp
from dotenv import load_dotenv
from aiokafka import AIOKafkaConsumer

load_dotenv()

NODE_SVR = "http://localhost:8080/"

# Kafka Configuration
bootstrap_servers = os.getenv("SERVER")
topic_name = os.getenv("TOPIC")
api_key = os.getenv("API_KEY")

sasl_mechanism = os.getenv("SASL_MECHANISM")
sasl_user = os.getenv("SASL_USERNAME")
sasl_pass = os.getenv("SASL_PASSWORD")
consumer_group = os.getenv("CONSUMER_GRP")

async def send_message_task(session, data):
    """
    Sends the request. This runs in the background.
    """
    try:
        # We use the existing session
        async with session.post(NODE_SVR, json=data) as response:
            # We await the header to ensure it reached the server, 
            # but you can ignore the body if you don't care about the response text.
            print(f"background task: Message sent. Server responded: {response.status}")
    except Exception as e:
        print(f"background task: Failed to send. Error: {e}")

async def consume():
    # Initialize Consumer
    ssl_context = ssl.create_default_context()
    consumer = AIOKafkaConsumer(
        topic_name,
        ssl_context=ssl_context,
        bootstrap_servers=bootstrap_servers.split(','),
        security_protocol='SASL_SSL',
        sasl_mechanism=sasl_mechanism,
        sasl_plain_username=sasl_user,
        sasl_plain_password=sasl_pass,
        # aiokafka handles deserializers similarly, but ensure the lambda is safe
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id=consumer_group
    )

    print(f"Listening to topic: {topic_name}")
    print("Waiting for messages... (Press Ctrl+C to stop)")

    # Start the consumer connection
    await consumer.start()
    
    try:
        # Async iterator to loop through messages
        async with aiohttp.ClientSession() as session:
            async for message in consumer:
              # print(f"Topic: {message.topic}")
              # print(f"Partition: {message.partition}")
              # print(f"Offset: {message.offset}")
              print(f"\nReceived message: {message.value['data']['text']}")
              asyncio.create_task(send_message_task(session, message.value))
            
    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        # Ideally ensure the consumer stops gracefully
        print("\nStopping consumer...")
        await consumer.stop()

if __name__ == "__main__":
    try:
        asyncio.run(consume())
    except KeyboardInterrupt:
        # Catch Ctrl+C at the top level to exit cleanly
        print("Script terminated by user.")