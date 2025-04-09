import * as vscode from 'vscode';
import { fetchEvaluation } from './client';
import { isServerRunning, startServer } from './server-manager';
import { Logger } from './logger';
import { ui } from "./ui/ui-manager";
import { config } from './config-manager';
import { toVsCodeRange } from './range-utils';
import { getExpressionRange, getOutermostExpressionRange } from './helper/getExpressionRange';

// Create a logger instance
const logger = new Logger(true);

/**
 * Manager for handling code evaluation with improved UI feedback
 */
export class EvaluationManager {
  private static instance: EvaluationManager;
  private activeEvaluations: Map<string, AbortController> = new Map();
  private lastResults: Map<string, { code: string, result: string, success: boolean }> = new Map();

  // Debounce timers for showing notifications
  private serverStartPrompt: NodeJS.Timeout | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): EvaluationManager {
    if (!EvaluationManager.instance) {
      EvaluationManager.instance = new EvaluationManager();
    }
    return EvaluationManager.instance;
  }

  /**
   * Generate a unique request ID for an evaluation
   */
  private generateRequestId(document: vscode.TextDocument, range: vscode.Range): string {
    return `${document.uri.toString()}:${range.start.line}:${range.start.character}`;
  }

  /**
   * Check if the server is running and prompt to start if needed
   * @returns true if server is running or was started
   */
  private async ensureServerRunning(): Promise<boolean> {
    if (!await isServerRunning()) {
      // Debounce server start prompts to avoid overwhelming the user
      if (this.serverStartPrompt) {
        clearTimeout(this.serverStartPrompt);
      }
      
      this.serverStartPrompt = setTimeout(async () => {
        const startResponse = await vscode.window.showInformationMessage(
          "HQL nREPL server is not running. Do you want to connect?",
          { modal: false },
          { title: "Yes", isCloseAffordance: false },
          { title: "No", isCloseAffordance: true }
        );
        
        if (startResponse && startResponse.title === "Yes") {
          ui.withProgress("Connecting to nREPL server", async (progress) => {
            progress.report({ message: "Initializing..." });
            await startServer();
            progress.report({ message: "Connecting...", increment: 50 });
            
            // Short delay to allow server to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const running = await isServerRunning();
            if (running) {
              progress.report({ message: "Connected", increment: 50 });
              ui.updateServerStatus(true);
            } else {
              ui.showError("Failed to connect to nREPL server. Check console for details.");
            }
            return running;
          });
        }
        
        this.serverStartPrompt = null;
      }, 500);
      
      return false;
    }
    return true;
  }

  /**
   * Format evaluation error messages for better readability
   */
  private formatErrorMessage(error: any): string {
    if (!error) return "Unknown error";
    
    let message = error.message || String(error);
    
    // Improve common error messages
    if (message.includes("ECONNREFUSED")) {
      return "Connection refused. nREPL server is not running or not accessible.";
    }
    
    if (message.includes("timed out")) {
      return "Evaluation timed out. The expression may be too complex or caused an infinite loop.";
    }
    
    if (message.toLowerCase().includes("syntax error")) {
      return `Syntax error: ${message.split(":").pop()?.trim() || message}`;
    }
    
    return message;
  }

  /**
   * Evaluate the current expression under cursor with improved UI feedback
   */
  public async evaluateExpression(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      ui.showError("No active editor found.");
      return;
    }
    
    const doc = editor.document;
    const range = editor.selection.isEmpty
      ? getExpressionRange(doc, editor.selection.active)
      : editor.selection;
    
    // Convert the range to a vscode.Range if it's not already
    const vsCodeRange = toVsCodeRange(range);
    
    const code = doc.getText(vsCodeRange);
    if (!code.trim()) {
      ui.showInfo("No expression found to evaluate.");
      return;
    }

    // Show a "busy" indicator immediately with subtle animation
    ui.showInlineEvaluation(editor, vsCodeRange, "Evaluating...", code);
    
    // Create an AbortController for this request
    const abortController = new AbortController();
    const requestId = this.generateRequestId(doc, vsCodeRange);
    this.activeEvaluations.set(requestId, abortController);
    
    try {
      // Check if the REPL server is running
      if (!await this.ensureServerRunning()) {
        ui.showInlineError(editor, vsCodeRange, "nREPL server not connected", code);
        this.activeEvaluations.delete(requestId);
        return;
      }
      
      const serverUrl = config.getServerUrl();
      const result = await fetchEvaluation(code, serverUrl, abortController.signal);
      
      if (!this.activeEvaluations.has(requestId)) {
        // This request was canceled, don't show the result
        return;
      }
      
      // Store the result for potential reuse
      this.lastResults.set(requestId, { code, result, success: true });
      
      // Show the evaluation result
      ui.showInlineEvaluation(editor, vsCodeRange, result, code);
      logger.debug(`Evaluated expression: ${code} => ${result}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was canceled, don't show error
        return;
      }
      
      // Format the error message for better readability
      const errorMessage = this.formatErrorMessage(err);
      
      // Store the error for potential reuse
      this.lastResults.set(requestId, { code, result: errorMessage, success: false });
      
      ui.showInlineError(editor, vsCodeRange, errorMessage, code);
      logger.error(`Evaluation error: ${errorMessage}`);
    } finally {
      this.activeEvaluations.delete(requestId);
    }
  }

  /**
   * Evaluate the outermost expression containing the cursor
   */
  public async evaluateOutermostExpression(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      ui.showError("No active editor found.");
      return;
    }
    
    const doc = editor.document;
    const lspRange = editor.selection.isEmpty
      ? getOutermostExpressionRange(doc, editor.selection.active)
      : editor.selection;
    
    // Convert the LSP range to a VS Code range
    const vsCodeRange = toVsCodeRange(lspRange);
    
    const code = doc.getText(vsCodeRange);
    if (!code.trim()) {
      ui.showInfo("No expression found to evaluate.");
      return;
    }

    // Show a "busy" indicator immediately
    ui.showInlineEvaluation(editor, vsCodeRange, "Evaluating...", code);
    
    // Create an AbortController for this request
    const abortController = new AbortController();
    const requestId = this.generateRequestId(doc, vsCodeRange);
    this.activeEvaluations.set(requestId, abortController);
    
    try {
      // Check if the REPL server is running
      if (!await this.ensureServerRunning()) {
        ui.showInlineError(editor, vsCodeRange, "nREPL server not connected", code);
        this.activeEvaluations.delete(requestId);
        return;
      }
      
      const serverUrl = config.getServerUrl();
      const result = await fetchEvaluation(code, serverUrl, abortController.signal);
      
      if (!this.activeEvaluations.has(requestId)) {
        // This request was canceled, don't show the result
        return;
      }
      
      // Store the result for potential reuse
      this.lastResults.set(requestId, { code, result, success: true });
      
      ui.showInlineEvaluation(editor, vsCodeRange, result, code);
      logger.debug(`Evaluated outermost expression: ${code} => ${result}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was canceled, don't show error
        return;
      }
      
      // Format the error message for better readability
      const errorMessage = this.formatErrorMessage(err);
      
      // Store the error for potential reuse
      this.lastResults.set(requestId, { code, result: errorMessage, success: false });
      
      ui.showInlineError(editor, vsCodeRange, errorMessage, code);
      logger.error(`Evaluation error: ${errorMessage}`);
    } finally {
      this.activeEvaluations.delete(requestId);
    }
  }

  /**
   * Cancel all active evaluations
   */
  public cancelAllEvaluations(): void {
    // Cancel all active requests
    for (const [id, controller] of this.activeEvaluations.entries()) {
      controller.abort();
      this.activeEvaluations.delete(id);
    }
    
    // Clear UI decorations
    for (const ed of vscode.window.visibleTextEditors) {
      ui.clearDecorations(ed.document);
    }
    
    ui.showInfo("All evaluations canceled.");
    logger.info("All evaluations canceled");
  }

  /**
   * Get an active abort controller
   */
  public getAbortController(requestId: string): AbortController | undefined {
    return this.activeEvaluations.get(requestId);
  }

  /**
   * Check if an evaluation is active
   */
  public isEvaluationActive(requestId: string): boolean {
    return this.activeEvaluations.has(requestId);
  }
}

// Export a pre-created instance for easy imports
export const evaluator = EvaluationManager.getInstance();