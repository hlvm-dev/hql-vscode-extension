import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionItem,
    CompletionItemKind,
    Position,
    DocumentSymbol,
    SymbolKind,
    DocumentSymbolParams,
    Diagnostic,
    DiagnosticSeverity,
    TextDocumentPositionParams,
    Hover,
    Range
  } from 'vscode-languageserver/node';
  
  import { TextDocument } from 'vscode-languageserver-textdocument';
  import { parse } from './parser';
  import { SExp, isList, isSymbol, SList, SSymbol, SLiteral, isLiteral } from './s-exp/types';
  import { Logger } from './logger';
  
  // Create a connection for the server
  const connection = createConnection(ProposedFeatures.all);
  
  // Create a text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  
  // Initialize a logger
  const logger = new Logger(false);
  
  // In-memory document tracking
  const parsedDocuments = new Map<string, SExp[]>();
  
  connection.onInitialize((params: InitializeParams) => {
    logger.debug('Initializing HQL Language Server');
    
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: ['(', ' ', '.']
        },
        hoverProvider: true,
        documentSymbolProvider: true,
        documentFormattingProvider: true
      }
    } as InitializeResult;
  });
  
  connection.onInitialized(() => {
    logger.debug('HQL Language Server initialized');
  });
  
  // Track document changes and parse them
  documents.onDidChangeContent(change => {
    try {
      // Parse the document
      const document = change.document;
      const text = document.getText();
      const uri = document.uri;
      
      // Parse the document to get S-expressions
      const expressions = parse(text);
      
      // Store the parsed document
      parsedDocuments.set(uri, expressions);
      
      // Validate the document and send diagnostics
      validateDocument(document);
    } catch (error) {
      logger.error(`Error handling document change: ${error}`);
    }
  });
  
  // Validate a document and send diagnostics
  function validateDocument(document: TextDocument): void {
    try {
      const text = document.getText();
      const uri = document.uri;
      const diagnostics: Diagnostic[] = [];
      
      try {
        // Attempt to parse the document
        const expressions = parse(text);
        parsedDocuments.set(uri, expressions);
        
        // Check for common issues
        
        // 1. Unbalanced parentheses
        const openCount = (text.match(/\(/g) || []).length;
        const closeCount = (text.match(/\)/g) || []).length;
        
        if (openCount > closeCount) {
          const missing = openCount - closeCount;
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: document.positionAt(text.length),
              end: document.positionAt(text.length)
            },
            message: `Missing ${missing} closing parenthese${missing === 1 ? '' : 's'}`,
            source: 'hql'
          });
        } else if (closeCount > openCount) {
          const excess = closeCount - openCount;
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: document.positionAt(0),
              end: document.positionAt(1)
            },
            message: `${excess} too many closing parenthese${excess === 1 ? '' : 's'}`,
            source: 'hql'
          });
        }
        
        // 2. Check for other issues by analyzing the parsed expressions
        // (This would be expanded based on HQL-specific rules)
        
      } catch (error) {
        // Parsing error - show as a diagnostic
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(0),
            end: document.positionAt(text.length)
          },
          message: `Parsing error: ${error}`,
          source: 'hql'
        });
      }
      
      // Send the diagnostics
      connection.sendDiagnostics({ uri, diagnostics });
    } catch (error) {
      logger.error(`Error validating document: ${error}`);
    }
  }
  
  // Provide autocompletion suggestions
  connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return [];
      
      const text = document.getText();
      const offset = document.offsetAt(params.position);
      
      // Basic completion items (would be expanded based on HQL syntax)
      const completionItems: CompletionItem[] = [];
      
      // Add standard functions/forms
      const standardItems = [
        { label: 'def', kind: CompletionItemKind.Keyword },
        { label: 'fn', kind: CompletionItemKind.Keyword },
        { label: 'fx', kind: CompletionItemKind.Keyword },
        { label: 'let', kind: CompletionItemKind.Keyword },
        { label: 'var', kind: CompletionItemKind.Keyword },
        { label: 'if', kind: CompletionItemKind.Keyword },
        { label: 'cond', kind: CompletionItemKind.Keyword },
        { label: 'loop', kind: CompletionItemKind.Keyword },
        { label: 'recur', kind: CompletionItemKind.Keyword },
        { label: 'enum', kind: CompletionItemKind.Keyword },
        { label: 'import', kind: CompletionItemKind.Keyword },
        { label: 'export', kind: CompletionItemKind.Keyword },
        { label: 'class', kind: CompletionItemKind.Keyword },
        { label: 'js-call', kind: CompletionItemKind.Function },
        { label: 'js-get', kind: CompletionItemKind.Function },
        { label: 'js-set', kind: CompletionItemKind.Function },
      ];
      
      completionItems.push(...standardItems);
      
      // Extract symbols from the document and add them as completion items
      const expressions = parsedDocuments.get(document.uri) || [];
      const symbols = extractSymbols(expressions);
      
      for (const symbol of symbols) {
        completionItems.push({
          label: symbol.name,
          kind: symbol.kind,
          detail: symbol.detail,
          documentation: symbol.documentation
        });
      }
      
      return completionItems;
    } catch (error) {
      logger.error(`Error providing completion: ${error}`);
      return [];
    }
  });
  
  // Provide hover information
  connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return null;
      
      const position = params.position;
      const offset = document.offsetAt(position);
      const wordRange = getWordRangeAtPosition(document, position);
      
      if (!wordRange) return null;
      
      const word = document.getText(wordRange);
      
      // Provide hover information for built-in forms
      switch (word) {
        case 'def':
          return {
            contents: {
              kind: 'markdown',
              value: '**def** - Define a variable\n\n```hql\n(def name value)\n```'
            }
          };
        case 'fn':
          return {
            contents: {
              kind: 'markdown',
              value: '**fn** - Define a function\n\n```hql\n(fn name (params...) body...)\n```'
            }
          };
        case 'fx':
          return {
            contents: {
              kind: 'markdown',
              value: '**fx** - Define a typed function\n\n```hql\n(fx name (param: Type...) (-> ReturnType) body...)\n```'
            }
          };
        // Add more built-in form documentation as needed
      }
      
      return null;
    } catch (error) {
      logger.error(`Error providing hover: ${error}`);
      return null;
    }
  });
  
  // Provide document symbols (for outline view)
  connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) return [];
      
      const expressions = parsedDocuments.get(document.uri) || [];
      return getDocumentSymbols(expressions, document);
    } catch (error) {
      logger.error(`Error providing document symbols: ${error}`);
      return [];
    }
  });
  
  // Helper function to get document symbols from expressions
  // Helper function to get document symbols from expressions
function getDocumentSymbols(expressions: SExp[], document: TextDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    
    for (const exp of expressions) {
      // Only process list expressions
      if (isList(exp)) {
        const list = exp as SList;
        const elements = list.elements;
        
        // Check if this is a definition form
        if (elements.length > 0 && isSymbol(elements[0])) {
          const firstSymbol = elements[0] as SSymbol;
          
          // Handle different forms
          switch (firstSymbol.name) {
            case 'def':
            case 'defsync':
              if (elements.length >= 3 && isSymbol(elements[1])) {
                const nameSymbol = elements[1] as SSymbol;
                const symbol = createSymbolForExpression(
                  nameSymbol.name,
                  SymbolKind.Variable,
                  document,
                  exp
                );
                symbols.push(symbol);
              }
              break;
              
            case 'fn':
            case 'fx':
              if (elements.length >= 3 && isSymbol(elements[1])) {
                const nameSymbol = elements[1] as SSymbol;
                const symbol = createSymbolForExpression(
                  nameSymbol.name,
                  SymbolKind.Function,
                  document,
                  exp
                );
                symbols.push(symbol);
              }
              break;
              
            case 'class':
              if (elements.length >= 2 && isSymbol(elements[1])) {
                const nameSymbol = elements[1] as SSymbol;
                const symbol = createSymbolForExpression(
                  nameSymbol.name,
                  SymbolKind.Class,
                  document,
                  exp
                );
                
                // Add class methods as children
                const children: DocumentSymbol[] = [];
                
                // Find method definitions
                for (let i = 2; i < elements.length; i++) {
                  if (isList(elements[i])) {
                    const methodList = elements[i] as SList;
                    if (methodList.elements.length > 0 && isSymbol(methodList.elements[0])) {
                      const methodType = (methodList.elements[0] as SSymbol).name;
                      
                      if (methodType === 'method' && methodList.elements.length >= 2 && isSymbol(methodList.elements[1])) {
                        const methodName = (methodList.elements[1] as SSymbol).name;
                        const methodSymbol = createSymbolForExpression(
                          methodName,
                          SymbolKind.Method,
                          document,
                          methodList
                        );
                        children.push(methodSymbol);
                      }
                    }
                  }
                }
                
                symbol.children = children;
                symbols.push(symbol);
              }
              break;
              
            case 'enum':
              if (elements.length >= 2 && isSymbol(elements[1])) {
                const nameSymbol = elements[1] as SSymbol;
                const symbol = createSymbolForExpression(
                  nameSymbol.name,
                  SymbolKind.Enum,
                  document,
                  exp
                );
                
                // Add enum cases as children
                const children: DocumentSymbol[] = [];
                
                // Find case definitions
                for (let i = 2; i < elements.length; i++) {
                  if (isList(elements[i])) {
                    const caseList = elements[i] as SList;
                    if (caseList.elements.length >= 2 && 
                        isSymbol(caseList.elements[0]) && 
                        (caseList.elements[0] as SSymbol).name === 'case' &&
                        isSymbol(caseList.elements[1])) {
                      const caseName = (caseList.elements[1] as SSymbol).name;
                      const caseSymbol = createSymbolForExpression(
                        caseName,
                        SymbolKind.EnumMember,
                        document,
                        caseList
                      );
                      children.push(caseSymbol);
                    }
                  }
                }
                
                symbol.children = children;
                symbols.push(symbol);
              }
              break;
          }
        }
      }
    }
    
    return symbols;
  }
  
  // Helper function to create a DocumentSymbol from an expression
  function createSymbolForExpression(
    name: string,
    kind: SymbolKind,
    document: TextDocument,
    exp: SExp
  ): DocumentSymbol {
    // In reality, we would need to track source positions more accurately
    // This is a simplified approach
    const text = document.getText();
    const expString = expressionToString(exp);
    
    // Escape special regex characters in the expression string
    const escapedExpString = expString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Search for the expression in the document
    const regex = new RegExp(escapedExpString, 'g');
    const match = regex.exec(text);
    
    let range: Range;
    let selectionRange: Range;
    
    if (match) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      
      range = {
        start: document.positionAt(startOffset),
        end: document.positionAt(endOffset)
      };
      
      // For the selection range, we want to highlight just the name
      // In practice, we'd need more precise tracking
      const nameIndex = match[0].indexOf(name);
      if (nameIndex >= 0) {
        const nameStartOffset = startOffset + nameIndex;
        const nameEndOffset = nameStartOffset + name.length;
        
        selectionRange = {
          start: document.positionAt(nameStartOffset),
          end: document.positionAt(nameEndOffset)
        };
      } else {
        selectionRange = range;
      }
    } else {
      // Fallback
      const position = document.positionAt(0);
      range = { start: position, end: position };
      selectionRange = range;
    }
    
    return {
      name,
      kind,
      range,
      selectionRange,
      children: []
    };
  }
  
  // Helper: Convert an expression to a string (simplified)
  function expressionToString(exp: SExp): string {
    if (isSymbol(exp)) {
      return (exp as SSymbol).name;
    } else if (isList(exp)) {
      const list = exp as SList;
      return `(${list.elements.map(expressionToString).join(' ')})`;
    } else if (isLiteral(exp)) {
      const lit = exp as SLiteral;
      if (typeof lit.value === 'string') {
        return `"${lit.value}"`;
      } else {
        return String(lit.value);
      }
    }
    return '';
  }
  
  // Helper: Extract symbols from expressions
  function extractSymbols(expressions: SExp[]): Array<{
    name: string;
    kind: CompletionItemKind;
    detail?: string;
    documentation?: string;
  }> {
    const symbols: Array<{
      name: string;
      kind: CompletionItemKind;
      detail?: string;
      documentation?: string;
    }> = [];
    
    // Process expressions to extract symbols
    for (const exp of expressions) {
      if (isList(exp)) {
        const list = exp as SList;
        const elements = list.elements;
        
        if (elements.length > 0 && isSymbol(elements[0])) {
          const firstSymbol = elements[0] as SSymbol;
          
          switch (firstSymbol.name) {
            case 'def':
            case 'defsync':
              if (elements.length >= 3 && isSymbol(elements[1])) {
                symbols.push({
                  name: (elements[1] as SSymbol).name,
                  kind: CompletionItemKind.Variable,
                  detail: 'variable'
                });
              }
              break;
              
            case 'fn':
              if (elements.length >= 3 && isSymbol(elements[1])) {
                symbols.push({
                  name: (elements[1] as SSymbol).name,
                  kind: CompletionItemKind.Function,
                  detail: 'function'
                });
              }
              break;
              
            case 'fx':
              if (elements.length >= 4 && isSymbol(elements[1])) {
                symbols.push({
                  name: (elements[1] as SSymbol).name,
                  kind: CompletionItemKind.Function,
                  detail: 'typed function'
                });
              }
              break;
              
            case 'enum':
              if (elements.length >= 2 && isSymbol(elements[1])) {
                symbols.push({
                  name: (elements[1] as SSymbol).name,
                  kind: CompletionItemKind.Enum,
                  detail: 'enum'
                });
                
                // Extract enum cases
                for (let i = 2; i < elements.length; i++) {
                  if (isList(elements[i])) {
                    const caseList = elements[i] as SList;
                    if (caseList.elements.length >= 2 && 
                        isSymbol(caseList.elements[0]) && 
                        (caseList.elements[0] as SSymbol).name === 'case' &&
                        isSymbol(caseList.elements[1])) {
                        
                      const caseName = (caseList.elements[1] as SSymbol).name;
                      symbols.push({
                        name: `.${caseName}`,
                        kind: CompletionItemKind.EnumMember,
                        detail: `enum case of ${(elements[1] as SSymbol).name}`
                      });
                    }
                  }
                }
              }
              break;
          }
        }
      }
    }
    
    return symbols;
  }
  
  // Helper: Get word range at position
  function getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Skip if at the end of the document
    if (offset >= text.length) return null;
    
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    // Move start left
    while (start > 0 && /[a-zA-Z0-9\-_\.]/.test(text[start - 1])) {
      start--;
    }
    
    // Move end right
    while (end < text.length && /[a-zA-Z0-9\-_\.]/.test(text[end])) {
      end++;
    }
    
    // No word found
    if (start === end) return null;
    
    return {
      start: document.positionAt(start),
      end: document.positionAt(end)
    };
  }
  
  // Start listening
  documents.listen(connection);
  connection.listen();