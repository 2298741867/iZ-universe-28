import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const CHAT_RATE_LIMIT = 10;
const CHAT_RATE_WINDOW_MS = 60_000;
const CHAT_GLOBAL_RATE_LIMIT = 60;
const MAX_RATE_LIMIT_CLIENTS = 5_000;
const MAX_CONCURRENT_CHAT_REQUESTS = 20;
const MAX_CHAT_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;

const chatRequestCounts = new Map<string, { windowStartedAt: number; count: number }>();
let activeChatRequests = 0;
let lastRateLimitCleanupAt = 0;
let globalChatRequestWindow = { windowStartedAt: Date.now(), count: 0 };

function getPort(): number {
  const portIndex = process.argv.indexOf('--port');
  if (portIndex !== -1 && process.argv[portIndex + 1]) {
    const parsed = parseInt(process.argv[portIndex + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return parseInt(process.env.PORT || '3000', 10);
}

const port = getPort();

app.use(express.json({ limit: '16kb' }));

function limitChatResources(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (activeChatRequests >= MAX_CONCURRENT_CHAT_REQUESTS) {
    return res.status(503).json({ error: 'Chat service is busy. Please try again shortly.' });
  }

  const now = Date.now();
  if (now - globalChatRequestWindow.windowStartedAt >= CHAT_RATE_WINDOW_MS) {
    globalChatRequestWindow = { windowStartedAt: now, count: 0 };
  }
  if (globalChatRequestWindow.count >= CHAT_GLOBAL_RATE_LIMIT) {
    return res.status(429).json({ error: 'Chat request capacity reached. Please try again later.' });
  }

  const clientIp = req.socket.remoteAddress || 'unknown';
  let clientRequests = chatRequestCounts.get(clientIp);

  if (!clientRequests && chatRequestCounts.size >= MAX_RATE_LIMIT_CLIENTS) {
    if (now - lastRateLimitCleanupAt >= CHAT_RATE_WINDOW_MS) {
      lastRateLimitCleanupAt = now;
      for (const [ip, requests] of chatRequestCounts) {
        if (now - requests.windowStartedAt >= CHAT_RATE_WINDOW_MS) {
          chatRequestCounts.delete(ip);
        }
      }
    }

    if (chatRequestCounts.size >= MAX_RATE_LIMIT_CLIENTS) {
      return res.status(503).json({ error: 'Chat service is temporarily unavailable.' });
    }
  }

  if (!clientRequests || now - clientRequests.windowStartedAt >= CHAT_RATE_WINDOW_MS) {
    clientRequests = { windowStartedAt: now, count: 0 };
  }

  if (clientRequests.count >= CHAT_RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many chat requests. Please try again later.' });
  }

  clientRequests.count += 1;
  chatRequestCounts.set(clientIp, clientRequests);
  globalChatRequestWindow.count += 1;
  activeChatRequests += 1;
  next();
}

// Initialize Gemini Client with server-side SDK
const apiKey = process.env.GEMINI_API_KEY || '';
const isValidKey = apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 10;
let ai: GoogleGenAI | null = null;
if (isValidKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Pollux AI Copilot chat endpoint
app.post('/api/pollux/chat', limitChatResources, async (req, res) => {
  try {
    const { messages, flightTelemetry } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_CHAT_MESSAGES) {
      return res.status(400).json({ error: `Messages array must contain 1 to ${MAX_CHAT_MESSAGES} items.` });
    }

    if (messages.some((message: unknown) =>
      !message ||
      typeof message !== 'object' ||
      !('role' in message) ||
      !('content' in message) ||
      !['user', 'assistant'].includes(message.role as string) ||
      typeof message.content !== 'string' ||
      message.content.length > MAX_MESSAGE_LENGTH
    )) {
      return res.status(400).json({ error: 'Each message must have a valid role and content of at most 4000 characters.' });
    }

    if (!ai) {
      // In case API key is not configured, provide an intelligent in-character fallback response
      return res.json({
        reply: "Copilot Pollux here! Telemetry link established. All flight vectors, antigravity repulsion shields, and plasma blasters are nominal. (Tip: Connect your Gemini API Key in Settings > Secrets for full conversational neural-link).",
      });
    }

    const systemInstruction = `You are "Pollux", the advanced cybernetic AI flight copilot and multi-cloud planetary tactical advisor onboard the AGP-1 Antigravity starcraft.
Personality: Sharp, tactical, encouraging, cool sci-fi aesthetic, concise (2-4 sentences max per response unless the user asks for deep technical explanation).
Game Mechanics Knowledge:
- Ship Movement: Cursor / touch tracks onto the Y=0 plane; banking rolls laterally with velocity.
- Weapons: Dual plasma blasters (Left-click or F key or touch Fire) to blast and disintegrate incoming gravity wells / rogue planetary cores into debris.
- Antigravity Shield: Spacebar or Shield touch button repels all wells within radius 5.0. Consumes 20%/s energy, regenerates at 5%/s.
- Near-Misses: Passing within radius 2.0 without collision awards bonus points.
- Collision: Event horizon core radius 1.0 is fatal.
- Multi-Cloud: The Antigravity Protocol (AGP) neutralizes data gravity across GCP, AWS, Azure, and Sovereign Edge nodes, enabling zero-inertia rebalancing.

Current telemetry context: ${JSON.stringify(flightTelemetry || { status: 'flight nominal' })}.
Always answer in character as Pollux.`;

    // Construct history for multi-turn chat
    const chatContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let reply = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: chatContents,
        config: {
          systemInstruction,
        },
      });
      reply = response.text || '';
    } catch (e) {
      // Fall back to gemini-3.1-flash-lite if 3.8-flash is busy
      try {
        const responseLite = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: chatContents,
          config: {
            systemInstruction,
          },
        });
        reply = responseLite.text || '';
      } catch (liteErr) {
        throw liteErr;
      }
    }

    if (!reply) {
      reply = "Pollux: Sensors recalibrating... telemetry stream steady.";
    }
    return res.json({ reply });
  } catch (error: any) {
    console.error('Error in /api/pollux/chat:', error);
    return res.status(500).json({
      error: error?.message || 'Pollux copilot communication link degraded.',
      reply: "Pollux: Graviton flux interference detected in communications array. All defense systems remain functional.",
    });
  } finally {
    activeChatRequests -= 1;
  }
});

// Cloud Run deployment health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime(), service: 'antigravity-server' });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtml = path.resolve(distPath, 'index.html');
    app.use(express.static(distPath));
    app.use(express.static(path.resolve(__dirname, 'public')));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.sendFile(path.resolve(__dirname, 'index.html'));
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
