import { Range, Position } from 'vscode-languageserver';
import { parse, SExp, SList } from '../parser';
import { SSymbol, isList, isSymbol, sexpToString } from '../s-exp/types';
import { ITextDocument, createTextDocumentAdapter } from '../document-adapter';

/**
 * Escapes special characters in a string for use in a regular expression
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the range of an expression in the document
 */
export function findExpressionRange(document: ITextDocument, exp: SExp): Range {
  const text = document.getText();
  const expString = expressionToString(exp);
  
  // Escape special characters for regex
  const escapedExpString = escapeRegExp(expString);
  
  // Try to find the expression in the document text
  const regex = new RegExp(escapedExpString, 'g');
  const match = regex.exec(text);
  
  if (match) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset);
    
    return Range.create(startPos, endPos);
  }
  
  // If unable to find the exact expression, try to approximate based on position
  if (isList(exp)) {
    return findListExpressionRange(document, exp);
  }
  
  // Fallback to a default range at position 0,0
  return Range.create(Position.create(0, 0), Position.create(0, 0));
}

/**
 * Approximates the range of a list expression
 */
function findListExpressionRange(document: ITextDocument, listExp: SList): Range {
  const text = document.getText();
  
  // Try to find matching parentheses
  const startingParens = findParenthesisPositions(text, '(');
  const endingParens = findParenthesisPositions(text, ')');
  
  if (startingParens.length === 0 || endingParens.length === 0) {
    return Range.create(Position.create(0, 0), Position.create(0, 0));
  }
  
  // Try to match the first element of the list expression if it's a symbol
  if (listExp.elements.length > 0 && isSymbol(listExp.elements[0])) {
    const symbol = listExp.elements[0];
    const symbolName = symbol.name;
    
    // Find positions where this symbol follows an opening parenthesis
    for (const startPos of startingParens) {
      // Look for the symbol after this opening parenthesis
      const potentialSymbolStart = startPos + 1;
      const potentialSymbolText = text.substring(
        potentialSymbolStart, 
        potentialSymbolStart + symbolName.length
      );
      
      if (potentialSymbolText === symbolName) {
        // Now find the matching closing parenthesis
        for (const endPos of endingParens) {
          if (endPos > startPos) {
            // Try to parse the text between these parentheses
            const expressionText = text.substring(startPos, endPos + 1);
            try {
              const parsed = parse(expressionText);
              if (parsed.length === 1 && expressionMatches(parsed[0], listExp)) {
                // We found a match!
                const startPosition = document.positionAt(startPos);
                const endPosition = document.positionAt(endPos + 1);
                return Range.create(startPosition, endPosition);
              }
            } catch (e) {
              // Parsing failed, try the next closing parenthesis
              continue;
            }
          }
        }
      }
    }
  }
  
  // Fallback to searching based on the entire list's string representation
  return Range.create(Position.create(0, 0), Position.create(0, 0));
}

/**
 * Checks if two S-expressions match structurally
 */
function expressionMatches(exp1: SExp, exp2: SExp): boolean {
  if (isList(exp1) && isList(exp2)) {
    if (exp1.elements.length !== exp2.elements.length) {
      return false;
    }
    
    // Check if first element (usually a function name) matches
    if (exp1.elements.length > 0 && exp2.elements.length > 0) {
      if (!expressionMatches(exp1.elements[0], exp2.elements[0])) {
        return false;
      }
    }
    
    return true;
  }
  
  if (isSymbol(exp1) && isSymbol(exp2)) {
    return exp1.name === exp2.name;
  }
  
  // Simple check for other expression types
  return expressionToString(exp1) === expressionToString(exp2);
}

/**
 * Finds positions of a specific character in a string
 */
function findParenthesisPositions(text: string, char: string): number[] {
  const positions: number[] = [];
  let pos = text.indexOf(char);
  
  while (pos !== -1) {
    positions.push(pos);
    pos = text.indexOf(char, pos + 1);
  }
  
  return positions;
}

/**
 * Converts an S-expression to its string representation
 */
function expressionToString(exp: SExp): string {
  return sexpToString(exp);
}

/**
 * Gets the range of an S-expression at a specific position in the document
 */
export function getExpressionRangeAtPosition(document: ITextDocument, position: Position): Range | null {
  try {
    const text = document.getText();
    const expressions = parse(text);
    
    // Find the expression that contains the cursor position
    for (const exp of expressions) {
      const range = findExpressionRange(document, exp);
      if (containsPosition(range, position)) {
        return range;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting expression range:', e);
    return null;
  }
}

/**
 * Helper function to check if a range contains a position
 */
function containsPosition(range: Range, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  
  return true;
}

/**
 * Get the current expression containing the cursor position
 * Used for finding the context for completions
 * @param document The document to analyze
 * @param position The cursor position
 * @param tolerant Whether to use tolerant parsing for incomplete code
 * @returns The expression at the cursor position, or undefined if not found
 */
export function getCurrentExpression(document: ITextDocument, position: Position, tolerant: boolean = false): SExp | undefined {
  try {
    // Get the text of the document
    const text = document.getText();
    
    // Try to parse the entire document with tolerant parsing
    let expressions: SExp[] = [];
    try {
      expressions = parse(text, tolerant);
    } catch (error) {
      // Even if full document parsing fails, try to find a local expression
      // For this case, we'll try to extract just the current line
      const currentLine = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 }
      });
      
      // If the current line has content, try to parse just that line
      if (currentLine.trim()) {
        try {
          // Try to add parentheses if needed for a valid expression
          const wrappedLine = `(${currentLine.trim()})`;
          const lineExpressions = parse(wrappedLine, true);
          if (lineExpressions.length > 0 && isList(lineExpressions[0])) {
            // If we got a valid expression, use its inner elements
            const innerElements = (lineExpressions[0] as SList).elements;
            if (innerElements.length > 0) {
              // Return the first inner element as our expression
              return innerElements[0];
            }
          }
        } catch (lineError) {
          // If line parsing fails, we'll fall back to returning a simple symbol
          return {
            type: "symbol",
            name: currentLine.trim()
          };
        }
      }
      
      // If all parsing attempts fail, create a simple symbol from any word at the cursor
      const wordAtCursor = getWordAtPosition(document, position);
      if (wordAtCursor) {
        return {
          type: "symbol",
          name: wordAtCursor
        };
      }
      
      // If we can't even find a word, give up
      return undefined;
    }
    
    // Find the deepest expression containing the cursor position
    let containingExpr: SExp | undefined = undefined;
    let minDist = Number.MAX_SAFE_INTEGER;
    
    for (const expr of expressions) {
      // Skip non-list expressions at the top level
      if (!isList(expr)) continue;
      
      // Check if this expression contains the cursor position
      const range = findExpressionRange(document, expr);
      if (isPositionInRange(position, range)) {
        // Calculate how "deep" this expression is
        const distToStart = Math.abs(position.line - range.start.line) + 
                           Math.abs(position.character - range.start.character);
        const distToEnd = Math.abs(position.line - range.end.line) + 
                         Math.abs(position.character - range.end.character);
        const dist = Math.min(distToStart, distToEnd);
        
        if (dist < minDist) {
          minDist = dist;
          containingExpr = expr;
        }
        
        // Look for a more specific nested expression
        if (isList(expr)) {
          const nestedExpr = findContainingExpr(document, expr as SList, position);
          if (nestedExpr) {
            const nestedRange = findExpressionRange(document, nestedExpr);
            const nestedDistToStart = Math.abs(position.line - nestedRange.start.line) + 
                                     Math.abs(position.character - nestedRange.start.character);
            const nestedDistToEnd = Math.abs(position.line - nestedRange.end.line) + 
                                   Math.abs(position.character - nestedRange.end.character);
            const nestedDist = Math.min(nestedDistToStart, nestedDistToEnd);
            
            if (nestedDist < minDist) {
              minDist = nestedDist;
              containingExpr = nestedExpr;
            }
          }
        }
      }
    }
    
    return containingExpr;
  } catch (error) {
    // Instead of propagating the error which would crash the LSP,
    // log it and return undefined
    console.error(`Error getting current expression: ${error}`);
    return undefined;
  }
}

/**
 * Helper function to find the most specific expression containing a position
 */
function findContainingExpr(document: ITextDocument, expr: SList, position: Position): SExp | undefined {
  for (const element of expr.elements) {
    if (isList(element)) {
      const range = findExpressionRange(document, element);
      if (isPositionInRange(position, range)) {
        // Check if there's an even deeper match
        const nested = findContainingExpr(document, element as SList, position);
        return nested || element;
      }
    }
  }
  return undefined;
}

/**
 * Gets the word at the given position
 */
function getWordAtPosition(document: ITextDocument, position: Position): string | undefined {
  // Get the text of the document
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Define word characters
  const wordPattern = /[a-zA-Z0-9_\-\+\*\/\?\!\>\<\=\%\&\.\:\[\]\{\}\(\)]/;
  
  // Find the start of the word
  let start = offset;
  while (start > 0 && wordPattern.test(text.charAt(start - 1))) {
    start--;
  }
  
  // Find the end of the word
  let end = offset;
  while (end < text.length && wordPattern.test(text.charAt(end))) {
    end++;
  }
  
  if (start === end) {
    return undefined;
  }
  
  return text.substring(start, end);
}

/**
 * Gets the parent expression of the current expression
 */
export function getParentExpression(document: ITextDocument, position: Position): SExp | null {
  try {
    const text = document.getText();
    const expressions = parse(text);
    
    // Find parent expressions by checking if an SList contains the position
    // and also has children that contain the position
    function findParent(exp: SExp, position: Position): SExp | null {
      if (isList(exp)) {
        const expRange = findExpressionRange(document, exp);
        
        if (containsPosition(expRange, position)) {
          // Check if any child more specifically contains the position
          for (const child of exp.elements) {
            const childRange = findExpressionRange(document, child);
            if (containsPosition(childRange, position)) {
              // This child contains the position, so this exp is a parent
              return exp;
            }
          }
        }
      }
      
      return null;
    }
    
    // Check all top-level expressions
    for (const exp of expressions) {
      const parent = findParent(exp, position);
      if (parent) {
        return parent;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting parent expression:', e);
    return null;
  }
}

/**
 * Enhanced version that handles all edge cases of HQL expression evaluation
 */
export function getExpressionRange(document: any, position: any): Range {
  // Adapt the document to our common interface
  const adaptedDoc = createTextDocumentAdapter(document);
  
  // Adapt the position if it's a VS Code position
  let lspPosition: Position;
  if ('line' in position && 'character' in position) {
    lspPosition = Position.create(position.line, position.character);
  } else {
    lspPosition = Position.create(position._line, position._character);
  }
  
  const text = adaptedDoc.getText();
  const offset = adaptedDoc.offsetAt(lspPosition);
  
  // Handle the case where the cursor is on a delimiter
  if (offset < text.length && '([{)]}'.includes(text[offset])) {
    const delimiterPosition = lspPosition;
    
    // If cursor is on an opening delimiter, find the matching closing
    if ('([{'.includes(text[offset])) {
      const openDelim = text[offset];
      const closeDelim = getMatchingDelimiter(openDelim);
      const pair = findMatchingDelimiterPair(text, offset, openDelim, closeDelim, 1);
      
      if (pair.endPos !== -1) {
        const endPosition = adaptedDoc.positionAt(pair.endPos + 1);
        return Range.create(delimiterPosition, endPosition);
      }
    }
    // If cursor is on a closing delimiter, find the matching opening
    else if (')]}'.includes(text[offset])) {
      const closeDelim = text[offset];
      const openDelim = getMatchingDelimiter(closeDelim);
      const pair = findMatchingDelimiterPair(text, offset, closeDelim, openDelim, -1);
      
      if (pair.startPos !== -1) {
        const startPosition = adaptedDoc.positionAt(pair.startPos);
        const endPosition = adaptedDoc.positionAt(offset + 1);
        return Range.create(startPosition, endPosition);
      }
    }
  }
  
  // Handle the case where the cursor is inside an expression
  // This is a more robust implementation that handles nested expressions correctly
  const containingExpression = findContainingExpression(text, offset);
  if (containingExpression) {
    const startPosition = adaptedDoc.positionAt(containingExpression.start);
    const endPosition = adaptedDoc.positionAt(containingExpression.end + 1);
    return Range.create(startPosition, endPosition);
  }
  
  // Check for top-level expressions
  const expressions = parse(text);
  const expression = getCurrentExpression(adaptedDoc, lspPosition);
  if (expression) {
    return findExpressionRange(adaptedDoc, expression);
  }
  
  // If no expression is found, return a range around the cursor position
  return Range.create(lspPosition, lspPosition);
}

/**
 * Get the matching delimiter for a given delimiter
 */
function getMatchingDelimiter(delimiter: string): string {
  switch (delimiter) {
    case '(': return ')';
    case ')': return '(';
    case '[': return ']';
    case ']': return '[';
    case '{': return '}';
    case '}': return '{';
    default: return '';
  }
}

/**
 * Find matching delimiter pair positions in text
 */
function findMatchingDelimiterPair(
  text: string, 
  startOffset: number, 
  startDelim: string, 
  endDelim: string, 
  direction: 1 | -1
): { startPos: number, endPos: number } {
  let pos = startOffset;
  let depth = 1;
  let startPos = -1;
  let endPos = -1;
  
  if (direction === 1) {
    // Forward search for closing delimiter
    startPos = startOffset;
    for (let i = startOffset + 1; i < text.length; i++) {
      if (text[i] === startDelim) {
        depth++;
      } else if (text[i] === endDelim) {
        depth--;
        if (depth === 0) {
          endPos = i;
          break;
        }
      }
    }
  } else {
    // Backward search for opening delimiter
    endPos = startOffset;
    for (let i = startOffset - 1; i >= 0; i--) {
      if (text[i] === startDelim) {
        depth++;
      } else if (text[i] === endDelim) {
        depth--;
        if (depth === 0) {
          startPos = i;
          break;
        }
      }
    }
  }
  
  return { startPos, endPos };
}

/**
 * Find the start and end of an expression containing the given offset
 */
function findContainingExpression(
  text: string, 
  offset: number
): { start: number, end: number } | null {
  // Find the opening delimiter before the current position
  let openDelims = [];
  let closeDelims = [];
  
  for (let i = 0; i < text.length; i++) {
    if ('([{'.includes(text[i])) {
      openDelims.push(i);
    } else if (')]}'.includes(text[i])) {
      if (openDelims.length > 0) {
        const openPos = openDelims.pop();
        
        // If this pair contains our offset, we've found the containing expression
        if (openPos !== undefined && openPos < offset && i >= offset) {
          return { start: openPos, end: i };
        }
        
        // If we've removed matched pairs and the offset is between open and closing
        // delimiters, look for the innermost pair
        if (openDelims.length > 0 && openDelims[openDelims.length - 1] < offset && i >= offset) {
          return { start: openDelims[openDelims.length - 1], end: i };
        }
      }
    }
  }
  
  // Simple scan for the innermost expression containing the offset
  let innerStart = -1;
  let innerEnd = -1;
  let depth = 0;
  
  for (let i = 0; i < text.length; i++) {
    if ('([{'.includes(text[i])) {
      if (i < offset && (innerStart === -1 || i > innerStart)) {
        innerStart = i;
      }
      depth++;
    } else if (')]}'.includes(text[i])) {
      depth--;
      if (depth === 0 && innerStart !== -1 && i >= offset) {
        innerEnd = i;
        break;
      }
    }
  }
  
  if (innerStart !== -1 && innerEnd !== -1) {
    return { start: innerStart, end: innerEnd };
  }
  
  return null;
}

/**
 * Gets the outermost expression containing the cursor position
 * Enhanced version for all edge cases
 */
export function getOutermostExpressionRange(document: any, position: any): Range {
  // Adapt the document to our common interface
  const adaptedDoc = createTextDocumentAdapter(document);
  
  // Adapt the position if it's a VS Code position
  let lspPosition: Position;
  if ('line' in position && 'character' in position) {
    lspPosition = Position.create(position.line, position.character);
  } else {
    lspPosition = Position.create(position._line, position._character);
  }
  
  try {
    const text = adaptedDoc.getText();
    const offset = adaptedDoc.offsetAt(lspPosition);
    
    // Find the outermost expression containing this position
    const expressions = parse(text);
    
    // Analyze all top-level expressions to find the one containing the position
    for (const expr of expressions) {
      const range = findExpressionRange(adaptedDoc, expr);
      
      if (isPositionInRange(lspPosition, range)) {
        return range;
      }
    }
    
    // If no top-level expression contains the position, try to find any containing expression
    // This handles incomplete expressions not yet parseable
    const containingExpr = findContainingExpression(text, offset);
    if (containingExpr) {
      return Range.create(
        adaptedDoc.positionAt(containingExpr.start),
        adaptedDoc.positionAt(containingExpr.end + 1)
      );
    }
    
    // If still no expression found, use more aggressive form detection
    return findExpressionByDelimiters(text, offset, adaptedDoc);
    
  } catch (e) {
    console.error('Error getting outermost expression range:', e);
    return Range.create(lspPosition, lspPosition);
  }
}

/**
 * Fall back to delimiters-only expression detection
 */
function findExpressionByDelimiters(text: string, offset: number, adaptedDoc: ITextDocument): Range {
  // Find the nearest opening delimiter before the cursor
  let openPos = -1;
  for (let i = offset; i >= 0; i--) {
    if ('([{'.includes(text[i])) {
      openPos = i;
      break;
    }
  }
  
  // Find the matching closing delimiter
  if (openPos !== -1) {
    const openChar = text[openPos];
    const closeChar = getMatchingDelimiter(openChar);
    let depth = 1;
    
    for (let i = openPos + 1; i < text.length; i++) {
      if (text[i] === openChar) {
        depth++;
      } else if (text[i] === closeChar) {
        depth--;
        if (depth === 0) {
          // Found matching pair
          return Range.create(
            adaptedDoc.positionAt(openPos),
            adaptedDoc.positionAt(i + 1)
          );
        }
      }
    }
  }
  
  // If still no expression, return a range around the cursor
  return Range.create(
    adaptedDoc.positionAt(offset),
    adaptedDoc.positionAt(offset)
  );
}

/**
 * Check if a position is contained within a range
 */
function isPositionInRange(position: Position, range: Range): boolean {
  return (
    (position.line > range.start.line || 
     (position.line === range.start.line && position.character >= range.start.character)) &&
    (position.line < range.end.line || 
     (position.line === range.end.line && position.character <= range.end.character))
  );
}