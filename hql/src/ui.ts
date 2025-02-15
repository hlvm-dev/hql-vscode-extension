// src/ui.ts
import * as vscode from "vscode";

interface DecorationEntry {
  type: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

const inlineDecorationMap: Map<string, DecorationEntry[]> = new Map();

function addDecoration(documentUri: string, entry: DecorationEntry) {
  if (!inlineDecorationMap.has(documentUri)) {
    inlineDecorationMap.set(documentUri, []);
  }
  inlineDecorationMap.get(documentUri)!.push(entry);
}

export function clearInlineDecorations(document: vscode.TextDocument): void {
  const key = document.uri.toString();
  const decorations = inlineDecorationMap.get(key);
  if (decorations) {
    decorations.forEach(({ type }) => type.dispose());
    inlineDecorationMap.delete(key);
  }
}

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

function createGreenHighlightDecoration(): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(100, 200, 100, 0.07)",
    border: "1px solid rgba(100, 200, 100, 0.15)",
    borderRadius: "3px",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

export function showInlineEvaluation(
  editor: vscode.TextEditor,
  range: vscode.Range,
  result: string
): void {
  clearDecorationsForRange(editor.document, range);
  const highlightType = createGreenHighlightDecoration();
  editor.setDecorations(highlightType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: highlightType, range });

  const themeKind = vscode.window.activeColorTheme.kind;
  const evaluationTextColor = themeKind === vscode.ColorThemeKind.Light ? "#000000" : "#808080";
  const inlineType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` => ${result}`,
      margin: "0 0 0 0.3em",
      color: evaluationTextColor,
      fontStyle: "normal",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  editor.setDecorations(inlineType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
}

export function showInlineError(
  editor: vscode.TextEditor,
  range: vscode.Range,
  errorMessage: string
): void {
  clearDecorationsForRange(editor.document, range);
  const errorHighlight = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 0, 0, 0.06)",
    border: "1px solid rgba(255, 0, 0, 0.15)",
    borderRadius: "3px",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  editor.setDecorations(errorHighlight, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: errorHighlight, range });

  const themeKind = vscode.window.activeColorTheme.kind;
  const errorTextColor = themeKind === vscode.ColorThemeKind.Light ? "#000000" : "#808080";
  const inlineType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` => ${errorMessage}`,
      margin: "0 0 0 0.3em",
      color: errorTextColor,
      fontStyle: "normal",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  editor.setDecorations(inlineType, [{ range }]);
  addDecoration(editor.document.uri.toString(), { type: inlineType, range });
}
