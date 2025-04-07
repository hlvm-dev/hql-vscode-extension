import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse, ParseError } from '../parser';
import { SList, SExp, isList, isSymbol, SSymbol } from '../s-exp/types';
import { Diagnostic, Position, DiagnosticSeverity } from 'vscode-languageserver/node';

/**
 * Find symbol usages in a list expression for tests
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

// Create a test-friendly validation function (doesn't depend on the connection)
async function validateTextDocumentForTest(document: TextDocument): Promise<Diagnostic[]> {
  try {
    const text = document.getText();
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
        // Add diagnostic for parse error
        if (error instanceof ParseError && error.position) {
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
      
      // Find symbol usages
      for (const expr of expressions) {
        if (isList(expr)) {
          findSymbolUsagesInList(expr, usedSymbols);
        }
      }
      
      // Check for undefined symbols
      for (const symbolName of usedSymbols) {
        // Skip built-in symbols
        if (isBuiltInSymbol(symbolName)) {
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
      if (error instanceof ParseError && error.position) {
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
    
    return diagnostics;
  } catch (error) {
    console.error(`Error validating document: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Find a symbol usage position in the document text for tests
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

// Test function to simulate document validation
async function testDocumentValidation(code: string, documentUri: string = 'file:///test.hql') {
  console.log(`\nTesting document validation for:\n${code}\n`);
  
  // Create a text document
  const document = TextDocument.create(documentUri, 'hql', 1, code);
  
  // Validate the document
  const diagnostics = await validateTextDocumentForTest(document);
  
  // Log the diagnostics
  console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
}

// Run tests
async function runTests() {
  console.log('Testing LSP server handling of incomplete expressions...\n');
  
  // Test 1: Complete expression
  await testDocumentValidation('(defn say-hello [name] (str "Hello, " name))');
  
  // Test 2: Unclosed list
  await testDocumentValidation('(defn say-hello [name] (str "Hello, " name');
  
  // Test 3: Incomplete function parameter list
  await testDocumentValidation('(defn say-hello [name');
  
  // Test 4: Incomplete vector
  await testDocumentValidation('[1 2 3');
  
  // Test 5: Incomplete map
  await testDocumentValidation('{:a 1 :b');
  
  // Test 6: Complex incomplete expression
  await testDocumentValidation('(let [x 10 y (+ x 5)] (if (> x 5) (println "x is greater than 5"');
  
  // Test 7: Function call example
  await testDocumentValidation('(fn add [x y] (+ x y))\n\n(add 1 2)');
  
  // Test 8: Stray closing paren causing errors
  await testDocumentValidation('(fn add [x y]\n  (+ x y))\n\nx)');
  
  console.log('\nLSP server tests completed!');
}

// Run the tests
runTests().catch(console.error); 