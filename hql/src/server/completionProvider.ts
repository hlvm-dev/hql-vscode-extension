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
 * @see {import('vscode-languageserver').CompletionItem}
 * @see {import('vscode-languageserver').CompletionItemKind}
 */
export class CompletionProvider {
  private symbolManager: SymbolManager;
  private workspaceFolders: { uri: string }[] | null = null;
  private dynamicValueCache: Map<string, CompletionItem[]> = new Map();
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
      const document = this.symbolManager.getDocument(params.textDocument.uri);
      if (!document) {
        return [];
      }
      
      this.updateDynamicValues(document);
      
      const position = params.position;
      const linePrefix = document.getText({
        start: { line: position.line, character: 0 },
        end: position
      });
      
      console.log(`[HQL Completion] Prefix: "${linePrefix}"`);
      
      const fullText = document.getText();
      
      // Get the current line
      const currentLine = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
      });
      
      // Special case for import 'from' followed by dot, even when no symbol is between import and from
      const importFromDotMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])(\.*)(["']?)$/);
      if (importFromDotMatch) {
        const [_, quoteType, dotPrefix, endQuote] = importFromDotMatch;
        // Handle different dot patterns
        if (dotPrefix === '.') {
          return [
            {
              label: './',
              kind: CompletionItemKind.Folder,
              detail: 'Current directory',
              insertText: './'.substring(dotPrefix.length),
              insertTextFormat: InsertTextFormat.PlainText,
              command: {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
              }
            },
            {
              label: '../',
              kind: CompletionItemKind.Folder,
              detail: 'Parent directory',
              insertText: '../'.substring(dotPrefix.length),
              insertTextFormat: InsertTextFormat.PlainText,
              command: {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
              }
            }
          ];
        } else if (dotPrefix === '..') {
          return [{
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '../'.substring(dotPrefix.length),
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestion',
              command: 'editor.action.triggerSuggest'
            }
          }];
        }
      }
      
      // Special case for import with empty quotations: from ""
      const emptyQuoteMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])$/);
      if (emptyQuoteMatch) {
        return [
          {
            label: './',
            kind: CompletionItemKind.Folder,
            detail: 'Current directory',
            insertText: './',
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestion',
              command: 'editor.action.triggerSuggest'
            }
          },
          {
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '../',
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestion',
              command: 'editor.action.triggerSuggest'
            }
          }
        ];
      }
      
      // Special case for import paths ending with a slash
      // This specifically handles cases after selecting a directory from completion
      const importPathMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/)(["']?)$/);
      if (importPathMatch) {
        const [_, quoteType, directoryPath, endQuote] = importPathMatch;
        
        // If the current line still has the ending quote, remove it from our path
        const cleanPath = directoryPath.endsWith(quoteType) 
          ? directoryPath.substring(0, directoryPath.length - 1)
          : directoryPath;
          
        // Provide path completions inside this directory
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        return this.getRelativePathCompletionItems(documentDir, cleanPath);
      }
      
      // Detect when a directory has just been selected from autocomplete
      // This handles the case when the user selects a directory that gets inserted with trailing slash
      const recentlySelectedDirMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/(?:[^\/'"]+)\/)(["']?)$/);
      if (recentlySelectedDirMatch) {
        const [_, quoteType, directoryPath, endQuote] = recentlySelectedDirMatch;
        
        // Provide path completions inside this directory
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        return this.getRelativePathCompletionItems(documentDir, directoryPath);
      }
      
      // Special case for paths that just had a slash added - trigger completion without needing to remove/retype
      // This captures when a user just typed a slash after a directory name in an import path
      const recentlyAddedSlashMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?)(\/)$/);
      if (recentlyAddedSlashMatch) {
        const [_, quoteType, dirPath, slash] = recentlyAddedSlashMatch;
        const fullPath = dirPath + slash;
        
        // Provide path completions for the directory
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        
        // Get completions with the slash intact
        return this.getRelativePathCompletionItems(documentDir, fullPath);
      }
      
      // Check for enum values in function call context: (install os: |)
      const paramWithTypeMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/);
      if (paramWithTypeMatch) {
        // Find the function and parameter name to get type context
        const funcParamMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/);
        if (funcParamMatch) {
          const [_, funcName, paramName] = funcParamMatch;
          // Get completions for this typed parameter
          const enumCompletions = this.getParameterEnumValueCompletions(document, funcName, paramName);
          if (enumCompletions.length > 0) {
            return enumCompletions;
          }
        }
      }
      
      // Check for enum dot notation shorthand: (= .|) or (install os: .|)
      const enumDotMatch = linePrefix.match(/\S+\s+\.$/);
      if (enumDotMatch) {
        // Check if it's in parameter context for an enum type
        const paramContextMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/);
        if (paramContextMatch) {
          const paramName = paramContextMatch[1];
          // Find parameter type for full context
          const functionMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
          if (functionMatch) {
            const funcName = functionMatch[1];
            const enumCompletions = this.getParameterEnumValueCompletions(document, funcName, paramName, true);
            if (enumCompletions.length > 0) {
              return enumCompletions;
            }
          }
        }
        
        // Check if we're in a direct function call with dot
        const directFunctionDotMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+\.$/);
        if (directFunctionDotMatch) {
          const funcName = directFunctionDotMatch[1];
          
          // Find function symbol
          const symbols = this.symbolManager.getDocumentSymbols(document.uri);
          const functionSymbol = symbols.find(s => 
            (s.kind === 12 || s.kind === 6) && // Function or Method
            s.name === funcName
          );
          
          // Check if function has an enum parameter as first param
          if (functionSymbol && 
              functionSymbol.data?.params && 
              functionSymbol.data.params.length > 0) {
            
            const firstParam = functionSymbol.data.params[0];
            if (firstParam.type && this.symbolManager.isEnumType(firstParam.type)) {
              // Return enum values for this parameter
              return this.getEnumValueCompletions(document, firstParam.type, true);
            }
          }
        }
        
        // Generic enum case completions if specific context not found
        return this.getAllEnumCaseCompletions(document);
      }
      
      // Check for function call context: (functionName |
      const funcCallMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
      if (funcCallMatch) {
        const functionName = funcCallMatch[1];
        console.log(`[HQL Completion] Function call detected: ${functionName}`);
        const paramCompletions = this.getParameterCompletions(document, functionName);
        console.log(`[HQL Completion] Parameter completions count: ${paramCompletions.length}`);
        if (paramCompletions.length > 0) {
          console.log(`[HQL Completion] Returning parameter completions for ${functionName}`);
          return paramCompletions;
        }
      }
      
      // Check for named parameter in function call: (functionName param: |
      const namedParamMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/);
      if (namedParamMatch) {
        console.log(`[HQL Completion] Named parameter context detected`);
        // Extract function and parameter name to provide type-specific completions
        const funcParamParts = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/);
        if (funcParamParts) {
          const [_, funcName, paramName] = funcParamParts;
          console.log(`[HQL Completion] Function: ${funcName}, Parameter: ${paramName}`);
          // Check if we should return enum values first
          const enumCompletions = this.getParameterEnumValueCompletions(document, funcName, paramName);
          console.log(`[HQL Completion] Enum completions count: ${enumCompletions.length}`);
          if (enumCompletions.length > 0) {
            console.log(`[HQL Completion] Returning enum completions for ${paramName}`);
            return enumCompletions;
          }
          
          // Otherwise fall back to regular parameter value completions
          const valueCompletions = this.getParameterValueCompletions(document, funcName, paramName);
          console.log(`[HQL Completion] Parameter value completions count: ${valueCompletions.length}`);
          return valueCompletions;
        }
      }
      
      // Check for import completions
      if (currentLine.includes('import') && (
          linePrefix.includes('import') || 
          linePrefix.includes('from') || 
          linePrefix.includes('['))) {
        return this.handleImportCompletions(document, linePrefix, currentLine, fullText);
      }
      
      // Check for export completions
      if (currentLine.includes('export') && (
          linePrefix.includes('export') || 
          linePrefix.includes('['))) {
        return this.handleExportCompletions(document, linePrefix, fullText);
      }
      
      // Check for enum value completions with dot notation
      if (linePrefix.includes('.')) {
        const dotCompletions = this.handleEnumDotCompletions(document, position);
        if (dotCompletions.length > 0) {
          return dotCompletions;
        }
        
        // Check for method chain completions
        const methodChainCompletions = this.handleMethodChainCompletions(document, linePrefix);
        if (methodChainCompletions.length > 0) {
          return methodChainCompletions;
        }
      }
  
      // Get the word at the cursor position
      const word = this.getWordAtPosition(linePrefix);
      
      // Start building completion items
      let completions: CompletionItem[] = [];
      
      // Add standard library completions
      completions = completions.concat(this.getStdLibCompletions(word));
      
      // Add document symbols
      completions = completions.concat(
        this.getDocumentSymbolCompletions(document, position, word)
      );
      
      // Check for function context - add corresponding templates
      const enclosingFunction = this.findEnclosingFunction(document, position);
      if (enclosingFunction) {
        const functionSpecificCompletions = this.getFunctionSpecificCompletions(enclosingFunction.name);
        if (functionSpecificCompletions.length > 0) {
          completions = completions.concat(functionSpecificCompletions);
        }
      }
      
      // Add template completions
      completions = completions.concat(
        this.getTemplateCompletions(word)
      );
      
      // Add type completions
      if (word.length > 0) {
        completions = completions.concat(
          this.getTypeCompletions(word)
        );
      }
      
      // Remove duplicates
      return this.mergeAndDeduplicate(completions);
    } catch (error) {
      console.error(`Error providing completions: ${error}`);
      return [];
    }
  }
  
    /**
   * Get enum value completions for a parameter that expects an enum type
   */
    private getParameterEnumValueCompletions(
      document: TextDocument, 
      functionName: string,
      paramName: string,
      shorthandDotNotation: boolean = false
    ): CompletionItem[] {
      console.log(`[HQL Completion] getParameterEnumValueCompletions called for function: ${functionName}, param: ${paramName}`);
      
      // Find the function in document symbols
      const symbols = this.symbolManager.getDocumentSymbols(document.uri);
      const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === functionName
      );
      
      // If we can't find the function or it has no parameters, return empty
      if (!functionSymbol || !functionSymbol.data?.params) {
        console.log(`[HQL Completion] Function symbol not found or has no params`);
        return [];
      }
      
      // Find the specific parameter
      const param = functionSymbol.data.params.find(p => p.name === paramName);
      if (!param || !param.type) {
        console.log(`[HQL Completion] Parameter ${paramName} not found or has no type`);
        // If no exact parameter match, check if this is the first parameter position
        // and function has any parameters that are enums
        if (functionSymbol.data.params.length > 0) {
          const firstParam = functionSymbol.data.params[0];
          if (firstParam.type && this.symbolManager.isEnumType(firstParam.type)) {
            console.log(`[HQL Completion] Using first parameter as fallback: ${firstParam.name}: ${firstParam.type}`);
            return this.getEnumValueCompletions(document, firstParam.type, shorthandDotNotation);
          }
        }
        return [];
      }
      
      console.log(`[HQL Completion] Found parameter ${paramName}: ${param.type}`);
      
      // Check if parameter is an enum type
      const enumType = symbols.find(s => 
        s.kind === 10 && // Enum
        s.name === param.type
      );
      
      if (enumType) {
        console.log(`[HQL Completion] Found enum type symbol for ${param.type}`);
        // Return enum case completions
        return this.getEnumValueCompletions(document, param.type, shorthandDotNotation);
      }
      
      // Try to check directly with symbol manager
      if (this.symbolManager.isEnumType(param.type)) {
        console.log(`[HQL Completion] Symbol manager confirms ${param.type} is an enum type`);
        return this.getEnumValueCompletions(document, param.type, shorthandDotNotation);
      }
      
      console.log(`[HQL Completion] ${param.type} is not detected as an enum type`);
      return [];
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
   * Provides completions for parameter values, particularly for enum types
   */
  private getParameterValueCompletions(
    document: TextDocument,
    functionName: string,
    paramName: string
  ): CompletionItem[] {
    // Find the function in document symbols
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
      (s.kind === 12 || s.kind === 6) && // Function or Method
      s.name === functionName
    );
    
    // If we can't find the function or it has no parameters, return empty
    if (!functionSymbol || !functionSymbol.data?.params) {
      return [];
    }
    
    // Find the specific parameter
    const param = functionSymbol.data.params.find(p => p.name === paramName);
    if (!param || !param.type) {
      return [];
    }
    
    // Check if parameter is an enum type
    const enumType = symbols.find(s => 
      s.kind === 10 && // Enum
      s.name === param.type
    );
    
    if (enumType) {
      // Return enum case completions
      return this.getEnumValueCompletions(document, param.type);
    }
    
    // For other types, provide type-specific completions
    switch (param.type.toLowerCase()) {
      case 'bool':
      case 'boolean':
        return [
          {
            label: 'true',
            kind: CompletionItemKind.Value,
            detail: 'Boolean true value',
            sortText: '01-true'
          },
          {
            label: 'false',
            kind: CompletionItemKind.Value,
            detail: 'Boolean false value',
            sortText: '01-false'
          }
        ];
        
      case 'string':
        return [
          {
            label: '""',
            kind: CompletionItemKind.Value,
            detail: 'Empty string',
            insertText: '""',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '01-string'
          },
          {
            label: '"${1:text}"',
            kind: CompletionItemKind.Snippet,
            detail: 'String with placeholder',
            insertText: '"${1:text}"',
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '02-string-placeholder'
          }
        ];
        
      case 'int':
      case 'float':
      case 'number':
        // For numeric types, we could suggest common values but for now keep it simple
        if (param.defaultValue) {
          return [{
            label: param.defaultValue,
            kind: CompletionItemKind.Value,
            detail: `Default value for ${paramName}`,
            sortText: '01-default'
          }];
        }
        return [];
        
      default:
        // For other types, no specific completion
        return [];
    }
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
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    // 1. Check for parameter context in function call: (install os: .)
    const paramTypeMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/);
    if (paramTypeMatch) {
      const [_, funcName, paramName] = paramTypeMatch;
      
      // Get parameter type from the symbol manager
      const paramType = this.symbolManager.getParameterType(funcName, paramName, document.uri);
      
      if (paramType && this.symbolManager.isEnumType(paramType)) {
        // Return enum case completions for this parameter type
        return this.getEnumValueCompletions(document, paramType, true);
      }
    }
    
    // 2. Check for direct function call with dot: (install .)
    const directFunctionCallMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+\.$/);
    if (directFunctionCallMatch) {
      const [_, funcName] = directFunctionCallMatch;
      
      // Find function symbol
      const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === funcName
      );
      
      // Check if function has parameters and the first one is an enum
      if (functionSymbol && 
          functionSymbol.data?.params && 
          functionSymbol.data.params.length > 0) {
        
        const firstParam = functionSymbol.data.params[0];
        if (firstParam.type && this.symbolManager.isEnumType(firstParam.type)) {
          // If first parameter is an enum, show its cases
          return this.getEnumValueCompletions(document, firstParam.type, true);
        }
      }
    }
    
    // 3. Check for direct enum type reference (Type.case)
    const enumMatch = beforeDot.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    if (enumMatch) {
      const [_, typeName] = enumMatch;
      
      // Verify this is actually an enum type
      const enumType = symbols.find(s => 
        s.kind === 10 && // Enum
        s.name === typeName
      );
      
      if (enumType) {
        return this.getEnumValueCompletions(document, typeName, true);
      }
    }
    
    // 4. Check if we're in a pattern matching case for an enum
    const matchPatternMatch = currentLine.match(/\(\s*match\s+(\w+).*\(\s*\.\s*$/);
    if (matchPatternMatch) {
      const [_, matchedVar] = matchPatternMatch;
      
      // Find the type of the matched variable
      const varSymbol = symbols.find(s => 
        s.kind === 13 && // Variable
        s.name === matchedVar &&
        s.data?.type
      );
      
      if (varSymbol && this.symbolManager.isEnumType(varSymbol.data!.type!)) {
        return this.getEnumValueCompletions(document, varSymbol.data!.type!, true);
      }
    }
    
    // 5. If we're in a function parameter list, don't show unrelated enum completions
    const inParamListMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+[^)]*\.$/);
    if (inParamListMatch) {
      // Try to extract function name
      const funcMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        
        // Find function symbol
        const functionSymbol = symbols.find(s => 
          (s.kind === 12 || s.kind === 6) && // Function or Method
          s.name === funcName
        );
        
        if (functionSymbol && 
            functionSymbol.data?.params && 
            functionSymbol.data.params.length > 0) {
          
          // If dot is used in position where enum parameter would be expected,
          // return all enum cases that would be valid for any parameter of this function
          const enumParams = functionSymbol.data.params
            .filter(p => p.type && this.symbolManager.isEnumType(p.type));
          
          if (enumParams.length > 0) {
            // Get completions for first enum parameter
            return this.getEnumValueCompletions(document, enumParams[0].type!, true);
          }
        }
      }
    }
    
    // 6. Special handling for shorthand dot notation in specific contexts
    // If we're at the start of an argument list, suggest all enum cases
    const startOfArg = linePrefix.match(/[\(,]\s*\.$/);
    if (startOfArg) {
      return this.getAllEnumCaseCompletions(document);
    }
    
    // Default: don't return enum completions for random dots
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
          const enumCompletions = enumCases.map(enumCase => {
            // Extract just the case name without the enum prefix
            const caseName = enumCase.name.includes('.') 
              ? enumCase.name.split('.')[1] 
              : enumCase.name;
            
            return {
              label: caseName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${enumName}`,
              documentation: {
                kind: MarkupKind.Markdown,
                value: enumCase.data?.documentation || `Enum case from \`${enumName}\``
              },
              data: {
                enumName: enumName
              }
            };
          });
          
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
  private getEnumValueCompletions(
    document: TextDocument, 
    enumType: string, 
    shorthandDotNotation: boolean = false
  ): CompletionItem[] {
    // Check if we have cached values for this enum
    const cachedItems = this.dynamicValueCache.get(`enum:${enumType}`);
    if (cachedItems) {
      return cachedItems.map(item => {
        // Clone the item so we don't modify the cached version
        const newItem = { ...item };
        
        if (shorthandDotNotation) {
          // For shorthand dot notation, we just need the case name
          newItem.label = item.label;
          newItem.insertText = item.label;
        } else {
          // For regular notation, use proper enum format: EnumType.CaseName
          newItem.label = item.label;
          newItem.insertText = `${enumType}.${item.label}`;
        }
        
        // High priority sorting for enum values
        newItem.sortText = `00-${item.label}`;
        return newItem;
      });
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
          insertText: shorthandDotNotation ? caseName : `${enumType}.${caseName}`,
          sortText: `00-${caseName}`, // High priority for enum values
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
                      insertText: shorthandDotNotation ? caseName.name : `${enumType}.${caseName.name}`,
                      sortText: `00-${caseName.name}`,
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
   * Provides comprehensive function call patterns based on function signature
   */
  private getParameterCompletions(document: TextDocument, funcName: string): CompletionItem[] {
    console.log(`[HQL Completion] getParameterCompletions called for function: ${funcName}`);
    
    // Find the function in document symbols
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
      (s.kind === 12 || s.kind === 6) && // Function or Method
      s.name === funcName
    );
    
    // If we can't find the function or it has no parameters, return empty
    if (!functionSymbol || !functionSymbol.data?.params) {
      console.log(`[HQL Completion] Function symbol not found or has no params`);
      return [];
    }
    
    console.log(`[HQL Completion] Function found with params:`, JSON.stringify(functionSymbol.data.params));
    
    // Fix the parameters if they have colons in their names
    const fixedParams = this.fixParameterTypes(functionSymbol.data.params);
    console.log(`[HQL Completion] Fixed params:`, JSON.stringify(fixedParams));
    
    const params = fixedParams;
    const returnType = functionSymbol.data.returnType || 'Any';
    // Check if this is an fx function based on the isFx flag
    const isFx = functionSymbol.data?.isFx || false;
    
    // Check which parameters are required vs optional (have default values)
    const requiredParams = params.filter(p => !p.defaultValue);
    const optionalParams = params.filter(p => p.defaultValue);
    const allParamsHaveDefaults = requiredParams.length === 0 && optionalParams.length > 0;
    
    const completions: CompletionItem[] = [];
    
    // 1. Add enum value completions first (highest priority)
    if (params.length > 0) {
      // Check for enum parameters and prioritize them
      for (const param of params) {
        if (param.type && this.symbolManager.isEnumType(param.type)) {
          console.log(`[HQL Completion] Parameter ${param.name} is enum type: ${param.type}`);
          
          // Get enum values for this type
          const enumCompletions = this.getEnumValueCompletions(document, param.type, false);
          console.log(`[HQL Completion] Found ${enumCompletions.length} enum values for ${param.type}`);
          
          // Format them as parameter values
          const formattedEnumCompletions = enumCompletions.map(comp => {
            const item: CompletionItem = {
              label: `${param.name}: ${comp.label}`,
              kind: CompletionItemKind.EnumMember,
              detail: `Set ${param.name} to ${comp.label} (${param.type})`,
              documentation: comp.documentation,
              insertText: `${param.name}: ${comp.insertText || comp.label}`,
              sortText: `01-enum-${comp.label}`, // Highest priority
              insertTextFormat: InsertTextFormat.PlainText
            };
            return item;
          });
          
          completions.push(...formattedEnumCompletions);
          
          // Also add shorthand dot notation for the enum param
          completions.push({
            label: `${param.name}: .`,
            kind: CompletionItemKind.Snippet,
            detail: `Use shorthand dot notation for ${param.type} enum values`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `Shorthand dot notation for enum values. Type a dot to see available cases.`
            },
            insertText: `${param.name}: .`,
            sortText: `02-enum-dot`, // Second priority
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestions',
              command: 'editor.action.triggerSuggest'
            }
          });
        }
      }
    }
    
    // 2. Named parameters (third priority)
    if (params.length > 0) {
      const namedItems = params.map(p => `${p.name}: ${p.type || 'Any'}`).join(' ');
      completions.push({
        label: `(${funcName} ${namedItems})`,
        kind: CompletionItemKind.Snippet,
        detail: `Complete call with named arguments: (${funcName} ${namedItems})`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Complete function call with all parameters in named style.`
        },
        sortText: `03-named`, // Third priority
        insertText: namedItems,
        insertTextFormat: InsertTextFormat.PlainText
      });
    }
    
    // 3. Individual parameter completions - lower priority
    if (allParamsHaveDefaults || requiredParams.length === 1) {
      // If all params have defaults, or there's just one required param, we can offer named params
      params.forEach(param => {
        // Create named parameter completion with correct type
        const item: CompletionItem = {
          label: `${param.name}: ${param.type || 'Any'}`,
          kind: CompletionItemKind.Property,
          detail: `Parameter: ${param.type || 'Any'}${param.defaultValue ? ` = ${param.defaultValue}` : ''}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Named parameter for \`${funcName}\`${param.defaultValue ? `\n\nDefault value: \`${param.defaultValue}\`` : ''}`
          },
          sortText: `04-param-${param.name}`, // Fourth priority
          insertText: `${param.name}: ${param.type || 'Any'}`,
          insertTextFormat: InsertTextFormat.PlainText
        };
        
        completions.push(item);
        console.log(`[HQL Completion] Added parameter completion: ${param.name}: ${param.type || 'Any'}`);
      });
    }
    
    // 4. Positional parameters (lowest priority)
    if (params.length > 0) {
      // Positional
      const positionalItems = params.map(p => p.type || 'Any').join(' ');
      completions.push({
        label: `(${funcName} ${positionalItems})`,
        kind: CompletionItemKind.Snippet,
        detail: `Complete call with positional arguments: (${funcName} ${positionalItems})`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Complete function call with all parameters in positional style.`
        },
        sortText: `05-positional`, // Lowest priority
        insertText: positionalItems,
        insertTextFormat: InsertTextFormat.PlainText
      });
      console.log(`[HQL Completion] Added positional completion: ${positionalItems}`);
    }
    
    console.log(`[HQL Completion] Returning ${completions.length} total completions`);
    return completions;
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
    const completions: CompletionItem[] = [];
    
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    for (const symbol of symbols) {
      // Filter out symbols that don't match the current word prefix
      if (word && !symbol.name.toLowerCase().startsWith(word.toLowerCase())) {
        continue;
      }
      
      // Get completion kind based on symbol kind
      const kind = this.getCompletionKindForSymbol(symbol.kind);
      
      // Skip enum members when suggesting at top level
      // (they should be suggested via dot notation)
      if (symbol.kind === 11 && symbol.name.includes('.')) {
        continue;
      }
      
      // Create documentation
      let documentation = '';
      if (symbol.data?.documentation) {
        documentation = symbol.data.documentation;
      }
      
      // Create detail string
      let detail = '';
      if (symbol.kind === 12 || symbol.kind === 6) { // Function or Method
        // Build parameter details for functions and methods
        if (symbol.data?.params) {
          const params = symbol.data.params.map(p => 
            p.defaultValue 
              ? `${p.name}: ${p.type} = ${p.defaultValue}` 
              : `${p.name}: ${p.type}`
          ).join(' ');
          
          detail = `(${symbol.name} ${params})`;
          if (symbol.data.returnType) {
            detail += ` -> ${symbol.data.returnType}`;
          }
        }
      } else if (symbol.kind === 13) { // Variable
        if (symbol.data?.type) {
          detail = `${symbol.name}: ${symbol.data.type}`;
        } else {
          detail = symbol.name;
        }
      } else if (symbol.kind === 10) { // Enum
        detail = `enum ${symbol.name}`;
      } else if (symbol.kind === 5) { // Class
        detail = `class ${symbol.name}`;
      } else {
        detail = symbol.name;
      }
      
      // For functions (fn/fx), generate multiple calling pattern completions
      if (symbol.kind === 12 || symbol.kind === 6) { // Function or Method
        // Generate function call patterns
        const functionCompletions = this.generateFunctionCallCompletions(document, position, symbol.name);
        if (functionCompletions.length > 0) {
          completions.push(...functionCompletions);
          continue; // Skip the default completion for this function
        }
      }
      
      // Create the default completion item for non-function symbols
      const completionItem: CompletionItem = {
        label: symbol.name,
        kind: kind,
        detail: detail,
        documentation: documentation ? {
          kind: MarkupKind.Markdown,
          value: documentation
        } : undefined,
        data: {
          ...symbol.data,
          uri: document.uri,
          name: symbol.name
        }
      };
      
      // Add sort text to control sorting
      switch (symbol.kind) {
        case 12: // Function
          completionItem.sortText = `20-${symbol.name}`;
          break;
        case 6: // Method
          completionItem.sortText = `21-${symbol.name}`;
          break;
        case 5: // Class
          completionItem.sortText = `30-${symbol.name}`;
          break;
        case 10: // Enum
          completionItem.sortText = `40-${symbol.name}`;
          break;
        case 13: // Variable
          completionItem.sortText = `50-${symbol.name}`;
          break;
        default:
          completionItem.sortText = `90-${symbol.name}`;
      }
      
      completions.push(completionItem);
    }
    
    return completions;
  }
  
  /**
   * Generate multiple function call pattern completions for a function symbol
   */
  private generateFunctionCallCompletions(
    document: TextDocument, 
    position: Position, 
    funcName: string
  ): CompletionItem[] {
    console.log(`[HQL Completion] generateFunctionCallCompletions called for function: ${funcName}`);
    
    // 1. Find the function in document symbols
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
      (s.kind === 12 || s.kind === 6) && // Function or Method
      s.name === funcName
    );
    
    // If we can't find the function, return just a basic completion
    if (!functionSymbol) {
      console.log(`[HQL Completion] Function symbol not found`);
      return [{
        label: funcName,
        kind: CompletionItemKind.Function,
        insertText: `(${funcName} )`,
        sortText: `05-${funcName}`, // Lowest priority
        insertTextFormat: InsertTextFormat.PlainText
      }];
    }
    
    // 2. Get the parameters for the function
    let params = functionSymbol.data?.params || [];
    console.log(`[HQL Completion] Function parameters:`, JSON.stringify(params));
    
    // Fix parameters that may have colons in their names
    params = this.fixParameterTypes(params);
    console.log(`[HQL Completion] Fixed parameters:`, JSON.stringify(params));
    
    const completions: CompletionItem[] = [];
    
    // 3. Generate completions for enum parameters
    let hasEnumParams = false;
    
    for (const param of params) {
      if (param.type && this.symbolManager.isEnumType(param.type)) {
        hasEnumParams = true;
        console.log(`[HQL Completion] Found enum parameter: ${param.name} of type ${param.type}`);
        
        // Add shorthand dot notation completion
        completions.push({
          label: `(${funcName} ${param.name}: .)`,
          kind: CompletionItemKind.Snippet,
          detail: `Call with ${param.name} using shorthand enum notation`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Use \`.CaseName\` shorthand for enum \`${param.type}\``
          },
          insertText: `(${funcName} ${param.name}: .)`,
          sortText: `01-${funcName}-enum-dot`, // Highest priority
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestions',
            command: 'editor.action.triggerSuggest'
          }
        });
        
        // Add qualified name completion
        completions.push({
          label: `(${funcName} ${param.name}: ${param.type}.)`,
          kind: CompletionItemKind.Snippet,
          detail: `Call with ${param.name} using qualified enum name`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Use \`${param.type}.CaseName\` qualified name for enum \`${param.type}\``
          },
          insertText: `(${funcName} ${param.name}: ${param.type}.)`,
          sortText: `02-${funcName}-enum-qualified`, // Second priority
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestions',
            command: 'editor.action.triggerSuggest'
          }
        });
      }
    }
    
    // 4. Add named parameters completion
    if (params.length > 0) {
      const namedParams = params.map(p => `${p.name}: ${p.type || 'Any'}`).join(' ');
      
      completions.push({
        label: `(${funcName} ${namedParams})`,
        kind: CompletionItemKind.Snippet,
        detail: `Call with named parameters: (${funcName} ${namedParams})`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Complete function call with named parameters.`
        },
        insertText: `(${funcName} ${namedParams})`,
        sortText: `03-${funcName}-named`, // Third priority
        insertTextFormat: InsertTextFormat.PlainText
      });
    }
    
    // 5. Add positional parameters completion
    if (params.length > 0) {
      const positionalParams = params.map(p => p.type || 'Any').join(' ');
      
      completions.push({
        label: `(${funcName} ${positionalParams})`,
        kind: CompletionItemKind.Snippet,
        detail: `Call with positional parameters: (${funcName} ${positionalParams})`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Complete function call with positional parameters.`
        },
        insertText: `(${funcName} ${positionalParams})`,
        sortText: `04-${funcName}-positional`, // Fourth priority
        insertTextFormat: InsertTextFormat.PlainText
      });
    }
    
    // 6. Add basic function name completion (lowest priority)
    completions.push({
      label: funcName,
      kind: CompletionItemKind.Function,
      insertText: `(${funcName} `,
      sortText: `05-${funcName}`, // Lowest priority
      insertTextFormat: InsertTextFormat.PlainText
    });
    
    console.log(`[HQL Completion] Generated ${completions.length} function call completions`);
    return completions;
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
      // Add untyped fn variants
      completions.push({
        label: 'fn-untyped',
        kind: CompletionItemKind.Snippet,
        detail: 'Untyped Function Definition',
        insertText: '(fn ${1:name} (${2:param1} ${3:param2})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn-untyped',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an untyped function (maximum flexibility)'
        }
      });

      completions.push({
        label: 'fn-untyped-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Untyped Function with Default Values',
        insertText: '(fn ${1:name} (${2:param1} = ${3:default1} ${4:param2} = ${5:default2})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn-untyped-defaults',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an untyped function with default parameter values'
        }
      });
      
      completions.push({
        label: 'fn-untyped-rest',
        kind: CompletionItemKind.Snippet,
        detail: 'Untyped Function with Rest Parameters',
        insertText: '(fn ${1:name} (${2:param1} ${3:param2} & ${4:rest})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn-untyped-rest',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates an untyped function with rest parameters'
        }
      });

      // Add or keep the existing typed function templates
      completions.push({
        label: 'fn-function',
        kind: CompletionItemKind.Snippet,
        detail: 'Function Definition (fn)',
        insertText: '(fn ${1:name} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2}) (-> ${6:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fn',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a fully typed function definition with return type'
        }
      });
      
      completions.push({
        label: 'fn-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Function with Default Parameters',
        insertText: '(fn ${1:name} (${2:param1}: ${3:Type1} = ${4:defaultValue1} ${5:param2}: ${6:Type2} = ${7:defaultValue2}) (-> ${8:ReturnType})\n  ${0:body})',
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
        insertText: '(fx ${1:name} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2}) (-> ${6:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx', // Highest priority
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a pure typed function with mandatory return type'
        }
      });
      
      completions.push({
        label: 'fx-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Pure Function with Default Parameters',
        insertText: '(fx ${1:name} (${2:param1}: ${3:Type1} = ${4:defaultValue1} ${5:param2}: ${6:Type2} = ${7:defaultValue2}) (-> ${8:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx-defaults',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a pure function with default parameter values'
        }
      });
      
      completions.push({
        label: 'fx-mixed-defaults',
        kind: CompletionItemKind.Snippet,
        detail: 'Pure Function with Mixed Default Parameters',
        insertText: '(fx ${1:name} (${2:param1}: ${3:Type1} = ${4:defaultValue1} ${5:param2}: ${6:Type2}) (-> ${7:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx-mixed',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a pure function with a mix of default and required parameters'
        }
      });
      
      completions.push({
        label: 'fx-rest',
        kind: CompletionItemKind.Snippet,
        detail: 'Pure Function with Rest Parameters',
        insertText: '(fx ${1:name} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2} & ${6:rest}: [${7:Type3}]) (-> ${8:ReturnType})\n  ${0:body})',
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: '01-fx-rest',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Creates a pure function with rest parameters'
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
        insertText: 'recur ${0:values}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Recur back to the loop with new values'
        }
      });
    }
    
    if ('console.log'.startsWith(word)) {
      completions.push({
        label: 'String concatenation',
        kind: CompletionItemKind.Snippet,
        detail: 'Insert string formatting',
        insertText: '"${1:message}: " ${0:value}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Format values for printing with a label'
        }
      });
    }
    
    if ('fn'.startsWith(word)) {
      completions.push({
        label: 'param-with-type',
        kind: CompletionItemKind.Snippet,
        detail: 'Parameter with type annotation',
        insertText: '${1:name}: ${0:Type}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a parameter with type annotation'
        }
      });
      
      completions.push({
        label: 'param-with-default',
        kind: CompletionItemKind.Snippet,
        detail: 'Parameter with default value',
        insertText: '${1:name}: ${2:Type} = ${0:defaultValue}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a parameter with type and default value'
        }
      });
      
      completions.push({
        label: 'return-type',
        kind: CompletionItemKind.Snippet,
        detail: 'Function return type',
        insertText: '(-> ${0:ReturnType})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Specify the function return type'
        }
      });
      
      completions.push({
        label: 'enum-param',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum type parameter',
        insertText: '${1:paramName}: ${0:EnumType}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Parameter with enum type annotation'
        }
      });
    }
    
    if ('fx'.startsWith(word)) {
      completions.push({
        label: 'param-with-type',
        kind: CompletionItemKind.Snippet,
        detail: 'Parameter with type annotation',
        insertText: '${1:name}: ${0:Type}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a parameter with type annotation'
        }
      });
      
      completions.push({
        label: 'param-with-default',
        kind: CompletionItemKind.Snippet,
        detail: 'Parameter with default value',
        insertText: '${1:name}: ${2:Type} = ${0:defaultValue}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a parameter with type and default value'
        }
      });
      
      completions.push({
        label: 'return-type',
        kind: CompletionItemKind.Snippet,
        detail: 'Function return type',
        insertText: '(-> ${0:ReturnType})',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Specify the function return type'
        }
      });
      
      completions.push({
        label: 'enum-param',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum type parameter',
        insertText: '${1:paramName}: ${0:EnumType}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Parameter with enum type annotation'
        }
      });
    }
    
    // Add more function-specific completions as needed
    
    return completions;
  }
  
  /**
   * Handle completions for import statements
   */
  private handleImportCompletions(
    document: TextDocument,
    linePrefix: string,
    currentLine: string,
    fullText: string
  ): CompletionItem[] {
    // Special case for empty import with no symbol and just a dot: (import from ".|")
    const emptyImportDotMatch = linePrefix.match(/import\s+from\s+(['"])(\.*)(["']?)$/);
    if (emptyImportDotMatch) {
      const [_, quoteType, dotPrefix, endQuote] = emptyImportDotMatch;
      // Handle different dot patterns
      if (dotPrefix === '.') {
        return [
          {
            label: './',
            kind: CompletionItemKind.Folder,
            detail: 'Current directory',
            insertText: './'.substring(dotPrefix.length),
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestion',
              command: 'editor.action.triggerSuggest'
            }
          },
          {
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '../'.substring(dotPrefix.length),
            insertTextFormat: InsertTextFormat.PlainText,
            command: {
              title: 'Trigger Suggestion',
              command: 'editor.action.triggerSuggest'
            }
          }
        ];
      } else if (dotPrefix === '..') {
        return [{
          label: '../',
          kind: CompletionItemKind.Folder,
          detail: 'Parent directory',
          insertText: '../'.substring(dotPrefix.length),
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        }];
      }
    }
    
    // Special case for import with empty symbol and empty quotations: (import from "")
    const emptyQuoteMatch = linePrefix.match(/import\s+from\s+(['"])$/);
    if (emptyQuoteMatch) {
      return [
        {
          label: './',
          kind: CompletionItemKind.Folder,
          detail: 'Current directory',
          insertText: './',
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        },
        {
          label: '../',
          kind: CompletionItemKind.Folder,
          detail: 'Parent directory',
          insertText: '../',
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        }
      ];
    }
    
    // Match when a directory has been selected from autocompletion
    // This specifically handles cases after selecting a directory from completion
    const directorySelectedMatch = linePrefix.match(/import(?:\s+\[[^\]]*\]|\s+[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+(['"])([^'"]*\/)(["']?)$/);
    if (directorySelectedMatch) {
      const [_, quoteType, directoryPath] = directorySelectedMatch;
      
      // Provide path completions for the selected directory
      const documentPath = document.uri.replace('file://', '');
      const documentDir = path.dirname(documentPath);
      
      const completions = this.getRelativePathCompletionItems(documentDir, directoryPath);
      
      // Ensure all items have a trigger for the next autocompletion
      return completions.map(item => {
        if (item.kind === CompletionItemKind.Folder && !item.command) {
          item.command = {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          };
        }
        return item;
      });
    }
    
    // Special case for import paths ending with a slash
    // This specifically handles cases after selecting a directory from completion
    const importPathMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/)(["']?)$/);
    if (importPathMatch) {
      const [_, quoteType, directoryPath, endQuote] = importPathMatch;
      
      // If the current line still has the ending quote, remove it from our path
      const cleanPath = directoryPath.endsWith(quoteType) 
        ? directoryPath.substring(0, directoryPath.length - 1)
        : directoryPath;
        
      // Provide path completions inside this directory
      const documentPath = document.uri.replace('file://', '');
      const documentDir = path.dirname(documentPath);
      return this.getRelativePathCompletionItems(documentDir, cleanPath);
    }
    
    // Detect when a directory has just been selected from autocomplete
    // This handles the case when the user selects a directory that gets inserted with trailing slash
    const recentlySelectedDirMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/(?:[^\/'"]+)\/)(["']?)$/);
    if (recentlySelectedDirMatch) {
      const [_, quoteType, directoryPath, endQuote] = recentlySelectedDirMatch;
      
      // Provide path completions inside this directory
      const documentPath = document.uri.replace('file://', '');
      const documentDir = path.dirname(documentPath);
      return this.getRelativePathCompletionItems(documentDir, directoryPath);
    }
    
    // Special case for paths that just had a slash added - trigger completion without needing to remove/retype
    // This captures when a user just typed a slash after a directory name in an import path
    const recentlyAddedSlashMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?)(\/)$/);
    if (recentlyAddedSlashMatch) {
      const [_, quoteType, dirPath, slash] = recentlyAddedSlashMatch;
      const fullPath = dirPath + slash;
      
      // Provide path completions for the directory
      const documentPath = document.uri.replace('file://', '');
      const documentDir = path.dirname(documentPath);
      
      // Get completions with the slash intact
      return this.getRelativePathCompletionItems(documentDir, fullPath);
    }
    
    // Match import with vector style syntax: (import [sym
    const importVectorStartMatch = currentLine.match(/import\s+\[\s*([^,\s]*)$/);
    if (importVectorStartMatch) {
      const partialSymbol = importVectorStartMatch[1] || '';
      // Get module path from elsewhere in the text if available
      const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
      
      if (modulePath) {
        // We're in a vector import with a module path, offer symbols from that module
        return this.getImportableSymbols(modulePath).filter(item => 
          item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())
        );
      }
      return [];
    }
    
    // Match import with continuation of vector symbols: (import [sym1, sym
    const importVectorContinueMatch = currentLine.match(/import\s+\[.+,\s*([^,\s]*)$/);
    if (importVectorContinueMatch) {
      const partialSymbol = importVectorContinueMatch[1] || '';
      // Get module path from the line
      const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
      
      if (modulePath) {
        // Filter symbols that are already imported
        const alreadyImportedSymbols = currentLine.match(/import\s+\[(.*)\s*,\s*[^,\s]*$/)?.[1].split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim()) || [];
          
        return this.getImportableSymbols(modulePath)
          .filter(item => 
            item.label.toLowerCase().startsWith(partialSymbol.toLowerCase()) &&
            !alreadyImportedSymbols.includes(item.label)
          );
      }
      return [];
    }
    
    // Match namespace import: (import namesp
    const namespaceImportMatch = currentLine.match(/import\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (namespaceImportMatch) {
      // Suggest common namespace names or module names based on available modules
      const partialName = namespaceImportMatch[1];
      return this.getSuggestedNamespaces(partialName);
    }
    
    // Match 'from' keyword: (import [...] from
    const fromKeywordMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+$/);
    if (fromKeywordMatch) {
      // The user has typed 'from', suggest quote, "./" and "../" options
      const results = [];
      
      // Add double quote suggestion
      results.push({
        label: '"',
        kind: CompletionItemKind.Operator,
        detail: 'Start path string',
        insertText: '""',
        insertTextFormat: InsertTextFormat.Snippet,
        command: {
          title: 'Trigger Suggestion',
          command: 'editor.action.triggerSuggest'
        }
      });
      
      // Add ./ suggestion for current directory
      results.push({
        label: './',
        kind: CompletionItemKind.Folder,
        detail: 'Current directory',
        insertText: '"./"',
        insertTextFormat: InsertTextFormat.Snippet,
        command: {
          title: 'Trigger Suggestion',
          command: 'editor.action.triggerSuggest'
        }
      });
      
      // Add ../ suggestion for parent directory
      results.push({
        label: '../',
        kind: CompletionItemKind.Folder,
        detail: 'Parent directory',
        insertText: '"../"',
        insertTextFormat: InsertTextFormat.Snippet,
        command: {
          title: 'Trigger Suggestion',
          command: 'editor.action.triggerSuggest'
        }
      });
      
      return results;
    }

    // Match "from ." without quotes yet
    const fromDotMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+([\.]+)$/);
    if (fromDotMatch) {
      const dotPrefix = fromDotMatch[1];
      const results = [];
      
      if (dotPrefix === '.') {
        // After typing just a dot, suggest "./" and "../"
        results.push({
          label: './',
          kind: CompletionItemKind.Folder,
          detail: 'Current directory',
          insertText: '"./"',
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        });
        
        results.push({
          label: '../',
          kind: CompletionItemKind.Folder,
          detail: 'Parent directory',
          insertText: '"../"',
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        });
      } else if (dotPrefix === '..') {
        // After typing two dots, suggest "../"
        results.push({
          label: '../',
          kind: CompletionItemKind.Folder,
          detail: 'Parent directory',
          insertText: '"../"',
          insertTextFormat: InsertTextFormat.PlainText,
          command: {
            title: 'Trigger Suggestion',
            command: 'editor.action.triggerSuggest'
          }
        });
      }
      
      return results;
    }
    
    // Match paths after 'from': (import [...] from "path
    // Use a more precise regex that handles both single and double quotes
    const pathMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+(['"])([^'"]*?)$/);
    if (pathMatch) {
      // Extract quote type and partial path
      const [_, quoteType, partialPath] = pathMatch;
      
      console.log(`Import path with quote type ${quoteType}: "${partialPath}"`);
      
      // Provide path completions relative to current document
      const documentPath = document.uri.replace('file://', '');
      const documentDir = path.dirname(documentPath);
      
      // Get completions but preserve the quote type
      const completions = this.getRelativePathCompletionItems(documentDir, partialPath);
      
      // Return completions with original quote preserved
      return completions;
    }
    
    return [];
  }
  
  /**
   * Get file system completion items for a path relative to the active document
   */
  private getRelativePathCompletionItems(
    documentDir: string,
    partialPath: string
  ): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    
    try {
      // Determine base directory for the search
      let basePath = documentDir;
      let searchPath = partialPath;
      
      // Handle relative paths
      if (partialPath.startsWith('./')) {
        searchPath = partialPath.substring(2);
      } else if (partialPath.startsWith('../')) {
        // For parent directory references, navigate up
        let parentCount = 0;
        let currentPath = partialPath;
        
        while (currentPath.startsWith('../')) {
          parentCount++;
          currentPath = currentPath.substring(3);
        }
        
        // Navigate up parent directories
        let tempBasePath = basePath;
        for (let i = 0; i < parentCount; i++) {
          tempBasePath = path.dirname(tempBasePath);
        }
        
        basePath = tempBasePath;
        searchPath = currentPath;
      } else if (partialPath === '.' || partialPath === '..') {
        // Just a dot or double dot
        searchPath = '';
        if (partialPath === '..') {
          basePath = path.dirname(basePath);
        }
      }
      
      // If partial path contains additional directory parts, use them as base
      const lastSlashIndex = searchPath.lastIndexOf('/');
      if (lastSlashIndex >= 0) {
        basePath = path.join(basePath, searchPath.substring(0, lastSlashIndex));
        searchPath = searchPath.substring(lastSlashIndex + 1);
      }
      
      // Read the directory
      const entries = fs.readdirSync(basePath, { withFileTypes: true });
      
      // Filter entries that match the search path
      for (const entry of entries) {
        // Skip hidden files unless explicitly looking for them
        if (entry.name.startsWith('.') && !searchPath.startsWith('.')) {
          continue;
        }
        
        // Skip node_modules and other typical exclude directories
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
          continue;
        }
        
        // Check if entry matches search prefix
        if (searchPath === '' || entry.name.toLowerCase().startsWith(searchPath.toLowerCase())) {
          let entryPath = lastSlashIndex >= 0 
            ? `${partialPath.substring(0, lastSlashIndex + 1)}${entry.name}`
            : entry.name;
            
          // Preserve the starting ./ or ../ in the completion
          if (partialPath.startsWith('./') && !entryPath.startsWith('./')) {
            entryPath = `./${entryPath}`;
          } else if (partialPath.startsWith('../') && !entryPath.startsWith('../')) {
            // Count the number of ../ at the beginning
            const match = partialPath.match(/^(\.\.\/)+/);
            if (match && match[0]) {
              entryPath = `${match[0]}${entryPath}`;
            }
          }
          
          const isDir = entry.isDirectory();
          const isHqlFile = entry.name.endsWith('.hql');
          const isJsFile = entry.name.endsWith('.js');
          
          // Include directories, .hql and .js files
          if (isDir || isHqlFile || isJsFile) {
            const completionItem: CompletionItem = {
              label: entry.name,
              kind: isDir ? CompletionItemKind.Folder : CompletionItemKind.File,
              detail: isDir ? 'Directory' : (isHqlFile ? 'HQL Module' : 'JS Module'),
              insertText: isDir ? `${entry.name}/` : entry.name,
              sortText: isDir ? `0-${entry.name}` : `1-${entry.name}` // Sort directories first
            };
            
            // For files, insert just the name (even if file extension isn't in search)
            if ((isHqlFile && !searchPath.endsWith('.hql')) || 
                (isJsFile && !searchPath.endsWith('.js'))) {
              completionItem.insertText = entry.name;
            }
            
            // Add command to automatically trigger suggestion after selecting a folder
            if (isDir) {
              completionItem.command = {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
              };
            }
            
            completionItems.push(completionItem);
          }
        }
      }
    } catch (error) {
      console.error(`Error getting path completions: ${error}`);
    }
    
    return completionItems;
  }
  
  /**
   * Get suggested namespace names for namespace imports
   */
  private getSuggestedNamespaces(partialName: string): CompletionItem[] {
    // This could be enhanced to look at available modules and suggest names based on filenames
    const namespaces: CompletionItem[] = [];
    
    try {
      if (!this.workspaceFolders || this.workspaceFolders.length === 0) {
        return namespaces;
      }
      
      const workspaceRoot = this.workspaceFolders[0].uri.replace('file://', '');
      
      // Recursively find .hql files in the workspace
      const findHqlFiles = (dir: string, depth: number = 0): string[] => {
        if (depth > 3) return []; // Limit recursion depth
        
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          let files: string[] = [];
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && 
                entry.name !== 'node_modules' && 
                entry.name !== '.git' && 
                !entry.name.startsWith('.')) {
              files = [...files, ...findHqlFiles(fullPath, depth + 1)];
            } else if (entry.isFile() && entry.name.endsWith('.hql')) {
              files.push(fullPath);
            }
          }
          
          return files;
        } catch (error) {
          return [];
        }
      };
      
      const hqlFiles = findHqlFiles(workspaceRoot);
      
      // Create suggested namespace names from filenames
      for (const filePath of hqlFiles) {
        const relativePath = path.relative(workspaceRoot, filePath);
        const fileName = path.basename(filePath, '.hql');
        
        // Convert filename to camelCase for namespace suggestion
        const namespaceName = fileName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        
        if (namespaceName.toLowerCase().startsWith(partialName.toLowerCase())) {
          namespaces.push({
            label: namespaceName,
            kind: CompletionItemKind.Module,
            detail: `Namespace for ${relativePath}`,
            insertText: namespaceName,
            sortText: `09-${namespaceName}`
          });
        }
      }
    } catch (error) {
      console.error(`Error getting namespace suggestions: ${error}`);
    }
    
    return namespaces;
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
    
    // First check if this is a JavaScript built-in object
    const jsObjectCompletions = this.getJavaScriptObjectCompletions(objectName);
    if (jsObjectCompletions.length > 0) {
      return jsObjectCompletions;
    }
    
    const symbols = this.symbolManager.getDocumentSymbols(document.uri);
    
    // Check if variable is a known collection type (Array, String)
    const varSymbol = symbols.find(s => 
      s.kind === 13 && // Variable
      s.name === objectName
    );
    
    if (varSymbol && varSymbol.data?.type) {
      // Handle collection types
      if (varSymbol.data.type === 'Array' || varSymbol.data.type === 'Vector') {
        return this.getJavaScriptObjectCompletions('Array');
      } else if (varSymbol.data.type === 'String') {
        return this.getJavaScriptObjectCompletions('String');
      }
    }
    
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
          const fullMethodName = method.name; // className.methodName
          
          return {
            label: methodName,
            kind: CompletionItemKind.Method,
            detail: `Method of ${className}`,
            insertText: methodName,
            insertTextFormat: InsertTextFormat.PlainText,
            sortText: `10-${methodName}`,
            data: method.data
          };
        });
      }
    }
    
    return [];
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
            // Check vector export syntax: (export [sym1, sym2, ...])
            if (expr.elements.length > 1 && isList(expr.elements[1])) {
              const exportList = expr.elements[1];
              
              // Extract symbols from the export list
              for (const elem of exportList.elements) {
                if (isSymbol(elem)) {
                  exportedSymbols.push(elem.name);
                } else if (isList(elem)) {
                  // Handle potential 'as' syntax: (export [[original as alias], ...])
                  // Check if this is an 'as' aliasing expression
                  if (elem.elements.length > 2 && 
                      isSymbol(elem.elements[0]) && 
                      isSymbol(elem.elements[1]) && 
                      elem.elements[1].name === 'as' && 
                      isSymbol(elem.elements[2])) {
                    // Add the original name
                    exportedSymbols.push(elem.elements[0].name);
                  }
                }
              }
            }
            // Check legacy string-based export: (export "name" symbol)
            else if (expr.elements.length > 2 && isString(expr.elements[1]) && isSymbol(expr.elements[2])) {
              const exportName = expr.elements[1].value;
              exportedSymbols.push(exportName);
            }
          }
        }
        
        // Also look for exportable definitions (fn, fx, let, var, enum, etc.)
        if (isList(expr) && expr.elements.length > 2 && isSymbol(expr.elements[0])) {
          const keyword = expr.elements[0].name;
          
          // Only consider top-level definitions that can be exported
          if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
            if (isSymbol(expr.elements[1])) {
              const symbolName = expr.elements[1].name;
              
              // Only add the symbol if it's not already in the exported list
              // This way explicitly exported symbols take precedence over inferred exports
              if (!exportedSymbols.includes(symbolName)) {
                exportedSymbols.push(symbolName);
              }
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

  /**
   * Handle completions for export statements
   */
  private handleExportCompletions(
    document: TextDocument,
    currentLine: string,
    fullText: string
  ): CompletionItem[] {
    // Match export vector start: (export [
    const exportVectorStart = currentLine.match(/export\s+\[\s*$/);
    if (exportVectorStart) {
      // We're at the beginning of an export vector
      return this.getExportableSymbols(document);
    }
    
    // Match export vector with partial symbol: (export [sym
    const exportSymbolMatch = currentLine.match(/export\s+\[\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (exportSymbolMatch) {
      const partialSymbol = exportSymbolMatch[1];
      return this.getExportableSymbols(document).filter(item => 
        item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())
      );
    }
    
    // Match export vector with continuation: (export [sym1, sym
    const exportContinueMatch = currentLine.match(/export\s+\[.+,\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (exportContinueMatch) {
      const partialSymbol = exportContinueMatch[1];
      
      // Find symbols that are already in the export list
      const alreadyExported = currentLine.match(/export\s+\[(.*)\s*,\s*[^,\s]*$/)?.[1].split(',')
        .map(s => s.trim().split(/\s+as\s+/)[0].trim()) || [];
      
      return this.getExportableSymbols(document).filter(item => 
        item.label.toLowerCase().startsWith(partialSymbol.toLowerCase()) &&
        !alreadyExported.includes(item.label)
      );
    }

    // Match "as" keyword for aliasing: (export [sym1, symbol as
    const exportAliasMatch = currentLine.match(/export\s+\[.*\b([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*$/);
    if (exportAliasMatch) {
      // Suggest an alias based on the symbol name
      const symbolName = exportAliasMatch[1];
      return [{
        label: `${symbolName}Alias`,
        kind: CompletionItemKind.Value,
        detail: `Alias for ${symbolName}`,
        insertText: `${symbolName}Alias`,
        sortText: '01-alias'
      }];
    }
    
    // If just typed 'export', suggest the vector template
    if (currentLine.trim() === 'export' || currentLine.trim() === '(export') {
      return [{
        label: 'export-vector',
        kind: CompletionItemKind.Snippet,
        detail: 'Export symbols using vector syntax',
        insertText: 'export [${1:symbol1}${2:, symbol2}]',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Export symbols using the recommended vector syntax'
        }
      }];
    }
    
    return [];
  }
  
  /**
   * Get exportable symbols from current document
   */
  private getExportableSymbols(document: TextDocument): CompletionItem[] {
    const exportableSymbols: CompletionItem[] = [];
    
    try {
      const text = document.getText();
      const expressions = parse(text, true);
      
      // Look for exportable definitions (fn, fx, let, var, enum, etc.)
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 1 && isSymbol(expr.elements[0])) {
          const keyword = expr.elements[0].name;
          
          // Check if this is a definition that can be exported
          if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
            if (isSymbol(expr.elements[1])) {
              const symbolName = expr.elements[1].name;
              let kind: CompletionItemKind = CompletionItemKind.Variable;
              
              // Determine completion item kind based on the symbol type
              switch (keyword) {
                case 'fn':
                case 'fx':
                  kind = CompletionItemKind.Function;
                  break;
                case 'enum':
                  kind = CompletionItemKind.EnumMember;
                  break;
                case 'class':
                case 'struct':
                  kind = CompletionItemKind.Class;
                  break;
                case 'macro':
                  kind = CompletionItemKind.Method;
                  break;
              }
              
              // Add the completion item for the exportable symbol
              exportableSymbols.push({
                label: symbolName,
                kind,
                detail: `${keyword} ${symbolName}`,
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: `Export the ${keyword} \`${symbolName}\``
                },
                insertText: symbolName,
                sortText: `0${keyword.length}-${symbolName}`
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error getting exportable symbols: ${error}`);
    }
    
    return exportableSymbols;
  }

  /**
   * Provide standard library function completions
   */
  private getStdLibCompletions(prefix: string): CompletionItem[] {
    const stdLibItems = [
      // Core functions
      { name: 'print', kind: CompletionItemKind.Function, detail: 'Print to standard output' },
      { name: 'println', kind: CompletionItemKind.Function, detail: 'Print to standard output with newline' },
      { name: 'str', kind: CompletionItemKind.Function, detail: 'Convert to string' },
      { name: 'concat', kind: CompletionItemKind.Function, detail: 'Concatenate strings or collections' },
      
      // Console functions
      { name: 'console.log', kind: CompletionItemKind.Function, detail: 'Log to console' },
      { name: 'console.error', kind: CompletionItemKind.Function, detail: 'Log error to console' },
      { name: 'console.warn', kind: CompletionItemKind.Function, detail: 'Log warning to console' },
      { name: 'console.info', kind: CompletionItemKind.Function, detail: 'Log info to console' },
      { name: 'console.debug', kind: CompletionItemKind.Function, detail: 'Log debug to console' },
      
      // Math functions
      { name: 'Math.abs', kind: CompletionItemKind.Function, detail: 'Absolute value of a number' },
      { name: 'Math.min', kind: CompletionItemKind.Function, detail: 'Minimum of values' },
      { name: 'Math.max', kind: CompletionItemKind.Function, detail: 'Maximum of values' },
      { name: 'Math.floor', kind: CompletionItemKind.Function, detail: 'Round down to nearest integer' },
      { name: 'Math.ceil', kind: CompletionItemKind.Function, detail: 'Round up to nearest integer' },
      { name: 'Math.round', kind: CompletionItemKind.Function, detail: 'Round to nearest integer' },
      { name: 'Math.random', kind: CompletionItemKind.Function, detail: 'Random value between 0 and 1' },
      
      // Collection functions
      { name: 'map', kind: CompletionItemKind.Function, detail: 'Transform each element in a collection' },
      { name: 'filter', kind: CompletionItemKind.Function, detail: 'Filter elements in a collection' },
      { name: 'reduce', kind: CompletionItemKind.Function, detail: 'Reduce collection to a single value' },
      { name: 'forEach', kind: CompletionItemKind.Function, detail: 'Execute for each element in a collection' },
      { name: 'get', kind: CompletionItemKind.Function, detail: 'Get element by key or index' },
      { name: 'contains?', kind: CompletionItemKind.Function, detail: 'Check if collection contains value' },
      { name: 'empty?', kind: CompletionItemKind.Function, detail: 'Check if collection is empty' },
      { name: 'count', kind: CompletionItemKind.Function, detail: 'Count elements in a collection' },
      { name: 'range', kind: CompletionItemKind.Function, detail: 'Generate a range of numbers' },
      
      // Control flow keywords
      { name: 'if', kind: CompletionItemKind.Keyword, detail: 'Conditional expression' },
      { name: 'when', kind: CompletionItemKind.Keyword, detail: 'Conditional execution when true' },
      { name: 'unless', kind: CompletionItemKind.Keyword, detail: 'Conditional execution when false' },
      { name: 'cond', kind: CompletionItemKind.Keyword, detail: 'Multi-way conditional' },
      { name: 'do', kind: CompletionItemKind.Keyword, detail: 'Sequential execution block' },
      { name: 'let', kind: CompletionItemKind.Keyword, detail: 'Bind local variables' },
      { name: 'loop', kind: CompletionItemKind.Keyword, detail: 'Loop with recur' },
      { name: 'recur', kind: CompletionItemKind.Keyword, detail: 'Loop recursion point' },
      { name: 'for', kind: CompletionItemKind.Keyword, detail: 'Iterative loop' },
      { name: 'while', kind: CompletionItemKind.Keyword, detail: 'While loop' },
      { name: 'repeat', kind: CompletionItemKind.Keyword, detail: 'Repeat n times' },
      
      // Data structure literals
      { name: 'vector', kind: CompletionItemKind.Function, detail: 'Create a vector [1 2 3]' },
      { name: 'list', kind: CompletionItemKind.Function, detail: 'Create a list \'(1 2 3)' },
      { name: 'set', kind: CompletionItemKind.Function, detail: 'Create a set #{1 2 3}' },
      { name: 'map', kind: CompletionItemKind.Function, detail: 'Create a map {key1 val1, key2 val2}' }
    ];
    
    // Define the type for the standard library items to help TypeScript
    type StdLibItem = {
      name: string;
      kind: CompletionItemKind;
      detail: string;
    };
    
    // Filter by prefix if provided
    const filtered = stdLibItems.filter(item => 
      !prefix || item.name.toLowerCase().includes(prefix.toLowerCase())
    );
    
    // Convert to completion items
    return filtered.map((item: StdLibItem) => {
      // For function/method items, provide them with parentheses for LISP syntax
      if (item.kind === CompletionItemKind.Function) {
        return {
          label: item.name,
          kind: item.kind,
          detail: item.detail,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${item.name}\` - ${item.detail}`
          },
          // Add parentheses and position cursor for argument
          insertText: `(${item.name} \${0})`,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `01-${item.name}` // High priority for standard library items
        };
      } else {
        // For keywords and other types
        return {
          label: item.name,
          kind: item.kind,
          detail: item.detail,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${item.name}\` - ${item.detail}`
          },
          // Keywords typically start expressions and may need parens based on context
          insertText: item.kind === CompletionItemKind.Keyword ? `(${item.name} \${0})` : item.name,
          insertTextFormat: item.kind === CompletionItemKind.Keyword ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
          sortText: `01-${item.name}` // High priority for standard library items
        };
      }
    });
  }

  /**
   * Get completions for JavaScript objects (e.g., console.log)
   */
  private getJavaScriptObjectCompletions(objectName: string): CompletionItem[] {
    // Define common JavaScript objects and their members
    const jsObjects: Record<string, Array<{ name: string, kind: CompletionItemKind, detail: string }>> = {
      // Console object
      'console': [
        { name: 'log', kind: CompletionItemKind.Method, detail: 'Log messages to the console' },
        { name: 'error', kind: CompletionItemKind.Method, detail: 'Output error messages to the console' },
        { name: 'warn', kind: CompletionItemKind.Method, detail: 'Output warning messages to the console' },
        { name: 'info', kind: CompletionItemKind.Method, detail: 'Output informational messages to the console' },
        { name: 'debug', kind: CompletionItemKind.Method, detail: 'Output debug messages to the console' },
        { name: 'trace', kind: CompletionItemKind.Method, detail: 'Output a stack trace to the console' },
        { name: 'time', kind: CompletionItemKind.Method, detail: 'Start a timer' },
        { name: 'timeEnd', kind: CompletionItemKind.Method, detail: 'End a timer and output elapsed time' },
        { name: 'count', kind: CompletionItemKind.Method, detail: 'Count number of times this is called' }
      ],
      
      // Math object
      'Math': [
        { name: 'abs', kind: CompletionItemKind.Method, detail: 'Absolute value of a number' },
        { name: 'ceil', kind: CompletionItemKind.Method, detail: 'Round up to the nearest integer' },
        { name: 'floor', kind: CompletionItemKind.Method, detail: 'Round down to the nearest integer' },
        { name: 'max', kind: CompletionItemKind.Method, detail: 'Return the largest of zero or more numbers' },
        { name: 'min', kind: CompletionItemKind.Method, detail: 'Return the smallest of zero or more numbers' },
        { name: 'pow', kind: CompletionItemKind.Method, detail: 'Return base to the exponent power' },
        { name: 'random', kind: CompletionItemKind.Method, detail: 'Return a random number between 0 and 1' },
        { name: 'round', kind: CompletionItemKind.Method, detail: 'Round to the nearest integer' },
        { name: 'sqrt', kind: CompletionItemKind.Method, detail: 'Square root of a number' },
        { name: 'PI', kind: CompletionItemKind.Constant, detail: 'Ratio of circumference to diameter of a circle' },
        { name: 'E', kind: CompletionItemKind.Constant, detail: 'Euler\'s number' }
      ],
      
      // String prototype methods
      'String': [
        { name: 'length', kind: CompletionItemKind.Property, detail: 'Length of the string' },
        { name: 'charAt', kind: CompletionItemKind.Method, detail: 'Return character at specified index' },
        { name: 'concat', kind: CompletionItemKind.Method, detail: 'Concatenate strings' },
        { name: 'indexOf', kind: CompletionItemKind.Method, detail: 'Find index of first occurrence' },
        { name: 'lastIndexOf', kind: CompletionItemKind.Method, detail: 'Find index of last occurrence' },
        { name: 'match', kind: CompletionItemKind.Method, detail: 'Match string against regular expression' },
        { name: 'replace', kind: CompletionItemKind.Method, detail: 'Replace matches with new substring' },
        { name: 'slice', kind: CompletionItemKind.Method, detail: 'Extract a section of a string' },
        { name: 'split', kind: CompletionItemKind.Method, detail: 'Split string into array of substrings' },
        { name: 'substring', kind: CompletionItemKind.Method, detail: 'Return part of the string' },
        { name: 'toLowerCase', kind: CompletionItemKind.Method, detail: 'Convert to lowercase' },
        { name: 'toUpperCase', kind: CompletionItemKind.Method, detail: 'Convert to uppercase' },
        { name: 'trim', kind: CompletionItemKind.Method, detail: 'Remove whitespace from start and end' }
      ],
      
      // Array prototype methods
      'Array': [
        { name: 'length', kind: CompletionItemKind.Property, detail: 'Number of elements' },
        { name: 'concat', kind: CompletionItemKind.Method, detail: 'Merge two or more arrays' },
        { name: 'filter', kind: CompletionItemKind.Method, detail: 'Create new array with elements that pass test' },
        { name: 'find', kind: CompletionItemKind.Method, detail: 'Return first element that satisfies test' },
        { name: 'forEach', kind: CompletionItemKind.Method, detail: 'Execute function for each element' },
        { name: 'includes', kind: CompletionItemKind.Method, detail: 'Check if array includes element' },
        { name: 'indexOf', kind: CompletionItemKind.Method, detail: 'Find index of first occurrence' },
        { name: 'join', kind: CompletionItemKind.Method, detail: 'Join elements into string' },
        { name: 'map', kind: CompletionItemKind.Method, detail: 'Create new array with results of callback' },
        { name: 'pop', kind: CompletionItemKind.Method, detail: 'Remove last element and return it' },
        { name: 'push', kind: CompletionItemKind.Method, detail: 'Add elements to end of array' },
        { name: 'reduce', kind: CompletionItemKind.Method, detail: 'Reduce array to single value' },
        { name: 'slice', kind: CompletionItemKind.Method, detail: 'Return shallow copy of portion of array' },
        { name: 'sort', kind: CompletionItemKind.Method, detail: 'Sort elements of array' }
      ],
      
      // Date object
      'Date': [
        { name: 'getDate', kind: CompletionItemKind.Method, detail: 'Get day of the month' },
        { name: 'getDay', kind: CompletionItemKind.Method, detail: 'Get day of the week' },
        { name: 'getFullYear', kind: CompletionItemKind.Method, detail: 'Get year' },
        { name: 'getHours', kind: CompletionItemKind.Method, detail: 'Get hour' },
        { name: 'getMinutes', kind: CompletionItemKind.Method, detail: 'Get minutes' },
        { name: 'getMonth', kind: CompletionItemKind.Method, detail: 'Get month' },
        { name: 'getSeconds', kind: CompletionItemKind.Method, detail: 'Get seconds' },
        { name: 'getTime', kind: CompletionItemKind.Method, detail: 'Get timestamp (milliseconds since epoch)' },
        { name: 'now', kind: CompletionItemKind.Method, detail: 'Return current timestamp' },
        { name: 'toISOString', kind: CompletionItemKind.Method, detail: 'Convert to ISO format string' },
        { name: 'toDateString', kind: CompletionItemKind.Method, detail: 'Convert to date string' },
        { name: 'toTimeString', kind: CompletionItemKind.Method, detail: 'Convert to time string' }
      ]
    };
    
    // Check if object name is a known JavaScript object
    if (objectName in jsObjects) {
      const members = jsObjects[objectName];
      
      // Convert to completion items
      return members.map(member => {
        const fullMethodName = `${objectName}.${member.name}`;
        
        if (member.kind === CompletionItemKind.Method) {
          // For methods, add LISP-style parentheses
          return {
            label: member.name,
            kind: member.kind,
            detail: `${fullMethodName} - ${member.detail}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `\`${fullMethodName}\`\n\n${member.detail}`
            },
            insertText: `(${fullMethodName} \${0})`,
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: `10-${member.name}`
          };
        } else {
          // For properties and constants
          return {
            label: member.name,
            kind: member.kind,
            detail: `${fullMethodName} - ${member.detail}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `\`${fullMethodName}\`\n\n${member.detail}`
            },
            insertText: fullMethodName,
            sortText: `10-${member.name}`
          };
        }
      });
    }
    
    return [];
  }

  /**
   * Fixes incorrectly parsed parameters that have colons in their names
   */
  private fixParameterTypes(params: any[]): any[] {
    // If we have any parameters with names ending in colon, 
    // we might have the wrong parameter/type structure
    if (params.some(p => p.name && p.name.endsWith(':'))) {
      const fixedParams: any[] = [];
      
      // Process parameters in pairs to fix incorrect parsing
      for (let i = 0; i < params.length; i += 2) {
        const paramWithColon = params[i];
        
        // Check if this appears to be a wrongly parsed param:type pair
        if (paramWithColon && paramWithColon.name && 
            paramWithColon.name.endsWith(':') && 
            i + 1 < params.length) {
          
          // The next parameter is likely the type
          const typeParam = params[i + 1];
          
          // Create fixed parameter with correct name and type
          const fixedParam = {
            name: paramWithColon.name.substring(0, paramWithColon.name.length - 1),
            type: typeParam.name || typeParam.type || 'Any',
            defaultValue: paramWithColon.defaultValue || typeParam.defaultValue
          };
          
          fixedParams.push(fixedParam);
        } else {
          // Just add the parameter as is if it doesn't match the pattern
          fixedParams.push(paramWithColon);
        }
      }
      
      return fixedParams;
    }
    
    // No problematic params, return as is
    return params;
  }
}

/**
 * Setup a completion item for display
 */
export function setupCompletionItem(completionItem: CompletionItem): CompletionItem {
  // Fix for enum case autocompletion
  if (completionItem.kind === CompletionItemKind.EnumMember) {
    const data = completionItem.data;
    if (data && data.enumName) {
      // Check if we already have full name (e.g., "OS.macOS") or just the case name (e.g., "macOS")
      if (!completionItem.label.includes('.') && !completionItem.insertText?.startsWith('.')) {
        completionItem.detail = `Case of enum ${data.enumName}`;
      }
    }
  }
  
  // Fix for function parameter completion
  if (completionItem.kind === CompletionItemKind.Property && 
      completionItem.label.endsWith(':') && 
      completionItem.insertText?.endsWith('${1:') &&
      completionItem.insertTextFormat === InsertTextFormat.Snippet) {
    
    // Simplify insertion to just leave cursor after the colon
    completionItem.insertText = completionItem.insertText.replace(/\$\{1:.*?\}/, '');
    completionItem.insertTextFormat = InsertTextFormat.PlainText;
  }
  
  return completionItem;
}