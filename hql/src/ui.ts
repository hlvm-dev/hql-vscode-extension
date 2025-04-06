import * as vscode from "vscode";
import { Logger } from "./logger";

const logger = new Logger(false);

/**
 * Decoration types for different UI elements
 */
interface DecorationEntry {
  type: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

// Decoration cache to track all decorations per document
const inlineDecorationMap: Map<string, DecorationEntry[]> = new Map();

// Style constants for UI elements
const UI_CONSTANTS = {
  EVALUATION_COLORS: {
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
  },
  DELIMITER_COLORS: [
    "#8000ff", // SICP purple
    "#ff0000", // SICP red
    "#0000ff"  // SICP blue
  ],
  RAINBOW_PAREN_OPACITY: 0.9,
  HOVER_MARKDOWN_HEADER: "**HQL Evaluation Result**"
};

/**
 * Add a decoration to the cache
 */
function addDecoration(documentUri: string, entry: DecorationEntry) {
  if (!inlineDecorationMap.has(documentUri)) {
    inlineDecorationMap.set(documentUri, []);
  }
  inlineDecorationMap.get(documentUri)!.push(entry);
}

/**
 * Clear all decorations for a document
 */
export function clearInlineDecorations(document: vscode.TextDocument): void {
  const key = document.uri.toString();
  const decorations = inlineDecorationMap.get(key);
  if (decorations) {
    decorations.forEach(({ type }) => type.dispose());
    inlineDecorationMap.delete(key);
  }
}

/**
 * Clear decorations for a specific range
 */
function clearDecorationsForRange(document: vscode.TextDocument, targetRange: vscode.Range) {
  const key = document.uri.toString();
  const entries = inlineDecorationMap.get(key);
  if (!entries) return;
  const remaining: DecorationEntry[] = [];
  for (const entry of entries) {
    if (entry.range.isEqual(targetRange)) {
      entry.type.dispose();
    } else {
      remaining.push(entry);
    }
  }
  inlineDecorationMap.set(key, remaining);
}

/**
 * Create highlight decoration based on evaluation state
 */
function createHighlightDecoration(state: "success" | "error" | "pending"): vscode.TextEditorDecorationType {
  const colors = UI_CONSTANTS.EVALUATION_COLORS[state.toUpperCase() as keyof typeof UI_CONSTANTS.EVALUATION_COLORS];
  
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
function formatResult(result: string): string {
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
function createHoverMarkdown(result: string, isError: boolean = false): vscode.MarkdownString {
  const header = isError ? "**HQL Error**" : UI_CONSTANTS.HOVER_MARKDOWN_HEADER;
  const markdown = new vscode.MarkdownString(`${header}\n\n\`\`\`\n${result}\n\`\`\``);
  markdown.isTrusted = true;
  return markdown;
}

/**
 * Show inline evaluation result
 */
export function showInlineEvaluation(
  editor: vscode.TextEditor,
  range: vscode.Range,
  result: string
): vscode.TextEditorDecorationType {
  clearDecorationsForRange(editor.document, range);
  
  // Determine if this is a pending result
  const isPending = result === "Evaluating...";
  const state = isPending ? "pending" : "success";
  
  // Create highlight decoration
  const highlightType = createHighlightDecoration(state);
  editor.setDecorations(highlightType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: highlightType, range });

  // Format the result text
  const formattedResult = formatResult(result);
  
  // Determine text color based on active theme
  const themeKind = vscode.window.activeColorTheme.kind;
  const colors = UI_CONSTANTS.EVALUATION_COLORS[state.toUpperCase() as keyof typeof UI_CONSTANTS.EVALUATION_COLORS];
  const evaluationTextColor = themeKind === vscode.ColorThemeKind.Light 
    ? colors.TEXT 
    : colors.TEXT; // Same color for both themes for now, can be adjusted
  
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
    range,
    hoverMessage: createHoverMarkdown(formattedResult)
  }]);
  
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
  
  logger.debug(`Added evaluation result decoration: ${result}`);
  
  return highlightType;
}

/**
 * Show inline error message
 */
export function showInlineError(
  editor: vscode.TextEditor,
  range: vscode.Range,
  errorMessage: string
): void {
  clearDecorationsForRange(editor.document, range);
  
  // Create error highlight decoration
  const errorHighlight = createHighlightDecoration("error");
  editor.setDecorations(errorHighlight, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: errorHighlight, range });

  // Create inline decoration for the error message
  const themeKind = vscode.window.activeColorTheme.kind;
  const errorTextColor = UI_CONSTANTS.EVALUATION_COLORS.ERROR.TEXT;
  
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
    range,
    hoverMessage: createHoverMarkdown(errorMessage, true)
  }]);
  
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
  
  logger.debug(`Added error decoration: ${errorMessage}`);
}

/**
 * Highlight unmatched parentheses
 */
export function highlightUnmatchedParentheses(
  editor: vscode.TextEditor,
  positions: vscode.Position[]
): void {
  // Create error highlight decoration
  const errorHighlight = vscode.window.createTextEditorDecorationType({
    backgroundColor: UI_CONSTANTS.EVALUATION_COLORS.ERROR.BG,
    border: `1px solid ${UI_CONSTANTS.EVALUATION_COLORS.ERROR.BORDER}`,
    borderRadius: "3px",
  });
  
  const ranges = positions.map(pos => new vscode.Range(pos, pos.translate(0, 1)));
  editor.setDecorations(errorHighlight, ranges);
  
  // Automatically dispose the decoration after a short timeout
  setTimeout(() => {
    errorHighlight.dispose();
  }, 2000);
}

/**
 * Highlight matching parentheses
 */
export function highlightMatchingParentheses(
  editor: vscode.TextEditor,
  openPosition: vscode.Position,
  closePosition: vscode.Position
): void {
  // Create highlight decoration
  const highlightType = vscode.window.createTextEditorDecorationType({
    backgroundColor: UI_CONSTANTS.EVALUATION_COLORS.PENDING.BG,
    border: `1px solid ${UI_CONSTANTS.EVALUATION_COLORS.PENDING.BORDER}`,
    borderRadius: "3px",
  });
  
  const ranges = [
    new vscode.Range(openPosition, openPosition.translate(0, 1)),
    new vscode.Range(closePosition, closePosition.translate(0, 1))
  ];
  
  editor.setDecorations(highlightType, ranges);
  
  // Automatically dispose the decoration after a short timeout
  setTimeout(() => {
    highlightType.dispose();
  }, 500);
}

/**
 * Apply rainbow parentheses colorization for HQL files
 * This creates a more readable nested structure with SICP-style colors
 */
export function applyRainbowParentheses(editor: vscode.TextEditor): void {
  // Only apply to HQL files
  if (editor.document.languageId !== 'hql') {
    return;
  }
  
  const text = editor.document.getText();
  // Get configured colors or use defaults based on SICP book style
  const parenColors = vscode.workspace.getConfiguration('hql').get<string[]>('theme.parenthesesColors', 
    UI_CONSTANTS.DELIMITER_COLORS
  );
  
  // Create decorations for each nesting level
  const decorationTypes = parenColors.map(color =>
    vscode.window.createTextEditorDecorationType({
      color: color,
      fontWeight: "bold",
      opacity: String(UI_CONSTANTS.RAINBOW_PAREN_OPACITY)
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
 * Reset all UI decorations for the editor
 */
export function resetEditorDecorations(editor: vscode.TextEditor): void {
  // Clear all inline decorations
  clearInlineDecorations(editor.document);
  
  // Reapply rainbow parentheses if enabled
  const rainbowParensEnabled = vscode.workspace.getConfiguration('hql').get<boolean>('paredit.enabled', true);
  if (rainbowParensEnabled) {
    applyRainbowParentheses(editor);
  }
}