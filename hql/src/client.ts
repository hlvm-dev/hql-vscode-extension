// src/client.ts
export interface NReplResponse {
  error?: string;
  result?: string;
}

/**
 * Sends HQL code to the nREPL server (default URL: http://localhost:5100) via HTTP POST.
 */
export async function fetchEvaluation(code: string, serverUrl: string = "http://localhost:5100"): Promise<string> {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const json = (await response.json()) as NReplResponse;
  if (json.error) {
    throw new Error(json.error);
  }
  return json.result || "";
}
