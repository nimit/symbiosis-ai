export const buildConnectionImagePrompt = (userPreferences, userMood, userCharacteristics, message) => {
  userMood = userMood.replace("`", "");
  userPreferences = userPreferences.replace("`", "");
  userCharacteristics = userCharacteristics.replace("`", "");
  message = message ? message.replace("`", "") : undefined;
  const prompt = `
  **ROLE & STYLE INSTRUCTION:**
Act as a visionary concept artist. First, analyze the following user preferences for any specific art styles, famous artists, or visual genres: "**${userPreferences}**".
* **IF** a specific style is detected (e.g., "Anime", "Van Gogh", "Cyberpunk", "Cubism", "Watercolor", "Pixel Art", "Noir"), you **MUST** execute the entire image in that specific style.
* **ELSE** (if no specific art style is found), render the image in the style of **"Whimsical Contemporary Magical Realism"**—a rich, non-photorealistic, illustrative style with expressive brushwork and dreamlike qualities.

**MOOD INTERPRETATION (CRITICAL):**
The color palette, lighting, and emotional atmosphere must represent the user's current mood of "**${userMood}**".
* **RULE:** You must interpret this mood through a strictly **positive, aesthetic lens**.
    * *Examples:* If 'tired' -> render as 'Ethereal, Soft, Peaceful, Restorative'. If 'sad' -> 'Poetic, Deep, Melancholic Beauty'. If 'stressed' -> 'Electric, Focused, Dynamic High-Energy'.
    * The final image must feel inviting and warm, never depressing.

**THE SUBJECT & NARRATIVE:**
Create a stylized, metaphorical character illustration representing a user described as: "**${userCharacteristics}**".
* Do not create a generic portrait. Instead, weave their personality traits into the fabric of the image.
* The character should be immersed in a creative environment composed of elements they love: "**${userPreferences}**". (e.g., If they like music, perhaps the clouds are shaped like notes; if they like nature, perhaps they are part of the forest).

**TECHNICAL SPECS:**
High-resolution digital art, evocative composition, trending on ArtStation, visually storytelling, aesthetic masterpiece. --ar 4:5
  ` + (message ? `**THE CONNECTION CALL-TO-ACTION:**
  Integrate a subtle but clear visual metaphor in the foreground that represents their current intent: "**${message}**".
  * This element should act as an invitation to the viewer (e.g., an open book, a second controller, a distinct path leading forward).
  ` : ``);
  return prompt;
};