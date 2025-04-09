import * as vscode from "vscode";
import { ui } from "./ui-manager";
import { Logger } from "../logger";

const logger = new Logger(false);

/**
 * @deprecated Use ui-manager.ts instead
 * This file is maintained for backward compatibility only.
 * All new code should use the UIManager class from ui-manager.ts
 */

/**
 * Clear all decorations for a document
 * @deprecated Use ui.clearDecorations instead
 */
export function clearInlineDecorations(document: vscode.TextDocument): void {
  logger.debug("Using deprecated ui.ts: clearInlineDecorations");
  ui.clearDecorations(document);
}

/**
 * Show inline evaluation result
 * @deprecated Use ui.showInlineEvaluation instead
 */
export function showInlineEvaluation(
  editor: vscode.TextEditor,
  range: vscode.Range,
  result: string
): vscode.TextEditorDecorationType {
  logger.debug("Using deprecated ui.ts: showInlineEvaluation");
  return ui.showInlineEvaluation(editor, range, result);
}

/**
 * Show inline error message
 * @deprecated Use ui.showInlineError instead
 */
export function showInlineError(
  editor: vscode.TextEditor,
  range: vscode.Range,
  errorMessage: string
): void {
  logger.debug("Using deprecated ui.ts: showInlineError");
  ui.showInlineError(editor, range, errorMessage);
}

/**
 * Highlight unmatched parentheses
 * @deprecated Use ui.highlightUnbalancedDelimiters instead
 */
export function highlightUnmatchedParentheses(
  editor: vscode.TextEditor,
  positions: vscode.Position[]
): void {
  logger.debug("Using deprecated ui.ts: highlightUnmatchedParentheses");
  ui.highlightUnbalancedDelimiters(editor, positions);
}

/**
 * Highlight matching parentheses
 * @deprecated Use ui.highlightMatchingDelimiters instead
 */
export function highlightMatchingParentheses(
  editor: vscode.TextEditor,
  openPosition: vscode.Position,
  closePosition: vscode.Position
): void {
  logger.debug("Using deprecated ui.ts: highlightMatchingParentheses");
  ui.highlightMatchingDelimiters(editor, openPosition, closePosition);
}

/**
 * Apply parentheses colorization for HQL files
 * @deprecated Use parenStyleManager.applyParenStyles instead
 */
export function applyRainbowParentheses(editor: vscode.TextEditor): void {
  logger.debug("Using deprecated ui.ts: applyRainbowParentheses");
  // Forward to new API
  const { parenStyleManager } = require('./paren-style-manager');
  parenStyleManager.applyParenStyles(editor);
}

/**
 * Reset all UI decorations for the editor
 * @deprecated Use ui methods directly instead
 */
export function resetEditorDecorations(editor: vscode.TextEditor): void {
  logger.debug("Using deprecated ui.ts: resetEditorDecorations");
  ui.clearDecorations(editor.document);
  
  const rainbowParensEnabled = vscode.workspace.getConfiguration('hql').get<boolean>('paredit.enabled', true);
  if (rainbowParensEnabled) {
    ui.applyRainbowParentheses(editor);
  }
}