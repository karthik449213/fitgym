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

// In-memory session store (use Redis for production)
const sessions = {};
// In-memory session metadata to persist extracted lead fields across the session
const sessionsMeta = {};
// In-memory members store (for demo / webhook forwarding). In production use a DB.
const members = {};

// System prompt for AI behavior (exact required prompt)
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  "You are a professional gym receptionist AI assistant. Speak naturally and be concise (aim for under 30 words). Ask only one question at a time. Remember and reuse user-provided information (for example, name and email) in later replies — do not ask for it again. Confirm each answer briefly after the user replies. Collect name, email address, fitness goal, intent, and preferred time. When enough info is collected, output exactly:\nLEAD_DATA:\nName:\nContact:\nGoal:\nIntent:\nTime:\nThen stop asking questions and do not continue the conversation.";

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
  // Optional membership fields
  const startDate = data.match(/StartDate:\s*(\d{4}-\d{2}-\d{2})/i)?.[1]?.trim() || '';
  const membershipType = data.match(/MembershipType:\s*(.*)/i)?.[1]?.trim() || '';
  // Return lead object if at least one meaningful field is present.
  if (name || contact || goal || intent || time || startDate || membershipType) {
    return { name, contact, goal, intent, time, startDate, membershipType };
  }
  return null;
}

// Helper: calculate expiry date (returns YYYY-MM-DD)
function calculateExpiryDate(startDateStr, membershipType) {
  if (!startDateStr || !membershipType) return null;
  // Parse startDate as UTC date (yyyy-mm-dd)
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  // Create date in UTC to avoid timezone shifts
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

  let daysToAdd = 0;
  const mt = membershipType.toLowerCase();
  if (mt.includes('1 month') || mt === '1') daysToAdd = 30;
  else if (mt.includes('3 month') || mt === '3') daysToAdd = 90;
  else if (mt.includes('6 month') || mt === '6') daysToAdd = 180;
  else if (mt.includes('12 month') || mt === '12' || mt.includes('12 months')) daysToAdd = 365;
  else {
    // try to parse numeric months
    const num = parseInt(membershipType, 10);
    if (!isNaN(num)) daysToAdd = num * 30;
  }

  if (!daysToAdd) return null;
  const expiry = new Date(dt.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  // format YYYY-MM-DD
  const yyyy = expiry.getUTCFullYear();
  const mm = String(expiry.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(expiry.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper: Try to extract basic lead fields from a plain user message
function extractFromUserMessage(text) {
  if (!text || typeof text !== 'string') return {};
  const out = {};
  // simple name patterns: "my name is John Doe", "I'm John", "I am John"
  const nameMatch = text.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  if (nameMatch) out.name = nameMatch[1].trim();

  // email
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) out.contact = emailMatch[0].trim();

  // phone-like (7-15 digits, allow spaces, dashes, parentheses)
  const phoneMatch = text.match(/(?:\+?\d[\d ()-]{6,}\d)/);
  if (phoneMatch) out.contact = out.contact || phoneMatch[0].trim();

  return out;
}

// Helper: parse membership choice and start date from user text
function parseMembershipFromMessage(text) {
  if (!text || typeof text !== 'string') return {};
  const out = {};
  const t = text.toLowerCase();

  // membership type
  if (t.match(/1\s*(month|m)/)) out.membershipType = '1 month';
  else if (t.match(/\b(one)\s*month\b/)) out.membershipType = '1 month';
  else if (t.match(/3\s*(months|month|m)/)) out.membershipType = '3 months';
  else if (t.match(/\b(three)\s*months\b/)) out.membershipType = '3 months';
  else if (t.match(/6\s*(months|month|m)/)) out.membershipType = '6 months';
  else if (t.match(/\b(six)\s*months\b/)) out.membershipType = '6 months';
  else if (t.match(/12\s*(months|month|m)/)) out.membershipType = '12 months';
  else if (t.match(/\b(twelve)\s*months\b/)) out.membershipType = '12 months';

  // explicit YYYY-MM-DD
  const ymd = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (ymd) out.startDate = ymd[1];

  // mm/dd/yyyy or mm/dd/yy
  const mdy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy && !out.startDate) {
    let month = Number(mdy[1]);
    let day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    // pad
    out.startDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // keywords: today, tomorrow
  if (!out.startDate) {
    if (t.includes('today')) {
      const d = new Date();
      out.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } else if (t.includes('tomorrow')) {
      const d = new Date();
      d.setDate(d.getDate()+1);
      out.startDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  }

  return out;
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
    // Append incoming messages (frontend should send only the new message(s)).
    sessions[sid].push(...messages);
    // Try to extract basic lead info from incoming user messages and persist to sessionsMeta
    for (const m of messages) {
      if (m && m.role === 'user' && typeof m.content === 'string') {
        const extracted = extractFromUserMessage(m.content);
        if (extracted && Object.keys(extracted).length) {
          sessionsMeta[sid] = Object.assign({}, sessionsMeta[sid] || {}, extracted);
        }
        // Also try to parse membership and start date from the user's free text
        const parsedMembership = parseMembershipFromMessage(m.content);
        if (parsedMembership && Object.keys(parsedMembership).length) {
          sessionsMeta[sid] = Object.assign({}, sessionsMeta[sid] || {}, parsedMembership);
        }
      }
    }
    if (!sessionsMeta[sid]) sessionsMeta[sid] = {};

    // If we have a name and contact but haven't asked for membership plan/startDate yet, prompt the user
    const metaNow = sessionsMeta[sid];
    if (metaNow.name && metaNow.contact && !metaNow.membershipType && !metaNow.startDate && !metaNow.promptedForMembership) {
      metaNow.promptedForMembership = true;
      const prompt = `Which membership plan do you want to choose?\n1 Month\n3 Months\n6 Months\n12 Months\n\nPlease share your membership start date (today or a future date).`;
      // store assistant prompt in session history and return it immediately (don't call AI)
      sessions[sid].push({ role: 'assistant', content: prompt });
      return res.json({ sessionId: sid, aiReply: prompt, leadData: null, leadSent: false });
    }

    // If we already received membershipType + startDate directly from user messages, create member and forward to webhook
    if (metaNow.startDate && metaNow.membershipType && !metaNow.membershipSent) {
      const expiryDate = calculateExpiryDate(metaNow.startDate, metaNow.membershipType);
      const sheetPayload = {
        Name: metaNow.name || '',
        Phone: metaNow.contact || '',
        StartDate: metaNow.startDate || '',
        MembershipType: metaNow.membershipType || '',
        ExpiryDate: expiryDate || '',
        Status: 'Active'
      };
      const memberId = uuidv4();
      members[memberId] = Object.assign({ id: memberId }, sheetPayload);
      try {
        const sendResult = await sendLeadToWebhook(sheetPayload);
        metaNow.membershipSent = !!(sendResult && sendResult.ok);
        metaNow.expiryDate = expiryDate;
        // reply to user with confirmation including expiry date
        const reply = `Thanks ${metaNow.name || ''}! Your membership starts on ${metaNow.StartDate || metaNow.startDate} and expires on ${expiryDate}. You’ll receive automatic reminders as it approaches.`;
        sessions[sid].push({ role: 'assistant', content: reply });
        return res.json({ sessionId: sid, aiReply: reply, leadData: metaNow, leadSent: metaNow.membershipSent, expiryDate });
      } catch (err) {
        logger.warn('Failed to send membership to webhook', { err: err?.message, sheetPayload });
      }
    }

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
    let aiReply = await getAIReply(messagesForAI);
    logger.info({ sessionId: sid, aiReply });

    // Persist assistant reply into the session history so future requests have full convo
    try {
      sessions[sid].push({ role: 'assistant', content: aiReply });
    } catch (e) {
      logger.warn('Failed to append assistant reply to session', { sessionId: sid, err: e?.message });
    }

    // Extract lead data (may include optional membership fields)
    const leadData = extractLeadData(aiReply);
    let leadSent = false;
    let expiryDate = null;
    if (leadData) {
      // If membership information is present, calculate expiry and build member record
      if (leadData.startDate && leadData.membershipType) {
        expiryDate = calculateExpiryDate(leadData.startDate, leadData.membershipType);
        // Build object for Google Sheets / n8n webhook with required fields
        const sheetPayload = {
          Name: leadData.name || '',
          Phone: leadData.contact || '',
          StartDate: leadData.startDate || '',
          MembershipType: leadData.membershipType || '',
          ExpiryDate: expiryDate || '',
          Status: 'Active'
        };

        // Persist into in-memory members store
        const memberId = uuidv4();
        members[memberId] = Object.assign({ id: memberId }, sheetPayload);

        // Send to n8n webhook (Google Sheets) using proxy helper
        const sendResult = await sendLeadToWebhook(sheetPayload);
        leadSent = !!(sendResult && sendResult.ok);
        logger.info({ sessionId: sid, sheetPayload, leadSent, sendResult });

        // Make sure session meta also contains these values for later context
        sessionsMeta[sid] = Object.assign({}, sessionsMeta[sid] || {}, {
          name: leadData.name || '',
          contact: leadData.contact || '',
          startDate: leadData.startDate,
          membershipType: leadData.membershipType,
          expiryDate
        });

        // Append a short, clear expiry sentence to the AI reply so frontend displays it
        if (expiryDate) {
          aiReply = `${aiReply}\n\nYour membership expires on ${expiryDate}. You’ll receive automatic reminders as it approaches.`;
        }
      } else {
        // No membership fields — forward the extracted lead data as before
        const sendResult = await sendLeadToWebhook(leadData);
        leadSent = !!(sendResult && sendResult.ok);
        logger.info({ sessionId: sid, leadData, leadSent, sendResult });
        sessionsMeta[sid] = Object.assign({}, sessionsMeta[sid] || {}, leadData);
      }
    }

    // Return AI reply and lead status (include expiryDate if available)
    res.json({ sessionId: sid, aiReply, leadData, leadSent, expiryDate });
  } catch (err) {
    logger.error({ error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /members - create new member (or lead purchases a plan)
app.post('/members', async (req, res) => {
  try {
    const { name, phone, startDate, membershipType } = req.body || {};
    if (!name || !phone || !startDate || !membershipType) {
      return res.status(400).json({ error: 'Missing required fields: name, phone, startDate, membershipType' });
    }

    const expiryDate = calculateExpiryDate(startDate, membershipType);
    if (!expiryDate) return res.status(400).json({ error: 'Invalid startDate or membershipType' });

    const memberId = uuidv4();
    const member = { id: memberId, Name: name, Phone: phone, StartDate: startDate, MembershipType: membershipType, ExpiryDate: expiryDate, Status: 'Active' };
    members[memberId] = member;

    // Send to webhook
    try {
      await sendLeadToWebhook(member);
    } catch (err) {
      logger.warn('Failed to send member to webhook', { member, err: err?.message });
    }

    return res.json({ ok: true, member });
  } catch (err) {
    logger.error({ error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /members/:id - update/renew membership
app.put('/members/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !members[id]) return res.status(404).json({ error: 'Member not found' });
    const { startDate, membershipType, name, phone } = req.body || {};

    // Update fields if provided
    if (name) members[id].Name = name;
    if (phone) members[id].Phone = phone;
    if (startDate) members[id].StartDate = startDate;
    if (membershipType) members[id].MembershipType = membershipType;

    // Recalculate expiry if startDate or membershipType changed
    const sd = members[id].StartDate;
    const mt = members[id].MembershipType;
    const expiryDate = calculateExpiryDate(sd, mt);
    if (expiryDate) members[id].ExpiryDate = expiryDate;

    // Ensure status is Active
    members[id].Status = 'Active';

    // Send update to webhook
    try {
      await sendLeadToWebhook(members[id]);
    } catch (err) {
      logger.warn('Failed to send member update to webhook', { member: members[id], err: err?.message });
    }

    return res.json({ ok: true, member: members[id] });
  } catch (err) {
    logger.error({ error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

    // GET /session/:id - return stored session messages and metadata
    app.get('/session/:id', (req, res) => {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'Missing session id' });
      const convo = sessions[id] || [];
      const meta = sessionsMeta[id] || {};
      res.json({ sessionId: id, messages: convo, meta });
    });

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'FitGym AI Lead Assistant Backend' });
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
