import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();
const app = express();
app.use(express.json());

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from public directory
app.use(express.static(join(__dirname, "public")));

// Root route - serve the frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.post("/generate", async (req, res) => {
  const description = req.body.description;
  
  // Check if API key is available
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set");
    return res.status(500).send({ 
      error: "Server configuration error", 
      detail: "API key not configured. Please set GEMINI_API_KEY environment variable." 
    });
  }

  const prompt = `
You are an expert study planner. Create a one-week study timetable based on the description below.
${description}

Return ONLY valid JSON in this exact format:
{
  "Monday": [
    {"startTime": "9:00 AM", "endTime": "10:30 AM", "activity": "Study Math"},
    {"startTime": "11:00 AM", "endTime": "12:30 PM", "activity": "Study Physics"}
  ],
  "Tuesday": [
    {"startTime": "9:00 AM", "endTime": "10:30 AM", "activity": "Study Chemistry"},
    {"startTime": "11:00 AM", "endTime": "12:30 PM", "activity": "Study Biology"}
  ],
  "Wednesday": [
    {"startTime": "9:00 AM", "endTime": "10:30 AM", "activity": "Study Math"},
    {"startTime": "11:00 AM", "endTime": "12:30 PM", "activity": "Study Physics"}
  ],
  "Thursday": [
    {"startTime": "9:00 AM", "endTime": "10:30 AM", "activity": "Study Chemistry"},
    {"startTime": "11:00 AM", "endTime": "12:30 PM", "activity": "Study Biology"}
  ],
  "Friday": [
    {"startTime": "9:00 AM", "endTime": "10:30 AM", "activity": "Study Math"},
    {"startTime": "11:00 AM", "endTime": "12:30 PM", "activity": "Study Physics"}
  ],
  "Saturday": [
    {"startTime": "10:00 AM", "endTime": "11:30 AM", "activity": "Review Week's Material"}
  ],
  "Sunday": [
    {"startTime": "10:00 AM", "endTime": "11:30 AM", "activity": "Plan Next Week"}
  ]
}
`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Gemini raw response:", JSON.stringify(data, null, 2));

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No text returned from model");
    }

    // Clean the response text (remove markdown formatting if present)
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(cleanedText);
    
    // Validate the structure
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error("Invalid JSON structure returned");
    }
    
    res.send(parsed);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send({ 
      error: "Failed to generate timetable", 
      detail: err.message 
    });
  }
});

// Export for Vercel serverless functions
export default app;

// Only listen locally if not in Vercel environment
if (process.env.VERCEL !== "1") {
  app.listen(3000, () => console.log("Server running on http://localhost:3000"));
}
