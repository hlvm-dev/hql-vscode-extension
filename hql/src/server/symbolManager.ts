import {
    SymbolInformation,
    SymbolKind,
    TextDocument,
    Location,
    Range,
    Position
  } from 'vscode-languageserver';
  
  import { parse, SExp, SList, SSymbol } from '../parser';
  import { isList, isSymbol, isString, isNumber, isBoolean, isNil } from '../s-exp/types';
  import { createTextDocumentAdapter } from '../document-adapter';
  import { findExpressionRange } from '../helper/getExpressionRange';
  
  /**
   * Extended SymbolInformation with additional data
   */
  export interface ExtendedSymbolInformation extends SymbolInformation {
    data?: {
      documentation?: string;
      params?: { 
        name: string; 
        type: string; 
        defaultValue?: string;
      }[];
      type?: string;
      returnType?: string;
      enumName?: string;
      sourceModule?: string;
      // Add more data fields as needed
    };
  }
  
  /**
   * SymbolManager handles tracking and updating document symbols
   */
  export class SymbolManager {
    private documentSymbols: Map<string, ExtendedSymbolInformation[]> = new Map();
    private documents: Map<string, TextDocument> = new Map();
    
    constructor() {}
    
    /**
     * Get or add a document to the manager
     */
    public async getDocument(uri: string): Promise<TextDocument | undefined> {
      return this.documents.get(uri);
    }
    
    /**
     * Add or update a document in the manager
     */
    public addDocument(document: TextDocument): void {
      this.documents.set(document.uri, document);
    }
    
    /**
     * Remove a document from the manager
     */
    public removeDocument(uri: string): void {
      this.documents.delete(uri);
      this.documentSymbols.delete(uri);
    }
    
    /**
     * Get symbols for a document
     */
    public getDocumentSymbols(uri: string): ExtendedSymbolInformation[] {
      return this.documentSymbols.get(uri) || [];
    }
    
    /**
     * Get all symbols from all documents
     */
    public getAllSymbols(): Map<string, ExtendedSymbolInformation[]> {
      return this.documentSymbols;
    }
    
    /**
     * Update symbols for a document
     */
    public async updateDocumentSymbols(document: TextDocument): Promise<void> {
      try {
        const text = document.getText();
        const uri = document.uri;
        
        // Parse the document with tolerant mode enabled
        const expressions = parse(text, true);
        
        // Extract symbols from the parse tree
        const symbols: ExtendedSymbolInformation[] = [];
        
        // Process expressions to find symbol definitions
        for (let i = 0; i < expressions.length; i++) {
          const expr = expressions[i];
          if (isList(expr) && expr.elements.length > 0) {
            const first = expr.elements[0];
            if (isSymbol(first)) {
              const name = first.name;
              
              // Extract documentation comment from above the expression
              let documentation = this.extractDocumentation(document, expr, i > 0 ? expressions[i-1] : undefined);
              
              // Handle different symbol types
              this.processExpression(document, expr, symbols, documentation);
            }
          }
        }
        
        // Store symbols for this document
        this.documentSymbols.set(uri, symbols);
      } catch (error) {
        console.error(`Error updating document symbols: ${error instanceof Error ? error.message : String(error)}`);
        this.documentSymbols.set(document.uri, []);
      }
    }
    
    /**
     * Extract documentation comment from above an expression
     */
    private extractDocumentation(
      document: TextDocument,
      expr: SExp,
      prevExpr?: SExp
    ): string {
      if (!prevExpr) return "";
      
      const adaptedDoc = createTextDocumentAdapter(document);
      
      try {
        // Get the range of the current expression
        const currentRange = findExpressionRange(adaptedDoc, expr);
        
        // Get the range of the previous expression
        const previousRange = findExpressionRange(adaptedDoc, prevExpr);
        
        // Check if there's text between the previous expression and current one
        const textBetween = document.getText({
          start: previousRange.end,
          end: currentRange.start
        });
        
        // Look for comments (;; or ;) in the text between expressions
        const commentRegex = /^\s*;;(.*)$|^\s*;(.*)$/gm;
        let commentMatch;
        let commentLines = [];
        
        while ((commentMatch = commentRegex.exec(textBetween)) !== null) {
          const commentText = commentMatch[1] || commentMatch[2] || "";
          commentLines.push(commentText.trim());
        }
        
        if (commentLines.length > 0) {
          return commentLines.join("\n");
        }
      } catch (error) {
        // Ignore errors in documentation extraction
      }
      
      return "";
    }
    
    /**
     * Process an expression to extract symbols
     */
    private processExpression(
      document: TextDocument,
      expr: SExp,
      symbols: ExtendedSymbolInformation[],
      documentation: string
    ): void {
      if (!isList(expr) || expr.elements.length === 0) return;
      
      const first = expr.elements[0];
      if (!isSymbol(first)) return;
      
      const name = first.name;
      const adaptedDoc = createTextDocumentAdapter(document);
      const range = findExpressionRange(adaptedDoc, expr);
      
      switch(name) {
        case 'fn':
        case 'fx':
          this.processFunctionDefinition(document, expr as SList, symbols, range, documentation);
          break;
        
        case 'let':
        case 'var':
          this.processVariableDefinition(document, expr as SList, symbols, range, documentation);
          break;
        
        case 'class':
        case 'struct':
          this.processClassDefinition(document, expr as SList, symbols, range, documentation);
          break;
        
        case 'enum':
          this.processEnumDefinition(document, expr as SList, symbols, range, documentation);
          break;
        
        case 'defmacro':
        case 'macro':
          this.processMacroDefinition(document, expr as SList, symbols, range, documentation);
          break;
      }
    }
    
    /**
     * Process function definitions (fn, fx)
     */
    private processFunctionDefinition(
      document: TextDocument,
      expr: SList,
      symbols: ExtendedSymbolInformation[],
      range: Range,
      documentation: string
    ): void {
      if (expr.elements.length < 3) return;
      
      const funcType = (expr.elements[0] as SSymbol).name; // 'fn' or 'fx'
      
      if (!isSymbol(expr.elements[1])) return;
      
      const funcName = (expr.elements[1] as SSymbol).name;
      const location = Location.create(document.uri, range);
      
      // Extract parameter info
      let params: { name: string; type: string; defaultValue?: string }[] = [];
      let returnType = "Any";
      
      if (expr.elements.length > 2 && isList(expr.elements[2])) {
        const paramList = expr.elements[2] as SList;
        for (let j = 0; j < paramList.elements.length; j++) {
          if (isSymbol(paramList.elements[j])) {
            let paramName = (paramList.elements[j] as SSymbol).name;
            let paramType = "Any";
            let defaultValue: string | undefined = undefined;
            
            // Check for type annotation (param: Type)
            if (j + 2 < paramList.elements.length && 
                isSymbol(paramList.elements[j+1]) && 
                (paramList.elements[j+1] as SSymbol).name === ':' && 
                isSymbol(paramList.elements[j+2])) {
              paramType = (paramList.elements[j+2] as SSymbol).name;
              j += 2; // Skip the ':' and type
              
              // Check for default value (param: Type = default)
              if (j + 2 < paramList.elements.length && 
                  isSymbol(paramList.elements[j+1]) && 
                  (paramList.elements[j+1] as SSymbol).name === '=') {
                // Extract default value
                try {
                  const defaultExpr = paramList.elements[j+2];
                  defaultValue = this.serializeExpression(defaultExpr);
                  j += 2; // Skip the '=' and default value
                } catch (e) {
                  // Ignore errors in default value serialization
                }
              }
            }
            // Check for default value without type (param = default)
            else if (j + 2 < paramList.elements.length && 
                     isSymbol(paramList.elements[j+1]) && 
                     (paramList.elements[j+1] as SSymbol).name === '=') {
              // Extract default value
              try {
                const defaultExpr = paramList.elements[j+2];
                defaultValue = this.serializeExpression(defaultExpr);
                j += 2; // Skip the '=' and default value
              } catch (e) {
                // Ignore errors in default value serialization
              }
            }
            
            params.push({ 
              name: paramName, 
              type: paramType,
              defaultValue
            });
          }
        }
      }
      
      // Extract return type if present
      if (expr.elements.length > 3 && isList(expr.elements[3])) {
        const returnTypeList = expr.elements[3] as SList;
        if (returnTypeList.elements.length >= 2 && 
            isSymbol(returnTypeList.elements[0]) && 
            returnTypeList.elements[0].name === '->' &&
            isSymbol(returnTypeList.elements[1])) {
          returnType = returnTypeList.elements[1].name;
        }
      }
      
      symbols.push({
        name: funcName,
        kind: SymbolKind.Function,
        location,
        data: {
          documentation,
          params,
          returnType
        }
      });
    }
    
    /**
     * Process variable definitions (let, var)
     */
    private processVariableDefinition(
      document: TextDocument,
      expr: SList,
      symbols: ExtendedSymbolInformation[],
      range: Range,
      documentation: string
    ): void {
      if (expr.elements.length < 3) return;
      
      const varType = (expr.elements[0] as SSymbol).name; // 'let' or 'var'
      
      // Handle simple let/var form: (let name value)
      if (isSymbol(expr.elements[1])) {
        const varName = (expr.elements[1] as SSymbol).name;
        const location = Location.create(document.uri, range);
        
        // Try to determine variable type from the expression
        let varValueType = "Any";
        try {
          varValueType = this.inferExpressionType(expr.elements[2]);
        } catch (e) {
          // Ignore errors in type inference
        }
        
        symbols.push({
          name: varName,
          kind: SymbolKind.Variable,
          location,
          data: {
            documentation,
            type: varValueType
          }
        });
      }
      // Handle binding form: (let (x 1 y 2) ...)
      else if (isList(expr.elements[1])) {
        const bindings = expr.elements[1] as SList;
        for (let i = 0; i < bindings.elements.length; i += 2) {
          if (i + 1 < bindings.elements.length && isSymbol(bindings.elements[i])) {
            const varName = (bindings.elements[i] as SSymbol).name;
            const location = Location.create(document.uri, range);
            
            // Try to determine variable type from the binding value
            let varValueType = "Any";
            try {
              varValueType = this.inferExpressionType(bindings.elements[i + 1]);
            } catch (e) {
              // Ignore errors in type inference
            }
            
            symbols.push({
              name: varName,
              kind: SymbolKind.Variable,
              location,
              data: {
                documentation,
                type: varValueType
              }
            });
          }
        }
      }
    }
    
    /**
     * Process class/struct definitions
     */
    private processClassDefinition(
      document: TextDocument,
      expr: SList,
      symbols: ExtendedSymbolInformation[],
      range: Range,
      documentation: string
    ): void {
      if (expr.elements.length < 2 || !isSymbol(expr.elements[1])) return;
      
      const isClass = (expr.elements[0] as SSymbol).name === 'class';
      const className = (expr.elements[1] as SSymbol).name;
      const location = Location.create(document.uri, range);
      
      // Add class/struct symbol
      symbols.push({
        name: className,
        kind: isClass ? SymbolKind.Class : SymbolKind.Struct,
        location,
        data: {
          documentation
        }
      });
      
      // Create adapted document for member processing
      const adaptedDoc = createTextDocumentAdapter(document);
      
      // Process class members
      for (let i = 2; i < expr.elements.length; i++) {
        const member = expr.elements[i];
        if (!isList(member)) continue;
        
        const memberList = member as SList;
        if (memberList.elements.length === 0 || !isSymbol(memberList.elements[0])) continue;
        
        const memberType = (memberList.elements[0] as SSymbol).name;
        
        // Process class fields
        if ((memberType === 'var' || memberType === 'let') && 
            memberList.elements.length >= 2 && 
            isSymbol(memberList.elements[1])) {
          
          const fieldName = (memberList.elements[1] as SSymbol).name;
          const memberRange = findExpressionRange(adaptedDoc, memberList);
          const memberLocation = Location.create(document.uri, memberRange);
          
          // Try to determine field type
          let fieldType = "Any";
          if (memberList.elements.length >= 3) {
            try {
              fieldType = this.inferExpressionType(memberList.elements[2]);
            } catch (e) {
              // Ignore errors in type inference
            }
          }
          
          symbols.push({
            name: `${className}.${fieldName}`,
            kind: SymbolKind.Field,
            location: memberLocation,
            data: {
              type: fieldType
            }
          });
        }
        
        // Process class methods
        else if ((memberType === 'fn' || memberType === 'fx' || memberType === 'method') && 
                 memberList.elements.length >= 3 && 
                 isSymbol(memberList.elements[1])) {
          
          const methodName = (memberList.elements[1] as SSymbol).name;
          const memberRange = findExpressionRange(adaptedDoc, memberList);
          const memberLocation = Location.create(document.uri, memberRange);
          
          // Extract method parameters
          let params: { name: string; type: string; defaultValue?: string }[] = [];
          let returnType = "Any";
          
          if (memberList.elements.length > 2 && isList(memberList.elements[2])) {
            const paramList = memberList.elements[2] as SList;
            
            // Extract params similar to function definition
            // (Code omitted for brevity - same as in processFunctionDefinition)
            for (let j = 0; j < paramList.elements.length; j++) {
              if (isSymbol(paramList.elements[j])) {
                let paramName = (paramList.elements[j] as SSymbol).name;
                let paramType = "Any";
                let defaultValue: string | undefined = undefined;
                
                // Check for type annotation (param: Type)
                if (j + 2 < paramList.elements.length && 
                    isSymbol(paramList.elements[j+1]) && 
                    (paramList.elements[j+1] as SSymbol).name === ':' && 
                    isSymbol(paramList.elements[j+2])) {
                  paramType = (paramList.elements[j+2] as SSymbol).name;
                  j += 2; // Skip the ':' and type
                  
                  // Check for default value
                  if (j + 2 < paramList.elements.length && 
                      isSymbol(paramList.elements[j+1]) && 
                      (paramList.elements[j+1] as SSymbol).name === '=') {
                    defaultValue = this.serializeExpression(paramList.elements[j+2]);
                    j += 2; // Skip the '=' and default value
                  }
                }
                // Check for default value without type
                else if (j + 2 < paramList.elements.length && 
                         isSymbol(paramList.elements[j+1]) && 
                         (paramList.elements[j+1] as SSymbol).name === '=') {
                  defaultValue = this.serializeExpression(paramList.elements[j+2]);
                  j += 2; // Skip the '=' and default value
                }
                
                params.push({ 
                  name: paramName, 
                  type: paramType,
                  defaultValue
                });
              }
            }
          }
          
          // Extract return type if present
          if (memberList.elements.length > 3 && isList(memberList.elements[3])) {
            const returnTypeList = memberList.elements[3] as SList;
            if (returnTypeList.elements.length >= 2 && 
                isSymbol(returnTypeList.elements[0]) && 
                returnTypeList.elements[0].name === '->' &&
                isSymbol(returnTypeList.elements[1])) {
              returnType = returnTypeList.elements[1].name;
            }
          }
          
          symbols.push({
            name: `${className}.${methodName}`,
            kind: SymbolKind.Method,
            location: memberLocation,
            data: {
              params,
              returnType
            }
          });
        }
        
        // Process constructor
        else if (memberType === 'constructor' && memberList.elements.length >= 2) {
          // Create adapted document for constructor processing
          const adaptedDoc = createTextDocumentAdapter(document);
          
          const memberRange = findExpressionRange(adaptedDoc, memberList);
          const memberLocation = Location.create(document.uri, memberRange);
          
          // Extract constructor parameters
          let params: { name: string; type: string; defaultValue?: string }[] = [];
          
          if (isList(memberList.elements[1])) {
            const paramList = memberList.elements[1] as SList;
            
            // Extract params similar to function definition
            // (Same logic as above for methods)
            for (let j = 0; j < paramList.elements.length; j++) {
              if (isSymbol(paramList.elements[j])) {
                let paramName = (paramList.elements[j] as SSymbol).name;
                let paramType = "Any";
                let defaultValue: string | undefined = undefined;
                
                // Type annotation logic (abbreviated - same as above)
                if (j + 2 < paramList.elements.length && 
                    isSymbol(paramList.elements[j+1]) && 
                    (paramList.elements[j+1] as SSymbol).name === ':' && 
                    isSymbol(paramList.elements[j+2])) {
                  paramType = (paramList.elements[j+2] as SSymbol).name;
                  j += 2;
                  
                  // Default value logic (abbreviated)
                  if (j + 2 < paramList.elements.length && 
                      isSymbol(paramList.elements[j+1]) && 
                      (paramList.elements[j+1] as SSymbol).name === '=') {
                    defaultValue = this.serializeExpression(paramList.elements[j+2]);
                    j += 2;
                  }
                } else if (j + 2 < paramList.elements.length && 
                           isSymbol(paramList.elements[j+1]) && 
                           (paramList.elements[j+1] as SSymbol).name === '=') {
                  defaultValue = this.serializeExpression(paramList.elements[j+2]);
                  j += 2;
                }
                
                params.push({ 
                  name: paramName, 
                  type: paramType,
                  defaultValue
                });
              }
            }
          }
          
          symbols.push({
            name: `${className}.constructor`,
            kind: SymbolKind.Constructor,
            location: memberLocation,
            data: {
              params
            }
          });
        }
      }
    }
    
    /**
     * Process an enum definition
     */
    private processEnumDefinition(
      document: TextDocument,
      expr: SList,
      symbols: ExtendedSymbolInformation[],
      range: Range,
      documentation: string
    ): void {
      if (expr.elements.length < 2) return;
      
      const enumNameExpr = expr.elements[1];
      if (!isSymbol(enumNameExpr)) return;
      
      const enumName = enumNameExpr.name;
      
      // Add the enum type symbol
      const enumSymbol: ExtendedSymbolInformation = {
        name: enumName,
        kind: SymbolKind.Enum,
        location: {
          uri: document.uri,
          range
        },
        containerName: '',
        data: {
          documentation
        }
      };
      
      symbols.push(enumSymbol);
      
      // Process enum cases
      for (let i = 2; i < expr.elements.length; i++) {
        const caseExpr = expr.elements[i];
        
        if (!isList(caseExpr)) continue;
        
        const caseElements = caseExpr.elements;
        if (caseElements.length < 2) continue;
        
        const caseKeyword = caseElements[0];
        if (!isSymbol(caseKeyword) || caseKeyword.name !== 'case') continue;
        
        const caseNameExpr = caseElements[1];
        if (!isSymbol(caseNameExpr)) continue;
        
        const caseName = caseNameExpr.name;
        const fullCaseName = `${enumName}.${caseName}`;
        
        // Create adapted document before using it
        const adaptedDoc = createTextDocumentAdapter(document);
        
        // Find the case range
        const caseRange = findExpressionRange(adaptedDoc, caseExpr);
        
        // Extract associated value or type if present
        let type: string | undefined;
        
        if (caseElements.length > 2) {
          // Case has an associated value or type
          const valueExpr = caseElements[2];
          
          if (isSymbol(valueExpr)) {
            // Type annotation
            type = valueExpr.name;
          } else if (isString(valueExpr) || isNumber(valueExpr) || isBoolean(valueExpr)) {
            // Value extraction
            type = typeof valueExpr === 'object' ? JSON.stringify(valueExpr) : String(valueExpr);
          }
        }
        
        // Add the enum case symbol
        const caseSymbol: ExtendedSymbolInformation = {
          name: fullCaseName,
          kind: SymbolKind.EnumMember,
          location: {
            uri: document.uri,
            range: caseRange
          },
          containerName: enumName,
          data: {
            enumName,
            type,
            documentation: '' // Extract case-specific documentation if needed
          }
        };
        
        symbols.push(caseSymbol);
      }
    }
    
    /**
     * Process a macro definition
     */
    private processMacroDefinition(
      document: TextDocument,
      expr: SList,
      symbols: ExtendedSymbolInformation[],
      range: Range,
      documentation: string
    ): void {
      if (expr.elements.length < 3) return;
      
      const macroNameExpr = expr.elements[1];
      if (!isSymbol(macroNameExpr)) return;
      
      const macroName = macroNameExpr.name;
      
      // Add the macro symbol
      const macroSymbol: ExtendedSymbolInformation = {
        name: macroName,
        kind: SymbolKind.Function, // Use Function kind for macros
        location: {
          uri: document.uri,
          range
        },
        containerName: '',
        data: {
          documentation
        }
      };
      
      symbols.push(macroSymbol);
    }
    
    /**
     * Serialize an expression to a string representation
     */
    private serializeExpression(expr: any): string {
      if (!expr) {
        return '';
      }
      
      try {
        if (expr.type === 'symbol') {
          return expr.name;
        } 
        else if (expr.type === 'list') {
          return `(${expr.elements.map((e: any) => this.serializeExpression(e)).join(' ')})`;
        }
        else if (expr.type === 'string' || expr.type === 'literal') {
          if (typeof expr.value === 'string') {
            return `"${expr.value}"`;
          }
          return String(expr.value);
        }
        return JSON.stringify(expr);
      } catch (e) {
        return String(expr);
      }
    }
    
    /**
     * Infer the type of an expression
     */
    private inferExpressionType(expr: any): string {
      if (!expr) {
        return 'Any';
      }
      
      try {
        // Simple type inference based on literal types
        if (expr.type === 'literal') {
          if (typeof expr.value === 'number') {
            return expr.value % 1 === 0 ? 'Int' : 'Float';
          }
          if (typeof expr.value === 'boolean') {
            return 'Bool';
          }
          if (typeof expr.value === 'string') {
            return 'String';
          }
          return 'Any';
        }
        
        // Check for list expressions
        if (expr.type === 'list') {
          if (expr.elements.length > 0) {
            // Check for type annotations
            if (expr.elements[0].type === 'symbol' && expr.elements[0].name === '->') {
              if (expr.elements.length > 1 && expr.elements[1].type === 'symbol') {
                return expr.elements[1].name;
              }
            }
            
            // Check for vector types
            if (expr.elements[0].type === 'symbol' && expr.elements[0].name === 'Vec') {
              return 'Vec';
            }
          }
          return 'List';
        }
        
        // Check for symbols that might be type references
        if (expr.type === 'symbol') {
          // If the symbol starts with uppercase, it's likely a type name
          if (/^[A-Z]/.test(expr.name)) {
            return expr.name;
          }
          
          // Check for primitive type names
          if (['Int', 'Float', 'String', 'Bool', 'Any'].includes(expr.name)) {
            return expr.name;
          }
        }
        
        return 'Any';
      } catch (e) {
        return 'Any';
      }
    }
  }