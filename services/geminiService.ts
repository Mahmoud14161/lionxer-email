
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_TEXT } from '../constants';

let ai: GoogleGenAI | null = null;

export const initializeGemini = (): string | null => {
  // As per guidelines, process.env.API_KEY is assumed to be pre-configured, valid, and accessible.
  // This check is for robustness in case that assumption is violated in an execution environment.
  if (!process.env.API_KEY) {
    const errorMessage = "Gemini API Key (process.env.API_KEY) is missing or empty. AI features will be disabled.";
    console.error(errorMessage);
    // This message will be logged by App.tsx if initialization fails.
    // The UI should not prompt for the key.
    return errorMessage;
  }
  try {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return null; // Success
  } catch (error) {
    const errorMessage = `Failed to initialize Gemini AI Service using API_KEY from environment variable: ${error instanceof Error ? error.message : String(error)}. Please ensure the key in process.env.API_KEY is valid.`;
    console.error(errorMessage, error); // Log the full error object for better debugging
    return errorMessage;
  }
};

export const generateEmailBody = async (subject: string, customPrompt?: string): Promise<string> => {
  if (!ai) {
    // This state should ideally be handled by App.tsx disabling AI features
    // if initializeGemini() returned an error.
    throw new Error("Gemini AI service not initialized. Initialization might have failed or API key is missing/invalid.");
  }

  const prompt = customPrompt || `Compose a professional and engaging email body. The subject of the email is: "${subject}". The email should be suitable for a bulk mailing campaign. Make it concise and compelling.`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_TEXT,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating email body with Gemini:", error);
    // Provide a more specific error message if possible, or re-throw a structured error.
    throw new Error(`Failed to generate content with Gemini: ${error instanceof Error ? error.message : String(error)}`);
  }
};
