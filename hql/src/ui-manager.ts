import * as vscode from 'vscode';
import { Logger } from './logger';
import { config } from './config-manager';
import { toVsCodeRange } from './range-utils';

// Create a logger instance
const logger = new Logger(false);

/**
 * UI component manager for HQL extension
 * Centralizes UI-related functionality
 */
export class UIManager {
  private static instance: UIManager;
  private decorationMap: Map<string, DecorationEntry[]> = new Map();

  // Style constants for UI elements
  private readonly COLORS = {
    SUCCESS: {
      BG: "rgba(100, 200, 100, 0.1)",
      BORDER: "rgba(100, 200, 100, 0.2)",
      TEXT: "#3c9a3c"
    },
    ERROR: {
      BG: "rgba(255, 100, 100, 0.1)",
      BORDER: "rgba(255, 100, 100, 0.2)",
      TEXT: "#d32f2f"
    },
    PENDING: {
      BG: "rgba(100, 100, 255, 0.1)",
      BORDER: "rgba(100, 100, 255, 0.2)",
      TEXT: "#4040ff"
    }
  };

  private constructor() {
    // Private constructor for singleton pattern
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
   * Create a decoration type based on state
   */
  private createHighlightDecoration(state: 'success' | 'error' | 'pending'): vscode.TextEditorDecorationType {
    const colors = this.COLORS[state.toUpperCase() as keyof typeof this.COLORS];
    
    return vscode.window.createTextEditorDecorationType({
      backgroundColor: colors.BG,
      border: `1px solid ${colors.BORDER}`,
      borderRadius: "3px",
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }

  /**
   * Format an evaluation result for display
   */
  private formatResult(result: string): string {
    if (!result) return "";
    
    // Detect if result is JSON
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Not JSON, perform some basic formatting
      // Truncate extremely long results
      if (result.length > 1000) {
        return result.substring(0, 1000) + "... (truncated)";
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
   * Add a decoration to the cache
   */
  private addDecoration(documentUri: string, entry: DecorationEntry): void {
    if (!this.decorationMap.has(documentUri)) {
      this.decorationMap.set(documentUri, []);
    }
    this.decorationMap.get(documentUri)!.push(entry);
  }

  /**
   * Clear all decorations for a document
   */
  public clearDecorations(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const decorations = this.decorationMap.get(key);
    if (decorations) {
      decorations.forEach(({ type }) => type.dispose());
      this.decorationMap.delete(key);
    }
  }

  /**
   * Clear decorations for a specific range
   */
  public clearDecorationsForRange(document: vscode.TextDocument, targetRange: vscode.Range): void {
    const key = document.uri.toString();
    const entries = this.decorationMap.get(key);
    if (!entries) return;
    
    const remaining: DecorationEntry[] = [];
    for (const entry of entries) {
      if (entry.range.isEqual(targetRange)) {
        entry.type.dispose();
      } else {
        remaining.push(entry);
      }
    }
    this.decorationMap.set(key, remaining);
  }

  /**
   * Show inline evaluation result
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
    
    // Create highlight decoration
    const highlightType = this.createHighlightDecoration(state);
    editor.setDecorations(highlightType, [{ range: vsCodeRange }]);
    this.addDecoration(editor.document.uri.toString(), { type: highlightType, range: vsCodeRange });
  
    // Format the result text
    const formattedResult = this.formatResult(result);
    
    // Determine text color based on active theme
    const themeKind = vscode.window.activeColorTheme.kind;
    const colors = this.COLORS[state.toUpperCase() as keyof typeof this.COLORS];
    const evaluationTextColor = colors.TEXT;
    
    // Create inline decoration type for the result
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` => ${formattedResult}`,
        margin: "0 0 0 0.3em",
        color: evaluationTextColor,
        fontStyle: isPending ? "italic" : "normal",
        fontWeight: isPending ? "normal" : "bold"
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: this.createHoverMarkdown(formattedResult)
    }]);
    
    this.addDecoration(editor.document.uri.toString(), { type: inlineType, range: vsCodeRange });
    
    logger.debug(`Added evaluation result decoration: ${result}`);
    
    return highlightType;
  }

  /**
   * Show inline error message
   */
  public showInlineError(
    editor: vscode.TextEditor,
    range: vscode.Range | any,
    errorMessage: string
  ): void {
    const vsCodeRange = toVsCodeRange(range);
    this.clearDecorationsForRange(editor.document, vsCodeRange);
    
    // Create error highlight decoration
    const errorHighlight = this.createHighlightDecoration("error");
    editor.setDecorations(errorHighlight, [{ range: vsCodeRange }]);
    this.addDecoration(editor.document.uri.toString(), { type: errorHighlight, range: vsCodeRange });
  
    // Create inline decoration for the error message
    const errorTextColor = this.COLORS.ERROR.TEXT;
    
    const inlineType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` => Error: ${errorMessage}`,
        margin: "0 0 0 0.3em",
        color: errorTextColor,
        fontStyle: "italic",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    
    editor.setDecorations(inlineType, [{ 
      range: vsCodeRange,
      hoverMessage: this.createHoverMarkdown(errorMessage, true)
    }]);
    
    this.addDecoration(editor.document.uri.toString(), { type: inlineType, range: vsCodeRange });
    
    logger.debug(`Added error decoration: ${errorMessage}`);
  }

  /**
   * Apply rainbow parentheses colorization for HQL files
   */
  public applyRainbowParentheses(editor: vscode.TextEditor): void {
    // Only apply to HQL files
    if (editor.document.languageId !== 'hql') {
      return;
    }
    
    const text = editor.document.getText();
    // Get configured colors or use defaults
    const parenColors = config.getParenthesesColors();
    
    // Create decorations for each nesting level
    const decorationTypes = parenColors.map(color =>
      vscode.window.createTextEditorDecorationType({
        color: color,
        fontWeight: "bold",
        opacity: "0.9"
      })
    );
    
    // Find all parentheses and apply decorations based on nesting level
    const openParenRanges: vscode.Range[][] = decorationTypes.map(() => []);
    const closeParenRanges: vscode.Range[][] = decorationTypes.map(() => []);
    
    let nestingLevel = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const pos = editor.document.positionAt(i);
      
      if (char === '(' || char === '[' || char === '{') {
        // Apply color based on current nesting level
        const colorIndex = nestingLevel % decorationTypes.length;
        openParenRanges[colorIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
        nestingLevel++;
      } else if (char === ')' || char === ']' || char === '}') {
        nestingLevel = Math.max(0, nestingLevel - 1);
        const colorIndex = nestingLevel % decorationTypes.length;
        closeParenRanges[colorIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
      }
    }
    
    // Apply the decorations
    for (let i = 0; i < decorationTypes.length; i++) {
      editor.setDecorations(decorationTypes[i], [
        ...openParenRanges[i],
        ...closeParenRanges[i]
      ]);
    }
  }

  /**
   * Show information message with consistent formatting
   */
  public showInfo(message: string): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(`HQL: ${message}`);
  }

  /**
   * Show error message with consistent formatting
   */
  public showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(`HQL: ${message}`);
  }

  /**
   * Show warning message with consistent formatting
   */
  public showWarning(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(`HQL: ${message}`);
  }
}

// Type definition for decoration entries
interface DecorationEntry {
  type: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

// Export a pre-created instance for easy imports
export const ui = UIManager.getInstance();