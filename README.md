# Floating Bot — RevOps AI

A Chrome extension that sits on LinkedIn, qualifies leads against your ICP in real time, and writes personalised outreach you can send immediately.

**Live backend:** https://floating-bot.onrender.com

---

## The Problem

Cold outreach on LinkedIn has two failure points: you're messaging the wrong people, and the messages look like everyone else's.

Most sales teams either spray broadly with no filter, or use LinkedIn's AI writer which produces messages indistinguishable from the next person's. The result is low acceptance rates and replies that go nowhere — not because the product is wrong, but because the wrong person got a generic message.

There's no system deciding *who* is worth reaching out to before the message is sent. And even when the right person is found, the outreach doesn't reflect that.

---

## What It Does

**Step 1 — Define your target.**
Paste your product description. The agent reads it, understands your ICP — who the ideal buyer is, what pain they have, what signals on a profile indicate a real fit.

**Step 2 — It decides who's worth contacting.**
Open any LinkedIn profile and hit the scan button. The agent scores them 0–10 across five dimensions:

| Dimension | What it measures |
|---|---|
| Buying Authority | Can they actually make a purchase decision? |
| Role-to-Product Fit | Does their daily work experience the pain your product solves? |
| Company Fit | Right industry, size, and stage? |
| Pain & Intent Signals | Does their profile explicitly or implicitly signal the problem? |
| Timing & Urgency | New role, recent funding, active hiring — are they in a buying window? |

Score ≥ 5 → worth contacting. Score < 5 → skip.

**Step 3 — It writes the outreach.**
A connection note under 280 characters and a full DM — both referencing something specific from the actual profile that only someone who read it would know.

**Step 4 — It handles the follow-up.**
Paste their reply as `REPLY: [their message]`. The agent reads the context and writes the next message.

**Step 5 — Every lead is logged.**
Every scan auto-pushes to Google Sheets — name, score, role, reason, messages, timestamp.

---

## Architecture

```
LinkedIn Profile Page
        │
        ▼
Chrome Extension (MV3)
  ├── content.js      — scrapes profile, runs chat UI, handles commands
  ├── background.js   — routes API calls
  └── chrome.storage  — persists product context, chat history, last scan
        │
        ▼ HTTP POST
Node.js + Express (Render)
  ├── /process-lead   — scores profile + generates messages
  ├── /analyze-product — extracts ICP from product description
  └── /follow-up      — generates reply based on conversation context
        │
        ├── Call 1: LLaMA 3.3 70B (Groq) — scores lead → JSON
        ├── Call 2: Qwen 32B (Groq)       — generates messages [score ≥ 5 only]
        └── Fallback: Gemini 2.0 Flash    — auto-switches when Groq quota exhausted
        │
        ▼
Google Sheets (Apps Script webhook)
  └── Every scan logged automatically
```

**Key decisions:**
- **Two LLM calls** — scoring and messages separated. One call doing both produced inflated scores and weak copy.
- **Backend over direct calls** — API keys can't be safely stored in a Chrome extension.
- **Component-based messages** — model fills `fact`, `insight`, `question` separately. Backend assembles them. Gives structural control while letting the model fill content.
- **Key rotation** — cycles through multiple Groq keys on 429, falls back to Gemini automatically.
- **Google Sheets over a database** — shareable, queryable, zero infrastructure.

---

## Problem Solving

LinkedIn doesn't let you scrape. That's the first real wall — not a technical one, but a platform one. The obvious path is blocked by design. The response wasn't to find a workaround that would get the account banned — it was to think about what data is actually visible on the page and how a human would read it.

That led to the camera idea. Instead of hitting an API or extracting data through a back channel, the extension reads what's already rendered on screen — the same way a human would. It targets LinkedIn's main content column directly, pulls only the sections that matter (about, experience, education, skills), and strips everything else. The result is a scraper that works within LinkedIn's own rendering, not against it.

The widget kept disappearing because LinkedIn is a React SPA — navigations don't reload the page. Fixed with a URL watcher that detects navigation and re-injects automatically. When the API quota ran out mid-session, built key rotation with Gemini as a fallback — the tool keeps running without the user knowing a switch happened.

---

## Setup

**Extension**
1. Clone the repo
2. Go to `chrome://extensions` → Enable Developer Mode
3. Load Unpacked → select the `extension/` folder

**Backend (local)**
1. Add a `.env` file (see `.env.example`)
2. `npm install && node server.js`

**Backend (hosted)**
Already live at `https://floating-bot.onrender.com`

---

## Status

| Feature | Status |
|---|---|
| Lead scoring (0–10, 5 dimensions) | ✅ Live |
| Connection note (≤280 chars) | ✅ Live |
| Personalised DM generation | ✅ Live |
| Context-aware follow-up | ✅ Live |
| Google Sheets CRM sync | ✅ Live |
| Chat history persistence | ✅ Live |
| API key rotation + Gemini fallback | ✅ Live |
| Profile-only scraping | ✅ Live |
| Hosted backend (Render) | ✅ Live |

---

*Built by Elishma Talkar*
