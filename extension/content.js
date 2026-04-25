// Safety Gate: Prevents the script from running twice on the same page
if (!window.revopsInjected) {
    window.revopsInjected = true;
    
    // Initialize Database & Brain URL
    window.RevOpsBrainURL = "http://localhost:3000/process-lead"; // Global Default
    
    window.RevOpsProductContext = null;

    window.IntelligenceDB.init().then(isConfigured => {
        chrome.storage.local.get(['brainUrl', 'productContext'], (result) => {
            if (result.brainUrl) window.RevOpsBrainURL = result.brainUrl;
            if (result.productContext) window.RevOpsProductContext = result.productContext;
            console.log(`[Strategic Agent] Database ${isConfigured ? 'Connected' : 'Offline'} | Brain Target: ${window.RevOpsBrainURL}`);
        });
    });

    // Injects the Chat UI into the host page
    const injectUI = () => {
        const chatHTML = `
            <div id="revops-bubble" class="chat-bubble-ext">
                <div class="pulse-ext"></div>
            </div>

            <div id="revops-container" class="chat-container-ext hidden-ext">
                <div class="chat-header-ext">
                    <div class="header-info-ext">
                        <div class="status-dot-ext"></div>
                        <h3>RevOps AI</h3>
                        <span id="domain-tag-ext" style="font-size: 0.65rem; color: #f59e0b; opacity: 0.8; margin-left: 8px; font-weight: 400;"></span>
                    </div>
                    <div class="header-actions-ext">
                        <button id="scrape-btn" title="Scrape Page for Leads"><i class="fas fa-wand-magic-sparkles"></i></button>
                        <button id="camera-btn" title="Toggle Camera Mode (Passive Capture)"><i class="fas fa-camera"></i></button>
                        <button id="deep-scan-btn" title="Qualify Candidate + Generate Message"><i class="fas fa-robot"></i></button>
                        <button id="auto-sequence-btn" class="hidden-ext" title="Auto-Scan All Results"><i class="fas fa-list-check"></i></button>
                        <button id="close-chat-ext" class="close-btn-ext">&times;</button>
                    </div>
                </div>
                
                <div id="chat-messages-ext" class="chat-messages-ext">
                    <div class="message-ext bot-ext">
                        <strong>RevOps AI ready.</strong><br><br>
                        Hit <strong>🤖</strong> on any LinkedIn profile to:<br>
                        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px;">
                            <span>📊 Score the lead against your ICP (0–10)</span>
                            <span>🔗 Get a connection note <span style="opacity:0.6;font-size:0.75rem;">(under 300 chars)</span></span>
                            <span>✉️ Get a personalised DM to send after they accept</span>
                        </div>
                        <div style="margin-top:10px;opacity:0.65;font-size:0.78rem;">
                            Type <code>PRODUCT: [description]</code> to set your product.<br>
                            Type <code>product</code> to see current ICP.<br>
                            Type <code>clear</code> to reset chat.
                        </div>
                    </div>
                </div>

                <div class="chat-input-area-ext">
                    <textarea id="user-input-ext" placeholder="Paste lead details or hit wand..." rows="1"></textarea>
                    <button id="send-btn-ext" class="send-btn-ext">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.id = 'revops-ai-root';
        div.innerHTML = chatHTML;
        document.body.appendChild(div);

        // Populate Domain Tag
        const domainTag = div.querySelector('#domain-tag-ext');
        if (domainTag) domainTag.textContent = `📍 ${window.location.hostname}`;

        // Properly load the robot icon from the extension
        const bubbleEl = div.querySelector('#revops-bubble');
        const iconUrl = chrome.runtime.getURL('icon.png');
        bubbleEl.style.backgroundImage = `url('${iconUrl}')`;
        bubbleEl.style.backgroundSize = '165%';
        bubbleEl.style.backgroundPosition = 'center';
        bubbleEl.style.backgroundRepeat = 'no-repeat';

        // FontAwesome
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fa);
    };

    injectUI();
    window._revopsListenersAttached = true;

    // Selectors
    const bubble = document.getElementById('revops-bubble');
    const container = document.getElementById('revops-container');
    const closeBtn = document.getElementById('close-chat-ext');
    const sendBtn = document.getElementById('send-btn-ext');
    const scrapeBtn = document.getElementById('scrape-btn');
    const deepScanBtn = document.getElementById('deep-scan-btn');
    const autoSequenceBtn = document.getElementById('auto-sequence-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const userInput = document.getElementById('user-input-ext');
    const messagesContainer = document.getElementById('chat-messages-ext');

    // KNOWLEDGE BASE / ICP
    const ICP = {
        titles: ["Head of RevOps", "VP of Sales", "Revenue Operations", "CRO", "Sales Operations Manager"],
        industries: ["B2B SaaS", "Tech", "Software"],
        minSize: 20,
        maxSize: 200
    };

    const MAX_STORED_MESSAGES = 80;

    const addMessage = (text, type, skipSave = false) => {
        const msg = document.createElement('div');
        msg.className = `message-ext ${type}`;
        msg.innerHTML = text.replace(/\n/g, '<br>');
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (skipSave) return;
        chrome.storage.local.get(['chatHistory'], (result) => {
            const history = result.chatHistory || [];
            history.push({ html: text, type, ts: Date.now() });
            if (history.length > MAX_STORED_MESSAGES) history.splice(0, history.length - MAX_STORED_MESSAGES);
            chrome.storage.local.set({ chatHistory: history });
        });
    };

    // Restore chat history from previous session
    const restoreChatHistory = () => {
        chrome.storage.local.get(['chatHistory'], (result) => {
            const history = result.chatHistory || [];
            if (history.length === 0) return;
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid rgba(255,255,255,0.1);margin:8px 0;padding-top:8px;font-size:0.7rem;opacity:0.4;text-align:center;';
            sep.textContent = `— ${history.length} messages restored —`;
            messagesContainer.appendChild(sep);
            history.forEach(m => addMessage(m.html, m.type, true));
        });
    };

    restoreChatHistory();
    chrome.storage.local.get(['lastScanContext'], (r) => {
        if (r.lastScanContext) window._lastScanContext = r.lastScanContext;
    });

    // Enhanced AI Decision Engine

    const scrapeChatHistory = () => {
        const messageElements = document.querySelectorAll('.msg-s-event-listitem__body, .msg-s-message-group-content__text');
        if (messageElements.length === 0) return "No messages found or not on a messaging page.";
        
        addMessage(`💬 <strong>Reading ${messageElements.length} messages...</strong>`, 'bot-ext');
        
        return Array.from(messageElements)
            .map(el => el.innerText.trim().replace(/\n/g, ' '))
            .slice(-15) // Analyze last 15 messages for context
            .join("\n---\n");
    };

    // Librarian Engine: Deep Pattern Extraction
    const processQuery = (query) => {
        const q = query.toLowerCase();
        const noise = ["skip to main", "notifications", "messaging", "my network", "home", "jobs", "for business"];
        let cleanText = document.body.innerText;
        noise.forEach(n => cleanText = cleanText.replace(new RegExp(n, "gi"), ""));

        setTimeout(() => {
            // 1. Direct Command: URL / Link
            if (q === "url" || q === "link" || q.includes("where") || (q.includes("url") && q.length < 15)) {
                const fullLink = window.location.href.split('?')[0];
                addMessage(`📍 <strong>Direct Profile Link:</strong><br>${fullLink}`, 'bot-ext');
                return;
            }

            // 2. Intent Detection
            if (q.includes("summarize") || q.includes("who is")) {
                const name = document.querySelector('meta[property="og:title"]')?.content?.split(" | ")[0] || "this profile";
                addMessage(`📝 <strong>Executive Summary:</strong><br>I've analyzed ${name}. They appear to be a potential fit for our RevOps automation tool based on their current role and historical focus on CRM scaling.`, 'bot-ext');
            } else {
                addMessage(`🤖 <strong>Local Context Insight:</strong><br>I've indexed this page. I can help you find relevant leads, draft emails, or analyze the current profile against your ICP.`, 'bot-ext');
            }
        }, 800);
    };

    // --- Camera Mode: Passive Viewport Capture ---
    let cameraActive = false;
    let seenElements = new Set();
    
    const triggerShutter = () => {
        const container = document.getElementById('revops-container');
        container.style.boxShadow = '0 0 40px rgba(59, 130, 246, 0.8)';
        setTimeout(() => container.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)', 200);
    };

    const passiveCapture = () => {
        if (!cameraActive) return;

        const profileLinks = Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/in/') && !a.href.includes('/ACoAA') && a.innerText.trim().length > 2)
            .map(a => a.href.split('?')[0]);

        const uniqueNew = profileLinks.filter(link => !seenElements.has(link));
        
        if (uniqueNew.length > 0) {
            triggerShutter();
            uniqueNew.forEach((link, i) => {
                seenElements.add(link);
                setTimeout(() => {
                    addMessage(`📸 <strong>Camera Capture:</strong> New lead index ${link.split('/in/')[1]}`, 'bot-ext');
                    syncWithBrain("Camera/Scroll Capture", { captured_link: link });
                }, i * 500);
            });
        }
    };

    window.addEventListener('scroll', () => {
        if (cameraActive) {
            // Debounced capture
            clearTimeout(window.scrollDebounce);
            window.scrollDebounce = setTimeout(passiveCapture, 1000);
        }
    });

    cameraBtn.addEventListener('click', () => {
        cameraActive = !cameraActive;
        cameraBtn.style.color = cameraActive ? '#ef4444' : '';
        addMessage(`📷 <strong>Camera Mode: ${cameraActive ? 'ACTIVATED' : 'DEACTIVATED'}</strong><br>${cameraActive ? 'Scanning viewport for new intelligence as you scroll...' : 'Passive indexing paused.'}`, 'bot-ext');
    });

    // --- Automation Scripts (The Robot) ---
    const expandSections = async () => {
        addMessage("🔍 <strong>Expanding profile sections...</strong>", 'bot-ext');

        // Match "See more", "See all", "Show all X skills", and "+ X skills" inline expanders
        const skillCountPattern = /^\+\s*\d+\s+skills?$/i;
        const showAllPattern = /show all \d+ skills/i;

        const expandTargets = Array.from(document.querySelectorAll('button, a, span[role="button"]'))
            .filter(el => {
                const text = el.innerText?.trim() || '';
                return text.includes('See more') ||
                       text.includes('See all') ||
                       showAllPattern.test(text) ||
                       skillCountPattern.test(text);
            });

        // Click all at once, then wait once for DOM to settle
        expandTargets.forEach(el => el.click());
        await new Promise(r => setTimeout(r, 800));
    };


    const NOISE_SELECTORS = [
        'aside',
        '.scaffold-layout__aside',
        '.pv-profile-pymk-section',
        '.pv-browsemap-section',
        '.pv-ad-unit',
        '.artdeco-carousel',
    ];

    const NOISE_HEADINGS = ['people you may know', 'who viewed your profile', 'you might like', 'interests'];

    const scrapeFullPage = () => {
        // Target only the main profile column — excludes sidebar, ads, suggestions
        const mainEl = document.querySelector('div.scaffold-layout__main') ||
                       document.querySelector('main') ||
                       document.body;

        const clone = mainEl.cloneNode(true);

        // Strip known noise elements
        NOISE_SELECTORS.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));

        // Strip sections whose heading matches noise patterns
        clone.querySelectorAll('section').forEach(section => {
            const heading = section.querySelector('h2, h3')?.innerText?.toLowerCase() || '';
            if (NOISE_HEADINGS.some(n => heading.includes(n))) section.remove();
        });

        let cleanText = clone.innerText || clone.textContent || '';
        cleanText = cleanText
            .replace(/\n\s*\n/g, '\n')
            .replace(/LinkedIn Corporation © \d+/g, '')
            .substring(0, 15000);

        return cleanText;
    };

    const scrapeDetailedData = async () => {
        // 1. Jiggle Scroll to trigger Lazy Loading
        window.scrollBy(0, 50);
        await new Promise(r => setTimeout(r, 100));
        window.scrollBy(0, -50);

        // 2. Get a section by LinkedIn's anchor ID, with safe fallbacks — never uses parentElement
        const getSection = (anchorId, headingText, charLimit = 2000) => {
            const anchor = document.getElementById(anchorId);
            if (anchor) {
                // Case A: anchor is a wrapper div containing the section (LinkedIn new layout)
                const innerSection = anchor.querySelector('section');
                if (innerSection) return innerSection.innerText.trim().substring(0, charLimit);
                // Case B: anchor itself has meaningful direct content
                const directText = anchor.innerText?.trim() || '';
                if (directText.length > 100) return directText.substring(0, charLimit);
                // Case C: anchor is an empty sibling anchor — fall through to heading search
            }
            // Fallback: find by heading text, scoped to main profile column only
            const mainEl = document.querySelector('div.scaffold-layout__main') || document.body;
            const allSections = Array.from(mainEl.querySelectorAll('section'));
            const exactMatch = allSections.find(s =>
                s.querySelector('h2, h3')?.innerText?.trim().toLowerCase() === headingText.toLowerCase()
            );
            if (exactMatch) return exactMatch.innerText.trim().substring(0, charLimit);
            const partialMatch = allSections.find(s =>
                s.querySelector('h2')?.innerText?.toLowerCase().includes(headingText.toLowerCase())
            );
            return (partialMatch?.innerText?.trim() || '').substring(0, charLimit);
        };

        // Headline: the bio/tagline line directly under the name on the profile card
        const headline = document.querySelector('.pv-text-details__left-panel .text-body-medium.break-words')?.innerText?.trim() ||
                         document.querySelector('.pv-text-details__left-panel .text-body-medium')?.innerText?.trim() ||
                         document.querySelector('.ph5 .text-body-medium.break-words')?.innerText?.trim() ||
                         document.querySelector('.text-body-medium.break-words')?.innerText?.trim() ||
                         '';

        // About/Bio: try multiple selectors LinkedIn has used across versions
        const aboutSection = getSection('about', 'About');
        const aboutText = aboutSection ||
                          document.querySelector('.pv-about__summary-text')?.innerText?.trim() ||
                          document.querySelector('.pv-shared-text-with-see-more')?.innerText?.trim() ||
                          document.querySelector('.pv-about-section')?.innerText?.trim() ||
                          document.querySelector('[data-v-about]')?.innerText?.trim() ||
                          '';

        const data = {
            name: document.querySelector('meta[property="og:title"]')?.content?.split(" | ")[0] || document.title.split(" | ")[0],
            role: headline || "Role Hidden",
            headline,
            about: aboutText,
            experience: getSection('experience', 'Experience'),
            education: getSection('education', 'Education', 1000),
            skills: getSection('skills', 'Skills', 1500),
            contact: "N/A (Limited Scan)",
            full_page_content: scrapeFullPage()
        };

        const totalChars = (data.name + data.role + data.experience + data.full_page_content).length;
        addMessage(`🛡️ <strong>Ironclad Scraper Report:</strong> Depth scan successful. Captured ${totalChars} characters of profile-only content.`, 'bot-ext');

        return data;
    };

    const downloadSnapshot = (data, decision) => {
        const header = `REVOPS INTELLIGENCE SNAPSHOT\nGenerated: ${new Date().toLocaleString()}\nSource: ${window.location.href}\nVerdict: ${decision.status} (${decision.fit_score}/10)\nReason: ${decision.reason}\n-----------------------------------\n\n`;
        const body = `NAME: ${data.name}\nROLE: ${data.role}\nHEADLINE: ${data.headline}\n\nBIO / ABOUT:\n${data.about}\n\nEXPERIENCE:\n${data.experience}\n\nEDUCATION:\n${data.education}\n\nSKILLS:\n${data.skills}`;
        const blob = new Blob([header + body], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (data.name || 'profile').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.href = url;
        a.download = `revops_${safeName}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- Unified Strategic Sync (The Brain Loop) ---
    const syncWithBrain = (source = "Manual Audit", extraData = null) => {
        return new Promise((resolve, reject) => {
            const domain = window.location.hostname;
            const profileUrl = window.location.href.split('?')[0];
            const profileName = document.querySelector('meta[property="og:title"]')?.content?.split(" | ")[0] || document.title.split(" | ")[0] || "Unknown Profile";

            const targetURL = window.RevOpsBrainURL;
            console.log(`[RevOps] Attempting brain sync to: ${targetURL}`);

            if (!targetURL) {
                addMessage("⚠️ <strong>Configuration Error:</strong> Brain connection (webhook) missing.", 'bot-ext');
                return reject("Missing URL");
            }

            const payload = {
                timestamp: new Date().toISOString(),
                source: source,
                domain: domain,
                linkedin_url: profileUrl,
                name: profileName,
                product_context: window.RevOpsProductContext || null,
                detailed_info: extraData
            };

            addMessage("🧠 <strong>Sent to Strategic Brain...</strong> <br><span style='font-size: 0.75rem; opacity: 0.7;'>Awaiting KB decision...</span>", 'bot-ext');

            chrome.runtime.sendMessage({
                type: "SYNC_TO_MAKE",
                url: targetURL,
                payload: payload
            }, (response) => {
                console.log("[RevOps] Background response received:", response);
                if (response && response.success) {
                    // This is where the Brain (n8n/Backend) returns the decision
                    const brainResult = response.data || {};
                    resolve(brainResult);
                } else {
                    const errMsg = response?.error || "Could not reach the central knowledge base.";
                    const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('429');
                    if (isQuota) {
                        addMessage("❌ <strong>Rate limit hit.</strong> Groq's free tier has a daily token cap. Wait a few minutes and try again, or upgrade at <code>console.groq.com/settings/billing</code>.", 'bot-ext');
                    } else {
                        addMessage(`❌ <strong>Scan Failed:</strong> ${errMsg}`, 'bot-ext');
                    }
                    reject(errMsg);
                }
            });
        });
    };

    // UI Listeners
    closeBtn.addEventListener('click', () => container.classList.add('hidden-ext'));
    
    scrapeBtn.addEventListener('click', async () => {
        addMessage("⚡ <strong>Quick Scan...</strong>", 'bot-ext');

        // Grab whatever is visible on the page right now — no expansion
        const name = document.querySelector('meta[property="og:title"]')?.content?.split(" | ")[0] || document.title.split(" | ")[0] || "Unknown";
        const headline = document.querySelector('.pv-text-details__left-panel .text-body-medium.break-words')?.innerText?.trim() ||
                         document.querySelector('.text-body-medium.break-words')?.innerText?.trim() || '';
        const about = document.querySelector('#about')?.innerText?.trim() ||
                      document.querySelector('.pv-about-section')?.innerText?.trim() || '';
        const quickData = { role: headline, headline, about, experience: '', education: '', skills: '', chat_history: 'N/A' };

        try {
            const decision = await syncWithBrain("Quick Scan", quickData);
            const score = decision.fit_score || '?';
            const scoreColor = score >= 7 ? '#10b981' : score >= 4 ? '#f59e0b' : '#ef4444';
            const scorecardEl = document.createElement('div');
            scorecardEl.className = 'message-ext bot-ext';
            scorecardEl.innerHTML = `
                <div style="text-align:center; padding:10px 0;">
                    <div style="font-size:2.2rem; font-weight:800; color:${scoreColor}; line-height:1;">${score}<span style="font-size:1rem; opacity:0.6;">/10</span></div>
                    <div style="font-size:0.7rem; opacity:0.6; margin-top:2px; letter-spacing:1px; text-transform:uppercase;">Quick Score</div>
                </div>`;
            document.getElementById('chat-messages-ext').appendChild(scorecardEl);

            const verdict = decision.status === "APPROVE" ? `🎯 <strong>GOOD FIT</strong>` : `🚫 <strong>NOT A FIT</strong>`;
            const pointerLines = (decision.pointers || []).map(p => `
                <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                    <span style="color:${decision.status === 'APPROVE' ? '#10b981' : '#ef4444'};flex-shrink:0;">${decision.status === 'APPROVE' ? '✅' : '❌'}</span>
                    <span style="font-size:0.82rem;line-height:1.4;">${p}</span>
                </div>`).join('');
            const resultEl = document.createElement('div');
            resultEl.className = 'message-ext bot-ext';
            resultEl.innerHTML = `${verdict}<br><span style="opacity:0.75;font-size:0.82rem;">${decision.reason}</span><br><br>${pointerLines}`;
            document.getElementById('chat-messages-ext').appendChild(resultEl);
            document.getElementById('chat-messages-ext').scrollTop = 99999;
        } catch (e) {
            addMessage("⚠️ Quick scan failed. Try the robot button for a full scan.", 'bot-ext');
        }
    });

    deepScanBtn.addEventListener('click', async () => {
        const currentUrl = window.location.href.split('?')[0];
        
        addMessage("🔍 <strong>Consulting Strategic Memory...</strong>", 'bot-ext');
        const memory = await window.IntelligenceDB.checkLeadMemory(currentUrl);
        
        if (memory) {
            addMessage(`🧠 <strong>MEMORY FOUND:</strong> I already know this lead.`, 'bot-ext');
            addMessage(`📜 <strong>Past Intelligence:</strong><br>• <strong>Decision:</strong> ${memory.kb_decision}<br>• <strong>Reason:</strong> ${memory.kb_reasoning}<br>• <strong>Saved:</strong> ${new Date(memory.created_at).toLocaleDateString()}`, 'bot-ext');
            return; // Skip sync as we already have the intelligence
        }

        addMessage("🚀 <strong>Auto-Pilot Engaged: Strategic Context Audit...</strong>", 'bot-ext');

        const isMessaging = window.location.href.includes('/messaging/thread/');
        
        // 1. Expand (Profiles only)
        if (!isMessaging) await expandSections();

        // 2. Contact Info (Profiles only) - DISABLED BY REQUEST
        const contactData = "N/A (Skipped)";
        
        // 3. Read Chat (Messaging only)
        const chatData = isMessaging ? scrapeChatHistory() : "N/A (Profile Page)";

        // 4. Scrape Base Data
        const fullData = await scrapeDetailedData();
        fullData.contact = contactData;
        fullData.chat_history = chatData;

        // 5. Brain Decision Return Loop
        try {
            const decision = await syncWithBrain("Automated Deep Scan", fullData);

            const score = decision.fit_score || 0;
            const scoreColor = score >= 7 ? '#10b981' : score >= 4 ? '#f59e0b' : '#ef4444';
            const scoreLabel = score >= 8 ? 'Strong Fit' : score >= 6 ? 'Good Fit' : score >= 4 ? 'Weak Fit' : 'Not a Fit';
            const fillPct = (score / 10) * 100;
            const bd = decision.score_breakdown || {};

            const dimRow = (label, s, max, note) => {
                const dimFill = Math.round((s / max) * 100);
                const dimColor = s === max ? '#10b981' : s === 0 ? '#ef4444' : '#f59e0b';
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <span style="font-size:0.68rem;opacity:0.6;width:100px;flex-shrink:0;">${label}</span>
                    <div style="flex:1;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;">
                        <div style="height:3px;width:${dimFill}%;background:${dimColor};border-radius:2px;"></div>
                    </div>
                    <span style="font-size:0.68rem;font-weight:700;color:${dimColor};width:24px;text-align:right;">${s}/${max}</span>
                </div>`;
            };

            const scorecardEl = document.createElement('div');
            scorecardEl.className = 'message-ext bot-ext';
            scorecardEl.innerHTML = `
                <div style="text-align:center;padding:8px 0 14px;">
                    <div style="font-size:2.6rem;font-weight:800;color:${scoreColor};line-height:1;">${score}<span style="font-size:1.1rem;opacity:0.4;">/10</span></div>
                    <div style="margin:6px auto 0;max-width:160px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;">
                        <div style="height:6px;width:${fillPct}%;background:${scoreColor};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <div style="font-size:0.7rem;font-weight:600;color:${scoreColor};margin-top:5px;letter-spacing:0.5px;">${scoreLabel}</div>
                </div>
                <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
                    ${dimRow('Authority', bd.buying_authority?.score ?? 0, 3, bd.buying_authority?.note)}
                    ${dimRow('Role Fit', bd.role_product_fit?.score ?? 0, 2, bd.role_product_fit?.note)}
                    ${dimRow('Company', bd.company_fit?.score ?? 0, 2, bd.company_fit?.note)}
                    ${dimRow('Pain Signal', bd.pain_signals?.score ?? 0, 2, bd.pain_signals?.note)}
                    ${dimRow('Timing', bd.timing?.score ?? 0, 1, bd.timing?.note)}
                </div>`;
            document.getElementById('chat-messages-ext').appendChild(scorecardEl);
            document.getElementById('chat-messages-ext').scrollTop = 99999;

            if (decision.status === "APPROVE") {
                addMessage(`🎯 <strong>APPROVED</strong><br><span style="opacity:0.75; font-size:0.82rem;">${decision.reason || "Matched ICP criteria"}</span>`, 'bot-ext');

                // Pointers card
                const pointersEl = document.createElement('div');
                pointersEl.className = 'message-ext bot-ext';
                const pointerLines = (decision.pointers || []).map(p => `
                    <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px;">
                        <span style="color:#10b981; font-size:1rem; flex-shrink:0;">✅</span>
                        <span style="font-size:0.82rem; line-height:1.4;">${p}</span>
                    </div>`).join('');
                pointersEl.innerHTML = `<div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; opacity:0.5; margin-bottom:10px;">Why this candidate</div>${pointerLines}`;
                document.getElementById('chat-messages-ext').appendChild(pointersEl);
                document.getElementById('chat-messages-ext').scrollTop = 99999;

                // Helper to render a message block with copy + autofill
                const renderMessageBlock = (containerId, label, labelColor, charBadge, text) => {
                    const el = document.createElement('div');
                    el.className = 'message-ext bot-ext';
                    const copyId = `revops-copy-${containerId}`;
                    const fillId = `revops-fill-${containerId}`;
                    el.innerHTML = `
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                            <strong style="font-size:0.8rem;">${label}</strong>
                            <span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:${labelColor}22;color:${labelColor};font-weight:600;">${charBadge}</span>
                        </div>
                        <div style="padding:10px;background:rgba(255,255,255,0.07);border-radius:8px;font-size:0.82rem;line-height:1.5;white-space:pre-wrap;">${text}</div>
                        <div style="display:flex;gap:8px;margin-top:6px;">
                            <button id="${copyId}" style="flex:1;padding:6px 10px;border:none;border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-size:0.78rem;font-weight:600;">Copy</button>
                            <button id="${fillId}" style="flex:1;padding:6px 10px;border:none;border-radius:6px;background:#10b981;color:#fff;cursor:pointer;font-size:0.78rem;font-weight:600;">Auto-fill</button>
                        </div>
                    `;
                    document.getElementById('chat-messages-ext').appendChild(el);
                    document.getElementById('chat-messages-ext').scrollTop = 99999;

                    document.getElementById(copyId).addEventListener('click', () => {
                        navigator.clipboard.writeText(text).then(() => {
                            document.getElementById(copyId).innerText = 'Copied ✓';
                            setTimeout(() => { document.getElementById(copyId).innerText = 'Copy'; }, 2000);
                        });
                    });
                    document.getElementById(fillId).addEventListener('click', () => {
                        const composer = document.querySelector('.msg-form__contenteditable') ||
                                         document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                                         document.querySelector('div[data-artdeco-is-focused][contenteditable="true"]');
                        if (composer) {
                            composer.focus();
                            document.execCommand('insertText', false, text);
                            addMessage('✅ <strong>Inserted into composer.</strong>', 'bot-ext');
                        } else {
                            addMessage('⚠️ <strong>Composer not found.</strong> Open the LinkedIn message dialog first.', 'bot-ext');
                        }
                    });
                };

                if (decision.connection_note) {
                    const charCount = decision.connection_note.length;
                    renderMessageBlock('note', '🔗 Connection Request Note', '#f59e0b', `${charCount}/300 chars`, decision.connection_note);
                }
                if (decision.message) {
                    renderMessageBlock('dm', '✉️ DM (after they accept)', '#6366f1', 'Send after connecting', decision.message);

                    // Store last scan context for follow-up (persisted across reloads)
                    window._lastScanContext = {
                        name: profileName,
                        role: fullData?.role || '',
                        company: profileUrl.split('/in/')[1]?.replace(/\/$/, '') || '',
                        dm: decision.message
                    };
                    chrome.storage.local.set({ lastScanContext: window._lastScanContext });

                    const hintEl = document.createElement('div');
                    hintEl.className = 'message-ext bot-ext';
                    hintEl.style.cssText = 'opacity:0.6;font-size:0.75rem;';
                    hintEl.innerHTML = `When they reply, paste it here as:<br><code>REPLY: [their message]</code>`;
                    document.getElementById('chat-messages-ext').appendChild(hintEl);
                    document.getElementById('chat-messages-ext').scrollTop = 99999;
                }
            } else {
                addMessage(`🚫 <strong>NOT A FIT</strong><br><span style="opacity:0.75; font-size:0.82rem;">${decision.reason || "Low ICP alignment"}</span>`, 'bot-ext');

                const skipEl = document.createElement('div');
                skipEl.className = 'message-ext bot-ext';
                const skipLines = (decision.pointers || []).map(p => `
                    <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px;">
                        <span style="color:#ef4444; font-size:1rem; flex-shrink:0;">❌</span>
                        <span style="font-size:0.82rem; line-height:1.4;">${p}</span>
                    </div>`).join('');
                skipEl.innerHTML = `<div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; opacity:0.5; margin-bottom:10px;">Why not a fit</div>${skipLines}`;
                document.getElementById('chat-messages-ext').appendChild(skipEl);
                document.getElementById('chat-messages-ext').scrollTop = 99999;
            }

            await window.IntelligenceDB.saveLead(fullData, decision);
            downloadSnapshot(fullData, decision);

        } catch (err) {
            console.error("Brain Loop error", err);
        }

    });

    autoSequenceBtn.addEventListener('click', async () => {
        // Scroll to bottom first to load all lazy-loaded results
        addMessage("📜 <strong>Scrolling to load all results...</strong>", 'bot-ext');
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 2000));
        
        const links = Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('/in/') && !a.href.includes('/ACoAA') && a.innerText.trim().length > 2) 
            .map(a => a.href.split('?')[0]);
        
        const uniqueLinks = [...new Set(links)];
        
        addMessage(`🔄 <strong>Auto-Sequence Started:</strong> Found ${uniqueLinks.length} target leads.`, 'bot-ext');
        
        for (let i = 0; i < uniqueLinks.length; i++) {
            const link = uniqueLinks[i];
            await new Promise(r => setTimeout(r, 800)); // Stagger processing
            addMessage(`🔗 <strong>Queuing Lead ${i+1}/${uniqueLinks.length}:</strong> ${link.split('/in/')[1]}`, 'bot-ext');
            syncWithBrain("Auto-Sequence List", { profile_queued: link, position: i + 1 }).catch(() => {});
        }
    });

    const fetchAndShowICP = (productContext) => {
        chrome.runtime.sendMessage({
            type: "SYNC_TO_MAKE",
            url: window.RevOpsBrainURL.replace('/process-lead', '/analyze-product'),
            payload: { product_context: productContext }
        }, (response) => {
            if (!response || !response.success) return;
            const icp = response.data;
            const titlesHtml = (icp.ideal_titles || []).map(t => `<span style="display:inline-block;padding:2px 8px;background:rgba(99,102,241,0.2);border-radius:10px;font-size:0.75rem;margin:2px;">${t}</span>`).join('');
            const industriesHtml = (icp.ideal_industries || []).map(i => `<span style="display:inline-block;padding:2px 8px;background:rgba(16,185,129,0.15);border-radius:10px;font-size:0.75rem;margin:2px;">${i}</span>`).join('');
            const painHtml = (icp.top_pain_signals || []).map(p => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:5px;"><span style="color:#f59e0b;flex-shrink:0;">⚡</span><span style="font-size:0.8rem;">${p}</span></div>`).join('');
            const avoidHtml = (icp.avoid || []).map(a => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:5px;"><span style="color:#ef4444;flex-shrink:0;">✗</span><span style="font-size:0.8rem;">${a}</span></div>`).join('');
            const icpEl = document.createElement('div');
            icpEl.className = 'message-ext bot-ext';
            icpEl.innerHTML = `
                <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;opacity:0.5;margin-bottom:10px;">🎯 Who to pitch</div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.7rem;opacity:0.6;margin-bottom:5px;">IDEAL TITLES</div>
                    ${titlesHtml}
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.7rem;opacity:0.6;margin-bottom:5px;">INDUSTRIES</div>
                    ${industriesHtml}
                </div>
                <div style="margin-bottom:4px;font-size:0.7rem;opacity:0.6;">STAGE</div>
                <div style="font-size:0.8rem;margin-bottom:10px;">${icp.ideal_company_stage || ''}</div>
                <div style="margin-bottom:8px;">
                    <div style="font-size:0.7rem;opacity:0.6;margin-bottom:5px;">PAIN SIGNALS TO LOOK FOR</div>
                    ${painHtml}
                </div>
                <div>
                    <div style="font-size:0.7rem;opacity:0.6;margin-bottom:5px;">SKIP IMMEDIATELY</div>
                    ${avoidHtml}
                </div>
            `;
            document.getElementById('chat-messages-ext').appendChild(icpEl);
            document.getElementById('chat-messages-ext').scrollTop = 99999;
        });
    };


    sendBtn.addEventListener('click', async () => {
        const text = userInput.value.trim();
        const q = text.toLowerCase();
        if (text) {
            addMessage(text, 'user-ext');
            userInput.value = '';

            // --- Clear chat history ---
            if (q === 'clear') {
                chrome.storage.local.remove(['chatHistory'], () => {
                    messagesContainer.innerHTML = '';
                    addMessage('🧹 <strong>Chat cleared.</strong>', 'bot-ext');
                });
                return;
            }

            // --- Product Context ---
            if (q === 'product') {
                chrome.storage.local.get(['productContext'], (result) => {
                    if (result.productContext) {
                        addMessage(`📦 <strong>Current Product Context:</strong><br><span style="opacity:0.8; font-size:0.82rem;">${result.productContext}</span><br><br>To update it, type: <code>PRODUCT: [your description]</code>`, 'bot-ext');
                    } else {
                        addMessage(`📦 <strong>No product set yet.</strong><br>Type: <code>PRODUCT: [describe your SaaS product in 1-3 sentences — what it does, who it's for, what pain it solves]</code>`, 'bot-ext');
                    }
                });
                return;
            }

            if (text.toUpperCase().startsWith('PRODUCT:')) {
                const productContext = text.substring(8).trim();
                if (productContext.length < 10) {
                    addMessage('⚠️ Description too short. Tell me what your product does, who it\'s for, and what pain it solves.', 'bot-ext');
                    return;
                }
                chrome.storage.local.set({ productContext }, () => {
                    window.RevOpsProductContext = productContext;
                });

                // Call backend to analyze ICP
                fetchAndShowICP(productContext);
                return;
            }

            // --- Settings Flow ---
            if (q === 'settings') {
                addMessage("⚙️ <strong>Configuration:</strong><br>• Set your product: <code>PRODUCT: [description]</code><br>• Set backend keys: <code>BRAIN: (url) | DB_URL: (url) | DB_KEY: (key)</code>", 'bot-ext');
                return;
            }

            if (q.includes('brain:') || (q.includes('db_url:') && q.includes('db_key:'))) {
                const brainUrl = text.match(/BRAIN:\s*(.*?)\s*(?:\||$)/i)?.[1];
                const supabaseUrl = text.match(/DB_URL:\s*(.*?)\s*(?:\||$)/i)?.[1];
                const supabaseKey = text.match(/DB_KEY:\s*(.*?)\s*(?:\||$)/i)?.[1];
                
                let updates = {};
                if (brainUrl) updates.brainUrl = brainUrl;
                if (supabaseUrl) updates.supabaseUrl = supabaseUrl;
                if (supabaseKey) updates.supabaseKey = supabaseKey;

                chrome.storage.local.set(updates, () => {
                    addMessage("✅ <strong>Settings Updated!</strong> Your strategic loop is now configured.", 'bot-ext');
                    window.IntelligenceDB.init();
                    // Update the local constant for the current session if needed
                    if (brainUrl) window.N8N_WEBHOOK_URL = brainUrl;
                });
                return;
            }

            // --- History Recall ---
            if (q === 'history') {
                addMessage("📚 <strong>Retrieving Recent Intelligence History...</strong>", 'bot-ext');
                const history = await window.IntelligenceDB.getHistory();
                if (!history || history.length === 0) {
                    addMessage("❌ <strong>No history found yet.</strong> Start scanning profiles to build your intelligence.", 'bot-ext');
                } else {
                    history.slice(0, 5).forEach(item => {
                        addMessage(`🔗 <strong>Lead:</strong> ${item.name}<br>📌 <strong>Verdict:</strong> ${item.kb_decision}<br>📝 <strong>Reason:</strong> ${item.kb_reasoning}`, 'bot-ext');
                    });
                }
                return;
            }

            // Priority 1: Direct Commands
            if (q === "url" || q === "link") {
                const fullLink = window.location.href.split('?')[0];
                addMessage(`📍 <strong>Direct Profile Link:</strong><br>${fullLink}`, 'bot-ext');
                return;
            }

            // --- Follow-up from prospect reply ---
            if (text.toUpperCase().startsWith('REPLY:')) {
                const theirReply = text.substring(6).trim();
                if (!theirReply) {
                    addMessage('⚠️ Paste their reply after <code>REPLY:</code>', 'bot-ext');
                    return;
                }
                const ctx = window._lastScanContext || {};
                addMessage('💬 <strong>Generating follow-up...</strong>', 'bot-ext');
                chrome.runtime.sendMessage({
                    type: "SYNC_TO_MAKE",
                    url: window.RevOpsBrainURL.replace('/process-lead', '/follow-up'),
                    payload: {
                        prospect_name: ctx.name || 'the prospect',
                        prospect_role: ctx.role || '',
                        prospect_company: ctx.company || '',
                        their_reply: theirReply,
                        your_dm: ctx.dm || '',
                        product_context: window.RevOpsProductContext || null
                    }
                }, (response) => {
                    if (!response || !response.success) {
                        addMessage('❌ Could not generate follow-up.', 'bot-ext');
                        return;
                    }
                    const followUp = response.data?.follow_up;
                    if (!followUp) return;
                    const fuEl = document.createElement('div');
                    fuEl.className = 'message-ext bot-ext';
                    const copyId = 'revops-copy-followup-' + Date.now();
                    fuEl.innerHTML = `
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                            <strong style="font-size:0.8rem;">↩️ Follow-up Reply</strong>
                        </div>
                        <div style="padding:10px;background:rgba(255,255,255,0.07);border-radius:8px;font-size:0.82rem;line-height:1.5;white-space:pre-wrap;">${followUp}</div>
                        <div style="display:flex;gap:8px;margin-top:6px;">
                            <button id="${copyId}" style="flex:1;padding:6px 10px;border:none;border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-size:0.78rem;font-weight:600;">Copy</button>
                        </div>
                    `;
                    document.getElementById('chat-messages-ext').appendChild(fuEl);
                    document.getElementById('chat-messages-ext').scrollTop = 99999;
                    document.getElementById(copyId).addEventListener('click', () => {
                        navigator.clipboard.writeText(followUp).then(() => {
                            document.getElementById(copyId).innerText = 'Copied ✓';
                            setTimeout(() => { document.getElementById(copyId).innerText = 'Copy'; }, 2000);
                        });
                    });
                });
                return;
            }

            if (q.includes("?") || q.includes("who") || q.includes("what") || q.includes("summarize")) {
                processQuery(text);
            }
        }
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    // Auto-detect product description on paste
    userInput.addEventListener('paste', (e) => {
        setTimeout(() => {
            const pasted = userInput.value.trim();
            const isCommand = /^(product|settings|history|url|link|brain:|db_url:|reply:)/i.test(pasted);
            const isProductPrefix = pasted.toUpperCase().startsWith('PRODUCT:');
            if (!isCommand && !isProductPrefix && pasted.length > 80) {
                userInput.value = `PRODUCT: ${pasted}`;
                sendBtn.click();
            }
        }, 50);
    });

    // --- SPA Navigation Watcher ---
    // LinkedIn never does a full page reload — it swaps content via pushState.
    // Also checks if the widget was removed from the DOM (tab switch / discard) and re-injects it.
    let _lastUrl = window.location.href;
    setInterval(() => {
        // Re-inject widget if LinkedIn wiped it from the DOM (tab switch / page discard)
        if (!document.getElementById('revops-bubble') && document.body) {
            injectUI();
            return;
        }

        const currentUrl = window.location.href;
        if (currentUrl === _lastUrl) return;
        _lastUrl = currentUrl;

        // Update header tag
        const domainTag = document.querySelector('#domain-tag-ext');
        if (domainTag) domainTag.textContent = `📍 ${window.location.hostname}`;

        // Add a visual separator so it's clear the context changed
        const sep = document.createElement('div');
        sep.style.cssText = 'border-top:1px solid rgba(255,255,255,0.1); margin:8px 0; padding-top:8px; font-size:0.72rem; opacity:0.5; text-align:center;';
        sep.textContent = '— new page —';
        document.getElementById('chat-messages-ext')?.appendChild(sep);

        if (currentUrl.includes('/in/')) {
            addMessage(`🔄 <strong>New profile loaded.</strong> Hit the robot to scan.`, 'bot-ext');
            autoSequenceBtn.classList.add('hidden-ext');
        } else if (currentUrl.includes('/search/results/')) {
            addMessage(`🔍 <strong>Search results detected.</strong> Want me to scan all profiles in this list?`, 'bot-ext');
            autoSequenceBtn.classList.remove('hidden-ext');
        } else if (currentUrl.includes('/messaging/thread/')) {
            addMessage(`💬 <strong>LinkedIn Chat Detected.</strong> I can read this conversation history.`, 'bot-ext');
            autoSequenceBtn.classList.add('hidden-ext');
        }

        document.getElementById('chat-messages-ext').scrollTop = 99999;
    }, 1000);

    bubble.addEventListener('click', () => {
        const isOpening = container.classList.contains('hidden-ext');
        container.classList.toggle('hidden-ext');

        if (isOpening) {
            // Hard-Refresh Context
            const domain = window.location.hostname || "Local Context";
            const fullUrl = window.location.href;

            // Force-Update Header Tag
            const domainTag = document.querySelector('#domain-tag-ext');
            if (domainTag) domainTag.textContent = `📍 ${domain}`;

            console.log(`[Intelligence Lock] URL: ${fullUrl}`);

            // Detect Search Page
            if (fullUrl.includes('/search/results/')) {
                autoSequenceBtn.classList.remove('hidden-ext');
                addMessage("🔍 <strong>Search Results detected.</strong> Want me to scan all profiles in this list?", 'bot-ext');
            } else if (fullUrl.includes('/messaging/thread/')) {
                autoSequenceBtn.classList.add('hidden-ext');
                addMessage("💬 <strong>LinkedIn Chat Detected.</strong> I can read this conversation history to inform my strategic decision.", 'bot-ext');
            } else {
                autoSequenceBtn.classList.add('hidden-ext');
            }
        }
    });
}
