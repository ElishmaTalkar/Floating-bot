document.addEventListener('DOMContentLoaded', () => {
    const bubble = document.getElementById('chat-bubble');
    const container = document.getElementById('chat-container');
    const closeBtn = document.getElementById('close-chat');
    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');
    const messagesContainer = document.getElementById('chat-messages');

    // Toggle Chat
    bubble.addEventListener('click', () => {
        container.classList.toggle('hidden');
    });

    closeBtn.addEventListener('click', () => {
        container.classList.add('hidden');
    });

    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Send Message
    const sendMessage = () => {
        const text = userInput.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        userInput.value = '';
        userInput.style.height = 'auto';

        // Simulate AI Analysis
        showTypingIndicator();
        setTimeout(() => {
            removeTypingIndicator();
            const analysis = analyzeLead(text);
            addMessage(analysis, 'bot', true);
        }, 1500);
    };

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const addMessage = (content, sender, isHTML = false) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}`;
        if (isHTML) {
            msgDiv.innerHTML = content;
        } else {
            msgDiv.textContent = content;
        }
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const showTypingIndicator = () => {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const removeTypingIndicator = () => {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    };

    // --- Lead Analysis Engine ---
    const analyzeLead = (input) => {
        const lowerInput = input.toLowerCase();

        // ICP Criteria
        const idealTitles = ['revops', 'vp of sales', 'revenue operations', 'cro', 'sales operations'];
        const idealIndustries = ['saas', 'tech', 'software', 'b2b'];
        const nonFitIndustries = ['b2c', 'retail', 'manufacturing', 'healthcare', 'bakery', 'restaurant'];

        // Helper: Extract company size if mentioned
        const sizeMatch = input.match(/(\d+)\s*( employees| staff| headcount)/i);
        const size = sizeMatch ? parseInt(sizeMatch[1]) : null;

        // Logic check
        let isRelevant = false;
        let score = 0;
        let reason = "";
        let betterFit = "";

        // 1. Title Check (Strongest indicator)
        const hasIdealTitle = idealTitles.some(title => lowerInput.includes(title));
        if (hasIdealTitle) score += 5;

        // 2. Industry Check
        const isB2BTech = idealIndustries.some(ind => lowerInput.includes(ind));
        const isB2C = nonFitIndustries.some(ind => lowerInput.includes(ind));
        if (isB2BTech && !isB2C) score += 3;

        // 3. Size Check
        if (size) {
            if (size >= 20 && size <= 200) {
                score += 2;
            } else if (size < 10) {
                return formatNotRelevant("Company size is too small (< 10 employees).", "A mid-sized tech company with 20-200 employees.");
            } else if (size > 500) {
                return formatNotRelevant("Enterprise companies above 500 employees are not your current focus.", "A growing mid-market company (20-200 employees).");
            }
        } else {
            // Default score adjustment if size unknown but title is perfect
            if (hasIdealTitle) score += 1; 
        }

        // Final Decision
        if (score >= 6) {
            return formatRelevant(score, input);
        } else {
            return formatNotRelevant("The lead doesn't match the ICP criteria for role, industry, or company size.", "A Head of RevOps at a 50-150 employee SaaS company.");
        }
    };

    const formatRelevant = (score, input) => {
        // Extract name/title for personalization
        const parts = input.split(',').map(p => p.trim());
        const name = parts[0] || "there";
        const title = parts[1] || "RevOps leader";

        return `
            <div class="badge relevant">✅ Relevant Lead</div>
            <strong>Fit Score: ${score}/10</strong><br><br>
            <strong>Why they fit:</strong> This lead matches your core persona. They likely face pipeline visibility and CRM data quality challenges daily.<br><br>
            <strong>Subject:</strong> Quick question about your pipeline data<br><br>
            <strong>Email:</strong> Hi ${name}, RevOps leaders in your space usually tell me their biggest headache is trusting the CRM numbers. If that resonates, let's chat.
        `;
    };

    const formatNotRelevant = (reason, betterFit) => {
        return `
            <div class="badge not-relevant">❌ Not Relevant</div>
            <strong>Reason:</strong> ${reason}<br><br>
            <strong>Better fit would be:</strong> ${betterFit}
        `;
    };
});
