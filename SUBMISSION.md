# RevOps AI — Floating Bot

**Built by:** Elishma Talkar
**GitHub:** https://github.com/ElishmaTalkar/Floating-bot

---

## The Problem

Cold outreach on LinkedIn has two failure points: you're messaging the wrong people, and the messages look like everyone else's.

Most sales teams either spray broadly with no filter, or use LinkedIn's AI writer which produces messages indistinguishable from the next person's. The result is low acceptance rates and replies that go nowhere — not because the product is wrong, but because the wrong person got a generic message.

There's no system deciding *who* is worth reaching out to before the message is sent. And even when the right person is found, the outreach doesn't reflect that.

---

## What It Does

Floating Bot is an AI agent that sits inside LinkedIn as a Chrome extension. It fixes both failure points.

**Step 1 — You define your target.**
Paste your product description into the bot. The agent reads it, understands your ICP — who the ideal buyer is, what pain they have, what signals on a profile indicate a real fit, and what disqualifies someone.

**Step 2 — It decides who's worth contacting.**
Open any LinkedIn profile and hit the scan button. The agent reads the person's role, experience, company, career signals, and bio — then scores them 0–10 across five dimensions:

| Dimension | What it measures |
|---|---|
| Buying Authority | Can they actually make a purchase decision? |
| Role-to-Product Fit | Does their daily work experience the pain your product solves? |
| Company Fit | Right industry, size, and stage? |
| Pain & Intent Signals | Does their profile explicitly or implicitly signal the problem? |
| Timing & Urgency | New role, recent funding, active hiring — are they in a buying window? |

Score ≥ 5 → worth contacting. Score < 5 → skip. No gut feel, no wasted messages.

**Step 3 — It writes the outreach.**
Not a template. Not what LinkedIn's AI writer would produce. The message references something only someone who actually read the profile would know — an exact tenure, a company they built something at, a career move that signals the right timing. A connection note under 280 characters and a full DM, ready to send.

**Step 4 — It handles the follow-up.**
When the prospect replies, paste their message into the bot. It reads the conversation context and writes a response that continues the thread naturally — no starting from scratch.

**Step 5 — Every lead is logged.**
Every scan — approved or skipped — is automatically pushed to a Google Sheets CRM with the name, LinkedIn URL, score, role, reason, and the exact messages generated. Nothing falls through the cracks.

---

## Architecture

```
LinkedIn Profile Page
        │
        ▼
Chrome Extension (MV3)
  ├── content.js        — scrapes profile, runs chat UI, handles commands
  ├── background.js     — routes API calls, manages auth headers
  └── chrome.storage    — persists product context, chat history, last scan
        │
        ▼ HTTP POST (localhost:3000 / Railway)
Node.js + Express Backend
  ├── /process-lead     — scores profile + generates messages
  ├── /analyze-product  — extracts ICP from product description
  └── /follow-up        — generates reply based on conversation context
        │
        ├── Call 1: LLaMA 3.3 70B (Groq)
        │     └── Scores lead 0–10 across 5 dimensions → JSON
        │
        ├── Call 2: Qwen 32B (Groq)   [only if score ≥ 5]
        │     └── Generates fact + insight + question → assembled into DM
        │
        └── Fallback: Gemini 2.0 Flash
              └── Auto-switches when Groq quota exhausted
                  Retries with delay extracted from error response
        │
        ▼
Google Sheets (via Apps Script webhook)
  └── Every scan logged — name, score, role, messages, timestamp
```

**Key architectural decisions:**

- **Two LLM calls, not one** — scoring and message generation are separated. One prompt doing both produced inflated scores and weak messages. Splitting them gives clean scores and better copy independently.
- **Backend, not direct API calls** — API keys can't be safely stored in a Chrome extension. All prompt logic lives server-side so it can be iterated without reloading the extension.
- **Component-based message assembly** — the model fills `fact`, `insight`, and `question` as separate fields. The backend concatenates them. This gives structural control over the message format while letting the model fill the content.
- **Key rotation** — server reads `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3` from env and cycles on 429. Groq free tier is 100k tokens/day per key.
- **Google Sheets over a database** — a webhook append is sufficient at this stage. Sheets is shareable, queryable, and requires zero infrastructure.

---

## Why It's Useful

The problem isn't volume — most sales teams already send enough messages. The problem is that the wrong people get them, and the right people get ones that look like everyone else's.

This bot changes the conversion rate at both ends:

**Targeting:** The same ICP criteria applied to every profile, every time. No gut feel, no "seems relevant." A VP Sales at a 30-person B2B SaaS gets a 7. A senior AE at an enterprise gets a 2. The decision is made before the message is written.

**Messaging:** LinkedIn's AI writer produces messages prospects have already seen and ignored. This bot references an exact tenure, a specific company transition, a career signal that only someone who actually read the profile would notice. That's what makes someone stop scrolling and reply.

One is a time saving. Together they're a conversion rate change — and that's the number that actually matters in outbound.

---

## Current State

| Feature | Status |
|---|---|
| Lead scoring (0–10, 5 dimensions) | ✅ Live |
| Connection note generation (≤280 chars) | ✅ Live |
| Personalised DM generation | ✅ Live |
| Context-aware follow-up on reply | ✅ Live |
| Google Sheets CRM sync | ✅ Live |
| Chat history persistence across sessions | ✅ Live |
| API key rotation + Gemini fallback | ✅ Live |
| Profile-only scraping (no sidebar noise) | ✅ Live |
| Backend hosting (shareable URL) | 🔄 Pending — Railway deployment ready |

---

## Honest Gaps

- Backend is still localhost — works on one machine, deployment to Railway is the next step
- LinkedIn scraping is tied to LinkedIn's DOM — they ship changes without notice, which can break selectors
- No rate limiting on the server — a burst of scans can exhaust API keys before rotation kicks in

---

*~1,650 lines of code across 7 files.*
