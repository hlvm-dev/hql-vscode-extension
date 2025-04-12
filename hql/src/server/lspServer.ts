import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionParams,
    CompletionItem,
    DocumentSymbolParams,
    SymbolInformation,
    CompletionItemTag,
    MarkupKind,
    Position,
    Hover,
    Range,
    Location,
    DidChangeConfigurationNotification,
    TextDocumentChangeEvent,
    TextDocumentPositionParams,
    TextEdit
  } from 'vscode-languageserver/node';
  
import {
  TextDocument
} from 'vscode-languageserver-textdocument';
  
  // Import our new modular components
  import { CompletionProvider, setupCompletionItem } from './completionProvider';
  import { SymbolManager } from './symbolManager';
  import { DiagnosticsProvider } from './diagnosticProvider';
  import { HoverProvider } from './hoverManager';
  import { DefinitionProvider } from './definitionManager';
  import { HqlFormatter } from './formatter/hqlFormatter';
  
  // Create a connection for the server
  const connection = createConnection(ProposedFeatures.all);
  
  // Create a simple text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  
  // Initialize our providers
  const symbolManager = new SymbolManager();
  const completionProvider = new CompletionProvider(symbolManager);
  const diagnosticsProvider = new DiagnosticsProvider(symbolManager);
  const hoverProvider = new HoverProvider(symbolManager);
  const definitionProvider = new DefinitionProvider(symbolManager);
  const formatter = new HqlFormatter();
  
  // Server capabilities initialization
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
        // Add document formatting
        documentFormattingProvider: true,
        // No semantic tokens for now
        semanticTokensProvider: undefined
      }
    };
  
    // Set workspace folders for path resolution
    completionProvider.setWorkspaceFolders(params.workspaceFolders);
  
    return result;
  });
  
  connection.onInitialized(() => {
    console.log('HQL Language Server initialized');
    
    // Register for configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  });
  
  /**
   * Handle document open event
   */
  documents.onDidOpen(async (event: TextDocumentChangeEvent<TextDocument>) => {
    const document = event.document;
    
    // Add document to the symbol manager
    symbolManager.addDocument(document);
    
    // Update document symbols
    await symbolManager.updateDocumentSymbols(document);
    
    // Validate the document and send diagnostics
    await diagnosticsProvider.validateTextDocument(document, connection);
  });
  
  /**
   * Handle document change event
   */
  documents.onDidChangeContent(async (event: TextDocumentChangeEvent<TextDocument>) => {
    const document = event.document;
    
    // Update document in symbol manager
    symbolManager.addDocument(document);
    
    // Update document symbols
    await symbolManager.updateDocumentSymbols(document);
    
    // Validate the document and send diagnostics
    await diagnosticsProvider.validateTextDocument(document, connection);
  });
  
  /**
   * Handle document save event
   */
  documents.onDidSave(async (event: TextDocumentChangeEvent<TextDocument>) => {
    const document = event.document;
    
    // Perform a more thorough validation on save
    await diagnosticsProvider.validateTextDocument(document, connection, true);
  });
  
  // Register document symbol provider
  connection.onDocumentSymbol(async (params: DocumentSymbolParams): Promise<SymbolInformation[]> => {
    return symbolManager.getDocumentSymbols(params.textDocument.uri);
  });
  
  // Register completion provider
  connection.onCompletion(async (params: CompletionParams): Promise<CompletionItem[]> => {
    return completionProvider.provideCompletionItems(params);
  });
  
  // Register completion resolve provider
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
    
    // Prepare item for display
    return setupCompletionItem(item);
  });
  
  // Register hover provider
  connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
    return hoverProvider.provideHover(params);
  });
  
  // Register definition provider
  connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Location | null> => {
    return definitionProvider.provideDefinition(params);
  });
  
  // Register document formatting handler
  connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    return formatter.formatDocument(document);
  });
  
  // Register the balanceParentheses command
  connection.onRequest('hql/balanceParentheses', (params: { uri: string }) => {
    const document = documents.get(params.uri);
    if (!document) {
      console.log('Document not found for URI:', params.uri);
      return null;
    }
    
    console.log('Balancing parentheses for document:', params.uri);
    const edits = formatter.balanceParentheses(document);
    console.log(`Found ${edits.length} edits needed for document`);
    
    return edits;
  });
  
  // Handle document closing
  documents.onDidClose(e => {
    // Clean up resources
    symbolManager.removeDocument(e.document.uri);
    
    // Clear diagnostics when document is closed
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  });
  
  // Listen to text document events
  documents.listen(connection);
  
  // Listen to connection
  connection.listen();