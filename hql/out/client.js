"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEvaluation = fetchEvaluation;
/**
 * Sends HQL code to the nREPL server (default URL: http://localhost:5100) via HTTP POST.
 */
async function fetchEvaluation(code, serverUrl = "http://localhost:5100") {
    const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
    });
    const json = (await response.json());
    if (json.error) {
        throw new Error(json.error);
    }
    return json.result || "";
}
//# sourceMappingURL=client.js.map