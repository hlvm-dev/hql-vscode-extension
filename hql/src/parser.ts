import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  SExp,
  SList,
  SSymbol
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
    this.name = "ParseError";
    this.position = position;
    this.source = source;
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
 * @returns Array of S-expressions
 */
export function parse(input: string): SExp[] {
  const tokens = tokenize(input);
  return parseTokens(tokens, input);
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
function parseTokens(tokens: Token[], input: string): SExp[] {
  const state: ParserState = { tokens, currentPos: 0, input };
  const nodes: SExp[] = [];
  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression(state));
  }
  return nodes;
}

/**
 * Parser state interface
 */
interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
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
    case TokenType.Quote: return createList(createSymbol("quote"), parseExpression(state));
    case TokenType.Backtick: return createList(createSymbol("quasiquote"), parseExpression(state));
    case TokenType.Unquote: return createList(createSymbol("unquote"), parseExpression(state));
    case TokenType.UnquoteSplicing: return createList(createSymbol("unquote-splicing"), parseExpression(state));
    case TokenType.Comma: return createSymbol(",");
    case TokenType.Dot: return parseDotAccess(state, token);
    case TokenType.String: return parseStringLiteral(token.value);
    case TokenType.Number: return createLiteral(Number(token.value));
    case TokenType.Symbol: return parseSymbol(token.value);
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
  return createLiteral(str);
}

/**
 * Parse a symbol, handling special cases like true, false, nil
 */
function parseSymbol(tokenValue: string): SExp {
  if (tokenValue === "true") return createLiteral(true);
  if (tokenValue === "false") return createLiteral(false);
  if (tokenValue === "nil") return createNilLiteral();
  if (tokenValue.startsWith(".")) return createSymbol(tokenValue);
  if (tokenValue.includes(".") && !tokenValue.startsWith(".") && !tokenValue.endsWith("."))
    return parseDotNotation(tokenValue);
  return createSymbol(tokenValue);
}

/**
 * Parse a dot notation expression (object.method)
 */
function parseDotNotation(tokenValue: string): SExp {
  const parts = tokenValue.split(".");
  const objectName = parts[0];
  const propertyPath = parts.slice(1).join(".");
  return propertyPath.includes("-")
    ? createList(createSymbol("get"), createSymbol(objectName), createLiteral(propertyPath))
    : createSymbol(tokenValue);
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
        throw new ParseError(
          "Expected type name after colon in enum declaration", 
          state.tokens[state.currentPos - 1].position, 
          state.input
        );
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
          throw new ParseError(
            "Unclosed array type notation", 
            arrayTypeStartToken.position, 
            state.input
          );
        }
        
        // Parse the inner type
        const innerType = parseExpression(state);
        
        // Expect a closing bracket
        if (state.currentPos >= state.tokens.length || 
            state.tokens[state.currentPos].type !== TokenType.RightBracket) {
          throw new ParseError(
            "Missing closing bracket in array type notation", 
            arrayTypeStartToken.position, 
            state.input
          );
        }
        
        // Skip the right bracket
        state.currentPos++;
        
        // Add the array type as a list with one element (the inner type)
        elements.push(createList(innerType));
      } else {
        // Regular type, just parse it normally
        elements.push(parseExpression(state));
      }
    }
    // Normal element parsing
    else {
      elements.push(parseExpression(state));
    }
  }
  
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed list", listStartPos, state.input);
  
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
    elements.push(parseExpression(state));
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed vector", startPos, state.input);
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
    const key = parseExpression(state);
    if (
      state.currentPos >= state.tokens.length ||
      (state.tokens[state.currentPos].type !== TokenType.Colon && 
       key.type !== "string" && // Support for JSON style object literals
       !(key.type === "literal" && typeof (key as any).value === "string"))
    ) {
      const errorPos = state.currentPos < state.tokens.length
        ? state.tokens[state.currentPos].position
        : startPos;
      throw new ParseError("Expected ':' in map literal", errorPos, state.input);
    }
    if (state.tokens[state.currentPos].type === TokenType.Colon) {
      state.currentPos++; // Skip colon
    }
    const value = parseExpression(state);
    entries.push(key, value);
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed map", startPos, state.input);
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
    elements.push(parseExpression(state));
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed set", startPos, state.input);
  state.currentPos++;
  return elements.length === 0
    ? createList(createSymbol("empty-set"))
    : createList(createSymbol("hash-set"), ...elements);
}