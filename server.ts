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

function getPort(): number {
  const portIndex = process.argv.indexOf('--port');
  if (portIndex !== -1 && process.argv[portIndex + 1]) {
    const parsed = parseInt(process.argv[portIndex + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return parseInt(process.env.PORT || '3000', 10);
}

const port = getPort();

app.use(express.json());

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
app.post('/api/pollux/chat', async (req, res) => {
  try {
    const { messages, flightTelemetry } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required.' });
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
