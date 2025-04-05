import * as vscode from "vscode";
import { Logger } from "./logger";

const logger = new Logger(false);

interface DecorationEntry {
  type: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

// Decoration cache to track all decorations per document
const inlineDecorationMap: Map<string, DecorationEntry[]> = new Map();

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
  // Colors based on state
  const colors = {
    success: { bg: "rgba(100, 200, 100, 0.1)", border: "rgba(100, 200, 100, 0.2)" },
    error: { bg: "rgba(255, 100, 100, 0.1)", border: "rgba(255, 100, 100, 0.2)" },
    pending: { bg: "rgba(100, 100, 255, 0.1)", border: "rgba(100, 100, 255, 0.2)" }
  };
  
  const color = colors[state];
  
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: color.bg,
    border: `1px solid ${color.border}`,
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
    // Not JSON, return as is
    return result;
  }
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
  const evaluationTextColor = themeKind === vscode.ColorThemeKind.Light ? "#333333" : "#cccccc";
  
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
    hoverMessage: new vscode.MarkdownString(`**HQL Evaluation Result**\n\n\`\`\`\n${formattedResult}\n\`\`\``)
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
  const errorTextColor = themeKind === vscode.ColorThemeKind.Light ? "#d32f2f" : "#f44336";
  
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
    hoverMessage: new vscode.MarkdownString(`**HQL Error**\n\n\`\`\`\n${errorMessage}\n\`\`\``)
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
    backgroundColor: "rgba(255, 0, 0, 0.3)",
    border: "1px solid rgba(255, 0, 0, 0.5)",
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
    backgroundColor: "rgba(100, 100, 255, 0.3)",
    border: "1px solid rgba(100, 100, 255, 0.5)",
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
  const parenColors = vscode.workspace.getConfiguration('hql').get<string[]>('theme.parenthesesColors', [
    '#8000ff', // purple
    '#ff0000', // red
    '#0000ff'  // blue
  ]);
  
  // Create decorations for each nesting level
  const decorationTypes = parenColors.map(color =>
    vscode.window.createTextEditorDecorationType({
      color: color,
      fontWeight: "bold"
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