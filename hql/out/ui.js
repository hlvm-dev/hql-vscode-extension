"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearInlineDecorations = clearInlineDecorations;
exports.showInlineEvaluation = showInlineEvaluation;
exports.showInlineError = showInlineError;
// src/ui.ts
const vscode = __importStar(require("vscode"));
const inlineDecorationMap = new Map();
function addDecoration(documentUri, entry) {
    if (!inlineDecorationMap.has(documentUri)) {
        inlineDecorationMap.set(documentUri, []);
    }
    inlineDecorationMap.get(documentUri).push(entry);
}
function clearInlineDecorations(document) {
    const key = document.uri.toString();
    const decorations = inlineDecorationMap.get(key);
    if (decorations) {
        decorations.forEach(({ type }) => type.dispose());
        inlineDecorationMap.delete(key);
    }
}
function clearDecorationsForRange(document, targetRange) {
    const key = document.uri.toString();
    const entries = inlineDecorationMap.get(key);
    if (!entries)
        return;
    const remaining = [];
    for (const entry of entries) {
        if (entry.range.isEqual(targetRange)) {
            entry.type.dispose();
        }
        else {
            remaining.push(entry);
        }
    }
    inlineDecorationMap.set(key, remaining);
}
function createGreenHighlightDecoration() {
    return vscode.window.createTextEditorDecorationType({
        backgroundColor: "rgba(100, 200, 100, 0.07)",
        border: "1px solid rgba(100, 200, 100, 0.15)",
        borderRadius: "3px",
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
}
function showInlineEvaluation(editor, range, result) {
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
function showInlineError(editor, range, errorMessage) {
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
//# sourceMappingURL=ui.js.map