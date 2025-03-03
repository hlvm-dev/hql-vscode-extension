// src/ui.ts
import * as vscode from "vscode";

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
    success: { bg: "rgba(100, 200, 100, 0.07)", border: "rgba(100, 200, 100, 0.15)" },
    error: { bg: "rgba(255, 100, 100, 0.07)", border: "rgba(255, 100, 100, 0.15)" },
    pending: { bg: "rgba(100, 100, 255, 0.07)", border: "rgba(100, 100, 255, 0.15)" }
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
  const evaluationTextColor = themeKind === vscode.ColorThemeKind.Light ? "#000000" : "#808080";
  
  // Create inline decoration type for the result
  const inlineType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` => ${formattedResult}`,
      margin: "0 0 0 0.3em",
      color: evaluationTextColor,
      fontStyle: isPending ? "italic" : "normal", // Using fontStyle instead of fontSize
      fontWeight: isPending ? "normal" : "bold"
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  
  editor.setDecorations(inlineType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
  
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
  
  editor.setDecorations(inlineType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
}

/**
 * Create a VS Code hover with formatted content
 */
export function createHover(content: string, range: vscode.Range): vscode.Hover {
  return new vscode.Hover(content, range);
}

/**
 * Show a status bar message
 */
export function showStatusMessage(message: string, timeout?: number): void {
  if (timeout !== undefined) {
    vscode.window.setStatusBarMessage(message, timeout);
  } else {
    vscode.window.setStatusBarMessage(message);
  }
}

/**
 * Update the editor with code replacements
 */
export async function updateEditor(
  editor: vscode.TextEditor,
  range: vscode.Range,
  replacement: string
): Promise<boolean> {
  try {
    const success = await editor.edit(editBuilder => {
      editBuilder.replace(range, replacement);
    });
    
    if (success) {
      showStatusMessage(`Updated code successfully`, 3000);
    }
    
    return success;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to update code: ${error}`);
    return false;
  }
}