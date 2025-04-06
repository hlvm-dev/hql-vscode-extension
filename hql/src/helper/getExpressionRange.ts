import { Range, Position } from 'vscode-languageserver';
import { parse } from '../parser';
import { SExp, SList, SSymbol, isList, isSymbol, sexpToString } from '../s-exp/types';
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
 * Gets the current S-expression under the cursor
 */
export function getCurrentExpression(document: ITextDocument, position: Position): SExp | null {
  try {
    const text = document.getText();
    const expressions = parse(text);
    
    // Find the expression that contains the cursor position
    for (const exp of expressions) {
      const range = findExpressionRange(document, exp);
      if (containsPosition(range, position)) {
        return exp;
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting current expression:', e);
    return null;
  }
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
 * Gets the range of the current expression under the cursor
 * Works with both VS Code and LSP TextDocument types
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
  
  const expression = getCurrentExpression(adaptedDoc, lspPosition);
  if (expression) {
    return findExpressionRange(adaptedDoc, expression);
  }
  
  // If no expression is found, return a range around the cursor position
  return Range.create(lspPosition, lspPosition);
}

/**
 * Gets the range of the outermost expression containing the cursor position
 * Works with both VS Code and LSP TextDocument types
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
    const expressions = parse(text);
    
    // Find the outermost expression that contains the cursor position
    for (const exp of expressions) {
      const range = findExpressionRange(adaptedDoc, exp);
      if (containsPosition(range, lspPosition)) {
        return range;
      }
    }
    
    // If no expression is found, return a range around the cursor position
    return Range.create(lspPosition, lspPosition);
  } catch (e) {
    console.error('Error getting outermost expression range:', e);
    return Range.create(lspPosition, lspPosition);
  }
}