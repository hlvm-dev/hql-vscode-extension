/**
 * Interface for nREPL response
 */
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
    const response = await fetch(`${serverUrl}/eval`, requestOptions);
    
    // Parse the response
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
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
    // Send a simple ping with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    const response = await fetch(`${serverUrl}/ping`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
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

/**
 * Load a file into the REPL server's context
 * 
 * @param filePath The path of the file to load
 * @param serverUrl The nREPL server URL
 * @returns Promise resolving to success message or error
 */
export async function loadFile(
  filePath: string,
  serverUrl: string = "http://localhost:5100"
): Promise<string> {
  try {
    // Prepare the request
    const requestOptions: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "load-file", 
        path: filePath 
      })
    };
    
    // Send the request to the nREPL server
    const response = await fetch(`${serverUrl}/command`, requestOptions);
    
    // Parse the response
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const json = (await response.json()) as NReplResponse;
    
    // Handle errors
    if (json.error) {
      throw new Error(json.error);
    }
    
    return json.result || "File loaded successfully";
  } catch (error) {
    // Re-throw the error
    throw error;
  }
}

/**
 * Reset the REPL server's context
 * 
 * @param serverUrl The nREPL server URL
 * @returns Promise resolving to success message or error
 */
export async function resetRepl(
  serverUrl: string = "http://localhost:5100"
): Promise<string> {
  try {
    // Prepare the request
    const requestOptions: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" })
    };
    
    // Send the request to the nREPL server
    const response = await fetch(`${serverUrl}/command`, requestOptions);
    
    // Parse the response
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const json = (await response.json()) as NReplResponse;
    
    // Handle errors
    if (json.error) {
      throw new Error(json.error);
    }
    
    return json.result || "REPL reset successfully";
  } catch (error) {
    // Re-throw the error
    throw error;
  }
}

/**
 * Formats the output from the REPL to be more readable
 * 
 * @param result The raw result from the REPL
 * @returns Formatted result string
 */
export function formatReplOutput(result: string): string {
  if (!result) return "";
  
  // Try to detect if the result is JSON
  try {
    // If it's valid JSON, format it nicely
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // Not valid JSON, so just return the string
    return result;
  }
}

/**
 * Submit a REPL command and return the result
 * 
 * @param command The command to execute
 * @param serverUrl The nREPL server URL
 * @param signal Optional AbortSignal for cancellation
 * @returns Promise resolving to the command result
 */
export async function executeReplCommand(
  command: string,
  serverUrl: string = "http://localhost:5100",
  signal?: AbortSignal
): Promise<string> {
  try {
    // Use the fetchEvaluation function with the command
    return await fetchEvaluation(command, serverUrl, signal);
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error("Command execution cancelled");
      abortError.name = "AbortError";
      throw abortError;
    }
    
    throw error;
  }
}