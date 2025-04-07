import {
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  Connection
} from 'vscode-languageserver';

import { parse, ParseError } from '../parser';
import { SymbolManager } from './symbolManager';
import { isList, isSymbol } from '../s-exp/types';

/**
 * DiagnosticsProvider handles validation and errors in HQL files
 */
export class DiagnosticsProvider {
  private symbolManager: SymbolManager;
  
  constructor(symbolManager: SymbolManager) {
    this.symbolManager = symbolManager;
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
        
        // Only perform stricter validation if tolerant parsing succeeded
        // or if thorough validation is requested (e.g., on save)
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
        
        // Add additional syntax validation
        this.validateSyntax(textDocument, expressions, diagnostics);
        
        // Check for unbalanced parentheses
        this.checkUnbalancedDelimiters(text, diagnostics);
        
        // Check for undefined symbols
        await this.checkUndefinedSymbols(textDocument, expressions, diagnostics);
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
        } else {
          console.error(`Unhandled error in validation: ${error}`);
        }
      }
      
      // Send the diagnostics to the client
      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    } catch (error) {
      console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check for unbalanced parentheses and other delimiters
   */
  private checkUnbalancedDelimiters(text: string, diagnostics: Diagnostic[]): void {
    const openCount = (text.match(/\(/g) || []).length;
    const closeCount = (text.match(/\)/g) || []).length;
    
    if (openCount !== closeCount) {
      // Add diagnostic for unbalanced parentheses
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 }
        },
        message: `Unbalanced parentheses: ${openCount} opening vs ${closeCount} closing`,
        source: 'hql'
      });
    }
    
    // Also check brackets and braces
    const bracketOpenCount = (text.match(/\[/g) || []).length;
    const bracketCloseCount = (text.match(/\]/g) || []).length;
    
    if (bracketOpenCount !== bracketCloseCount) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 }
        },
        message: `Unbalanced brackets: ${bracketOpenCount} opening vs ${bracketCloseCount} closing`,
        source: 'hql'
      });
    }
    
    const braceOpenCount = (text.match(/\{/g) || []).length;
    const braceCloseCount = (text.match(/\}/g) || []).length;
    
    if (braceOpenCount !== braceCloseCount) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 }
        },
        message: `Unbalanced braces: ${braceOpenCount} opening vs ${braceCloseCount} closing`,
        source: 'hql'
      });
    }
  }
  
  /**
   * Validate syntax rules specific to HQL
   */
  private validateSyntax(
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
            this.validateFunctionSyntax(document, expr, diagnostics);
            break;
            
          case 'class':
          case 'struct':
            this.validateClassSyntax(document, expr, diagnostics);
            break;
            
          case 'enum':
            this.validateEnumSyntax(document, expr, diagnostics);
            break;
            
          case 'import':
            this.validateImportSyntax(document, expr, diagnostics);
            break;
            
          case 'export':
            this.validateExportSyntax(document, expr, diagnostics);
            break;
            
          // Add more form validations as needed
        }
      }
      
      // Recursively validate nested lists
      for (const elem of expr.elements) {
        if (isList(elem)) {
          this.validateSyntax(document, [elem], diagnostics);
        }
      }
    }
  }
  
  /**
   * Validate function syntax
   */
  private validateFunctionSyntax(
    document: TextDocument,
    expr: any,
    diagnostics: Diagnostic[]
  ): void {
    const isPure = expr.elements[0].name === 'fx';
    
    // Check for function name
    if (expr.elements.length < 2) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Function is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Function name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check for parameter list
    if (expr.elements.length < 3) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Function is missing parameter list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isList(expr.elements[2])) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Function parameter list must be a list`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // For fx functions, validate return type
    if (isPure) {
      // Check for return type
      if (expr.elements.length < 4) {
        this.addRangeDiagnostic(
          document,
          expr,
          `Pure function (fx) requires a return type with (-> Type) syntax`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        return;
      }
      
      if (!isList(expr.elements[3]) || 
          expr.elements[3].elements.length < 2 ||
          !isSymbol(expr.elements[3].elements[0]) ||
          expr.elements[3].elements[0].name !== "->") {
        
        this.addRangeDiagnostic(
          document,
          expr,
          `Pure function (fx) requires a return type with (-> Type) syntax`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        return;
      }
    }
    
    // Check if function has a body
    if ((isPure && expr.elements.length < 5) || (!isPure && expr.elements.length < 4)) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Function is missing a body`,
        DiagnosticSeverity.Error,
        diagnostics
      );
    }
  }
  
  /**
   * Validate class/struct syntax
   */
  private validateClassSyntax(
    document: TextDocument,
    expr: any,
    diagnostics: Diagnostic[]
  ): void {
    // Check for class name
    if (expr.elements.length < 2) {
      this.addRangeDiagnostic(
        document,
        expr,
        `${expr.elements[0].name} is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addRangeDiagnostic(
        document,
        expr,
        `${expr.elements[0].name} name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check class name starts with uppercase
    const className = expr.elements[1].name;
    if (!/^[A-Z]/.test(className)) {
      this.addRangeDiagnostic(
        document,
        expr,
        `${expr.elements[0].name} name should start with an uppercase letter`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
    
    // Check for at least one member
    if (expr.elements.length < 3) {
      this.addRangeDiagnostic(
        document,
        expr,
        `${expr.elements[0].name} should have at least one member`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
  }
  
  /**
   * Validate enum syntax
   */
  private validateEnumSyntax(
    document: TextDocument,
    expr: any,
    diagnostics: Diagnostic[]
  ): void {
    // Check for enum name
    if (expr.elements.length < 2) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Enum is missing a name`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    if (!isSymbol(expr.elements[1])) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Enum name must be a symbol`,
        DiagnosticSeverity.Error,
        diagnostics
      );
      return;
    }
    
    // Check enum name starts with uppercase
    const enumName = expr.elements[1].name;
    if (!/^[A-Z]/.test(enumName)) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Enum name should start with an uppercase letter`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
    }
    
    // Skip type annotation if present
    let caseStartIndex = 2;
    if (expr.elements.length > 2 && 
        isSymbol(expr.elements[2]) && 
        expr.elements[2].name === ':') {
      caseStartIndex = 4; // Skip enum, name, :, type
    }
    
    // Check for at least one case
    if (expr.elements.length <= caseStartIndex) {
      this.addRangeDiagnostic(
        document,
        expr,
        `Enum should have at least one case`,
        DiagnosticSeverity.Warning,
        diagnostics
      );
      return;
    }
    
    // Validate each case
    for (let i = caseStartIndex; i < expr.elements.length; i++) {
      const caseExpr = expr.elements[i];
      if (!isList(caseExpr)) {
        this.addRangeDiagnostic(
          document,
          caseExpr,
          `Enum case must be a list`,
          DiagnosticSeverity.Error,
          diagnostics
        );
        continue;
      }
      
      if (caseExpr.elements.length < 2 || 
          !isSymbol(caseExpr.elements[0]) || 
          caseExpr.elements[0].name !== 'case' ||
          !isSymbol(caseExpr.elements[1])) {
        
        this.addRangeDiagnostic(
          document,
          caseExpr,
          `Enum case must have the form (case Name)`,
          DiagnosticSeverity.Error,
          diagnostics
        );
      }
    }
  }
  
  /**
   * Validate import syntax
   */
  private validateImportSyntax(
    document: TextDocument,
    expr: any,
    diagnostics: Diagnostic[]
  ): void {
    // Check for vector-style import: (import [sym1, sym2] from "module")
    if (expr.elements.length >= 4 && 
        isList(expr.elements[1]) && 
        isSymbol(expr.elements[2]) && 
        expr.elements[2].name === 'from') {
      
      // This is a vector-style import, looks good
      return;
    }
    
    // Check for namespace-style import: (import name from "module")
    if (expr.elements.length >= 4 && 
        isSymbol(expr.elements[1]) && 
        isSymbol(expr.elements[2]) && 
        expr.elements[2].name === 'from') {
      
      // This is a namespace-style import, looks good
      return;
    }
    
    // If we got here, the import syntax is invalid
    this.addRangeDiagnostic(
      document,
      expr,
      `Import must be either (import [symbols] from "module") or (import name from "module")`,
      DiagnosticSeverity.Error,
      diagnostics
    );
  }
  
  /**
   * Validate export syntax
   */
  private validateExportSyntax(
    document: TextDocument,
    expr: any,
    diagnostics: Diagnostic[]
  ): void {
    // Check for vector-style export: (export [sym1, sym2])
    if (expr.elements.length >= 2 && isList(expr.elements[1])) {
      // This is a vector-style export, looks good
      return;
    }
    
    // Check for string-symbol export: (export "name" symbol)
    if (expr.elements.length >= 3 && 
        (expr.elements[1].type === "string" || 
         (expr.elements[1].type === "literal" && typeof expr.elements[1].value === "string")) && 
        isSymbol(expr.elements[2])) {
      
      // This is a string-symbol export, looks good
      return;
    }
    
    // If we got here, the export syntax is invalid
    this.addRangeDiagnostic(
      document,
      expr,
      `Export must be either (export [symbols]) or (export "name" symbol)`,
      DiagnosticSeverity.Error,
      diagnostics
    );
  }
  
  /**
   * Add a diagnostic for an expression's range
   */
  private addRangeDiagnostic(
    document: TextDocument,
    expr: any,
    message: string,
    severity: DiagnosticSeverity,
    diagnostics: Diagnostic[]
  ): void {
    // If the expression has a range property, use it
    if (expr.range) {
      diagnostics.push({
        severity,
        range: expr.range,
        message,
        source: 'hql'
      });
      return;
    }
    
    // Otherwise, estimate the range from the document text
    // This is a simplified approach - for production code, you'd want to
    // enhance this to get more accurate positions
    const text = document.getText();
    const exprText = JSON.stringify(expr);
    const index = text.indexOf(exprText);
    
    if (index >= 0) {
      const start = document.positionAt(index);
      const end = document.positionAt(index + exprText.length);
      
      diagnostics.push({
        severity,
        range: { start, end },
        message,
        source: 'hql'
      });
    } else {
      // Fallback: Just use the first character position
      const start = document.positionAt(0);
      const end = document.positionAt(1);
      
      diagnostics.push({
        severity,
        range: { start, end },
        message: `${message} (position unknown)`,
        source: 'hql'
      });
    }
  }
  
  /**
   * Check for undefined symbols in the document
   */
  private async checkUndefinedSymbols(
    document: TextDocument,
    expressions: any[],
    diagnostics: Diagnostic[]
  ): Promise<void> {
    // Collect all defined symbols in the document
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const definedSymbols = new Set<string>();
    
    for (const symbol of symbols) {
      definedSymbols.add(symbol.name);
    }
    
    // Also add predefined HQL symbols
    for (const builtIn of this.getBuiltInSymbols()) {
      definedSymbols.add(builtIn);
    }
    
    // Collect used symbols in the document
    const usedSymbols = new Set<string>();
    const symbolOffsets = new Map<string, number[]>();
    
    this.collectSymbolUsages(expressions, usedSymbols, symbolOffsets, document);
    
    // Check for undefined symbols
    for (const symbol of usedSymbols) {
      // Skip if it's defined
      if (definedSymbols.has(symbol)) {
        continue;
      }
      
      // Get positions where this symbol is used
      const positions = symbolOffsets.get(symbol) || [];
      
      for (const pos of positions) {
        try {
          const location = document.positionAt(pos);
          
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: location,
              end: { line: location.line, character: location.character + symbol.length }
            },
            message: `Undefined symbol: ${symbol}`,
            source: 'hql'
          });
        } catch (error) {
          console.error(`Error adding diagnostic for undefined symbol: ${error}`);
        }
      }
    }
  }
  
  private collectSymbolUsages(
    expressions: any[],
    usedSymbols: Set<string>,
    symbolOffsets: Map<string, number[]>,
    document: TextDocument
  ): void {
    for (const expr of expressions) {
      if (isSymbol(expr)) {
        const symbolName = expr.name;
        
        // Skip special forms and keywords
        if (!this.getBuiltInSymbols().includes(symbolName)) {
          usedSymbols.add(symbolName);
          
          // Since position information might not be available in the expression,
          // we'll use the document text to find symbol occurrences
          if (document) {
            try {
              const text = document.getText();
              // Use a regex to find occurrences of the symbol
              // Use word boundaries to find whole words only
              const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
              let match;
              
              while ((match = regex.exec(text)) !== null) {
                const offset = match.index;
                
                if (!symbolOffsets.has(symbolName)) {
                  symbolOffsets.set(symbolName, []);
                }
                
                symbolOffsets.get(symbolName)?.push(offset);
              }
            } catch (error) {
              // Ignore position errors
            }
          }
        }
      } else if (isList(expr)) {
        // Process nested expressions
        this.collectSymbolUsages(expr.elements, usedSymbols, symbolOffsets, document);
      }
    }
  }
  
  private getBuiltInSymbols(): string[] {
    return [
      // Control structures
      'fn', 'fx', 'let', 'var', 'if', 'cond', 'when', 'unless',
      'do', 'loop', 'recur', 'for', 'while',
      
      // Data types and definitions
      'enum', 'case', 'class', 'struct', 'constructor', 'method', 'field',
      'import', 'export', 'as', 'from',
      
      // Special forms
      'quote', 'quasiquote', 'unquote', 'return', 'macro', 'defmacro',
      
      // Literals and constants
      'true', 'false', 'nil',
      
      // Operators
      '+', '-', '*', '/', '=', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not',
      
      // JavaScript interop
      'js-call', 'js-get', 'js-set',
      
      // IO and debugging
      'print', 'println'
    ];
  }
}