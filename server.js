// N Studio — Generic API Relay Server
// ------------------------------------------------------------
// Purpose: browsers can't call most AI APIs directly (no CORS headers,
// or the provider requires server-side calls only). This relay solves
// that WITHOUT hardcoding any single provider's request/response shape —
// the browser sends {url, method, headers, body} and this server just
// forwards it, then returns the raw response. Your API keys stay in
// YOUR browser's localStorage and are sent per-request as headers —
// this server never stores or sees your keys persistently.
//
// Works with whichever provider(s) you personally have a paid/free key
// for: Claude (Anthropic), Kling aggregators, Google Veo, Runway,
// OpenAI images, or anything else — as long as the host is allowlisted
// below.
// ------------------------------------------------------------

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // reference photos can be several MB

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// ALLOWED HOSTS
// ------------------------------------------------------------
// For safety this is NOT an open proxy — only requests to hosts in this
// list are forwarded. Add a host here before using a new provider.
// Common ones are pre-filled; uncomment/add as needed.
// ------------------------------------------------------------
const ALLOWED_HOSTS = new Set([
  'api.anthropic.com',              // Claude (brain)
  'generativelanguage.googleapis.com', // Google Gemini (brain / image / video-adjacent)
  'api.openai.com',                 // OpenAI (brain / image)
  'openrouter.ai',                  // OpenRouter free models (brain)
  'api.segmind.com',                // Kling aggregator (video)
  'api.aimlapi.com',                // Kling aggregator (video)
  'api.evolink.ai',                 // Kling aggregator (video)
  'api.apiframe.ai',                // Kling aggregator (video)
  'api-singapore.klingai.com',      // Kling official (video) — needs JWT auth, see below
  'api.runwayml.com',               // Runway (video)
  'api.replicate.com',              // Replicate (video/image, many models)
  'fal.run',                        // fal.ai (video/image, many models)
  'queue.fal.run',                  // fal.ai async queue
  'api.sync.so',                    // Sync.so (lip-sync) — no browser CORS support, must go via relay
]);

// ------------------------------------------------------------
// MAIN RELAY ENDPOINT
// The frontend calls THIS endpoint instead of calling providers directly.
// Body shape: { url, method, headers, body }
// ------------------------------------------------------------
app.post('/relay', async (req, res) => {
  try {
    const { url, method, headers, body } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing url in request body.' });

    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid url.' });
    }

    if (!ALLOWED_HOSTS.has(hostname)) {
      return res.status(403).json({
        error: `Host not allowed: ${hostname}. Add it to ALLOWED_HOSTS in server.js and redeploy.`
      });
    }

    const upstreamMethod = (method || 'POST').toUpperCase();
    const fetchOptions = {
      method: upstreamMethod,
      headers: headers || {},
    };
    if (upstreamMethod !== 'GET' && upstreamMethod !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body || {});
    }

    const upstream = await fetch(url, fetchOptions);
    const contentType = upstream.headers.get('content-type') || 'application/json';
    const text = await upstream.text();

    res.status(upstream.status);
    res.set('Content-Type', contentType);
    res.send(text);
  } catch (err) {
    console.error('Relay error:', err);
    res.status(500).json({ error: 'Relay error: ' + err.message });
  }
});

// Simple health check
app.get('/', (req, res) => {
  res.send('N Studio relay server is running. Allowed hosts: ' + Array.from(ALLOWED_HOSTS).join(', '));
});

app.listen(PORT, () => {
  console.log(`N Studio relay server listening on port ${PORT}`);
});
