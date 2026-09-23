# N Studio Relay Server

This tiny server solves one problem: most AI APIs (Claude, Kling, video
generation providers, some image providers) either don't allow browsers
to call them directly (no CORS headers) or explicitly require
server-side calls. This relay forwards whatever request N Studio sends
to the real provider and returns the response — **your API keys never
touch this server's storage**, they're sent per-request as headers
straight from your browser's localStorage, through this relay, to the
provider, and back.

It works with **any provider you personally have a key for**, as long
as the provider's domain is in the allowlist in `server.js`.

---

## 1. Deploy it (free tier is enough)

### Render.com (recommended)
1. Create a free account at https://render.com
2. Push this folder to a GitHub repo
3. **New → Web Service** → connect the repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy — you'll get a URL like `https://n-studio-relay.onrender.com`

### Railway.app
Same idea — connect the repo, deploy, get a URL.

No environment variables are required — this server holds no secrets.

---

## 2. Point N Studio at your relay

In N Studio's **AI Engine Settings** sidebar panel, there's a **"Relay
Server URL"** field. Paste your deployed URL there (e.g.
`https://n-studio-relay.onrender.com`) and save. Any provider you
configure that needs the relay (Claude, Kling, Veo, etc.) will now work.

---

## 3. Adding a new provider

If you sign up for a provider whose domain isn't already allowlisted:

1. Open `server.js`
2. Add the domain (just the hostname, e.g. `api.runwayml.com`) to the
   `ALLOWED_HOSTS` set
3. Commit and push — Render/Railway auto-redeploys

Common ones are already included: Claude, Gemini, OpenAI, OpenRouter,
several Kling aggregators (Segmind, AI/ML API, EvoLink, Apiframe),
Runway, Replicate, fal.ai.

---

## 4. About Kling specifically

Kling's **official** API (`api-singapore.klingai.com`) uses JWT
authentication signed from an Access Key + Secret Key pair — this is
more setup than a simple Bearer token. N Studio's "Custom" video
provider slot lets you configure this if you want to sign your own JWT
client-side, but it's easier to start with a **Kling aggregator**
(Segmind, AI/ML API, EvoLink, Apiframe) — they wrap Kling behind a
simple Bearer-token API key, which N Studio's built-in Kling preset is
designed around.

---

## 5. Security notes

- This is **not an open proxy** — only allowlisted hosts are forwarded.
  Don't remove that check.
- No API keys are logged or stored server-side.
- If you want extra protection, you can add your own simple auth check
  (e.g. a shared secret header) in front of `/relay` — not included by
  default since this is meant for personal/single-user use.

---

## 6. Cost

Render/Railway free tier: $0/month for light use (may sleep after
inactivity; a paid tier ~$7/month keeps it always-on). This relay
itself does no AI processing, so it adds no per-request cost beyond
hosting — you pay each provider directly for what you use.
