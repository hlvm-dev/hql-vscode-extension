// src/transpiler/parser.ts - Fixed implementation that properly handles extended syntax
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast";
import { ParseError } from "./errors";

// Constant for quickly checking whitespace characters
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', ',']);

// Track in-progress parsing information
let tokens: string[] = [];
let positions: { line: number; column: number; offset: number; }[] = [];
let pos = 0;

/**
 * Check if a character is whitespace
 */
function isWhitespace(ch: string): boolean {
  return WHITESPACE_CHARS.has(ch);
}

/**
 * Process string literals, handling escape sequences properly.
 */
function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number; }
): string {
  if (!str.startsWith('"') || !str.endsWith('"') || str.length < 2) {
    throw new ParseError(
      "Malformed string literal - missing quotes", 
      position
    );
  }
  
  // Remove the surrounding quotes
  const content = str.slice(1, -1);
  let result = "";
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      switch (next) {
        case 'n': result += '\n'; break;
        case 't': result += '\t'; break;
        case 'r': result += '\r'; break;
        case '\\': result += '\\'; break;
        case '"': result += '"'; break;
        case '(': result += '('; break; // For string interpolation
        case ')': result += ')'; break; // For string interpolation
        default:
          throw new ParseError(
            `Invalid escape sequence \\${next} in string`, 
            {
              line: position.line,
              column: position.column + i,
              offset: position.offset + i
            }
          );
      }
      i++; // Skip the escaped character
    } else {
      result += content[i];
    }
  }
  
  return result;
}

/**
 * Remove inline comments from a line
 */
function removeInlineComments(line: string): string {
  let inString = false;
  let commentStart = -1;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
    } else if (!inString && ch === ";") {
      // Once a semicolon is found outside a string, stop and return the prefix
      commentStart = i;
      break;
    }
  }
  
  // If no comment found, return the original line
  if (commentStart === -1) return line;
  
  // Otherwise, return everything up to the comment
  return line.substring(0, commentStart);
}

/**
 * Advanced tokenizer with support for JSON-style object literals, named parameters, and set literals
 */
function tokenize(input: string): { tokens: string[], positions: { line: number; column: number; offset: number; }[] } {
  // Pre-split lines and pre-filter comment-only lines for efficiency
  const rawLines = input.split("\n");
  const lines: string[] = [];
  
  // We need to keep track of original line numbers for error reporting
  const lineMap: number[] = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (line.length > 0 && !line.startsWith(";")) {
      lines.push(line);
      lineMap.push(i);
    }
  }
  
  const tokens: string[] = [];
  const positions: { line: number; column: number; offset: number; }[] = [];
  
  let current = "";
  let inString = false;
  let stringStartLine = 0;
  let stringStartColumn = 0;
  let totalOffset = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const actualLineIndex = lineMap[lineIndex];
    const line = inString ? lines[lineIndex] : removeInlineComments(lines[lineIndex]);
    const lineOffset = totalOffset;
    
    for (let colIndex = 0; colIndex < line.length; colIndex++) {
      const ch = line[colIndex];
      totalOffset++; // Track absolute position in the input
      
      // Check for the set literal marker #[
      if (!inString && ch === '#' && colIndex + 1 < line.length && line[colIndex + 1] === '[') {
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        tokens.push("#[");
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex + 1,
          offset: lineOffset + colIndex
        });
        colIndex++; // Skip the next character as we've processed it
        totalOffset++; // Skip this character in the offset count
        continue;
      }
      
      // Handle type annotation syntax (symbol:)
      if (!inString && ch === ':' && current.length > 0 && 
          (colIndex + 1 >= line.length || 
           isWhitespace(line[colIndex + 1]) || 
           line[colIndex + 1] === ')' || 
           line[colIndex + 1] === ']' || 
           line[colIndex + 1] === ',')) {
        // Named parameter or type annotation
        current += ch;
        tokens.push(current);
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex - current.length + 2,
          offset: lineOffset + colIndex - current.length + 1
        });
        current = "";
        continue;
      }
      
      // Handle equals sign for default values
      if (!inString && ch === '=' && 
          (current.length === 0 || isWhitespace(line[colIndex - 1])) &&
          (colIndex + 1 >= line.length || isWhitespace(line[colIndex + 1]))) {
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        tokens.push("=");
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex + 1,
          offset: lineOffset + colIndex
        });
        continue;
      }
      
      // Handle arrow for return type
      if (!inString && ch === '-' && colIndex + 1 < line.length && line[colIndex + 1] === '>') {
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        tokens.push("->");
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex + 1,
          offset: lineOffset + colIndex
        });
        colIndex++; // Skip the > character
        totalOffset++; // Skip this character in the offset count
        continue;
      }
      
      if (inString) {
        current += ch;
        if (ch === '"' && colIndex > 0 && line[colIndex - 1] !== "\\") {
          tokens.push(current);
          positions.push({
            line: stringStartLine + 1,
            column: stringStartColumn + 1,
            offset: lineOffset + stringStartColumn
          });
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          current += ch;
          inString = true;
          stringStartLine = actualLineIndex;
          stringStartColumn = colIndex;
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
          // Handle all bracket and brace tokens
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          tokens.push(ch);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: lineOffset + colIndex
          });
        } else if (isWhitespace(ch)) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
        } else {
          current += ch;
        }
      }
    }
    
    if (inString) {
      current += "\n";
      totalOffset++; // Count the newline as a character
    } else if (current.length > 0) {
      tokens.push(current);
      positions.push({
        line: actualLineIndex + 1,
        column: line.length - current.length + 1,
        offset: lineOffset + line.length - current.length
      });
      current = "";
    }
    
    totalOffset++; // Count the newline at the end of each line
  }
  
  if (current.length > 0) {
    tokens.push(current);
    positions.push({
      line: lines.length,
      column: lines[lines.length - 1].length - current.length + 1,
      offset: totalOffset - current.length
    });
  }
  
  if (inString) {
    throw new ParseError("Unclosed string literal", {
      line: stringStartLine + 1,
      column: stringStartColumn + 1,
      offset: positions[positions.length - 1].offset - current.length
    });
  }
  
  return { tokens, positions };
}

/**
 * The main parse function, which tokenizes and parses HQL code into an AST
 */
export function parse(input: string): HQLNode[] {
  const result = tokenize(input);
  tokens = result.tokens;
  positions = result.positions;
  pos = 0;
  
  // Track parser context for making smart decisions about array literals vs parameter lists
  const parserContext = {
    inFunctionDefinition: false,
    expectingParameterList: false,
    currentFunctionForm: null as string | null
  };
  
  /**
   * Parse an expression from the token stream
   */
  function parseExpression(): HQLNode {
    if (pos >= tokens.length) {
      throw new ParseError(
        "Unexpected end of input", 
        pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 }
      );
    }
    
    const token = tokens[pos];
    const position = positions[pos];
    pos++;
    
    // Handle special data structure literals
    if (token === "(") {
      // If we're starting a list that could be a function definition
      const oldPos = pos;
      const firstToken = pos < tokens.length ? tokens[pos] : null;
      
      // Check if this is a function definition form
      if (firstToken === "defn" || firstToken === "fn" || firstToken === "defmethod") {
        parserContext.inFunctionDefinition = true;
        parserContext.currentFunctionForm = firstToken;
        // After the function name, we expect a parameter list
        parserContext.expectingParameterList = true;
      }
      
      return parseList(")");
    } else if (token === "[") {
      // For array literals with square brackets
      const isParamList = parserContext.expectingParameterList;
      
      // Clear the expectation flag as we're now processing it
      if (parserContext.expectingParameterList) {
        parserContext.expectingParameterList = false;
      }
      
      return parseArrayLiteral("]", isParamList);
    } else if (token === "{") {
      // JSON object literal - parse as a hash-map internally
      return parseJSONObject();
    } else if (token === "#[") {
      // Set literal - parse as (set [...]) form
      return parseSetLiteral();
    } else if (token === ")" || token === "]" || token === "}" || token === "#]") {
      throw new ParseError(
        `Unexpected '${token}'`, 
        position
      );
    } else if (token === ":") {
      // Standalone colon token - used in JSON object parsing
      return { type: "symbol", name: ":" } as SymbolNode;
    } else if (token.startsWith('"')) {
      try {
        const processedString = processStringLiteral(token, position);
        return { type: "literal", value: processedString } as LiteralNode;
      } catch (error) {
        if (error instanceof ParseError) throw error;
        throw new ParseError(
          `Error processing string: ${error instanceof Error ? error.message : String(error)}`, 
          position
        );
      }
    } else if (token === "true") {
      return { type: "literal", value: true } as LiteralNode;
    } else if (token === "false") {
      return { type: "literal", value: false } as LiteralNode;
    } else if (token === "null" || token === "nil") {
      return { type: "literal", value: null } as LiteralNode;
    } else if (!isNaN(Number(token))) {
      return { type: "literal", value: Number(token) } as LiteralNode;
    } else {
      return { type: "symbol", name: token } as SymbolNode;
    }
  }
  
  /**
   * Parse a standard list with a given closing delimiter
   */
  function parseList(closingDelimiter: string): ListNode {
    // Save the current function definition context
    const wasInFunctionDefinition = parserContext.inFunctionDefinition;
    const oldFunctionForm = parserContext.currentFunctionForm;
    
    const elements: HQLNode[] = [];
    const startPos = pos - 1; // Position of the opening delimiter
    
    // Process the elements of the list
    while (pos < tokens.length && tokens[pos] !== closingDelimiter) {
      elements.push(parseExpression());
    }
    
    if (pos >= tokens.length) {
      throw new ParseError(
        closingDelimiter === ")" ? 
          `Unclosed parenthesis starting at line ${positions[startPos].line}, column ${positions[startPos].column}` : 
          `Unclosed ${closingDelimiter} delimiter starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    
    pos++; // skip the closing delimiter
    
    // Reset the function definition context on exiting the list
    if (wasInFunctionDefinition && parserContext.currentFunctionForm === oldFunctionForm) {
      parserContext.inFunctionDefinition = false;
      parserContext.currentFunctionForm = null;
      parserContext.expectingParameterList = false;
    }
    
    return { type: "list", elements } as ListNode;
  }
  
/**
 * Parse an array literal (square brackets) with context awareness for parameter lists
 */
function parseArrayLiteral(closingDelimiter: string, isParameterList: boolean = false): ListNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening delimiter
  
  while (pos < tokens.length && tokens[pos] !== closingDelimiter) {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      closingDelimiter === "]" ? 
        `Unclosed square bracket starting at line ${positions[startPos].line}, column ${positions[startPos].column}` : 
        `Unclosed ${closingDelimiter} delimiter starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
      positions[startPos]
    );
  }
  
  pos++; // skip the closing delimiter
  
  // For backward compatibility:
  // - Parameter lists (in function definitions) should NOT have isArrayLiteral flag
  // - Regular array literals should have the isArrayLiteral flag
  const result: ListNode = { 
    type: "list", 
    elements: elements 
  };
  
  if (!isParameterList) {
    result.isArrayLiteral = true;
  }
  
  return result;
}
  
  /**
   * Parse a JSON object into (hash-map ...) form
   */
  function parseJSONObject(): ListNode {
    // Start with the hash-map symbol
    const elements: HQLNode[] = [
      { type: "symbol", name: "hash-map" } as SymbolNode
    ];
    
    const startPos = pos - 1; // Position of the opening brace
    
    while (pos < tokens.length && tokens[pos] !== "}") {
      // Parse the key (might be a string literal or other expression)
      const key = parseExpression();
      
      // For JSON object literals with colons, expect and skip the colon
      if (pos < tokens.length && tokens[pos] === ":") {
        pos++; // Skip the colon token
      } else {
        throw new ParseError(
          "Missing colon after property name in object literal", 
          pos > 0 ? positions[pos - 1] : positions[0]
        );
      }
      
      // Parse the value
      if (pos >= tokens.length) {
        throw new ParseError(
          `Unexpected end of input in object literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
          positions[startPos]
        );
      }
      const value = parseExpression();
      
      // Add key-value pair to the elements
      elements.push(key);
      elements.push(value);
    }
    
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unclosed curly brace starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    
    pos++; // skip the closing brace
    
    return { type: "list", elements } as ListNode;
  }
  
  /**
   * Parse a set literal (#[...]) into (set [...]) form
   */
  function parseSetLiteral(): ListNode {
    // Parse the inner vector
    const vectorElements: HQLNode[] = [];
    const startPos = pos - 1; // Position of the opening #[
    
    while (pos < tokens.length && tokens[pos] !== "]") {
      vectorElements.push(parseExpression());
    }
    
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unclosed set literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    
    pos++; // Skip the closing bracket
    
    // Create a vector for the elements and mark it as an array literal
    const vectorNode: ListNode = {
      type: "list",
      elements: vectorElements,
      isArrayLiteral: true
    };
    
    // Return (set vectorNode)
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "set" } as SymbolNode,
        vectorNode
      ]
    } as ListNode;
  }
  
  // Parse all top-level expressions
  const nodes = [];
  while (pos < tokens.length) {
    nodes.push(parseExpression());
  }
  
  // Reset global variables to avoid memory leaks
  tokens = [];
  positions = [];
  pos = 0;
  
  return nodes;
}