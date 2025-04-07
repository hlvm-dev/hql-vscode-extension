import {
    TextDocument,
    Hover,
    TextDocumentPositionParams,
    MarkupKind,
    Position,
    Range
  } from 'vscode-languageserver';
  
  import { SymbolManager, ExtendedSymbolInformation } from './symbolManager';
  import { getCurrentExpression, getExpressionRangeAtPosition } from '../helper/getExpressionRange';
  import { createTextDocumentAdapter } from '../document-adapter';
  import { parse, SExp, SList, SSymbol } from '../parser';
  import { isList, isSymbol } from '../s-exp/types';
  
  /**
   * HoverProvider handles providing hover information for HQL elements
   */
  export class HoverProvider {
    private symbolManager: SymbolManager;
    
    // Documentation for common keywords
    private keywordDocumentation: Record<string, string> = {
      'fn': '```\n(fn name (args...) body)\n```\nDefines a new function.',
      'fx': '```\n(fx name (param1: Type1 param2: Type2) (-> ReturnType)\n  body)\n```\nDefines a pure function with typed parameters.',
      'let': '```\n(let name value)\n```\nor\n```\n(let (name1 value1 name2 value2) body)\n```\nDefines immutable bindings.',
      'var': '```\n(var name value)\n```\nor\n```\n(var (name1 value1 name2 value2) body)\n```\nDefines mutable bindings.',
      'if': '```\n(if condition then-expr else-expr)\n```\nConditional expression.',
      'enum': '```\n(enum Name\n  (case case1)\n  (case case2))\n```\nDefines an enumeration type with optional values or associated types.',
      'return': '```\n(return value)\n```\nReturns a value from a function. Can be used for early returns in conditionals.',
      'class': '```\n(class Name\n  (var field1)\n  (constructor (param1) body)\n  (method method1 (param1) body))\n```\nDefines a class with fields, constructor, and methods.',
      'struct': '```\n(struct Name\n  (field field1: Type1)\n  (field field2: Type2))\n```\nDefines a value type struct with fields.',
      'import': '```\n(import [sym1, sym2] from "module")\n```\nor\n```\n(import namespace from "module")\n```\nImports symbols or namespaces from modules.',
      'export': '```\n(export [sym1, sym2])\n```\nor\n```\n(export "name" symbol)\n```\nExports symbols from the current module.',
      'cond': '```\n(cond\n  (condition1 result1)\n  (condition2 result2)\n  (else default-result))\n```\nMulti-branch conditional expression.',
      'loop': '```\n(loop (var1 init1 var2 init2)\n  (if exit-condition\n    result\n    (recur next1 next2)))\n```\nLoop construct with recursive binding.',
      'for': '```\n(for (i from: 0 to: 10 by: 1)\n  body)\n```\nSequential iteration with control parameters.'
    };
    
    constructor(symbolManager: SymbolManager) {
      this.symbolManager = symbolManager;
    }
    
    /**
     * Provide hover information for a position
     */
    public async provideHover(params: TextDocumentPositionParams): Promise<Hover | null> {
      try {
        const document = await this.symbolManager.getDocument(params.textDocument.uri);
        if (!document) {
          return null;
        }
  
        const adaptedDoc = createTextDocumentAdapter(document);
        const expression = getCurrentExpression(adaptedDoc, params.position);
        
        if (!expression) {
          // No expression found, check for hovering over a keyword
          return this.checkKeywordHover(document, params.position);
        }
        
        // Check if we're hovering over a known symbol
        const symbols = this.symbolManager.getDocumentSymbols(params.textDocument.uri);
        
        for (const symbol of symbols) {
          const range = symbol.location.range;
          
          // Check if position is within symbol range
          if (this.isPositionInRange(params.position, range)) {
            // Found a symbol at the cursor position
            return this.createHoverForSymbol(symbol);
          }
        }
        
        // Check for hovering over an expression
        const exprRange = getExpressionRangeAtPosition(adaptedDoc, params.position);
        if (exprRange) {
          const exprText = document.getText(exprRange);
          
          try {
            // Parse the expression text
            const parsedExpr = parse(exprText, true)[0];
            
            // Check if it's a form (a list starting with a symbol)
            if (isList(parsedExpr) && 
                parsedExpr.elements.length > 0 && 
                isSymbol(parsedExpr.elements[0])) {
              
              const formName = parsedExpr.elements[0].name;
              
              // Check if we have documentation for this form
              if (this.keywordDocumentation[formName]) {
                return {
                  contents: {
                    kind: MarkupKind.Markdown,
                    value: this.keywordDocumentation[formName]
                  },
                  range: exprRange
                };
              }
            }
          } catch (error) {
            // Ignore parsing errors when hovering
          }
        }
        
        return null;
      } catch (error) {
        console.error(`Error providing hover: ${error}`);
        return null;
      }
    }
    
    /**
     * Check if position is within a range
     */
    private isPositionInRange(position: Position, range: Range): boolean {
      return (position.line > range.start.line || 
             (position.line === range.start.line && position.character >= range.start.character)) &&
             (position.line < range.end.line || 
             (position.line === range.end.line && position.character <= range.end.character));
    }
    
    /**
     * Create hover information for a symbol
     */
    private createHoverForSymbol(symbol: ExtendedSymbolInformation): Hover {
      let content = '';
      
      switch (symbol.kind) {
        case 12: // Function
          content = this.formatFunctionHover(symbol);
          break;
          
        case 13: // Variable
          content = this.formatVariableHover(symbol);
          break;
          
        case 5:  // Class
          content = this.formatClassHover(symbol);
          break;
          
        case 22: // Struct
          content = this.formatStructHover(symbol);
          break;
          
        case 10: // Enum
          content = this.formatEnumHover(symbol);
          break;
          
        case 11: // EnumMember
          content = this.formatEnumMemberHover(symbol);
          break;
          
        case 6:  // Method
          content = this.formatMethodHover(symbol);
          break;
          
        case 9:  // Constructor
          content = this.formatConstructorHover(symbol);
          break;
          
        case 8:  // Field
          content = this.formatFieldHover(symbol);
          break;
          
        default:
          content = `**${symbol.name}**`;
      }
      
      // Add documentation if available
      if (symbol.data?.documentation) {
        content += `\n\n${symbol.data.documentation}`;
      }
      
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: content
        },
        range: symbol.location.range
      };
    }
    
    /**
     * Format hover for a function
     */
    private formatFunctionHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Function** \`${symbol.name}\`\n\n`;
      
      if (symbol.data?.params) {
        const params = symbol.data.params.map(p => 
          `${p.name}${p.type ? ': ' + p.type : ''}${p.defaultValue ? ' = ' + p.defaultValue : ''}`
        ).join(' ');
        
        const returnType = symbol.data.returnType || 'Any';
        content += `\`\`\`hql\n(${symbol.name} ${params}) (-> ${returnType})\n\`\`\``;
      } else {
        content += `\`\`\`hql\n(${symbol.name} ...)\n\`\`\``;
      }
      
      return content;
    }
    
    /**
     * Format hover for a variable
     */
    private formatVariableHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Variable** \`${symbol.name}\``;
      
      if (symbol.data?.type) {
        content += `: \`${symbol.data.type}\``;
      }
      
      return content;
    }
    
    /**
     * Format hover for a class
     */
    private formatClassHover(symbol: ExtendedSymbolInformation): string {
      return `**Class** \`${symbol.name}\``;
    }
    
    /**
     * Format hover for a struct
     */
    private formatStructHover(symbol: ExtendedSymbolInformation): string {
      return `**Struct** \`${symbol.name}\``;
    }
    
    /**
     * Format hover for an enum
     */
    private formatEnumHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Enum** \`${symbol.name}\`\n\n`;
      
      // Get enum cases
      const uri = symbol.location.uri;
      const cases = this.symbolManager.getDocumentSymbols(uri).filter(s => 
        s.kind === 11 && // EnumMember
        s.data?.enumName === symbol.name
      );
      
      if (cases.length > 0) {
        content += "**Cases:**\n\n";
        for (const c of cases) {
          const caseName = c.name.includes('.') ? c.name.split('.')[1] : c.name;
          // Display case value if available
          content += `- \`${caseName}\``;
          
          // Check for associated value, using optional chaining to safely access properties
          const value = c.data?.type; // Use type as value display
          if (value) {
            content += `: ${value}`;
          }
          
          content += '\n';
        }
      }
      
      return content;
    }
    
    /**
     * Format hover for an enum member
     */
    private formatEnumMemberHover(symbol: ExtendedSymbolInformation): string {
      const enumName = symbol.data?.enumName || '';
      let caseName = symbol.name;
      
      // If the name includes the enum name (Enum.Case), just show the case part
      if (caseName.includes('.')) {
        caseName = caseName.split('.')[1];
      }
      
      let content = `**Enum Case** \`${caseName}\``;
      if (enumName) {
        content += ` of \`${enumName}\``;
      }
      
      // Add associated value if available
      const associatedType = symbol.data?.type;
      if (associatedType) {
        content += `\n\nType: \`${associatedType}\``;
      }
      
      return content;
    }
    
    /**
     * Format hover for a method
     */
    private formatMethodHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Method** \`${symbol.name}\`\n\n`;
      
      if (symbol.data?.params) {
        const params = symbol.data.params.map(p => 
          `${p.name}${p.type ? ': ' + p.type : ''}${p.defaultValue ? ' = ' + p.defaultValue : ''}`
        ).join(' ');
        
        const returnType = symbol.data.returnType || 'Any';
        content += `\`\`\`hql\n(${symbol.name} ${params}) (-> ${returnType})\n\`\`\``;
      } else {
        content += `\`\`\`hql\n(${symbol.name} ...)\n\`\`\``;
      }
      
      return content;
    }
    
    /**
     * Format hover for a constructor
     */
    private formatConstructorHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Constructor** \`${symbol.name}\`\n\n`;
      
      if (symbol.data?.params) {
        const params = symbol.data.params.map(p => 
          `${p.name}${p.type ? ': ' + p.type : ''}${p.defaultValue ? ' = ' + p.defaultValue : ''}`
        ).join(' ');
        
        content += `\`\`\`hql\n(constructor ${params})\n\`\`\``;
      } else {
        content += `\`\`\`hql\n(constructor ...)\n\`\`\``;
      }
      
      return content;
    }
    
    /**
     * Format hover for a field
     */
    private formatFieldHover(symbol: ExtendedSymbolInformation): string {
      let content = `**Field** \`${symbol.name}\``;
      
      if (symbol.data?.type) {
        content += `: \`${symbol.data.type}\``;
      }
      
      return content;
    }
    
    /**
     * Check for hovering over a keyword
     */
    private checkKeywordHover(document: TextDocument, position: Position): Hover | null {
      const wordRange = this.getWordRangeAtPosition(document, position);
      if (!wordRange) {
        return null;
      }
      
      const word = document.getText(wordRange);
      
      // Check if we're hovering over a known keyword
      if (this.keywordDocumentation[word]) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: this.keywordDocumentation[word]
          },
          range: wordRange
        };
      }
      
      return null;
    }
    
    /**
     * Get the range of a word at a position
     */
    private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
      const text = document.getText();
      const offset = document.offsetAt(position);
      
      // Define word characters for HQL (including special characters)
      const wordPattern = /[a-zA-Z0-9_\-\+\*\/\?\!\>\<\=\%\&\.\:]/;
      
      // Find the start of the word
      let start = offset;
      while (start > 0 && wordPattern.test(text.charAt(start - 1))) {
        start--;
      }
      
      // Find the end of the word
      let end = offset;
      while (end < text.length && wordPattern.test(text.charAt(end))) {
        end++;
      }
      
      if (start === end) {
        return null;
      }
      
      return {
        start: document.positionAt(start),
        end: document.positionAt(end)
      };
    }
  }