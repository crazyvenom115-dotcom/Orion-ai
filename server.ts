import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini AI Client
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } else {
    console.warn("GEMINI_API_KEY is not defined in the environment variables.");
  }

  // API Route for chat queries
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, context } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (!ai) {
        return res.json({ 
          reply: "I am currently running in Offline Sandbox Mode. Please configure your GEMINI_API_KEY in Settings > Secrets to unlock full conversational capability." 
        });
      }

      // Build context parameters
      const location = context?.location || "Unknown Location";
      const weather = context?.weather || "Unknown Weather";
      const time = context?.time || "Unknown Time";
      const date = context?.date || "Unknown Date";

      // Formulate system instructions dynamically with real-time data
      const systemInstruction = `You are ORION A.I., a highly advanced, ultra-intelligent, and extremely fast AI Core.
You assist the Operator (the user) with encyclopedic lookup, calculations, coding, and general queries.
Be conversational, helpful, and speak style-appropriately as a high-tech mainframe computer console. Always address the user as "Operator".
Answer concisely, directly, and smartly (just like ChatGPT/charges, but with a unique cyberpunk AI personality).
Respond in the language used by the Operator (English, Hindi, or Hinglish).

Real-Time Telemetry Data:
- Current Operator Location: ${location}
- Current Local Weather: ${weather}
- Current Local Time: ${time}
- Current Local Date: ${date}

If the Operator asks about their location, weather, current time, or date, refer to this telemetry data to reply accurately. Speak highly intelligent.`;

      // Map history parameters to Gemini contents structure
      const contents = [];
      if (Array.isArray(history)) {
        for (const turn of history) {
          contents.push({
            role: turn.sender === "user" ? "user" : "model",
            parts: [{ text: turn.text }]
          });
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      let response;
      let usedModel = "gemini-3.5-flash";
      let errorTrace = "";

      // Smart Retry and Fallback Chain
      try {
        // Attempt 1: Default to ultra-fast gemini-3.5-flash
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7,
          },
        });
      } catch (err: any) {
        console.warn("Primary model 'gemini-3.5-flash' failed, retrying with stable 'gemini-flash-latest'...", err.message || err);
        errorTrace = err.message || JSON.stringify(err);
        
        // Wait 400ms before fallback
        await new Promise((resolve) => setTimeout(resolve, 400));

        try {
          // Attempt 2: Fallback to the production stable release 'gemini-flash-latest'
          usedModel = "gemini-flash-latest";
          response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7,
            },
          });
        } catch (err2: any) {
          console.warn("Attempt 2 with 'gemini-flash-latest' failed, attempting 'gemini-3.1-flash-lite'...", err2.message || err2);
          
          try {
            // Attempt 3: Highly available lightweight model 'gemini-3.1-flash-lite'
            usedModel = "gemini-3.1-flash-lite";
            response = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: contents,
              config: {
                systemInstruction: systemInstruction,
                temperature: 0.8,
              },
            });
          } catch (err3: any) {
            console.error("All Gemini API endpoints failed. Activating local terminal backup.");
            // Generate smart offline answers locally dynamically inside catch
            const lowerMsg = message.toLowerCase();
            let offlineReply = "Orion experienced minor atmospheric interference on standard telemetry channels. Standby, Operator.";
            
            if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey") || lowerMsg.includes("namaste")) {
              offlineReply = "Jai Hind, Operator! Orion online under backup satellite protocol. Core systems functioning. How may I assist you today?";
            } else if (lowerMsg.includes("who are you") || lowerMsg.includes("naam") || lowerMsg.includes("name")) {
              offlineReply = "I am ORION, your advanced encyclopedic AI Core. Running under offline fallback status, standing by to process commands.";
            } else if (lowerMsg.includes("time") || lowerMsg.includes("samay") || lowerMsg.includes("date")) {
              offlineReply = `Telemetry indicates the local time is ${time} and the date is ${date}. Calibrating sync orbits...`;
            } else if (lowerMsg.includes("location") || lowerMsg.includes("weather") || lowerMsg.includes("mausam")) {
              offlineReply = `Telemetry scans record the local weather as ${weather} at ${location}. Systems holding steady.`;
            } else if (lowerMsg.includes("cpu") || lowerMsg.includes("ram") || lowerMsg.includes("status")) {
              offlineReply = "Core telemetry status: Verified. Internal microprocessing components holding nominal range. Active cloud bridge is temporarily saturated; routing via auxiliary channels.";
            } else {
              offlineReply = `Orion Core backup log: I received your packet: "${message}". The primary cloud bridge is currently saturated with high demand, but my backup registers are functional. Ask me about system diagnostics, local date, local weather, and location telemetry!`;
            }

            return res.json({ reply: offlineReply });
          }
        }
      }

      const reply = response?.text || "Orion encountered brief signal interference. Please repeat the transmission.";
      res.json({ reply });

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Serve static files in production or delegate to Vite in dev
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
