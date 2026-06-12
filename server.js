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

// ─── Website fetcher ─────────────────────────────────────────────────────────
// Fetches a user's website and strips it down to readable text so the AI can
// reference what their site ACTUALLY says, instead of guessing.
async function fetchWebsiteText(url) {
  try {
    // Basic sanity check on the URL
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    // Fetch with a 20-second timeout — WordPress sites can be slow to respond,
    // and a skipped fetch means a less specific playbook
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HeySheilaBrandBot/1.0)'
      },
      redirect: 'follow'
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();

    // Strip scripts, styles, and tags down to readable text
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Cap at ~3000 characters — enough to understand the brand voice and
    // structure without blowing up the prompt
    if (text.length > 3000) text = text.slice(0, 3000) + '...';

    return text.length > 100 ? text : null; // ignore near-empty pages
  } catch (err) {
    console.log('Website fetch skipped:', err.message);
    return null; // Never let a failed fetch break the playbook
  }
}

// The one endpoint your HTML file talks to
app.post('/api/chat', async (req, res) => {
  const { system, message, fetchUrl } = req.body;

  if (!system || !message) {
    return res.status(400).json({ error: 'Missing system or message' });
  }

  try {
    // If the frontend passed a website URL, fetch its actual content
    let finalMessage = message;
    if (fetchUrl) {
      const siteText = await fetchWebsiteText(fetchUrl);
      if (siteText) {
        finalMessage += `\n\n--- ACTUAL WEBSITE CONTENT (fetched from ${fetchUrl}) ---\n${siteText}`;
      } else {
        finalMessage += `\n\n--- WEBSITE NOTE ---\nA website URL was provided (${fetchUrl}) but its content could not be fetched. Do NOT claim to have seen this website.`;
      }
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: system,
      messages: [{ role: 'user', content: finalMessage }]
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
