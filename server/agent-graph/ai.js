import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function getImageAsBase64(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "1:1",
        includeRaiReason: false, // Disable safety explanations to keep output clean
      },
    });
    const parts = response.candidates?.[0]?.content?.parts || [];

    // Find the specific part that contains the image
    const imagePart = parts.find((p) => p.inlineData);

    if (imagePart) {
      // Return the data directly (it is already Base64)
      const base64 = imagePart.inlineData.data;
      console.log("[REMOVE] base64 img:", base64.slice(0, 20));
      return base64;
    }
  } catch (error) {
    console.error("Error generating with Gemini:", error);
  }
  return null;
}
