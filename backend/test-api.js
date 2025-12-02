// Test API for FitGym Backend
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testChat() {
  // Simulate a conversation
  let sessionId = null;
  const messages = [
    { role: 'user', content: 'Hi, I want to join the gym.' },
    { role: 'user', content: 'My name is John Doe.' },
    { role: 'user', content: 'I want to lose weight.' },
    { role: 'user', content: 'I am a beginner.' },
    { role: 'user', content: 'Evenings are best for me.' },
    { role: 'user', content: 'My contact is john@example.com.' }
  ];

  try {
    // First request
    const res1 = await axios.post(`${BASE_URL}/chat`, { messages });
    sessionId = res1.data.sessionId;
    console.log('AI Reply:', res1.data.aiReply);
    if (res1.data.leadData) {
      console.log('Lead Data:', res1.data.leadData);
    }

    // Continue conversation (if needed)
    if (!res1.data.leadData) {
      const moreMessages = [
        { role: 'user', content: 'My phone is 1234567890.' }
      ];
      const res2 = await axios.post(`${BASE_URL}/chat`, { sessionId, messages: moreMessages });
      console.log('AI Reply:', res2.data.aiReply);
      if (res2.data.leadData) {
        console.log('Lead Data:', res2.data.leadData);
      }
    }
  } catch (err) {
    console.error('Test failed:', err.response?.data || err.message);
  }
}

testChat();
