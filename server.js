import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import multer from "multer";
import mammoth from "mammoth";

dotenv.config();

const app = express();
// Add basic body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Multer for file uploads (memory storage with 5MB limit)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// Fail-safe check for Vercel environment
if (!process.env.GEMINI_API_KEY && process.env.VERCEL === "1") {
  console.warn("WARNING: GEMINI_API_KEY is not set in Vercel environment variables.");
}

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from public directory
app.use(express.static(join(__dirname, "public")));

// Root route - serve the frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.post("/generate", (req, res, next) => {
  upload.single('notesFile')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: "File upload error", detail: err.message });
    } else if (err) {
      return res.status(500).json({ error: "Unknown upload error", detail: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const description = req.body.description;
    if (!description) {
      return res.status(400).send({ error: "Missing description" });
    }

    let notesText = "";

    // Extract text from uploaded file if present
    if (req.file) {
      try {
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        const fileName = req.file.originalname;

        if (mimeType === "application/pdf") {
          // Dynamic import for Vercel stability
          const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
          const data = await pdf(fileBuffer);
          notesText = data.text;
        } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const data = await mammoth.extractRawText({ buffer: fileBuffer });
          notesText = data.value;
        } else if (mimeType.startsWith("text/") || fileName.endsWith(".md")) {
          notesText = fileBuffer.toString('utf8');
        } else {
          // Fallback: try reading as text
          notesText = fileBuffer.toString('utf8');
        }
      } catch (parseError) {
        console.error("File parsing error:", parseError);
        // Continue without notes if parsing fails
      }
    }

    // Check if API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY environment variable is not set");
      return res.status(500).send({
        error: "Server configuration error",
        detail: "API key not configured. Please set GEMINI_API_KEY environment variable."
      });
    }

    const prompt = `
You are an expert study planner. Create a one-week study timetable and extra study material (Important Topics and Important Questions) based on the description and provided notes below.

USER DESCRIPTION:
${description}

USER NOTES/STUDY MATERIAL:
${notesText || "No notes provided."}

Return ONLY valid JSON in this exact format:
{
  "timetable": {
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
  },
  "importantTopics": ["Topic 1", "Topic 2", "Topic 3"],
  "importantQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}
`;

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
    console.error("Critical Server Error:", err);
    res.status(500).send({
      error: "Internal Server Error",
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
