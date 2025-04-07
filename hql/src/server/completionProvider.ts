import {
    TextDocument,
    Position,
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    CompletionParams,
    Range,
    InsertTextFormat
  } from 'vscode-languageserver';
  
  import * as path from 'path';
  import * as fs from 'fs';
  import { createTextDocumentAdapter } from '../document-adapter';
  import { getCurrentExpression, getExpressionRangeAtPosition } from '../helper/getExpressionRange';
  import { parse, SExp, SList, SSymbol } from '../parser';
  import { isList, isSymbol, isString, isNumber, isBoolean, isNil, sexpToString } from '../s-exp/types';
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
          return await this.handleImportCompletions(document, currentLine, text);
        }
        
        // Handle method chain completions or enum dot notation completions (e.g., object.method or .enumCase)
        if (linePrefix.endsWith('.')) {
          // Check if this is enum dot notation for parameter typing
          const enumDotCompletions = await this.handleEnumDotCompletions(document, position, currentLine);
          if (enumDotCompletions.length > 0) {
            return enumDotCompletions;
          }
          
          // Otherwise handle as method chain
          return await this.handleMethodChainCompletions(document, currentLine);
        }
        
        // Handle parameter completions for function calls
        const paramMatch = linePrefix.match(/\(\s*(\w+)\s+([^(\s)]+)?$/);
        if (paramMatch) {
          const funcName = paramMatch[1];
          return this.getParameterCompletions(document, funcName);
        }
        
        // Handle enum value completions
        const enumValueMatch = linePrefix.match(/\:\s*(\w+)$/);
        if (enumValueMatch) {
          const enumType = enumValueMatch[1];
          return this.getEnumValueCompletions(document, enumType);
        }
        
        // Check if we're inside a form that has special completion requirements
        const enclosingFunction = await this.findEnclosingFunction(document, position);
        if (enclosingFunction) {
          const functionSpecificCompletions = this.getFunctionSpecificCompletions(enclosingFunction.name);
          if (functionSpecificCompletions.length > 0) {
            return functionSpecificCompletions;
          }
        }
        
        // Fall back to general completions
        return this.getGeneralCompletions(document, position, currentLine);
      } catch (error) {
        console.error(`Error providing completions: ${error}`);
        return [];
      }
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
            enumCases.push({
              label: caseName.name,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${enumName}`,
              documentation: {
                kind: MarkupKind.Markdown,
                value: `Enum case from \`${enumName}\``
              },
              data: {
                enumName: enumName
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
      
      // Find enum members for this type
      const enumMembers = symbols.filter(s => 
        s.kind === 11 && // EnumMember
        s.data?.enumName === enumType
      );
      
      if (enumMembers.length > 0) {
        const enumCompletions = enumMembers.map(enumMember => ({
          label: enumMember.name,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum ${enumType}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: enumMember.data?.documentation || `Enum case from \`${enumType}\``
          },
          data: {
            enumName: enumType
          }
        }));
        
        // Cache these for future use
        this.dynamicValueCache.set(`enum:${enumType}`, enumCompletions);
        
        return enumCompletions;
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
          insertText: param.name + ': ',
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
          
        // Add more function-specific completions as needed
        
        default:
          return [];
      }
    }
    
    /**
     * Find the enclosing function at a given position
     */
    private async findEnclosingFunction(
      document: TextDocument,
      position: Position
    ): Promise<ExtendedSymbolInformation | null> {
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
     * Get general completions for a position
     */
    private getGeneralCompletions(
      document: TextDocument,
      position: Position,
      currentLine: string
    ): CompletionItem[] {
      // Basic HQL keywords and functions
      const basicCompletions = this.getBasicCompletions();
      
      // Get defined symbols in this document
      const symbols = this.symbolManager.getDocumentSymbols(document.uri);
      
      // Map symbols to completion items
      const symbolCompletions = symbols.map(symbol => {
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
              
              insertText = `${symbol.name} ${paramSnippets}`;
              insertTextFormat = InsertTextFormat.Snippet;
              sortText = `2-${symbol.name}`; // High priority
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
      
      // Add template completions based on word prefix
      let templateCompletions: CompletionItem[] = [];
      const wordMatch = /(\w+)$/.exec(currentLine);
      if (wordMatch) {
        templateCompletions = this.getTemplateCompletions(wordMatch[1]);
      }
      
      // Return completions with template completions first (highest priority)
      return [...templateCompletions, ...symbolCompletions, ...basicCompletions];
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
          label: 'fn',
          kind: CompletionItemKind.Snippet,
          detail: 'Function Definition (fn)',
          insertText: 'fn ${1:name} (${2:args})\n  ${0:body}',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '1-fn', // Highest priority
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Creates a function definition'
          }
        });
      }
      
      if ('fx'.startsWith(word)) {
        completions.push({
          label: 'fx',
          kind: CompletionItemKind.Snippet,
          detail: 'Pure Function Definition (fx)',
          insertText: 'fx ${1:name} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${0:body}',
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: '1-fx', // Highest priority
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Creates a typed function definition'
          }
        });
      }
      
      if ('if'.startsWith(word)) {
        completions.push({
          label: 'if',
          kind: CompletionItemKind.Snippet,
          detail: 'Conditional expression',
          insertText: 'if ${1:condition}\n  ${2:true-expr}\n  ${0:false-expr}',
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Creates an if conditional expression'
          }
        });
      }
      
      if ('enum'.startsWith(word)) {
        completions.push({
          label: 'enum',
          kind: CompletionItemKind.Snippet,
          detail: 'Enum definition',
          insertText: 'enum ${1:Name}\n  (case ${2:Case1})\n  (case ${0:Case2})',
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: {
            kind: MarkupKind.Markdown,
            value: 'Creates an enumeration type definition'
          }
        });
      }
      
      return completions;
    }
    
    /**
     * Get basic HQL keyword completions
     */
    private getBasicCompletions(): CompletionItem[] {
      return [
        {
          label: 'fn',
          kind: CompletionItemKind.Keyword,
          detail: 'Function definition',
          sortText: '9-fn', // Lowest priority
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(fn name (args...) body)\n```\nDefines a new function.'
          }
        },
        {
          label: 'fx',
          kind: CompletionItemKind.Keyword,
          detail: 'Typed function definition',
          sortText: '9-fx', // Lowest priority
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(fx name (param1: Type1 param2: Type2) (-> ReturnType) body)\n```\nDefines a pure function with typed parameters.'
          }
        },
        {
          label: 'let',
          kind: CompletionItemKind.Keyword,
          detail: 'Immutable binding',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(let name value)\n```\nor\n```\n(let (name1 value1 name2 value2) body)\n```\nDefines immutable bindings.'
          }
        },
        {
          label: 'var',
          kind: CompletionItemKind.Keyword,
          detail: 'Mutable binding',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(var name value)\n```\nor\n```\n(var (name1 value1 name2 value2) body)\n```\nDefines mutable bindings.'
          }
        },
        {
          label: 'if',
          kind: CompletionItemKind.Keyword,
          detail: 'Conditional expression',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(if condition then-expr else-expr)\n```\nConditional expression.'
          }
        },
        {
          label: 'enum',
          kind: CompletionItemKind.Keyword,
          detail: 'Enumeration type',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(enum Name\n  (case case1)\n  (case case2))\n```\nDefines an enumeration type with optional values or associated types.'
          }
        },
        {
          label: 'class',
          kind: CompletionItemKind.Keyword,
          detail: 'Class definition',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(class Name\n  (var field1)\n  (constructor (param1) body)\n  (method method1 (param1) body))\n```\nDefines a class with fields, constructor, and methods.'
          }
        },
        {
          label: 'struct',
          kind: CompletionItemKind.Keyword,
          detail: 'Struct definition',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(struct Name\n  (field field1: Type1)\n  (field field2: Type2))\n```\nDefines a value type struct with fields.'
          }
        },
        {
          label: 'import',
          kind: CompletionItemKind.Keyword,
          detail: 'Import declaration',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(import [sym1, sym2] from "module")\n```\nor\n```\n(import namespace from "module")\n```\nImports symbols or namespaces from modules.'
          }
        },
        {
          label: 'export',
          kind: CompletionItemKind.Keyword,
          detail: 'Export declaration',
          documentation: {
            kind: MarkupKind.Markdown,
            value: '```\n(export [sym1, sym2])\n```\nor\n```\n(export "name" symbol)\n```\nExports symbols from the current module.'
          }
        }
      ];
    }
    
    /**
     * Handle completions for import statements
     */
    private async handleImportCompletions(
      document: TextDocument,
      currentLine: string,
      fullText: string
    ): Promise<CompletionItem[]> {
      // Match import statement with a path
      const importPathMatch = currentLine.match(/import\s+\[\s*([^,\s]*)\s*(?:,\s*([^,\s]*)\s*)?\]\s+from\s+["']([^"']*)$/);
      if (importPathMatch) {
        // We're in an import statement with a path
        const partialPath = importPathMatch[3] || '';
        
        // Provide path completions
        return await this.getPathCompletionItems(partialPath, true);
      }
      
      // Check for import statement with module specified but cursor in the symbol area
      const importSymbolMatch = currentLine.match(/import\s+\[\s*([^,\s]*)?$/);
      if (importSymbolMatch || currentLine.match(/import\s+\[.*\]\s+from\s+["'](.+)["']\s*$/)) {
        // Extract module path from elsewhere in the line/context
        const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
        
        if (modulePath) {
          // Suggest importable symbols from that module
          return await this.getImportableSymbols(modulePath);
        }
      }
      
      return [];
    }
    
    /**
     * Handle completions for method chains (object.method)
     */
    private async handleMethodChainCompletions(
      document: TextDocument,
      currentLine: string
    ): Promise<CompletionItem[]> {
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
    private async getPathCompletionItems(
      partialPath: string,
      isImport: boolean
    ): Promise<CompletionItem[]> {
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
    private async getImportableSymbols(modulePath: string): Promise<CompletionItem[]> {
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
     * Handle enum dot notation completions (e.g., `:` parameter followed by a `.`)
     */
    private async handleEnumDotCompletions(
      document: TextDocument,
      position: Position,
      currentLine: string
    ): Promise<CompletionItem[]> {
      const adaptedDoc = createTextDocumentAdapter(document);
      const backLine = currentLine.substring(0, position.character - 1); // everything before the '.'
      
      try {
        // First, check for parameter pattern in function call
        const paramMatch = backLine.match(/(\w+)\s*:\s*$/);
        if (paramMatch) {
          const paramName = paramMatch[1];
          
          // Find enclosing function call
          const expression = getCurrentExpression(adaptedDoc, position);
          if (expression && isList(expression) && expression.elements.length > 0) {
            const funcName = isSymbol(expression.elements[0]) ? expression.elements[0].name : null;
            if (funcName) {
              // Get function symbol for parameter type information
              const symbols = this.symbolManager.getDocumentSymbols(document.uri);
              const funcSymbol = symbols.find(s => 
                (s.kind === 12 || s.kind === 6) && // Function or Method
                s.name === funcName
              );
              
              if (funcSymbol?.data?.params) {
                // Find parameter with matching name to get its type
                const param = funcSymbol.data.params.find(p => p.name === paramName);
                if (param?.type) {
                  // Get enum cases for this type
                  const enumCases = symbols.filter(s => 
                    s.kind === 11 && // EnumMember
                    s.data?.enumName === param.type
                  );
                  
                  if (enumCases.length > 0) {
                    // Return enum case completions with high priority
                    return enumCases.map(enumCase => ({
                      label: enumCase.name,
                      kind: CompletionItemKind.EnumMember,
                      detail: `Case of enum ${param.type}`,
                      sortText: `1-${enumCase.name}`, // Very high priority
                      documentation: {
                        kind: MarkupKind.Markdown,
                        value: enumCase.data?.documentation || `Enum case from \`${param.type}\``
                      },
                      // Just insert the case name without the enum prefix
                      insertText: enumCase.name,
                      data: {
                        enumName: param.type
                      }
                    }));
                  }
                }
              }
            }
          }
        }
        
        // Second, check for direct enum reference (Enum.)
        const enumMatch = backLine.match(/(\w+)$/);
        if (enumMatch) {
          const enumName = enumMatch[1];
          
          // Check if this is an enum type
          const symbols = this.symbolManager.getDocumentSymbols(document.uri);
          const enumSymbol = symbols.find(s => 
            s.kind === 10 && // Enum
            s.name === enumName
          );
          
          if (enumSymbol) {
            // Get all enum cases for this enum
            const enumCases = symbols.filter(s => 
              s.kind === 11 && // EnumMember
              s.data?.enumName === enumName
            );
            
            if (enumCases.length > 0) {
              // Return enum case completions with prefix
              return enumCases.map(enumCase => ({
                label: enumCase.name,
                kind: CompletionItemKind.EnumMember,
                detail: `Case of enum ${enumName}`,
                sortText: `1-${enumCase.name}`, // High priority
                documentation: {
                  kind: MarkupKind.Markdown,
                  value: enumCase.data?.documentation || `Enum case from \`${enumName}\``
                },
                // Insert with full qualification since this is a direct reference
                insertText: enumCase.name,
                data: {
                  enumName: enumName
                }
              }));
            }
          }
        }
      } catch (error) {
        console.error(`Error in enum dot completion: ${error}`);
      }
      
      return [];
    }
  }
  
  /**
   * Setup a completion item for display
   */
  export function setupCompletionItem(completionItem: CompletionItem): CompletionItem {
    // Add additional setup as needed
    return completionItem;
  }