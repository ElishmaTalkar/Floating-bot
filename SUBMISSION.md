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

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Extension | Chrome MV3 (content script + background worker) | Lives inside LinkedIn — no copy-pasting, no tab switching |
| Backend | Node.js + Express | Lightweight API server, keeps prompts and keys server-side |
| Primary LLM | Groq — LLaMA 3.3 70B | Fast inference, free tier, strong reasoning on structured scoring |
| Message LLM | Groq — Qwen 32B | Separate model optimised for natural language generation |
| Fallback LLM | Google Gemini 2.0 Flash | Auto-switches when Groq hits daily quota — no downtime |
| Key Rotation | Multi-key cycling in server.js | Multiple API keys rotate automatically on 429 errors |
| CRM Sync | Google Sheets via Apps Script webhook | Zero setup, shareable, queryable — no database needed at this stage |
| Persistence | chrome.storage.local | Chat history, product context, and last scan survive page reloads |

---

## Why It's Useful

**For SDRs and founders doing outbound:**
Every hour spent on LinkedIn manually qualifying profiles is an hour not spent selling. The bot compresses that to seconds. More importantly, it makes the judgment consistent — the same ICP criteria applied to every profile, every time.

**For message quality:**
LinkedIn's AI writer produces messages that look like LinkedIn's AI writer. Prospects have seen them. They don't reply. The bot produces messages that reference specific, verifiable profile data — the kind of detail that makes someone stop and think "this person actually looked at my profile."

**For pipeline visibility:**
Every lead scored and messaged is automatically in a spreadsheet. Score distribution, approval rate, roles being targeted — all visible without any manual logging.

**The compounding effect:**
Better targeting × better messaging = higher acceptance rate × higher reply quality. You're not just saving time — you're changing the conversion rate at both ends of the funnel.

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
