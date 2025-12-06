import {
  StateGraph,
  END,
  START,
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import {
  messageNode,
  startMatchNode,
  generateMatchProfileNode,
  approvalNode,
  continueConversationNode,
} from "./single_user_nodes.js";
import { HumanMessage } from "@langchain/core/messages";

// 1. Define the State Object
// In JS, we use Annotation to define the shape of our graph state
const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec, // Automatically handles 'messages' array
  userId: Annotation(),
  nextStep: Annotation(),
  matchIntroMessage: Annotation(),
  matchFlowActive: Annotation(),
  intro_img: {
    value: (oldVal, newVal) => newVal, // only keep the latest version
    default: () => null,
  },
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
      case "match":
        return "init_match";
      case "moodscope":
        return "conversation"; // Placeholder for moodscope
      case "continue":
        return "conversation";
      default:
        return "conversation";
    }
  })
  .addEdge("init_match", END) // Stops to wait for user intro
  .addEdge("generator", END) // Stops to wait for approval
  .addConditionalEdges("approver", (state) => {
    return state.nextStep === "generate_image" ? "generator" : "conversation";
  })
  .addEdge("conversation", END);

const checkpointer = await RedisSaver.fromUrl("redis://localhost:6379");

// 4. Compile
const app = workflow.compile({ checkpointer });

/**
 * Processes a message through LangGraph and returns the final AI response.
 * @param {string} threadId - The unique ID for the conversation (Kafka chatId)
 * @param {string} userMessage - The text content from the user
 */
export async function processLangGraphMessage(threadId, userMessage) {
  const config = { configurable: { thread_id: threadId } };

  // Initialize response container
  let result = {
    text: null,
    // attachment: null // Will hold the file object
  };

  const stream = await app.stream(
    {
      messages: [new HumanMessage(userMessage)],
      // Map other inputs if your graph needs them (e.g., userId)
      userId: threadId,
    },
    config
  );

  for await (const event of stream) {
    const nodeName = Object.keys(event)[0];
    const data = event[nodeName];

    // Check if this node produced messages
    if (data.messages && data.messages.length > 0) {
      const lastMsg = data.messages[data.messages.length - 1];

      // Capture only AI messages (ignoring system or human echo)
      if (lastMsg._getType() === "ai") {
        result.text = lastMsg.content;
      }
      if (nodeName === "generator" && data.intro_img) {
        console.log("set attachment", data.intro_img.data_base64.slice(0, 20));
        result.attachments = [data.intro_img];
      }
      console.log(
        "single user event at node",
        nodeName,
        "with response",
        result.attachment ? "and attachment" : "",
        result.text
      );
    }
  }

  return result;
}
