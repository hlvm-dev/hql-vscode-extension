import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Position,
  Range,
  Hover,
  MarkupKind,
  MarkupContent,
  CompletionItemTag,
  Definition,
  Location,
  DocumentSymbolParams,
  SymbolInformation,
  SymbolKind,
  SemanticTokensParams,
  SemanticTokensBuilder,
  TextEdit
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import * as path from 'path';
import * as fs from 'fs';

import { parse, SExp, SList, SSymbol, SString, SNumber, SBoolean, SNil } from './parser';
import { createTextDocumentAdapter, ITextDocument } from './document-adapter';
import { 
  findExpressionRange, 
  getExpressionRangeAtPosition, 
  getCurrentExpression, 
  getOutermostExpressionRange 
} from './helper/getExpressionRange';
import { isList, isSymbol, isString, isNumber, isBoolean, isNil, sexpToString } from './s-exp/types';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Track open, change and close text document events
documents.listen(connection);

// Define HQL keywords and core functions for code completion
const hqlKeywords = [
  // Control flow
  { label: 'if', kind: CompletionItemKind.Keyword },
  { label: 'cond', kind: CompletionItemKind.Keyword },
  { label: 'when', kind: CompletionItemKind.Keyword },
  { label: 'unless', kind: CompletionItemKind.Keyword },
  { label: 'do', kind: CompletionItemKind.Keyword },
  { label: 'loop', kind: CompletionItemKind.Keyword },
  { label: 'recur', kind: CompletionItemKind.Keyword },
  { label: 'for', kind: CompletionItemKind.Keyword },
  { label: 'while', kind: CompletionItemKind.Keyword },
  { label: 'repeat', kind: CompletionItemKind.Keyword },
  
  // Function and variable definition
  { label: 'fn', kind: CompletionItemKind.Keyword, detail: 'Define a regular function', documentation: { kind: MarkupKind.Markdown, value: '```\n(fn name (args...) body)\n```\nDefines a new function.' } },
  { label: 'fx', kind: CompletionItemKind.Keyword, detail: 'Define a pure function', documentation: { kind: MarkupKind.Markdown, value: '```\n(fx name (param1: Type1 param2: Type2) (-> ReturnType)\n  body)\n```\nDefines a pure function with typed parameters.' } },
  { label: 'let', kind: CompletionItemKind.Keyword, detail: 'Define an immutable binding', documentation: { kind: MarkupKind.Markdown, value: '```\n(let name value)\n```\nCreates an immutable binding.' } },
  { label: 'var', kind: CompletionItemKind.Keyword, detail: 'Define a mutable binding', documentation: { kind: MarkupKind.Markdown, value: '```\n(var name value)\n```\nCreates a mutable binding that can be updated with set!.' } },
  { label: 'set!', kind: CompletionItemKind.Keyword },
  { label: 'lambda', kind: CompletionItemKind.Keyword },
  { label: 'defmacro', kind: CompletionItemKind.Keyword },
  { label: 'macro', kind: CompletionItemKind.Keyword },
  { label: 'return', kind: CompletionItemKind.Keyword, detail: 'Return a value from a function', documentation: { kind: MarkupKind.Markdown, value: '```\n(return value)\n```\nReturns the value from the function.' } },
  
  // Data structures
  { label: 'vector', kind: CompletionItemKind.Function },
  { label: 'hash-map', kind: CompletionItemKind.Function },
  { label: 'hash-set', kind: CompletionItemKind.Function },
  
  // Classes and structs
  { label: 'class', kind: CompletionItemKind.Keyword, detail: 'Define a class' },
  { label: 'struct', kind: CompletionItemKind.Keyword, detail: 'Define a value type' },
  { label: 'enum', kind: CompletionItemKind.Keyword, detail: 'Define an enumeration' },
  
  // Modules
  { label: 'import', kind: CompletionItemKind.Keyword },
  { label: 'export', kind: CompletionItemKind.Keyword },
  
  // Operators
  { label: '+', kind: CompletionItemKind.Operator },
  { label: '-', kind: CompletionItemKind.Operator },
  { label: '*', kind: CompletionItemKind.Operator },
  { label: '/', kind: CompletionItemKind.Operator },
  { label: '=', kind: CompletionItemKind.Operator },
  { label: '!=', kind: CompletionItemKind.Operator },
  { label: '<', kind: CompletionItemKind.Operator },
  { label: '<=', kind: CompletionItemKind.Operator },
  { label: '>', kind: CompletionItemKind.Operator },
  { label: '>=', kind: CompletionItemKind.Operator },
  { label: 'and', kind: CompletionItemKind.Operator },
  { label: 'or', kind: CompletionItemKind.Operator },
  { label: 'not', kind: CompletionItemKind.Operator },
  
  // Common functions
  { label: 'print', kind: CompletionItemKind.Function },
  { label: 'console.log', kind: CompletionItemKind.Function },
  { label: 'str', kind: CompletionItemKind.Function },
  { label: 'get', kind: CompletionItemKind.Function },
  { label: 'contains?', kind: CompletionItemKind.Function },
  { label: 'filter', kind: CompletionItemKind.Function },
  { label: 'map', kind: CompletionItemKind.Function },
  { label: 'reduce', kind: CompletionItemKind.Function },
  
  // Values
  { label: 'true', kind: CompletionItemKind.Keyword },
  { label: 'false', kind: CompletionItemKind.Keyword },
  { label: 'nil', kind: CompletionItemKind.Keyword },
  
  // Types
  { label: 'Int', kind: CompletionItemKind.TypeParameter },
  { label: 'Float', kind: CompletionItemKind.TypeParameter },
  { label: 'Double', kind: CompletionItemKind.TypeParameter },
  { label: 'String', kind: CompletionItemKind.TypeParameter },
  { label: 'Boolean', kind: CompletionItemKind.TypeParameter },
  { label: 'Bool', kind: CompletionItemKind.TypeParameter },
  { label: 'Array', kind: CompletionItemKind.TypeParameter },
  { label: 'Object', kind: CompletionItemKind.TypeParameter },
  { label: 'Any', kind: CompletionItemKind.TypeParameter },
];

// Keep track of document symbols to provide code completion
let documentSymbols: Map<string, SymbolInformation[]> = new Map();

// Track imported symbols for better completions
interface ImportedSymbol {
  name: string;          // Local name
  sourceName: string;    // Original name
  sourceModule: string;  // Module it came from
  kind: SymbolKind;      // Kind of symbol
}

// Map from document URI to imported symbols
const importedSymbols: Map<string, ImportedSymbol[]> = new Map();

// Manages the connection initialization
connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that the server supports code completion
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['(', '.', ':', ' ', '[', '"', '/']
      },
      // Enable hover support
      hoverProvider: true,
      // Enable definition support
      definitionProvider: true,
      // Enable document symbol provider
      documentSymbolProvider: true,
      // Enable semantic tokens
      semanticTokensProvider: {
        legend: {
          tokenTypes: [
            'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 
            'namespace', 'type', 'struct', 'class', 'interface', 'enum',
            'function', 'variable', 'parameter', 'property', 'label'
          ],
          tokenModifiers: [
            'declaration', 'definition', 'readonly', 'static', 'deprecated',
            'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'
          ]
        },
        full: true
      }
    }
  };

  return result;
});

// Initialize connection
connection.onInitialized(() => {
  console.log('HQL Language Server initialized');
  
  // Start document validation on open/change
  documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
    updateDocumentSymbols(change.document);
    updateImportedSymbols(change.document);
  });
});

// Listen for text document open events
documents.onDidOpen(event => {
  validateTextDocument(event.document);
  updateDocumentSymbols(event.document);
  updateImportedSymbols(event.document);
});

// Listen for text document save events
documents.onDidSave(event => {
  validateTextDocument(event.document);
  updateDocumentSymbols(event.document);
  updateImportedSymbols(event.document);
});

/**
 * Update imported symbols for a document
 */
async function updateImportedSymbols(textDocument: TextDocument): Promise<void> {
  try {
    const uri = textDocument.uri;
    const text = textDocument.getText();
    
    // Clear existing imported symbols
    importedSymbols.set(uri, []);
    
    // Parse the document
    const expressions = parse(text);
    
    // Find import statements
    for (const expr of expressions) {
      if (isList(expr) && expr.elements.length > 0 && 
          isSymbol(expr.elements[0]) && expr.elements[0].name === 'import') {
        
        // Vector-based import: (import [symbol1, symbol2 as alias] from "module")
        if (expr.elements.length > 3 && 
            isList(expr.elements[1]) && 
            isSymbol(expr.elements[2]) && expr.elements[2].name === 'from' && 
            ((isString(expr.elements[3])) || 
             (isLiteral(expr.elements[3]) && 
              expr.elements[3].type === "literal" && 
              typeof expr.elements[3].value === 'string'))) {
          
          const importList = expr.elements[1];
          const modulePath = isString(expr.elements[3]) ? 
            expr.elements[3].value : 
            String((expr.elements[3].type === "literal" ? expr.elements[3].value : ""));
          
          // Process each imported symbol
          for (let i = 0; i < importList.elements.length; i++) {
            const currentElem = importList.elements[i];
            // Skip commas
            if (isSymbol(currentElem) && currentElem.name === ',') {
              continue;
            }
            
            // Check for "symbol as alias" pattern
            if (isSymbol(currentElem) && 
                i + 2 < importList.elements.length) {
              const asElem = importList.elements[i+1];
              const aliasElem = importList.elements[i+2];
              
              if (isSymbol(asElem) && asElem.name === 'as' && 
                  isSymbol(aliasElem)) {
                
                const sourceName = currentElem.name;
                const localName = aliasElem.name;
                
                // Add to imported symbols with the local name
                addImportedSymbol(uri, {
                  name: localName,
                  sourceName,
                  sourceModule: modulePath,
                  kind: SymbolKind.Variable // Default, will update later
                });
                
                // Skip the "as alias" part
                i += 2;
              }
              // Regular symbol import
              else if (isSymbol(currentElem)) {
                const symbolName = currentElem.name;
                
                // Add to imported symbols
                addImportedSymbol(uri, {
                  name: symbolName,
                  sourceName: symbolName,
                  sourceModule: modulePath,
                  kind: SymbolKind.Variable // Default, will update later
                });
              }
            }
            // Regular symbol import without as/alias
            else if (isSymbol(currentElem)) {
              const symbolName = currentElem.name;
              
              // Add to imported symbols
              addImportedSymbol(uri, {
                name: symbolName,
                sourceName: symbolName,
                sourceModule: modulePath,
                kind: SymbolKind.Variable // Default, will update later
              });
            }
          }
        }
        
        // Namespace import: (import module from "module-path")
        else if (expr.elements.length > 3 && 
                isSymbol(expr.elements[1]) && 
                isSymbol(expr.elements[2]) && expr.elements[2].name === 'from' && 
                ((isString(expr.elements[3])) || 
                 (isLiteral(expr.elements[3]) && 
                  expr.elements[3].type === "literal" && 
                  typeof expr.elements[3].value === 'string'))) {
          
          const namespaceName = expr.elements[1].name;
          const modulePath = isString(expr.elements[3]) ? 
            expr.elements[3].value : 
            String((expr.elements[3].type === "literal" ? expr.elements[3].value : ""));
          
          // Add namespace as a module
          addImportedSymbol(uri, {
            name: namespaceName,
            sourceName: '*',
            sourceModule: modulePath,
            kind: SymbolKind.Module
          });
          
          // Try to find the module and extract its exports for better completions
          try {
            const workspaceFolders = await connection.workspace.getWorkspaceFolders();
            if (!workspaceFolders) continue;
            
            const rootUri = workspaceFolders[0].uri;
            const rootPath = rootUri.replace('file://', '');
            
            const resolvedPath = path.resolve(
              rootPath, 
              modulePath.replace(/^\.\//, '')
            );
            
            if (resolvedPath.endsWith('.hql')) {
              // Load and parse the module
              const moduleText = fs.readFileSync(resolvedPath, 'utf8');
              
              // Get the symbols from the module
              const moduleSymbols = extractModuleSymbols(moduleText);
              
              // Add them as properties of the namespace
              for (const symbol of moduleSymbols) {
                addImportedSymbol(uri, {
                  name: `${namespaceName}.${symbol.name}`,
                  sourceName: symbol.name,
                  sourceModule: modulePath,
                  kind: symbol.kind
                });
              }
            }
          } catch (error) {
            console.error(`Error processing module exports: ${error}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error updating imported symbols: ${error}`);
  }
}

/**
 * Add an imported symbol to the tracking map
 */
function addImportedSymbol(uri: string, symbol: ImportedSymbol): void {
  if (!importedSymbols.has(uri)) {
    importedSymbols.set(uri, []);
  }
  importedSymbols.get(uri)!.push(symbol);
}

/**
 * Extract symbols from a module (focusing on enums for now)
 */
function extractModuleSymbols(moduleText: string): { name: string, kind: SymbolKind }[] {
  const result: { name: string, kind: SymbolKind }[] = [];
  
  try {
    // Parse the module
    const expressions = parse(moduleText);
    
    // Look for enum definitions and other symbols
    for (const expr of expressions) {
      if (isList(expr) && expr.elements.length > 1 && 
          isSymbol(expr.elements[0])) {
        
        // Enum definition: (enum TypeName ...)
        if (expr.elements[0].name === 'enum' && 
            isSymbol(expr.elements[1])) {
          const enumName = expr.elements[1].name;
          
          // Add the enum itself
          result.push({
            name: enumName,
            kind: SymbolKind.Enum
          });
          
          // Add enum cases
          for (let i = 2; i < expr.elements.length; i++) {
            const elemI = expr.elements[i];
            if (isList(elemI) && 
                elemI.elements.length > 1 && 
                isSymbol(elemI.elements[0]) && 
                elemI.elements[0].name === 'case' &&
                isSymbol(elemI.elements[1])) {
              
              const caseName = elemI.elements[1].name;
              result.push({
                name: `${enumName}.${caseName}`,
                kind: SymbolKind.EnumMember
              });
            }
          }
        }
        
        // Function definition: (fn name ...)
        else if ((expr.elements[0].name === 'fn' || 
                 expr.elements[0].name === 'fx') && 
                isSymbol(expr.elements[1])) {
          const funcName = expr.elements[1].name;
          result.push({
            name: funcName,
            kind: SymbolKind.Function
          });
        }
        
        // Variable definition: (let name value) or (var name value)
        else if ((expr.elements[0].name === 'let' || 
                 expr.elements[0].name === 'var') && 
                isSymbol(expr.elements[1])) {
          const varName = expr.elements[1].name;
          result.push({
            name: varName,
            kind: SymbolKind.Variable
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting module symbols: ${error}`);
  }
  
  return result;
}

/**
 * Helper function to update document symbols
 */
async function updateDocumentSymbols(textDocument: TextDocument): Promise<void> {
  try {
    const text = textDocument.getText();
    const uri = textDocument.uri;
    
    // Parse the document
    const expressions = parse(text);
    
    // Extract symbols from the parse tree
    const symbols: SymbolInformation[] = [];
    
    // Process expressions to find symbol definitions
    for (const expr of expressions) {
      if (isList(expr) && expr.elements.length > 0) {
        const first = expr.elements[0];
        if (isSymbol(first)) {
          const name = first.name;
          
          // Handle function definitions
          if (name === 'fn' || name === 'fx' || name === 'defmacro' || name === 'macro') {
            if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
              const funcName = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              symbols.push({
                name: funcName,
                kind: SymbolKind.Function,
                location: Location.create(uri, range)
              });
            }
          }
          
          // Handle variable definitions
          else if (name === 'let' || name === 'var') {
            if (expr.elements.length > 2 && isSymbol(expr.elements[1])) {
              const varName = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              symbols.push({
                name: varName,
                kind: SymbolKind.Variable,
                location: Location.create(uri, range)
              });
            }
            // Handle let with multiple bindings: (let (x 1 y 2) ...)
            else if (expr.elements.length > 1 && isList(expr.elements[1])) {
              const bindings = expr.elements[1] as SList;
              for (let i = 0; i < bindings.elements.length; i += 2) {
                if (i + 1 < bindings.elements.length && isSymbol(bindings.elements[i])) {
                  const varName = (bindings.elements[i] as SSymbol).name;
                  const adaptedDoc = createTextDocumentAdapter(textDocument);
                  const range = findExpressionRange(adaptedDoc, expr);
                  
                  symbols.push({
                    name: varName,
                    kind: SymbolKind.Variable,
                    location: Location.create(uri, range)
                  });
                }
              }
            }
          }
          
          // Handle class and struct definitions
          else if (name === 'class' || name === 'struct') {
            if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
              const className = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              symbols.push({
                name: className,
                kind: name === 'class' ? SymbolKind.Class : SymbolKind.Struct,
                location: Location.create(uri, range)
              });
            }
          }
          
          // Handle enum definitions
          else if (name === 'enum') {
            if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
              const enumName = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              symbols.push({
                name: enumName,
                kind: SymbolKind.Enum,
                location: Location.create(uri, range)
              });
              
              // Extract enum cases
              for (let i = 2; i < expr.elements.length; i++) {
                if (isList(expr.elements[i])) {
                  const caseExpr = expr.elements[i] as SList;
                  if (caseExpr.elements.length > 1 && 
                      isSymbol(caseExpr.elements[0]) && 
                      caseExpr.elements[0].name === 'case' &&
                      isSymbol(caseExpr.elements[1])) {
                    
                    const caseName = caseExpr.elements[1].name;
                    const adaptedDoc = createTextDocumentAdapter(textDocument);
                    const caseRange = findExpressionRange(adaptedDoc, caseExpr);
                    
                    symbols.push({
                      name: `${enumName}.${caseName}`,
                      kind: SymbolKind.EnumMember,
                      location: Location.create(uri, caseRange)
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Store symbols for this document
    documentSymbols.set(uri, symbols);
    
  } catch (error) {
    console.error(`Error updating document symbols: ${error}`);
  }
}

// Handler for symbol requests
connection.onDocumentSymbol((params: DocumentSymbolParams): SymbolInformation[] => {
  const uri = params.textDocument.uri;
  return documentSymbols.get(uri) || [];
});

/**
 * Get file system completion items for a path
 */
async function getPathCompletionItems(
  partialPath: string,
  isImport: boolean
): Promise<CompletionItem[]> {
  const items: CompletionItem[] = [];
  try {
    // Normalize the path
    let basePath = partialPath.replace(/^['"]/, '').replace(/['"]$/, '');
    const isRelative = basePath.startsWith('./') || basePath.startsWith('../');
    
    // For absolute paths or non-relative imports, suggest standard modules
    if (!isRelative) {
      if (isImport) {
        return [
          { label: 'path', kind: CompletionItemKind.Module },
          { label: 'fs', kind: CompletionItemKind.Module },
          { label: 'express', kind: CompletionItemKind.Module },
          { label: 'http', kind: CompletionItemKind.Module },
          { label: 'util', kind: CompletionItemKind.Module },
          { label: 'crypto', kind: CompletionItemKind.Module },
          { label: 'events', kind: CompletionItemKind.Module },
        ];
      }
      return items;
    }
    
    // Handle relative paths
    let dirPath = basePath;
    let prefix = '';
    
    // If path ends with a partial filename, separate it to use as filter
    const lastSlashIndex = basePath.lastIndexOf('/');
    if (lastSlashIndex !== -1 && lastSlashIndex !== basePath.length - 1) {
      dirPath = basePath.substring(0, lastSlashIndex + 1);
      prefix = basePath.substring(lastSlashIndex + 1);
    }
    
    // Create absolute path from workspace root
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return items;
    }
    
    const rootUri = workspaceFolders[0].uri;
    const rootPath = rootUri.replace('file://', '');
    
    const dirToScan = dirPath ? 
      path.resolve(rootPath, dirPath.replace(/^\.\//, '')) : 
      rootPath;
    
    // Get entries in the directory
    const entries = fs.readdirSync(dirToScan, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files unless explicitly looking for them
      if (entry.name.startsWith('.') && !prefix.startsWith('.')) {
        continue;
      }
      
      // Skip files that don't match the prefix
      if (prefix && !entry.name.startsWith(prefix)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        items.push({
          label: entry.name + '/',
          kind: CompletionItemKind.Folder,
          detail: 'Directory'
        });
      } else if (entry.isFile() && entry.name.endsWith('.hql')) {
        items.push({
          label: entry.name,
          kind: CompletionItemKind.File,
          detail: 'HQL File'
        });
      }
    }
  } catch (error) {
    console.error(`Error getting path completion items: ${error}`);
  }
  
  return items;
}

/**
 * Extract exported symbols from a module
 */
function extractExportedSymbols(moduleText: string): string[] {
  const exportedSymbols: string[] = [];
  
  try {
    // Parse the module
    const expressions = parse(moduleText);
    
    // Look for export statements
    for (const expr of expressions) {
      if (isList(expr) && expr.elements.length > 0 && 
          isSymbol(expr.elements[0]) && expr.elements[0].name === 'export') {
        
        // Vector-based export: (export [symbol1, symbol2])
        if (expr.elements.length > 1 && isList(expr.elements[1])) {
          const exportList = expr.elements[1];
          for (const elem of exportList.elements) {
            if (isSymbol(elem)) {
              exportedSymbols.push(elem.name);
            }
          }
        }
        // String-based export: (export "name" symbol)
        else if (expr.elements.length > 2 && 
                (isString(expr.elements[1]) || 
                 (isLiteral(expr.elements[1]) && 
                  expr.elements[1].type === "literal" && 
                  typeof expr.elements[1].value === 'string')) && 
                isSymbol(expr.elements[2])) {
          const symbolName = expr.elements[2].name;
          exportedSymbols.push(symbolName);
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting exports: ${error}`);
  }
  
  return exportedSymbols;
}

/**
 * Extract symbols from a module that can be imported
 */
async function getImportableSymbols(modulePath: string): Promise<CompletionItem[]> {
  const symbols: CompletionItem[] = [];
  
  try {
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (!workspaceFolders) return symbols;
    
    const rootUri = workspaceFolders[0].uri;
    const rootPath = rootUri.replace('file://', '');
    
    let resolvedPath = modulePath;
    // Handle relative paths
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      resolvedPath = path.resolve(rootPath, modulePath);
    }
    
    // Add .hql extension if needed
    if (!resolvedPath.endsWith('.hql')) {
      resolvedPath += '.hql';
    }
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return symbols;
    }
    
    const moduleText = fs.readFileSync(resolvedPath, 'utf8');
    
    // Extract exports
    const exports = extractExportedSymbols(moduleText);
    
    // Create completion items for exports
    for (const symbolName of exports) {
      symbols.push({
        label: symbolName,
        kind: CompletionItemKind.Value,
        detail: `Exported from ${modulePath}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Symbol \`${symbolName}\` exported from \`${modulePath}\``
        }
      });
    }
    
    // Also suggest 'as' keyword for aliasing
    if (exports.length > 0) {
      symbols.push({
        label: 'as',
        kind: CompletionItemKind.Keyword,
        detail: 'Import with alias',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Use `as` to import a symbol with a different name:\n\n```hql\n(import [original as alias] from "module")\n```'
        }
      });
    }
  } catch (error) {
    console.error(`Error getting importable symbols: ${error}`);
  }
  
  return symbols;
}

/**
 * Extract function parameters from a function definition
 */
function extractFunctionParams(document: TextDocument, symbol: SymbolInformation): 
  { params: { name: string, type?: string, defaultValue?: string }[] } | undefined {
  try {
    // Get the function definition text
    const range = symbol.location.range;
    const funcText = document.getText(range);
    
    // Parse the function definition
    const funcExpr = parse(funcText)[0];
    if (!isList(funcExpr) || !isSymbol(funcExpr.elements[0])) {
      return undefined;
    }
    
    const funcType = funcExpr.elements[0].name; // 'fn' or 'fx'
    
    // Find the parameter list
    const paramList = funcExpr.elements.find((el, index) => 
      index > 1 && isList(el)
    );
    
    if (!paramList || !isList(paramList)) {
      return undefined;
    }
    
    // Extract parameters
    const params: { name: string, type?: string, defaultValue?: string }[] = [];
    
    for (let i = 0; i < paramList.elements.length; i++) {
      const paramElem = paramList.elements[i];
      if (isSymbol(paramElem)) {
        const paramName = paramElem.name;
        
        // Check if the next element is a type annotation
        let type: string | undefined = undefined;
        let defaultValue: string | undefined = undefined;
        
        // Check for type annotation (param: Type)
        if (i + 2 < paramList.elements.length) {
          const colonElem = paramList.elements[i+1];
          const typeElem = paramList.elements[i+2];
          
          if (isSymbol(colonElem) && colonElem.name === ':' && isSymbol(typeElem)) {
            type = typeElem.name;
            i += 2; // Skip the ':' and type
            
            // Check for default value (param: Type = default)
            if (i + 2 < paramList.elements.length) {
              const equalsElem = paramList.elements[i+1];
              
              if (isSymbol(equalsElem) && equalsElem.name === '=') {
                // Extract default value as string
                defaultValue = sexpToString(paramList.elements[i+2]);
                i += 2; // Skip the '=' and default value
              }
            }
          }
        }
        // Check for default value without type (param = default)
        else if (i + 2 < paramList.elements.length) {
          const equalsElem = paramList.elements[i+1];
          
          if (isSymbol(equalsElem) && equalsElem.name === '=') {
            // Extract default value as string
            defaultValue = sexpToString(paramList.elements[i+2]);
            i += 2; // Skip the '=' and default value
          }
        }
        
        params.push({
          name: paramName,
          type,
          defaultValue
        });
      }
    }
    
    return { params };
  } catch (error) {
    console.error(`Error extracting function parameters: ${error}`);
    return undefined;
  }
}

// Handler for completion requests
connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const position = params.position;
  const adaptedDoc = createTextDocumentAdapter(document);
  const currentExp = getCurrentExpression(adaptedDoc, position);
  
  // Get all defined symbols for the current document
  const symbols = documentSymbols.get(document.uri) || [];
  
  // Get the current line up to the cursor position
  const currentLine = document.getText({
    start: { line: position.line, character: 0 },
    end: position
  });
  
  // Check if we're completing a path in an import statement
  if (/\(\s*import\b.*\bfrom\s+(['"])[^'"]*$/.test(currentLine)) {
    // Extract the partial path
    const match = currentLine.match(/\bfrom\s+(['"])([^'"]*?)$/);
    if (match) {
      const quote = match[1];
      const partialPath = match[2];
      const pathCompletions = await getPathCompletionItems(partialPath, true);
      
      // Format the completions with quotes
      return pathCompletions.map(item => ({
        ...item,
        label: item.label,
        textEdit: TextEdit.replace(
          Range.create(
            position.line, 
            position.character - partialPath.length,
            position.line,
            position.character
          ),
          item.label
        ),
        commitCharacters: ['/']
      }));
    }
  }
  
  // Enhanced import vector completion
  // Check if we're completing a symbol in an import vector
  if (/\(\s*import\s+\[[^\]]*$/.test(currentLine)) {
    // Check if we have a module path in the import
    const moduleMatch = currentLine.match(/from\s+['"]([^'"]+)['"]/);
    if (moduleMatch) {
      const modulePath = moduleMatch[1];
      return await getImportableSymbols(modulePath);
    }
    
    // If we're just starting the import list, suggest common imports
    return [
      { label: 'path', kind: CompletionItemKind.Module, detail: 'Node.js path module' },
      { label: 'fs', kind: CompletionItemKind.Module, detail: 'Node.js file system module' },
      { label: 'util', kind: CompletionItemKind.Module, detail: 'Node.js utilities module' },
      { label: 'http', kind: CompletionItemKind.Module, detail: 'Node.js HTTP module' },
      { label: 'express', kind: CompletionItemKind.Module, detail: 'Web framework' },
      // Add more common modules
    ];
  }
  
  // Prepare completion items
  let completionItems: CompletionItem[] = [];
  
  // Add all HQL keywords
  completionItems = completionItems.concat(hqlKeywords);
  
  // Add document symbols
  for (const symbol of symbols) {
    completionItems.push({
      label: symbol.name,
      kind: symbol.kind === SymbolKind.Function ? CompletionItemKind.Function :
            symbol.kind === SymbolKind.Variable ? CompletionItemKind.Variable :
            symbol.kind === SymbolKind.Class ? CompletionItemKind.Class :
            symbol.kind === SymbolKind.Struct ? CompletionItemKind.Struct :
            symbol.kind === SymbolKind.Enum ? CompletionItemKind.Enum :
            symbol.kind === SymbolKind.EnumMember ? CompletionItemKind.EnumMember :
            CompletionItemKind.Text
    });
  }
  
  // Add imported symbols to completion list
  const docImports = importedSymbols.get(document.uri) || [];
  
  // Add items from imported modules to completion
  for (const imported of docImports) {
    // Don't include namespace members in general completions
    if (imported.name.includes('.')) {
      continue;
    }
    
    let kindMapping: CompletionItemKind = CompletionItemKind.Variable;
    switch (imported.kind) {
      case SymbolKind.Function:
        kindMapping = CompletionItemKind.Function as CompletionItemKind;
        break;
      case SymbolKind.Class:
        kindMapping = CompletionItemKind.Class as CompletionItemKind;
        break;
      case SymbolKind.Enum:
        kindMapping = CompletionItemKind.Enum as CompletionItemKind;
        break;
      case SymbolKind.EnumMember:
        kindMapping = CompletionItemKind.EnumMember as CompletionItemKind;
        break;
      case SymbolKind.Module:
        kindMapping = CompletionItemKind.Module as CompletionItemKind;
        break;
    }
    
    completionItems.push({
      label: imported.name,
      kind: kindMapping,
      detail: `Imported from "${imported.sourceModule}"`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Imported as \`${imported.name}\` from \`${imported.sourceModule}\``
      }
    });
  }
  
  // Enhanced enum completion
  // Check if we're accessing an enum via dot notation
  const dotMatch = currentLine.match(/(\w+)\.\s*$/);
  if (dotMatch) {
    const enumName = dotMatch[1];
    
    // Find if the symbol is an enum
    const enumSymbol = symbols.find(s => 
      s.kind === SymbolKind.Enum && 
      s.name === enumName
    );
    
    if (enumSymbol) {
      // Find all enum cases for this enum
      const enumCases = symbols.filter(s => 
        s.kind === SymbolKind.EnumMember && 
        s.name.startsWith(`${enumName}.`)
      );
      
      // Return the enum cases as completion items
      return enumCases.map(enumCase => {
        const caseName = enumCase.name.substring(enumName.length + 1);
        return {
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of ${enumName}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${enumName}.${caseName}\` - Enum case from \`${enumName}\``
          }
        };
      });
    }
    
    // Check for imported enums as well
    const importedEnum = docImports.find(imp => 
      imp.kind === SymbolKind.Enum && 
      imp.name === enumName
    );

    if (importedEnum) {
      // Find associated enum cases
      const enumCases = docImports.filter(imp => 
        imp.kind === SymbolKind.EnumMember && 
        imp.name.startsWith(`${enumName}.`)
      );
      
      // Return the enum cases as completion items
      return enumCases.map(enumCase => {
        const caseName = enumCase.name.substring(enumName.length + 1);
        return {
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of ${enumName} (imported)`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${enumName}.${caseName}\` - Enum case from imported enum \`${enumName}\``
          }
        };
      });
    }
  }
  
  // Check if we're accessing an imported namespace
  const namespaceMatch = currentLine.match(/(\w+)\.\s*$/);
  if (namespaceMatch) {
    const namespaceName = namespaceMatch[1];
    
    // Check if this is an imported namespace
    const namespaceImport = docImports.find(imp => 
      imp.kind === SymbolKind.Module &&
      imp.name === namespaceName
    );
    
    if (namespaceImport) {
      // Find all namespace members
      const members = docImports.filter(imp => 
        imp.name.startsWith(`${namespaceName}.`)
      );
      
      // Return the members as completion items
      return members.map(member => {
        const memberName = member.name.substring(namespaceName.length + 1);
        let kindMapping: CompletionItemKind = CompletionItemKind.Variable;
        
        switch (member.kind) {
          case SymbolKind.Function:
            kindMapping = CompletionItemKind.Function as CompletionItemKind;
            break;
          case SymbolKind.Class:
            kindMapping = CompletionItemKind.Class as CompletionItemKind;
            break;
          case SymbolKind.Enum:
            kindMapping = CompletionItemKind.Enum as CompletionItemKind;
            break;
          case SymbolKind.EnumMember:
            kindMapping = CompletionItemKind.EnumMember as CompletionItemKind;
            break;
        }
        
        return {
          label: memberName,
          kind: kindMapping,
          detail: `Member of ${namespaceName} (imported from ${namespaceImport.sourceModule})`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${namespaceName}.${memberName}\` - From module \`${namespaceImport.sourceModule}\``
          }
        };
      });
    }
  }
  
  // Check if we're in a method chain after a dot
  if (/\.\s*$/.test(currentLine)) {
    // Try to infer the object type from the context
    let objectType = '';
    
    // Simple type inference based on variable names
    if (/(\w+)\.\s*$/.test(currentLine)) {
      const varName = RegExp.$1.toLowerCase();
      
      if (/array|list|items|numbers|vectors?/.test(varName)) {
        objectType = 'array';
      } else if (/string|text|msg|message/.test(varName)) {
        objectType = 'string';
      } else if (/map|obj|object|config|settings/.test(varName)) {
        objectType = 'object';
      } else if (/date|time/.test(varName)) {
        objectType = 'date';
      } else if (/math/.test(varName)) {
        objectType = 'math';
      } else if (/console/.test(varName)) {
        objectType = 'console';
      } else if (/re(gex)?|pattern/.test(varName)) {
        objectType = 'regexp';
      }
    }
    
    // Provide completions based on inferred type
    switch (objectType) {
      case 'array':
        return [
          { label: 'map', kind: CompletionItemKind.Method, detail: 'Transforms each element' },
          { label: 'filter', kind: CompletionItemKind.Method, detail: 'Filters elements by predicate' },
          { label: 'reduce', kind: CompletionItemKind.Method, detail: 'Reduces array to a single value' },
          { label: 'forEach', kind: CompletionItemKind.Method, detail: 'Executes function on each element' },
          { label: 'find', kind: CompletionItemKind.Method, detail: 'Finds first matching element' },
          { label: 'findIndex', kind: CompletionItemKind.Method, detail: 'Finds index of first matching element' },
          { label: 'some', kind: CompletionItemKind.Method, detail: 'Tests if some element passes predicate' },
          { label: 'every', kind: CompletionItemKind.Method, detail: 'Tests if all elements pass predicate' },
          { label: 'slice', kind: CompletionItemKind.Method, detail: 'Returns a portion of the array' },
          { label: 'concat', kind: CompletionItemKind.Method, detail: 'Concatenates arrays' },
          { label: 'join', kind: CompletionItemKind.Method, detail: 'Joins elements into string' },
          { label: 'length', kind: CompletionItemKind.Property, detail: 'Number of elements' },
          { label: 'push', kind: CompletionItemKind.Method, detail: 'Adds element to end' },
          { label: 'pop', kind: CompletionItemKind.Method, detail: 'Removes last element' },
          { label: 'shift', kind: CompletionItemKind.Method, detail: 'Removes first element' },
          { label: 'unshift', kind: CompletionItemKind.Method, detail: 'Adds element to beginning' }
        ];
        
      case 'string':
        return [
          { label: 'toLowerCase', kind: CompletionItemKind.Method, detail: 'Converts to lowercase' },
          { label: 'toUpperCase', kind: CompletionItemKind.Method, detail: 'Converts to uppercase' },
          { label: 'trim', kind: CompletionItemKind.Method, detail: 'Removes whitespace from ends' },
          { label: 'substring', kind: CompletionItemKind.Method, detail: 'Returns portion of string' },
          { label: 'substr', kind: CompletionItemKind.Method, detail: 'Returns characters from string' },
          { label: 'split', kind: CompletionItemKind.Method, detail: 'Splits string into array' },
          { label: 'replace', kind: CompletionItemKind.Method, detail: 'Replaces occurrences' },
          { label: 'match', kind: CompletionItemKind.Method, detail: 'Matches against regexp' },
          { label: 'indexOf', kind: CompletionItemKind.Method, detail: 'Finds position of substring' },
          { label: 'lastIndexOf', kind: CompletionItemKind.Method, detail: 'Finds last position of substring' },
          { label: 'startsWith', kind: CompletionItemKind.Method, detail: 'Tests if string starts with value' },
          { label: 'endsWith', kind: CompletionItemKind.Method, detail: 'Tests if string ends with value' },
          { label: 'includes', kind: CompletionItemKind.Method, detail: 'Tests if string contains value' },
          { label: 'length', kind: CompletionItemKind.Property, detail: 'Number of characters' }
        ];
        
      case 'math':
        return [
          { label: 'abs', kind: CompletionItemKind.Method, detail: 'Absolute value' },
          { label: 'max', kind: CompletionItemKind.Method, detail: 'Maximum value' },
          { label: 'min', kind: CompletionItemKind.Method, detail: 'Minimum value' },
          { label: 'floor', kind: CompletionItemKind.Method, detail: 'Round down' },
          { label: 'ceil', kind: CompletionItemKind.Method, detail: 'Round up' },
          { label: 'round', kind: CompletionItemKind.Method, detail: 'Round to nearest integer' },
          { label: 'random', kind: CompletionItemKind.Method, detail: 'Random number between 0 and 1' },
          { label: 'sqrt', kind: CompletionItemKind.Method, detail: 'Square root' },
          { label: 'pow', kind: CompletionItemKind.Method, detail: 'Power' },
          { label: 'PI', kind: CompletionItemKind.Constant, detail: 'π constant' },
          { label: 'E', kind: CompletionItemKind.Constant, detail: 'e constant' }
        ];
        
      case 'console':
        return [
          { label: 'log', kind: CompletionItemKind.Method, detail: 'Log message' },
          { label: 'error', kind: CompletionItemKind.Method, detail: 'Log error' },
          { label: 'warn', kind: CompletionItemKind.Method, detail: 'Log warning' },
          { label: 'info', kind: CompletionItemKind.Method, detail: 'Log info' },
          { label: 'debug', kind: CompletionItemKind.Method, detail: 'Log debug message' },
          { label: 'clear', kind: CompletionItemKind.Method, detail: 'Clear console' },
          { label: 'time', kind: CompletionItemKind.Method, detail: 'Start timer' },
          { label: 'timeEnd', kind: CompletionItemKind.Method, detail: 'End timer' },
          { label: 'trace', kind: CompletionItemKind.Method, detail: 'Output stack trace' },
          { label: 'table', kind: CompletionItemKind.Method, detail: 'Display tabular data' }
        ];
      
      case 'object':
        return [
          { label: 'keys', kind: CompletionItemKind.Method, detail: 'Get object keys', documentation: 'Object.keys(obj)' },
          { label: 'values', kind: CompletionItemKind.Method, detail: 'Get object values', documentation: 'Object.values(obj)' },
          { label: 'entries', kind: CompletionItemKind.Method, detail: 'Get object entries', documentation: 'Object.entries(obj)' },
          { label: 'hasOwnProperty', kind: CompletionItemKind.Method, detail: 'Check if property exists' },
          { label: 'toString', kind: CompletionItemKind.Method, detail: 'Convert to string' },
          { label: 'valueOf', kind: CompletionItemKind.Method, detail: 'Get primitive value' }
        ];
      
      case 'date':
        return [
          { label: 'getFullYear', kind: CompletionItemKind.Method, detail: 'Get year (4 digits)' },
          { label: 'getMonth', kind: CompletionItemKind.Method, detail: 'Get month (0-11)' },
          { label: 'getDate', kind: CompletionItemKind.Method, detail: 'Get day of month (1-31)' },
          { label: 'getDay', kind: CompletionItemKind.Method, detail: 'Get day of week (0-6)' },
          { label: 'getHours', kind: CompletionItemKind.Method, detail: 'Get hour (0-23)' },
          { label: 'getMinutes', kind: CompletionItemKind.Method, detail: 'Get minutes (0-59)' },
          { label: 'getSeconds', kind: CompletionItemKind.Method, detail: 'Get seconds (0-59)' },
          { label: 'getTime', kind: CompletionItemKind.Method, detail: 'Get timestamp (milliseconds)' },
          { label: 'toISOString', kind: CompletionItemKind.Method, detail: 'Convert to ISO string' },
          { label: 'toLocaleDateString', kind: CompletionItemKind.Method, detail: 'Convert to localized date string' },
          { label: 'toLocaleTimeString', kind: CompletionItemKind.Method, detail: 'Convert to localized time string' }
        ];
      
      case 'regexp':
        return [
          { label: 'test', kind: CompletionItemKind.Method, detail: 'Test if pattern matches string' },
          { label: 'exec', kind: CompletionItemKind.Method, detail: 'Execute search for match' },
          { label: 'source', kind: CompletionItemKind.Property, detail: 'Pattern text' },
          { label: 'flags', kind: CompletionItemKind.Property, detail: 'Flags (g, i, m, etc)' },
          { label: 'lastIndex', kind: CompletionItemKind.Property, detail: 'Index of next match' }
        ];
        
      default:
        // Generic object methods
        return [
          { label: 'toString', kind: CompletionItemKind.Method, detail: 'Convert to string' },
          { label: 'valueOf', kind: CompletionItemKind.Method, detail: 'Get primitive value' }
        ];
    }
  }
  
  // Check if we're in a function call after a parameter name (e.g., "x:")
  const paramMatch = currentLine.match(/\([^()]*\b(\w+)\s*:\s*$/);
  if (paramMatch) {
    const paramName = paramMatch[1];
    
    // Try to determine the function being called
    const funcCallMatch = currentLine.match(/\(\s*(\w+)/);
    if (funcCallMatch) {
      const funcName = funcCallMatch[1];
      
      // Look for the function in document symbols
      const funcSymbol = symbols.find(s => 
        s.kind === SymbolKind.Function && 
        s.name === funcName
      );
      
      if (funcSymbol) {
        // Try to extract parameter info from function definition
        const funcDefInfo = extractFunctionParams(document, funcSymbol);
        if (funcDefInfo && funcDefInfo.params) {
          // Filter parameters matching the current one
          const matchingParams = funcDefInfo.params.filter(p => 
            p.name.toLowerCase().includes(paramName.toLowerCase())
          );
          
          if (matchingParams.length > 0) {
            return matchingParams.map(p => ({
              label: p.name,
              kind: CompletionItemKind.Variable,
              detail: p.type ? `Parameter: ${p.name}: ${p.type}` : `Parameter: ${p.name}`,
              documentation: p.defaultValue 
                ? {
                    kind: MarkupKind.Markdown,
                    value: `Parameter with default value: \`${p.defaultValue}\``
                  }
                : undefined
            }));
          }
        }
      }
      
      // If no specific parameters found, offer generic completions based on function name
      if (funcName === 'add' || funcName === 'sum') {
        return [
          { label: 'x', kind: CompletionItemKind.Variable, detail: 'First operand' },
          { label: 'y', kind: CompletionItemKind.Variable, detail: 'Second operand' }
        ];
      } else if (funcName === 'map' || funcName === 'filter') {
        return [
          { label: 'fn', kind: CompletionItemKind.Variable, detail: 'Function to apply' },
          { label: 'coll', kind: CompletionItemKind.Variable, detail: 'Collection to operate on' }
        ];
      }
    }
  }
  
  return completionItems;
});

// Handler for hover information
connection.onHover(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return null;
  }
  
  try {
    // Get the expression at the cursor position
    const adaptedDoc = createTextDocumentAdapter(document);
    const expression = getCurrentExpression(adaptedDoc, position);
    if (!expression) {
      return null;
    }
    
    // Get the symbol at the cursor position
    const symbols = documentSymbols.get(document.uri) || [];
    
    // Check if we're hovering over a known symbol
    for (const symbol of symbols) {
      const range = symbol.location.range;
      if (
        position.line >= range.start.line && position.line <= range.end.line &&
        (position.line > range.start.line || position.character >= range.start.character) &&
        (position.line < range.end.line || position.character <= range.end.character)
      ) {
        // Found a symbol at the cursor position
        let content = '';
        
        switch (symbol.kind) {
          case SymbolKind.Function:
            content = `**Function** \`${symbol.name}\`\n\n`;
            // Extract function signature from document text
            try {
              const funcRange = symbol.location.range;
              const funcText = document.getText(funcRange);
              // Extract parameter list if possible
              const paramMatch = /\(([\w\s:&=]+)\)/.exec(funcText);
              if (paramMatch) {
                content += `\`\`\`hql\n(${symbol.name} ${paramMatch[0]})\n\`\`\``;
              } else {
                content += `\`\`\`hql\n${funcText.split('\n')[0]}...\n\`\`\``;
              }
            } catch (e) {
              content += `Function \`${symbol.name}\``;
            }
            break;
            
          case SymbolKind.Variable:
            content = `**Variable** \`${symbol.name}\``;
            break;
            
          case SymbolKind.Class:
            content = `**Class** \`${symbol.name}\``;
            break;
            
          case SymbolKind.Struct:
            content = `**Struct** \`${symbol.name}\``;
            break;
            
          case SymbolKind.Enum:
            content = `**Enum** \`${symbol.name}\``;
            // Find and list enum cases
            const enumCases = symbols.filter(s => 
              s.kind === SymbolKind.EnumMember && 
              s.name.startsWith(`${symbol.name}.`)
            );
            
            if (enumCases.length > 0) {
              content += '\n\n**Cases:**\n';
              for (const enumCase of enumCases) {
                content += `- \`${enumCase.name.substring(symbol.name.length + 1)}\`\n`;
              }
            }
            break;
            
          case SymbolKind.EnumMember:
            content = `**Enum Case** \`${symbol.name}\``;
            break;
            
          default:
            content = `${symbol.name}`;
        }
        
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: content
          },
          range: range
        };
      }
    }
    
    // Check if we're hovering over a known keyword
    const wordRange = getWordRangeAtPosition(document, position);
    if (wordRange) {
      const word = document.getText(wordRange);
      
      // Find in our keywords list
      for (const keyword of hqlKeywords) {
        if (keyword.label === word && keyword.documentation) {
          return {
            contents: keyword.documentation as MarkupContent,
            range: wordRange
          };
        }
      }
      
      // Check if it's an imported symbol
      const docImports = importedSymbols.get(document.uri) || [];
      const importedSymbol = docImports.find(imp => imp.name === word);
      
      if (importedSymbol) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**Imported Symbol** \`${word}\`\n\nImported from: \`${importedSymbol.sourceModule}\``
          },
          range: wordRange
        };
      }
      
      // Provide basic info for common functions/keywords
      if (word === 'if') {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: '```\n(if condition then-expr else-expr)\n```\nConditional expression.'
          },
          range: wordRange
        };
      } else if (word === 'let') {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: '```\n(let name value)\n```\nor\n```\n(let (name1 value1 name2 value2) body)\n```\nDefines immutable bindings.'
          },
          range: wordRange
        };
      } else if (word === 'var') {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: '```\n(var name value)\n```\nor\n```\n(var (name1 value1 name2 value2) body)\n```\nDefines mutable bindings.'
          },
          range: wordRange
        };
      } else if (word === 'enum') {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: '```\n(enum Name\n  (case case1)\n  (case case2 value)\n  (case case3 param1: Type1 param2: Type2))\n```\nDefines an enumeration type with optional values or associated types.'
          },
          range: wordRange
        };
      } else if (word === 'return') {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: '```\n(return value)\n```\nReturns a value from a function. Can be used for early returns in conditionals.'
          },
          range: wordRange
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error providing hover: ${error}`);
    return null;
  }
});

// Helper function to get the range of a word at a position
function getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  // Define word characters for HQL (including special characters)
  const wordPattern = /[a-zA-Z0-9_\-\+\*\/\?\!\>\<\=\%\&\.\:\[\]\{\}\(\)]/;
  
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
  
  return Range.create(document.positionAt(start), document.positionAt(end));
}

// Handler for go to definition
connection.onDefinition(async (params): Promise<Definition | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  
  try {
    const position = params.position;
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
      return null;
    }
    
    const word = document.getText(wordRange);
    const symbols = documentSymbols.get(document.uri) || [];
    
    // Look for a matching symbol
    for (const symbol of symbols) {
      if (symbol.name === word || symbol.name.endsWith(`.${word}`)) {
        return symbol.location;
      }
    }
    
    // Check in imported symbols
    const docImports = importedSymbols.get(document.uri) || [];
    const importedSymbol = docImports.find(imp => imp.name === word);
    
    if (importedSymbol) {
      // Try to find the original definition in the imported module
      try {
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        if (!workspaceFolders) return null;
        
        const rootUri = workspaceFolders[0].uri;
        const rootPath = rootUri.replace('file://', '');
        
        let modulePath = importedSymbol.sourceModule;
        // Handle relative paths
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
          modulePath = path.resolve(rootPath, modulePath);
        }
        
        // Add .hql extension if needed
        if (!modulePath.endsWith('.hql')) {
          modulePath += '.hql';
        }
        
        // Add file:// prefix
        const moduleUri = `file://${modulePath}`;
        
        // Return a location in the imported module
        return Location.create(moduleUri, Range.create(0, 0, 0, 0));
      } catch (error) {
        console.error(`Error resolving imported definition: ${error}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error providing definition: ${error}`);
    return null;
  }
});

// Validate a text document
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Try to parse the document
      const expressions = parse(text);
      
      // Validate expressions (e.g., check for undefined symbols, type errors, etc.)
      // This is where you would add your semantic validation for HQL
      // For example, you could check for undefined variables, type mismatches, etc.
      
      // For demonstration, let's add a simple check for unbalanced parentheses
      const openCount = (text.match(/\(/g) || []).length;
      const closeCount = (text.match(/\)/g) || []).length;
      
      if (openCount !== closeCount) {
        // Add diagnostic for unbalanced parentheses
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 }
          },
          message: `Unbalanced parentheses: ${openCount} opening vs ${closeCount} closing`,
          source: 'hql'
        });
      }
      
      // Check for undefined symbols in the document
      const definedSymbols = new Set<string>();
      const usedSymbols = new Set<string>();
      const importedSymbolsList = importedSymbols.get(textDocument.uri) || [];
      const importedNames = new Set(importedSymbolsList.map(s => s.name));
      
      for (const symbol of documentSymbols.get(textDocument.uri) || []) {
        definedSymbols.add(symbol.name);
      }
      
      // Find symbol usages
      for (const expr of expressions) {
        if (isList(expr)) {
          findSymbolUsagesInList(expr, usedSymbols);
        }
      }
      
      // Check for undefined symbols
      for (const symbol of usedSymbols) {
        if (!definedSymbols.has(symbol) && !importedNames.has(symbol) && !isBuiltInSymbol(symbol)) {
          // Try to find the location of the symbol usage
          const symbolPosition = findSymbolUsagePosition(text, symbol);
          if (symbolPosition) {
            diagnostics.push({
              severity: DiagnosticSeverity.Warning,
              range: {
                start: symbolPosition,
                end: { line: symbolPosition.line, character: symbolPosition.character + symbol.length }
              },
              message: `Undefined symbol: '${symbol}'`,
              source: 'hql'
            });
          }
        }
      }
      
    } catch (e) {
      // Parse error - add diagnostic
      if (e instanceof Error) {
        // Try to extract line and column information from the error message
        const errorMatch = /at line (\d+), column (\d+)/.exec(e.message);
        if (errorMatch) {
          const line = parseInt(errorMatch[1], 10) - 1; // 0-based
          const column = parseInt(errorMatch[2], 10) - 1; // 0-based
          
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line, character: column },
              end: { line, character: column + 1 }
            },
            message: e.message,
            source: 'hql'
          });
        } else {
          // Fallback if we can't extract position info
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 1 }
            },
            message: `Parse error: ${e.message}`,
            source: 'hql'
          });
        }
      }
    }
    
    // Send the diagnostics to the client
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  } catch (error) {
    console.error(`Error validating document: ${error}`);
  }
}

/**
 * Find symbol usages in a list expression
 */
function findSymbolUsagesInList(list: SList, usedSymbols: Set<string>) {
  for (const elem of list.elements) {
    if (isSymbol(elem)) {
      usedSymbols.add(elem.name);
    } else if (isList(elem)) {
      findSymbolUsagesInList(elem, usedSymbols);
    }
  }
}

/**
 * Check if a symbol is a built-in HQL symbol
 */
function isBuiltInSymbol(symbolName: string): boolean {
  // HQL built-in symbols
  const builtIns = new Set([
    'let', 'var', 'fn', 'fx', 'if', 'cond', 'when', 'unless', 'do', 'loop', 'recur',
    'for', 'while', 'repeat', 'enum', 'class', 'struct', 'case', 'import', 'export',
    'true', 'false', 'nil', '+', '-', '*', '/', '=', '!=', '<', '>', '<=', '>=',
    'and', 'or', 'not', 'print', 'str', 'get', 'vector', 'hash-map', 'hash-set',
    'empty-array', 'empty-map', 'empty-set', 'return', 'set!', 'defmacro', 'macro',
    'lambda', 'quote', 'quasiquote', 'unquote', 'unquote-splicing', '->', 'as',
    'from', 'console.log', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Date', 'RegExp', 'Error', 'Promise', 'Set', 'Map', 'JSON', 'parseInt', 'parseFloat'
  ]);
  
  return builtIns.has(symbolName) || symbolName.startsWith('.') || 
         /^[0-9]+$/.test(symbolName);
}

/**
 * Find a symbol usage position in the document text
 */
function findSymbolUsagePosition(text: string, symbolName: string): Position | null {
  const symbolPattern = new RegExp(`\\b${symbolName}\\b`, 'g');
  let match;
  
  // Find all occurrences to get line/column info
  let lineCount = 0;
  let lastLineStart = 0;
  let lines: number[] = [0];
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lineCount++;
      lastLineStart = i + 1;
      lines.push(lastLineStart);
    }
  }
  
  // Reset regex lastIndex
  symbolPattern.lastIndex = 0;
  
  // Find a match and convert offset to line/column
  while ((match = symbolPattern.exec(text)) !== null) {
    const offset = match.index;
    
    // Find the line number
    let line = 0;
    for (let i = 0; i < lines.length; i++) {
      if (offset >= lines[i]) {
        line = i;
      } else {
        break;
      }
    }
    
    // Calculate column
    const column = offset - lines[line];
    
    return { line, character: column };
  }
  
  return null;
}

// Handler for semantic tokens
connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  
  try {
    const text = document.getText();
    const builder = new SemanticTokensBuilder();
    
    // Parse the document to generate semantic tokens
    try {
      const expressions = parse(text);
      processExpressions(expressions, document, builder);
    } catch (error) {
      // If parsing fails, still try to add tokens for basic syntax
      addBasicTokens(text, document, builder);
    }
    
    return builder.build();
  } catch (error) {
    console.error(`Error providing semantic tokens: ${error}`);
    return { data: [] };
  }
});

/**
 * Process parsed expressions to add semantic tokens
 */
function processExpressions(expressions: SExp[], document: TextDocument, builder: SemanticTokensBuilder): void {
  const text = document.getText();
  // Recursively process expressions to add tokens
  for (const expr of expressions) {
    if (isList(expr)) {
      // Process list expressions
      const adaptedDoc = createTextDocumentAdapter(document);
      const range = findExpressionRange(adaptedDoc, expr);
      
      // Check if it's a special form
      if (expr.elements.length > 0 && isSymbol(expr.elements[0])) {
        const firstSymbol = expr.elements[0] as SSymbol;
        const symbolName = firstSymbol.name;
        
        // Add token for the symbol - special highlight for keywords
        const symbolPos = document.positionAt(document.offsetAt(range.start) + 1);
        
        if (['fn', 'fx', 'let', 'var', 'if', 'cond', 'when', 'class', 'enum', 'return'].includes(symbolName)) {
          // Keywords
          builder.push(
            symbolPos.line,
            symbolPos.character,
            symbolName.length,
            0, // 'keyword'
            0
          );
        } else {
          // Function calls
          builder.push(
            symbolPos.line,
            symbolPos.character,
            symbolName.length,
            12, // 'function'
            0
          );
        }
        
        // Process arguments based on the type of form
        if (symbolName === 'fn' || symbolName === 'fx') {
          // Handle function definitions
          if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
            const fnNameSymbol = expr.elements[1] as SSymbol;
            const fnNamePos = document.positionAt(
              document.offsetAt(range.start) + 1 + symbolName.length + 1 + (text.substring(document.offsetAt(range.start) + 1 + symbolName.length, document.offsetAt(range.start) + 1 + symbolName.length + 1 + fnNameSymbol.name.length).match(/^\s+/) || [''])[0].length
            );
            
            builder.push(
              fnNamePos.line,
              fnNamePos.character,
              fnNameSymbol.name.length,
              12, // 'function'
              1  // 'declaration'
            );
          }
        } else if (symbolName === 'let' || symbolName === 'var') {
          // Handle variable definitions
          if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
            const varNameSymbol = expr.elements[1] as SSymbol;
            const varNamePos = document.positionAt(
              document.offsetAt(range.start) + 1 + symbolName.length + 1 + (text.substring(document.offsetAt(range.start) + 1 + symbolName.length, document.offsetAt(range.start) + 1 + symbolName.length + 1 + varNameSymbol.name.length).match(/^\s+/) || [''])[0].length
            );
            
            builder.push(
              varNamePos.line,
              varNamePos.character,
              varNameSymbol.name.length,
              13, // 'variable'
              1  // 'declaration'
            );
          }
        }
      }
      
      // Recursively process elements
      for (const element of expr.elements) {
        if (isList(element)) {
          processExpressions([element], document, builder);
        } else if (isString(element)) {
          const stringRange = findExpressionRange(adaptedDoc, element);
          const startPos = document.positionAt(document.offsetAt(stringRange.start));
          
          builder.push(
            startPos.line,
            startPos.character,
            document.offsetAt(stringRange.end) - document.offsetAt(stringRange.start),
            1, // 'string'
            0
          );
        } else if (isNumber(element)) {
          const numRange = findExpressionRange(adaptedDoc, element);
          const startPos = document.positionAt(document.offsetAt(numRange.start));
          
          builder.push(
            startPos.line,
            startPos.character,
            document.offsetAt(numRange.end) - document.offsetAt(numRange.start),
            3, // 'number'
            0
          );
        }
      }
    }
  }
}

/**
 * Add basic tokens for syntax highlighting when parsing fails
 */
function addBasicTokens(text: string, document: TextDocument, builder: SemanticTokensBuilder): void {
  // Add tokens for keywords
  const keywordRegex = /\b(let|var|fn|fx|if|cond|when|unless|do|loop|recur|for|while|repeat|defmacro|macro|class|struct|enum|import|export|return|true|false|nil)\b/g;
  let match;
  while ((match = keywordRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    builder.push(
      startPos.line,
      startPos.character,
      match[0].length,
      0, // token type: 'keyword'
      0  // token modifiers
    );
  }
  
  // Add tokens for strings
  const stringRegex = /"(?:[^"\\]|\\.)*"/g;
  while ((match = stringRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    builder.push(
      startPos.line,
      startPos.character,
      match[0].length,
      1, // token type: 'string'
      0  // token modifiers
    );
  }
  
  // Add tokens for numbers
  const numberRegex = /-?\b\d+(\.\d+)?\b/g;
  while ((match = numberRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    builder.push(
      startPos.line,
      startPos.character,
      match[0].length,
      3, // token type: 'number'
      0  // token modifiers
    );
  }
  
  // Add tokens for comments
  const commentRegex = /(;.*)|(\/\/.*)|\/\*[\s\S]*?\*\//g;
  while ((match = commentRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const lines = match[0].split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        const linePos = document.positionAt(match.index + match[0].split("\n").slice(0, i).join("\n").length);
        builder.push(
          linePos.line,
          linePos.character,
          lines[i].length,
          0, // token type: 'comment'
          0  // token modifiers
        );
      }
    }
  }
}

// Function for creating Position objects
function createPosition(line: number, character: number): Position {
  return Position.create(line, character);
}

// Function for creating Range objects
function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return Range.create(
    createPosition(startLine, startChar), 
    createPosition(endLine, endChar)
  );
}

// Check if an expression is a literal
function isLiteral(exp: SExp): boolean {
  return exp.type === "literal";
}

// Start the language server
connection.listen();

/**
 * Helper function to check if an expression has a string value
 */
function hasStringValue(exp: SExp): boolean {
  return (isString(exp) || 
         (isLiteral(exp) && 
          exp.type === "literal" && 
          typeof exp.value === 'string'));
}