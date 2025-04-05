export interface NReplResponse {
  error?: string;
  result?: string;
  warnings?: string[];
  metadata?: {
    time_ms?: number;
    type?: string;
    format?: string;
  };
}

/**
 * Sends HQL code to the nREPL server (default URL: http://localhost:5100) via HTTP POST.
 * Supports cancellation via AbortSignal.
 * 
 * @param code The HQL code to evaluate
 * @param serverUrl The nREPL server URL (defaults to http://localhost:5100)
 * @param signal Optional AbortSignal for cancellation support
 * @returns Promise resolving to the evaluation result
 */
export async function fetchEvaluation(
  code: string, 
  serverUrl: string = "http://localhost:5100",
  signal?: AbortSignal
): Promise<string> {
  try {
    // Prepare the request
    const requestOptions: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal
    };
    
    // Send the request to the nREPL server
    const response = await fetch(serverUrl, requestOptions);
    
    // Parse the response
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const json = (await response.json()) as NReplResponse;
    
    // Handle errors
    if (json.error) {
      throw new Error(json.error);
    }
    
    // Handle warnings
    if (json.warnings && json.warnings.length > 0) {
      // Return both result and warnings
      return `${json.result || ""}${json.result ? "\n" : ""}// Warnings: ${json.warnings.join(", ")}`;
    }
    
    // Format the result based on metadata if available
    if (json.metadata?.time_ms) {
      return `${json.result || ""} (${json.metadata.time_ms}ms)`;
    }
    
    return json.result || "";
  } catch (error) {
    if (signal?.aborted) {
      // Create a special error type for aborted requests
      const abortError = new Error("Evaluation cancelled");
      abortError.name = "AbortError";
      throw abortError;
    }
    
    // Re-throw the error
    throw error;
  }
}

/**
 * Determines if a server is alive by sending a simple ping request.
 * 
 * @param serverUrl The URL to check (defaults to http://localhost:5100)
 * @returns Promise resolving to true if server is alive, false otherwise
 */
export async function isServerAlive(serverUrl: string = "http://localhost:5100"): Promise<boolean> {
  try {
    // Send a simple ping
    const response = await fetch(`${serverUrl}/ping`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      timeout: 1000 // Short timeout for responsiveness
    } as any);
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get information about the server's capabilities
 * 
 * @param serverUrl The URL to query (defaults to http://localhost:5100)
 * @returns Promise resolving to server info or null if unavailable
 */
export async function getServerInfo(serverUrl: string = "http://localhost:5100"): Promise<any | null> {
  try {
    const response = await fetch(`${serverUrl}/info`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    return null;
  }
}