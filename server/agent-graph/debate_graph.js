import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { userProfileStore } from "./db.js";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.2,
});

// --- SCHEMAS ---
const TopicAssignmentSchema = z.object({
  topic: z.string(),
  userASide: z.enum(["For", "Against"]),
  userBSide: z.enum(["For", "Against"]),
});

const DebateEvaluationSchema = z.object({
  rationale: z.string(),
  scores: z.array(z.object({ userId: z.string(), score: z.number() })),
});

// --- NODES ---

// 1. ROUTER NODE:
async function nodeRouter(state) {
  return {};
}

// 2. LOBBY NODE:
// Handles the "Waiting" state.
async function nodeLobby(state) {
  return {
    ...state,
    uiMessage: "Welcome! Waiting for an opponent to join...",
    // participant1: state.participant1,
    // participant2: state.participant2,
  };
}

// 3. INIT NODE:
async function nodeInitDebate(state) {
  const userA = state.participant1;
  const userB = state.participant2;
  const profileA = (await userProfileStore.get(userA)) || {};
  const profileB = (await userProfileStore.get(userB)) || {};

  const generator = model.withStructuredOutput(TopicAssignmentSchema);
  const result = await generator.invoke(`
    User A: ${JSON.stringify(profileA)}
    User B: ${JSON.stringify(profileB)}
    Pick a debate topic and assign sides.
  `);

  const msg = `Topic Selected: "${result.topic}"\nAssignments:\n${userA}: ${result.userASide}\n${userB}: ${result.userBSide}\n\nPlease submit your arguments.`;

  return {
    ...state,
    topic: result.topic,
    assignments: { [userA]: result.userASide, [userB]: result.userBSide },
    uiMessage: msg,
  };
}

// 4. ARGUMENTS NODE:
// Handles acknowledging single messages.
async function nodeCollectArguments(state) {
  const waiter = state.participant1;
  const opponent = state.participant2;

  const response = await model.invoke([
    new HumanMessage(
      `Acknowledge ${waiter} sent an argument. Waiting for ${opponent}. Fun style.`
    ),
  ]);

  return {
    ...state,
    uiMessage: response.content,
  };
}

// 5. JUDGE NODE:
// Decides the winner.
async function nodeJudgeDebate(state) {
  const argA = state.currentInput1;
  const argB = state.currentInput2;

  const judge = model.withStructuredOutput(DebateEvaluationSchema);
  const result = await judge.invoke([
    new HumanMessage(
      `Topic: ${state.topic}\nA: ${argA}\nB: ${argB}\nScore 0-100.`
    ),
  ]);

  const sorted = result.scores.sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return {
    ...state,
    winnerData: { winnerId: winner.userId, rationale: result.rationale },
    currentInput1: null,
    currentInput2: null,
    uiMessage: `Winner: ${winner.userId} (${winner.score})\nRationale: ${result.rationale}`,
  };
}

// 6. UPDATE NODE:
// Saves to DB.
async function nodeUpdateProfiles(state) {
  // DB Save Logic here...
  // console.log("Saving results to DB...");
  return { ...state };
}

// --- ROUTING LOGIC ---

const routeDebate = (state) => {
  // PRIORITY 1: Not enough players? -> Lobby
  if (!state.participant1 || !state.participant2) {
    return "lobby";
  }

  // PRIORITY 2: Enough players, but no topic? -> Init
  if (!state.topic) {
    return "init";
  }

  // PRIORITY 3: Topic exists, and BOTH inputs received? -> Judge
  if (state.currentInput1 && state.currentInput2) {
    return "judge";
  }

  // PRIORITY 4: Otherwise (Topic exists, 0 or 1 inputs) -> Arguments
  return "arguments";
};

// --- GRAPH CONSTRUCTION ---

const GraphState = Annotation.Root({
  participant1: Annotation(),
  participant2: Annotation(),
  currentInput1: Annotation(),
  currentInput2: Annotation(),
  topic: Annotation(),
  assignments: Annotation(),
  winnerData: Annotation(),
  uiMessage: Annotation(),
});

const workflow = new StateGraph(GraphState)
  // Define Nodes
  .addNode("router", nodeRouter) // The Entry Point
  .addNode("lobby", nodeLobby)
  .addNode("init", nodeInitDebate)
  .addNode("arguments", nodeCollectArguments)
  .addNode("judge", nodeJudgeDebate)
  .addNode("updater", nodeUpdateProfiles)

  // Start at Router
  .addEdge(START, "router")

  // The Conditional "Switch"
  .addConditionalEdges("router", routeDebate)

  // Edges returning to END (Waiting for next user input)
  .addEdge("lobby", END)
  .addEdge("init", END) // Wait for arguments after init
  .addEdge("arguments", END) // Wait for second argument

  // Chained Edges (Automatic flow)
  .addEdge("judge", "updater")
  .addEdge("updater", END);

const checkpointer = await RedisSaver.fromUrl("redis://localhost:6379");
const app = workflow.compile({ checkpointer });

// --- RUNNER ---

export async function processDebateMessage(threadId, userId, text) {
  const config = { configurable: { thread_id: threadId } };
  const snapshot = await app.getState(config);
  const currentValues = snapshot.values;

  let result = { text: null };
  const update = {};
  if (!currentValues.participant1) {
    update.participant1 = userId;
  } else if (!currentValues.participant2) {
    update.participant2 = userId;
  } else {
    if (!currentValues.currentInput1) {
      update.currentInput1 = text;
    } else if (!currentValues.currentInput2) {
      update.currentInput2 = text;
    }
  }
  const stream = await app.stream(update, config);

  for await (const event of stream) {
    const nodeName = Object.keys(event)[0];
    const data = event[nodeName];

    // Check if this node produced messages
    if (data.uiMessage) {
      result.text = data.uiMessage;
      console.log(
        "debate event at node",
        nodeName,
        "with response",
        result.text
      );
    }
  }
  console.log("debate reutrning", result);
  return result;
}
