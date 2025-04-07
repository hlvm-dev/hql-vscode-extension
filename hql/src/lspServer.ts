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
  TextEdit,
  CompletionParams,
  DocumentSymbol,
  InsertTextFormat
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import * as path from 'path';
import * as fs from 'fs';

import { parse, SExp, SList, SSymbol, SString, SNumber, SBoolean, SNil, ParseError } from './parser';
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

// Track imported symbols for better completions
interface ImportedSymbol {
  name: string;          // Local name
  sourceName: string;    // Original name
  sourceModule: string;  // Module it came from
  kind: SymbolKind;      // Kind of symbol
}

// Extended SymbolInformation with data field
interface ExtendedSymbolInformation extends SymbolInformation {
  data?: {
    documentation?: string;
    params?: { 
      name: string; 
      type: string; 
      defaultValue?: string;
    }[];
    enumName?: string;
    sourceModule?: string;
  };
}

// Map from document URI to imported symbols
const importedSymbols: Map<string, ImportedSymbol[]> = new Map();

// Keep track of document symbols to provide code completion
let documentSymbols: Map<string, ExtendedSymbolInformation[]> = new Map();

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
      // Disable semantic tokens completely
      semanticTokensProvider: undefined
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
    const text = textDocument.getText();
    
    // Clear existing imported symbols
    importedSymbols.delete(textDocument.uri);
    
    // Parse the document with tolerant mode
    const expressions = parse(text, true);
    const symbols: ImportedSymbol[] = [];
    
    // Look for import statements: (import "module-name")
    for (const expr of expressions) {
      if (isList(expr) && expr.elements.length > 0) {
        const first = expr.elements[0];
        if (isSymbol(first) && first.name === 'import') {
          // ... existing code ...
        }
      }
    }
    
    // Store imported symbols for this document
    importedSymbols.set(textDocument.uri, symbols);
  } catch (error) {
    console.error(`Error updating imported symbols: ${error instanceof Error ? error.message : String(error)}`);
    importedSymbols.set(textDocument.uri, []);
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
          let documentation = "";
          if (i > 0) {
            // Get the range of the previous expression to check for comments
            const adaptedDoc = createTextDocumentAdapter(textDocument);
            const currentRange = findExpressionRange(adaptedDoc, expr);
            const previousExpr = expressions[i-1];
            const previousRange = findExpressionRange(adaptedDoc, previousExpr);
            
            // Check if there's text between the previous expression and current one
            const textBetween = textDocument.getText({
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
              documentation = commentLines.join("\n");
            }
          }
          
          // Handle function definitions
          if (name === 'fn' || name === 'fx' || name === 'defmacro' || name === 'macro') {
            if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
              const funcName = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              // Extract parameter information
              let params = [];
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
                        const defaultExpr = paramList.elements[j+2];
                        defaultValue = sexpToString(defaultExpr);
                        j += 2; // Skip the '=' and default value
                      }
                    }
                    // Check for default value without type (param = default)
                    else if (j + 2 < paramList.elements.length && 
                             isSymbol(paramList.elements[j+1]) && 
                             (paramList.elements[j+1] as SSymbol).name === '=') {
                      // Extract default value
                      const defaultExpr = paramList.elements[j+2];
                      defaultValue = sexpToString(defaultExpr);
                      j += 2; // Skip the '=' and default value
                    }
                    
                    params.push({ 
                      name: paramName, 
                      type: paramType,
                      defaultValue: defaultValue
                    });
                  }
                }
              }
              
              symbols.push({
                name: funcName,
                kind: SymbolKind.Function,
                location: Location.create(uri, range),
                // Store documentation and params in the data field
                data: {
                  documentation: documentation,
                  params: params
                }
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
                location: Location.create(uri, range),
                data: {
                  documentation: documentation
                }
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
                    location: Location.create(uri, range),
                    data: {
                      documentation: documentation
                    }
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
                location: Location.create(uri, range),
                data: {
                  documentation: documentation
                }
              });
            }
          }
          
          // Handle enum definitions
          else if (name === 'enum') {
            if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
              const enumName = expr.elements[1].name;
              const adaptedDoc = createTextDocumentAdapter(textDocument);
              const range = findExpressionRange(adaptedDoc, expr);
              
              console.log(`Adding enum symbol: ${enumName}`);
              
              symbols.push({
                name: enumName,
                kind: SymbolKind.Enum,
                location: Location.create(uri, range),
                data: {
                  documentation: documentation
                }
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
                    
                    console.log(`Adding enum case: ${enumName}.${caseName}`);
                    
                    symbols.push({
                      name: `${enumName}.${caseName}`,
                      kind: SymbolKind.EnumMember,
                      location: Location.create(uri, caseRange),
                      data: {
                        enumName: enumName
                      }
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
    console.error(`Error updating document symbols: ${error instanceof Error ? error.message : String(error)}`);
    documentSymbols.set(textDocument.uri, []);
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
    console.log(`Getting path completions for: "${partialPath}"`);
    
    // Normalize the path
    let basePath = partialPath.replace(/^['"]/, '').replace(/['"]$/, '');
    const isRelative = basePath.startsWith('./') || basePath.startsWith('../');
    
    // For absolute paths or non-relative imports, suggest standard modules
    if (!isRelative) {
      if (isImport) {
        return [
          { 
            label: 'path', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js path module',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js path module provides utilities for working with file and directory paths.'
            }
          },
          { 
            label: 'fs', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js file system module',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js fs module provides an API for interacting with the file system.'
            }
          },
          { 
            label: 'express', 
            kind: CompletionItemKind.Module,
            detail: 'Web application framework',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'Express is a minimal and flexible Node.js web application framework.'
            }
          },
          { 
            label: 'http', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js HTTP module',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js http module provides HTTP server and client functionality.'
            }
          },
          { 
            label: 'util', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js utility functions',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js util module provides utility functions for debugging and other tasks.'
            }
          },
          { 
            label: 'crypto', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js cryptographic functionality',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js crypto module provides cryptographic functionality.'
            }
          },
          { 
            label: 'events', 
            kind: CompletionItemKind.Module,
            detail: 'Node.js event handling',
            documentation: {
              kind: MarkupKind.Markdown,
              value: 'The Node.js events module provides an EventEmitter class for event handling.'
            }
          },
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
    
    // Create absolute path from workspace root or document directory
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return items;
    }
    
    // Get the current document URI
    const textDocuments = documents.all();
    const activeDocumentUri = textDocuments.length > 0 ? textDocuments[0].uri : workspaceFolders[0].uri;
    let documentDirPath = path.dirname(activeDocumentUri.replace('file://', ''));
    
    // Use document directory as base for relative paths
    let rootUri = workspaceFolders[0].uri;
    let rootPath = rootUri.replace('file://', '');
    
    const dirToScan = dirPath ? 
      path.resolve(documentDirPath, dirPath.replace(/^\.\//, '')) : 
      documentDirPath;
    
    console.log(`Scanning directory: ${dirToScan}`);
    
    // Check if directory exists
    if (!fs.existsSync(dirToScan)) {
      console.log(`Directory does not exist: ${dirToScan}`);
      return items;
    }
    
    // Get entries in the directory
    const entries = fs.readdirSync(dirToScan, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files unless explicitly looking for them
      if (entry.name.startsWith('.') && !prefix.startsWith('.')) {
        continue;
      }
      
      // Skip files that don't match the prefix
      if (prefix && !entry.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        continue;
      }
      
      if (entry.isDirectory()) {
        items.push({
          label: entry.name + '/',
          kind: CompletionItemKind.Folder,
          detail: 'Directory',
          insertText: entry.name + '/',
          documentation: {
            kind: MarkupKind.Markdown,
            value: `Directory containing HQL files at ${path.join(dirPath, entry.name)}`
          },
          data: {
            type: 'directory',
            path: path.join(dirToScan, entry.name)
          }
        });
      } else if (entry.isFile() && (entry.name.endsWith('.hql') || isImport)) {
        items.push({
          label: entry.name,
          kind: CompletionItemKind.File,
          detail: entry.name.endsWith('.hql') ? 'HQL File' : 'File',
          insertText: entry.name,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `File at ${path.join(dirPath, entry.name)}`
          },
          data: {
            type: 'file',
            path: path.join(dirToScan, entry.name)
          }
        });
      }
    }
    
    // Sort directories first, then files
    items.sort((a, b) => {
      if (a.kind === CompletionItemKind.Folder && b.kind !== CompletionItemKind.Folder) {
        return -1;
      }
      if (a.kind !== CompletionItemKind.Folder && b.kind === CompletionItemKind.Folder) {
        return 1;
      }
      return a.label.toString().localeCompare(b.label.toString());
    });
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
        },
        data: {
          sourceModule: modulePath,
          symbolName: symbolName
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
function extractFunctionParams(document: TextDocument, symbol: ExtendedSymbolInformation): 
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
connection.onCompletion(async (params: CompletionParams): Promise<CompletionItem[]> => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const position = params.position;
    const adaptedDoc = createTextDocumentAdapter(document);
    
    // Get the current line up to the cursor position
    const currentLine = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });

    // Get full text for context awareness
    const text = document.getText();

    // Check if we're in a snippet or placeholder mode by looking for special markers
    // VS Code adds special characters around placeholders, which we can detect
    const isInSnippetMode = currentLine.includes('${') || 
                           // Check if we're in an active template placeholder
                           /\$\{\d+:[^}]+\}/.test(currentLine) ||
                           // Check if we're right after a template insertion
                           /\(\w+\s+\w*$/.test(currentLine);
    
    // If we're in snippet mode, don't offer any completions to avoid
    // interfering with tab navigation through placeholders
    if (isInSnippetMode) {
      return [];
    }

    try {
      console.log(`Current line for completion: "${currentLine}"`);
    } catch (error) {
      // Ignore logging errors
    }

    // SPECIAL HANDLING FOR OS DOT NOTATION
    // This is a targeted fix for the specific issue with os. completions
    const osPattern = /\b[oO][sS]\.\s*$/;  // Match "os." or "OS." at word boundary
    if (osPattern.test(currentLine)) {
      console.log("EXACT MATCH for OS. pattern - providing OS enum cases ONLY");
      
      // Fixed set of OS cases
      const osCases = ['macOS', 'windows', 'linux', 'iOS', 'android'];
      const completionItems: CompletionItem[] = [];
      
      // Add OS enum cases
      for (const caseName of osCases) {
        completionItems.push({
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum OS`,
          sortText: `00-${caseName}`, // Highest priority
          // Making the item selected by default
          preselect: true,
          // Add command to dismiss completion if Escape is pressed
          command: {
            title: 'Hide completion',
            command: 'editor.action.triggerSuggest'
          },
          data: { enumName: 'OS' }
        });
      }
      
      console.log(`Returning ONLY ${completionItems.length} fixed OS enum completions - blocking all other suggestions`);
      return completionItems;
    }

    // SPECIAL HANDLING FOR INSTALL OS DOT PATTERN
    const installOsPattern = /\binstall\s+[oO][sS]\.\s*$/;
    if (installOsPattern.test(currentLine)) {
      console.log("EXACT MATCH for 'install OS.' pattern - providing OS enum cases ONLY");
      
      // Fixed set of OS cases
      const osCases = ['macOS', 'windows', 'linux', 'iOS', 'android'];
      const completionItems: CompletionItem[] = [];
      
      // Add OS enum cases
      for (const caseName of osCases) {
        completionItems.push({
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum OS`,
          sortText: `00-${caseName}`, // Highest priority
          // Making the item selected by default
          preselect: true,
          // Add command to dismiss completion if Escape is pressed
          command: {
            title: 'Hide completion',
            command: 'editor.action.triggerSuggest'
          },
          data: { enumName: 'OS' }
        });
      }
      
      console.log(`Returning ONLY ${completionItems.length} fixed OS enum completions for install os. - blocking all others`);
      return completionItems;
    }

    // GENERAL ENUM DOT PATTERN
    const enumDotPattern = /\b(\w+)\.\s*$/;
    if (enumDotPattern.test(currentLine)) {
      const enumName = currentLine.match(enumDotPattern)![1];
      console.log(`Detected enum dot pattern for ${enumName} - PREVENTING all other completions`);
      
      // Get all defined symbols for the current document
      const symbols = documentSymbols.get(document.uri) || [];
      
      // Find all enum definitions (with case insensitive matching)
      const enums = symbols.filter(s => s.kind === SymbolKind.Enum);
      const matchingEnum = enums.find(e => 
        e.name.toLowerCase() === enumName.toLowerCase()
      );
      
      if (matchingEnum) {
        const actualEnumName = matchingEnum.name;
        console.log(`Found matching enum: ${actualEnumName} - FILTERING to only show enum cases`);
        
        // Find all enum members for this enum
        const enumMembers = symbols.filter(s => 
          s.kind === SymbolKind.EnumMember && 
          s.data && s.data.enumName === actualEnumName
        );
        
        const completionItems: CompletionItem[] = [];
        
        if (enumMembers.length > 0) {
          // We found enum members, add them to completion
          for (const member of enumMembers) {
            const memberName = member.name.split('.')[1]; // Get just the case name
            
            completionItems.push({
              label: memberName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${actualEnumName}`,
              sortText: `00-${memberName}`, // HIGHEST priority
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: actualEnumName }
            });
          }
          
          console.log(`Returning ONLY ${completionItems.length} enum completions - blocking all others`);
          return completionItems;
        }
      } else {
        console.log(`No matching enum found for ${enumName} - still filtering to prevent unwanted completions`);
        
        // Return empty array to prevent any completions at all in this context
        return [];
      }
    }

    // Try to get the current expression using tolerant parsing
    let currentExp;
    try {
      currentExp = getCurrentExpression(adaptedDoc, position, true);
    } catch (error) {
      console.log(`Error getting current expression: ${error}`);
      // Don't return early, we can still provide completions based on the current line
    }
    
    // Prepare basic completions
    let completionItems: CompletionItem[] = [];
    
    // IMPROVED ENUM DOT COMPLETION
    // First check for a direct enum dot notation - captures both cases like:
    // 1. "os."
    // 2. "install os."
    const directDotMatch = currentLine.match(/\b(\w+)\.\s*$/);
    if (directDotMatch) {
      const enumName = directDotMatch[1];
      console.log(`Detected dot notation for possible enum: ${enumName}`);
      
      // Get all defined symbols for the current document
      const symbols = documentSymbols.get(document.uri) || [];
      const enums = symbols.filter(s => s.kind === SymbolKind.Enum);
      
      // Find the matching enum with case-insensitive comparison
      const matchingEnum = enums.find(e => 
        e.name.toLowerCase() === enumName.toLowerCase()
      );
      
      if (matchingEnum) {
        const actualEnumName = matchingEnum.name; // Get the correct case
        console.log(`Found matching enum: ${actualEnumName}`);
        
        // Find all enum members for this enum
        const enumMembers = symbols.filter(s => 
          s.kind === SymbolKind.EnumMember && 
          s.data && s.data.enumName === actualEnumName
        );
        
        if (enumMembers.length > 0) {
          // We found enum members, add them to completion
          for (const member of enumMembers) {
            const memberName = member.name.split('.')[1]; // Get just the case name
            
            completionItems.push({
              label: memberName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${actualEnumName}`,
              sortText: `00-${memberName}`, // HIGHEST priority for enum cases
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: actualEnumName }
            });
          }
          
          // Only return the enum members in this context
          console.log(`Returning ${completionItems.length} enum completions for ${actualEnumName}`);
          return completionItems;
        } else {
          console.log(`No enum members found for ${actualEnumName}`);
        }
      } else {
        console.log(`No matching enum found for ${enumName}`);
        
        // Special check for function parameter that is an enum
        // This handles cases like: (install os.)
        const functionParamMatch = currentLine.match(/\((\w+)\s+(\w+)\.\s*$/);
        if (functionParamMatch) {
          const functionName = functionParamMatch[1];
          const paramName = functionParamMatch[2];
          console.log(`Detected function call with enum param: ${functionName} ${paramName}`);
          
          // SPECIFIC WORKAROUND: Handle the common case of install os.
          if (functionName.toLowerCase() === 'install' && paramName.toLowerCase() === 'os') {
            console.log('Found special case of "install os." - providing OS enum cases');
            
            // Look for OS enum specifically
            const osEnum = enums.find(e => e.name.toLowerCase() === 'os');
            
            if (osEnum) {
              const actualEnumName = osEnum.name;
              
              // Find all OS enum members
              const enumMembers = symbols.filter(s => 
                s.kind === SymbolKind.EnumMember && 
                s.data && s.data.enumName === actualEnumName
              );
              
              if (enumMembers.length > 0) {
                // Add OS enum members to completion
                for (const member of enumMembers) {
                  const memberName = member.name.split('.')[1];
                  
                  completionItems.push({
                    label: memberName,
                    kind: CompletionItemKind.EnumMember,
                    detail: `Case of enum ${actualEnumName}`,
                    sortText: `00-${memberName}`,
                    preselect: true,
                    command: {
                      title: 'Hide completion',
                      command: 'editor.action.triggerSuggest'
                    },
                    data: { enumName: actualEnumName }
                  });
                }
                
                console.log(`Returning ${completionItems.length} OS enum completions`);
                return completionItems;
              }
            } else {
              // Fallback if OS enum isn't defined yet - provide common OS values
              console.log('OS enum not found - providing default OS cases');
              const defaultOSCases = ['macOS', 'windows', 'linux', 'android', 'iOS'];
              
              for (const caseName of defaultOSCases) {
                completionItems.push({
                  label: caseName,
                  kind: CompletionItemKind.EnumMember,
                  detail: 'Common OS type',
                  sortText: `00-${caseName}`,
                  preselect: true,
                  command: {
                    title: 'Hide completion',
                    command: 'editor.action.triggerSuggest'
                  },
                  data: { enumName: 'OS' }
                });
              }
              
              return completionItems;
            }
          }
          
          // Find parameter type from function definition
          const functions = symbols.filter(s => 
            s.kind === SymbolKind.Function && 
            s.name.toLowerCase() === functionName.toLowerCase()
          );
          
          if (functions.length > 0) {
            console.log(`Found matching function: ${functions[0].name}`);
            
            // Try to use function parameter information to determine the enum type
            if (functions[0].data && functions[0].data.params) {
              const params = functions[0].data.params;
              
              // Look for a parameter with a type that matches an enum
              for (const param of params) {
                const paramType = param.type;
                console.log(`Checking parameter ${param.name} with type ${paramType}`);
                
                // Find if parameter type matches an enum
                const enumMatch = enums.find(e => 
                  e.name.toLowerCase() === paramType.toLowerCase()
                );
                
                if (enumMatch) {
                  const actualEnumName = enumMatch.name;
                  console.log(`Found matching enum from param type: ${actualEnumName}`);
                  
                  // Find all enum members for this enum
                  const enumMembers = symbols.filter(s => 
                    s.kind === SymbolKind.EnumMember && 
                    s.data && s.data.enumName === actualEnumName
                  );
                  
                  if (enumMembers.length > 0) {
                    // Add enum members to completion
                    for (const member of enumMembers) {
                      const memberName = member.name.split('.')[1];
                      
                      completionItems.push({
                        label: memberName,
                        kind: CompletionItemKind.EnumMember,
                        detail: `Case of enum ${actualEnumName}`,
                        sortText: `00-${memberName}`,
                        preselect: true,
                        command: {
                          title: 'Hide completion',
                          command: 'editor.action.triggerSuggest'
                        },
                        data: { enumName: actualEnumName }
                      });
                    }
                    
                    console.log(`Returning ${completionItems.length} enum completions from function param type`);
                    return completionItems;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Special case for "os: ." syntax - ensures we handle the case when dot is just typed
    const exactDotRegex = /(\w+)\s*:\s*\.$/;
    const exactDotMatch = currentLine.match(exactDotRegex);
    if (exactDotMatch && exactDotMatch[1]) {
      const paramName = exactDotMatch[1];
      console.log(`Special handling for "${paramName}: ." pattern`);
      
      // Try to find the parameter type by examining the surrounding context
      const symbols = documentSymbols.get(document.uri) || [];
      const enums = symbols.filter(s => s.kind === SymbolKind.Enum);
      
      // Special handling for common parameter names
      if (paramName.toLowerCase() === 'os') {
        const osEnum = enums.find(e => e.name.toLowerCase() === 'os');
        if (osEnum) {
          // Get OS enum cases
          const enumCases = symbols.filter(s => 
            s.kind === SymbolKind.EnumMember && 
            s.data && s.data.enumName === osEnum.name
          );
          
          completionItems = [];
          
          for (const enumCase of enumCases) {
            const caseName = enumCase.name.split('.')[1];
            completionItems.push({
              label: caseName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${osEnum.name}`,
              sortText: `00-${caseName}`, // HIGHEST priority
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: osEnum.name, caseName: caseName }
            });
          }
          
          if (completionItems.length > 0) {
            console.log(`Returning ${completionItems.length} OS enum completions (DOT PATTERN) <===`);
            return completionItems;
          }
        } else {
          // Provide default OS values if no OS enum is defined
          completionItems = [];
          const defaultOSCases = ['macOS', 'windows', 'linux', 'iOS', 'android'];
          for (const caseName of defaultOSCases) {
            completionItems.push({
              label: caseName,
              kind: CompletionItemKind.EnumMember,
              detail: 'Common OS type',
              sortText: `00-${caseName}`,
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: 'OS' }
            });
          }
          
          console.log(`Returning ${completionItems.length} default OS values (DOT PATTERN) <===`);
          return completionItems;
        }
      }
      
      // Try to find the enclosing function to determine parameter type
      try {
        const functionContext = findEnclosingFunction(document, position);
        if (functionContext) {
          const functionText = document.getText(functionContext.range);
          const paramTypeMatch = new RegExp(`${paramName}\\s*:\\s*(\\w+)`).exec(functionText);
          
          if (paramTypeMatch) {
            const parameterType = paramTypeMatch[1];
            console.log(`Found parameter type: ${parameterType}`);
            
            // Find the matching enum
            const matchingEnum = enums.find(e => 
              e.name.toLowerCase() === parameterType.toLowerCase()
            );
            
            if (matchingEnum) {
              // Get all cases for this enum
              const enumCases = symbols.filter(s => 
                s.kind === SymbolKind.EnumMember && 
                s.data && s.data.enumName === matchingEnum.name
              );
              
              completionItems = [];
              
              // Create completions for all enum cases
              for (const enumCase of enumCases) {
                const caseName = enumCase.name.split('.')[1];
                
                completionItems.push({
                  label: caseName,
                  kind: CompletionItemKind.EnumMember,
                  detail: `Case of enum ${matchingEnum.name}`,
                  sortText: `00-${caseName}`, // Highest priority
                  preselect: true,
                  command: {
                    title: 'Hide completion',
                    command: 'editor.action.triggerSuggest'
                  },
                  data: { 
                    enumName: matchingEnum.name,
                    caseName: caseName
                  }
                });
              }
              
              if (completionItems.length > 0) {
                console.log(`Returning ${completionItems.length} enum completions for parameter (DOT PATTERN) <===`);
                return completionItems;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error in special dot handling: ${error}`);
      }
    }
    
    // Check for "parameter: ." syntax for enum dotted notation - Swift-like syntax
    const dotWithTypeRegex = /(\w+)\s*:\s*\.(\w*)$/;
    const dotWithTypeMatch = currentLine.match(dotWithTypeRegex);
    if (dotWithTypeMatch && dotWithTypeMatch[1]) {
      const paramName = dotWithTypeMatch[1];
      console.log(`Detected parameter with dot notation: ${paramName} - HIGHEST PRIORITY HANDLING`);
      
      // Try to find the parameter type by examining the surrounding context
      const symbols = documentSymbols.get(document.uri) || [];
      const enums = symbols.filter(s => s.kind === SymbolKind.Enum);
      
      // Special handling for common parameter names
      if (paramName.toLowerCase() === 'os') {
        console.log(`Special handling for OS parameter`);
        const osEnum = enums.find(e => e.name.toLowerCase() === 'os');
        if (osEnum) {
          // Get OS enum cases
          const enumCases = symbols.filter(s => 
            s.kind === SymbolKind.EnumMember && 
            s.data && s.data.enumName === osEnum.name
          );
          
          // Clear any existing completions
          completionItems = [];
          
          for (const enumCase of enumCases) {
            const caseName = enumCase.name.split('.')[1];
            completionItems.push({
              label: caseName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${osEnum.name}`,
              sortText: `00-${caseName}`, // HIGHEST priority
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: osEnum.name, caseName: caseName }
            });
          }
          
          if (completionItems.length > 0) {
            console.log(`Returning ${completionItems.length} OS enum completions (HIGH PRIORITY)`);
            return completionItems;
          }
        } else {
          // Provide default OS values if no OS enum is defined
          completionItems = [];
          const defaultOSCases = ['macOS', 'windows', 'linux', 'iOS', 'android'];
          for (const caseName of defaultOSCases) {
            completionItems.push({
              label: caseName,
              kind: CompletionItemKind.EnumMember,
              detail: 'Common OS type',
              sortText: `00-${caseName}`,
              preselect: true,
              command: {
                title: 'Hide completion',
                command: 'editor.action.triggerSuggest'
              },
              data: { enumName: 'OS' }
            });
          }
          
          console.log(`Returning ${completionItems.length} default OS values (HIGH PRIORITY)`);
          return completionItems;
        }
      }
      
      // Check the current function context to determine parameter type
      let parameterType = '';
      
      try {
        // Try to find the enclosing function
        const functionContext = findEnclosingFunction(document, position);
        if (functionContext) {
          // Check if this parameter has a type annotation
          const functionText = document.getText(functionContext.range);
          // Look for "paramName: TypeName" pattern
          const paramTypeMatch = new RegExp(`${paramName}\\s*:\\s*(\\w+)`).exec(functionText);
          
          if (paramTypeMatch) {
            parameterType = paramTypeMatch[1];
            console.log(`Found parameter type: ${parameterType}`);
            
            // Find the matching enum - do case insensitive comparison
            const matchingEnum = enums.find(e => 
              e.name.toLowerCase() === parameterType.toLowerCase()
            );
            
            if (matchingEnum) {
              // Get all cases for this enum
              const enumCases = symbols.filter(s => 
                s.kind === SymbolKind.EnumMember && 
                s.data && s.data.enumName === matchingEnum.name
              );
              
              // Clear any existing completions
              completionItems = [];
              
              // Create completions for all enum cases
              for (const enumCase of enumCases) {
                // Extract just the case name without the enum prefix
                const caseName = enumCase.name.split('.')[1];
                
                completionItems.push({
                  label: caseName,
                  kind: CompletionItemKind.EnumMember,
                  detail: `Case of enum ${matchingEnum.name}`,
                  sortText: `00-${caseName}`, // Highest priority
                  preselect: true,
                  command: {
                    title: 'Hide completion',
                    command: 'editor.action.triggerSuggest'
                  },
                  data: { 
                    enumName: matchingEnum.name,
                    caseName: caseName
                  }
                });
              }
              
              // Only return enum cases if we found matching ones
              if (completionItems.length > 0) {
                console.log(`Returning ${completionItems.length} enum completions for parameter`);
                return completionItems;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error finding parameter type: ${error}`);
      }
    }
    
    // Check for enum/class member access with dot notation - keep this as fallback
    const dotMatch = currentLine.match(/(\w+)\.\s*$/);
    if (dotMatch && !directDotMatch) { // Only run if not already handled by directDotMatch
      const typeName = dotMatch[1];
      console.log(`Detected secondary dot notation access: ${typeName}`);
      
      // Get all defined symbols for the current document
      const symbols = documentSymbols.get(document.uri) || [];
      
      // Find the enum definition - do case insensitive comparison for better matching
      const enumSymbol = symbols.find(s => 
        s.kind === SymbolKind.Enum && 
        s.name.toLowerCase() === typeName.toLowerCase()
      );
      
      if (enumSymbol) {
        const actualEnumName = enumSymbol.name; // Get the actual enum name with correct case
        
        // Find all enum members for this enum
        const enumMembers = symbols.filter(s => 
          s.kind === SymbolKind.EnumMember && 
          s.data && s.data.enumName === actualEnumName
        );
      
        if (enumMembers.length > 0) {
          // We found enum members, add them to completion
          for (const member of enumMembers) {
            const memberName = member.name.split('.')[1]; // Get just the case name
            
            completionItems.push({
              label: memberName,
              kind: CompletionItemKind.EnumMember,
              detail: `Case of enum ${actualEnumName}`,
              sortText: `10-${memberName}`, // Higher priority in this context
              data: { enumName: actualEnumName }
            });
          }
          
          // Only return the enum members in this context
          return completionItems;
        }
      }
      
      // Look for class methods
      const classSymbol = symbols.find(s => 
        (s.kind === SymbolKind.Class || s.kind === SymbolKind.Struct) && 
        s.name.toLowerCase() === typeName.toLowerCase()
      );
      
      if (classSymbol) {
        const actualClassName = classSymbol.name; // Get the actual class name with correct case
        
        // Find all methods that belong to this class
        const classMethods = symbols.filter(s => 
          s.kind === SymbolKind.Function && 
          s.name.startsWith(`${actualClassName}.`)
        );
        
        for (const method of classMethods) {
          const methodName = method.name.split('.')[1]; // Get just the method name
          
          completionItems.push({
            label: methodName,
            kind: CompletionItemKind.Method,
            detail: `Method of ${actualClassName}`,
            sortText: `10-${methodName}`, // Higher priority in this context
            data: method.data
          });
        }
        
        return completionItems;
      }
    }
    
    // Check for import statement with relative path
    const importPathMatch = currentLine.match(/import\s+\[\s*([^,\s]*)\s*(?:,\s*([^,\s]*)\s*)?\]\s+from\s+["']([^"']*)$/);
    if (importPathMatch) {
      // We're in an import statement with a path
      const partialPath = importPathMatch[3] || '';
      
      // Provide path completions
      const pathCompletions = await getPathCompletionItems(partialPath, true);
      completionItems = pathCompletions;
      
      // Only return path completions in this context
      return completionItems;
    }
    
    // Check for import statement with module specified but cursor in the symbol area
    const importSymbolMatch = currentLine.match(/import\s+\[\s*([^,\s]*)?$/);
    if (importSymbolMatch || currentLine.match(/import\s+\[.*\]\s+from\s+["'](.+)["']\s*$/)) {
      // We're in an import statement, looking for symbols
      // Check if we can extract a module path from elsewhere in the line
      const modulePath = text.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
      
      if (modulePath) {
        // We have a module path, suggest importable symbols from that module
        const symbolCompletions = await getImportableSymbols(modulePath);
        completionItems = symbolCompletions;
        
        // Only return symbol completions in this context
        return completionItems;
      }
    }
    
    // Get all defined symbols for the current document
    const symbols = documentSymbols.get(document.uri) || [];
    
    // Add document symbols with HIGHEST priority
    for (const symbol of symbols) {
      const completionItem: CompletionItem = {
        label: symbol.name,
        kind: symbol.kind === SymbolKind.Function ? CompletionItemKind.Function :
              symbol.kind === SymbolKind.Variable ? CompletionItemKind.Variable :
              symbol.kind === SymbolKind.Class ? CompletionItemKind.Class :
              symbol.kind === SymbolKind.Struct ? CompletionItemKind.Struct :
              symbol.kind === SymbolKind.Enum ? CompletionItemKind.Enum :
              symbol.kind === SymbolKind.EnumMember ? CompletionItemKind.EnumMember :
              CompletionItemKind.Text,
        sortText: `01-${symbol.name}` // HIGHER priority than templates
      };
      
      // Add data for resolving
      if (symbol.data) {
        completionItem.data = symbol.data;
        
        // Add documentation if available
        if (symbol.data.documentation) {
          completionItem.documentation = {
            kind: MarkupKind.Markdown,
            value: symbol.data.documentation
          };
        }
        
        // For functions, prepare insertText with parameter placeholders
        if (symbol.kind === SymbolKind.Function && symbol.data.params) {
          // Create a snippet-style template for the function call
          let insertText = `(${symbol.name}`;
          const params = symbol.data.params;
          
          if (params.length > 0) {
            insertText += ' ';
            insertText += params.map((param, index) => 
              `\${${index + 1}:${param.name}${param.type !== 'Any' ? ': ' + param.type : ''}${param.defaultValue ? ' = ' + param.defaultValue : ''}}` 
            ).join(' ');
          }
          
          insertText += ')';
          
          completionItem.insertText = insertText;
          completionItem.insertTextFormat = InsertTextFormat.Snippet;
          
          // Add parameter info to detail
          const paramInfo = params.map(p => 
            `${p.name}: ${p.type}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`
          ).join(', ');
          
          completionItem.detail = `(${symbol.name} ${paramInfo})`;
        }
      }
      
      completionItems.push(completionItem);
    }
    
    // Add template-based completions for the specific word being typed
    const wordMatch = currentLine.match(/(\w+)$/);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      const templateCompletions = getTemplateCompletions(word);
      completionItems = completionItems.concat(templateCompletions);
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
        },
        sortText: `30-${imported.name}`, // Priority between document symbols and basic completions
        data: {
          sourceModule: imported.sourceModule,
          symbolName: imported.name
        }
      });
    }
    
    // Add basic completions with lowest priority if we haven't already added templates
    if (!wordMatch) {
      const basicCompletions = getBasicCompletions();
      completionItems = completionItems.concat(basicCompletions);
    }

    return completionItems;
  } catch (error) {
    console.error(`Error getting completions: ${error instanceof Error ? error.message : String(error)}`);
    return getBasicCompletions();
  }
});

/**
 * Get template completions for a specific keyword
 */
function getTemplateCompletions(word: string): CompletionItem[] {
  // Get all template completions
  const allTemplates = getBasicCompletions().filter(item => 
    item.kind === CompletionItemKind.Snippet
  );
  
  // Filter templates that match the current word
  return allTemplates.filter(template => 
    template.label.toString().toLowerCase().startsWith(word) ||
    (template.filterText && template.filterText.toLowerCase().includes(word))
  );
}

/**
 * Get basic completion items for HQL keywords
 */
function getBasicCompletions(): CompletionItem[] {
  const completions: CompletionItem[] = [];
  
  // Template-based completions (higher priority)
  completions.push(
    // Function template
    {
      label: 'fn',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a function',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a function definition with parameters and body'
      },
      insertText: '(fn ${1:function-name} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '10-fn', // Medium priority
      filterText: 'fn function'
    },
    
    // Lambda function template
    {
      label: 'fx',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a pure function',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a pure function with typed parameters and return type'
      },
      insertText: '(fx ${1:function-name} (${2:param}: ${3:Type}) (-> ${4:ReturnType})\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '10-fx',
      filterText: 'fx function pure'
    },
    
    // Enum template
    {
      label: 'enum',
      kind: CompletionItemKind.Snippet,
      detail: 'Define an enumeration',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a simple enumeration with cases'
      },
      insertText: '(enum ${1:EnumName}\n  (case ${2:case1})\n  (case ${3:case2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `00-enum`, // HIGHEST priority (changed from 20-enum)
      filterText: 'enum enumeration'
    },
    
    // Enum with raw values template
    {
      label: 'enum-raw',
      kind: CompletionItemKind.Snippet,
      detail: 'Define an enum with raw values',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates an enum with raw values for each case'
      },
      insertText: '(enum ${1:EnumName} : ${2:Int}\n  (case ${3:Case1} ${4:1})\n  (case ${5:Case2} ${6:2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '10-enum-raw',
      filterText: 'enum enumeration raw'
    },
    
    // Enum with associated values template
    {
      label: 'enum-assoc',
      kind: CompletionItemKind.Snippet,
      detail: 'Define an enum with associated values',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates an enum with associated values for each case'
      },
      insertText: '(enum ${1:EnumName}\n  (case ${2:Case1} ${3:param1}: ${4:Type1})\n  (case ${5:Case2} ${6:param2}: ${7:Type2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-enum-assoc',
      filterText: 'enum enumeration associated'
    },
    
    // Let binding template
    {
      label: 'let',
      kind: CompletionItemKind.Snippet,
      detail: 'Create local bindings',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates local variable bindings'
      },
      insertText: '(let ${1:name} ${2:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-let',
      filterText: 'let binding variable'
    },
    
    // Let binding multiple template
    {
      label: 'let-multi',
      kind: CompletionItemKind.Snippet,
      detail: 'Create multiple local bindings',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates multiple local variable bindings'
      },
      insertText: '(let (${1:name1} ${2:value1}\n      ${3:name2} ${4:value2})\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-let-multi',
      filterText: 'let binding multiple'
    },
    
    // Var binding template
    {
      label: 'var',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a variable',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a variable binding'
      },
      insertText: '(var ${1:name} ${2:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-var',
      filterText: 'var variable'
    },
    
    // If template
    {
      label: 'if',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional expression',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates an if-then-else expression'
      },
      insertText: '(if ${1:condition}\n  ${2:then-expr}\n  ${3:else-expr})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-if',
      filterText: 'if condition'
    },
    
    // When template
    {
      label: 'when',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional expression (only when true)',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Executes body only when condition is true'
      },
      insertText: '(when ${1:condition}\n  ${2:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-when',
      filterText: 'when condition'
    },
    
    // Unless template
    {
      label: 'unless',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional expression (only when false)',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Executes body only when condition is false'
      },
      insertText: '(unless ${1:condition}\n  ${2:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-unless',
      filterText: 'unless condition'
    },
    
    // Cond template
    {
      label: 'cond',
      kind: CompletionItemKind.Snippet,
      detail: 'Multi-branch conditional',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a multi-branch conditional expression'
      },
      insertText: '(cond\n  ((${1:condition1}) ${2:expr1})\n  ((${3:condition2}) ${4:expr2})\n  (else ${5:default-expr}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-cond',
      filterText: 'cond condition multiple'
    },
    
    // Class template
    {
      label: 'class',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a class',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a class definition with methods'
      },
      insertText: '(class ${1:ClassName}\n  ;; Class fields\n  (var ${2:field1})\n\n  ;; Constructor\n  (constructor (${3:param}: ${4:Type})\n    (set! this.${2:field1} ${3:param}))\n  \n  ;; Method\n  (method ${5:methodName} (${6:param}: ${7:Type}) (-> ${8:ReturnType})\n    ${9:method-body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-class',
      filterText: 'class object'
    },
    
    // Struct template
    {
      label: 'struct',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a struct',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a struct definition with fields'
      },
      insertText: '(struct ${1:StructName}\n  (field ${2:field1}: ${3:Type1})\n  (field ${4:field2}: ${5:Type2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-struct',
      filterText: 'struct record'
    },
    
    // Import template
    {
      label: 'import',
      kind: CompletionItemKind.Snippet,
      detail: 'Import a module',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Imports symbols from another module'
      },
      insertText: '(import [${1:symbols}] from "${2:module-path}")',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-import',
      filterText: 'import module'
    },
    
    // Import with alias template
    {
      label: 'import-as',
      kind: CompletionItemKind.Snippet,
      detail: 'Import with alias',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Imports a symbol with an alias'
      },
      insertText: '(import [${1:original} as ${2:alias}] from "${3:module-path}")',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-import-as',
      filterText: 'import module alias'
    },
    
    // Export template
    {
      label: 'export',
      kind: CompletionItemKind.Snippet,
      detail: 'Export symbols',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Exports symbols from the current module'
      },
      insertText: '(export ${1:symbol1} ${2:symbol2})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-export',
      filterText: 'export module'
    },

    // Export as template
    {
      label: 'export-as',
      kind: CompletionItemKind.Snippet,
      detail: 'Export with alias',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Exports a symbol with a different name'
      },
      insertText: '(export "${1:external-name}" ${2:internal-symbol})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-export-as',
      filterText: 'export alias module'
    },
    
    // Loop template
    {
      label: 'loop',
      kind: CompletionItemKind.Snippet,
      detail: 'Create a loop',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a loop with bindings and recur'
      },
      insertText: '(loop [${1:binding} ${2:init-value}]\n  (if ${3:condition}\n    (recur ${4:next-value})\n    ${5:result}))',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-loop',
      filterText: 'loop recur iteration'
    },
    
    // Return template
    {
      label: 'return',
      kind: CompletionItemKind.Snippet,
      detail: 'Return a value',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns a value from a function'
      },
      insertText: '(return ${1:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-return',
      filterText: 'return function'
    },
    
    // Do template
    {
      label: 'do',
      kind: CompletionItemKind.Snippet,
      detail: 'Execute multiple expressions',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Evaluates multiple expressions in sequence'
      },
      insertText: '(do\n  ${1:expr1}\n  ${2:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-do',
      filterText: 'do sequence'
    },
    
    // Add template
    {
      label: 'add',
      kind: CompletionItemKind.Snippet,
      detail: 'Addition operation',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Adds numbers together'
      },
      insertText: '(add ${1:x}: ${2:Int} ${3:y}: ${4:Int})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '10-add',
      filterText: 'add plus sum addition'
    },
    
    // Addition operator template
    {
      label: 'plus',
      kind: CompletionItemKind.Snippet,
      detail: 'Addition operator',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Adds values using the + operator'
      },
      insertText: '(+ ${1:a} ${2:b})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '20-plus',
      filterText: 'plus add operator +'
    },
    
    // Subtract template
    {
      label: 'subtract',
      kind: CompletionItemKind.Snippet,
      detail: 'Subtraction operation',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Subtracts numbers'
      },
      insertText: '(- ${1:a} ${2:b})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-subtract',
      filterText: 'subtract minus difference'
    },
    
    // Multiply template
    {
      label: 'multiply',
      kind: CompletionItemKind.Snippet,
      detail: 'Multiplication operation',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Multiplies numbers'
      },
      insertText: '(* ${1:a} ${2:b})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-multiply',
      filterText: 'multiply times product'
    },
    
    // Divide template
    {
      label: 'divide',
      kind: CompletionItemKind.Snippet,
      detail: 'Division operation',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Divides numbers'
      },
      insertText: '(/ ${1:a} ${2:b})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-divide',
      filterText: 'divide quotient division'
    },
    
    // JS call template
    {
      label: 'js-call',
      kind: CompletionItemKind.Snippet,
      detail: 'Call a JavaScript method',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Calls a JavaScript method on an object'
      },
      insertText: '(js-call ${1:object} "${2:method}" ${3:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-js-call',
      filterText: 'js javascript call'
    },
    
    // JS get template
    {
      label: 'js-get',
      kind: CompletionItemKind.Snippet,
      detail: 'Get a JavaScript property',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Gets a property from a JavaScript object'
      },
      insertText: '(js-get ${1:object} "${2:property}")',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-js-get',
      filterText: 'js javascript get property'
    },
    
    // JS set template
    {
      label: 'js-set',
      kind: CompletionItemKind.Snippet,
      detail: 'Set a JavaScript property',
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Sets a property on a JavaScript object'
      },
      insertText: '(js-set ${1:object} "${2:property}" ${3:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: '01-js-set',
      filterText: 'js javascript set property'
    }
  );
  
  // Basic keyword completions (lower priority)
  const keywords = [
    'fn', 'fx', 'let', 'var', 'if', 'cond', 'when', 'unless',
    'do', 'loop', 'recur', 'for', 'while', 'enum', 'class',
    'struct', 'case', 'return', 'import', 'export', 'macro',
    'defmacro', 'quote', 'quasiquote', 'unquote', 'true', 'false', 'nil',
    'from', 'as', 'js-call', 'js-get', 'js-set', 'print', 'constructor', 'method'
  ];
  
  for (const keyword of keywords) {
    completions.push({
      label: keyword,
      kind: CompletionItemKind.Keyword,
      detail: `HQL keyword: ${keyword}`,
      sortText: `99-${keyword}`, // Higher sort text = lower priority
    });
  }
  
  // Common operators with lower priority than templates but higher than keywords
  const operators = [
    '+', '-', '*', '/', '=', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not'
  ];
  
  for (const op of operators) {
    completions.push({
      label: op,
      kind: CompletionItemKind.Operator,
      detail: `Operator: ${op}`,
      sortText: `50-${op}`,
    });
  }
  
  // Common types
  const types = [
    'Int', 'String', 'Bool', 'Double', 'Any', 'Void', 'Array', 'Object'
  ];
  
  for (const type of types) {
    completions.push({
      label: type,
      kind: CompletionItemKind.Class,
      detail: `Type: ${type}`,
      sortText: `40-${type}`,
    });
  }
  
  return completions;
}

function setupCompletionCommands(completionItem: CompletionItem): CompletionItem {
  // Add command to hide completions on selection (not on Escape)
  if (!completionItem.command) {
    completionItem.command = {
      title: 'Trigger suggest',
      command: 'editor.action.triggerSuggest'
    };
  }
  return completionItem;
}

// Apply to all completion items in onCompletionResolve
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  // Add additional information for resolved completion items
  const data = item.data as any;
  
  if (data) {
    // Set documentation based on the type of item
    if (data.params) {
      // Function completion
      const paramsString = data.params.map((p: any) => `${p.name}: ${p.type || 'any'}`).join('\n- ');
      item.detail = item.detail || `Function with parameters`;
      item.documentation = {
        kind: MarkupKind.Markdown,
        value: `### Parameters\n- ${paramsString}\n\n${data.documentation || ''}`
      };
    } 
    else if (data.enumName) {
      item.detail = item.detail || `Case of enum ${data.enumName}`;
      item.documentation = {
        kind: MarkupKind.Markdown,
        value: `Enum case from \`${data.enumName}\``
      };
    }
  }
  
  // Add command to hide completion on Escape key
  return setupCompletionCommands(item);
});

// Define basic keyword documentation for hover
const keywordDocumentation = {
  'fn': {
    kind: MarkupKind.Markdown,
    value: '```\n(fn name (args...) body)\n```\nDefines a new function.'
  },
  'fx': {
    kind: MarkupKind.Markdown, 
    value: '```\n(fx name (param1: Type1 param2: Type2) (-> ReturnType)\n  body)\n```\nDefines a pure function with typed parameters.'
  },
  'let': {
    kind: MarkupKind.Markdown,
    value: '```\n(let name value)\n```\nor\n```\n(let (name1 value1 name2 value2) body)\n```\nDefines immutable bindings.'
  },
  'var': {
    kind: MarkupKind.Markdown,
    value: '```\n(var name value)\n```\nor\n```\n(var (name1 value1 name2 value2) body)\n```\nDefines mutable bindings.'
  },
  'if': {
    kind: MarkupKind.Markdown,
    value: '```\n(if condition then-expr else-expr)\n```\nConditional expression.'
  },
  'enum': {
    kind: MarkupKind.Markdown,
    value: '```\n(enum Name\n  (case case1)\n  (case case2))\n```\nDefines an enumeration type with optional values or associated types.'
  },
  'return': {
    kind: MarkupKind.Markdown,
    value: '```\n(return value)\n```\nReturns a value from a function. Can be used for early returns in conditionals.'
  }
};

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
      
      // Check if we're hovering over a keyword with documentation
      if (word in keywordDocumentation) {
        return {
          contents: keywordDocumentation[word as keyof typeof keywordDocumentation],
          range: wordRange
        };
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
      
      // Add any additional hover information here for symbols not covered by keywordDocumentation
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
export async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  try {
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    
    try {
      // Try to parse the document with tolerant mode first 
      // to avoid unnecessary diagnostic errors during typing
      const expressions = parse(text, true);
      
      // Only perform stricter validation if tolerant parsing succeeded
      try {
        // Now try to parse with strict mode to find actual errors
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
      
      // Validate expressions (e.g., check for undefined symbols, type errors, etc.)
      // This is where you would add your semantic validation for HQL
      
      // For demonstration, let's add a simple check for unbalanced parentheses
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
      for (const symbolName of usedSymbols) {
        // Skip built-in symbols and symbols from imports
        if (isBuiltInSymbol(symbolName) || importedNames.has(symbolName) || definedSymbols.has(symbolName)) {
          continue;
        }
        
        // Add diagnostic for undefined symbol
        const position = findSymbolUsagePosition(text, symbolName);
        if (position) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: position,
              end: { line: position.line, character: position.character + symbolName.length }
            },
            message: `Undefined symbol: ${symbolName}`,
            source: 'hql'
          });
        }
      }
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
      }
    }
    
    // Send the diagnostics to the client
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  } catch (error) {
    console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Find symbol usages in a list expression
 */
export function findSymbolUsagesInList(list: SList, usedSymbols: Set<string>) {
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
export function isBuiltInSymbol(symbolName: string): boolean {
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
  // Disable semantic tokens by returning empty data
  // This will let the syntax highlighting be controlled by the client's grammar
  return { data: [] };
});

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

/**
 * Find the enclosing function context for a given position
 * Returns the range and name of the function if found
 */
function findEnclosingFunction(document: TextDocument, position: Position): { range: Range, name: string } | null {
  // Get all function symbols in the document
  const symbols = documentSymbols.get(document.uri) || [];
  const functions = symbols.filter(s => s.kind === SymbolKind.Function);
  
  // Find the innermost function that contains the position
  let bestMatch: { range: Range, name: string } | null = null;
  let smallestSize = Infinity;
  
  for (const func of functions) {
    const range = func.location.range;
    
    // Check if position is within this function's range
    if (position.line >= range.start.line && position.line <= range.end.line &&
        (position.line > range.start.line || position.character >= range.start.character) &&
        (position.line < range.end.line || position.character <= range.end.character)) {
      
      // Calculate the size of this range
      const size = 
        (range.end.line - range.start.line) * 1000 + 
        (range.end.character - range.start.character);
      
      // Keep the smallest (most specific) range that contains the position
      if (size < smallestSize) {
        smallestSize = size;
        bestMatch = { 
          range, 
          name: func.name 
        };
      }
    }
  }
  
  return bestMatch;
}