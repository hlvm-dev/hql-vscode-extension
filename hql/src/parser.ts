// src/transpiler/pipeline/parser.ts - Clean implementation focused on chain method invocation

import {
    createList,
    createLiteral,
    createNilLiteral,
    createSymbol,
    SExp,
    SList,
    SSymbol
  } from "./s-exp/types";
  import { ParseError } from "./error/errors";
  
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
  
  interface Token {
    type: TokenType;
    value: string;
    position: SourcePosition;
  }
  
  interface SourcePosition {
    line: number;
    column: number;
    offset: number;
  }
  
  const TOKEN_PATTERNS = {
    SPECIAL_TOKENS: /^(#\[|\(|\)|\[|\]|\{|\}|\.|\:|,|'|`|~@|~)/,
    STRING: /^"(?:\\.|[^\\"])*"/,
    COMMENT: /^(;.*|\/\/.*|\/\*[\s\S]*?\*\/)/,
    WHITESPACE: /^\s+/,
    SYMBOL: /^[^\s\(\)\[\]\{\}"'`,;]+/,
  };
  
  export function parse(input: string): SExp[] {
    const tokens = tokenize(input);
    return parseTokens(tokens, input);
  }
  
  function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let remaining = input, line = 1, column = 1, offset = 0;
    while (remaining.length > 0) {
      const token = matchNextToken(remaining, line, column, offset);
      if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
        updatePositionInfo(token.value, token.position);
      } else {
        tokens.push(token);
      }
      offset += token.value.length;
      remaining = remaining.substring(token.value.length);
      line = token.position.line;
      column = token.position.column + token.value.length;
    }
    return tokens;
  }
  
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
  
  function updatePositionInfo(value: string, position: SourcePosition): void {
    for (const char of value) {
      if (char === "\n") {
        position.line++;
        position.column = 1;
      } else {
        position.column++;
      }
    }
  }
  
  function parseTokens(tokens: Token[], input: string): SExp[] {
    const state: ParserState = { tokens, currentPos: 0, input };
    const nodes: SExp[] = [];
    while (state.currentPos < state.tokens.length) {
      nodes.push(parseExpression(state));
    }
    return nodes;
  }
  
  interface ParserState {
    tokens: Token[];
    currentPos: number;
    input: string;
  }
  
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
  
  function parseDotAccess(state: ParserState, dotToken: Token): SExp {
    if (state.currentPos < state.tokens.length) {
      const nextToken = state.tokens[state.currentPos++];
      return createSymbol("." + nextToken.value);
    }
    throw new ParseError("Expected property name after '.'", dotToken.position, state.input);
  }
  
  function parseStringLiteral(tokenValue: string): SExp {
    const str = tokenValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return createLiteral(str);
  }
  
  function parseSymbol(tokenValue: string): SExp {
    if (tokenValue === "true") return createLiteral(true);
    if (tokenValue === "false") return createLiteral(false);
    if (tokenValue === "nil") return createNilLiteral();
    if (tokenValue.startsWith(".")) return createSymbol(tokenValue);
    if (tokenValue.includes(".") && !tokenValue.startsWith(".") && !tokenValue.endsWith("."))
      return parseDotNotation(tokenValue);
    return createSymbol(tokenValue);
  }
  
  function parseDotNotation(tokenValue: string): SExp {
    const parts = tokenValue.split(".");
    const objectName = parts[0];
    const propertyPath = parts.slice(1).join(".");
    return propertyPath.includes("-")
      ? createList(createSymbol("get"), createSymbol(objectName), createLiteral(propertyPath))
      : createSymbol(tokenValue);
  }
  
  /**
   * Parse a list expression
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
      if (!isNaN(Number(value))) return { type: TokenType.Number, value, position };
      // Otherwise return as symbol token
      return { type: TokenType.Symbol, value, position };
    }
    
    throw new ParseError(`Unexpected character: ${input[0]}`, position, input);
  }
  
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
        state.tokens[state.currentPos].type !== TokenType.Colon
      ) {
        const errorPos = state.currentPos < state.tokens.length
          ? state.tokens[state.currentPos].position
          : startPos;
        throw new ParseError("Expected ':' in map literal", errorPos, state.input);
      }
      state.currentPos++;
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
  