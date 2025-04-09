import * as vscode from 'vscode';
import { Logger } from '../logger';
import { config } from '../config-manager';
import { toVsCodeRange } from '../range-utils';
import { UIUtils } from './ui-utils';
import { parenStyleManager } from './paren-style-manager';

// Type definitions for decoration entries
interface DecorationEntry {
  type: vscode.TextEditorDecorationType;
  range: vscode.Range;
  metadata?: Record<string, any>;
}

// Type definition for evaluation states
type EvaluationState = 'success' | 'error' | 'pending';

/**
 * UI component manager for HQL extension
 * Centralized service for all UI-related functionality
 */
export class UIManager {
  private static instance: UIManager;
  
  // Document URI to DecorationEntry[] map for tracking decorations
  private decorationMap: Map<string, Map<string, DecorationEntry>> = new Map();
  private statusBarItems: Map<string, vscode.StatusBarItem> = new Map();
  private logger: Logger;
  
  // Performance optimization: Pre-created decoration types for common use cases
  private cachedDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private decorationDisposables: vscode.Disposable[] = [];

  private constructor() {
    this.logger = new Logger(false);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  /**
   * Initialize the UI manager with required context
   * @param context The extension context for registering disposables
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.logger.info('Initializing UI Manager');
    
    // Create status bar items
    this.createStatusBarItem('lsp', 'HQL LSP: Starting...', vscode.StatusBarAlignment.Left, 100);
    this.createStatusBarItem('server', 'HQL Server: Checking...', vscode.StatusBarAlignment.Right, 100);
    
    // Register status bar items with context for proper disposal
    for (const item of this.statusBarItems.values()) {
      context.subscriptions.push(item);
    }
    
    // Initialize the parenthesis style manager
    parenStyleManager.initialize(context);
    
    // Register document close event to clean up decorations
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        this.clearDecorationsForDocument(document.uri.toString());
      })
    );
    
    // Register configuration change event to update decorations
    context.subscriptions.push(
      config.onDidChangeConfiguration(() => {
        this.handleConfigurationChange();
      })
    );
    
    // Register visible editor change to handle theme switching
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.refreshAllDecorations();
      })
    );
    
    // Add our decoration disposables to the context
    context.subscriptions.push(
      new vscode.Disposable(() => {
        this.disposeAllDecorations();
      })
    );
  }

  /**
   * Refresh all decorations when theme changes
   */
  private refreshAllDecorations(): void {
    // Invalidate cached decorations since colors might have changed
    this.disposeAllDecorations();
    this.cachedDecorationTypes.clear();
    
    // Reapply all decorations
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.languageId === 'hql') {
        this.reapplyDecorationsForDocument(editor);
      }
    });
  }
  
  /**
   * Reapply all decorations for a document
   */
  private reapplyDecorationsForDocument(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const decorations = this.decorationMap.get(uri);
    
    if (!decorations) return;
    
    // Group decorations by type
    const decorationsByType = new Map<string, {entry: DecorationEntry, ranges: vscode.DecorationOptions[]}>();
    
    for (const [id, entry] of decorations.entries()) {
      const typeKey = id.split(':').pop() || '';
      
      if (!decorationsByType.has(typeKey)) {
        // Create new decoration type
        const newType = this.createDecorationTypeFromMetadata(entry);
        entry.type = newType;
        
        decorationsByType.set(typeKey, {
          entry,
          ranges: [{range: entry.range}]
        });
      } else {
        // Add to existing range
        decorationsByType.get(typeKey)!.ranges.push({range: entry.range});
      }
    }
    
    // Apply decoration ranges
    for (const {entry, ranges} of decorationsByType.values()) {
      editor.setDecorations(entry.type, ranges);
    }
    
    // Reapply parentheses styling
    parenStyleManager.applyParenStyles(editor);
  }
  
  /**
   * Create a new decoration type based on entry metadata
   */
  private createDecorationTypeFromMetadata(entry: DecorationEntry): vscode.TextEditorDecorationType {
    if (!entry.metadata) return vscode.window.createTextEditorDecorationType({});
    
    if (entry.metadata.state) {
      return this.getEvaluationDecorationType(entry.metadata.state as EvaluationState);
    }
    
    return vscode.window.createTextEditorDecorationType({});
  }

  /**
   * Handle configuration changes
   */
  private handleConfigurationChange(): void {
    // Update editor decorations if needed
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.languageId === 'hql') {
        // Only handle non-parenthesis decorations here
        // Parenthesis styling is handled by ParenStyleManager
      }
    });
  }

  /**
   * Dispose all decorations
   */
  private disposeAllDecorations(): void {
    // Dispose all tracked decorations
    for (const decorationMap of this.decorationMap.values()) {
      for (const entry of decorationMap.values()) {
        entry.type.dispose();
      }
    }
    this.decorationMap.clear();
    
    // Dispose all cached decorations
    for (const type of this.cachedDecorationTypes.values()) {
      type.dispose();
    }
    this.cachedDecorationTypes.clear();
    
    // Dispose all other disposables
    for (const disposable of this.decorationDisposables) {
      disposable.dispose();
    }
    this.decorationDisposables = [];
  }

  /**
   * Create a status bar item
   */
  private createStatusBarItem(
    id: string, 
    text: string, 
    alignment: vscode.StatusBarAlignment, 
    priority: number
  ): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(alignment, priority);
    item.text = text;
    item.show();
    this.statusBarItems.set(id, item);
    return item;
  }

  /**
   * Update the LSP status in the status bar
   * @param status Text status to display
   * @param running Whether the LSP is running normally
   */
  public updateLspStatus(status: string, running: boolean = true): void {
    const item = this.statusBarItems.get('lsp');
    if (!item) return;
    
    if (running) {
      item.text = `$(rocket) HQL LSP: ${status}`;
      item.tooltip = `HQL Language Server is ${status}`;
      item.color = undefined; // Use default color
    } else {
      item.text = `$(alert) HQL LSP: ${status}`;
      item.tooltip = `HQL Language Server is ${status}. Click to check diagnostics.`;
      item.color = new vscode.ThemeColor('errorForeground');
      item.command = 'hql.checkLsp';
    }
  }

  /**
   * Update the nREPL server status in the status bar
   * @param running Whether the server is running
   */
  public updateServerStatus(running: boolean): void {
    const item = this.statusBarItems.get('server');
    if (!item) return;
    
    if (running) {
      item.text = "$(vm-running) HQL nREPL Connected";
      item.tooltip = "HQL nREPL Server is running. Click to disconnect.";
      item.color = new vscode.ThemeColor('terminal.ansiGreen');
      item.command = "hql.stopREPLServer";
    } else {
      item.text = "$(debug-disconnect) HQL nREPL Disconnected";
      item.tooltip = "HQL nREPL Server is not running. Click to connect.";
      item.color = new vscode.ThemeColor('terminal.ansiRed');
      item.command = "hql.startREPLServer";
    }
  }

  /**
   * Get a decoration type for a given evaluation state
   */
  private getEvaluationDecorationType(state: EvaluationState): vscode.TextEditorDecorationType {
    const cacheKey = `eval-${state}`;
    
    if (this.cachedDecorationTypes.has(cacheKey)) {
      return this.cachedDecorationTypes.get(cacheKey)!;
    }
    
    const colors = UIUtils.THEME.EVALUATION[state.toUpperCase() as keyof typeof UIUtils.THEME.EVALUATION];
    
    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.BG,
      border: `1px solid ${colors.BORDER}`,
      borderRadius: "3px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    this.cachedDecorationTypes.set(cacheKey, decorationType);
    return decorationType;
  }

  /**
   * Generate a unique ID for a decoration based on range and type
   */
  private generateDecorationId(range: vscode.Range, type: string): string {
    return UIUtils.generateDecorationId(range, type);
  }

  /**
   * Add a decoration to the cache with proper indexing
   */
  private addDecoration(documentUri: string, type: string, entry: DecorationEntry): void {
    if (!this.decorationMap.has(documentUri)) {
      this.decorationMap.set(documentUri, new Map<string, DecorationEntry>());
    }
    
    const docMap = this.decorationMap.get(documentUri)!;
    const id = this.generateDecorationId(entry.range, type);
    
    // Dispose existing decoration if present
    const existing = docMap.get(id);
    if (existing) {
      existing.type.dispose();
    }
    
    docMap.set(id, entry);
  }

  /**
   * Clear all decorations for a document
   */
  public clearDecorations(document: vscode.TextDocument): void {
    this.clearDecorationsForDocument(document.uri.toString());
  }

  /**
   * Clear decorations for a document by URI
   */
  private clearDecorationsForDocument(documentUri: string): void {
    const decorations = this.decorationMap.get(documentUri);
    if (decorations) {
      for (const entry of decorations.values()) {
        entry.type.dispose();
      }
      this.decorationMap.delete(documentUri);
    }
  }

  /**
   * Clear decorations for a specific range in a document
   */
  public clearDecorationsForRange(document: vscode.TextDocument, targetRange: vscode.Range): void {
    const docUri = document.uri.toString();
    const decorations = this.decorationMap.get(docUri);
    if (!decorations) return;
    
    // Find decorations that overlap with the target range
    const overlappingKeys: string[] = [];
    
    for (const [id, entry] of decorations.entries()) {
      if (UIUtils.rangesOverlap(entry.range, targetRange)) {
        overlappingKeys.push(id);
        entry.type.dispose();
      }
    }
    
    // Remove the disposed decorations
    for (const key of overlappingKeys) {
      decorations.delete(key);
    }
    
    // If no decorations left, clean up the map
    if (decorations.size === 0) {
      this.decorationMap.delete(docUri);
    }
  }

  /**
   * Show inline evaluation result with syntax highlighting and better formatting
   * @param editor The text editor to apply decorations to
   * @param range The range to decorate
   * @param result The evaluation result to display
   * @param code The code that was evaluated
   * @returns The decoration type for potential future reference
   */
  public showInlineEvaluation(
    editor: vscode.TextEditor,
    range: vscode.Range | any,
    result: string,
    code?: string
  ): vscode.TextEditorDecorationType {
    const vsCodeRange = toVsCodeRange(range);
    this.clearDecorationsForRange(editor.document, vsCodeRange);
    
    // Extract code from editor if not provided
    const codeToDisplay = code || editor.document.getText(vsCodeRange);
    
    // Determine if this is a pending result
    const isPending = result === "Evaluating...";
    const state: EvaluationState = isPending ? "pending" : "success";
    
    // Create highlight decoration
    const highlightType = this.getEvaluationDecorationType(state);
    editor.setDecorations(highlightType, [{ 
      range: vsCodeRange,
      hoverMessage: UIUtils.createHoverMarkdown(codeToDisplay, result)
    }]);
    
    // Add highlight decoration to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'highlight', 
      { type: highlightType, range: vsCodeRange, metadata: { state, code: codeToDisplay } }
    );
  
    // Format the result text for display
    const formattedResult = UIUtils.formatResult(result);
    
    // Get themed colors
    const colors = UIUtils.THEME.EVALUATION[state.toUpperCase() as keyof typeof UIUtils.THEME.EVALUATION];
    
    // Create inline decoration type for the result
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ⟹ ${formattedResult}`,
        margin: "0 0 0 0.5em",
        color: colors.TEXT,
        fontStyle: isPending ? "italic" : "normal",
        fontWeight: isPending ? "normal" : "bold"
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: UIUtils.createHoverMarkdown(codeToDisplay, result)
    }]);
    
    // Track the disposable
    this.decorationDisposables.push(inlineType);
    
    // Add inline decoration to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'inline', 
      { type: inlineType, range: vsCodeRange, metadata: { state, result, code: codeToDisplay } }
    );
    
    this.logger.debug(`Added evaluation result decoration: ${result.substring(0, 30)}${result.length > 30 ? '...' : ''}`);
    
    return highlightType;
  }

  /**
   * Show inline error message with improved formatting
   * @param editor The text editor to apply decorations to
   * @param range The range to decorate
   * @param errorMessage The error message to display
   * @param code The code that caused the error
   */
  public showInlineError(
    editor: vscode.TextEditor,
    range: vscode.Range | any,
    errorMessage: string,
    code?: string
  ): void {
    const vsCodeRange = toVsCodeRange(range);
    this.clearDecorationsForRange(editor.document, vsCodeRange);
    
    // Extract code from editor if not provided
    const codeToDisplay = code || editor.document.getText(vsCodeRange);
    
    // Get error colors
    const colors = UIUtils.THEME.EVALUATION.ERROR;
    
    // Create error highlight decoration
    const errorHighlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.BG,
      border: `1px solid ${colors.BORDER}`,
      borderRadius: "3px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(errorHighlight, [{ 
      range: vsCodeRange,
      hoverMessage: UIUtils.createHoverMarkdown(codeToDisplay, errorMessage, true)
    }]);
    
    // Add error highlight to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'error-highlight', 
      { type: errorHighlight, range: vsCodeRange, metadata: { state: 'error', code: codeToDisplay } }
    );
  
    // Format error message (truncate if too long)
    const formattedError = errorMessage.length > 100 
      ? errorMessage.substring(0, 97) + "..."
      : errorMessage;
    
    // Create inline decoration for the error message
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ⟹ Error: ${formattedError}`,
        margin: "0 0 0 0.5em",
        color: colors.TEXT,
        fontStyle: "italic",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: UIUtils.createHoverMarkdown(codeToDisplay, errorMessage, true)
    }]);
    
    // Track the disposable
    this.decorationDisposables.push(inlineType);
    
    // Add inline error to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'error-inline', 
      { type: inlineType, range: vsCodeRange, metadata: { state: 'error', error: errorMessage, code: codeToDisplay } }
    );
    
    this.logger.debug(`Added error decoration: ${errorMessage.substring(0, 30)}${errorMessage.length > 30 ? '...' : ''}`);
  }

  /**
   * Highlight matching brackets/parentheses at given positions
   * Delegates to the ParenStyleManager for consistent styling
   */
  public highlightMatchingDelimiters(
    editor: vscode.TextEditor,
    openPos: vscode.Position,
    closePos: vscode.Position
  ): void {
    parenStyleManager.highlightMatchingPair(editor, openPos, closePos);
  }

  /**
   * Highlight mismatched or unbalanced delimiters with error styling
   * @param editor The text editor to apply highlighting to
   * @param positions Positions of problematic delimiters
   * @param duration Optional duration in ms before clearing (default: 2000ms)
   */
  public highlightUnbalancedDelimiters(
    editor: vscode.TextEditor,
    positions: vscode.Position[],
    duration: number = 2000
  ): void {
    if (positions.length === 0) return;
    
    // Create error highlight decoration
    const errorHighlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: UIUtils.THEME.EVALUATION.ERROR.BG,
      border: `1px solid ${UIUtils.THEME.EVALUATION.ERROR.BORDER}`,
      borderRadius: "2px",
      fontWeight: "bold"
    });
    
    const ranges = positions.map(pos => new vscode.Range(pos, pos.translate(0, 1)));
    editor.setDecorations(errorHighlight, ranges);
    
    // Track for disposal
    this.decorationDisposables.push(errorHighlight);
    
    // Automatically dispose the decoration after the specified duration
    setTimeout(() => {
      errorHighlight.dispose();
      // Remove from disposables array
      const index = this.decorationDisposables.indexOf(errorHighlight);
      if (index !== -1) {
        this.decorationDisposables.splice(index, 1);
      }
    }, duration);
  }

  /**
   * Apply parentheses styling for HQL files
   * @deprecated Use parenStyleManager.applyParenStyles instead
   */
  public applyRainbowParentheses(editor: vscode.TextEditor): void {
    // Delegate to the dedicated parenthesis style manager
    parenStyleManager.applyParenStyles(editor);
  }

  /**
   * Show information message with consistent formatting
   * @param message The message to display
   * @returns A thenable that resolves when the message is dismissed
   */
  public showInfo(message: string): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(`HQL: ${message}`);
  }

  /**
   * Show error message with consistent formatting
   * @param message The error message to display
   * @returns A thenable that resolves when the message is dismissed
   */
  public showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(`HQL: ${message}`);
  }

  /**
   * Show warning message with consistent formatting
   * @param message The warning message to display
   * @returns A thenable that resolves when the message is dismissed
   */
  public showWarning(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(`HQL: ${message}`);
  }

  /**
   * Display a progress notification for long-running operations
   * @param title The title of the progress notification
   * @param task The task function to execute with a progress reporter
   * @returns A promise that resolves with the result of the task
   */
  public async withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Thenable<T>
  ): Promise<T> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `HQL: ${title}`,
      cancellable: false
    }, task);
  }
}

// Export a pre-created instance for easy imports
export const ui = UIManager.getInstance();