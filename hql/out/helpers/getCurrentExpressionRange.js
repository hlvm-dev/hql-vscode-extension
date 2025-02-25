"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBalancedRange = getBalancedRange;
exports.getCurrentExpressionRange = getCurrentExpressionRange;
exports.getOutermostExpressionRange = getOutermostExpressionRange;
const vscode_1 = require("vscode");
/**
 * Fallback: Expand outward until whitespace is encountered.
 */
function fallbackToSymbolRange(text, offset) {
    let left = offset;
    while (left > 0 && /\S/.test(text[left - 1]))
        left--;
    let right = offset;
    while (right < text.length && /\S/.test(text[right]))
        right++;
    return { start: left, end: right };
}
/**
 * Returns a balanced range for an s-expression starting at '('.
 */
function getBalancedRange(text, offset) {
    if (offset >= text.length) {
        offset = text.length - 1;
        if (offset < 0)
            return null;
    }
    while (offset > 0 && /[\s\)]/.test(text[offset]))
        offset--;
    let start = offset;
    let balance = 0;
    for (let i = offset; i >= 0; i--) {
        if (text[i] === ')')
            balance++;
        else if (text[i] === '(') {
            if (balance === 0) {
                start = i;
                break;
            }
            else {
                balance--;
            }
        }
    }
    let end = offset;
    balance = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '(')
            balance++;
        else if (text[i] === ')') {
            balance--;
            if (balance === 0) {
                end = i + 1;
                break;
            }
        }
    }
    return end <= start ? fallbackToSymbolRange(text, offset) : { start, end };
}
/**
 * Uses a regex to match a complete double-quoted string literal.
 * Returns its full range (including quotes) if the caret offset falls within.
 */
function getFullStringRange(text, offset) {
    const regex = /"((\\.)|[^"\\])*"/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset < end) {
            return { start, end };
        }
    }
    return null;
}
/**
 * getCurrentExpressionRange (used for innermost evaluation):
 *
 * If the caret is inside a string literal:
 *   - If the caret falls inside an interpolation group \( ... ), return just that inner expression (without \() and ).
 *   - Otherwise, return the entire inner text (i.e. the literal value without the quotes).
 * For non-string content, use balanced parentheses / symbol fallback.
 */
function getCurrentExpressionRange(document, position) {
    const text = document.getText();
    const caretOffset = document.offsetAt(position);
    const strRange = getFullStringRange(text, caretOffset);
    if (strRange) {
        // Extract the inner text (without quotes)
        const literalText = text.slice(strRange.start, strRange.end);
        const innerText = literalText.slice(1, literalText.length - 1);
        const caretInLiteral = caretOffset - strRange.start - 1;
        // Look for an interpolation group: \( ... )
        const interpolationRegex = /\\\(([^)]*)\)/g;
        let match;
        while ((match = interpolationRegex.exec(innerText)) !== null) {
            const groupStart = match.index;
            const groupEnd = groupStart + match[0].length;
            if (caretInLiteral >= groupStart && caretInLiteral < groupEnd) {
                // Return only the inner expression (exclude "\(" and ")")
                const exprStart = strRange.start + 1 + groupStart + 2; // skip opening quote and "\("
                const exprEnd = strRange.start + 1 + groupEnd - 1; // skip trailing ")"
                return new vscode_1.Range(document.positionAt(exprStart), document.positionAt(exprEnd));
            }
        }
        // If caret is not inside any interpolation group, return the entire inner text.
        return new vscode_1.Range(document.positionAt(strRange.start + 1), document.positionAt(strRange.end - 1));
    }
    // Not in a string literal: fallback to scanning current line for a balanced form.
    const line = document.lineAt(position);
    const lineStart = document.offsetAt(new vscode_1.Position(position.line, 0));
    const lineText = line.text;
    const localOffset = caretOffset - lineStart;
    const candidates = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '(') {
            const globalIdx = lineStart + i;
            const candidate = getBalancedRange(text, globalIdx);
            if (candidate && candidate.start <= caretOffset && caretOffset <= candidate.end) {
                candidates.push(candidate);
            }
        }
    }
    if (candidates.length > 0) {
        const innermost = candidates.reduce((prev, curr) => (curr.start > prev.start ? curr : prev));
        return new vscode_1.Range(document.positionAt(innermost.start), document.positionAt(innermost.end));
    }
    const localRange = fallbackToSymbolRange(lineText, localOffset);
    return new vscode_1.Range(document.positionAt(lineStart + localRange.start), document.positionAt(lineStart + localRange.end));
}
/**
 * getOutermostExpressionRange (used for outermost evaluation):
 *
 * If the caret is inside a string literal, return the entire literal (with quotes).
 * Otherwise, scan the entire document for the top-level s-expression containing the caret.
 */
function getOutermostExpressionRange(document, position) {
    const text = document.getText();
    const caretOffset = document.offsetAt(position);
    const strRange = getFullStringRange(text, caretOffset);
    if (strRange) {
        return new vscode_1.Range(document.positionAt(strRange.start), document.positionAt(strRange.end));
    }
    let offset = 0;
    let topRange = null;
    while (offset < text.length) {
        while (offset < text.length && /\s/.test(text[offset]))
            offset++;
        if (offset >= text.length)
            break;
        const formRange = text[offset] === '(' ? getBalancedRange(text, offset) : fallbackToSymbolRange(text, offset);
        if (!formRange)
            break;
        if (caretOffset >= formRange.start && caretOffset <= formRange.end) {
            topRange = formRange;
            break;
        }
        offset = formRange.end;
    }
    return topRange ? new vscode_1.Range(document.positionAt(topRange.start), document.positionAt(topRange.end))
        : getCurrentExpressionRange(document, position);
}
//# sourceMappingURL=getCurrentExpressionRange.js.map