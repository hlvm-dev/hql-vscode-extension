import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Connection
  } from 'vscode-languageserver';
  
  import { parse, ParseError } from '../../parser';
  import { SymbolManager } from '../symbolManager';
  import { SyntaxValidator } from './syntaxValidator';
  import { TypeValidator } from './typeValidator';
  import { ReservedKeywordsValidator } from './reservedKeywordsValidator';
  import { isList, isSymbol } from '../../s-exp/types';
  
  /**
   * ValidatorManager - Central manager for all validation functionality
   */
  export class ValidatorManager {
    private symbolManager: SymbolManager;
    private syntaxValidator: SyntaxValidator;
    private typeValidator: TypeValidator;
    private reservedKeywordsValidator: ReservedKeywordsValidator;
    
    constructor(symbolManager: SymbolManager) {
      this.symbolManager = symbolManager;
      this.syntaxValidator = new SyntaxValidator();
      this.typeValidator = new TypeValidator(symbolManager);
      this.reservedKeywordsValidator = new ReservedKeywordsValidator();
    }
    
    /**
     * Validate a text document and send diagnostics
     */
    public async validateTextDocument(
      textDocument: TextDocument, 
      connection: Connection,
      thorough: boolean = false
    ): Promise<void> {
      try {
        const text = textDocument.getText();
        const diagnostics: Diagnostic[] = [];
        
        try {
          // Try to parse the document with tolerant mode first to avoid unnecessary
          // diagnostic errors during typing
          const expressions = parse(text, true);
          
          // 1. First check for reserved keywords - high priority
          this.reservedKeywordsValidator.validateReservedKeywords(textDocument, expressions, diagnostics);
          
          // Send diagnostics immediately for reserved keywords
          connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [...diagnostics] });
          
          // 2. Check syntax errors
          if (thorough) {
            try {
              // Parse with strict mode to find actual errors
              parse(text, false);
            } catch (error) {
              if (error instanceof ParseError) {
                // Add diagnostic for parse error
                diagnostics.push({
                  severity: DiagnosticSeverity.Error,
                  range: {
                    start: { line: error.position.line, character: error.position.column },
                    end: { line: error.position.line, character: error.position.column + 1 }
                  },
                  message: error.message,
                  source: 'hql'
                });
              }
            }
          }
          
          // 3. Validate specific syntax constructs
          this.validateSyntaxForExpressions(textDocument, expressions, diagnostics);
          
          // 4. Check for unbalanced parentheses
          this.checkUnbalancedDelimiters(text, diagnostics);
          
          // 5. Check for undefined symbols
          await this.checkUndefinedSymbols(textDocument, expressions, diagnostics);
          
          // 6. Check for type errors (if enabled)
          if (thorough) {
            this.validateTypesForExpressions(textDocument, expressions, diagnostics);
          }
          
          // Send final diagnostics including all checks
          connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        } catch (error) {
          // If tolerant parsing also fails, the code is very broken, so just report the error
          if (error instanceof ParseError) {
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: { line: error.position.line, character: error.position.column },
                end: { line: error.position.line, character: error.position.column + 1 }
              },
              message: error.message,
              source: 'hql'
            });
            connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
          } else {
            console.error(`Unhandled error in validation: ${error}`);
          }
        }
      } catch (error) {
        console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    /**
     * Validate syntax for all expressions
     */
    private validateSyntaxForExpressions(
      document: TextDocument,
      expressions: any[],
      diagnostics: Diagnostic[]
    ): void {
      for (const expr of expressions) {
        // Only process lists
        if (!isList(expr)) continue;
        
        // Check for specific forms that need validation
        if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
          const formName = expr.elements[0].name;
          
          switch (formName) {
            case 'fn':
            case 'fx':
              this.syntaxValidator.validateFunction(document, expr, diagnostics);
              break;
              
            case 'class':
            case 'struct':
              this.syntaxValidator.validateClass(document, expr, diagnostics);
              break;
              
            case 'enum':
              this.syntaxValidator.validateEnum(document, expr, diagnostics);
              break;
              
            case 'import':
              this.syntaxValidator.validateImport(document, expr, diagnostics);
              break;
              
            case 'export':
              this.syntaxValidator.validateExport(document, expr, diagnostics);
              break;
              
            // Add more form validations as needed
          }
        }
        
        // Recursively validate nested lists
        for (const elem of expr.elements) {
          if (isList(elem)) {
            this.validateSyntaxForExpressions(document, [elem], diagnostics);
          }
        }
      }
    }
    
    /**
     * Validate types for expressions
     */
    private validateTypesForExpressions(
      document: TextDocument,
      expressions: any[],
      diagnostics: Diagnostic[]
    ): void {
      for (const expr of expressions) {
        // Only process lists
        if (!isList(expr)) continue;
        
        // Validate function calls
        if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
          this.typeValidator.validateFunctionCall(document, expr, diagnostics);
        }
        
        // Recursively validate nested lists
        for (const elem of expr.elements) {
          if (isList(elem)) {
            this.validateTypesForExpressions(document, [elem], diagnostics);
          }
        }
      }
    }
    
    /**
     * Check for unbalanced delimiters
     */
    private checkUnbalancedDelimiters(text: string, diagnostics: Diagnostic[]): void {
      // Create a stack to check for balanced delimiters
      const stack: { char: string, line: number, col: number }[] = [];
      const lines = text.split('\n');
      
      // Go through the text character by character
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let inString = false;
        let inComment = false;
        
        for (let colNum = 0; colNum < line.length; colNum++) {
          const char = line[colNum];
          
          // Skip string contents
          if (char === '"' && !inComment) {
            inString = !inString;
            continue;
          }
          
          // Skip comments
          if (char === ';' && !inString) {
            inComment = true;
            continue;
          }
          
          // Skip if inside string or comment
          if (inString || inComment) continue;
          
          // Process delimiters
          if ('([{'.includes(char)) {
            stack.push({ char, line: lineNum, col: colNum });
          } else if (')]}'.includes(char)) {
            const matchingOpen = char === ')' ? '(' : (char === ']' ? '[' : '{');
            
            if (stack.length === 0 || stack[stack.length - 1].char !== matchingOpen) {
              // Unmatched closing delimiter
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                  start: { line: lineNum, character: colNum },
                  end: { line: lineNum, character: colNum + 1 }
                },
                message: `Unmatched closing delimiter '${char}'`,
                source: 'hql'
              });
            } else {
              // Matching pair found, pop from stack
              stack.pop();
            }
          }
        }
      }
      
      // Any remaining items in the stack are unmatched opening delimiters
      for (const item of stack) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: item.line, character: item.col },
            end: { line: item.line, character: item.col + 1 }
          },
          message: `Unmatched opening delimiter '${item.char}'`,
          source: 'hql'
        });
      }
    }
    
    /**
     * Check for undefined symbols
     */
    private async checkUndefinedSymbols(
      document: TextDocument,
      expressions: any[],
      diagnostics: Diagnostic[]
    ): Promise<void> {
      // Get all defined symbols in the document
      const documentSymbols = this.symbolManager.getDocumentSymbols(document.uri);
      const definedSymbols = new Set<string>(
        documentSymbols.map(s => s.name)
      );
      
      // Add built-in symbols
      const builtIns = this.getBuiltInSymbols();
      builtIns.forEach(s => definedSymbols.add(s));
      
      // Collect all used symbols
      const usedSymbols = new Set<string>();
      const symbolOffsets = new Map<string, number[]>();
      
      this.collectSymbolUsages(expressions, usedSymbols, symbolOffsets, document);
      
      // Check for undefined symbols
      for (const symbol of usedSymbols) {
        // Skip JS globals
        if (this.isJsGlobal(symbol)) {
          continue;
        }
        
        if (!definedSymbols.has(symbol)) {
          // This symbol is used but not defined
          const offsets = symbolOffsets.get(symbol) || [];
          for (const offset of offsets) {
            // Find line and character for the offset
            const position = document.positionAt(offset);
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: {
                start: position,
                end: { line: position.line, character: position.character + symbol.length }
              },
              message: `Symbol '${symbol}' is used but not defined`,
              source: 'hql'
            });
          }
        }
      }
    }
    
    /**
     * Collect all symbol usages in expressions
     */
    private collectSymbolUsages(
      expressions: any[],
      usedSymbols: Set<string>,
      symbolOffsets: Map<string, number[]>,
      document: TextDocument
    ): void {
      const collectSymbolsInExpr = (expr: any) => {
        if (isSymbol(expr)) {
          const name = expr.name;
          if (!name.startsWith(':')) { // Skip keywords
            usedSymbols.add(name);
            
            // Record offset if position is available
            if (expr.position) {
              const offset = document.offsetAt({
                line: expr.position.line - 1,
                character: expr.position.column - 1
              });
              
              if (!symbolOffsets.has(name)) {
                symbolOffsets.set(name, []);
              }
              symbolOffsets.get(name)?.push(offset);
            }
          }
        } else if (isList(expr)) {
          // Process list elements
          for (const elem of expr.elements) {
            collectSymbolsInExpr(elem);
          }
        }
      };
      
      // Process all expressions
      for (const expr of expressions) {
        collectSymbolsInExpr(expr);
      }
    }
    
    /**
     * Get all built-in symbols for HQL
     */
    private getBuiltInSymbols(): string[] {
      return [
        // Control flow
        'if', 'do', 'when', 'unless', 'cond', 'loop', 'recur', 'while', 'for',
        
        // Definitions
        'fn', 'fx', 'let', 'var', 'class', 'struct', 'enum', 'import', 'export',
        'macro', 'defmacro',
        
        // Core functions
        'list', 'vector', 'hash-map', 'hash-set', 'str', 'print', 'println',
        'pr', 'prn', 'cons', 'first', 'rest', 'nth', 'get', 'assoc', 'dissoc',
        'count', 'empty?', 'map', 'filter', 'reduce', 'apply', 'concat',
        
        // Math
        '+', '-', '*', '/', 'rem', 'mod', 'inc', 'dec', 'min', 'max',
        'abs', 'rand', 'rand-int', 'quot',
        
        // Comparison
        '=', '<', '>', '<=', '>=', 'not=', 'and', 'or', 'not',
        
        // Type conversions/checks
        'int', 'float', 'str', 'keyword', 'symbol', 'vector', 'list?',
        'vector?', 'map?', 'set?', 'nil?', 'true?', 'false?', 'symbol?',
        'keyword?', 'number?', 'string?', 'fn?', 'instance?',
        
        // Others
        'throw', 'try', 'catch', 'finally', 'new', 'into', 'this', 'super',
        'return'
      ];
    }
    
    /**
     * Check if a symbol is a JavaScript global
     */
    private isJsGlobal(name: string): boolean {
      const jsGlobals = [
        'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String',
        'Number', 'Boolean', 'RegExp', 'Date', 'Math', 'JSON',
        'console', 'setTimeout', 'setInterval', 'clearTimeout',
        'clearInterval', 'parseInt', 'parseFloat', 'isNaN',
        'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent',
        'decodeURIComponent', 'Error', 'Promise', 'Map', 'Set',
        'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect'
      ];
      
      return jsGlobals.includes(name);
    }
  }