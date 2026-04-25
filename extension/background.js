chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SYNC_TO_MAKE") {
        console.log("[Background] Received Sync request for:", request.payload.name);
        
        const { url, payload } = request;
        const d = payload.detailed_info || {};
        
        const intelligence_document = `
STRATEGIC INTELLIGENCE SNAPSHOT
Target: ${payload.name || "Unknown"}
Url: ${payload.linkedin_url || "Unknown"}
Bio: ${d.about || "N/A"}
------------------------------
        `.trim();

        const finalPayload = { ...payload, intelligence_document };

        console.log("[Background] Attempting fetch to:", url);

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload)
        })
        .then(async response => {
            console.log("[Background] Response received. Status:", response.status);
            if (response.ok) {
                const data = await response.json();
                console.log("[Background] Success! Decision:", data.status);
                sendResponse({ success: true, data: data });
            } else {
                console.error("[Background] Server Error:", response.status);
                try {
                    const errData = await response.json();
                    sendResponse({ success: false, error: errData.error || errData.reason || `Server Error: ${response.status}`, data: errData });
                } catch {
                    sendResponse({ success: false, error: `Server Error: ${response.status}` });
                }
            }
        })
        .catch(err => {
            console.error("[Background] Connection Failure:", err.message);
            sendResponse({ success: false, error: "Connection Failed. Is the server running?" });
        });

        return true; 
    }
});
