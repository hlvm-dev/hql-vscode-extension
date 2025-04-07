import * as vscode from 'vscode';
import { Logger } from './logger';
import { config } from './config-manager';
import { toVsCodeRange } from './range-utils';

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
 * Centralized service for all UI-related functionality with improved architecture
 */
export class UIManager {
  private static instance: UIManager;
  
  // Document URI to DecorationEntry[] map for tracking decorations
  private decorationMap: Map<string, Map<string, DecorationEntry>> = new Map();
  private statusBarItems: Map<string, vscode.StatusBarItem> = new Map();
  private logger: Logger;

  // Theme constants organized by semantic meaning
  private readonly THEME = {
    EVALUATION: {
      SUCCESS: {
        BG: "rgba(100, 200, 100, 0.12)",
        BORDER: "rgba(100, 200, 100, 0.25)",
        TEXT: "#3c9a3c"
      },
      ERROR: {
        BG: "rgba(255, 100, 100, 0.12)",
        BORDER: "rgba(255, 100, 100, 0.25)",
        TEXT: "#d32f2f"
      },
      PENDING: {
        BG: "rgba(100, 100, 255, 0.12)",
        BORDER: "rgba(100, 100, 255, 0.25)",
        TEXT: "#4040ff"
      }
    },
    PARENS: {
      COLORS: [
        "#8000ff", // SICP purple (level 1)
        "#ff0000", // SICP red (level 2)
        "#0000ff", // SICP blue (level 3)
        "#009688", // teal (level 4)
        "#ff9800", // orange (level 5)
        "#9c27b0"  // purple (level 6)
      ],
      OPACITY: 0.9,
      WEIGHT: "bold"
    },
    MATCHING: {
      BG: "rgba(100, 100, 255, 0.18)",
      BORDER: "rgba(100, 100, 255, 0.4)",
      DURATION_MS: 500
    }
  };

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
    
    // Register editor change event to apply rainbow parentheses
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'hql') {
          if (config.isPareEditEnabled()) {
            this.applyRainbowParentheses(editor);
          }
        }
      })
    );
    
    // Register document close event to clear decorations
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        this.clearDecorationsForDocument(document.uri.toString());
      })
    );
    
    // Clear decorations on configuration change that might affect them
    context.subscriptions.push(
      config.onDidChangeConfiguration(() => {
        vscode.window.visibleTextEditors.forEach(editor => {
          if (editor.document.languageId === 'hql') {
            this.clearDecorationsForDocument(editor.document.uri.toString());
            if (config.isPareEditEnabled()) {
              this.applyRainbowParentheses(editor);
            }
          }
        });
      })
    );
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
      item.text = `HQL LSP: $(check) ${status}`;
      item.tooltip = `HQL Language Server is ${status}`;
      item.color = undefined; // Use default color
    } else {
      item.text = `HQL LSP: $(alert) ${status}`;
      item.tooltip = `HQL Language Server is ${status}. Click to check diagnostics.`;
      item.color = new vscode.ThemeColor('errorForeground');
      item.command = 'hql.checkLsp';
    }
  }

  /**
   * Update the REPL server status in the status bar
   * @param running Whether the server is running
   */
  public updateServerStatus(running: boolean): void {
    const item = this.statusBarItems.get('server');
    if (!item) return;
    
    if (running) {
      item.text = "$(check) HQL REPL Server";
      item.tooltip = "HQL REPL Server is running. Click to stop.";
      item.command = "hql.stopREPLServer";
    } else {
      item.text = "$(stop) HQL REPL Server";
      item.tooltip = "HQL REPL Server is not running. Click to start.";
      item.command = "hql.startREPLServer";
    }
  }

  /**
   * Get theme colors based on state and theme
   */
  private getThemeColors(state: EvaluationState): { bg: string; border: string; text: string } {
    const colors = this.THEME.EVALUATION[state.toUpperCase() as keyof typeof this.THEME.EVALUATION];
    
    // Ensure colors are properly themed between light/dark modes
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    
    return {
      bg: colors.BG,
      border: colors.BORDER,
      text: colors.TEXT
    };
  }

  /**
   * Generate a unique ID for a decoration based on range and type
   */
  private generateDecorationId(range: vscode.Range, type: string): string {
    return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}:${type}`;
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
      if (this.rangesOverlap(entry.range, targetRange)) {
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
   * Check if two ranges overlap
   */
  private rangesOverlap(a: vscode.Range, b: vscode.Range): boolean {
    return !a.end.isBefore(b.start) && !b.end.isBefore(a.start);
  }

  /**
   * Format an evaluation result for display
   */
  private formatResult(result: string): string {
    if (!result) return "";
    
    // Detect if result is JSON and format it
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Not JSON, perform basic formatting
      
      // Truncate extremely long results
      if (result.length > 1000) {
        return result.substring(0, 997) + "...";
      }
      
      // Handle multiline results more gracefully
      if (result.includes('\n')) {
        const lines = result.split('\n');
        if (lines.length > 3) {
          return lines.slice(0, 2).join('\n') + '\n...';
        }
      }
      
      return result;
    }
  }

  /**
   * Create hover markdown for evaluation results
   */
  private createHoverMarkdown(result: string, isError: boolean = false): vscode.MarkdownString {
    const header = isError ? "**HQL Error**" : "**HQL Evaluation Result**";
    const markdown = new vscode.MarkdownString(`${header}\n\n\`\`\`\n${result}\n\`\`\``);
    markdown.isTrusted = true;
    return markdown;
  }

  /**
   * Show inline evaluation result
   * @param editor The text editor to apply decorations to
   * @param range The range to decorate
   * @param result The evaluation result to display
   * @returns The decoration type for potential future reference
   */
  public showInlineEvaluation(
    editor: vscode.TextEditor,
    range: vscode.Range | any,
    result: string
  ): vscode.TextEditorDecorationType {
    const vsCodeRange = toVsCodeRange(range);
    this.clearDecorationsForRange(editor.document, vsCodeRange);
    
    // Determine if this is a pending result
    const isPending = result === "Evaluating...";
    const state = isPending ? "pending" : "success";
    
    // Get themed colors
    const colors = this.getThemeColors(state);
    
    // Create highlight decoration
    const highlightType = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "3px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(highlightType, [{ range: vsCodeRange }]);
    
    // Add highlight decoration to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'highlight', 
      { type: highlightType, range: vsCodeRange, metadata: { state } }
    );
  
    // Format the result text for display
    const formattedResult = this.formatResult(result);
    
    // Create inline decoration type for the result
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` => ${formattedResult}`,
        margin: "0 0 0 0.5em",
        color: colors.text,
        fontStyle: isPending ? "italic" : "normal",
        fontWeight: isPending ? "normal" : "bold"
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: this.createHoverMarkdown(formattedResult)
    }]);
    
    // Add inline decoration to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'inline', 
      { type: inlineType, range: vsCodeRange, metadata: { result } }
    );
    
    this.logger.debug(`Added evaluation result decoration: ${result.substring(0, 30)}${result.length > 30 ? '...' : ''}`);
    
    return highlightType;
  }

  /**
   * Show inline error message with improved formatting
   * @param editor The text editor to apply decorations to
   * @param range The range to decorate
   * @param errorMessage The error message to display
   */
  public showInlineError(
    editor: vscode.TextEditor,
    range: vscode.Range | any,
    errorMessage: string
  ): void {
    const vsCodeRange = toVsCodeRange(range);
    this.clearDecorationsForRange(editor.document, vsCodeRange);
    
    // Get error colors
    const colors = this.getThemeColors("error");
    
    // Create error highlight decoration
    const errorHighlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: "3px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(errorHighlight, [{ range: vsCodeRange }]);
    
    // Add error highlight to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'error-highlight', 
      { type: errorHighlight, range: vsCodeRange }
    );
  
    // Format error message (truncate if too long)
    const formattedError = errorMessage.length > 100 
      ? errorMessage.substring(0, 97) + "..."
      : errorMessage;
    
    // Create inline decoration for the error message
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` => Error: ${formattedError}`,
        margin: "0 0 0 0.5em",
        color: colors.text,
        fontStyle: "italic",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: this.createHoverMarkdown(errorMessage, true)
    }]);
    
    // Add inline error to tracking
    this.addDecoration(
      editor.document.uri.toString(), 
      'error-inline', 
      { type: inlineType, range: vsCodeRange, metadata: { error: errorMessage } }
    );
    
    this.logger.debug(`Added error decoration: ${errorMessage.substring(0, 30)}${errorMessage.length > 30 ? '...' : ''}`);
  }

  /**
   * Apply rainbow parentheses colorization for HQL files
   * @param editor The text editor to apply colorization to
   */
  public applyRainbowParentheses(editor: vscode.TextEditor): void {
    // Only apply to HQL files
    if (editor.document.languageId !== 'hql') {
      return;
    }
    
    const text = editor.document.getText();
    
    // Get configured colors or use defaults
    const parenColors = config.getParenthesesColors().length > 0 
      ? config.getParenthesesColors() 
      : this.THEME.PARENS.COLORS;
    
    // Create decoration types for each nesting level
    const decorationTypes = parenColors.map(color =>
      vscode.window.createTextEditorDecorationType({
        color: color,
        fontWeight: this.THEME.PARENS.WEIGHT,
        opacity: this.THEME.PARENS.OPACITY.toString()
      })
    );
    
    // Find all parentheses and apply decorations based on nesting level
    const parenRanges: vscode.Range[][] = decorationTypes.map(() => []);
    
    let nestingLevel = 0;
    const parenStack: { char: string, pos: vscode.Position }[] = [];
    const openingChars = '([{';
    const closingChars = ')]}';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const pos = editor.document.positionAt(i);
      
      if (openingChars.includes(char)) {
        // Store opening paren info
        parenStack.push({ char, pos });
        
        // Apply color based on current nesting level
        const colorIndex = nestingLevel % decorationTypes.length;
        parenRanges[colorIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
        nestingLevel++;
      } 
      else if (closingChars.includes(char)) {
        nestingLevel = Math.max(0, nestingLevel - 1);
        
        // Get matching color index
        const colorIndex = nestingLevel % decorationTypes.length;
        parenRanges[colorIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
        
        // Pop from stack (for potential future balance checking)
        if (parenStack.length > 0) {
          parenStack.pop();
        }
      }
    }
    
    // Apply the decorations
    const docUri = editor.document.uri.toString();
    
    // Track these decorations
    for (let i = 0; i < decorationTypes.length; i++) {
      if (parenRanges[i].length > 0) {
        editor.setDecorations(decorationTypes[i], parenRanges[i]);
        
        // Add to tracking
        for (const range of parenRanges[i]) {
          this.addDecoration(
            docUri,
            `rainbow-${i}`,
            { type: decorationTypes[i], range, metadata: { level: i } }
          );
        }
      }
    }
  }

  /**
   * Highlight matching brackets/parentheses at given positions
   * @param editor The text editor to apply highlighting to
   * @param openPos Position of the opening delimiter
   * @param closePos Position of the closing delimiter
   */
  public highlightMatchingDelimiters(
    editor: vscode.TextEditor,
    openPos: vscode.Position,
    closePos: vscode.Position
  ): void {
    const decoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: this.THEME.MATCHING.BG,
      border: `1px solid ${this.THEME.MATCHING.BORDER}`,
      borderRadius: "2px"
    });
    
    const ranges = [
      new vscode.Range(openPos, openPos.translate(0, 1)),
      new vscode.Range(closePos, closePos.translate(0, 1))
    ];
    
    editor.setDecorations(decoration, ranges);
    
    // Don't track these decorations as they're temporary
    
    // Automatically remove highlight after a short delay
    setTimeout(() => {
      decoration.dispose();
    }, this.THEME.MATCHING.DURATION_MS);
  }

  /**
   * Highlight mismatched or unbalanced delimiters
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
      backgroundColor: this.THEME.EVALUATION.ERROR.BG,
      border: `1px solid ${this.THEME.EVALUATION.ERROR.BORDER}`,
      borderRadius: "2px",
      fontWeight: "bold"
    });
    
    const ranges = positions.map(pos => new vscode.Range(pos, pos.translate(0, 1)));
    editor.setDecorations(errorHighlight, ranges);
    
    // Automatically dispose the decoration after the specified duration
    setTimeout(() => {
      errorHighlight.dispose();
    }, duration);
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