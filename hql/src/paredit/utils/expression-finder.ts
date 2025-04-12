// src/paredit/utils/expression-finder.ts
import * as vscode from 'vscode';
import { isOpeningDelimiter, isClosingDelimiter, isDelimiter, isWhitespace, getMatchingDelimiter } from './delimiter-utils';

export interface ExpressionBoundary {
  start: number;
  end: number;
}

export interface ExpressionInfo {
  current?: ExpressionBoundary;
  next?: ExpressionBoundary;
  previous?: ExpressionBoundary;
  parent?: ExpressionBoundary;
}

/**
 * Find the expression at the current position
 */
export function findCurrentExpression(document: vscode.TextDocument, position: vscode.Position): ExpressionBoundary | undefined {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // If cursor is on a delimiter, use that to determine expression
  if (offset < text.length && isDelimiter(text[offset])) {
    return findExpressionFromDelimiter(text, offset);
  }
  
  // Find surrounding expression
  return findSurroundingExpression(text, offset);
}

/**
 * Find an expression when cursor is on a delimiter
 */
function findExpressionFromDelimiter(text: string, offset: number): ExpressionBoundary | undefined {
  if (isOpeningDelimiter(text[offset])) {
    // Cursor is on an opening delimiter, find its matching closing delimiter
    const start = offset;
    const end = findMatchingForward(text, offset);
    
    if (end !== -1) {
      return { start, end };
    }
  } else if (isClosingDelimiter(text[offset])) {
    // Cursor is on a closing delimiter, find its matching opening delimiter
    const end = offset;
    const start = findMatchingBackward(text, offset);
    
    if (start !== -1) {
      return { start, end };
    }
  }
  
  return undefined;
}

/**
 * Find the surrounding expression when cursor is not on a delimiter
 */
function findSurroundingExpression(text: string, offset: number): ExpressionBoundary | undefined {
  // Find the opening delimiter
  const start = findContainingOpenDelimiter(text, offset);
  
  if (start === -1) {
    return undefined;
  }
  
  // Find the matching closing delimiter
  const end = findMatchingForward(text, start);
  
  if (end === -1) {
    return undefined;
  }
  
  return { start, end };
}

/**
 * Find the opening delimiter of the expression containing the offset
 */
export function findContainingOpenDelimiter(text: string, offset: number): number {
  let depth = 0;
  
  for (let i = offset; i >= 0; i--) {
    const char = text[i];
    if (isClosingDelimiter(char)) {
      depth++;
    } else if (isOpeningDelimiter(char)) {
      depth--;
      if (depth < 0) {
        return i;
      }
    }
  }
  
  return -1;
}

/**
 * Find the closing delimiter matching the opening delimiter at the given offset
 */
export function findMatchingForward(text: string, openDelimiterOffset: number): number {
  const openChar = text[openDelimiterOffset];
  const closeChar = getMatchingDelimiter(openChar);
  
  let depth = 1;
  
  for (let i = openDelimiterOffset + 1; i < text.length; i++) {
    if (text[i] === openChar) {
      depth++;
    } else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  
  return -1;
}

/**
 * Find the opening delimiter matching the closing delimiter at the given offset
 */
export function findMatchingBackward(text: string, closeDelimiterOffset: number): number {
  const closeChar = text[closeDelimiterOffset];
  const openChar = getMatchingDelimiter(closeChar);
  
  let depth = 1;
  
  for (let i = closeDelimiterOffset - 1; i >= 0; i--) {
    if (text[i] === closeChar) {
      depth++;
    } else if (text[i] === openChar) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  
  return -1;
}

/**
 * Find the next expression after the given offset
 */
export function findNextExpression(text: string, offset: number): ExpressionBoundary | undefined {
  // Skip whitespace after the given offset
  let nextStart = -1;
  
  for (let i = offset + 1; i < text.length; i++) {
    if (!isWhitespace(text[i])) {
      nextStart = i;
      break;
    }
  }
  
  if (nextStart === -1) {
    return undefined;
  }
  
  let nextEnd = -1;
  
  if (isOpeningDelimiter(text[nextStart])) {
    // Next expression is a form, find its matching closing delimiter
    nextEnd = findMatchingForward(text, nextStart);
  } else {
    // Next expression is an atom, find where it ends
    for (let i = nextStart + 1; i < text.length; i++) {
      if (isWhitespace(text[i]) || isDelimiter(text[i])) {
        nextEnd = i - 1;
        break;
      }
    }
    
    // If we didn't find the end, it's the last expression in the file
    if (nextEnd === -1) {
      nextEnd = text.length - 1;
    }
  }
  
  if (nextEnd === -1) {
    return undefined;
  }
  
  return { start: nextStart, end: nextEnd };
}

/**
 * Find the previous expression before the given offset
 */
export function findPreviousExpression(text: string, offset: number): ExpressionBoundary | undefined {
  // Skip whitespace before the given offset
  let prevEnd = -1;
  
  for (let i = offset - 1; i >= 0; i--) {
    if (!isWhitespace(text[i])) {
      prevEnd = i;
      break;
    }
  }
  
  if (prevEnd === -1) {
    return undefined;
  }
  
  let prevStart = -1;
  
  if (isClosingDelimiter(text[prevEnd])) {
    // Previous expression is a form, find its matching opening delimiter
    prevStart = findMatchingBackward(text, prevEnd);
  } else {
    // Previous expression is an atom, find where it starts
    for (let i = prevEnd - 1; i >= 0; i--) {
      if (isWhitespace(text[i]) || isDelimiter(text[i])) {
        prevStart = i + 1;
        break;
      }
    }
    
    // If we didn't find the start, it's the first expression in the file
    if (prevStart === -1) {
      prevStart = 0;
    }
  }
  
  if (prevStart === -1) {
    return undefined;
  }
  
  return { start: prevStart, end: prevEnd };
}

/**
 * Find complete expression information around current position
 */
export function findExpressionInfo(document: vscode.TextDocument, position: vscode.Position): ExpressionInfo {
  const result: ExpressionInfo = {};
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Find current expression
  result.current = findCurrentExpression(document, position);
  
  // Find next expression
  if (result.current) {
    result.next = findNextExpression(text, result.current.end);
  } else {
    // If no current expression, try to find next from current position
    result.next = findNextExpression(text, offset);
  }
  
  // Find previous expression
  if (result.current) {
    result.previous = findPreviousExpression(text, result.current.start);
  } else {
    // If no current expression, try to find previous from current position
    result.previous = findPreviousExpression(text, offset);
  }
  
  // Find parent expression
  if (result.current) {
    const parentStart = findContainingOpenDelimiter(text, result.current.start - 1);
    
    if (parentStart !== -1) {
      const parentEnd = findMatchingForward(text, parentStart);
      
      if (parentEnd !== -1) {
        result.parent = { start: parentStart, end: parentEnd };
      }
    }
  }
  
  return result;
}