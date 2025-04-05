import { TextDocument, Position, Range } from 'vscode';
import { parse } from '../parser';
import { SExp, SList, SSymbol, isList, isSymbol } from '../s-exp/types';

/**
 * Get the expression at the current cursor position
 */
export function getExpressionRange(document: TextDocument, position: Position): Range {
  try {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Parse the document to get S-expressions
    const expressions = parse(text);
    
    // Find the innermost expression containing the cursor
    const innermost = findInnermostExpression(expressions, offset);
    
    if (innermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, innermost);
    } else {
      // Fallback: Return the current line range
      const line = document.lineAt(position.line);
      return new Range(
        new Position(position.line, 0),
        new Position(position.line, line.text.length)
      );
    }
  } catch (error) {
    // If parsing fails, return a minimal range around the cursor
    return new Range(position, position);
  }
}

/**
 * Get the outermost expression containing the cursor
 */
export function getOutermostExpressionRange(document: TextDocument, position: Position): Range {
  try {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Parse the document to get S-expressions
    const expressions = parse(text);
    
    // Find the top-level expression containing the cursor
    const outermost = findOutermostExpression(expressions, offset);
    
    if (outermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, outermost);
    } else {
      // Fallback: Return the current line range
      const line = document.lineAt(position.line);
      return new Range(
        new Position(position.line, 0),
        new Position(position.line, line.text.length)
      );
    }
  } catch (error) {
    // If parsing fails, return a minimal range around the cursor
    return new Range(position, position);
  }
}

/**
 * Find the innermost expression containing the given offset
 */
function findInnermostExpression(expressions: SExp[], offset: number): SExp | null {
  // Keep track of the innermost expression found so far and its size
  let innermost: SExp | null = null;
  let smallestSize = Infinity;
  
  // Recursively search the expressions
  function search(exp: SExp, start: number, end: number): void {
    // Check if this expression contains the offset
    if (offset >= start && offset <= end) {
      // Calculate the size of this expression
      const size = end - start;
      
      // If this is the smallest expression we've found so far, update innermost
      if (size < smallestSize) {
        innermost = exp;
        smallestSize = size;
      }
      
      // If this is a list, search its elements
      if (isList(exp)) {
        const list = exp as SList;
        const elements = list.elements;
        
        // For an empty list, we're done
        if (elements.length === 0) return;
        
        // Track the current position in the source
        let pos = start + 1; // Skip the opening delimiter
        
        // Search each element
        for (const element of elements) {
          // Skip any whitespace or comments
          // This is a simplification - in practice, we'd need to track the exact
          // source positions of each element, which requires updates to the parser
          const elementEnd = pos + estimateExpressionSize(element);
          search(element, pos, elementEnd);
          pos = elementEnd + 1; // +1 for the space after the element
        }
      }
    }
  }
  
  // Search each top-level expression
  let pos = 0;
  for (const exp of expressions) {
    const end = pos + estimateExpressionSize(exp);
    search(exp, pos, end);
    pos = end + 1; // +1 for the space/newline after the expression
  }
  
  return innermost;
}

/**
 * Find the outermost (top-level) expression containing the given offset
 */
function findOutermostExpression(expressions: SExp[], offset: number): SExp | null {
  // Track the position in the source
  let pos = 0;
  
  // Check each top-level expression
  for (const exp of expressions) {
    const end = pos + estimateExpressionSize(exp);
    
    // If this expression contains the offset, return it
    if (offset >= pos && offset <= end) {
      return exp;
    }
    
    pos = end + 1; // +1 for the space/newline after the expression
  }
  
  return null;
}

/**
 * Estimate the size of an expression in characters
 * This is a rough approximation since we don't track exact source positions
 */
function estimateExpressionSize(exp: SExp): number {
  if (isSymbol(exp)) {
    // For symbols, count the characters in the name
    return (exp as SSymbol).name.length;
  } else if (isList(exp)) {
    // For lists, count the delimiters and the sizes of all elements
    const list = exp as SList;
    let size = 2; // Opening and closing delimiters
    
    // Add the sizes of all elements plus spaces between them
    for (const element of list.elements) {
      size += estimateExpressionSize(element) + 1; // +1 for the space after
    }
    
    return size;
  } else {
    // For literals and other types, make a reasonable guess
    // This could be improved with more detailed tracking
    return 5;
  }
}

/**
 * Convert an S-expression to a vscode.Range
 */
function getRangeForExpression(document: TextDocument, exp: SExp): Range {
  // This is a simplification - in practice, we'd track the exact source positions
  // Instead, we'll search for the textual representation of the expression
  
  const text = document.getText();
  const expString = expressionToString(exp);
  
  // Escape special regex characters in the expression string
  const escapedExpString = expString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Search for the expression in the document
  const regex = new RegExp(escapedExpString, 'g');
  const match = regex.exec(text);
  
  if (match) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    
    return new Range(
      document.positionAt(startOffset),
      document.positionAt(endOffset)
    );
  } else {
    // Fallback: Return the position range
    const position = document.positionAt(0);
    return new Range(position, position);
  }
}

/**
 * Convert an S-expression to a string representation
 */
function expressionToString(exp: SExp): string {
  if (isSymbol(exp)) {
    return (exp as SSymbol).name;
  } else if (isList(exp)) {
    const list = exp as SList;
    const elements = list.elements.map(expressionToString);
    return `(${elements.join(' ')})`;
  } else {
    // For literals and other types, make a reasonable guess
    return 'value';
  }
}