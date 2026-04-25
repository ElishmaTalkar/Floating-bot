class IntelligenceDB {
    constructor() {
        this.url = null;
        this.key = null;
    }

    async init() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['supabaseUrl', 'supabaseKey'], (result) => {
                this.url = result.supabaseUrl;
                this.key = result.supabaseKey;
                resolve(!!(this.url && this.key));
            });
        });
    }

    async saveLead(leadData, decision) {
        if (!this.url || !this.key) {
            console.warn("[DB] Supabase not configured. Saving locally only.");
            return chrome.storage.local.set({ [`lead_${Date.now()}`]: { leadData, decision } });
        }

        try {
            const response = await fetch(`${this.url}/rest/v1/leads_intelligence`, {
                method: 'POST',
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    linkedin_url: leadData.linkedin_url || leadData.url,
                    name: leadData.name,
                    raw_profile_data: leadData,
                    kb_decision: decision.status,
                    kb_reasoning: decision.reason,
                    created_at: new Date().toISOString()
                })
            });
            return await response.json();
        } catch (err) {
            console.error("[DB] Supabase Save Error:", err);
        }
    }

    async checkLeadMemory(profileUrl) {
        if (!this.url || !this.key) return null;
        try {
            const cleanUrl = profileUrl.split('?')[0];
            const response = await fetch(`${this.url}/rest/v1/leads_intelligence?linkedin_url=eq.${encodeURIComponent(cleanUrl)}&select=*`, {
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`
                }
            });
            const data = await response.json();
            return data && data.length > 0 ? data[0] : null;
        } catch (err) {
            console.error("[DB] Memory Check Error:", err);
            return null;
        }
    }

    async getHistory() {
        if (!this.url || !this.key) return [];
        try {
            const response = await fetch(`${this.url}/rest/v1/leads_intelligence?select=*&order=created_at.desc`, {
                headers: {
                    'apikey': this.key,
                    'Authorization': `Bearer ${this.key}`
                }
            });
            return await response.json();
        } catch (err) {
            return [];
        }
    }
}

window.IntelligenceDB = new IntelligenceDB();
