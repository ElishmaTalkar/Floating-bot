const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ override: true });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Key rotation — reads GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3 ... from .env
const groqKeys = Object.entries(process.env)
    .filter(([k]) => k === 'GROQ_API_KEY' || k.startsWith('GROQ_API_KEY_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
    .filter(Boolean);

if (groqKeys.length === 0) throw new Error('No GROQ_API_KEY found in environment');
console.log(`[Keys] Loaded ${groqKeys.length} Groq API key(s)`);

let currentKeyIndex = 0;
const getGroq = () => new Groq({ apiKey: groqKeys[currentKeyIndex] });

// Gemini fallback — called when all Groq keys are exhausted
const geminiCall = async (params, retryCount = 0) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key') throw new Error('No Gemini API key configured');

    console.warn(`[Fallback] Groq exhausted — using Gemini (attempt ${retryCount + 1})`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const userMessage = params.messages?.find(m => m.role === 'user')?.content || '';
    const isJson = params.response_format?.type === 'json_object';
    const prompt = isJson
        ? `${userMessage}\n\nRespond with valid JSON only. No markdown, no code blocks.`
        : userMessage;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/^```json\n?|\n?```$/g, '').trim();
        return { choices: [{ message: { content: text } }] };
    } catch (err) {
        // Extract retry delay from Gemini's error response
        const retryMatch = err?.message?.match(/retryDelay["\s:]+(\d+)/);
        const retryAfterSec = retryMatch ? parseInt(retryMatch[1]) + 2 : 60;

        if (retryCount < 2 && err?.message?.includes('429')) {
            console.warn(`[Gemini] Rate limited — retrying in ${retryAfterSec}s`);
            await new Promise(r => setTimeout(r, retryAfterSec * 1000));
            return geminiCall(params, retryCount + 1);
        }
        throw err;
    }
};

const groqCall = async (params, attempt = 0) => {
    try {
        return await getGroq().chat.completions.create(params);
    } catch (err) {
        const errStr = JSON.stringify(err).toLowerCase();
        const is429 = err?.status === 429 ||
                      String(err?.status) === '429' ||
                      errStr.includes('429') ||
                      errStr.includes('rate_limit') ||
                      errStr.includes('rate limit') ||
                      errStr.includes('quota');
        console.warn(`[groqCall] Error on key ${currentKeyIndex + 1}: status=${err?.status} is429=${is429}`);
        if (is429) {
            if (attempt < groqKeys.length - 1) {
                console.warn(`[Keys] Rotating to key ${currentKeyIndex + 2}`);
                currentKeyIndex = (currentKeyIndex + 1) % groqKeys.length;
                return groqCall(params, attempt + 1);
            }
            return geminiCall(params);
        }
        throw err;
    }
};

const pushToSheets = async (lead, decision) => {
    const webhookUrl = process.env.SHEETS_WEBHOOK_URL;
    if (!webhookUrl) return;
    try {
        const payload = {
            name:            lead.name || 'Unknown',
            linkedin_url:    lead.linkedin_url || '',
            score:           decision.fit_score || 0,
            status:          decision.status === 'APPROVE' ? '✅ Approved' : '❌ Skipped',
            role:            lead.detailed_info?.role || '',
            reason:          decision.reason || '',
            connection_note: decision.connection_note || '',
            dm:              decision.message || '',
            scanned_at:      new Date().toISOString(),
        };
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow',
        });
        const text = await res.text();
        console.log(`[Sheets] Pushed: ${lead.name} (${decision.status}) →`, text.substring(0, 80));
    } catch (err) {
        console.error('[Sheets Error]', err.message);
    }
};

// --- Intelligence Parsing & Decision Endpoint ---
app.get('/', (req, res) => res.json({ status: 'ok', service: 'RevOps AI Backend' }));

app.post('/process-lead', async (req, res) => {
    console.log("-----------------------------------------");
    console.log("📥 NEW INTELLIGENCE REQUEST RECEIVED");
    console.log("Name:", req.body.name);
    console.log("URL:", req.body.linkedin_url);
    console.log("-----------------------------------------");
    try {
        const { linkedin_url, name, detailed_info, product_context } = req.body;
        console.log(`[Backend] Processing: ${name || linkedin_url} | Product: ${product_context ? 'Custom' : 'Default (Myntmore)'}`)

        // LLM Qualification + Personalized Message Generation
        const productSection = product_context
            ? `PRODUCT CONTEXT (user-defined):\n${product_context}\n\nUsing the product description above, infer:\n- Who the ideal buyer is (role, industry, company stage)\n- What pain points this product solves\n- What signals on a LinkedIn profile indicate a strong fit\n- What disqualifies someone`
            : `PRODUCT CONTEXT (default — Myntmore):\nMyntmore is an AI-powered B2B outbound system. It builds predictable sales pipelines for founders and GTM teams — combining AI lead generation, LinkedIn automation, cold email, and personal branding. Goes from zero to 20+ qualified meetings/month in 6 weeks.\n\nICP:\n1. ROLE: Founder, Co-founder, CEO, Head of Sales, VP Sales, Head of Growth at B2B companies\n2. INDUSTRY: B2B SaaS, Tech, Professional Services, Fintech, HR Tech, MarTech\n3. SIGNALS: Running outbound, scaling GTM, inconsistent pipeline, relying on founder hustle\n4. STAGE: Pre-seed to Series B (seed–Series A sweet spot)\n5. DISQUALIFY: Enterprise 500+ employees, D2C, solo freelancers, non-B2B`;

        const prompt = `
You are an AI sales assistant qualifying LinkedIn leads.

${productSection}

LEAD PROFILE:
Name: ${name}
Role / Title: ${detailed_info?.role || 'N/A'}
Headline: ${detailed_info?.headline || 'N/A'}
Bio / About: ${(detailed_info?.about || 'N/A').substring(0, 1500)}
Experience: ${(detailed_info?.experience || 'N/A').substring(0, 2000)}
Education: ${(detailed_info?.education || 'N/A').substring(0, 500)}
Skills: ${(detailed_info?.skills || 'N/A').substring(0, 800)}
Chat History: ${detailed_info?.chat_history || 'N/A'}

SCORING RUBRIC — score each dimension separately, sum for fit_score. Be strict. Be precise. Every point must be justified by actual data in the profile.

DIMENSION 1 — Buying Authority (max 3 pts)
  3 → Has explicit decision-making power: Founder, CEO, Co-founder, VP Sales, VP Revenue, CRO, Sales Director with a team reporting to them
  2 → Strong influencer: Head of Sales, Sales Manager, Head of Growth, GTM Lead, RevOps Lead — recommends purchases but may not sign
  1 → Peripheral: Senior AE, Sales Enablement, Sales Ops — involved in sales but no purchasing power
  0 → No authority: SDR, BDR, AE, marketer, engineer, student, recruiter

DIMENSION 2 — Role-to-Product Fit (max 2 pts)
  2 → Their specific role DIRECTLY experiences the core pain this product solves. E.g. for a sales tool → they own/manage sales performance. For an outbound tool → they run outbound. For a coaching tool → they coach reps.
  1 → Adjacent — they work near the pain but don't own it directly
  0 → No logical connection between their daily work and what this product does

DIMENSION 3 — Company Fit (max 2 pts)
  2 → Right industry AND right size AND right stage (as defined by product ICP)
  1 → Right on 2 out of 3 (e.g. right industry and size but wrong stage, or right stage but wrong industry)
  0 → Wrong on 2 or more dimensions — not a realistic buyer environment

DIMENSION 4 — Pain & Intent Signals (max 2 pts)
  2 → Explicit: bio, about, or headline directly mentions the pain this product solves (e.g. "scaling outbound", "inconsistent pipeline", "manual call reviews", "no GTM system")
  1 → Implicit: career pattern, tools used, or recent moves strongly suggest the pain exists (e.g. just joined as VP Sales at a startup, uses Gong/Outreach, recently scaled team)
  0 → No evidence of pain or buying intent anywhere in the profile

DIMENSION 5 — Timing & Urgency (max 1 pt)
  1 → Any strong timing signal: new role in the last 12 months (new leaders buy new tools), company recently funded, company actively hiring in sales, profile mentions a current initiative
  0 → No timing signals — stable long-tenure role, no growth indicators

STRICT RULES:
- Add all 5 dimensions. That exact sum IS the fit_score (max 10).
- Do NOT inflate scores. A score of 10 means a near-perfect buyer. Most real profiles score 4–7.
- APPROVE if fit_score >= 5. SKIP if fit_score < 5.
- If any data is missing from the profile, default to the lower score for that dimension.

RESPOND IN JSON ONLY — no markdown, no extra text:
{
  "status": "APPROVE" or "SKIP",
  "reason": "one sentence summary",
  "fit_score": exact sum from rubric,
  "score_breakdown": {
    "buying_authority": { "score": 0-3, "note": "one line justification" },
    "role_product_fit": { "score": 0-2, "note": "one line justification" },
    "company_fit": { "score": 0-2, "note": "one line justification" },
    "pain_signals": { "score": 0-2, "note": "one line justification" },
    "timing": { "score": 0-1, "note": "one line justification" }
  },
  "pointers": ["exactly 3 short precise points from actual profile data"]
}
        `;

        // CALL 1: Score only
        const scoreResult = await groqCall({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        });
        const decision = JSON.parse(scoreResult.choices[0].message.content);

        // CALL 2: Message only (if APPROVE)
        if (decision.status === 'APPROVE') {
            const profileSummary = `
Name: ${name}
Role: ${detailed_info?.role || 'N/A'}
Headline: ${detailed_info?.headline || 'N/A'}
About: ${(detailed_info?.about || 'N/A').substring(0, 800)}
Experience: ${(detailed_info?.experience || 'N/A').substring(0, 800)}
Skills: ${(detailed_info?.skills || 'N/A').substring(0, 400)}
            `.trim();

            const msgPrompt = `Extract information from this LinkedIn profile to build two outreach messages. Return only JSON.

PROFILE:
${profileSummary}

Return exactly this JSON shape:
{
  "fact": "ONE specific fact from their profile as a short phrase. Start with a verb or their company name. Use 'you' if needed. No 'he/she/they'. Examples: 'Left Stripe after 3 years to build Zintlr' / 'Joined Slintel as VP Sales 9 months ago after Freshworks' / 'Advising Nava and BeeHyv since September 2025'",
  "insight": "ONE sentence starting with 'Most', 'That', or a role noun. A universal truth about people in their exact situation. Examples: 'Most ex-AEs hit a wall turning individual hustle into a repeatable system' / 'That 6-12 month window in a new VP role is when the inherited playbook starts breaking'",
  "question": "ONE question using 'you/your', never 'he/his'. Short, answerable in one sentence. Examples: 'What part has been hardest to hand off at Zintlr?' / 'Where does the current system break down for you?'",
  "connection_note": "A LinkedIn connection request note. STRICT 280 character max. Must include ONE hyper-specific detail that only someone who actually read the full profile would know — an exact tenure (e.g. '6 years at X'), a specific tool they listed (e.g. 'you use Gong + Apollo'), a company they built something at, a career gap, a side project, or a specific metric they mentioned. This detail is what makes the message impossible for ChatGPT or LinkedIn AI to replicate without the actual profile data. Follow it with one sharp question. No pitch, no 'I'd love to connect'. Examples: 'Left Salesforce after exactly 6 years to advise Nava and BeeHyv — curious what made consulting the right move over another operator role.' / '9 months into Slintel after 4 years scaling Freshworks' SMB team — what's the thing from that playbook that didn't transfer?'"
}`;

            const msgResult = await groqCall({
                model: 'qwen/qwen3-32b',
                messages: [{ role: 'user', content: msgPrompt }],
                response_format: { type: 'json_object' },
            });
            // Qwen sometimes returns an array of options — take the first
            const rawParts = JSON.parse(msgResult.choices[0].message.content);
            const parts = Array.isArray(rawParts) ? rawParts[0] : rawParts;
            console.log('[MSG PARTS]', JSON.stringify(parts));

            const fact = (parts.fact || parts.opening || '').trim();
            const insight = (parts.insight || '').trim();
            const question = (parts.question || '').trim();

            // Extract first name for greeting
            const firstName = (name || '').split(' ')[0] || '';

            const cleanMessage = (text) => text
                .replace(/\bhe (has|is|was|have|does|did|tracks?|runs?|leads?|manages?|owns?|builds?|works?|advises?|joins?)\b/gi, (_, v) => `you ${v}`)
                .replace(/\bhis\b/g, 'your')
                .replace(/\bhim\b/g, 'you')
                .replace(/\bhe'?s\b/gi, "you're")
                .replace(/\bhe'?d\b/gi, "you'd")
                .replace(/\.\.+/g, '.')
                .replace(/^(Hi|Hey|Good\s+\w+)[,.]?\s*\w*[,.]?\s*/i, '')
                .replace(/\bI('ve| have) (noticed|seen|come across|observed)\b/gi, 'Worth noting —')
                .replace(/\bI (noticed|saw|came across|observed)\b/gi, 'Worth noting —')
                .replace(/\bI can imagine\b/gi, 'That usually means')
                .replace(/\bI('d| would) love to\b/gi, '')
                .trim();

            // Assemble DM
            let msg;
            if (fact && insight && question) {
                msg = `${fact} — ${insight}. ${question}`;
            } else {
                msg = parts.message || [fact, insight, question].filter(Boolean).join(' ') || null;
            }
            if (msg) {
                msg = cleanMessage(msg);
                if (firstName) msg = `Hi ${firstName},\n\n${msg}`;
            }
            decision.message = msg;

            // Connection note — clean and enforce 300 char limit
            let note = (parts.connection_note || '').trim();
            if (note) {
                note = cleanMessage(note)
                    .replace(/\bI('d| would) love to connect\b/gi, 'mind if I connect?')
                    .replace(/\bI came across your profile\.?\s*/gi, '')
                    .trim();
                if (firstName) note = `Hi ${firstName}, ${note.charAt(0).toLowerCase() + note.slice(1)}`;
                if (note.length > 300) note = note.substring(0, 297) + '...';
            }
            decision.connection_note = note || null;
        } else {
            decision.message = null;
            decision.connection_note = null;
        }

        console.log(`[Decision] ${decision.status} (fit: ${decision.fit_score}/10): ${decision.reason}`);

        // Push to Notion (non-blocking)
        pushToSheets(req.body, decision);

        // Return to Extension
        res.json(decision);

    } catch (error) {
        console.error("[Backend Error]", error.message);
        res.status(500).json({ status: "SKIP", reason: "Backend Processing Error", error: error.message });
    }
});

// --- Product ICP Analysis Endpoint ---
app.post('/analyze-product', async (req, res) => {
    try {
        const { product_context } = req.body;
        if (!product_context) return res.status(400).json({ error: 'Missing product_context' });

        const prompt = `You are a B2B sales strategist. Read this product description carefully and extract a hyper-specific ICP. Every answer must be derived directly from what this product does — no generic SaaS defaults.

PRODUCT:
${product_context}

Rules:
- ideal_titles: Only roles that DIRECTLY experience the pain this product solves. If it's a call coaching tool → "Sales Director managing AEs", not "Account Executive". If it's a deal management tool → "Enterprise AE running 6-month cycles", not "Sales Manager". Be role AND context specific.
- ideal_industries: Only industries where THIS product's pain is most acute. Derive from the product, not generic lists.
- top_pain_signals: Specific phrases or signals someone would have in their LinkedIn bio, headline, or experience that prove they need THIS product. E.g. "mentions deal slippage", "runs multi-stakeholder enterprise deals", "uses Salesforce but mentions manual follow-up chaos" — not generic "interested in AI".
- avoid: Specific profile types that would waste time based on what this product requires.

Return only JSON:
{
  "product_summary": "one sharp sentence — what pain it solves and for exactly whom",
  "ideal_titles": ["5-6 specific role + context titles, e.g. 'Enterprise AE managing 3-6 month deals' not just 'AE'"],
  "ideal_industries": ["3-5 industries where this product's pain is sharpest"],
  "ideal_company_stage": "specific stage and headcount range derived from the product description",
  "top_pain_signals": ["5 specific things you'd see on their LinkedIn profile proving they need this product"],
  "avoid": ["3-4 specific profile types that are a clear waste of time for this product"]
}`;

        const result = await groqCall({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        });

        const icp = JSON.parse(result.choices[0].message.content);
        console.log(`[ICP] Analyzed product: ${icp.product_summary}`);
        res.json(icp);
    } catch (error) {
        console.error('[ICP Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Follow-up Message Endpoint ---
app.post('/follow-up', async (req, res) => {
    try {
        const { prospect_name, prospect_role, prospect_company, their_reply, your_dm, product_context } = req.body;

        const prompt = `You are an expert B2B sales rep writing a follow-up message.

CONTEXT:
- Prospect: ${prospect_name}, ${prospect_role} at ${prospect_company}
- Your opening DM: ${your_dm}
- Their reply: ${their_reply}
${product_context ? `- Product: ${product_context}` : ''}

Write a follow-up reply. Rules:
- 2-3 sentences max
- Acknowledge exactly what they said — mirror their tone and energy
- If they showed interest: move towards a specific next step (not "let's hop on a call" — something lower friction like "worth a 15-min chat?" or share one concrete insight)
- If they raised an objection or pushback: validate it, then reframe with one sharp insight
- If they asked a question: answer it directly, then redirect with a question back
- Never pitch the product directly. Never use "I'd love to", "synergy", "value add"
- Tone: peer-to-peer, confident, no fluff

Return only JSON: { "follow_up": "the message" }`;

        const result = await groqCall({
            model: 'qwen/qwen3-32b',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        });

        const rawParts = JSON.parse(result.choices[0].message.content);
        const data = Array.isArray(rawParts) ? rawParts[0] : rawParts;
        res.json({ follow_up: data.follow_up || null });
    } catch (error) {
        console.error('[Follow-up Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Strategic Intelligence Backend running at http://localhost:${port}`);
});
