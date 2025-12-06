userMemory = {
  userPreferences: [], // list of natural language phrases like "likes dogs", "prefers mountains 
  userMood: [], // list of natural language phrases like "feels happy", "feels sad"
  userCharacteristics: [], // list of natural language phrases like "ambitious", "extrovert"
}

MessageNode -> Receives chat message $messageId from user $userId
SystemPrompt: Is the user looking for a match or does the user want to summarize the conversation? Distil user's preferences, mood, and characteristics (age, career, aspirations, etc.) from the message.
the field next should be set to moodscope if user hints at a way to summarize the conversation, match if user asks for a match or to connect with someone and continue otherwise
Output: {
  addToMemory: {
    userPreferences: [], // list of natural language phrases like "likes dogs", "prefers mountains to beaches"
    userMood: [], // list of natural language phrases like "feels happy", "feels sad"
    userCharacteristics: [], // list of natural language phrases like "ambitious", "extrovert"
  }
  next: enum["moodscope", "match", "continue"]
}

StartMatchNode -> Called upon receiving a match request from user $userId. Generate an image based on the user's preferences and mood.
Input: userMemory
Output: {
  AI-generated image
}

ContinueConversationNode -> Analyze the recent conversation history and continue the conversation in a natural manner.
Input: userMemory
SystemPrompt: If there are no user characteristics, ask the user to give a short description of themselves.


Conversation flow:
By default, user is at the MessageNode. As soon as a message is received, the MessageNode is called. Depending on the `next` field in the output of MessageNode, the user is redirected.
moodscope -> MoodscopeNode (to be defined later)
match -> StartMatchNode
continue -> ContinueConversationNode

Before calling the startmatch node, the user is asked to optionally give a short message they want to send.
Based on the user's message and learned characteristics, the StartMatchNode is called to generate an image depicting the user.
Attempt to encapsulate the user's characteristics, preferences, and message in the image which will then be sent to other users that can accept to chat with the user.
Once the image is generated, send it to the user and ask for their approval. If the user approves, the user is redirected to the ContinueConversationNode (saying they will be notified of any matches). If the user does not approve, ask the user what changes they want made. Save the changes in UserPreferences, and call the StartMatchNode again (for the whole process).