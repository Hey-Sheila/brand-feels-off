import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json());

// Allow requests from any website (required for your HTML to talk to this server)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Your Anthropic API key is stored safely in Render's environment variables
// (never in this file — that's the whole point!)
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The one endpoint your HTML file talks to
app.post('/api/chat', async (req, res) => {
  const { system, message } = req.body;

  if (!system || !message) {
    return res.status(400).json({ error: 'Missing system or message' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: system,
      messages: [{ role: 'user', content: message }]
    });

    const reply = response.content.map(b => b.text || '').join('');
    res.json({ reply });

  } catch (err) {
    console.error('Anthropic error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Health check — Render uses this to confirm the server is running
app.get('/', (req, res) => res.send('HeySheila brand wizard backend is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
