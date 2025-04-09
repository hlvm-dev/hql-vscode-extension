import * as vscode from 'vscode';

/**
 * Manages parenthesis styling in the editor.
 * Uses subtle border-based styling to indicate nesting levels.
 */
export class ParenStyleManager {
  private static instance: ParenStyleManager;
  private decorationTypes: vscode.TextEditorDecorationType[] = [];
  private decorationMap: Map<string, vscode.TextEditorDecorationType[]> = new Map();
  
  /**
   * Style definitions for different nesting levels.
   * Uses subtle borders and backgrounds instead of colors.
   */
  private static readonly STYLES = [
    // Level 0: Bold with no border
    {
      fontWeight: "bold",
      opacity: "1.0"
    },
    // Level 1: Thin border
    {
      border: "1px solid rgba(128, 128, 128, 0.2)",
      borderRadius: "2px"
    },
    // Level 2: Subtle background
    {
      backgroundColor: "rgba(128, 128, 128, 0.08)",
      borderRadius: "2px"
    },
    // Level 3: Dotted border
    {
      border: "1px dotted rgba(128, 128, 128, 0.25)",
      borderRadius: "2px"
    }
  ];

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ParenStyleManager {
    if (!this.instance) {
      this.instance = new ParenStyleManager();
    }
    return this.instance;
  }

  /**
   * Initialize with extension context
   */
  public initialize(context: vscode.ExtensionContext): void {
    // Cleanup when extension is deactivated
    context.subscriptions.push({
      dispose: () => this.dispose()
    });
    
    // Register for editor changes
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'hql') {
          this.applyParenStyles(editor);
        }
      })
    );
    
    // Apply to visible editors on startup
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.languageId === 'hql') {
        this.applyParenStyles(editor);
      }
    });
    
    // Register for document changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.visibleTextEditors.find(
          editor => editor.document.uri.toString() === event.document.uri.toString()
        );
        
        if (editor && editor.document.languageId === 'hql') {
          // Debounce the update slightly for performance
          this.debouncedUpdate(editor);
        }
      })
    );
  }
  
  // For debouncing updates
  private updateTimer: NodeJS.Timeout | null = null;
  
  /**
   * Debounce style updates to prevent excessive redraws
   */
  private debouncedUpdate(editor: vscode.TextEditor): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.applyParenStyles(editor);
      this.updateTimer = null;
    }, 300);
  }

  /**
   * Apply parenthesis styles to an editor
   */
  public applyParenStyles(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'hql') {
      return;
    }
    
    const docKey = editor.document.uri.toString();
    
    // Clear previous decorations
    this.clearDocumentDecorations(docKey);
    
    const text = editor.document.getText();
    
    // Create decoration types for each nesting level
    const decorationTypes = ParenStyleManager.STYLES.map(style => 
      vscode.window.createTextEditorDecorationType(style)
    );
    
    // Store the decoration types for later disposal
    this.decorationTypes = [...this.decorationTypes, ...decorationTypes];
    this.decorationMap.set(docKey, decorationTypes);
    
    // Find parentheses and track nesting
    const openingChars = '([{';
    const closingChars = ')]}';
    
    // Initialize decoration ranges
    const decorationRanges = decorationTypes.map(() => [] as vscode.Range[]);
    
    let nestingLevel = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const pos = editor.document.positionAt(i);
      
      if (openingChars.includes(char)) {
        const styleIndex = nestingLevel % ParenStyleManager.STYLES.length;
        decorationRanges[styleIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
        nestingLevel++;
      } 
      else if (closingChars.includes(char)) {
        nestingLevel = Math.max(0, nestingLevel - 1);
        const styleIndex = nestingLevel % ParenStyleManager.STYLES.length;
        decorationRanges[styleIndex].push(new vscode.Range(pos, pos.translate(0, 1)));
      }
    }
    
    // Apply decorations
    decorationTypes.forEach((type, index) => {
      if (decorationRanges[index].length > 0) {
        editor.setDecorations(type, decorationRanges[index]);
      }
    });
  }
  
  /**
   * Clear decorations for a specific document
   */
  public clearDocumentDecorations(documentUri: string): void {
    const types = this.decorationMap.get(documentUri);
    if (types) {
      types.forEach(type => type.dispose());
      this.decorationTypes = this.decorationTypes.filter(t => !types.includes(t));
      this.decorationMap.delete(documentUri);
    }
  }
  
  /**
   * Clear all decorations
   */
  public clearAllDecorations(): void {
    this.decorationTypes.forEach(type => type.dispose());
    this.decorationTypes = [];
    this.decorationMap.clear();
  }
  
  /**
   * Highlight matching parentheses pair
   */
  public highlightMatchingPair(
    editor: vscode.TextEditor, 
    openPos: vscode.Position, 
    closePos: vscode.Position,
    duration: number = 800
  ): void {
    if (editor.document.languageId !== 'hql') {
      return;
    }
    
    // Create a decoration with a more noticeable highlight
    const matchDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
      border: `1px solid ${new vscode.ThemeColor('editor.selectionHighlightBorder')}`,
      borderRadius: "2px",
      fontWeight: "bold"
    });
    
    // Add to tracked decorations
    this.decorationTypes.push(matchDecoration);
    
    // Apply to both opening and closing parentheses
    const ranges = [
      new vscode.Range(openPos, openPos.translate(0, 1)),
      new vscode.Range(closePos, closePos.translate(0, 1))
    ];
    
    editor.setDecorations(matchDecoration, ranges);
    
    // Auto-remove after duration
    setTimeout(() => {
      matchDecoration.dispose();
      this.decorationTypes = this.decorationTypes.filter(t => t !== matchDecoration);
    }, duration);
  }
  
  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.clearAllDecorations();
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }
}

// Export singleton instance
export const parenStyleManager = ParenStyleManager.getInstance();