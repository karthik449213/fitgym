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
const path = require('path');

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

// Serve optional static voice-call UI
app.use('/voice-call', express.static(path.join(__dirname, '..', 'frontend', 'voice-call')));

// In-memory session store (use Redis for production)
const sessions = {};
// In-memory session metadata to persist extracted lead fields across the session
const sessionsMeta = {};

// System prompt for AI behavior (exact required prompt)
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "You are a professional gym receptionist AI assistant. Speak naturally and be concise (aim for under 30 words). Ask only one question at a time. Remember and reuse user-provided information (for example, name and contact) in later replies — do not ask for it again. Confirm each answer briefly after the user replies. Collect name, contact, fitness goal, intent, and preferred time. When enough info is collected, output exactly:\nLEAD_DATA:\nName:\nContact:\nGoal:\nIntent:\nTime:\nThen stop asking questions and do not continue the conversation.";

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
      temperature: Number(process.env.GROQ_TEMPERATURE || 0.2),
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 400)
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
  // Return lead object if at least one meaningful field is present.
  if (name || contact || goal || intent || time) {
    return { name, contact, goal, intent, time };
  }
  return null;
}

// Helper: Send lead data to n8n webhook
async function sendLeadToWebhook(leadData) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    // If no webhook is configured, log and avoid throwing to keep chat flow stable.
    logger.warn('N8N_WEBHOOK_URL not set — skipping lead forwarding', { leadData });
    return { ok: false, reason: 'no-webhook' };
  }
  try {
    await axios.post(webhookUrl, leadData, { headers: { 'Content-Type': 'application/json' } });
    return { ok: true };
  } catch (err) {
    logger.error({ msg: 'Failed to post lead to n8n webhook', error: err.message, leadData });
    return { ok: false, reason: err.message };
  }
}

// Proxy endpoint for frontend to send leads (frontend posts here)
app.post('/n8n', async (req, res) => {
  try {
    const lead = req.body;
    if (!lead || typeof lead !== 'object') return res.status(400).json({ error: 'Invalid lead data' });
    await sendLeadToWebhook(lead);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ error: err.message });
    res.status(500).json({ error: 'Failed to forward lead to n8n' });
  }
});

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
    if (!sessionsMeta[sid]) sessionsMeta[sid] = {};

    // Build messages for AI: if we have known lead metadata, add it as a short system-level message so model remembers
    const convo = sessions[sid].slice(); // clone
    const messagesForAI = [];
    const meta = sessionsMeta[sid] || {};
    const metaParts = [];
    if (meta.name) metaParts.push(`Name: ${meta.name}`);
    if (meta.contact) metaParts.push(`Contact: ${meta.contact}`);
    if (meta.goal) metaParts.push(`Goal: ${meta.goal}`);
    if (meta.intent) metaParts.push(`Intent: ${meta.intent}`);
    if (meta.time) metaParts.push(`Time: ${meta.time}`);
    if (metaParts.length) {
      messagesForAI.push({ role: 'system', content: `KNOWN_LEAD_DATA:\n${metaParts.join('\n')}` });
    }
    messagesForAI.push(...convo);

    // Get AI reply (include known lead meta)
    const aiReply = await getAIReply(messagesForAI);
    logger.info({ sessionId: sid, aiReply });

    // Extract lead data
    const leadData = extractLeadData(aiReply);
    let leadSent = false;
    if (leadData) {
      // Send to n8n webhook
      const sendResult = await sendLeadToWebhook(leadData);
      leadSent = !!(sendResult && sendResult.ok);
      logger.info({ sessionId: sid, leadData, leadSent, sendResult });
      // persist partial lead data into session meta so subsequent replies remember it
      sessionsMeta[sid] = Object.assign({}, sessionsMeta[sid] || {}, leadData);
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
