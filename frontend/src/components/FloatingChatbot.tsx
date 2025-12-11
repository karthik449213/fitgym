import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      text: "Hi! I'm your fitness assistant. Ready to transform your body and life? Tell me about your fitness goals!",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Restore session from localStorage on mount
  useEffect(() => {
    const sid = localStorage.getItem('fitgym_sessionId');
    if (sid) {
      setSessionId(sid);
      axios.get(`${API_BASE_URL}/session/${sid}`)
        .then(resp => {
          const data = resp.data;
          if (Array.isArray(data.messages) && data.messages.length) {
            const mapped = data.messages
              .filter((m: any) => m.role && m.role !== 'system')
              .map((m: any, idx: number) => ({
                id: Date.now() + idx + 2,
                text: m.content,
                sender: m.role === 'user' ? 'user' : 'bot',
                timestamp: new Date()
              } as ChatMessage));
            setMessages(prev => {
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
    const userMessage: ChatMessage = { id: Date.now(), text: inputValue, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/chat`, {
        sessionId: sessionId || undefined,
        messages: [{ role: 'user', content: inputValue }]
      });

      const data = response.data;
      if (data.sessionId) {
        setSessionId(data.sessionId);
        try { localStorage.setItem('fitgym_sessionId', data.sessionId); } catch (e) {}
      }

      if (data.reply) {
        const botMessage: ChatMessage = {
          id: Date.now(),
          text: data.reply,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: Date.now(),
        text: "Sorry, I encountered an error. Please try again.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported');
      return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
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
          setInputValue(prev => prev + (prev ? ' ' : '') + t);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 z-40 flex items-center justify-center group"
        aria-label="Open chat"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">1</span>
          </>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 bg-gray-900 rounded-2xl shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom-4 duration-300 border border-gray-800 max-h-96 md:max-h-[500px]">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 rounded-t-2xl p-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-lg">AI Fitness Assistant</h3>
              <p className="text-red-100 text-sm">Online • Ready to help</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-red-700 p-2 rounded-lg transition-colors"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-900" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 #111827' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-3 rounded-lg ${
                    msg.sender === 'user'
                      ? 'bg-red-600 text-white rounded-br-none'
                      : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-red-100' : 'text-gray-500'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 text-gray-100 px-4 py-3 rounded-lg rounded-bl-none border border-gray-700">
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
          <div className="bg-gray-800/50 backdrop-blur-sm px-4 py-3 border-t border-gray-700 rounded-b-2xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={() => {
                  if (listening) stopRecognition(); else startRecognition();
                }}
                title="Start/Stop voice"
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${listening ? 'bg-teal-600 text-white border-teal-600' : 'bg-gray-700/50 text-white border-gray-600'} hover:opacity-90`}
              >
                {listening ? '🎤' : '🎤'}
              </button>
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg p-2 transition-colors flex items-center justify-center"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            {interimTranscript && (
              <div className="text-xs text-teal-300 mt-2">Live: {interimTranscript}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
