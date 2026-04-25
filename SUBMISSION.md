# RevOps AI — Submission Document

**What it is:** A Chrome extension that sits on LinkedIn, qualifies leads against your ICP in real time, and writes personalised outreach you can send immediately.

**GitHub:** https://github.com/ElishmaTalkar/Floating-bot  
**Stack:** Chrome Extension (MV3) · Node.js/Express · Groq (LLaMA 3.3 70B) · Gemini 2.0 Flash fallback · Google Sheets CRM

---

## 1. The Problem

SDRs and founders doing outbound on LinkedIn face three compounding problems:

1. **No filter** — they scan profiles manually, waste time on unqualified leads, and use gut feel instead of criteria
2. **Generic outreach** — they send the same connection note to everyone, or use AI tools that produce messages LinkedIn's own AI could write
3. **No system** — leads disappear after a conversation, context is lost, nothing gets tracked

The result: hours spent per day on LinkedIn with no repeatable process and no record of what happened.

---

## 2. What Was Built

A floating widget that lives on every LinkedIn page. The full flow:

```
Paste product description
        ↓
Bot analyzes ICP — who to pitch, what signals to look for
        ↓
Open any LinkedIn profile → click Robot button
        ↓
Bot scrapes profile (name, role, about, experience, skills)
        ↓
Scores lead 0–10 across 5 dimensions (see below)
        ↓
Score ≥ 5 → generates connection note (≤280 chars) + full DM
        ↓
Prospect replies → type REPLY: [their message] → context-aware follow-up
        ↓
Every scan auto-logs to Google Sheets (name, score, role, messages, timestamp)
```

### Scoring Model — 5 Dimensions (max 10 pts)

| Dimension | Max | What earns points |
|---|---|---|
| Buying Authority | 3 | Founder/CEO/VP = 3, Head/Manager = 2, Senior IC = 1, SDR/Engineer = 0 |
| Role-to-Product Fit | 2 | Directly owns the pain vs. adjacent vs. no connection |
| Company Fit | 2 | Right industry + size + stage vs. 2/3 vs. wrong fit |
| Pain & Intent Signals | 2 | Explicit mention in bio vs. implicit career signals vs. none |
| Timing & Urgency | 1 | New role (<12mo), recent funding, active sales hiring |

Score ≥ 5 → APPROVE. Score < 5 → SKIP. The model is instructed to be strict — a 10 means near-perfect buyer, most real profiles score 4–7.

---

## 3. Structured Thinking — Key Design Decisions

### Why a Chrome extension, not a web app?
The data lives on LinkedIn. Any approach that requires copy-pasting profile content adds friction that kills the workflow. The extension brings the tool to the data, not the other way around.

### Why a local backend instead of calling the API directly from the extension?
Three reasons:
- API keys can't be safely stored in a Chrome extension (visible in source)
- The scoring logic (prompts, post-processing, message assembly) needs to stay server-side and be iterable without reloading the extension
- The Google Sheets sync and key rotation logic belong on a server

### Why two LLM calls instead of one?
One call asking the model to both score AND write messages produced poor results — the model either scored generously to justify writing a message, or wrote a message that contradicted the score. Splitting into:
- **Call 1 (LLaMA 3.3 70B):** Score only, JSON output, strict rubric
- **Call 2 (Qwen 32B):** Message only, given the approved profile

...gave cleaner scores and better messages independently.

### Why component-based message assembly?
Asking the model for a complete message gave inconsistent structure. Instead, the model fills three fields:
- `fact` — one specific, verifiable thing from their profile
- `insight` — a universal truth about people in their situation
- `question` — one short question using "you/your"

The backend concatenates them: `{fact} — {insight}. {question}`

This gives backend control over message structure while letting the model fill content. It also catches third-person leakage ("he built" → "you built") at the assembly layer.

---

## 4. Practical Problems Solved

**LinkedIn SPA navigation** — LinkedIn is a React SPA. Page navigations don't reload the document, so `DOMContentLoaded` never fires again. Fixed with a `setInterval` URL watcher that re-injects the widget when it disappears from the DOM.

**DOM scraping noise** — `document.body.innerText` captured "People You May Know", ads, carousels, and suggestions alongside profile data — inflating token usage and confusing the model. Fixed by targeting `div.scaffold-layout__main` (LinkedIn's main column), cloning it, stripping known noise selectors, and using anchor IDs (`#experience`, `#about`, `#education`) for section extraction.

**API quota exhaustion** — Free Groq tier is 100k tokens/day, which runs out fast with a 2-call architecture. Built a rotation system: server reads `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3` etc. from `.env`, cycles to the next key on 429. When all Groq keys are exhausted, falls back to Gemini 2.0 Flash with automatic retry using the delay from the error response.

**Context loss across sessions** — The extension is injected on every page load. Without persistence, product context, chat history, and last scan context were lost on every navigation. Fixed with `chrome.storage.local` — all three are saved on write and restored on inject.

**Third-person messages** — Models trained on profile-summarization tasks default to third person ("He scaled the sales team..."). Fixed with a post-processing layer using regex replacements (`he → you`, `his → your`, `he's → you're`) applied after message assembly.

---

## 5. What Was Deliberately Left Out

| Considered | Decision | Reason |
|---|---|---|
| Full CRM (custom DB) | Used Google Sheets instead | Sheets is already familiar, queryable, shareable — building a DB adds weeks for zero user benefit at this stage |
| Auto-send connection requests | Not built | LinkedIn detects automation and bans accounts — this crosses a clear risk line |
| Vector search over past conversations | Not built | `chrome.storage.local` with 80-message cap is sufficient for the actual use case (follow-up context) |
| Webhook-based LinkedIn DOM monitoring | Not built | Interval polling every second is ugly but reliable — MutationObserver on a SPA with heavy DOM churn causes false positives |
| OpenAI as the LLM | Used Groq instead | Same model quality, 10x faster inference, generous free tier — no reason to pay for OpenAI at this stage |
| Containerised deployment | Skipped | Railway deploys Node.js directly from GitHub — Docker adds complexity with no benefit until the team scales |

---

## 6. What Good Judgment Looks Like in Practice

Three examples from build decisions:

**Scoring threshold at 5, not 7.** Initially set at 7 — too strict, almost nothing approved. Set at 3 — too loose, the messages were generic. 5 matches the real-world distribution where a half-decent fit is worth one message.

**Connection note at 280 characters, not 300.** LinkedIn's hard limit is 300. Left 20 characters of buffer for the personalisation variable (first name prepend) without risking truncation.

**Gemini as fallback, not primary.** Gemini's free tier resets per-minute, not per-day — better for bursts. Groq's is per-day but faster. So Groq handles the volume and Gemini catches overflow. Reversing this would burn Gemini's quota on every normal scan.

---

## 7. Current State

| Feature | Status |
|---|---|
| Lead scoring (0–10, 5 dimensions) | ✅ Live |
| Connection note generation (≤280 chars) | ✅ Live |
| DM generation | ✅ Live |
| Follow-up on prospect reply | ✅ Live |
| Google Sheets CRM sync | ✅ Live |
| Chat history persistence | ✅ Live |
| API key rotation + Gemini fallback | ✅ Live |
| Profile-only scraping (no noise) | ✅ Live |
| Backend deployment (Railway) | 🔄 Pending |
| LinkedIn scraping resilience improvements | 🔄 In progress |

---

## 8. The Honest Gaps

- **Backend is still localhost** — works on one machine, not shareable until deployed to Railway (credentials are ready, deployment pending)
- **LinkedIn scraping is fragile** — LinkedIn ships DOM changes without notice; the anchor ID approach (`#experience`) is more stable than class-based selectors but not immune
- **No rate limiting on the server** — a burst of scans can exhaust all API keys; a simple token-bucket would prevent this
- **Messages are good, not great** — the component model produces structurally sound messages but occasionally the `insight` line reads generic; better few-shot examples in the prompt would fix this

---

*Built by Elishma Talkar*  
*Stack: ~1,650 lines of code across 7 files*
