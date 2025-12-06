import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { userProfileStore } from "./db.js";

// Initialize Gemini
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.5-flash",
  temperature: 0.2,
});

/**
 * NODE 1: The Router & Extractor
 * Analyzes intent and extracts profile data.
 */
export const messageNode = async (state) => {
  const userId = state.userId;
  const lastMessage = state.messages[state.messages.length - 1].content;

  // A. Check if we are locked in a match flow (Hijack logic)
  if (state.matchFlowActive) {
    if (state.nextStep === "wait_for_intro") {
      return { 
        matchIntroMessage: lastMessage,
        nextStep: "generate_image" // Signal to route to generator
      };
    }
    if (state.nextStep === "wait_for_approval") {
      return { nextStep: "process_approval" }; // Signal to route to approver
    }
  }

  // B. Standard Flow: Fetch Profile -> Analyze -> Route
  let userMemory = await userProfileStore.get(userId);

  // Define structured output schema for Gemini
  const extractionSchema = z.object({
    addToMemory: z.object({
      userPreferences: z.array(z.string()).describe("Likes/Dislikes"),
      userMood: z.array(z.string()).describe("Current emotional state"),
      userCharacteristics: z.array(z.string()).describe("Static traits like age, job"),
    }),
    next: z.enum(["moodscope", "match", "continue"]).describe("The next step in the flow"),
  });

  const extractionChain = model.withStructuredOutput(extractionSchema);

  const response = await extractionChain.invoke([
    new SystemMessage(`
      Current Profile: ${JSON.stringify(userMemory)}
      Analyze the user's latest message. 
      1. Extract new traits/moods to add to memory.
      2. If they ask for a match, set next='match'.
      3. If they ask to summarize/moodscope, set next='moodscope'.
      4. Otherwise, set next='continue'.
    `),
    new HumanMessage(lastMessage),
  ]);

  // Save updated profile to Redis
  userMemory.userPreferences.push(...response.addToMemory.userPreferences);
  userMemory.userMood.push(...response.addToMemory.userMood);
  userMemory.userCharacteristics.push(...response.addToMemory.userCharacteristics);
  await userProfileStore.save(userId, userMemory);

  return {
    nextStep: response.next,
  };
};

/**
 * NODE 2: Start Match
 * Asks for intro.
 */
export const startMatchNode = async (state) => {
  return {
    matchFlowActive: true,
    nextStep: "wait_for_intro",
    messages: [new AIMessage("I can find a match! send a short intro message for them (or type 'skip').")],
  };
};

/**
 * NODE 3: Generate Profile Image
 * (Mocking the image gen for this example)
 */
export const generateMatchProfileNode = async (state) => {
  const userMemory = await userProfileStore.get(state.userId);
  const intro = state.matchIntroMessage;
  const prompt = buildConnectionImagePrompt(userMemory.userPreferences.join(",  "), userMemory.userMood.join(", "), userMemory.userCharacteristics.join(", "), intro);
  console.log(`[System] Generating image with prompt: ${prompt}`);
  
  const mockImageUrl = "http://fake-image.com/avatar.png";

  return {
    matchImageUrl: mockImageUrl,
    nextStep: "wait_for_approval",
    messages: [new AIMessage(`I've generated your profile image based on your mood: [${prompt}]. Do you approve? (Yes/No)`)],
  };
};

/**
 * NODE 4: Approval Logic
 */
export const approvalNode = async (state) => {
  const lastMessage = state.messages[state.messages.length - 1].content;
  
  const decisionChain = model.withStructuredOutput(z.object({
    approved: z.boolean(),
    feedback: z.string().optional(),
  }));

  console.log("BEFORE")
  const decision = await decisionChain.invoke([
    new HumanMessage("Did the user approve the image? If No, extract what needs to change."),
    new HumanMessage(lastMessage)
  ]);
  console.log("AFTER")

  if (decision.approved) {
    return {
      matchFlowActive: false,
      nextStep: "continue",
      messages: [new AIMessage("Profile approved! Searching for matches now...")],
    };
  } else {
    // If rejected, save feedback as a negative preference so the next generation is better
    const userMemory = await userProfileStore.get(state.userId);
    userMemory.userPreferences.push(`Visual tweak: ${decision.feedback}`);
    await userProfileStore.save(state.userId, userMemory);

    console.log(`[System] Adjusting for "${decision.feedback}" and regenerating...`);

    return {
      nextStep: "generate_image", // Loop back
      messages: [new AIMessage(`Got it. Adjusting for "${decision.feedback}" and regenerating...`)]
    };
  }
};

/**
 * NODE 5: Normal Conversation
 */
export const continueConversationNode = async (state) => {
  const userMemory = await userProfileStore.get(state.userId);

  const response = await model.invoke([
    new SystemMessage(`You are a helpful friend. User Context: ${JSON.stringify(userMemory)}`),
    ...state.messages
  ]);

  return { messages: [response] };
};