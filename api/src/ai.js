import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { appConfig, env } from "./env.js";

const memoryActionSchema = z.object({
  intent: z.enum(["store", "find", "unclear"]),
  itemName: z.string().optional().default(""),
  locationDescription: z.string().optional().default(""),
  category: z.string().optional().default(""),
  searchTerms: z.array(z.string()).optional().default([]),
  confidence: z.number().optional().default(0),
  response: z.string().optional().default(""),
});

let client = null;

function getClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return client;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }

  return text.slice(start, end + 1);
}

export async function classifyMemoryMessage(message) {
  if (!appConfig.hasGemini) {
    const looksLikeQuestion = /\?$/.test(message.trim()) || /^where\b/i.test(message.trim());
    return {
      intent: looksLikeQuestion ? "find" : "store",
      itemName: "",
      locationDescription: "",
      category: "",
      searchTerms: [],
      confidence: 0.2,
      response: "",
    };
  }

  const prompt = `
You classify messages for an app that remembers where users put things.

Return only valid JSON with this exact shape:
{
  "intent": "store" | "find" | "unclear",
  "itemName": string,
  "locationDescription": string,
  "category": string,
  "searchTerms": string[],
  "confidence": number,
  "response": string
}

Rules:
- "store" means the user is telling the app where an item is located.
- "find" means the user is asking where an item is.
- "unclear" means the message does not clearly do either.
- For "store", extract a concise itemName and the exact locationDescription.
- For "find", extract the main itemName and 1-4 useful searchTerms.
- category should be a short label like "document", "clothing", "electronics", "tool", "kitchen", or "".
- response should be a short assistant reply only when intent is "unclear". Otherwise return "".

Message:
${message}
  `.trim();

  const response = await getClient().models.generateContent({
    model: env.geminiModel,
    contents: prompt,
  });

  return memoryActionSchema.parse(JSON.parse(extractJson(response.text ?? "")));
}
