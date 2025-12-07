import React, { useState, useRef, useEffect } from 'react';
import { Send, Dumbbell, Users, Calendar, Award } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface LeadInfo {
  name: string;
  email: string;
  phone: string;
}

export default function GymLeadAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Hi! I'm your fitness assistant. Ready to transform your body and life? Tell me about your fitness goals!", sender: 'bot', timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLeadPopup, setShowLeadPopup] = useState(false);
  const [leadInfo, setLeadInfo] = useState<LeadInfo>({ name: '', email: '', phone: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceConfirm, setVoiceConfirm] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Restore session from localStorage on mount (if available)
  useEffect(() => {
    const sid = localStorage.getItem('fitgym_sessionId');
    if (sid) {
      setSessionId(sid);
      // fetch session messages from backend
      axios.get(`${API_BASE_URL}/session/${sid}`)
        .then(resp => {
          const data = resp.data;
          if (Array.isArray(data.messages) && data.messages.length) {
            // map server messages to local Message shape
            const mapped = data.messages
              .filter((m: any) => m.role && m.role !== 'system')
              .map((m: any, idx: number) => ({
                id: Date.now() + idx + 2,
                text: m.content,
                sender: m.role === 'user' ? 'user' : 'bot',
                timestamp: new Date()
              } as Message));
            setMessages(prev => {
              // Keep initial greeting, then loaded conversation
              const base = prev && prev.length ? prev.filter(p => p.id === 1) : [];
              return [...base, ...mapped];
            });
          }
        })
        .catch(err => {
          console.warn('Failed to restore session', err);
        });
    }
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const userMessage: Message = { id: Date.now(), text: inputValue, sender: 'user', timestamp: new Date() };
    // show immediately in UI
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setIsLoading(true);

    try {
      // Send only the new user message to backend. Backend keeps full session history server-side.
      const response = await axios.post(`${API_BASE_URL}/chat`, {
        sessionId: sessionId || undefined,
        messages: [{ role: 'user', content: inputValue }]
      });

      const data = response.data;
      // persist session id
      if (data.sessionId) {
        setSessionId(data.sessionId);
        try { localStorage.setItem('fitgym_sessionId', data.sessionId); } catch (e) {}
      }

      const botMessage: Message = { id: Date.now() + 1, text: data.aiReply || 'Sorry, I could not process your request.', sender: 'bot', timestamp: new Date() };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
      setIsLoading(false);

      if (data.leadData) setShowLeadPopup(true);
      if (messages.length >= 8 && !data.leadData) setTimeout(() => setShowLeadPopup(true), 1000);
    } catch (error: any) {
      setIsTyping(false);
      setIsLoading(false);
      const errorMessage: Message = { id: Date.now() + 1, text: error.response?.data?.error || "Sorry, I'm having trouble connecting. Please try again!", sender: 'bot', timestamp: new Date() };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // --- Voice agent integration (Web Speech API STT + SpeechSynthesis TTS) ---
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

  const parseLead = (text: string) => {
    const match = text.match(/LEAD_DATA:\s*([\s\S]*)/i);
    if (!match) return null;
    const body = match[1];
    const name = (body.match(/Name:\s*(.*)/i)||[])[1]||'';
    const contact = (body.match(/Contact:\s*(.*)/i)||[])[1]||'';
    const goal = (body.match(/Goal:\s*(.*)/i)||[])[1]||'';
    const intent = (body.match(/Intent:\s*(.*)/i)||[])[1]||'';
    const time = (body.match(/Time:\s*(.*)/i)||[])[1]||'';
    if (!name && !contact && !goal && !intent && !time) return null;
    return { name: name.trim(), contact: contact.trim(), goal: goal.trim(), intent: intent.trim(), time: time.trim() };
  };

  const sendLeadToN8n = async (lead: any) => {
    try {
      await axios.post(`${API_BASE_URL}/n8n`, lead);
      setVoiceConfirm(lead);
    } catch (err) {
      console.error('Failed to send lead to n8n proxy', err);
    }
  };

  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 1.0;
    utter.onend = () => {
      // resume recognition after speaking
      if (recognitionRef.current && !listening) {
        try { recognitionRef.current.start(); setListening(true); } catch(e){}
      }
    };
    utter.onerror = (e) => { console.error('TTS error', e); };
    // pause recognition while speaking
    try { recognitionRef.current?.stop(); } catch(e){}
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  };

  const sendUserText = async (text: string) => {
    if (!text || !text.trim()) return;
    const userMessage: Message = { id: Date.now(), text, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    setIsLoading(true);

    try {
      // send only the new user utterance; server maintains the session history
      const response = await axios.post(`${API_BASE_URL}/chat`, { sessionId: sessionId || undefined, messages: [{ role: 'user', content: text }] });
      const data = response.data;
      if (data.sessionId) {
        setSessionId(data.sessionId);
        try { localStorage.setItem('fitgym_sessionId', data.sessionId); } catch(e){}
      }
      const aiReplyText = data.aiReply || 'Sorry, I could not process your request.';
      const botMessage: Message = { id: Date.now()+1, text: aiReplyText, sender: 'bot', timestamp: new Date() };
      setMessages(prev => [...prev, botMessage]);

      // handle lead extraction
      if (/LEAD_DATA:/i.test(aiReplyText)) {
        const lead = parseLead(aiReplyText);
        if (lead) await sendLeadToN8n(lead);
      }

      // speak AI reply
      speakText(aiReplyText);
      setIsTyping(false);
      setIsLoading(false);
    } catch (err) {
      console.error('Voice agent send error', err);
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  const startRecognition = () => {
    if (!SpeechRecognition) { alert('SpeechRecognition not supported in this browser. Use Chrome/Edge.'); return; }
    if (recognitionRef.current) {
      try { recognitionRef.current.start(); setListening(true); } catch(e){}
      return;
    }
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = true;

    r.onstart = () => { setListening(true); setInterimTranscript(''); };
    r.onerror = (e: any) => { console.error('Recognition error', e); setListening(false); };
    r.onend = () => { setListening(false); };

    let interim = '';
    r.onresult = (event: any) => {
      interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const t = res[0].transcript.trim();
        if (res.isFinal) {
          setInterimTranscript('');
          sendUserText(t);
        } else {
          interim += t + ' ';
          setInterimTranscript(interim);
        }
      }
    };

    recognitionRef.current = r;
    try { r.start(); setListening(true); } catch(e) { console.error('Failed to start recognition', e); }
  };

  const stopRecognition = () => {
    try { recognitionRef.current?.stop(); } catch(e){}
    setListening(false);
    setInterimTranscript('');
  };

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch(e){}
      recognitionRef.current = null;
    };
  }, []);

  // Auto-start voice listening on mount
  useEffect(() => {
    // Delay slightly to ensure component is fully mounted
    const timer = setTimeout(() => {
      startRecognition();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLeadSubmit = async () => {
    if (leadInfo.name && leadInfo.email && leadInfo.phone) {
      try {
        // Build a lead payload and forward to n8n proxy
        const leadPayload = { name: leadInfo.name, contact: leadInfo.email || leadInfo.phone, goal: '', intent: '', time: '' };
        try {
          await axios.post(`${API_BASE_URL}/n8n`, leadPayload);
          setVoiceConfirm(leadPayload);
        } catch (err) {
          console.warn('n8n forwarding failed (will continue):', err);
        }

        // Also inform the chat session (so AI has context) using a LEAD_DATA block
        try {
          await axios.post(`${API_BASE_URL}/chat`, {
            sessionId: sessionId || undefined,
            messages: [
              {
                role: 'user',
                content: `LEAD_DATA:\nName: ${leadInfo.name}\nContact: ${leadInfo.email || leadInfo.phone}\nGoal:\nIntent:\nTime:`
              }
            ]
          });
        } catch (err) {
          console.warn('chat notify failed (non-blocking):', err);
        }

        setShowLeadPopup(false);

        const confirmMessage: Message = {
          id: Date.now(),
          text: `Thanks ${leadInfo.name}! 🎉 We've received your information. Our team will contact you within 24 hours to schedule your FREE consultation and gym tour!`,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmMessage]);
        setLeadInfo({ name: '', email: '', phone: '' });
      } catch (error) {
        console.error('Lead submission error:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-gray-700">
        <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20"></div>
        <div className="relative max-w-6xl mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Dumbbell className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">IRON FORGE GYM</h1>
                <p className="text-gray-400 text-sm">Transform Your Body, Elevate Your Life</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all duration-300 shadow-lg shadow-red-600/50">
                Join Now
              </button>
              <button className="px-6 py-3 border-2 border-red-600 rounded-lg font-semibold hover:bg-red-600/20 transition-all duration-300">
                Free Trial
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Users, label: '5000+ Members', value: 'Active' },
              { icon: Award, label: 'Certified Trainers', value: '50+' },
              { icon: Calendar, label: 'Classes/Week', value: '200+' },
              { icon: Dumbbell, label: 'Equipment', value: 'Premium' }
            ].map((stat, idx) => (
              <div key={idx} className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <stat.icon className="w-6 h-6 text-red-500 mb-2" />
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">AI Fitness Assistant</h3>
                  <p className="text-xs text-gray-400">Online • Ready to help you succeed</p>
                </div>
              </div>
              {sessionId && <span className="text-xs text-gray-500">Session: {sessionId.slice(0, 8)}</span>}
            </div>
          </div>

          {/* Messages Container */}
          <div 
            ref={chatContainerRef}
            className="h-[500px] overflow-y-auto p-6 space-y-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 #111827' }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-br-none'
                      : 'bg-gray-700/50 text-gray-100 rounded-bl-none border border-gray-600'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.text}</p>
                  <span className="text-xs opacity-60 mt-1 block">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-700/50 rounded-2xl rounded-bl-none px-5 py-3 border border-gray-600">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="bg-gray-800/50 backdrop-blur-sm px-6 py-4 border-t border-gray-700">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                />
                {interimTranscript && (
                  <div className="text-xs text-teal-300 mt-1">Live: {interimTranscript}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (listening) stopRecognition(); else startRecognition();
                  }}
                  title="Start/Stop voice"
                  className={`px-4 py-3 rounded-xl border ${listening ? 'bg-teal-600 text-white' : 'bg-gray-700/30 text-white'} hover:opacity-90`}
                >
                  {listening ? '🟢 Listening' : '🎤 Voice'}
                </button>

                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputValue.trim()}
                  className="bg-gradient-to-r from-red-600 to-orange-600 rounded-xl px-6 py-3 font-semibold hover:from-red-700 hover:to-orange-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-600/30"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Lead Popup */}
      {/* Voice lead confirmation (sent automatically when AI outputs LEAD_DATA) */}
      {voiceConfirm && (
        <div className="fixed bottom-6 right-6 bg-teal-700/90 text-white rounded-lg p-4 z-50 shadow-lg">
          <div className="font-semibold">Lead forwarded</div>
          <div className="text-sm">{voiceConfirm.name} — {voiceConfirm.contact}</div>
        </div>
      )}
      {showLeadPopup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-md w-full border border-gray-700 shadow-2xl animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Claim Your FREE Consultation!</h2>
              <p className="text-gray-400">Get personalized training plan + gym tour</p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Full Name"
                value={leadInfo.name}
                onChange={(e) => setLeadInfo({ ...leadInfo, name: e.target.value })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={leadInfo.email}
                onChange={(e) => setLeadInfo({ ...leadInfo, email: e.target.value })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={leadInfo.phone}
                onChange={(e) => setLeadInfo({ ...leadInfo, phone: e.target.value })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLeadPopup(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-600 rounded-xl font-semibold hover:bg-gray-700/50 transition-all duration-300"
                >
                  Later
                </button>
                <button
                  onClick={handleLeadSubmit}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 rounded-xl font-semibold hover:from-red-700 hover:to-orange-700 transition-all duration-300 shadow-lg shadow-red-600/50"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="max-w-6xl mx-auto px-4 py-6 mt-12 border-t border-gray-800">
        <div className="text-center text-gray-500 text-sm">
          <p>Powered by <span className="text-red-500 font-semibold">FitTech AI Solutions</span></p>
          <p className="mt-1">© 2024 Iron Forge Gym. Premium AI-Powered Lead Generation Demo</p>
        </div>
      </footer>
    </div>
  );
}