import * as vscode from 'vscode';
import { fetchEvaluation } from './client';
import { isServerRunning, startServer } from './server-manager';
import { Logger } from './logger';
import { ui } from "./ui-manager"
import { config } from './config-manager';
import { toVsCodeRange } from './range-utils';
import { getExpressionRange, getOutermostExpressionRange } from './helper/getExpressionRange';

// Create a logger instance
const logger = new Logger(true);

/**
 * Manager for handling code evaluation
 */
export class EvaluationManager {
  private static instance: EvaluationManager;
  private activeEvaluations: Map<string, AbortController> = new Map();

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
      const startResponse = await vscode.window.showInformationMessage(
        "HQL REPL server is not running. Do you want to start it?",
        "Yes", "No"
      );
      
      if (startResponse === "Yes") {
        await startServer();
        return await isServerRunning();
      } else {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate the current expression under cursor
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

    // Show a "busy" indicator immediately
    ui.showInlineEvaluation(editor, vsCodeRange, "Evaluating...");
    
    // Create an AbortController for this request
    const abortController = new AbortController();
    const requestId = this.generateRequestId(doc, vsCodeRange);
    this.activeEvaluations.set(requestId, abortController);
    
    try {
      // Check if the REPL server is running
      if (!await this.ensureServerRunning()) {
        ui.showInlineError(editor, vsCodeRange, "REPL server not running");
        this.activeEvaluations.delete(requestId);
        return;
      }
      
      const serverUrl = config.getServerUrl();
      const result = await fetchEvaluation(code, serverUrl, abortController.signal);
      
      if (!this.activeEvaluations.has(requestId)) {
        // This request was canceled, don't show the result
        return;
      }
      
      ui.showInlineEvaluation(editor, vsCodeRange, result);
      logger.debug(`Evaluated expression: ${code} => ${result}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was canceled, don't show error
        return;
      }
      
      ui.showInlineError(editor, vsCodeRange, err.message || String(err));
      ui.showError(`Evaluation Error: ${err.message || err}`);
      logger.error(`Evaluation error: ${err.message || err}`);
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
    ui.showInlineEvaluation(editor, vsCodeRange, "Evaluating...");
    
    // Create an AbortController for this request
    const abortController = new AbortController();
    const requestId = this.generateRequestId(doc, vsCodeRange);
    this.activeEvaluations.set(requestId, abortController);
    
    try {
      // Check if the REPL server is running
      if (!await this.ensureServerRunning()) {
        ui.showInlineError(editor, vsCodeRange, "REPL server not running");
        this.activeEvaluations.delete(requestId);
        return;
      }
      
      const serverUrl = config.getServerUrl();
      const result = await fetchEvaluation(code, serverUrl, abortController.signal);
      
      if (!this.activeEvaluations.has(requestId)) {
        // This request was canceled, don't show the result
        return;
      }
      
      ui.showInlineEvaluation(editor, vsCodeRange, result);
      logger.debug(`Evaluated outermost expression: ${code} => ${result}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was canceled, don't show error
        return;
      }
      
      ui.showInlineError(editor, vsCodeRange, err.message || String(err));
      ui.showError(`Evaluation Error: ${err.message || err}`);
      logger.error(`Evaluation error: ${err.message || err}`);
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