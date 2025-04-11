import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  InitializeParams,
  InitializeResult,
  Diagnostic
} from 'vscode-languageserver/node';

import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import { SymbolManager } from '../server/symbolManager';
import { DiagnosticsProvider } from '../server/diagnosticProvider';

/**
 * Test harness for HQL diagnostics
 */
class DiagnosticsTestHarness {
  private symbolManager: SymbolManager;
  private diagnosticsProvider: DiagnosticsProvider;
  private connection: any;
  
  constructor() {
    this.symbolManager = new SymbolManager();
    this.diagnosticsProvider = new DiagnosticsProvider(this.symbolManager);
    
    // Create a mock connection for capturing diagnostics
    this.connection = {
      diagnostics: [] as Diagnostic[],
      sendDiagnostics: (params: { uri: string; diagnostics: Diagnostic[] }) => {
        this.connection.diagnostics = params.diagnostics;
      },
      console: {
        log: (message: string) => console.log(message),
        error: (message: string) => console.error(message)
      }
    };
  }
  
  /**
   * Analyze a code snippet and return diagnostics
   */
  public async analyze(code: string, thorough: boolean = true): Promise<Diagnostic[]> {
    // Create a temporary document
    const document = TextDocument.create('file:///test.hql', 'hql', 1, code);
    
    // Update symbols and validate
    await this.symbolManager.updateDocumentSymbols(document);
    await this.diagnosticsProvider.validateTextDocument(document, this.connection, thorough);
    
    // Return collected diagnostics
    return this.connection.diagnostics;
  }
  
  /**
   * Print diagnostics in a readable format
   */
  public printDiagnostics(diagnostics: Diagnostic[]): void {
    if (diagnostics.length === 0) {
      console.log('No diagnostics found');
      return;
    }
    
    console.log(`Found ${diagnostics.length} diagnostic issues:`);
    diagnostics.forEach((diagnostic, index) => {
      const severity = diagnostic.severity !== undefined ? 
        ['Error', 'Warning', 'Information', 'Hint'][diagnostic.severity - 1] : 
        'Unknown';
      console.log(`${index + 1}. [${severity}] Line ${diagnostic.range.start.line + 1}, Col ${diagnostic.range.start.character + 1}: ${diagnostic.message}`);
    });
  }
  
  /**
   * Run a test case
   */
  public async testCase(name: string, code: string): Promise<void> {
    console.log(`\n=== Test case: ${name} ===`);
    console.log('Code:');
    code.split('\n').forEach((line, index) => {
      console.log(`${index + 1}: ${line}`);
    });
    
    console.log('\nDiagnostics:');
    const diagnostics = await this.analyze(code);
    this.printDiagnostics(diagnostics);
  }
}

/**
 * Run the diagnostics test
 */
async function runDiagnosticsTest() {
  const tester = new DiagnosticsTestHarness();
  
  // Test 1: Reserved keyword usage
  await tester.testCase('Reserved keyword usage', `
(fn vector [x y]
  (+ x y))

(let case 5)
  `);
  
  // Test 2: Function call argument count mismatch
  await tester.testCase('Function argument count', `
(fn add [x y]
  (+ x y))
  
(add 1)
(add 1 2 3)
  `);
  
  // Test 3: Class with missing members
  await tester.testCase('Class validation', `
(class Person
  (constructor [name age])
  (method getName [] name)
  (method setName [new-name]
    (var name new-name)))
  `);
  
  // Test 4: Unbalanced delimiters
  await tester.testCase('Unbalanced delimiters', `
(let x (+ 1 2)
(let y 3)
  `);
  
  // Test 5: Undefined symbols
  await tester.testCase('Undefined symbols', `
(fn add [x y]
  (+ x y z))
  `);
  
  // Test 6: Using vector as a value
  await tester.testCase('Vector keyword usage', `
(let items (vector 1 2 3))
  `);
}

// Run the tests
runDiagnosticsTest().catch(error => {
  console.error('Test failed:', error);
}); 