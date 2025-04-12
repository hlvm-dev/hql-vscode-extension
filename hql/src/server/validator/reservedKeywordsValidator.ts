import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Position
  } from 'vscode-languageserver';
  
  import { SExp, SList, SSymbol } from '../../parser';
  import { isList, isSymbol } from '../../s-exp/types';
  
  /**
   * ReservedKeywordsValidator checks for usage of reserved keywords in invalid contexts
   */
  export class ReservedKeywordsValidator {
    // List of all reserved keywords in HQL
    private reservedKeywords: string[] = [
      'vector', 'case', 'class', 'enum', 'export', 'extends',
      'import', 'implements', 'interface', 'new', 'return', 'super',
      'this', 'throw', 'typeof', 'void', 'with', 'yield', 'async',
      'await', 'break', 'catch', 'static', 'delete', 'finally', 'in',
      'instanceof', 'package', 'private', 'protected', 'public', 'try'
    ];
    
    /**
     * Check for reserved keywords in expressions
     */
    public validateReservedKeywords(
      document: TextDocument,
      expressions: SExp[],
      diagnostics: Diagnostic[]
    ): void {
      for (const expr of expressions) {
        this.checkExpressionForReservedKeywords(document, expr, diagnostics);
      }
    }
    
    /**
     * Check a specific expression for reserved keywords
     */
    private checkExpressionForReservedKeywords(
      document: TextDocument,
      expr: SExp,
      diagnostics: Diagnostic[]
    ): void {
      if (isList(expr)) {
        const list = expr as SList;
        
        // Check if this is a definition (fn, fx, let, var, etc.)
        if (list.elements.length > 1 && 
            isSymbol(list.elements[0]) && 
            isSymbol(list.elements[1])) {
            
            const keyword = (list.elements[0] as SSymbol).name;
            const symbolName = (list.elements[1] as SSymbol).name;
            const symbolPos = (list.elements[1] as SSymbol).position;
            
            // Check for reserved keyword usage in definitions
            if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
              if (this.reservedKeywords.includes(symbolName.toLowerCase())) {
                if (symbolPos) {
                  // Convert 1-based line/column to 0-based
                  const range = Range.create(
                    Position.create(symbolPos.line - 1, symbolPos.column - 1),
                    Position.create(symbolPos.line - 1, symbolPos.column - 1 + symbolName.length)
                  );
                  
                  diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `'${symbolName}' is a reserved keyword and cannot be used as a symbol name`,
                    source: 'HQL'
                  });
                }
              }
            }
            
            // Check for function parameter names
            if (['fn', 'fx'].includes(keyword) && list.elements.length > 2 && isList(list.elements[2])) {
              const paramList = list.elements[2] as SList;
              this.checkFunctionParameters(paramList, diagnostics);
            }
        }
        
        // Check for function call arguments with named parameters
        if (list.elements.length >= 2 && isSymbol(list.elements[0])) {
          const fnName = (list.elements[0] as SSymbol).name;
          
          // Skip special forms and non-function calls
          if (!['fn', 'fx', 'let', 'var', 'import', 'export', 'enum', 'class', 'struct'].includes(fnName)) {
            // This might be a function call with named parameters
            for (let i = 1; i < list.elements.length; i++) {
              // Check for named parameters in the format: param: value
              if (isSymbol(list.elements[i])) {
                const argText = (list.elements[i] as SSymbol).name;
                const argPos = (list.elements[i] as SSymbol).position;
                
                if (argText.endsWith(':')) {
                  // Extract parameter name without the colon
                  const paramName = argText.substring(0, argText.length - 1);
                  
                  if (this.reservedKeywords.includes(paramName.toLowerCase()) && argPos) {
                    // Convert 1-based line/column to 0-based
                    const range = Range.create(
                      Position.create(argPos.line - 1, argPos.column - 1),
                      Position.create(argPos.line - 1, argPos.column - 1 + paramName.length)
                    );
                    
                    diagnostics.push({
                      severity: DiagnosticSeverity.Error,
                      range,
                      message: `'${paramName}' is a reserved keyword and cannot be used as a parameter name`,
                      source: 'HQL'
                    });
                  }
                }
              }
            }
          }
        }
  
        // Check for reserved keywords in import statements
        if (list.elements.length > 1 && 
            isSymbol(list.elements[0]) && 
            (list.elements[0] as SSymbol).name === 'import') {
            
            // Check vector-style imports: (import [sym1, sym2] from "...")
            if (isList(list.elements[1])) {
                const importList = list.elements[1] as SList;
                for (const element of importList.elements) {
                    if (isSymbol(element)) {
                        const symbolName = (element as SSymbol).name;
                        const symbolPos = (element as SSymbol).position;
                        if (this.reservedKeywords.includes(symbolName.toLowerCase())) {
                            if (symbolPos) {
                                // Convert 1-based line/column to 0-based
                                const range = Range.create(
                                    Position.create(symbolPos.line - 1, symbolPos.column - 1),
                                    Position.create(symbolPos.line - 1, symbolPos.column - 1 + symbolName.length)
                                );
                                
                                diagnostics.push({
                                    severity: DiagnosticSeverity.Error,
                                    range,
                                    message: `Cannot import reserved keyword '${symbolName}'`,
                                    source: 'HQL'
                                });
                            }
                        }
                    }
                }
            }
        }
  
        // Recursively check nested expressions
        for (const childExpr of list.elements) {
          this.checkExpressionForReservedKeywords(document, childExpr, diagnostics);
        }
      }
    }
    
    /**
     * Check for reserved keywords used as function parameters
     */
    private checkFunctionParameters(paramList: SList, diagnostics: Diagnostic[]): void {
      // Handle both simple parameter lists and parameter lists with type annotations
      for (const param of paramList.elements) {
        if (isSymbol(param)) {
          // Simple parameter: (param1 param2)
          const paramName = (param as SSymbol).name;
          const paramPos = (param as SSymbol).position;
          
          if (this.reservedKeywords.includes(paramName.toLowerCase()) && paramPos) {
            // Convert 1-based line/column to 0-based
            const range = Range.create(
              Position.create(paramPos.line - 1, paramPos.column - 1),
              Position.create(paramPos.line - 1, paramPos.column - 1 + paramName.length)
            );
            
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range,
              message: `'${paramName}' is a reserved keyword and cannot be used as a parameter name`,
              source: 'HQL'
            });
          }
        } else if (isList(param)) {
          // Parameter with type annotation: (param1: Type param2: Type)
          const paramTypePair = param as SList;
          if (paramTypePair.elements.length >= 1 && isSymbol(paramTypePair.elements[0])) {
            const paramName = (paramTypePair.elements[0] as SSymbol).name;
            const paramPos = (paramTypePair.elements[0] as SSymbol).position;
            
            if (this.reservedKeywords.includes(paramName.toLowerCase()) && paramPos) {
              // Convert 1-based line/column to 0-based
              const range = Range.create(
                Position.create(paramPos.line - 1, paramPos.column - 1),
                Position.create(paramPos.line - 1, paramPos.column - 1 + paramName.length)
              );
              
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `'${paramName}' is a reserved keyword and cannot be used as a parameter name`,
                source: 'HQL'
              });
            }
          }
        }
      }
    }
    
    /**
     * Check if a symbol is a reserved keyword
     */
    public isReservedKeyword(name: string): boolean {
      return this.reservedKeywords.includes(name.toLowerCase());
    }
    
    /**
     * Get the list of reserved keywords
     */
    public getReservedKeywords(): string[] {
      return [...this.reservedKeywords];
    }
    
    /**
     * Add a custom reserved keyword
     */
    public addReservedKeyword(keyword: string): void {
      if (!this.reservedKeywords.includes(keyword.toLowerCase())) {
        this.reservedKeywords.push(keyword.toLowerCase());
      }
    }
  }