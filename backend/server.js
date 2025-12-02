// Inline comments provided for clarity
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Groq = require('groq-sdk');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const port = process.env.PORT || 3000;

// Winston logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

app.use(cors());
app.use(express.json());

// In-memory session store (use Redis for production)
const sessions = {};

// System prompt for AI behavior
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "You are a professional gym receptionist AI assistant. Ask about user's name, goals, fitness level, preferred joining time and contact. Once enough data is collected, return this format: LEAD_DATA: Name: Contact: Goal: Intent: Time:";

// Helper: Verify Groq API key is configured
function validateGroqConfig() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY environment variable is required');
  }
}

// Helper: Call Groq API using official SDK
async function getAIReply(messages) {
  try {
    validateGroqConfig();
    
    // Use Groq SDK to get chat completion
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
      temperature: 0.7
    });
    
    return chatCompletion.choices?.[0]?.message?.content;
  } catch (err) {
    logger.error({ provider: 'groq', error: err.message, details: err });
    throw new Error(`Groq API error: ${err.message}`);
  }
}

// Helper: Extract lead data from AI output
function extractLeadData(aiReply) {
  const leadMatch = aiReply.match(/LEAD_DATA:\s*([\s\S]*)/i);
  if (!leadMatch) return null;
  const data = leadMatch[1];
  const name = data.match(/Name:\s*(.*)/i)?.[1]?.trim() || '';
  const contact = data.match(/Contact:\s*(.*)/i)?.[1]?.trim() || '';
  const goal = data.match(/Goal:\s*(.*)/i)?.[1]?.trim() || '';
  const intent = data.match(/Intent:\s*(.*)/i)?.[1]?.trim() || '';
  const time = data.match(/Time:\s*(.*)/i)?.[1]?.trim() || '';
  if (name && contact && goal && intent && time) {
    return { name, contact, goal, intent, time };
  }
  return null;
}

// Helper: Send lead data to n8n webhook
async function sendLeadToWebhook(leadData) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('N8N_WEBHOOK_URL not set');
  await axios.post(webhookUrl, leadData);
}

// POST /chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { sessionId, messages } = req.body;
    if (!Array.isArray(messages)) {
      logger.warn('Invalid messages array');
      return res.status(400).json({ error: 'Invalid messages array' });
    }
    // Maintain session history
    let sid = sessionId;
    if (!sid) {
      sid = uuidv4();
      sessions[sid] = [];
    }
    if (!sessions[sid]) sessions[sid] = [];
    sessions[sid].push(...messages);

    // Get AI reply
    const aiReply = await getAIReply(sessions[sid]);
    logger.info({ sessionId: sid, aiReply });

    // Extract lead data
    const leadData = extractLeadData(aiReply);
    let leadSent = false;
    if (leadData) {
      // Send to n8n webhook
      await sendLeadToWebhook(leadData);
      leadSent = true;
      logger.info({ sessionId: sid, leadData, leadSent });
    }

    // Return AI reply and lead status
    res.json({ sessionId: sid, aiReply, leadData, leadSent });
  } catch (err) {
    logger.error({ error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'FitGym AI Lead Assistant Backend' });
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
