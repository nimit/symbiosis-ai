import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  StateGraph,
  START,
  END,
  Annotation,
  MemorySaver,
} from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import redis, { userProfileStore } from "./db.js";

// --- Configuration ---
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.5,
});

// --- Structured Output Schemas ---
const AnalysisSchema = z.object({
  scenario: z
    .enum(["USER_DEFENDED_SELF", "PARTNER_DEFENDED_USER"])
    .describe(
      "Determine if the target defended themselves or if their partner defended them."
    ),
  reasoning: z.string().describe("Brief explanation of the decision."),
});

// --- State Definition ---
const GraphState = Annotation.Root({
  // Tracks the conversation history
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // Tracks unique participants in this session
  participants: Annotation({
    reducer: (x, y) => [...new Set([...x, ...y])],
    default: () => [],
  }),
  // Tracks inputs for the CURRENT turn only (clears after processing)
  currentInputs: Annotation({
    reducer: (x, y) => (y === "CLEAR" ? {} : { ...x, ...y }),
    default: () => ({}),
  }),
  // Stores the calculated output message for the UI
  uiMessage: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  // Tracks state machine logic
  stage: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => "waiting_start",
  }),
  // Tracks who is currently being roasted
  roastTargetId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  // [ADDED] Tracks the analysis decision so the Edge can read it
  decision: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

// --- Nodes ---

// 1. Buffer Node: Just holds state. Logic happens in conditional edges.
const nodeBuffer = async (state) => {
  return {};
};

// 2. Init Roast: Roasts the first user found in participants
const nodeRoastInit = async (state) => {
  const targetId = state.participants[0];
  const profile = await userProfileStore.get(targetId);

  const sysMsg = new SystemMessage(
    `You are a light-hearted roast master. 
    OBJECTIVE: Roast the user based ONLY on their preferences. 
    TARGET: ${targetId}
    PREFERENCES: ${JSON.stringify(profile.userPreferences)}
    
    Ending constraint: End by asking the other user (${
      state.participants[1]
    }) whehter they are bold enough to defend ${targetId}.`
  );

  const response = await model.invoke([sysMsg, ...state.messages]);

  return {
    messages: [response],
    uiMessage: response.content,
    roastTargetId: targetId,
    stage: "waiting_defense",
    currentInputs: "CLEAR", // Reset buffer for next round
  };
};

// 3. Analyzer: Uses Structured Output to decide flow
const nodeAnalyzeDefense = async (state) => {
  const inputs = state.currentInputs;
  const targetId = state.roastTargetId;
  const partnerId = state.participants.find((p) => p !== targetId);

  // Helper to format the input or mark as silence
  const getMsg = (uid) =>
    inputs[uid] ? `"${inputs[uid]}"` : "(SILENCE / NO RESPONSE)";

  const context = `
    Roast Target: ${targetId}
    Partner: ${partnerId}
    
    Message from Target: ${getMsg(targetId)}
    Message from Partner: ${getMsg(partnerId)}
  `;

  const structuredLlm = model.withStructuredOutput(AnalysisSchema);

  const result = await structuredLlm.invoke([
    new SystemMessage(
      "Analyze the defense dynamics based on the messages provided."
    ),
    new HumanMessage(context),
  ]);

  return {
    decision: result.scenario,
  };
};

// 4. Roast Inaction (Target defended self)
const nodeRoastInaction = async (state) => {
  const targetId = state.roastTargetId;
  const partnerId = state.participants.find((p) => p !== targetId);

  const sysMsg = new SystemMessage(
    `Context: ${targetId} had to defend themselves because ${partnerId} stayed silent.
    TASK: Roast ${partnerId} for being a unsupportive friend. Roast their connection light-heartedly.`
  );

  console.log("Roast Inaction: ", sysMsg.content);
  const response = await model.invoke([sysMsg, ...state.messages]);
  return { messages: [response], uiMessage: response.content };
};

// 5. Roast Hypocrisy (Partner defended target)
const nodeRoastHypocrisy = async (state) => {
  const targetId = state.roastTargetId;
  const partnerId = state.participants.find((p) => p !== targetId);
  const partnerProfile = await userProfileStore.get(partnerId);

  const sysMsg = new SystemMessage(
    `Context: ${partnerId} jumped in to defend ${targetId}.
    TASK: Turn the tables. Roast ${partnerId} using THEIR own preferences against them.
    PARTNER PREFERENCES: ${JSON.stringify(partnerProfile.userPreferences)}`
  );

  const response = await model.invoke([sysMsg, ...state.messages]);
  return { messages: [response], uiMessage: response.content };
};

// 6. Final Cleanup
const nodeSelfDeprecate = async (state) => {
  const sysMsg = new SystemMessage(
    "The session is ending. Apologize for any offense and say goodbye."
  );
  const response = await model.invoke([sysMsg, ...state.messages]);

  return {
    messages: [response],
    uiMessage: response.content,
    stage: "done",
    currentInputs: "CLEAR",
  };
};

// --- Edge Logic ---

const routeInput = (state) => {
  const inputsCount = Object.keys(state.currentInputs).length;

  // --- STAGE 1: WAITING FOR START ---
  // We still require BOTH users to say "start" so we have both User IDs
  // populated in the 'participants' state.
  if (state.stage === "waiting_start") {
    if (inputsCount < 2) return END; // Wait for the second person
    return "roast_init";
  }

  // --- STAGE 2: WAITING FOR DEFENSE ---
  // CHANGE: We now proceed immediately if we have AT LEAST 1 input.
  // This creates a "race": whoever texts first triggers the analysis.
  if (state.stage === "waiting_defense") {
    if (inputsCount >= 1) return "analyze_defense";
  }

  return END;
};

const routeAnalysis = (state) => {
  return state.decision === "PARTNER_DEFENDED_USER"
    ? "roast_hypocrisy"
    : "roast_inaction";
};

// --- Graph Construction ---

const workflow = new StateGraph(GraphState)
  .addNode("buffer_gate", nodeBuffer)
  .addNode("roast_init", nodeRoastInit)
  .addNode("analyze_defense", nodeAnalyzeDefense)
  .addNode("roast_inaction", nodeRoastInaction)
  .addNode("roast_hypocrisy", nodeRoastHypocrisy)
  .addNode("self_deprecate", nodeSelfDeprecate)

  // Entry Point -> Buffer Gate
  .addEdge(START, "buffer_gate")

  // Conditional: Have we heard from both users?
  .addConditionalEdges("buffer_gate", routeInput, {
    [END]: END,
    roast_init: "roast_init",
    analyze_defense: "analyze_defense",
  })

  // After Init -> End (Wait for user input)
  .addEdge("roast_init", END)

  // After Analysis -> Branch
  // [FIXED] Using the named function here
  .addConditionalEdges("analyze_defense", routeAnalysis, {
    roast_hypocrisy: "roast_hypocrisy",
    roast_inaction: "roast_inaction",
  })

  // Converge -> Self Deprecate -> End
  .addEdge("roast_inaction", "self_deprecate")
  .addEdge("roast_hypocrisy", "self_deprecate")
  .addEdge("self_deprecate", END);

// Compile with Redis Checkpointer
// const checkpointer = new RedisSaver({ client: redis });
const checkpointer = new MemorySaver();
export const app = workflow.compile({ checkpointer });

// --- Helper Function ---
export async function processRoastMessage(threadId, userId, text) {
  const config = { configurable: { thread_id: threadId } };

  // Initialize response container
  let results = [];

  // 1. Prepare input
  // We append the message history AND update the current round inputs
  const inputDelta = {
    participants: [userId],
    messages: [new HumanMessage({ content: text })],
    currentInputs: { [userId]: text },
    // Reset decision so we don't carry over logic from previous runs (if graph loops)
    decision: null,
  };

  const stream = await app.stream(inputDelta, config);

  for await (const event of stream) {
    const nodeName = Object.keys(event)[0];
    const data = event[nodeName];

    // Check if this node produced messages
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages.reverse()) {
        if (msg._getType() === "ai") {
          results.push({
            text: msg.content,
          });
          break;
        }
      }
      // console.log(
      //   "single conversation event. at node",
      //   nodeName,
      //   "with response",
      //   result.text
      // );
    }
  }

  return results;
}
