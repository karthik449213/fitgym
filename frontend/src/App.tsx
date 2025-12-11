import { Dumbbell, Users, Calendar, Award } from 'lucide-react';
import FloatingChatbot from './components/FloatingChatbot';

export default function GymLeadAssistant() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white flex flex-col">
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

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Welcome to Iron Forge Gym</h2>
          <p className="text-xl text-gray-400 mb-8">
            Click the chat button to get started. Our AI fitness assistant is ready to answer your questions about memberships, training programs, and help you transform your fitness journey.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 flex-1 min-w-[200px]">
              <Dumbbell className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Expert Training</h3>
              <p className="text-sm text-gray-400">Personalized workout plans</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 flex-1 min-w-[200px]">
              <Users className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Community</h3>
              <p className="text-sm text-gray-400">Join thousands of members</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 flex-1 min-w-[200px]">
              <Award className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Results</h3>
              <p className="text-sm text-gray-400">Transform your body</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="border-t border-gray-800 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>Powered by <span className="text-red-500 font-semibold">FitTech AI Solutions</span></p>
          <p className="mt-1">© 2024 Iron Forge Gym. Premium AI-Powered Lead Generation Demo</p>
        </div>
      </footer>

      {/* Floating Chatbot */}
      <FloatingChatbot />
    </div>
  );
}
