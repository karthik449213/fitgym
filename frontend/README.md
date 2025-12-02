# FitGym Frontend

Production-ready React frontend for Fitness Gym AI Lead Assistant.

## Setup Instructions

### 1. Install Dependencies
```bash
cd d:\gym\fitgym\frontend
npm install
```

### 2. Configure Backend URL
The frontend is configured to connect to `http://localhost:3000`. Update `src/App.tsx` line 7 if using a different backend URL:

```typescript
const API_BASE_URL = 'http://localhost:3000';
```

### 3. Start Development Server
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

## Features

✅ Real-time chat with Groq AI backend
✅ Session-based conversation history
✅ Lead data extraction and capture
✅ Responsive design with Tailwind CSS
✅ TypeScript support
✅ Lucide React icons
✅ Automatic lead popup after conversation
✅ Error handling and loading states

## Architecture

- **Frontend Framework**: React 18 + TypeScript
- **Bundler**: Vite
- **Styling**: Tailwind CSS + PostCSS
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Backend Integration**: REST API at `/chat` endpoint

## API Integration

### POST /chat
Sends user messages and receives AI responses.

**Request:**
```json
{
  "sessionId": "optional-uuid",
  "messages": [
    { "role": "user", "content": "message text" },
    { "role": "assistant", "content": "response text" }
  ]
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "aiReply": "AI response text",
  "leadData": { "name": "...", "contact": "...", "goal": "...", "intent": "...", "time": "..." },
  "leadSent": true
}
```

## Development

- TypeScript for type safety
- React hooks for state management
- Axios for API calls with error handling
- Responsive mobile-first design
- Auto-scroll to latest messages
- Real-time typing indicator

## Production Deployment

1. Build the project: `npm run build`
2. Deploy `dist/` folder to static hosting (Netlify, Vercel, AWS S3, etc.)
3. Ensure backend API is accessible from your frontend domain
4. Update CORS settings in backend if needed
