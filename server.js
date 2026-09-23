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
// 50mb: base64-encoding a binary upload (Sync.so lip-sync video/audio bytes, forwarded
// through this relay because the presigned storage bucket has no browser CORS) inflates
// its size by ~33%, so this needs real headroom beyond the reference-photo case alone.
app.use(express.json({ limit: '50mb' }));

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
  'api.elevenlabs.io',              // ElevenLabs (alternate voice-clone TTS, incl. Burmese)
]);

// Sync.so's presign step hands back a one-time upload URL on ITS storage bucket, not on
// api.sync.so itself — the exact hostname is provider-controlled and can vary, so it can't
// be pinned to a single fixed entry above. That bucket also has no browser CORS (confirmed
// by a real "Failed to fetch" on a direct PUT), so uploads have to go through this relay
// too. Rather than allowlisting an unknown arbitrary host, only allow it when it matches a
// known cloud-storage provider's domain pattern — this keeps the relay from becoming an
// open proxy while still covering wherever Sync.so's bucket actually lives.
const ALLOWED_HOST_PATTERNS = [
  /(^|\.)amazonaws\.com$/,             // AWS S3
  /(^|\.)storage\.googleapis\.com$/,   // Google Cloud Storage
  /(^|\.)r2\.cloudflarestorage\.com$/, // Cloudflare R2
  /(^|\.)digitaloceanspaces\.com$/,    // DigitalOcean Spaces
  /(^|\.)backblazeb2\.com$/,           // Backblaze B2
];
function isHostAllowed(hostname){
  return ALLOWED_HOSTS.has(hostname) || ALLOWED_HOST_PATTERNS.some(p => p.test(hostname));
}

// ------------------------------------------------------------
// MAIN RELAY ENDPOINT
// The frontend calls THIS endpoint instead of calling providers directly.
// Body shape: { url, method, headers, body }
// ------------------------------------------------------------
app.post('/relay', async (req, res) => {
  try {
    const { url, method, headers, body, bodyEncoding } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing url in request body.' });

    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid url.' });
    }

    if (!isHostAllowed(hostname)) {
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
      // bodyEncoding:'base64' means `body` is raw binary (e.g. a file upload to a
      // presigned URL) that got base64-wrapped to survive the JSON envelope — decode it
      // back to real bytes instead of re-stringifying it as JSON text.
      if (bodyEncoding === 'base64' && typeof body === 'string') {
        fetchOptions.body = Buffer.from(body, 'base64');
      } else {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body || {});
      }
    }

    const upstream = await fetch(url, fetchOptions);
    const contentType = upstream.headers.get('content-type') || 'application/json';

    // Most providers here return text/JSON, which the existing text() + res.send(text)
    // path below handles fine. ElevenLabs' TTS endpoint is the first one that returns
    // raw binary audio bytes directly (no JSON envelope) — reading that as text() would
    // corrupt it (binary decoded as UTF-8 loses/mangles bytes). Detect that case and
    // base64-wrap it in a small JSON envelope instead, so callRelay's existing
    // text()-then-JSON.parse() client logic keeps working unchanged for every provider,
    // and only a binary-aware caller needs to know to unwrap { __binary, base64 }.
    const isBinaryResponse = /^(audio|video|image)\//.test(contentType) || contentType === 'application/octet-stream';
    if (isBinaryResponse) {
      const arrayBuffer = await upstream.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      res.status(upstream.status);
      res.set('Content-Type', 'application/json');
      res.json({ __binary: true, contentType, base64 });
      return;
    }

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
