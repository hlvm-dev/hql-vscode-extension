import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import {
  Position,
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  CompletionParams,
  InsertTextFormat,
  Range
} from 'vscode-languageserver';

import * as path from 'path';
import * as fs from 'fs';
import { createTextDocumentAdapter } from '../document-adapter';
import { getCurrentExpression } from '../helper/getExpressionRange';
import { parse, SExp } from '../parser';
import { isList, isSymbol, isString } from '../s-exp/types';
import { SymbolManager, ExtendedSymbolInformation } from './symbolManager';

/**
 * CompletionProvider handles intelligent code completion for HQL
 */
export class CompletionProvider {
  private symbolManager: SymbolManager;
  private workspaceFolders: { uri: string }[] | null = null;
  // Cache for dynamic values
  private dynamicValueCache: Map<string, CompletionItem[]> = new Map();
  // When this was last updated
  private lastCacheUpdate: number = 0;

  constructor(symbolManager: SymbolManager) {
    this.symbolManager = symbolManager;
  }

  /**
   * Set workspace folders for resolving paths
   */
  public setWorkspaceFolders(folders: { uri: string }[] | null): void {
    this.workspaceFolders = folders;
  }

  /**
   * Provide completion items for a given position
   */
  async provideCompletionItems(params: CompletionParams): Promise<CompletionItem[]> {
    try {
      const { textDocument, position } = params;
      const document = await this.symbolManager.getDocument(textDocument.uri);
      if (!document) {
        return [];
      }
      
      // Get text around cursor position for context
      const text = document.getText();
      const lines = text.split('\n');
      const currentLine = lines[position.line] || '';
      const linePrefix = currentLine.substring(0, position.character);
      
      // Update dynamic value cache periodically
      this.updateDynamicValues(document);
      
      // Check for different completion contexts
      
      // Handle import completions first
      if (linePrefix.includes('import')) {
        return this.handleImportCompletions(document, currentLine, text);
      }
      
      // Handle method chain completions or enum dot notation completions (e.g., object.method or .enumCase)
      if (linePrefix.endsWith('.')) {
        // Check if this is enum dot notation for parameter typing
        const enumDotCompletions = this.handleEnumDotCompletions(document, position);
        if (enumDotCompletions) {
          return enumDotCompletions;
        }
        
        // Otherwise handle as method chain
        return this.handleMethodChainCompletions(document, currentLine);
      }
      
      // Handle parameter completions for function calls
      const paramMatch = linePrefix.match(/\(\s*(\w+)\s+([^(\s)]+)?$/);
      if (paramMatch) {
        const funcName = paramMatch[1];
        return this.getParameterCompletions(document, funcName);
      }
      
      // Handle enum value completions
      const enumValueMatch = linePrefix.match(/:\s*(\w+)$/);
      if (enumValueMatch) {
        const enumType = enumValueMatch[1];
        return this.getEnumValueCompletions(document, enumType);
      }
      
      // Check if we're inside a form that has special completion requirements
      const enclosingFunction = this.findEnclosingFunction(document, position);
      if (enclosingFunction) {
        const functionSpecificCompletions = this.getFunctionSpecificCompletions(enclosingFunction.name);
        if (functionSpecificCompletions.length > 0) {
          return functionSpecificCompletions;
        }
      }
      
      // Get word at cursor
      const word = this.getWordAtPosition(linePrefix);
      
      // ==========================================
      // IMPORTANT: We need to handle duplicates between our snippets and VS Code's snippets
      // from hql.json. We'll use a workaround to deduplicate them.
      // ==========================================
      
      // Add template completions based on the current word
      const templateCompletions = this.getTemplateCompletions(word);
      
      // Add document symbol completions
      const symbolCompletions = this.getDocumentSymbolCompletions(document, position, word);
      
      // Get type-related completions
      const typeCompletions = this.getTypeCompletions(word);
      
      // Create a fully merged and deduplicated result
      let results = this.mergeAndDeduplicate([...templateCompletions, ...symbolCompletions, ...typeCompletions]);
      
      // Sort to ensure template snippets come first
      results.sort((a, b) => {
        const aSortText = a.sortText || a.label;
        const bSortText = b.sortText || b.label;
        return aSortText.localeCompare(bSortText);
      });
      
      // Handle duplicates between our snippets and VS Code's snippets
      // VS Code will add snippets from hql.json, but we need to prevent duplicates
      // We'll use a workaround by adding a special character at the end of our detail fields
      results = results.map(item => {
        if (item.kind === CompletionItemKind.Snippet) {
          // Add a zero-width space to the detail field to make it "different" from VS Code's snippets
          // This doesn't change visible appearance but makes them different for deduplication
          item.detail = `${item.detail}\u200B`;
        }
        return item;
      });
      
      return results;
    } catch (error) {
      console.error(`Error providing completions: ${error}`);
      return [];
    }
  }
  
  /**
   * Extract the current word from text up to the cursor position
   */
  private getWordAtPosition(linePrefix: string): string {
    // Match word characters at the end of the line
    const match = linePrefix.match(/[\w\-_]+$/);
    return match ? match[0] : '';
  }
  
  /**
   * Merge completions from different sources and remove duplicates,
   * prioritizing items with better sortText values
   */
  private mergeAndDeduplicate(completions: CompletionItem[]): CompletionItem[] {
    // Sort completions by sortText first, so items with better priority come first
    completions.sort((a, b) => {
      const aSortText = a.sortText || a.label;
      const bSortText = b.sortText || b.label;
      return aSortText.localeCompare(bSortText);
    });
    
    // Use a Map to keep only the first occurrence of each label
    const uniqueMap = new Map<string, CompletionItem>();
    
    for (const item of completions) {
      // Skip if we already have a better item for this label
      if (uniqueMap.has(item.label)) {
        continue;
      }
      
      // Add new unique item
      uniqueMap.set(item.label, item);
    }
    
    return Array.from(uniqueMap.values());
  }
  
  /**
   * Handle completions for enum dot notation
   */
  private handleEnumDotCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line] || '';
    const linePrefix = currentLine.substring(0, position.character);
    
    if (!linePrefix.endsWith('.')) return [];
    
    const beforeDot = linePrefix.slice(0, -1).trim();
    
    // First try to parse the current expression to get better context
    const currentExpression = getCurrentExpression(document, position);
    if (currentExpression) {
      const adaptedDoc = createTextDocumentAdapter(document);
      const symbols = this.symbolManager.getDocumentSymbols(document.uri);
      
      // Look for parameter type annotations in the current expression
      const paramTypeMatch = beforeDot.match(/(\w+)\s*:\s*(\w+)$/);
      if (paramTypeMatch) {
        const [_, paramName, typeName] = paramTypeMatch;
        
        // Find if this type is an enum
        const enumType = symbols.find(s => 
          s.kind === 10 && // Enum
          s.name === typeName
        );
        
        if (enumType) {
          return this.getEnumValueCompletions(document, typeName);
        }
      }
      
      // Check for usage in equality expression (= .enumCase var)
      // This is for when dot notation is used in equality expressions
      const equalityMatch = currentLine.match(/\(\s*=\s+\.\s*$/);
      if (equalityMatch) {
        // Look back up to find the type of the variable being compared
        // This is complex and might require looking at other lines
        // For now, return all known enum cases as potential completions
        return this.getAllEnumCaseCompletions(document);
      }
    }
    
    // If no parameter type found, check if the identifier before dot is an enum type
    const enumMatch = beforeDot.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    if (enumMatch) {
      const [_, typeName] = enumMatch;
      const symbols = this.symbolManager.getDocumentSymbols(document.uri);
      
      // Verify this is actually an enum type
      const enumType = symbols.find(s => 
        s.kind === 10 && // Enum
        s.name === typeName
      );
      
      if (enumType) {
        return this.getEnumValueCompletions(document, typeName);
      }
    }
    
    // Special handling for shorthand dot notation in typed contexts (.enumCase)
    // If we're at the start of an argument list, suggest all enum cases
    const startOfArg = linePrefix.match(/[\(,]\s*\.\s*$/);
    if (startOfArg) {
      return this.getAllEnumCaseCompletions(document);
    }
    
    return [];
  }
  
  /**
   * Get all enum case completions from all enum types in the document
   * Useful for shorthand dot notation where type isn't explicitly known
   */
  private getAllEnumCaseCompletions(document: TextDocument): CompletionItem[] {
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const allEnumCases: CompletionItem[] = [];
    
    // Find all enum types
    const enumTypes = symbols.filter(s => s.kind === 10); // Enum type
    
    for (const enumType of enumTypes) {
      const enumName = enumType.name;
      const enumCases = symbols.filter(s => 
        s.kind === 11 && // Enum member
        s.data?.enumName === enumName
      );
      
      for (const enumCase of enumCases) {
        // Extract just the case name without the enum prefix
        const caseName = enumCase.name.includes('.') 
          ? enumCase.name.split('.')[1] 
          : enumCase.name;
          
        allEnumCases.push({
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum ${enumName}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: enumCase.data?.documentation || `Enum case from \`${enumName}\``
          },
          insertText: caseName,
          sortText: `0-${caseName}`, // Sort enum cases to the top
          data: {
            enumName: enumName,
            fullName: `${enumName}.${caseName}`
          }
        });
      }
    }
    
    return allEnumCases;
  }
  
  /**
   * Update cache of dynamic values from document
   */
  private updateDynamicValues(document: TextDocument): void {
    const now = Date.now();
    // Only update cache every 30 seconds to avoid performance issues
    if (now - this.lastCacheUpdate < 30000) {
      return;
    }
    
    this.lastCacheUpdate = now;
    
    try {
      // Parse the document to find all enum declarations and their values
      const text = document.getText();
      const expressions = parse(text, true);
      
      // Process expressions to find enum declarations
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'enum') {
            this.processEnumForCompletion(expr, document.uri);
          }
        }
      }
      
      // Get document symbols from open documents
      const uri = document.uri;
      const symbols = this.symbolManager.getDocumentSymbols(uri);
      
      // Find all enum types
      const enumSymbols = symbols.filter(s => s.kind === 10); // Enum type
      
      for (const enumSymbol of enumSymbols) {
        const enumName = enumSymbol.name;
        const enumCases = symbols.filter(s => 
          s.kind === 11 && // Enum member
          s.data?.enumName === enumName
        );
        
        if (enumCases.length > 0) {
          const enumCompletions = enumCases.map(enumCase => ({
            label: enumCase.name,
            kind: CompletionItemKind.EnumMember,
            detail: `Case of enum ${enumName}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: enumCase.data?.documentation || `Enum case from \`${enumName}\``
            },
            data: {
              enumName: enumName
            }
          }));
          
          // Cache these completions for the enum type
          this.dynamicValueCache.set(`enum:${enumName}`, enumCompletions);
        }
      }
    } catch (error) {
      console.error(`Error updating dynamic values: ${error}`);
    }
  }
  
  /**
   * Process an enum expression for completion suggestions
   */
  private processEnumForCompletion(expr: SExp, documentUri: string): void {
    if (!isList(expr) || expr.elements.length < 2) return;
    
    const enumNameExpr = expr.elements[1];
    if (!isSymbol(enumNameExpr)) return;
    
    const enumName = enumNameExpr.name;
    const enumCases: CompletionItem[] = [];
    
    // Process enum cases
    for (let i = 2; i < expr.elements.length; i++) {
      const caseExpr = expr.elements[i];
      if (isList(caseExpr) && caseExpr.elements.length >= 2) {
        const caseKeyword = caseExpr.elements[0];
        const caseName = caseExpr.elements[1];
        
        if (isSymbol(caseKeyword) && caseKeyword.name === 'case' && isSymbol(caseName)) {
          // Store the full name (Enum.Case) for proper symbol tracking
          const fullName = `${enumName}.${caseName.name}`;
          enumCases.push({
            label: caseName.name,
            kind: CompletionItemKind.EnumMember,
            detail: `Case of enum ${enumName}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `Enum case from \`${enumName}\``
            },
            insertText: caseName.name,
            data: {
              enumName,
              fullName
            }
          });
        }
      }
    }
    
    if (enumCases.length > 0) {
      // Cache these completions for the enum type
      this.dynamicValueCache.set(`enum:${enumName}`, enumCases);
    }
  }
  
  /**
   * Get completion items for enum values based on type
   */
  private getEnumValueCompletions(document: TextDocument, enumType: string): CompletionItem[] {
    // Check if we have cached values for this enum
    const cachedItems = this.dynamicValueCache.get(`enum:${enumType}`);
    if (cachedItems) {
      return cachedItems;
    }
    
    // If not in cache, look through document symbols
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    // First find the enum type
    const enumSymbol = symbols.find(s => 
      s.kind === 10 && // Enum
      s.name === enumType
    );
    
    if (!enumSymbol) {
      return [];
    }
    
    // Find enum members for this type
    const enumMembers = symbols.filter(s => 
      s.kind === 11 && // EnumMember
      s.data?.enumName === enumType
    );
    
    if (enumMembers.length > 0) {
      const enumCompletions = enumMembers.map(enumMember => {
        // Extract just the case name without the enum prefix
        const caseName = enumMember.name.includes('.') 
          ? enumMember.name.split('.')[1] 
          : enumMember.name;
          
        return {
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum ${enumType}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: enumMember.data?.documentation || `Enum case from \`${enumType}\``
          },
          insertText: caseName,
          sortText: `0-${caseName}`, // Sort enum cases to the top
          data: {
            enumName: enumType,
            fullName: `${enumType}.${caseName}`
          }
        };
      });
      
      // Cache these for future use
      this.dynamicValueCache.set(`enum:${enumType}`, enumCompletions);
      
      return enumCompletions;
    }
    
    // If no members found directly, try parsing the document for enum declarations
    try {
      const text = document.getText();
      const expressions = parse(text, true);
      
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'enum') {
            const enumNameExpr = expr.elements[1];
            if (isSymbol(enumNameExpr) && enumNameExpr.name === enumType) {
              // Found the enum declaration, process its cases
              const cases: CompletionItem[] = [];
              
              for (let i = 2; i < expr.elements.length; i++) {
                const caseExpr = expr.elements[i];
                if (isList(caseExpr) && caseExpr.elements.length >= 2) {
                  const caseKeyword = caseExpr.elements[0];
                  const caseName = caseExpr.elements[1];
                  
                  if (isSymbol(caseKeyword) && caseKeyword.name === 'case' && isSymbol(caseName)) {
                    cases.push({
                      label: caseName.name,
                      kind: CompletionItemKind.EnumMember,
                      detail: `Case of enum ${enumType}`,
                      documentation: {
                        kind: MarkupKind.Markdown,
                        value: `Enum case from \`${enumType}\``
                      },
                      insertText: caseName.name,
                      sortText: `0-${caseName.name}`,
                      data: {
                        enumName: enumType,
                        fullName: `${enumType}.${caseName.name}`
                      }
                    });
                  }
                }
              }
              
              if (cases.length > 0) {
                this.dynamicValueCache.set(`enum:${enumType}`, cases);
                return cases;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing enum cases: ${error}`);
    }
    
    return [];
  }
  
  /**
   * Get parameter completions for a function
   */
  private getParameterCompletions(document: TextDocument, funcName: string): CompletionItem[] {
    // Find the function in document symbols
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
      (s.kind === 12 || s.kind === 6) && // Function or Method
      s.name === funcName
    );
    
    if (functionSymbol && functionSymbol.data?.params) {
      return functionSymbol.data.params.map(param => ({
        label: param.name,
        kind: CompletionItemKind.Variable,
        detail: `Parameter: ${param.type || 'Any'}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Parameter for function \`${funcName}\`${param.defaultValue ? `\n\nDefault value: \`${param.defaultValue}\`` : ''}`
        },
        insertText: `${param.name}: \${1:${param.type || 'Any'}}`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `0-${param.name}` // Sort parameters to the top
      }));
    }
    
    return [];
  }
  
  /**
   * Get function-specific completions based on the enclosing function
   */
  private getFunctionSpecificCompletions(functionName: string): CompletionItem[] {
    // Add specialized completion based on common function contexts
    switch (functionName) {
      case 'http:request':
        return [
          {
            label: 'method:',
            kind: CompletionItemKind.Property,
            detail: 'HTTP Method',
            insertText: 'method: "GET"',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'HTTP method to use: GET, POST, PUT, DELETE, etc.'
            }
          },
          {
            label: 'url:',
            kind: CompletionItemKind.Property,
            insertText: 'url: "https://',
            detail: 'Request URL',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'URL to make the request to'
            }
          },
          {
            label: 'headers:',
            kind: CompletionItemKind.Property,
            insertText: 'headers: {\n  $0\n}',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'HTTP Headers',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'HTTP headers to include in the request'
            }
          },
          {
            label: 'body:',
            kind: CompletionItemKind.Property,
            detail: 'Request Body',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Request body content'
            }
          }
        ];
        
      case 'fs:read-file':
        return [
          {
            label: 'path:',
            kind: CompletionItemKind.Property,
            detail: 'File Path',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Path to the file to read'
            }
          },
          {
            label: 'encoding:',
            kind: CompletionItemKind.Property,
            detail: 'File Encoding',
            insertText: 'encoding: "utf-8"',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Encoding to use when reading the file'
            }
          }
        ];
        
      case 'enum':
        return [
          {
            label: 'case-simple',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum case',
            insertText: '(case ${1:CaseName})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a simple case in an enumeration'
            }
          },
          {
            label: 'case-with-value',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum case with raw value',
            insertText: '(case ${1:CaseName} ${2:value})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a case with raw value in an enumeration'
            }
          },
          {
            label: 'case-with-params',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum case with associated values',
            insertText: '(case ${1:CaseName} ${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a case with associated values in an enumeration'
            }
          }
        ];
        
      case 'class':
        return [
          {
            label: 'var',
            kind: CompletionItemKind.Keyword,
            detail: 'Class field (mutable)',
            insertText: 'var ${1:fieldName}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a mutable field in a class'
            }
          },
          {
            label: 'let',
            kind: CompletionItemKind.Keyword,
            detail: 'Class field (immutable)',
            insertText: 'let ${1:fieldName} ${2:value}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define an immutable field in a class'
            }
          },
          {
            label: 'constructor',
            kind: CompletionItemKind.Keyword,
            detail: 'Class constructor',
            insertText: 'constructor (${1:params})\n  ${0:body}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a constructor for the class'
            }
          },
          {
            label: 'fn',
            kind: CompletionItemKind.Keyword,
            detail: 'Class method',
            insertText: 'fn ${1:methodName} (${2:params})\n  ${0:body}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a method for the class'
            }
          },
          {
            label: 'fx',
            kind: CompletionItemKind.Keyword,
            detail: 'Class pure method',
            insertText: 'fx ${1:methodName} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${0:body}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a pure method for the class'
            }
          }
        ];

      case 'struct':
        return [
          {
            label: 'field',
            kind: CompletionItemKind.Keyword,
            detail: 'Struct field',
            insertText: 'field ${1:fieldName}: ${0:Type}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Define a field in a struct'
            }
          }
        ];

      case 'cond':
        return [
          {
            label: 'condition-branch',
            kind: CompletionItemKind.Snippet,
            detail: 'Condition branch',
            insertText: '(${1:condition}) ${0:result}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a condition branch to cond expression'
            }
          },
          {
            label: 'else-branch',
            kind: CompletionItemKind.Snippet,
            detail: 'Else branch',
            insertText: '(else ${0:result})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add the default else branch to cond expression'
            }
          }
        ];

      case 'import':
        return [
          {
            label: 'from',
            kind: CompletionItemKind.Keyword,
            detail: 'Import source',
            insertText: 'from "${0:path}"',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Specify the source module path'
            }
          }
        ];

      case 'for':
        return [
          {
            label: 'from:',
            kind: CompletionItemKind.Property,
            detail: 'Loop start value',
            insertText: 'from: ${0:0}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Starting value for the loop counter'
            }
          },
          {
            label: 'to:',
            kind: CompletionItemKind.Property,
            detail: 'Loop end value',
            insertText: 'to: ${0:10}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Ending value for the loop counter'
            }
          },
          {
            label: 'by:',
            kind: CompletionItemKind.Property,
            detail: 'Loop increment',
            insertText: 'by: ${0:1}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Increment value for each iteration'
            }
          }
        ];

      case 'loop':
        return [
          {
            label: 'recur',
            kind: CompletionItemKind.Keyword,
            detail: 'Loop recursion',
            insertText: 'recur ${0:values}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Recur back to the loop with new values'
            }
          }
        ];

      case 'console.log':
      case 'print':
        return [
          {
            label: 'String concatenation',
            kind: CompletionItemKind.Snippet,
            detail: 'Insert string formatting',
            insertText: '"${1:message}: " ${0:value}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Format values for printing with a label'
            }
          }
        ];
        
      case 'fn':
      case 'fx': 
        // When inside a function definition, suggest parameter with type annotations
        return [
          {
            label: 'param-with-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with type annotation',
            insertText: '${1:name}: ${0:Type}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type annotation'
            }
          },
          {
            label: 'param-with-default',
            kind: CompletionItemKind.Snippet,
            detail: 'Parameter with default value',
            insertText: '${1:name}: ${2:Type} = ${0:defaultValue}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Add a parameter with type and default value'
            }
          },
          {
            label: 'return-type',
            kind: CompletionItemKind.Snippet,
            detail: 'Function return type',
            insertText: '(-> ${0:ReturnType})',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Specify the function return type'
            }
          },
          {
            label: 'enum-param',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum type parameter',
            insertText: '${1:paramName}: ${0:EnumType}',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Parameter with enum type annotation'
            }
          }
        ];
        
      // Add more function-specific completions as needed
      
      default:
        return [];
    }
  }
  
  /**
   * Find the enclosing function at a given position
   */
  private findEnclosingFunction(
    document: TextDocument,
    position: Position
  ): ExtendedSymbolInformation | null {
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const functions = symbols.filter(s => s.kind === 12 || s.kind === 6); // Function or Method
    
    // Find the innermost function that contains the position
    let bestMatch: ExtendedSymbolInformation | null = null;
    let smallestSize = Infinity;
    
    for (const func of functions) {
      const range = func.location.range;
      
      // Check if position is within function range
      if (position.line >= range.start.line && position.line <= range.end.line &&
          (position.line > range.start.line || position.character >= range.start.character) &&
          (position.line < range.end.line || position.character <= range.end.character)) {
        
        // Calculate size of the range
        const size = (range.end.line - range.start.line) * 1000 + 
                    (range.end.character - range.start.character);
        
        // Keep the smallest range that contains position
        if (size < smallestSize) {
          smallestSize = size;
          bestMatch = func;
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Get completions from document symbols (functions, variables, etc),
   * filtered to avoid duplicating template items
   */
  private getDocumentSymbolCompletions(
    document: TextDocument,
    position: Position,
    word: string
  ): CompletionItem[] {
    // Create a set of keywords that we already have template support for
    const templateKeywords = new Set([
      'fn', 'fx', 'if', 'let', 'var', 'cond', 'when', 'unless', 'do', 
      'lambda', 'loop', 'for', 'while', 'repeat', 'class', 'enum',
      'import', 'export', 'defmacro', 'vector', 'if-let', 'set', 'object', 'map'
    ]);
    
    // Get defined symbols in this document
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    // Map symbols to completion items
    return symbols
      .filter(symbol => 
        // Only include symbols that match the current word prefix if provided
        (!word || symbol.name.startsWith(word)) &&
        // Don't include any template keywords we already handle
        !templateKeywords.has(symbol.name)
      )
      .map(symbol => {
      const kind = this.getCompletionKindForSymbol(symbol.kind);
      let detail = '';
      let documentation = '';
      let data = symbol.data;
      let sortText: string | undefined = undefined;
      let insertText: string | undefined = undefined;
      let insertTextFormat: InsertTextFormat | undefined = undefined;
      
      // Set details based on symbol kind
      switch (symbol.kind) {
        case 12: // Function
        case 6:  // Method
          detail = `Function${symbol.data?.params ? ' with parameters' : ''}`;
          documentation = symbol.data?.documentation || '';
          data = symbol.data;
          
          // Create proper function call expansion with placeholders
          if (symbol.data?.params && symbol.data.params.length > 0) {
            // Format: (functionName param1: Type1 param2: Type2)
            const paramSnippets = symbol.data.params
              .map((p, i) => `${p.name}: \${${i + 1}:${p.type || 'Any'}}`)
              .join(' ');
            
            insertText = `(${symbol.name} ${paramSnippets})`;
            insertTextFormat = InsertTextFormat.Snippet;
            sortText = `2-${symbol.name}`; // High priority
          } else {
            // Function with no params, still add parentheses
            insertText = `(${symbol.name} \${1})`;
            insertTextFormat = InsertTextFormat.Snippet;
              sortText = `2-${symbol.name}`;
          }
          break;
          
        case 13: // Variable
          detail = 'Variable';
          documentation = symbol.data?.documentation || '';
          sortText = `5-${symbol.name}`;
          break;
          
        case 5: // Class
          detail = 'Class';
          documentation = symbol.data?.documentation || '';
          sortText = `6-${symbol.name}`;
            // Always provide a proper constructor call with class
            insertText = `(new ${symbol.name} \${1})`;
            insertTextFormat = InsertTextFormat.Snippet;
          break;
          
        case 10: // Enum
          detail = 'Enumeration';
          documentation = symbol.data?.documentation || '';
          sortText = `6-${symbol.name}`;
          break;
          
        case 11: // EnumMember
          detail = `Enum Case${symbol.data?.enumName ? ` of ${symbol.data.enumName}` : ''}`;
          documentation = symbol.data?.documentation || '';
          sortText = `4-${symbol.name}`;
          break;
          
        default:
          sortText = `7-${symbol.name}`;
            
            // For keywords that aren't in our template list but might be functions,
            // always provide a reasonable callable snippet
            if (this.isLikelyFunction(symbol.name)) {
              insertText = `(${symbol.name} \${1})`;
              insertTextFormat = InsertTextFormat.Snippet;
              detail = 'Function call';
            }
      }
      
      return {
        label: symbol.name,
        kind,
        detail,
        ...(sortText ? { sortText } : {}),
        ...(insertText ? { insertText } : {}),
        ...(insertTextFormat ? { insertTextFormat } : {}),
        documentation: {
          kind: MarkupKind.Markdown,
          value: documentation
        },
        data
      };
    });
  }
  
  /**
   * Get completion kind for a symbol kind
   */
  private getCompletionKindForSymbol(kind: number): CompletionItemKind {
    switch (kind) {
      case 12: // Function
        return CompletionItemKind.Function;
        
      case 13: // Variable
        return CompletionItemKind.Variable;
        
      case 6: // Method
        return CompletionItemKind.Method;
        
      case 5: // Class
        return CompletionItemKind.Class;
        
      case 22: // Struct
        return CompletionItemKind.Struct;
        
      case 10: // Enum
        return CompletionItemKind.Enum;
        
      case 11: // EnumMember
        return CompletionItemKind.EnumMember;
        
      case 8: // Field
        return CompletionItemKind.Field;
        
      case 9: // Constructor
        return CompletionItemKind.Constructor;
        
      default:
        return CompletionItemKind.Text;
    }
  }
  
  /**
   * Get template completions based on word
   */
  private getTemplateCompletions(word: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    if ('fn'.startsWith(word)) {
      completions.push({
        label: 'fn-function',
        kind: CompletionItemKind.Snippet,
        detail: 'Function Definition (fn)',
        insertText: '(fn ${1:name} (${2:param}: ${3:Type})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn', // Highest priority
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a function definition with snippet placeholders'
        }
      });
      
      completions.push({
        label: 'fn-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Function with Default Parameters',
        insertText: '(fn ${1:name} (${2:param}: ${3:Type} = ${4:defaultValue})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn-defaults',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a function with default parameter values'
        }
      });
    }
    
    if ('install'.startsWith(word)) {
      completions.push({
        label: 'install',
        kind: CompletionItemKind.Snippet,
        detail: 'Install function (with OS parameter)',
        insertText: '(install os: ${1:OS})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-install', // Highest priority
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Install function that takes an OS enum parameter'
        }
      });
    }
    
    if ('fx'.startsWith(word)) {
      completions.push({
        label: 'fx-pure',
        kind: CompletionItemKind.Snippet,
        detail: 'Pure Function Definition (fx)',
        insertText: '(fx ${1:name} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx', // Highest priority
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a typed function definition with snippet placeholders'
        }
      });
      
      completions.push({
        label: 'fx-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Pure Function with Default Parameters',
        insertText: '(fx ${1:name} (${2:param}: ${3:Type} = ${4:defaultValue}) (-> ${5:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx-defaults',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a pure function with default parameter values'
        }
      });
    }
    
    if ('if'.startsWith(word)) {
      completions.push({
        label: 'if-cond',
        kind: CompletionItemKind.Snippet,
        detail: 'Conditional expression',
        insertText: '(if ${1:condition}\n  ${2:true-expr}\n  ${0:false-expr})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-if',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an if conditional expression'
        }
      });
    }
    
    if ('enum'.startsWith(word)) {
      completions.push({
        label: 'enum-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum definition',
        insertText: '(enum ${1:Name}\n  (case ${2:Case1})\n  (case ${0:Case2}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-enum',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a simple enumeration type definition without associated values'
        }
      });
      
      completions.push({
        label: 'enum-with-rawvalue',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum with raw values',
        insertText: '(enum ${1:Name}: ${2:Int}\n  (case ${3:Case1} ${4:1})\n  (case ${5:Case2} ${0:2}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-enum-raw',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an enumeration with associated raw values'
        }
      });
      
      completions.push({
        label: 'enum-with-associated',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum with associated values',
        insertText: '(enum ${1:Name}\n  (case ${2:Case1} ${3:param1}: ${4:Type1})\n  (case ${5:Case2} ${6:param2}: ${0:Type2}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-enum-associated',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an enumeration with associated values'
        }
      });
    }
    
    if ('case'.startsWith(word)) {
      completions.push({
        label: 'case-simple',
        kind: CompletionItemKind.Snippet,
        detail: 'Simple enum case',
        insertText: '(case ${1:Name})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-case',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a simple enum case without values'
        }
      });
      
      completions.push({
        label: 'case-rawvalue',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with raw value',
        insertText: '(case ${1:Name} ${0:value})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-case-raw',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an enum case with a raw value'
        }
      });
      
      completions.push({
        label: 'case-associated',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with associated values',
        insertText: '(case ${1:Name} ${2:param1}: ${3:Type1} ${4:param2}: ${0:Type2})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-case-associated',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an enum case with associated values'
        }
      });
    }
    
    if ('lambda'.startsWith(word)) {
      completions.push({
        label: 'lambda-fn',
        kind: CompletionItemKind.Snippet,
        detail: 'Lambda function',
        insertText: '(lambda (${1:params})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-lambda',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an anonymous function'
        }
      });
    }
    
    if ('let'.startsWith(word)) {
      completions.push({
        label: 'let-binding',
        kind: CompletionItemKind.Snippet,
        detail: 'Simple let binding',
        insertText: '(let ${1:name} ${0:value})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-let',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a simple immutable binding'
        }
      });
      
      completions.push({
        label: 'let-multi',
        kind: CompletionItemKind.Snippet,
        detail: 'Multiple let bindings',
        insertText: '(let (${1:name1} ${2:value1}\n     ${3:name2} ${4:value2})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-let-multi',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates multiple bindings with a body'
        }
      });
    }
    
    if ('var'.startsWith(word)) {
      completions.push({
        label: 'var-binding',
        kind: CompletionItemKind.Snippet,
        detail: 'Mutable variable',
        insertText: '(var ${1:name} ${0:value})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-var',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a mutable variable'
        }
      });
    }
    
    if ('cond'.startsWith(word)) {
      completions.push({
        label: 'cond-expr',
        kind: CompletionItemKind.Snippet,
        detail: 'Conditional expression',
        insertText: '(cond\n  (${1:condition1}) ${2:result1}\n  (${3:condition2}) ${4:result2}\n  (else ${0:default-result}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-cond',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a multi-way conditional expression'
        }
      });
    }
    
    if ('when'.startsWith(word)) {
      completions.push({
        label: 'when-cond',
        kind: CompletionItemKind.Snippet,
        detail: 'Conditional execution',
        insertText: '(when ${1:condition}\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-when',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a conditional execution when true'
        }
      });
    }
    
    if ('unless'.startsWith(word)) {
      completions.push({
        label: 'unless-cond',
        kind: CompletionItemKind.Snippet,
        detail: 'Negative conditional execution',
        insertText: '(unless ${1:condition}\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-unless',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a conditional execution when false'
        }
      });
    }
    
    if ('do'.startsWith(word)) {
      completions.push({
        label: 'do-block',
        kind: CompletionItemKind.Snippet,
        detail: 'Sequential execution block',
        insertText: '(do\n  ${1:expr1}\n  ${0:expr2})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-do',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a sequential execution block'
        }
      });
    }
    
    if ('loop'.startsWith(word)) {
      completions.push({
        label: 'loop-recur',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with recur',
        insertText: '(loop (${1:var1} ${2:init1} ${3:var2} ${4:init2})\n  (if ${5:exit-condition}\n    ${6:result}\n    (recur ${7:next1} ${0:next2})))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-loop',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a loop with recursive binding'
        }
      });
    }
    
    if ('for'.startsWith(word)) {
      completions.push({
        label: 'for-loop',
        kind: CompletionItemKind.Snippet,
        detail: 'For loop',
        insertText: '(for (${1:i} from: ${2:0} to: ${3:10} by: ${4:1})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-for',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a for loop with named parameters'
        }
      });
    }
    
    if ('while'.startsWith(word)) {
      completions.push({
        label: 'while-loop',
        kind: CompletionItemKind.Snippet,
        detail: 'While loop',
        insertText: '(while ${1:condition}\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-while',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a while loop'
        }
      });
    }
    
    if ('repeat'.startsWith(word)) {
      completions.push({
        label: 'repeat-loop',
        kind: CompletionItemKind.Snippet,
        detail: 'Repeat loop',
        insertText: '(repeat ${1:count}\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-repeat',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Repeats a body a specific number of times'
        }
      });
    }
    
    if ('class'.startsWith(word)) {
      completions.push({
        label: 'class-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Class definition',
        insertText: '(class ${1:ClassName}\n  ;; Class fields\n  (var ${2:field1})\n  (let ${3:constField} ${4:value})\n\n  ;; Constructor\n  (constructor (${5:params})\n    ${6:constructorBody})\n\n  ;; Methods\n  (fn ${7:methodName} (${8:params})\n    ${0:methodBody}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-class',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a class with fields, constructor, and methods'
        }
      });

      completions.push({
        label: 'class-with-inheritance',
        kind: CompletionItemKind.Snippet,
        detail: 'Class with inheritance',
        insertText: '(class ${1:ClassName} extends ${2:ParentClass}\n  ;; Class fields\n  (var ${3:field1})\n\n  ;; Constructor\n  (constructor (${4:params})\n    (super ${5:parentParams})\n    ${6:constructorBody})\n\n  ;; Methods\n  (fn ${7:methodName} (${8:params})\n    ${0:methodBody}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-class-extends',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a class that extends a parent class'
        }
      });
    }

    if ('struct'.startsWith(word)) {
      completions.push({
        label: 'struct-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Struct definition',
        insertText: '(struct ${1:StructName}\n  (field ${2:field1}: ${3:Type1})\n  (field ${4:field2}: ${0:Type2}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-struct',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a struct with typed fields'
        }
      });
    }

    if ('field'.startsWith(word)) {
      completions.push({
        label: 'field-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Struct field',
        insertText: '(field ${1:name}: ${0:Type})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-field',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a field in a struct with type annotation'
        }
      });
    }

    if ('constructor'.startsWith(word)) {
      completions.push({
        label: 'constructor-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Class constructor',
        insertText: '(constructor (${1:params})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-constructor',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a constructor for a class'
        }
      });

      completions.push({
        label: 'constructor-with-super',
        kind: CompletionItemKind.Snippet,
        detail: 'Constructor with super call',
        insertText: '(constructor (${1:params})\n  (super ${2:parentParams})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-constructor-super',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a constructor that calls the parent constructor'
        }
      });
    }
    
    if ('super'.startsWith(word)) {
      completions.push({
        label: 'super-call',
        kind: CompletionItemKind.Snippet,
        detail: 'Super constructor call',
        insertText: '(super ${0:params})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-super',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Calls the parent class constructor'
        }
      });
    }
    
    if ('import'.startsWith(word)) {
      completions.push({
        label: 'import-symbols',
        kind: CompletionItemKind.Snippet,
        detail: 'Import symbols',
        insertText: '(import [${1:symbol1}, ${2:symbol2}] from "${0:path}")',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-import',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Imports specific symbols from a module'
        }
      });
      
      completions.push({
        label: 'import-alias',
        kind: CompletionItemKind.Snippet,
        detail: 'Import with alias',
        insertText: '(import [${1:symbol} as ${2:alias}] from "${0:path}")',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-import-as',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Imports a symbol with an alias'
        }
      });
      
      completions.push({
        label: 'import-ns',
        kind: CompletionItemKind.Snippet,
        detail: 'Import namespace',
        insertText: '(import ${1:namespace} from "${0:path}")',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-import-namespace',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Imports a module as a namespace'
        }
      });
    }
    
    if ('export'.startsWith(word)) {
      completions.push({
        label: 'export-symbols',
        kind: CompletionItemKind.Snippet,
        detail: 'Export symbols',
        insertText: '(export [${1:symbol1}, ${0:symbol2}])',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-export',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Exports multiple symbols'
        }
      });
      
      completions.push({
        label: 'export-named',
        kind: CompletionItemKind.Snippet,
        detail: 'Export with name',
        insertText: '(export "${1:name}" ${0:value})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-export-named',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Exports a value with a specific name'
        }
      });
    }
    
    if ('defmacro'.startsWith(word)) {
      completions.push({
        label: 'defmacro-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Define macro',
        insertText: '(defmacro ${1:name} (${2:params})\n  `(${0:body}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-defmacro',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a compile-time macro'
        }
      });
    }
    
    if ('vector'.startsWith(word) || 'vector-fn'.startsWith(word)) {
      completions.push({
        label: 'vector-literal',
        kind: CompletionItemKind.Snippet,
        detail: 'Vector/array literal',
        insertText: '[${1:item1}, ${2:item2}, ${0:item3}]',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-vector',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a vector/array literal'
        }
      });
      
      // This is a case where we might have a function with same name as a keyword
      completions.push({
        label: 'vector-fn',
        kind: CompletionItemKind.Snippet, 
        detail: 'Vector Creation',
        insertText: '(vector ${1:item1} ${2:item2} ${0:item3})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-vector-fn',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a vector using the vector function'
        }
      });
    }
    
    if ('object'.startsWith(word) || 'map'.startsWith(word)) {
      completions.push({
        label: 'object-literal',
        kind: CompletionItemKind.Snippet,
        detail: 'Object/map literal',
        insertText: '{"${1:key1}": ${2:value1}, "${3:key2}": ${0:value2}}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-object',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an object/map literal'
        }
      });
    }
    
    if ('set'.startsWith(word)) {
      completions.push({
        label: 'set-literal',
        kind: CompletionItemKind.Snippet,
        detail: 'Set literal',
        insertText: '#[${1:item1}, ${2:item2}, ${0:item3}]',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-set',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a set literal'
        }
      });
    }
    
    if ('if-let'.startsWith(word)) {
      completions.push({
        label: 'if-let-binding',
        kind: CompletionItemKind.Snippet,
        detail: 'Conditional binding',
        insertText: '(if-let (${1:name} ${2:value})\n  ${3:then-expr}\n  ${0:else-expr})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-if-let',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Binds a value if truthy and executes a branch'
        }
      });
    }
    
    if ('protocol'.startsWith(word)) {
      completions.push({
        label: 'protocol-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Protocol definition',
        insertText: '(protocol ${1:ProtocolName}\n  (fn ${2:methodName} (${3:params}): ${0:ReturnType}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-protocol',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a protocol with method signatures'
        }
      });
    }

    if ('interface'.startsWith(word)) {
      completions.push({
        label: 'interface-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Interface definition',
        insertText: '(interface ${1:InterfaceName}\n  (fn ${2:methodName} (${3:params}): ${0:ReturnType}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-interface',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines an interface with method signatures'
        }
      });
    }

    if ('implements'.startsWith(word)) {
      completions.push({
        label: 'implements-protocol',
        kind: CompletionItemKind.Snippet,
        detail: 'Implements protocol',
        insertText: 'implements ${0:ProtocolName}',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-implements',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Specifies that a class implements a protocol'
        }
      });
    }
    
    if ('match'.startsWith(word)) {
      completions.push({
        label: 'match-pattern',
        kind: CompletionItemKind.Snippet,
        detail: 'Pattern matching',
        insertText: '(match ${1:expression}\n  (${2:pattern1} ${3:result1})\n  (${4:pattern2} ${5:result2})\n  (${0:_} ${6:defaultResult}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-match',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Pattern matching expression with multiple cases'
        }
      });
    }

    if ('defmacro'.startsWith(word)) {
      completions.push({
        label: 'defmacro-def',
        kind: CompletionItemKind.Snippet,
        detail: 'Macro definition',
        insertText: '(defmacro ${1:macroName} (${2:params})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-defmacro',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a compile-time macro'
        }
      });
      
      completions.push({
        label: 'defmacro-with-syntax',
        kind: CompletionItemKind.Snippet,
        detail: 'Macro with syntax rules',
        insertText: '(defmacro ${1:macroName} (${2:params})\n  (syntax-rules ()\n    ((${3:pattern}) ${0:expansion})))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-defmacro-syntax',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a macro with pattern-based syntax rules'
        }
      });
    }
    
    if ('quasiquote'.startsWith(word)) {
      completions.push({
        label: 'quasiquote-expr',
        kind: CompletionItemKind.Snippet,
        detail: 'Quasiquote expression',
        insertText: '(quasiquote\n  (${1:template} ~(${0:unquote})))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-quasiquote',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Quasiquote with unquote for macro templates'
        }
      });
    }
    
    if ('loop'.startsWith(word)) {
      completions.push({
        label: 'loop-recur',
        kind: CompletionItemKind.Snippet,
        detail: 'Loop with recursion',
        insertText: '(loop [${1:var1} ${2:init1}\n      ${3:var2} ${4:init2}]\n  (if ${5:condition}\n    (recur ${6:next1} ${7:next2})\n    ${0:result}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-loop',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Tail-recursive loop with named variables'
        }
      });
    }
    
    if ('pipeline'.startsWith(word) || 'pipe'.startsWith(word)) {
      completions.push({
        label: 'pipeline',
        kind: CompletionItemKind.Snippet,
        detail: 'Data pipeline',
        insertText: '(->> ${1:initialValue}\n  (${2:function1} ${3:arg1})\n  (${4:function2})\n  (${0:function3}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-pipeline',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Thread-last pipeline operator for data transformation'
        }
      });
    }
    
    return completions;
  }
  
  /**
   * Handle completions for import statements
   */
  private handleImportCompletions(
    document: TextDocument,
    currentLine: string,
    fullText: string
  ): CompletionItem[] {
    // Match import statement with a path
    const importPathMatch = currentLine.match(/import\s+\[\s*([^,\s]*)\s*(?:,\s*([^,\s]*)\s*)?\]\s+from\s+["']([^"']*)$/);
    if (importPathMatch) {
      // We're in an import statement with a path
      const partialPath = importPathMatch[3] || '';
      
      // Provide path completions
      return this.getPathCompletionItems(partialPath, true);
    }
    
    // Check for import statement with module specified but cursor in the symbol area
    const importSymbolMatch = currentLine.match(/import\s+\[\s*([^,\s]*)?$/);
    if (importSymbolMatch || currentLine.match(/import\s+\[.*\]\s+from\s+["'](.+)["']\s*$/)) {
      // Extract module path from elsewhere in the line/context
      const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
      
      if (modulePath) {
        // Suggest importable symbols from that module
        return this.getImportableSymbols(modulePath);
      }
    }
    
    return [];
  }
  
  /**
   * Handle method chain completions (obj.method)
   */
  private handleMethodChainCompletions(
    document: TextDocument,
    currentLine: string
  ): CompletionItem[] {
    // Match object.method pattern
    const dotMatch = currentLine.match(/(\w+)\.\s*$/);
    if (!dotMatch) return [];
    
    const objectName = dotMatch[1];
    
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    // Check if this might be a class instance
    const classSymbol = symbols.find(s => 
      (s.kind === 5 || s.kind === 22) && // Class or Struct
      s.name.toLowerCase() === objectName.toLowerCase()
    );
    
    if (classSymbol) {
      const className = classSymbol.name;
      
      // Find all methods belonging to this class
      const classMethods = symbols.filter(s => 
        s.kind === 6 && // Method
        s.name.startsWith(`${className}.`)
      );
      
      if (classMethods.length > 0) {
        return classMethods.map(method => {
          const methodName = method.name.split('.')[1];
          return {
            label: methodName,
            kind: CompletionItemKind.Method,
            detail: `Method of ${className}`,
            sortText: `10-${methodName}`,
            data: method.data
          };
        });
      }
    }
    
    return [];
  }
  
  /**
   * Get file system completion items for a path
   */
  private getPathCompletionItems(
    partialPath: string,
    isImport: boolean
  ): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    
    if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
      return completionItems;
    }
    
    try {
      // Get workspace root folder
      const workspaceRoot = this.workspaceFolders[0].uri.replace('file://', '');
      
      // Determine base directory for the search
      let basePath = workspaceRoot;
      let searchPath = partialPath;
      
      // If partial path contains a directory part, use it as base
      const lastSlashIndex = partialPath.lastIndexOf('/');
      if (lastSlashIndex >= 0) {
        basePath = path.join(basePath, partialPath.substring(0, lastSlashIndex));
        searchPath = partialPath.substring(lastSlashIndex + 1);
      }
      
      // Read the directory
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      
      // Filter entries that match the search path
      for (const entry of entries) {
        // Skip hidden files unless explicitly looking for them
        if (entry.name.startsWith('.') && !searchPath.startsWith('.')) {
          continue;
        }
        
        // Skip node_modules
        if (entry.name === 'node_modules') {
          continue;
        }
        
        // Check if entry matches search prefix
        if (searchPath === '' || entry.name.startsWith(searchPath)) {
          const entryPath = lastSlashIndex >= 0 
            ? `${partialPath.substring(0, lastSlashIndex + 1)}${entry.name}`
            : entry.name;
            
          const isDir = entry.isDirectory();
          const completionItem: CompletionItem = {
            label: entry.name,
            kind: isDir ? CompletionItemKind.Folder : CompletionItemKind.File,
            detail: isDir ? 'Directory' : 'File',
            insertText: isDir ? `${entry.name}/` : entry.name,
            sortText: isDir ? `0-${entry.name}` : `1-${entry.name}` // Sort directories first
          };
          
          completionItems.push(completionItem);
        }
      }
    } catch (error) {
      console.error(`Error getting path completions: ${error}`);
    }
    
    return completionItems;
  }
  
  /**
   * Get importable symbols from a module
   */
  private getImportableSymbols(modulePath: string): CompletionItem[] {
    if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
      return [];
    }
    
    try {
      // Get workspace root folder
      const workspaceRoot = this.workspaceFolders[0].uri.replace('file://', '');
      
      // Resolve the module path
      const fullPath = path.join(workspaceRoot, modulePath);
      
      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        return [];
      }
      
      // Read the file
      const moduleText = fs.readFileSync(fullPath, 'utf-8');
      
      // Extract exported symbols from the module
      const exportedSymbols = this.extractExportedSymbols(moduleText);
      
      // Convert to completion items
      return exportedSymbols.map(symbol => ({
        label: symbol,
        kind: CompletionItemKind.Value,
        detail: `Exported from ${path.basename(modulePath)}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Symbol exported from module \`${modulePath}\``
        },
        data: {
          sourceModule: modulePath
        }
      }));
    } catch (error) {
      console.error(`Error getting importable symbols: ${error}`);
      return [];
    }
  }
  
  /**
   * Extract exported symbols from a module
   */
  private extractExportedSymbols(moduleText: string): string[] {
    const exportedSymbols: string[] = [];
    
    try {
      // Parse the module text
      const expressions = parse(moduleText, true);
      
      // Look for export forms
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'export') {
            // Check export syntax: (export [sym1, sym2, ...])
            if (expr.elements.length > 1 && isList(expr.elements[1])) {
              const exportList = expr.elements[1];
              
              // Extract symbols from the export list
              for (const elem of exportList.elements) {
                if (isSymbol(elem)) {
                  exportedSymbols.push(elem.name);
                }
              }
            }
            // Check named export: (export "name" symbol)
            else if (expr.elements.length > 2 && isString(expr.elements[1]) && isSymbol(expr.elements[2])) {
              const exportName = expr.elements[1].value;
              exportedSymbols.push(exportName);
            }
          }
        }
        
        // Also look for exportable definitions (fn, fx, let, var, enum, etc.)
        if (isList(expr) && expr.elements.length > 2 && isSymbol(expr.elements[0])) {
          const keyword = expr.elements[0].name;
          
          // Only consider top-level definitions
          if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct'].includes(keyword)) {
            if (isSymbol(expr.elements[1])) {
              exportedSymbols.push(expr.elements[1].name);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error extracting exported symbols: ${error}`);
    }
    
    return exportedSymbols;
  }
  
  /**
   * Check if a symbol name looks like a function based on naming conventions
   */
  private isLikelyFunction(name: string): boolean {
    // Common function naming patterns in HQL
    return (
      // Verbs or action-oriented names
      name.startsWith('get') || 
      name.startsWith('set') || 
      name.startsWith('create') || 
      name.startsWith('build') || 
      name.startsWith('find') || 
      name.startsWith('calculate') || 
      name.startsWith('make') || 
      name.startsWith('transform') || 
      // Functions with ? are usually predicates
      name.endsWith('?') ||
      // Names with 'to' often convert between types
      name.includes('To') ||
      // Common library functions
      name === 'map' ||
      name === 'filter' ||
      name === 'reduce' ||
      name === 'forEach' ||
      name === 'print' ||
      name === 'println' ||
      name.startsWith('console.')
    );
  }

  private getTypeCompletions(word: string): CompletionItem[] {
    const completions: CompletionItem[] = [];
    
    // Basic types
    const types = [
      { label: 'String', detail: 'String type', doc: 'String type for text values' },
      { label: 'Number', detail: 'Number type', doc: 'Numeric type for integers and floats' },
      { label: 'Boolean', detail: 'Boolean type', doc: 'Boolean type (true/false)' },
      { label: 'Any', detail: 'Any type', doc: 'Dynamic type that can hold any value' },
      { label: 'Void', detail: 'Void type', doc: 'Represents no value (for function returns)' },
      { label: 'Nil', detail: 'Nil type', doc: 'Represents the absence of a value' },
      { label: 'Date', detail: 'Date type', doc: 'Date and time representation' },
      { label: 'RegExp', detail: 'RegExp type', doc: 'Regular expression type' },
      { label: 'Error', detail: 'Error type', doc: 'Error type for exceptions' }
    ];
    
    // Generic types
    const genericTypes = [
      { label: 'Array<${1:T}>', detail: 'Array type', doc: 'Generic array type' },
      { label: 'Vector<${1:T}>', detail: 'Vector type', doc: 'Immutable vector type' },
      { label: 'Set<${1:T}>', detail: 'Set type', doc: 'Set collection type' },
      { label: 'Map<${1:K}, ${2:V}>', detail: 'Map type', doc: 'Key-value map type' },
      { label: 'Optional<${1:T}>', detail: 'Optional type', doc: 'Value that might be null/nil' },
      { label: 'Promise<${1:T}>', detail: 'Promise type', doc: 'Asynchronous promise type' },
      { label: 'Result<${1:T}, ${2:E}>', detail: 'Result type', doc: 'Success or error result type' },
      { label: 'Function<(${1:Args}) -> ${2:ReturnType}>', detail: 'Function type', doc: 'Function type signature' }
    ];
    
    // Add basic types
    for (const type of types) {
      if (type.label.toLowerCase().startsWith(word.toLowerCase())) {
        completions.push({
          label: type.label,
          kind: CompletionItemKind.TypeParameter,
          detail: type.detail,
          insertText: type.label,
          sortText: `02-type-${type.label}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: type.doc
          }
        });
      }
    }
    
    // Add generic type patterns
    for (const type of genericTypes) {
      if (type.label.split('<')[0].toLowerCase().startsWith(word.toLowerCase())) {
        completions.push({
          label: type.label.split('<')[0],
          kind: CompletionItemKind.TypeParameter,
          detail: type.detail,
          insertText: type.label,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `02-generic-${type.label.split('<')[0]}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: type.doc
          }
        });
      }
    }
    
    // Type annotation patterns
    if ('type'.startsWith(word)) {
      completions.push({
        label: 'type-alias',
        kind: CompletionItemKind.Snippet,
        detail: 'Type alias definition',
        insertText: '(type ${1:AliasName} ${0:TargetType})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-alias',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a type alias'
        }
      });
      
      completions.push({
        label: 'type-union',
        kind: CompletionItemKind.Snippet,
        detail: 'Union type definition',
        insertText: '(type ${1:UnionName} (union ${2:Type1} ${3:Type2} ${0:Type3}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-union',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines a union type'
        }
      });
      
      completions.push({
        label: 'type-intersection',
        kind: CompletionItemKind.Snippet,
        detail: 'Intersection type definition',
        insertText: '(type ${1:IntersectionName} (intersection ${2:Type1} ${3:Type2} ${0:Type3}))',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-type-intersection',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Defines an intersection type'
        }
      });
    }
    
    return completions;
  }
}

/**
 * Setup a completion item for display
 */
export function setupCompletionItem(completionItem: CompletionItem): CompletionItem {
  // Add additional setup as needed
  return completionItem;
}