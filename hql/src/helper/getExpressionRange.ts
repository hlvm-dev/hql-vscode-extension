import { TextDocument, Position, Range } from 'vscode';
import { parse } from '../parser';
import { SExp, SList, SSymbol, SLiteral, isList, isSymbol, isLiteral } from '../s-exp/types';
import { Logger } from '../logger';

// Create a logger instance
const logger = new Logger(false);

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
    const innermost = findInnermostExpression(expressions, offset, text);
    
    if (innermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, innermost, text);
    } else {
      // Fallback: Try to find expression boundaries manually
      return findExpressionRangeManually(document, position);
    }
  } catch (error) {
    logger.error(`Error in getExpressionRange: ${error}`);
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
    const outermost = findOutermostExpression(expressions, offset, text);
    
    if (outermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, outermost, text);
    } else {
      // Fallback: Try to find expression boundaries manually
      return findOutermostExpressionRangeManually(document, position);
    }
  } catch (error) {
    logger.error(`Error in getOutermostExpressionRange: ${error}`);
    // If parsing fails, return a minimal range around the cursor
    return new Range(position, position);
  }
}

/**
 * Find the innermost expression containing the given offset
 */
function findInnermostExpression(expressions: SExp[], offset: number, source: string): SExp | null {
  // Keep track of the innermost expression found so far and its size
  let innermost: SExp | null = null;
  let smallestSize = Infinity;
  
  // Track the current position in the source
  let pos = 0;
  
  // Recursively search the expressions
  function search(exp: SExp, start: number): number {
    const expString = expressionToString(exp);
    
    // Skip any whitespace before the expression
    let currPos = start;
    while (currPos < source.length && /\s/.test(source[currPos])) {
      currPos++;
    }
    
    // Find the end of this expression
    const expStart = currPos;
    let expEnd: number;
    
    if (isList(exp)) {
      // For lists, we need to recursively process each element
      const list = exp as SList;
      
      // Skip the opening delimiter
      currPos = skipChar(source, currPos, '(');
      
      // Process each element in the list
      for (const element of list.elements) {
        currPos = search(element, currPos);
        
        // Skip any whitespace between elements
        while (currPos < source.length && /\s/.test(source[currPos])) {
          currPos++;
        }
      }
      
      // Skip the closing delimiter
      currPos = skipChar(source, currPos, ')');
      expEnd = currPos;
    } else if (isSymbol(exp)) {
      // For symbols, just find the symbol in the source
      const symbol = exp as SSymbol;
      const symbolPattern = new RegExp(`\\b${escapeRegExp(symbol.name)}\\b`);
      const match = symbolPattern.exec(source.slice(currPos));
      if (match) {
        expEnd = currPos + match.index + symbol.name.length;
        currPos = expEnd;
      } else {
        // If we can't find the symbol, just estimate its position
        expEnd = currPos + symbol.name.length;
        currPos = expEnd;
      }
    } else if (isLiteral(exp)) {
      // For literals, estimate the size
      const lit = exp as SLiteral;
      let litString: string;
      
      if (typeof lit.value === 'string') {
        litString = `"${lit.value}"`;
      } else if (lit.value === null) {
        litString = 'nil';
      } else {
        litString = String(lit.value);
      }
      
      expEnd = currPos + litString.length;
      currPos = expEnd;
    } else {
      // For unknown types, just advance by a token
      expEnd = currPos + 1;
      currPos = expEnd;
    }
    
    // Check if this expression contains the offset
    if (offset >= expStart && offset <= expEnd) {
      const size = expEnd - expStart;
      if (size < smallestSize) {
        innermost = exp;
        smallestSize = size;
      }
    }
    
    return currPos;
  }
  
  // Process each top-level expression
  for (const exp of expressions) {
    pos = search(exp, pos);
    
    // Skip any whitespace between top-level expressions
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
  }
  
  return innermost;
}

/**
 * Find the outermost (top-level) expression containing the given offset
 */
function findOutermostExpression(expressions: SExp[], offset: number, source: string): SExp | null {
  // Track the current position in the source
  let pos = 0;
  
  for (const exp of expressions) {
    // Skip any whitespace before the expression
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
    
    const expStart = pos;
    let expEnd: number;
    
    // Calculate the end position of this expression
    if (isList(exp)) {
      // For lists, we need to find the matching closing parenthesis
      pos = skipChar(source, pos, '(');
      
      // Find the matching closing parenthesis
      let depth = 1;
      while (pos < source.length && depth > 0) {
        const char = source[pos];
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }
        pos++;
      }
      
      expEnd = pos;
    } else {
      // For other expressions, use a simple estimation
      const expString = expressionToString(exp);
      expEnd = expStart + expString.length;
      pos = expEnd;
    }
    
    // Check if this expression contains the offset
    if (offset >= expStart && offset <= expEnd) {
      return exp;
    }
    
    // Skip any whitespace between top-level expressions
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
  }
  
  return null;
}

/**
 * Skip a specific character in the source
 */
function skipChar(source: string, pos: number, char: string): number {
  if (pos < source.length && source[pos] === char) {
    return pos + 1;
  }
  return pos;
}

/**
 * Escape a string for use in a regular expression
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\import { TextDocument, Position, Range } from 'vscode';
import { parse } from '../parser';
import { SExp, SList, SSymbol, SLiteral, isList, isSymbol, isLiteral } from '../s-exp/types';
import { Logger } from '../logger';

// Create a logger instance
const logger = new Logger(false);

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
    const innermost = findInnermostExpression(expressions, offset, text);
    
    if (innermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, innermost, text);
    } else {
      // Fallback: Try to find expression boundaries manually
      return findExpressionRangeManually(document, position);
    }
  } catch (error) {
    logger.error(`Error in getExpressionRange: ${error}`);
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
    const outermost = findOutermostExpression(expressions, offset, text);
    
    if (outermost) {
      // If we found an expression, return its range
      return getRangeForExpression(document, outermost, text);
    } else {
      // Fallback: Try to find expression boundaries manually
      return findOutermostExpressionRangeManually(document, position);
    }
  } catch (error) {
    logger.error(`Error in getOutermostExpressionRange: ${error}`);
    // If parsing fails, return a minimal range around the cursor
    return new Range(position, position);
  }
}

/**
 * Find the innermost expression containing the given offset
 */
function findInnermostExpression(expressions: SExp[], offset: number, source: string): SExp | null {
  // Keep track of the innermost expression found so far and its size
  let innermost: SExp | null = null;
  let smallestSize = Infinity;
  
  // Track the current position in the source
  let pos = 0;
  
  // Recursively search the expressions
  function search(exp: SExp, start: number): number {
    const expString = expressionToString(exp);
    
    // Skip any whitespace before the expression
    let currPos = start;
    while (currPos < source.length && /\s/.test(source[currPos])) {
      currPos++;
    }
    
    // Find the end of this expression
    const expStart = currPos;
    let expEnd: number;
    
    if (isList(exp)) {
      // For lists, we need to recursively process each element
      const list = exp as SList;
      
      // Skip the opening delimiter
      currPos = skipChar(source, currPos, '(');
      
      // Process each element in the list
      for (const element of list.elements) {
        currPos = search(element, currPos);
        
        // Skip any whitespace between elements
        while (currPos < source.length && /\s/.test(source[currPos])) {
          currPos++;
        }
      }
      
      // Skip the closing delimiter
      currPos = skipChar(source, currPos, ')');
      expEnd = currPos;
    } else if (isSymbol(exp)) {
      // For symbols, just find the symbol in the source
      const symbol = exp as SSymbol;
      const symbolPattern = new RegExp(`\\b${escapeRegExp(symbol.name)}\\b`);
      const match = symbolPattern.exec(source.slice(currPos));
      if (match) {
        expEnd = currPos + match.index + symbol.name.length;
        currPos = expEnd;
      } else {
        // If we can't find the symbol, just estimate its position
        expEnd = currPos + symbol.name.length;
        currPos = expEnd;
      }
    } else if (isLiteral(exp)) {
      // For literals, estimate the size
      const lit = exp as SLiteral;
      let litString: string;
      
      if (typeof lit.value === 'string') {
        litString = `"${lit.value}"`;
      } else if (lit.value === null) {
        litString = 'nil';
      } else {
        litString = String(lit.value);
      }
      
      expEnd = currPos + litString.length;
      currPos = expEnd;
    } else {
      // For unknown types, just advance by a token
      expEnd = currPos + 1;
      currPos = expEnd;
    }
    
    // Check if this expression contains the offset
    if (offset >= expStart && offset <= expEnd) {
      const size = expEnd - expStart;
      if (size < smallestSize) {
        innermost = exp;
        smallestSize = size;
      }
    }
    
    return currPos;
  }
  
  // Process each top-level expression
  for (const exp of expressions) {
    pos = search(exp, pos);
    
    // Skip any whitespace between top-level expressions
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
  }
  
  return innermost;
}

/**
 * Find the outermost (top-level) expression containing the given offset
 */
function findOutermostExpression(expressions: SExp[], offset: number, source: string): SExp | null {
  // Track the current position in the source
  let pos = 0;
  
  for (const exp of expressions) {
    // Skip any whitespace before the expression
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
    
    const expStart = pos;
    let expEnd: number;
    
    // Calculate the end position of this expression
    if (isList(exp)) {
      // For lists, we need to find the matching closing parenthesis
      pos = skipChar(source, pos, '(');
      
      // Find the matching closing parenthesis
      let depth = 1;
      while (pos < source.length && depth > 0) {
        const char = source[pos];
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        }
        pos++;
      }
      
      expEnd = pos;
    } else {
      // For other expressions, use a simple estimation
      const expString = expressionToString(exp);
      expEnd = expStart + expString.length;
      pos = expEnd;
    }
    
    // Check if this expression contains the offset
    if (offset >= expStart && offset <= expEnd) {
      return exp;
    }
    
    // Skip any whitespace between top-level expressions
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
  }
  
  return null;
}

/**
 * Skip a specific character in the source
 */
function skipChar(source: string, pos: number, char: string): number {
  if (pos < source.length && source[pos] === char) {
    return pos + 1;
  }
  return pos;
}

/**
 * Escape a string for use in a regular expression
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  } else if (isLiteral(exp)) {
    const lit = exp as SLiteral;
    if (typeof lit.value === 'string') {
      return `"${lit.value}"`;
    } else if (lit.value === null) {
      return 'nil';
    } else {
      return String(lit.value);
    }
  } else {
    return 'unknown';
  }
}

/**
 * Convert an S-expression to a vscode.Range
 */
function getRangeForExpression(document: TextDocument, exp: SExp, source: string): Range {
  const text = document.getText();
  const expString = expressionToString(exp);
  
  // For lists, we need to be more careful to find the correct range
  if (isList(exp)) {
    // Try to find the opening parenthesis
    const startingParens = findParenthesisPositions(text, '(');');
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
  } else if (isLiteral(exp)) {
    const lit = exp as SLiteral;
    if (typeof lit.value === 'string') {
      return `"${lit.value}"`;
    } else if (lit.value === null) {
      return 'nil';
    } else {
      return String(lit.value);
    }
  } else {
    return 'unknown';
  }
}

/**
 * Convert an S-expression to a vscode.Range
 */
function getRangeForExpression(document: TextDocument, exp: SExp, source: string): Range {
  const text = document.getText();
  const expString = expressionToString(exp);
  
  // For lists, we need to be more careful to find the correct range
  if (isList(exp)) {
    // Try to find the opening parenthesis
    const startingParens = findParenthesisPositions(text, '(');
    const endingParens = findParenthesisPositions(text, ')');
    
    // Find matching pairs
    for (const start of startingParens) {
      let openCount = 1;
      for (const end of endingParens) {
        if (end > start) {
          // Count parentheses between start and end to check if they match
          for (let i = start + 1; i < end; i++) {
            if (text[i] === '(') openCount++;
            else if (text[i] === ')') openCount--;
          }
          
          // If we found a matching pair
          if (openCount === 0) {
            const contents = text.substring(start, end + 1);
            // Parse this expression to see if it matches our target
            try {
              const parsedExp = parse(contents)[0];
              if (JSON.stringify(parsedExp) === JSON.stringify(exp)) {
                return new Range(
                  document.positionAt(start),
                  document.positionAt(end + 1)
                );
              }
            } catch (e) {
              // Ignore parsing errors and continue searching
            }
            break;
          }
        }
      }
    }
  }
  
  // Fallback: Try to find the expression as a string
  const escapedExpString = escapeRegExp(expString);
  const regex = new RegExp(escapedExpString, 'g');
  const match = regex.exec(text);
  
  if (match) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    
    return new Range(
      document.positionAt(startOffset),
      document.positionAt(endOffset)
    );
  }
  
  // Final fallback: return a minimal range
  const pos = document.positionAt(0);
  return new Range(pos, pos);
}

/**
 * Find all positions of a specific character in the text
 */
function findParenthesisPositions(text: string, char: string): number[] {
  const positions: number[] = [];
  let pos = -1;
  
  while ((pos = text.indexOf(char, pos + 1)) !== -1) {
    positions.push(pos);
  }
  
  return positions;
}

/**
 * Fallback method to find an expression range manually
 */
function findExpressionRangeManually(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Logic to find the innermost expression manually
  let start = offset;
  let end = offset;
  let openParenCount = 0;
  let insideExpression = false;
  
  // Look backward for opening parenthesis
  for (let i = offset; i >= 0; i--) {
    if (text[i] === ')') {
      openParenCount--;
    } else if (text[i] === '(') {
      openParenCount++;
      if (openParenCount > 0) {
        start = i;
        insideExpression = true;
        break;
      }
    }
  }
  
  if (!insideExpression) {
    // Couldn't find an opening parenthesis, just use the current line
    const line = document.lineAt(position.line);
    return new Range(
      new Position(position.line, 0),
      new Position(position.line, line.text.length)
    );
  }
  
  // Look forward for closing parenthesis
  openParenCount = 1; // We found one opening parenthesis
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '(') {
      openParenCount++;
    } else if (text[i] === ')') {
      openParenCount--;
      if (openParenCount === 0) {
        end = i + 1; // Include the closing parenthesis
        break;
      }
    }
  }
  
  return new Range(
    document.positionAt(start),
    document.positionAt(end)
  );
}

/**
 * Fallback method to find the outermost expression range manually
 */
function findOutermostExpressionRangeManually(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const line = document.lineAt(position.line);
  const lineText = line.text;
  
  // Find the first non-whitespace opening parenthesis on the line
  let lineStart = lineText.indexOf('(');
  if (lineStart === -1) {
    // No opening parenthesis on this line, just return the whole line
    return new Range(
      new Position(position.line, 0),
      new Position(position.line, lineText.length)
    );
  }
  
  // Convert line position to document position
  const start = document.offsetAt(new Position(position.line, lineStart));
  
  // Find the matching closing parenthesis
  let openParenCount = 1;
  let end = start + 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '(') {
      openParenCount++;
    } else if (text[i] === ')') {
      openParenCount--;
      if (openParenCount === 0) {
        end = i + 1; // Include the closing parenthesis
        break;
      }
    }
  }
  
  return new Range(
    document.positionAt(start),
    document.positionAt(end)
  );
}

/**
 * Get the range of a symbol at the current cursor position
 */
export function getSymbolRangeAtPosition(document: TextDocument, position: Position): Range | null {
  const line = document.lineAt(position.line).text;
  const wordPattern = /[a-zA-Z0-9_\-\.\+\*\/\?\!\=\>\<\&\|\%\$\#\@\~\:\^]+/g;
  let match;
  
  while ((match = wordPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (position.character >= start && position.character <= end) {
      return new Range(
        new Position(position.line, start),
        new Position(position.line, end)
      );
    }
  }
  
  return null;
}

/**
 * Get the range of a form at the current cursor position
 * @param document The text document
 * @param position The cursor position
 * @param type The type of form to find ('list', 'vector', 'map', 'set', or null for any)
 */
export function getFormRangeAtPosition(
  document: TextDocument, 
  position: Position, 
  type: 'list' | 'vector' | 'map' | 'set' | null = null
): Range | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Define the delimiters based on the form type
  let openDelimiter: string;
  let closeDelimiter: string;
  
  if (type === 'list') {
    openDelimiter = '(';
    closeDelimiter = ')';
  } else if (type === 'vector') {
    openDelimiter = '[';
    closeDelimiter = ']';
  } else if (type === 'map') {
    openDelimiter = '{';
    closeDelimiter = '}';
  } else if (type === 'set') {
    openDelimiter = '#[';
    closeDelimiter = ']';
  } else {
    // If type is null, we search for any form - start with parentheses
    return (
      getFormRangeAtPosition(document, position, 'list') ||
      getFormRangeAtPosition(document, position, 'vector') ||
      getFormRangeAtPosition(document, position, 'map') ||
      getFormRangeAtPosition(document, position, 'set')
    );
  }
  
  // Find the innermost form of the specified type
  let openDelimPos = -1;
  let depth = 0;
  
  // Look backward for the opening delimiter
  for (let i = offset; i >= 0; i--) {
    // Check for set literal special case
    if (type === 'set' && i > 0 && text.substring(i - 1, i + 1) === '#[') {
      depth--;
      if (depth < 0) {
        openDelimPos = i - 1;
        break;
      }
      i--; // Skip one more character because we handled two chars
    }
    // Regular delimiter handling
    else if (text[i] === closeDelimiter) {
      depth++;
    } else if (text[i] === openDelimiter) {
      depth--;
      if (depth < 0) {
        openDelimPos = i;
        break;
      }
    }
  }
  
  if (openDelimPos < 0) {
    return null;
  }
  
  // Look forward for the matching closing delimiter
  let closeDelimPos = -1;
  depth = 1; // We've found one opening delimiter
  
  for (let i = openDelimPos + (type === 'set' ? 2 : 1); i < text.length; i++) {
    if (text[i] === openDelimiter) {
      depth++;
    } else if (text[i] === closeDelimiter) {
      depth--;
      if (depth === 0) {
        closeDelimPos = i;
        break;
      }
    }
  }
  
  if (closeDelimPos < 0) {
    return null;
  }
  
  return new Range(
    document.positionAt(openDelimPos),
    document.positionAt(closeDelimPos + 1)
  );
}

/**
 * Find all occurrences of a symbol in the document
 */
export function findAllOccurrencesOf(document: TextDocument, symbolName: string): Range[] {
  const text = document.getText();
  const ranges: Range[] = [];
  
  // Create a regex to match whole words only
  const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + symbolName.length);
    ranges.push(new Range(start, end));
  }
  
  return ranges;
}

/**
 * Find matching brackets around a position
 */
export function findMatchingBrackets(
  document: TextDocument, 
  position: Position
): { openBracket: Position, closeBracket: Position } | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Check if we're on a bracket
  const char = text[offset];
  if (!'()[]{}'.includes(char)) {
    return null;
  }
  
  // Determine if it's an opening or closing bracket
  const isOpeningBracket = '([{'.includes(char);
  const matchingChar = isOpeningBracket 
    ? { '(': ')', '[': ']', '{': '}' }[char]
    : { ')': '(', ']': '[', '}': '{' }[char];
  
  if (isOpeningBracket) {
    // Search forward for matching closing bracket
    let depth = 1;
    for (let i = offset + 1; i < text.length; i++) {
      if (text[i] === char) depth++;
      else if (text[i] === matchingChar) {
        depth--;
        if (depth === 0) {
          return {
            openBracket: position,
            closeBracket: document.positionAt(i)
          };
        }
      }
    }
  } else {
    // Search backward for matching opening bracket
    let depth = 1;
    for (let i = offset - 1; i >= 0; i--) {
      if (text[i] === char) depth++;
      else if (text[i] === matchingChar) {
        depth--;
        if (depth === 0) {
          return {
            openBracket: document.positionAt(i),
            closeBracket: position
          };
        }
      }
    }
  }
  
  return null;
}
    const endingParens = findParenthesisPositions(text, ')');
    
    // Find matching pairs
    for (const start of startingParens) {
      let openCount = 1;
      for (const end of endingParens) {
        if (end > start) {
          // Count parentheses between start and end to check if they match
          for (let i = start + 1; i < end; i++) {
            if (text[i] === '(') openCount++;
            else if (text[i] === ')') openCount--;
          }
          
          // If we found a matching pair
          if (openCount === 0) {
            const contents = text.substring(start, end + 1);
            // Parse this expression to see if it matches our target
            try {
              const parsedExp = parse(contents)[0];
              if (JSON.stringify(parsedExp) === JSON.stringify(exp)) {
                return new Range(
                  document.positionAt(start),
                  document.positionAt(end + 1)
                );
              }
            } catch (e) {
              // Ignore parsing errors and continue searching
            }
            break;
          }
        }
      }
    }
  }
  
  // Fallback: Try to find the expression as a string
  const escapedExpString = escapeRegExp(expString);
  const regex = new RegExp(escapedExpString, 'g');
  const match = regex.exec(text);
  
  if (match) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    
    return new Range(
      document.positionAt(startOffset),
      document.positionAt(endOffset)
    );
  }
  
  // Final fallback: return a minimal range
  const pos = document.positionAt(0);
  return new Range(pos, pos);
}

/**
 * Find all positions of a specific character in the text
 */
function findParenthesisPositions(text: string, char: string): number[] {
  const positions: number[] = [];
  let pos = -1;
  
  while ((pos = text.indexOf(char, pos + 1)) !== -1) {
    positions.push(pos);
  }
  
  return positions;
}

/**
 * Fallback method to find an expression range manually
 */
function findExpressionRangeManually(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Logic to find the innermost expression manually
  let start = offset;
  let end = offset;
  let openParenCount = 0;
  let insideExpression = false;
  
  // Look backward for opening parenthesis
  for (let i = offset; i >= 0; i--) {
    if (text[i] === ')') {
      openParenCount--;
    } else if (text[i] === '(') {
      openParenCount++;
      if (openParenCount > 0) {
        start = i;
        insideExpression = true;
        break;
      }
    }
  }
  
  if (!insideExpression) {
    // Couldn't find an opening parenthesis, just use the current line
    const line = document.lineAt(position.line);
    return new Range(
      new Position(position.line, 0),
      new Position(position.line, line.text.length)
    );
  }
  
  // Look forward for closing parenthesis
  openParenCount = 1; // We found one opening parenthesis
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '(') {
      openParenCount++;
    } else if (text[i] === ')') {
      openParenCount--;
      if (openParenCount === 0) {
        end = i + 1; // Include the closing parenthesis
        break;
      }
    }
  }
  
  return new Range(
    document.positionAt(start),
    document.positionAt(end)
  );
}

/**
 * Fallback method to find the outermost expression range manually
 */
function findOutermostExpressionRangeManually(document: TextDocument, position: Position): Range {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const line = document.lineAt(position.line);
  const lineText = line.text;
  
  // Find the first non-whitespace opening parenthesis on the line
  let lineStart = lineText.indexOf('(');
  if (lineStart === -1) {
    // No opening parenthesis on this line, just return the whole line
    return new Range(
      new Position(position.line, 0),
      new Position(position.line, lineText.length)
    );
  }
  
  // Convert line position to document position
  const start = document.offsetAt(new Position(position.line, lineStart));
  
  // Find the matching closing parenthesis
  let openParenCount = 1;
  let end = start + 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '(') {
      openParenCount++;
    } else if (text[i] === ')') {
      openParenCount--;
      if (openParenCount === 0) {
        end = i + 1; // Include the closing parenthesis
        break;
      }
    }
  }
  
  return new Range(
    document.positionAt(start),
    document.positionAt(end)
  );
}