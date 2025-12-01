import  { useState, useRef, useEffect } from 'react';
import { Dumbbell, Send, X, Check } from 'lucide-react';

export default function GymAIAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: "Hey there! 💪 I'm your personal fitness assistant. Looking to transform your body and reach your goals? I'm here to help you find the perfect membership plan!",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLeadPopup, setShowLeadPopup] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '' });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setIsLoading(true);

    try {
      // Simulated API call - replace with your actual endpoint
      const response = await fetch('http:localhost:3000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: inputValue })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      setTimeout(() => {
        const botMessage = {
          id: Date.now() + 1,
          type: 'bot',
          text: data.response || "That's great! I'd love to help you get started. Let me connect you with our team to create your personalized fitness plan!",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
        
        // Show lead popup after bot responds
        setTimeout(() => {
          setShowLeadPopup(true);
        }, 1000);
      }, 1500);

    } catch (error) {
      console.error('Error:', error);
      
      // Fallback response on error
      setTimeout(() => {
        const botMessage = {
          id: Date.now() + 1,
          type: 'bot',
          text: "I'm excited to help you start your fitness journey! Let me get some quick details so we can create the perfect plan for you.",
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
        
        setTimeout(() => {
          setShowLeadPopup(true);
        }, 1000);
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLeadSubmit = () => {
    if (!leadData.name || !leadData.email || !leadData.phone) {
      alert('Please fill in all fields');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      alert('Please enter a valid email address');
      return;
    }

    // Phone validation (basic)
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    if (!phoneRegex.test(leadData.phone)) {
      alert('Please enter a valid phone number');
      return;
    }

    // Here you would send lead data to your backend
    console.log('Lead captured:', leadData);
    
    setShowLeadPopup(false);
    
    const confirmMessage = {
      id: Date.now() + 2,
      type: 'bot',
      text: `Awesome, ${leadData.name}! 🎉 We've got your details. Our fitness experts will reach out to you shortly at ${leadData.email}. Get ready to transform your life!`,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, confirmMessage]);
    setLeadData({ name: '', email: '', phone: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Hero Section */}
      <header className="relative bg-gradient-to-r from-red-600 to-orange-500 py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="flex items-center justify-center mb-6">
            <Dumbbell className="w-16 h-16 mr-4" />
            <h1 className="text-5xl md:text-6xl font-black tracking-tight">IRONFIT GYM</h1>
          </div>
          <p className="text-xl md:text-2xl font-light mb-8">Transform Your Body. Transform Your Life.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-red-600 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-all transform hover:scale-105 shadow-xl">
              JOIN NOW - 50% OFF
            </button>
            <button className="bg-transparent border-2 border-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-red-600 transition-all transform hover:scale-105">
              FREE 7-DAY TRIAL
            </button>
          </div>
        </div>
      </header>

      {/* Chat Interface */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mr-3">
                <Dumbbell className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Fitness Assistant</h3>
                <p className="text-sm text-red-100">Online • Ready to help</p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="h-96 overflow-y-auto p-6 space-y-4 bg-gray-900">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-br-none'
                      : 'bg-gray-700 text-gray-100 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm md:text-base">{message.text}</p>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-none">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-gray-800 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about memberships, classes, or get started..."
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-400"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-3 rounded-lg hover:from-red-700 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Lead Capture Popup */}
      {showLeadPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full p-8 relative border border-gray-700 shadow-2xl">
            <button
              onClick={() => setShowLeadPopup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-red-600 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Let's Get You Started! 🚀</h3>
              <p className="text-gray-300">Enter your details and we'll create your personalized fitness plan</p>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Full Name</label>
                <input
                  type="text"
                  value={leadData.name}
                  onChange={(e) => setLeadData({ ...leadData, name: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Email Address</label>
                <input
                  type="email"
                  value={leadData.email}
                  onChange={(e) => setLeadData({ ...leadData, email: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Phone Number</label>
                <input
                  type="tel"
                  value={leadData.phone}
                  onChange={(e) => setLeadData({ ...leadData, phone: e.target.value })}
                  className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <button
                onClick={handleLeadSubmit}
                type="button"
                className="w-full bg-gradient-to-r from-red-600 to-orange-500 text-white font-bold py-4 rounded-lg hover:from-red-700 hover:to-orange-600 transition-all transform hover:scale-105 shadow-lg"
              >
                CLAIM MY FREE CONSULTATION
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              Your information is safe and will never be shared
            </p>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="text-center py-8 px-4 text-gray-500">
        <p className="text-sm">Powered by <span className="text-red-500 font-semibold">FitAI Agency</span> • Premium Lead Generation Solutions</p>
      </footer>
    </div>
  );
}