import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import multer from "multer";
import mammoth from "mammoth";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

dotenv.config();

const app = express();
// Add basic body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection with optimized serverless handling
const MONGODB_URI = process.env.MONGODB_URI;
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }
  try {
    const db = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // Timeout after 5s
    });
    isConnected = db.connections[0].readyState === 1;
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error("MongoDB connection error details:", err.message);
    throw err;
  }
};

// Initial connection (don't await here to avoid blocking startup)
connectDB().catch(err => console.error("Initial DB connect failed"));

// Middleware to ensure DB connection for API routes
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/generate') {
    try {
      await connectDB();
      next();
    } catch (err) {
      res.status(503).json({ 
        error: "Database connection failed", 
        detail: "The server could not connect to MongoDB. Please check if MONGODB_URI is set in Vercel and if your IP is whitelisted in Atlas (0.0.0.0/0)." 
      });
    }
  } else {
    next();
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Please sign in." });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid or expired session. Please sign in again." });
  }
};

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

// Auth Routes
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    if (!JWT_SECRET) {
      return res.status(500).json({ error: "Server configuration error", detail: "JWT_SECRET is not defined in Vercel." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });

    const user = new User({ email, password });
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: "User created", token, email: user.email });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed", detail: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!JWT_SECRET) {
      return res.status(500).json({ error: "Server configuration error", detail: "JWT_SECRET is not defined in Vercel." });
    }
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, email: user.email, lastPlan: user.lastPlan });
  } catch (err) {
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    res.json({ email: user.email, lastPlan: user.lastPlan });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.post("/generate", authenticateToken, (req, res, next) => {
  upload.array('notesFiles', 10)(req, res, (err) => {
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

    // Extract text from uploaded files if present
    if (req.files && req.files.length > 0) {
      const extractionPromises = req.files.map(async (file) => {
        try {
          const fileBuffer = file.buffer;
          const mimeType = file.mimetype;
          const fileName = file.originalname;

          if (mimeType === "application/pdf") {
            const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default;
            const data = await pdf(fileBuffer);
            return `--- Content from ${fileName} ---\n${data.text}\n`;
          } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const data = await mammoth.extractRawText({ buffer: fileBuffer });
            return `--- Content from ${fileName} ---\n${data.value}\n`;
          } else if (mimeType.startsWith("text/") || fileName.endsWith(".md")) {
            return `--- Content from ${fileName} ---\n${fileBuffer.toString('utf8')}\n`;
          } else {
            return `--- Content from ${fileName} ---\n${fileBuffer.toString('utf8')}\n`;
          }
        } catch (parseError) {
          console.error(`Error parsing ${file.originalname}:`, parseError);
          return `--- Error parsing ${file.originalname} ---\n`;
        }
      });

      const extractedTexts = await Promise.all(extractionPromises);
      notesText = extractedTexts.join("\n");
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

    // Save the plan to user's record
    if (req.user) {
      await User.findByIdAndUpdate(req.user.userId, { lastPlan: parsed });
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
