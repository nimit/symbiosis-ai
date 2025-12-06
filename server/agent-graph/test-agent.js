import { StateGraph, END, START, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { 
  messageNode, startMatchNode, generateMatchProfileNode, 
  approvalNode, continueConversationNode 
} from "./nodes.js";
import { HumanMessage } from "@langchain/core/messages";

// 1. Define the State Object
// In JS, we use Annotation to define the shape of our graph state
const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec, // Automatically handles 'messages' array
  userId: Annotation(),
  nextStep: Annotation(),
  matchIntroMessage: Annotation(),
  matchFlowActive: Annotation(),
});

// 2. Build the Graph
const workflow = new StateGraph(GraphState)
  .addNode("router", messageNode)
  .addNode("init_match", startMatchNode)
  .addNode("generator", generateMatchProfileNode)
  .addNode("approver", approvalNode)
  .addNode("conversation", continueConversationNode)
  
  .addEdge(START, "router")
  
  .addConditionalEdges("router", (state) => {
    // Logic to determine which node to visit next
    if (state.matchFlowActive) {
      if (state.nextStep === "generate_image") return "generator";
      if (state.nextStep === "process_approval") return "approver";
      // If waiting for input, we stop the graph
      return END; 
    }

    switch (state.nextStep) {
      case "match": return "init_match";
      case "moodscope": return "conversation"; // Placeholder for moodscope
      case "continue": return "conversation";
      default: return "conversation";
    }
  })
  .addEdge("init_match", END) // Stops to wait for user intro
  .addEdge("generator", END)  // Stops to wait for approval
  .addConditionalEdges("approver", (state) => {
     return state.nextStep === "generate_image" ? "generator" : "conversation";
  })
  .addEdge("conversation", END);

// 3. Initialize Redis Checkpointer
// This saves the "Thread" (conversation history) automatically
const checkpointer = await RedisSaver.fromUrl("redis://localhost:6379");

// 4. Compile
const app = workflow.compile({ checkpointer });

// --- SIMULATION RUNNER ---
// In a real app, this would be your Express/Fastify API endpoint
async function runChat(userId, userMessage) {
  console.log(`\n--- User (${userId}): ${userMessage} ---`);

  const config = { configurable: { thread_id: userId } };
  
  // Stream the events
  const stream = await app.stream(
    { 
      messages: [new HumanMessage(userMessage)], 
      userId: userId 
    }, 
    config
  );

  for await (const event of stream) {
    const nodeName = Object.keys(event)[0];
    const data = event[nodeName];
    
    // Print logic based on which node just finished
    if (data.messages && data.messages.length > 0) {
      const lastMsg = data.messages[data.messages.length - 1];
      if (lastMsg._getType() === "ai" || lastMsg._getType() === "system") {
        console.log(`Bot (${nodeName}): ${lastMsg.content}`);
      }
    }
  }
}

// 5. Execute Simulation
(async () => {
  const USER = "user_123";

  // Interaction 1: Normal Chat
  await runChat(USER, "Hi, I'm Alex. I'm a software engineer and I feel a bit tired today.");
  
  // Interaction 2: Request Match
  await runChat(USER, "I think I'm ready to meet someone.");
  
  // Interaction 3: Provide Intro (Graph resumes at 'init_match')
  await runChat(USER, "Hey there, looking for someone to code with.");
  
  // Interaction 4: Reject Image (Graph resumes at 'generator' -> stops at 'approver')
  await runChat(USER, "No, that looks too dark. Make it brighter.");
  
  // Interaction 5: Approve
  await runChat(USER, "Yes, that's perfect.");

  process.exit(0);
})();