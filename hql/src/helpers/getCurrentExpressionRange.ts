// src/helpers/getCurrentExpressionRange.ts
import { TextDocument, Position, Range } from 'vscode';

function fallbackToSymbolRange(text: string, offset: number): { start: number; end: number } {
  let left = offset;
  while (left > 0 && /\S/.test(text[left - 1])) left--;
  let right = offset;
  while (right < text.length && /\S/.test(text[right])) right++;
  return { start: left, end: right };
}

export function getBalancedRange(text: string, offset: number): { start: number; end: number } | null {
  if (offset >= text.length) {
    offset = text.length - 1;
    if (offset < 0) return null;
  }
  while (offset > 0 && /[\s\)]/.test(text[offset])) offset--;
  let start = offset;
  let balance = 0;
  for (let i = offset; i >= 0; i--) {
    if (text[i] === ')') balance++;
    else if (text[i] === '(') {
      if (balance === 0) { start = i; break; }
      else { balance--; }
    }
  }
  let end = offset;
  balance = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') balance++;
    else if (text[i] === ')') {
      balance--;
      if (balance === 0) { end = i + 1; break; }
    }
  }
  return end <= start ? fallbackToSymbolRange(text, offset) : { start, end };
}

export function getCurrentExpressionRange(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const line = document.lineAt(position);
  const lineStart = document.offsetAt(new Position(position.line, 0));
  const caretOffset = document.offsetAt(position);
  const lineText = line.text;
  const candidates: { start: number; end: number }[] = [];
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
    return new Range(document.positionAt(innermost.start), document.positionAt(innermost.end));
  } else {
    const localOffset = caretOffset - lineStart;
    const localRange = fallbackToSymbolRange(lineText, localOffset);
    return new Range(
      document.positionAt(lineStart + localRange.start),
      document.positionAt(lineStart + localRange.end)
    );
  }
}

export function getOutermostExpressionRange(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const caretOffset = document.offsetAt(position);
  let offset = 0;
  let topRange = null;
  while (offset < text.length) {
    while (offset < text.length && /\s/.test(text[offset])) offset++;
    if (offset >= text.length) break;
    const formRange = text[offset] === '(' ? getBalancedRange(text, offset) : fallbackToSymbolRange(text, offset);
    if (!formRange) break;
    if (caretOffset >= formRange.start && caretOffset <= formRange.end) {
      topRange = formRange;
      break;
    }
    offset = formRange.end;
  }
  return topRange ? new Range(document.positionAt(topRange.start), document.positionAt(topRange.end))
    : getCurrentExpressionRange(document, position);
}
