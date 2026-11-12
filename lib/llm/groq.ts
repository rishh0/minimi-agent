import Groq from "groq-sdk";

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
export const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
