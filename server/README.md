---
title: Buckshot
emoji: 🔫
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# 🔫 Bugshot Roulette Core Server

High-performance real-time multiplayer backend and API gateway for **Bugshot Roulette**, engineered with Node.js, Express, and Socket.io. Pre-configured for turnkey 100% compatible deployment on **Hugging Face Spaces** (Docker SDK), Cloudflare Pages, Vercel, and containerized cloud platforms.

---

## 🚀 Features & Architecture

- **Low-Latency Game State Synchronization**: Real-time 2-4 player lobbies, turnkey turn validation, chamber physics replication, and card/item execution via Socket.io.
- **Hugging Face Spaces Native**: Pre-configured for standard port `7860` with full reverse proxy IP forwarding (`app.set('trust proxy', true)`).
- **Comprehensive Health Checks**: Probing endpoints `GET /health`, `GET /healthz`, and `HEAD /` returning uptime and status for automated cloud container monitors.
- **Universal CORS Matrix**: Out-of-the-box origin authorization for Hugging Face Spaces (`*.hf.space`), Vercel (`*.vercel.app`), Cloudflare Pages (`*.pages.dev`), Google AI Studio (`aistudio.google.com`, `*.google.com`, `*.googleusercontent.com`), Localhost (`localhost`, `127.0.0.1`), LAN IPs, and custom `ALLOWED_ORIGINS`.
- **Production Hardened**:
  - Graceful shutdown handlers for `SIGTERM` and `SIGINT` (flushing client states, clearing disconnect timers, closing HTTP/socket servers cleanly).
  - Process-level protection against `uncaughtException` and `unhandledRejection` with structured logging.
  - Leak-free room garbage collection and automated disconnect grace timers (15s grace window for reconnections).
- **Industrial Terminal Dashboard**: Visual real-time metrics UI served at `GET /` displaying active rooms, player nodes, continuous uptime, memory usage, and match counters.

---

## 🛠️ Deployment on Hugging Face Spaces

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Select **Docker** as the Space SDK.
3. Push the contents of the `server/` repository to the Hugging Face Space repository.
4. Hugging Face automatically detects `README.md` frontmatter (`sdk: docker`, `app_port: 7860`) and builds using `Dockerfile`.
5. Your multiplayer core is instantly live at `https://<your-space-name>.hf.space`.

---

## 🌐 Endpoints & Probes

| Route | Method | Description | Response |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | Industrial Engine Radar Terminal UI (or JSON if `Accept: application/json`) | HTML Dashboard or JSON |
| `/` | `HEAD` | Rapid container health ping for reverse proxies | `200 OK` (with uptime headers) |
| `/health` | `GET`, `HEAD` | Container health probe & vitals | `200 OK` with JSON uptime & status |
| `/healthz` | `GET`, `HEAD` | Standard Kubernetes / container orchestrator health check | `200 OK` with JSON uptime & status |
| `/active-rooms` | `GET` | List of public active lobbies | JSON array |
| `/api/room/:roomId` | `GET` | Query specific lobby availability & player counts | JSON |
| `/api/link-preview` | `GET` | Rich link metadata unfurling for chat | JSON |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `7860` | Server HTTP and WebSocket listening port (Default `7860` for Hugging Face Spaces). |
| `ALLOWED_ORIGINS` | `""` | Comma-delimited list of custom allowed web origins, or `*` to allow all. |
| `NODE_ENV` | `production` | Node runtime environment (`production` or `development`). |

---

## 🛡️ CORS Whitelist Configuration

The server automatically validates and permits requests from:
- `*.hf.space` (Hugging Face Spaces)
- `*.vercel.app` (Vercel preview & production deployments)
- `*.pages.dev` (Cloudflare Pages)
- `aistudio.google.com`, `*.google.com`, `*.googleusercontent.com` (Google AI Studio integrations)
- `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*` (Local development)
- Private LAN ranges (`192.168.*`, `10.*`, `172.16.*` - `172.31.*`)
- Any origins specified in `process.env.ALLOWED_ORIGINS`

---

## 📦 Local Development

```bash
# Install dependencies
npm install

# Start local server with hot reloading
npm run dev

# Run server directly
npm start
```
