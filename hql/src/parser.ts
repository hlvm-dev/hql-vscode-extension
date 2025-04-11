import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  createStringLiteral,
  createNumberLiteral,
  createBooleanLiteral,
  SExp,
  SList,
  SSymbol,
  SString,
  SNumber,
  SBoolean,
  SNil
} from "./s-exp/types";

/**
 * Represents a position in the source code
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/**
 * Parse error with source position information
 */
export class ParseError extends Error {
  public position: SourcePosition;
  public source?: string;

  constructor(
    message: string,
    position: SourcePosition,
    source?: string,
  ) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
    this.source = source;
    
    if (source) {
      // Include source context in the error message
      const lines = source.split('\n');
      const line = lines[position.line] || '';
      const pointer = ' '.repeat(position.column) + '^';
      this.message = `${message} at line ${position.line + 1}, column ${position.column + 1}\n${line}\n${pointer}`;
    }
  }
}

/**
 * Token types for the lexer
 */
enum TokenType {
  LeftParen,
  RightParen,
  LeftBracket,
  RightBracket,
  LeftBrace,
  RightBrace,
  HashLeftBracket,
  String,
  Number,
  Symbol,
  Quote,
  Backtick,
  Unquote,
  UnquoteSplicing,
  Dot,
  Colon,
  Comma,
  Comment,
  Whitespace,
}

/**
 * Represents a token in the source code
 */
interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

/**
 * Patterns for tokenizing HQL code
 */
const TOKEN_PATTERNS = {
  SPECIAL_TOKENS: /^(#\[|\(|\)|\[|\]|\{|\}|\.|\:|,|'|`|~@|~)/,
  STRING: /^"(?:\\.|[^\\"])*"/,
  COMMENT: /^(;.*|\/\/.*|\/\*[\s\S]*?\*\/)/,
  WHITESPACE: /^\s+/,
  SYMBOL: /^[^\s\(\)\[\]\{\}"'`,;]+/,
};

/**
 * Parse HQL source code into S-expressions
 * @param input The HQL source code to parse
 * @param tolerant Whether to tolerate incomplete expressions (for use in editor)
 * @returns Array of S-expressions
 */
export function parse(input: string, tolerant: boolean = false): SExp[] {
  try {
    // Tokenize the input
    const tokens = tokenize(input);
    
    // Filter out comments and whitespace
    const filteredTokens = tokens.filter(token => 
      token.type !== TokenType.Comment && 
      token.type !== TokenType.Whitespace
    );
    
    // Parse the tokens into s-expressions
    return parseTokens(filteredTokens, input, tolerant);
  } catch (e) {
    if (tolerant && e instanceof ParseError) {
      // In tolerant mode, return partial results for incomplete code
      // This helps prevent disrupting LSP features during editing
      return [];
    }
    throw e;
  }
}

/**
 * Tokenize HQL source code
 * @param input The HQL source code to tokenize
 * @returns Array of tokens
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let remaining = input, line = 1, column = 1, offset = 0;
  while (remaining.length > 0) {
    const token = matchNextToken(remaining, line, column, offset);
    if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
      // Update position but don't add comment or whitespace tokens
      const lines = token.value.split('\n');
      if (lines.length > 1) {
        line += lines.length - 1;
        column = lines[lines.length - 1].length + 1;
      } else {
        column += token.value.length;
      }
    } else {
      tokens.push(token);
      column += token.value.length;
    }
    offset += token.value.length;
    remaining = remaining.substring(token.value.length);
  }
  return tokens;
}

/**
 * Match the next token from the input
 */
function matchNextToken(input: string, line: number, column: number, offset: number): Token {
  const position: SourcePosition = { line, column, offset };
  
  // Define patterns to match
  let match;
  
  // First check for special tokens
  match = input.match(TOKEN_PATTERNS.SPECIAL_TOKENS);
  if (match) return { type: getTokenTypeForSpecial(match[0]), value: match[0], position };
  
  // Then check for strings
  match = input.match(TOKEN_PATTERNS.STRING);
  if (match) return { type: TokenType.String, value: match[0], position };
  
  // Then check for comments
  match = input.match(TOKEN_PATTERNS.COMMENT);
  if (match) return { type: TokenType.Comment, value: match[0], position };
  
  // Then check for whitespace
  match = input.match(TOKEN_PATTERNS.WHITESPACE);
  if (match) return { type: TokenType.Whitespace, value: match[0], position };
  
  // Finally check for symbols
  match = input.match(TOKEN_PATTERNS.SYMBOL);
  if (match) {
    const value = match[0];
    // If it's a number, return as number token
    if (!isNaN(Number(value)) && value.match(/^-?\d+(\.\d+)?$/)) {
      return { type: TokenType.Number, value, position };
    }
    // Otherwise return as symbol token
    return { type: TokenType.Symbol, value, position };
  }
  
  throw new ParseError(`Unexpected character: ${input[0]}`, position, input);
}

/**
 * Get the token type for a special token
 */
function getTokenTypeForSpecial(value: string): TokenType {
  switch (value) {
    case "(": return TokenType.LeftParen;
    case ")": return TokenType.RightParen;
    case "[": return TokenType.LeftBracket;
    case "]": return TokenType.RightBracket;
    case "{": return TokenType.LeftBrace;
    case "}": return TokenType.RightBrace;
    case "#[": return TokenType.HashLeftBracket;
    case ".": return TokenType.Dot;
    case ":": return TokenType.Colon;
    case ",": return TokenType.Comma;
    case "'": return TokenType.Quote;
    case "`": return TokenType.Backtick;
    case "~": return TokenType.Unquote;
    case "~@": return TokenType.UnquoteSplicing;
    default: return TokenType.Symbol;
  }
}

/**
 * Parse tokens into S-expressions
 */
function parseTokens(tokens: Token[], input: string, tolerant: boolean = false): SExp[] {
  const state: ParserState = { tokens, currentPos: 0, input, tolerant };
  const nodes: SExp[] = [];
  while (state.currentPos < state.tokens.length) {
    try {
      nodes.push(parseExpression(state));
    } catch (e) {
      if (tolerant && e instanceof ParseError) {
        // In tolerant mode, try to skip the problematic token and continue
        state.currentPos++;
        if (state.currentPos < state.tokens.length) {
          // Add a placeholder for the problematic expression
          nodes.push(createSymbol("incomplete-expression"));
        }
      } else {
        // In strict mode, propagate the error
        throw e;
      }
    }
  }
  return nodes;
}

/**
 * Parser state for tracking current position
 */
interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
  tolerant?: boolean;
}

/**
 * Parse a single expression
 */
function parseExpression(state: ParserState): SExp {
  if (state.currentPos >= state.tokens.length) {
    const lastPos = state.tokens.length > 0
      ? state.tokens[state.tokens.length - 1].position
      : { line: 1, column: 1, offset: 0 };
    throw new ParseError("Unexpected end of input", lastPos, state.input);
  }
  const token = state.tokens[state.currentPos++];
  return parseExpressionByTokenType(token, state);
}

/**
 * Parse an expression based on its token type
 */
function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
  switch (token.type) {
    case TokenType.LeftParen: return parseList(state);
    case TokenType.RightParen: throw new ParseError("Unexpected ')'", token.position, state.input);
    case TokenType.LeftBracket: return parseVector(state);
    case TokenType.RightBracket: throw new ParseError("Unexpected ']'", token.position, state.input);
    case TokenType.LeftBrace: return parseMap(state);
    case TokenType.RightBrace: throw new ParseError("Unexpected '}'", token.position, state.input);
    case TokenType.HashLeftBracket: return parseSet(state);
    case TokenType.Quote: return createList(createSymbol("quote", token.position), parseExpression(state));
    case TokenType.Backtick: return createList(createSymbol("quasiquote", token.position), parseExpression(state));
    case TokenType.Unquote: return createList(createSymbol("unquote", token.position), parseExpression(state));
    case TokenType.UnquoteSplicing: return createList(createSymbol("unquote-splicing", token.position), parseExpression(state));
    case TokenType.Comma: return createSymbol(",", token.position);
    case TokenType.Dot: return parseDotAccess(state, token);
    case TokenType.String: return parseStringLiteral(token.value);
    case TokenType.Number: return createNumberLiteral(Number(token.value));
    case TokenType.Symbol: return parseSymbol(token.value, token);
    default: throw new ParseError(`Unexpected token type: ${token.type}`, token.position, state.input);
  }
}

/**
 * Parse a dot access expression (.method or object.method)
 */
function parseDotAccess(state: ParserState, dotToken: Token): SExp {
  if (state.currentPos < state.tokens.length) {
    const nextToken = state.tokens[state.currentPos++];
    return createSymbol("." + nextToken.value);
  }
  throw new ParseError("Expected property name after '.'", dotToken.position, state.input);
}

/**
 * Parse a string literal, handling escapes
 */
function parseStringLiteral(tokenValue: string): SExp {
  const str = tokenValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return createStringLiteral(str);
}

/**
 * Parse a symbol, handling special cases like true, false, nil
 */
function parseSymbol(tokenValue: string, token: Token): SExp {
  // Always include position information for all symbols
  const position = token.position;
  
  if (tokenValue === "true") return createBooleanLiteral(true);
  if (tokenValue === "false") return createBooleanLiteral(false);
  if (tokenValue === "nil") return createNilLiteral();
  if (tokenValue.startsWith(".")) return createSymbol(tokenValue, position);
  if (tokenValue.includes(".") && !tokenValue.startsWith(".") && !tokenValue.endsWith("."))
    return parseDotNotation(tokenValue, position);
  return createSymbol(tokenValue, position);
}

/**
 * Parse a dot notation expression (object.method)
 */
function parseDotNotation(tokenValue: string, position: SourcePosition): SExp {
  const parts = tokenValue.split(".");
  const objectName = parts[0];
  const propertyPath = parts.slice(1).join(".");
  return propertyPath.includes("-")
    ? createList(createSymbol("get", position), createSymbol(objectName, position), createLiteral(propertyPath))
    : createSymbol(tokenValue, position);
}

/**
 * Parse a list expression (...)
 */
function parseList(state: ParserState): SList {
  const listStartPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];
  
  // Check if this might be an enum declaration
  let isEnum = false;
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      state.tokens[state.currentPos].value === "enum") {
    isEnum = true;
  }

  let fnKeywordFound = false;
  let arrowFound = false;
  
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      (state.tokens[state.currentPos].value === "fn" || 
       state.tokens[state.currentPos].value === "fx")) {
    fnKeywordFound = true;
  }
  
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightParen
  ) {
    // Try to parse the next element
    try {
      // Special handling for enum syntax with separate colon
      if (isEnum && elements.length === 2 && 
          state.tokens[state.currentPos].type === TokenType.Colon) {
        
        // Skip the colon token
        state.currentPos++;
        
        // Ensure we have a type after the colon
        if (state.currentPos < state.tokens.length && 
            state.tokens[state.currentPos].type === TokenType.Symbol) {
          
          // Get the enum name (already parsed) and the type
          const enumNameSym = elements[1] as SSymbol;
          const typeName = state.tokens[state.currentPos].value;
          
          // Replace the enum name with combined enum name and type
          elements[1] = createSymbol(`${enumNameSym.name}:${typeName}`);
          
          // Skip the type token since we've incorporated it
          state.currentPos++;
        } else {
          if (state.tolerant) {
            // In tolerant mode, add a placeholder and continue
            elements.push(createSymbol("incomplete-type"));
            if (state.currentPos < state.tokens.length) {
              state.currentPos++; // Skip problematic token
            }
          } else {
            throw new ParseError(
              "Expected type name after colon in enum declaration", 
              state.tokens[state.currentPos - 1].position, 
              state.input
            );
          }
        }
      }
      // Special handling for function type expressions like (-> [String])
      else if (fnKeywordFound && 
               state.tokens[state.currentPos].type === TokenType.Symbol &&
               state.tokens[state.currentPos].value === "->") {
        
        // Mark that we found an arrow token
        arrowFound = true;
        
        // Add the arrow symbol
        elements.push(parseExpression(state));
        
        // Check if the next token is a left bracket (array type)
        if (state.currentPos < state.tokens.length && 
            state.tokens[state.currentPos].type === TokenType.LeftBracket) {
          
          // This is an array type notation - preserve it directly
          const arrayTypeStartToken = state.tokens[state.currentPos];
          state.currentPos++; // Skip the left bracket
          
          // We expect exactly one element (the type) followed by a right bracket
          if (state.currentPos >= state.tokens.length) {
            if (state.tolerant) {
              // In tolerant mode, add a placeholder for the incomplete array type
              elements.push(createList(createSymbol("incomplete-array-type")));
            } else {
              throw new ParseError(
                "Unclosed array type notation", 
                arrayTypeStartToken.position, 
                state.input
              );
            }
          } else {
            // Parse the inner type
            const innerType = parseExpression(state);
            
            // Expect a closing bracket
            if (state.currentPos >= state.tokens.length || 
                state.tokens[state.currentPos].type !== TokenType.RightBracket) {
              if (state.tolerant) {
                // In tolerant mode, add what we have so far
                elements.push(createList(innerType));
              } else {
                throw new ParseError(
                  "Missing closing bracket in array type notation", 
                  arrayTypeStartToken.position, 
                  state.input
                );
              }
            } else {
              // Skip the right bracket
              state.currentPos++;
              
              // Add the array type as a list with one element (the inner type)
              elements.push(createList(innerType));
            }
          }
        } else {
          // Regular type, just parse it normally
          elements.push(parseExpression(state));
        }
      }
      // Normal element parsing
      else {
        elements.push(parseExpression(state));
      }
    } catch (e) {
      if (state.tolerant && e instanceof ParseError) {
        // In tolerant mode, add a placeholder and try to continue
        elements.push(createSymbol("incomplete-expression"));
        state.currentPos++;
      } else {
        // In strict mode, propagate the error
        throw e;
      }
    }
  }
  
  if (state.currentPos >= state.tokens.length) {
    if (state.tolerant) {
      // In tolerant mode, return a partial list for unclosed expressions
      return createList(...elements);
    } else {
      throw new ParseError("Unclosed list", listStartPos, state.input);
    }
  }
  
  state.currentPos++;
  
  return createList(...elements);
}

/**
 * Parse a vector expression [...]
 */
function parseVector(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    try {
      elements.push(parseExpression(state));
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
        state.currentPos++;
    } catch (e) {
      if (state.tolerant && e instanceof ParseError) {
        // In tolerant mode, add a placeholder and try to continue
        elements.push(createSymbol("incomplete-expression"));
        state.currentPos++;
      } else {
        // In strict mode, propagate the error
        throw e;
      }
    }
  }
  if (state.currentPos >= state.tokens.length) {
    if (state.tolerant) {
      // In tolerant mode, return a partial vector for unclosed expressions
      return elements.length === 0
        ? createList(createSymbol("empty-array"))
        : createList(createSymbol("vector"), ...elements);
    } else {
      throw new ParseError("Unclosed vector", startPos, state.input);
    }
  }
  state.currentPos++;
  return elements.length === 0
    ? createList(createSymbol("empty-array"))
    : createList(createSymbol("vector"), ...elements);
}

/**
 * Parse a map expression {...}
 */
function parseMap(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const entries: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBrace
  ) {
    try {
      const key = parseExpression(state);
      if (
        state.currentPos >= state.tokens.length ||
        (state.tokens[state.currentPos].type !== TokenType.Colon && 
         key.type !== "string" && // Support for JSON style object literals
         !(key.type === "literal" && typeof (key as any).value === "string"))
      ) {
        if (state.tolerant) {
          // In tolerant mode, add what we have and use a placeholder
          entries.push(key, createSymbol("incomplete-value"));
          if (state.currentPos < state.tokens.length) {
            state.currentPos++; // Skip problematic token
          }
        } else {
          const errorPos = state.currentPos < state.tokens.length
            ? state.tokens[state.currentPos].position
            : startPos;
          throw new ParseError("Expected ':' in map literal", errorPos, state.input);
        }
      } else {
        if (state.tokens[state.currentPos].type === TokenType.Colon) {
          state.currentPos++; // Skip colon
        }
        const value = parseExpression(state);
        entries.push(key, value);
        if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
          state.currentPos++;
      }
    } catch (e) {
      if (state.tolerant && e instanceof ParseError) {
        // In tolerant mode, add a placeholder and try to continue
        if (entries.length % 2 === 0) {
          // Need a key
          entries.push(createSymbol("incomplete-key"), createSymbol("incomplete-value"));
        } else {
          // Need a value for the last key
          entries.push(createSymbol("incomplete-value"));
        }
        state.currentPos++;
      } else {
        // In strict mode, propagate the error
        throw e;
      }
    }
  }
  if (state.currentPos >= state.tokens.length) {
    if (state.tolerant) {
      // In tolerant mode, return a partial map for unclosed expressions
      return entries.length === 0
        ? createList(createSymbol("empty-map"))
        : createList(createSymbol("hash-map"), ...entries);
    } else {
      throw new ParseError("Unclosed map", startPos, state.input);
    }
  }
  state.currentPos++;
  return entries.length === 0
    ? createList(createSymbol("empty-map"))
    : createList(createSymbol("hash-map"), ...entries);
}

/**
 * Parse a set expression #[...]
 */
function parseSet(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    try {
      elements.push(parseExpression(state));
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
        state.currentPos++;
    } catch (e) {
      if (state.tolerant && e instanceof ParseError) {
        // In tolerant mode, add a placeholder and try to continue
        elements.push(createSymbol("incomplete-expression"));
        state.currentPos++;
      } else {
        // In strict mode, propagate the error
        throw e;
      }
    }
  }
  if (state.currentPos >= state.tokens.length) {
    if (state.tolerant) {
      // In tolerant mode, return a partial set for unclosed expressions
      return elements.length === 0
        ? createList(createSymbol("empty-set"))
        : createList(createSymbol("hash-set"), ...elements);
    } else {
      throw new ParseError("Unclosed set", startPos, state.input);
    }
  }
  state.currentPos++;
  return elements.length === 0
    ? createList(createSymbol("empty-set"))
    : createList(createSymbol("hash-set"), ...elements);
}

// Export all the S-expression types for other modules to use
export {
  SExp,
  SList,
  SSymbol,
  SString,
  SNumber,
  SBoolean,
  SNil,
} from "./s-exp/types";