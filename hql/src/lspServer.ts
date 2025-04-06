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
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

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

// Manages the connection initialization
connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that the server supports code completion
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['(', '.', ':', ' ']
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
  });
});

// Listen for text document open events
documents.onDidOpen(event => {
  validateTextDocument(event.document);
  updateDocumentSymbols(event.document);
});

// Listen for text document save events
documents.onDidSave(event => {
  validateTextDocument(event.document);
  updateDocumentSymbols(event.document);
});

// Helper function to update document symbols
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

// Handler for completion requests
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const position = params.position;
  const adaptedDoc = createTextDocumentAdapter(document);
  const currentExp = getCurrentExpression(adaptedDoc, position);
  
  // Get all defined symbols for the current document
  const symbols = documentSymbols.get(document.uri) || [];
  
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
  
  // Check if we're in a form that requires special handling
  if (currentExp && isList(currentExp) && currentExp.elements.length > 0) {
    const firstElement = currentExp.elements[0];
    
    // If we're in an import form, suggest module names
    if (isSymbol(firstElement) && firstElement.name === 'import') {
      // Here you could add module names from your project
      completionItems = completionItems.concat([
        { label: 'path', kind: CompletionItemKind.Module },
        { label: 'fs', kind: CompletionItemKind.Module },
        { label: 'express', kind: CompletionItemKind.Module },
        // Add more module names as needed
      ]);
    }
    
    // If we're in a method chain, suggest methods
    if (isSymbol(firstElement) && 
        firstElement.name.startsWith('.') && 
        currentExp.elements.length >= 2) {
      // Add method suggestions based on context
      // For example, if we detect we're working with an array
      completionItems = completionItems.concat([
        { label: 'map', kind: CompletionItemKind.Method },
        { label: 'filter', kind: CompletionItemKind.Method },
        { label: 'reduce', kind: CompletionItemKind.Method },
        { label: 'forEach', kind: CompletionItemKind.Method },
        { label: 'push', kind: CompletionItemKind.Method },
        { label: 'pop', kind: CompletionItemKind.Method }
      ]);
    }
    
    // Suggest types after a colon in parameter lists
    if (isSymbol(firstElement) && 
        (firstElement.name === 'fn' || firstElement.name === 'fx') &&
        document.getText().substring(document.offsetAt(position) - 1, document.offsetAt(position)) === ':') {
      // Add type suggestions
      completionItems = [
        { label: 'Int', kind: CompletionItemKind.TypeParameter },
        { label: 'Float', kind: CompletionItemKind.TypeParameter },
        { label: 'Double', kind: CompletionItemKind.TypeParameter },
        { label: 'String', kind: CompletionItemKind.TypeParameter },
        { label: 'Boolean', kind: CompletionItemKind.TypeParameter },
        { label: 'Bool', kind: CompletionItemKind.TypeParameter },
        { label: '[Int]', kind: CompletionItemKind.TypeParameter, detail: 'Array of integers' },
        { label: '[String]', kind: CompletionItemKind.TypeParameter, detail: 'Array of strings' },
        { label: 'Any', kind: CompletionItemKind.TypeParameter }
      ];
    }
  }
  
  // If we are after a dot, suggest methods/properties based on context
  const linePrefix = document.getText({
    start: { line: position.line, character: 0 },
    end: position
  });
  
  if (linePrefix.endsWith('.')) {
    // Try to determine the object type from the prefix
    const prefixWithoutDot = linePrefix.slice(0, -1).trim();
    
    // Add contextual suggestions based on what we know
    if (/array|numbers|items|list/i.test(prefixWithoutDot)) {
      // Array methods
      completionItems = [
        { label: 'map', kind: CompletionItemKind.Method },
        { label: 'filter', kind: CompletionItemKind.Method },
        { label: 'reduce', kind: CompletionItemKind.Method },
        { label: 'forEach', kind: CompletionItemKind.Method },
        { label: 'push', kind: CompletionItemKind.Method },
        { label: 'pop', kind: CompletionItemKind.Method },
        { label: 'length', kind: CompletionItemKind.Property }
      ];
    } else if (/string|str|text/i.test(prefixWithoutDot)) {
      // String methods
      completionItems = [
        { label: 'length', kind: CompletionItemKind.Property },
        { label: 'toUpperCase', kind: CompletionItemKind.Method },
        { label: 'toLowerCase', kind: CompletionItemKind.Method },
        { label: 'trim', kind: CompletionItemKind.Method },
        { label: 'split', kind: CompletionItemKind.Method },
        { label: 'substring', kind: CompletionItemKind.Method }
      ];
    } else if (/console/i.test(prefixWithoutDot)) {
      // Console methods
      completionItems = [
        { label: 'log', kind: CompletionItemKind.Method },
        { label: 'error', kind: CompletionItemKind.Method },
        { label: 'warn', kind: CompletionItemKind.Method },
        { label: 'info', kind: CompletionItemKind.Method }
      ];
    } else if (/math/i.test(prefixWithoutDot)) {
      // Math properties and methods
      completionItems = [
        { label: 'PI', kind: CompletionItemKind.Constant },
        { label: 'E', kind: CompletionItemKind.Constant },
        { label: 'abs', kind: CompletionItemKind.Method },
        { label: 'max', kind: CompletionItemKind.Method },
        { label: 'min', kind: CompletionItemKind.Method },
        { label: 'random', kind: CompletionItemKind.Method },
        { label: 'round', kind: CompletionItemKind.Method },
        { label: 'floor', kind: CompletionItemKind.Method },
        { label: 'ceil', kind: CompletionItemKind.Method }
      ];
    }
    
    // Check if it's an enum by looking for defined symbols
    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Enum && symbol.name === prefixWithoutDot) {
        // Filter enum members for this enum
        const enumMembers = symbols.filter(s => 
          s.kind === SymbolKind.EnumMember && 
          s.name.startsWith(`${prefixWithoutDot}.`)
        );
        
        completionItems = enumMembers.map(member => {
          const caseName = member.name.substring(prefixWithoutDot.length + 1);
          return {
            label: caseName,
            kind: CompletionItemKind.EnumMember
          };
        });
        break;
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
connection.onDefinition((params): Definition | null => {
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

// Start the language server
connection.listen();