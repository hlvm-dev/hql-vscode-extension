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
  Range,
  MarkupContent,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  Definition,
  Location,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  DocumentFormattingParams,
  TextEdit,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentFormattingRegistrationOptions,
  CompletionRegistrationOptions
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse } from './parser';
import { SExp, isList, isSymbol, isLiteral, SList, SSymbol, SLiteral } from './s-exp/types';
import { Logger } from './logger';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize a logger
const logger = new Logger(true);

// In-memory document tracking
const parsedDocuments = new Map<string, SExp[]>();

// Track keyword completions for HQL
const coreKeywords = [
  { label: 'fn', detail: 'Define a function', documentation: 'Creates a general-purpose function that can have side effects.' },
  { label: 'fx', detail: 'Define a pure function', documentation: 'Creates a pure function with type annotations that cannot have side effects.' },
  { label: 'let', detail: 'Create an immutable binding', documentation: 'Binds a value to an immutable variable.' },
  { label: 'var', detail: 'Create a mutable binding', documentation: 'Binds a value to a mutable variable that can be updated with set!.' },
  { label: 'if', detail: 'Conditional expression', documentation: 'Evaluates a condition and returns one of two expressions.' },
  { label: 'cond', detail: 'Multi-way conditional', documentation: 'Evaluates multiple conditions in sequence.' },
  { label: 'do', detail: 'Execute multiple expressions', documentation: 'Executes multiple expressions and returns the value of the last one.' },
  { label: 'loop', detail: 'Loop construct', documentation: 'Creates a loop with named bindings.' },
  { label: 'recur', detail: 'Tail-recursive loop', documentation: 'Recurs to the nearest enclosing loop with new binding values.' },
  { label: 'import', detail: 'Import a module', documentation: 'Imports a module from a specified path.' },
  { label: 'export', detail: 'Export a value', documentation: 'Exports a value from the current module.' },
  { label: 'enum', detail: 'Define an enumeration', documentation: 'Creates an enumeration type with named cases.' },
  { label: 'class', detail: 'Define a class', documentation: 'Creates a class with fields and methods.' },
  { label: 'for', detail: 'Iterate over a range', documentation: 'Iterates over a range of values.' },
  { label: 'while', detail: 'Conditional loop', documentation: 'Executes a body while a condition is true.' },
  { label: 'repeat', detail: 'Repeat n times', documentation: 'Repeats a body n times.' },
  { label: 'set!', detail: 'Mutate a variable', documentation: 'Updates the value of a mutable variable.' },
  { label: 'defmacro', detail: 'Define a macro', documentation: 'Defines a macro that transforms code at compile time.' },
  { label: 'when', detail: 'Conditional execution', documentation: 'Executes a body if a condition is true.' },
  { label: 'unless', detail: 'Negative conditional', documentation: 'Executes a body if a condition is false.' },
  { label: 'return', detail: 'Return a value', documentation: 'Returns a value from a function.' }
];

// Special symbols for modern HQL
const specialSymbols = [
  { label: '->', detail: 'Function return type', documentation: 'Specifies the return type of a function.' },
  { label: '&', detail: 'Rest parameter', documentation: 'Collects remaining arguments into a sequence.' },
  { label: 'from:', detail: 'For loop start', documentation: 'Specifies the starting value in a for loop.' },
  { label: 'to:', detail: 'For loop end', documentation: 'Specifies the ending value in a for loop.' },
  { label: 'by:', detail: 'For loop step', documentation: 'Specifies the step value in a for loop.' },
  { label: '=', detail: 'Default parameter value', documentation: 'Specifies a default value for a function parameter.' },
  { label: ':', detail: 'Type annotation or named parameter', documentation: 'Specifies a type annotation or a named parameter.' }
];

// Common types in HQL
const commonTypes = [
  { label: 'Int', detail: 'Integer type', documentation: 'Represents integer values.' },
  { label: 'String', detail: 'String type', documentation: 'Represents text values.' },
  { label: 'Bool', detail: 'Boolean type', documentation: 'Represents true/false values.' },
  { label: 'Double', detail: 'Floating-point type', documentation: 'Represents decimal values.' },
  { label: 'Any', detail: 'Any type', documentation: 'Represents any value.' },
  { label: '[Int]', detail: 'Array of integers', documentation: 'Represents an array of integers.' },
  { label: '[String]', detail: 'Array of strings', documentation: 'Represents an array of strings.' },
  { label: '[Bool]', detail: 'Array of booleans', documentation: 'Represents an array of booleans.' },
  { label: '[Double]', detail: 'Array of decimals', documentation: 'Represents an array of floating-point values.' },
  { label: '[Any]', detail: 'Array of any type', documentation: 'Represents an array of any type.' }
];

// JS interop completions
const jsInteropKeywords = [
  { label: 'js-call', detail: 'Call a JavaScript method', documentation: 'Calls a JavaScript method on an object.' },
  { label: 'js-get', detail: 'Get a JavaScript property', documentation: 'Gets a property from a JavaScript object.' },
  { label: 'js-set', detail: 'Set a JavaScript property', documentation: 'Sets a property on a JavaScript object.' }
];

// Common JavaScript globals
const jsGlobals = [
  { label: 'console', detail: 'JavaScript console object', documentation: 'Provides methods for logging to the console.' },
  { label: 'Math', detail: 'JavaScript Math object', documentation: 'Provides mathematical constants and functions.' },
  { label: 'Date', detail: 'JavaScript Date object', documentation: 'Represents dates and times.' },
  { label: 'Array', detail: 'JavaScript Array object', documentation: 'Represents arrays and provides array manipulation methods.' },
  { label: 'Object', detail: 'JavaScript Object', documentation: 'The base object from which all objects inherit.' },
  { label: 'JSON', detail: 'JavaScript JSON object', documentation: 'Provides methods for parsing and stringifying JSON.' },
  { label: 'window', detail: 'JavaScript window object', documentation: 'The global window object in browser environments.' },
  { label: 'document', detail: 'JavaScript document object', documentation: 'Provides access to the DOM in browser environments.' }
];

// Collection of all method documentation
const methodDocs = new Map<string, string>([
  ['console.log', 'Logs a message to the console.'],
  ['console.warn', 'Logs a warning message to the console.'],
  ['console.error', 'Logs an error message to the console.'],
  ['Math.abs', 'Returns the absolute value of a number.'],
  ['Math.sqrt', 'Returns the square root of a number.'],
  ['Math.random', 'Returns a pseudo-random number between 0 and 1.'],
  ['Math.floor', 'Returns the largest integer less than or equal to a number.'],
  ['Math.ceil', 'Returns the smallest integer greater than or equal to a number.'],
  ['Math.round', 'Returns the value of a number rounded to the nearest integer.'],
  ['Array.from', 'Creates a new Array instance from an array-like or iterable object.'],
  ['Array.isArray', 'Checks if a value is an array.'],
  ['JSON.stringify', 'Converts a JavaScript object to a JSON string.'],
  ['JSON.parse', 'Parses a JSON string into a JavaScript object.'],
  ['Date.now', 'Returns the number of milliseconds elapsed since January 1, 1970.']
]);

connection.onInitialize((params: InitializeParams) => {
  logger.debug('Initializing HQL Language Server');
  
  const capabilities = params.capabilities;
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['(', ' ', '.', ':']
      },
      hoverProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ['(', ',', ' ']
      },
      definitionProvider: true,
      documentSymbolProvider: true,
      documentHighlightProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.RefactorExtract]
      },
      documentFormattingProvider: true
    } as InitializeResult
  };
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
      
      // 2. Check for unmatched brackets
      const openBrackets = (text.match(/\[/g) || []).length;
      const closeBrackets = (text.match(/\]/g) || []).length;
      
      if (openBrackets > closeBrackets) {
        const missing = openBrackets - closeBrackets;
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(text.length),
            end: document.positionAt(text.length)
          },
          message: `Missing ${missing} closing bracket${missing === 1 ? '' : 's'} '['`,
          source: 'hql'
        });
      } else if (closeBrackets > openBrackets) {
        const excess = closeBrackets - openBrackets;
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(0),
            end: document.positionAt(1)
          },
          message: `${excess} too many closing bracket${excess === 1 ? '' : 's'} ']'`,
          source: 'hql'
        });
      }
      
      // 3. Check for unmatched braces
      const openBraces = (text.match(/\{/g) || []).length;
      const closeBraces = (text.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        const missing = openBraces - closeBraces;
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(text.length),
            end: document.positionAt(text.length)
          },
          message: `Missing ${missing} closing brace${missing === 1 ? '' : 's'} '}'`,
          source: 'hql'
        });
      } else if (closeBraces > openBraces) {
        const excess = closeBraces - openBraces;
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: document.positionAt(0),
            end: document.positionAt(1)
          },
          message: `${excess} too many closing brace${excess === 1 ? '' : 's'} '}'`,
          source: 'hql'
        });
      }
      
      // 4. Check for fx functions missing type annotations
      validateFxFunctions(expressions, document, diagnostics);
      
      // 5. Check for fn functions with incomplete or inconsistent type annotations
      validateFnFunctions(expressions, document, diagnostics);
      
      // 6. Validate enum declarations
      validateEnumDeclarations(expressions, document, diagnostics);
      
      // 7. Validate import statements
      validateImports(expressions, document, diagnostics);
      
      // Additional validations can be added here
      
    } catch (error: any) {
      // Parsing error - show as a diagnostic
      const errorMessage = error.message || String(error);
      const errorPosition = error.position || { line: 1, column: 1, offset: 0 };
      
      // Try to extract line and column information from the error message
      let line = errorPosition.line;
      let column = errorPosition.column;
      
      const lineMatch = errorMessage.match(/line (\d+)/i);
      const columnMatch = errorMessage.match(/column (\d+)/i);
      
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }
      
      if (columnMatch) {
        column = parseInt(columnMatch[1], 10);
      }
      
      // Create a range for the error
      const range = {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column }
      };
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: `Parse error: ${errorMessage}`,
        source: 'hql'
      });
    }
    
    // Send the diagnostics
    connection.sendDiagnostics({ uri, diagnostics });
  } catch (error) {
    logger.error(`Error validating document: ${error}`);
  }
}

// Validate fx function definitions
function validateFxFunctions(expressions: SExp[], document: TextDocument, diagnostics: Diagnostic[]): void {
  // Helper to check if an expression is an fx definition
  function isFxDefinition(exp: SExp): boolean {
    return isList(exp) && 
           exp.elements.length >= 3 && 
           isSymbol(exp.elements[0]) && 
           (exp.elements[0] as SSymbol).name === 'fx';
  }
  
  // Find all fx definitions and validate them
  for (const exp of expressions) {
    if (!isFxDefinition(exp)) continue;
    
    const fxList = exp as SList;
    const elements = fxList.elements;
    
    // Check if we have at least a name, parameters, return type, and body
    if (elements.length < 4) {
      // Find the position of this fx definition
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fx function definition is incomplete',
        source: 'hql'
      });
      continue;
    }
    
    // Ensure the second element is a symbol (function name)
    if (!isSymbol(elements[1])) {
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fx function name must be a symbol',
        source: 'hql'
      });
    }
    
    // Ensure the third element is a list (parameters)
    if (!isList(elements[2])) {
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fx function parameters must be a list',
        source: 'hql'
      });
    }
    
    // Ensure the fourth element specifies a return type
    const returnsElement = elements[3];
    if (!isList(returnsElement) || 
        returnsElement.elements.length !== 2 || 
        !isSymbol(returnsElement.elements[0]) || 
        (returnsElement.elements[0] as SSymbol).name !== '->') {
      
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fx function must specify a return type with (-> Type)',
        source: 'hql'
      });
    }
  }
}

// Validate fn function definitions
function validateFnFunctions(expressions: SExp[], document: TextDocument, diagnostics: Diagnostic[]): void {
  // Helper to check if an expression is an fn definition
  function isFnDefinition(exp: SExp): boolean {
    return isList(exp) && 
           exp.elements.length >= 3 && 
           isSymbol(exp.elements[0]) && 
           (exp.elements[0] as SSymbol).name === 'fn';
  }
  
  // Find all fn definitions and validate them
  for (const exp of expressions) {
    if (!isFnDefinition(exp)) continue;
    
    const fnList = exp as SList;
    const elements = fnList.elements;
    
    // Check if we have at least a name, parameters, and body
    if (elements.length < 3) {
      // Find the position of this fn definition
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fn function definition is incomplete',
        source: 'hql'
      });
      continue;
    }
    
    // Ensure the second element is a symbol (function name)
    if (!isSymbol(elements[1])) {
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fn function name must be a symbol',
        source: 'hql'
      });
    }
    
    // Ensure the third element is a list (parameters)
    if (!isList(elements[2])) {
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'fn function parameters must be a list',
        source: 'hql'
      });
    }
    
    // Check if the function has a return type specification
    if (elements.length >= 4 && isList(elements[3])) {
      const returnsElement = elements[3];
      
      // If it looks like a return type specification, validate it
      if (returnsElement.elements.length === 2 && 
          isSymbol(returnsElement.elements[0]) && 
          (returnsElement.elements[0] as SSymbol).name === '->') {
        
        // Now we know this is a typed fn function, check if parameters have types
        if (isList(elements[2])) {
          const params = (elements[2] as SList).elements;
          
          // Check if parameters have type annotations
          let hasTypeAnnotation = false;
          let missingTypeAnnotation = false;
          
          for (const param of params) {
            if (isSymbol(param)) {
              const paramName = (param as SSymbol).name;
              
              // Check if the parameter has a type annotation (contains a ':')
              if (paramName.includes(':')) {
                hasTypeAnnotation = true;
              } else {
                missingTypeAnnotation = true;
              }
            }
          }
          
          // If some parameters have type annotations but others don't, that's an error
          if (hasTypeAnnotation && missingTypeAnnotation) {
            const range = findExpressionRange(document, elements[2]);
            
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range,
              message: 'In typed fn functions, all parameters must have type annotations',
              source: 'hql'
            });
          }
        }
      }
    }
  }
}

// Validate enum declarations
function validateEnumDeclarations(expressions: SExp[], document: TextDocument, diagnostics: Diagnostic[]): void {
  // Helper to check if an expression is an enum declaration
  function isEnumDeclaration(exp: SExp): boolean {
    return isList(exp) && 
           exp.elements.length >= 2 && 
           isSymbol(exp.elements[0]) && 
           (exp.elements[0] as SSymbol).name === 'enum';
  }
  
  // Find all enum declarations and validate them
  for (const exp of expressions) {
    if (!isEnumDeclaration(exp)) continue;
    
    const enumList = exp as SList;
    const elements = enumList.elements;
    
    // Check if we have at least a name and one case
    if (elements.length < 3) {
      // Find the position of this enum declaration
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'enum declaration must have a name and at least one case',
        source: 'hql'
      });
      continue;
    }
    
    // Ensure the second element is a symbol (enum name)
    if (!isSymbol(elements[1])) {
      const range = findExpressionRange(document, exp);
      
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: 'enum name must be a symbol',
        source: 'hql'
      });
    }
    
    // Check all case declarations
    for (let i = 2; i < elements.length; i++) {
      const caseExp = elements[i];
      
      if (!isList(caseExp)) {
        const range = findExpressionRange(document, caseExp);
        
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range,
          message: 'enum case must be a list',
          source: 'hql'
        });
        continue;
      }
      
      const caseList = caseExp as SList;
      const caseElements = caseList.elements;
      
      // Check if the case has the correct format
      if (caseElements.length < 2 || 
          !isSymbol(caseElements[0]) || 
          (caseElements[0] as SSymbol).name !== 'case' || 
          !isSymbol(caseElements[1])) {
        
        const range = findExpressionRange(document, caseExp);
        
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range,
          message: 'enum case must have format (case name)',
          source: 'hql'
        });
      }
    }
  }
}

// Validate import statements
function validateImports(expressions: SExp[], document: TextDocument, diagnostics: Diagnostic[]): void {
  // Helper to check if an expression is an import statement
  function isImportStatement(exp: SExp): boolean {
    return isList(exp) && 
           exp.elements.length >= 3 && 
           isSymbol(exp.elements[0]) && 
           (exp.elements[0] as SSymbol).name === 'import';
  }
  
  // Find all import statements and validate them
  for (const exp of expressions) {
    if (!isImportStatement(exp)) continue;
    
    const importList = exp as SList;
    const elements = importList.elements;
    
    // Check if it's a vector-based import
    if (elements.length >= 4 && 
        isList(elements[1]) && 
        isSymbol(elements[2]) && 
        (elements[2] as SSymbol).name === 'from' && 
        isLiteral(elements[3])) {
      // Vector-based import looks good
      continue;
    }
    
    // Check if it's a namespace import
    if (elements.length === 4 && 
        isSymbol(elements[1]) && 
        isSymbol(elements[2]) && 
        (elements[2] as SSymbol).name === 'from' && 
        isLiteral(elements[3])) {
      // Namespace import looks good
      continue;
    }
    
    // If we get here, the import statement is invalid
    const range = findExpressionRange(document, exp);
    
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range,
      message: 'Import must use one of these formats: (import [symbols] from "path") or (import module from "path")',
      source: 'hql'
    });
  }
}

// Find the range of an expression in the document
function findExpressionRange(document: TextDocument, exp: SExp): Range {
  const text = document.getText();
  const expString = expressionToString(exp);
  
  // For lists, we need to be more careful to find the correct range
  if (isList(exp)) {
    // Try to find the opening parenthesis
    const startingParens = findParenthesisPositions(text, '(');
    const endingParens = findParenthesisPositions(text, ')');
    
    // Find matching pairs
    for (const start of startingParens) {
      let openCount = 1;
      for (const end of endingParens) {
        if (end > start) {
          // Count parentheses between start and end to check if they match
          for (let i = start + 1; i < end; i++) {
            if (text[i] === '(') openCount++;
            else if (text[i] === ')') openCount--;
          }
          
          // If we found a matching pair
          if (openCount === 0) {
            const contents = text.substring(start, end + 1);
            // Parse this expression to see if it matches our target
            try {
              const parsedExp = parse(contents)[0];
              if (JSON.stringify(parsedExp) === JSON.stringify(exp)) {
                return {
                  start: document.positionAt(start),
                  end: document.positionAt(end + 1)
                };
              }
            } catch (e) {
              // Ignore parsing errors and continue searching
            }
            break;
          }
        }
      }
    }
  }
  
  // Fallback: Try to find the expression as a string
  const escapedExpString = expString.replace(/[.*+?^${}()|[\]\\]/g, '\\// Find the range of an expression in the document
function findExpressionRange(document: TextDocument, exp: SExp): Range {
  const text = document.getText();
  const expString = expressionToString(exp);
  
  ');
  const regex = new RegExp(escapedExpString, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    // Create a range for this match
    const range = {
      start: document.positionAt(match.index),
      end: document.positionAt(match.index + match[0].length)
    };
    
    return range;
  }
  
  // Final fallback: return a minimal range at the beginning of the document
  return {
    start: document.positionAt(0),
    end: document.positionAt(1)
  };
}

// Find all positions of a specific character in the text
function findParenthesisPositions(text: string, char: string): number[] {
  const positions: number[] = [];
  let pos = -1;
  
  while ((pos = text.indexOf(char, pos + 1)) !== -1) {
    positions.push(pos);
  }
  
  return positions;
}

// Convert an S-expression to a string representation
function expressionToString(exp: SExp): string {
  if (isSymbol(exp)) {
    return (exp as SSymbol).name;
  } else if (isList(exp)) {
    const list = exp as SList;
    const elements = list.elements.map(expressionToString);
    return `(${elements.join(' ')})`;
  } else if (isLiteral(exp)) {
    const lit = exp as SLiteral;
    if (typeof lit.value === 'string') {
      return `"${lit.value}"`;
    } else if (lit.value === null) {
      return 'nil';
    } else {
      return String(lit.value);
    }
  } else {
    return 'unknown';
  }
}

// Provide autocompletion suggestions
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    const text = document.getText();
    const position = params.position;
    const offset = document.offsetAt(position);
    
    // Extract the current line up to the cursor position
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: position
    });
    
    const completionItems: CompletionItem[] = [];
    
    // If we are at the start of a form, suggest keywords
    if (line.trimRight().endsWith('(')) {
      // Add core keywords
      completionItems.push(...coreKeywords.map(k => ({
        label: k.label,
        kind: CompletionItemKind.Keyword,
        detail: k.detail,
        documentation: {
          kind: 'markdown',
          value: k.documentation
        }
      })));
      
      // Add JS interop keywords
      completionItems.push(...jsInteropKeywords.map(k => ({
        label: k.label,
        kind: CompletionItemKind.Function,
        detail: k.detail,
        documentation: {
          kind: 'markdown',
          value: k.documentation
        }
      })));
      
      return completionItems;
    }
    
    // If we are inside a function parameter list, suggest special symbols
    if (/\([a-zA-Z_][\w-]*\s+\([^)]*$/.test(line)) {
      completionItems.push(...specialSymbols.map(s => ({
        label: s.label,
        kind: CompletionItemKind.Operator,
        detail: s.detail,
        documentation: {
          kind: 'markdown',
          value: s.documentation
        }
      })));
    }
    
    // If we are in a type position, suggest types
    if (/:$/.test(line.trimRight())) {
      completionItems.push(...commonTypes.map(t => ({
        label: t.label,
        kind: CompletionItemKind.Class,
        detail: t.detail,
        documentation: {
          kind: 'markdown',
          value: t.documentation
        }
      })));
    }
    
    // If we are after a dot, suggest methods or enum values
    if (/\.([a-zA-Z_][\w-]*)?$/.test(line)) {
      // Get the object before the dot
      const match = line.match(/([a-zA-Z_][\w-]*)\.([a-zA-Z_][\w-]*)?$/);
      if (match) {
        const objName = match[1];
        
        // Check if this might be a JS global
        const jsGlobal = jsGlobals.find(g => g.label === objName);
        if (jsGlobal) {
          // Add common methods for this JS global
          for (const [methodName, doc] of methodDocs.entries()) {
            if (methodName.startsWith(`${objName}.`)) {
              const method = methodName.substring(objName.length + 1);
              completionItems.push({
                label: method,
                kind: CompletionItemKind.Method,
                detail: `${objName}.${method}`,
                documentation: {
                  kind: 'markdown',
                  value: doc
                }
              });
            }
          }
          
          return completionItems;
        }
        
        // Look for enum declarations to get case values
        const expressions = parsedDocuments.get(params.textDocument.uri) || [];
        for (const exp of expressions) {
          if (isList(exp) && 
              exp.elements.length >= 2 && 
              isSymbol(exp.elements[0]) && 
              (exp.elements[0] as SSymbol).name === 'enum' &&
              isSymbol(exp.elements[1]) && 
              (exp.elements[1] as SSymbol).name === objName) {
            
            // This is an enum with the matching name, get the cases
            for (let i = 2; i < exp.elements.length; i++) {
              const caseExp = exp.elements[i];
              if (isList(caseExp) && 
                  caseExp.elements.length >= 2 && 
                  isSymbol(caseExp.elements[0]) && 
                  (caseExp.elements[0] as SSymbol).name === 'case' && 
                  isSymbol(caseExp.elements[1])) {
                
                const caseName = (caseExp.elements[1] as SSymbol).name;
                completionItems.push({
                  label: caseName,
                  kind: CompletionItemKind.EnumMember,
                  detail: `${objName}.${caseName}`,
                  documentation: {
                    kind: 'markdown',
                    value: `Enum case from \`${objName}\``
                  }
                });
              }
            }
            
            return completionItems;
          }
        }
      }
    }
    
    // Add symbols from the current document
    const symbols = extractSymbols(parsedDocuments.get(params.textDocument.uri) || []);
    
    completionItems.push(...symbols.map(s => ({
      label: s.name,
      kind: s.kind as CompletionItemKind,
      detail: s.detail,
      documentation: s.documentation ? {
        kind: 'markdown',
        value: s.documentation
      } : undefined
    })));
    
    // Add JS globals as a fallback
    completionItems.push(...jsGlobals.map(g => ({
      label: g.label,
      kind: CompletionItemKind.Variable,
      detail: g.detail,
      documentation: {
        kind: 'markdown',
        value: g.documentation
      }
    })));
    
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
    
    // Get the word at the current position
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) return null;
    
    const word = document.getText(wordRange);
    
    // Check if this is a core keyword
    const keyword = coreKeywords.find(k => k.label === word);
    if (keyword) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${keyword.label}** - ${keyword.detail}\n\n${keyword.documentation}`
        }
      };
    }
    
    // Check if this is a special symbol
    const symbol = specialSymbols.find(s => s.label === word);
    if (symbol) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${symbol.label}** - ${symbol.detail}\n\n${symbol.documentation}`
        }
      };
    }
    
    // Check if this is a type
    const type = commonTypes.find(t => t.label === word);
    if (type) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${type.label}** - ${type.detail}\n\n${type.documentation}`
        }
      };
    }
    
    // Check if this is a JS interop keyword
    const jsKeyword = jsInteropKeywords.find(k => k.label === word);
    if (jsKeyword) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${jsKeyword.label}** - ${jsKeyword.detail}\n\n${jsKeyword.documentation}`
        }
      };
    }
    
    // Check if this is a JS global
    const jsGlobal = jsGlobals.find(g => g.label === word);
    if (jsGlobal) {
      return {
        contents: {
          kind: 'markdown',
          value: `**${jsGlobal.label}** - ${jsGlobal.detail}\n\n${jsGlobal.documentation}`
        }
      };
    }
    
    // Check if this is a method call
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });
    
    const methodMatch = line.match(/([a-zA-Z_][\w-]*)\.([a-zA-Z_][\w-]*)$/);
    if (methodMatch) {
      const objName = methodMatch[1];
      const methodName = methodMatch[2];
      const fullMethod = `${objName}.${methodName}`;
      
      // Check if we have documentation for this method
      const methodDoc = methodDocs.get(fullMethod);
      if (methodDoc) {
        return {
          contents: {
            kind: 'markdown',
            value: `**${fullMethod}** - ${methodDoc}`
          }
        };
      }
    }
    
    // Check for symbols in the current document
    const symbols = extractSymbols(parsedDocuments.get(params.textDocument.uri) || []);
    const symbolInfo = symbols.find(s => s.name === word);
    
    if (symbolInfo) {
      let documentation = symbolInfo.documentation || '';
      if (symbolInfo.detail) {
        documentation = `${symbolInfo.detail}\n\n${documentation}`;
      }
      
      return {
        contents: {
          kind: 'markdown',
          value: `**${symbolInfo.name}** - ${documentation}`
        }
      };
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
    
    const expressions = parsedDocuments.get(params.textDocument.uri) || [];
    return getDocumentSymbols(expressions, document);
  } catch (error) {
    logger.error(`Error providing document symbols: ${error}`);
    return [];
  }
});

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
          case 'var':
          case 'let':
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
                firstSymbol.name === 'fx' ? SymbolKind.Function : SymbolKind.Function,
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
              
              // Add class fields and methods as children
              const children: DocumentSymbol[] = [];
              
              // Find field definitions
              for (let i = 2; i < elements.length; i++) {
                if (isList(elements[i])) {
                  const fieldList = elements[i] as SList;
                  if (fieldList.elements.length > 0 && isSymbol(fieldList.elements[0])) {
                    const fieldType = (fieldList.elements[0] as SSymbol).name;
                    
                    if ((fieldType === 'var' || fieldType === 'let') && 
                        fieldList.elements.length >= 2 && 
                        isSymbol(fieldList.elements[1])) {
                      
                      const fieldName = (fieldList.elements[1] as SSymbol).name;
                      const fieldSymbol = createSymbolForExpression(
                        fieldName,
                        SymbolKind.Field,
                        document,
                        fieldList
                      );
                      children.push(fieldSymbol);
                    } else if (fieldType === 'constructor' && fieldList.elements.length >= 2) {
                      const constructorSymbol = createSymbolForExpression(
                        'constructor',
                        SymbolKind.Constructor,
                        document,
                        fieldList
                      );
                      children.push(constructorSymbol);
                    } else if ((fieldType === 'fn' || fieldType === 'fx') && 
                                fieldList.elements.length >= 3 && 
                                isSymbol(fieldList.elements[1])) {
                      
                      const methodName = (fieldList.elements[1] as SSymbol).name;
                      const methodSymbol = createSymbolForExpression(
                        methodName,
                        SymbolKind.Method,
                        document,
                        fieldList
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
            
          case 'import':
            if (elements.length >= 3) {
              // Vector-based import
              if (isList(elements[1])) {
                const importList = elements[1] as SList;
                for (const item of importList.elements) {
                  if (isSymbol(item)) {
                    const importName = (item as SSymbol).name;
                    const importSymbol = createSymbolForExpression(
                      importName,
                      SymbolKind.Namespace,
                      document,
                      exp
                    );
                    symbols.push(importSymbol);
                  }
                }
              } 
              // Namespace import
              else if (isSymbol(elements[1])) {
                const nameSymbol = elements[1] as SSymbol;
                const symbol = createSymbolForExpression(
                  nameSymbol.name,
                  SymbolKind.Module,
                  document,
                  exp
                );
                symbols.push(symbol);
              }
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
  const range = findExpressionRange(document, exp);
  
  // For the selection range, we want to highlight just the name
  // In practice, we'd need more precise tracking
  const selectionRange = {
    start: range.start,
    end: {
      line: range.start.line,
      character: range.start.character + name.length
    }
  };
  
  return {
    name,
    kind,
    range,
    selectionRange,
    children: []
  };
}

// Extract symbols from expressions
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
          case 'var':
          case 'let':
            if (elements.length >= 3 && isSymbol(elements[1])) {
              symbols.push({
                name: (elements[1] as SSymbol).name,
                kind: CompletionItemKind.Variable,
                detail: firstSymbol.name === 'var' ? 'mutable variable' : 'immutable variable'
              });
            }
            break;
            
          case 'fn':
            if (elements.length >= 3 && isSymbol(elements[1])) {
              // Check if this function has a return type
              let detail = 'function';
              if (elements.length >= 4 && 
                  isList(elements[3]) && 
                  elements[3].elements.length === 2 && 
                  isSymbol(elements[3].elements[0]) && 
                  (elements[3].elements[0] as SSymbol).name === '->') {
                
                detail = `function returning ${expressionToString(elements[3].elements[1])}`;
              }
              
              symbols.push({
                name: (elements[1] as SSymbol).name,
                kind: CompletionItemKind.Function,
                detail
              });
            }
            break;
            
          case 'fx':
            if (elements.length >= 4 && isSymbol(elements[1])) {
              let detail = 'pure function';
              if (isList(elements[3]) && 
                  elements[3].elements.length === 2 && 
                  isSymbol(elements[3].elements[0]) && 
                  (elements[3].elements[0] as SSymbol).name === '->') {
                
                detail = `pure function returning ${expressionToString(elements[3].elements[1])}`;
              }
              
              symbols.push({
                name: (elements[1] as SSymbol).name,
                kind: CompletionItemKind.Function,
                detail
              });
            }
            break;
            
          case 'enum':
            if (elements.length >= 2 && isSymbol(elements[1])) {
              const enumName = (elements[1] as SSymbol).name;
              symbols.push({
                name: enumName,
                kind: CompletionItemKind.Enum,
                detail: 'enum'
              });
              
              // Add enum cases with dot notation
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
                      detail: `enum case from ${enumName}`
                    });
                    
                    symbols.push({
                      name: `${enumName}.${caseName}`,
                      kind: CompletionItemKind.EnumMember,
                      detail: `enum case from ${enumName}`
                    });
                  }
                }
              }
            }
            break;
            
          case 'class':
            if (elements.length >= 2 && isSymbol(elements[1])) {
              const className = (elements[1] as SSymbol).name;
              symbols.push({
                name: className,
                kind: CompletionItemKind.Class,
                detail: 'class'
              });
              
              // Process class members
              for (let i = 2; i < elements.length; i++) {
                if (isList(elements[i])) {
                  const memberList = elements[i] as SList;
                  if (memberList.elements.length >= 2 && 
                      isSymbol(memberList.elements[0])) {
                    
                    const memberType = (memberList.elements[0] as SSymbol).name;
                    
                    if ((memberType === 'var' || memberType === 'let') && 
                        isSymbol(memberList.elements[1])) {
                      
                      const fieldName = (memberList.elements[1] as SSymbol).name;
                      symbols.push({
                        name: `${className}.${fieldName}`,
                        kind: CompletionItemKind.Field,
                        detail: `${memberType === 'var' ? 'mutable' : 'immutable'} field of ${className}`
                      });
                    } else if ((memberType === 'fn' || memberType === 'fx') && 
                              memberList.elements.length >= 3 && 
                              isSymbol(memberList.elements[1])) {
                      
                      const methodName = (memberList.elements[1] as SSymbol).name;
                      symbols.push({
                        name: `${className}.${methodName}`,
                        kind: CompletionItemKind.Method,
                        detail: `${memberType === 'fx' ? 'pure' : ''} method of ${className}`
                      });
                    }
                  }
                }
              }
            }
            break;
            
          case 'import':
            if (elements.length >= 3) {
              // Vector-based import
              if (isList(elements[1])) {
                const importList = elements[1] as SList;
                for (const item of importList.elements) {
                  if (isSymbol(item)) {
                    const importName = (item as SSymbol).name;
                    symbols.push({
                      name: importName,
                      kind: CompletionItemKind.Module,
                      detail: 'imported symbol'
                    });
                  }
                }
              } 
              // Namespace import
              else if (isSymbol(elements[1])) {
                const importName = (elements[1] as SSymbol).name;
                symbols.push({
                  name: importName,
                  kind: CompletionItemKind.Module,
                  detail: 'imported module'
                });
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

// Provide document highlighting (highlight all occurrences of a symbol)
connection.onDocumentHighlight((params: TextDocumentPositionParams): DocumentHighlight[] | null => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) return null;
    
    const word = document.getText(wordRange);
    const text = document.getText();
    
    const highlights: DocumentHighlight[] = [];
    
    // Find all occurrences of the word
    const wordRegex = new RegExp(`\\b${word}\\b`, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = wordRegex.exec(text)) !== null) {
      const matchStart = document.positionAt(match.index);
      const matchEnd = document.positionAt(match.index + word.length);
      
      highlights.push({
        range: {
          start: matchStart,
          end: matchEnd
        },
        kind: DocumentHighlightKind.Text
      });
    }
    
    return highlights;
  } catch (error) {
    logger.error(`Error providing document highlights: ${error}`);
    return null;
  }
});

// Go to definition
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) return null;
    
    const word = document.getText(wordRange);
    const expressions = parsedDocuments.get(params.textDocument.uri) || [];
    
    // Look for definitions of this word in the document
    for (const exp of expressions) {
      if (isList(exp)) {
        const list = exp as SList;
        const elements = list.elements;
        
        if (elements.length >= 3 && 
            isSymbol(elements[0]) && 
            ['def', 'var', 'fn', 'fx', 'class', 'enum'].includes((elements[0] as SSymbol).name) && 
            isSymbol(elements[1]) && 
            (elements[1] as SSymbol).name === word) {
          
          // We found a definition with the matching name
          const range = findExpressionRange(document, elements[1]);
          
          return {
            uri: params.textDocument.uri,
            range
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Error providing definition: ${error}`);
    return null;
  }
});

// Provide signature help for function calls
connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    
    const position = params.position;
    const offset = document.offsetAt(position);
    const text = document.getText();
    
    // Find the current function call
    let openParenPos = -1;
    let depth = 0;
    
    for (let i = offset - 1; i >= 0; i--) {
      if (text[i] === ')') {
        depth++;
      } else if (text[i] === '(') {
        if (depth === 0) {
          openParenPos = i;
          break;
        }
        depth--;
      }
    }
    
    if (openParenPos === -1) return null;
    
    // Extract the function name
    let nameStart = openParenPos - 1;
    while (nameStart >= 0 && /\s/.test(text[nameStart])) {
      nameStart--;
    }
    
    let nameEnd = nameStart;
    while (nameStart >= 0 && /[a-zA-Z0-9\-_\.]/.test(text[nameStart])) {
      nameStart--;
    }
    nameStart++;
    
    const functionName = text.substring(nameStart, nameEnd + 1);
    if (!functionName) return null;
    
    // Look for the function definition in the document
    const expressions = parsedDocuments.get(params.textDocument.uri) || [];
    
    for (const exp of expressions) {
      if (isList(exp)) {
        const list = exp as SList;
        const elements = list.elements;
        
        if (elements.length >= 3 && 
            isSymbol(elements[0]) && 
            ['fn', 'fx'].includes((elements[0] as SSymbol).name) && 
            isSymbol(elements[1]) && 
            (elements[1] as SSymbol).name === functionName && 
            isList(elements[2])) {
          
          // We found a function definition with the matching name
          const params = (elements[2] as SList).elements;
          
          // Create signature information
          const paramLabels = params.map(p => {
            if (isSymbol(p)) {
              return (p as SSymbol).name;
            }
            return expressionToString(p);
          });
          
          const paramDocs = params.map(p => {
            if (isSymbol(p)) {
              const paramName = (p as SSymbol).name;
              // Check if param has a type annotation
              if (paramName.includes(':')) {
                const [name, type] = paramName.split(':');
                return `${name.trim()}: ${type.trim()}`;
              }
              // Check if param has a default value
              if (paramName.includes('=')) {
                const [name, defaultValue] = paramName.split('=');
                return `${name.trim()} = ${defaultValue.trim()}`;
              }
              return paramName;
            }
            return expressionToString(p);
          });
          
          // Create parameter information
          const parameters = paramDocs.map(p => {
            return ParameterInformation.create(p);
          });
          
          // Build function signature
          let label = `(${(elements[0] as SSymbol).name} ${functionName} (${paramDocs.join(' ')}))`;
          
          // Add return type if available
          if (elements.length >= 4 && 
              isList(elements[3]) && 
              elements[3].elements.length === 2 && 
              isSymbol(elements[3].elements[0]) && 
              (elements[3].elements[0] as SSymbol).name === '->') {
            
            const returnType = expressionToString(elements[3].elements[1]);
            label += ` (-> ${returnType})`;
          }
          
          const signatureInfo = SignatureInformation.create(
            label,
            `${(elements[0] as SSymbol).name === 'fx' ? 'Pure function' : 'Function'} with ${parameters.length} parameter${parameters.length === 1 ? '' : 's'}`
          );
          
          signatureInfo.parameters = parameters;
          
          // Determine which parameter is active
          const commaPositions = [];
          depth = 0;
          for (let i = openParenPos + 1; i < offset; i++) {
            if (text[i] === '(') {
              depth++;
            } else if (text[i] === ')') {
              depth--;
            } else if (text[i] === ',' && depth === 0) {
              commaPositions.push(i);
            }
          }
          
          // The active parameter is the number of commas + 1 
          // (or 0 if there are no characters between the opening paren and cursor)
          const activeParameter = commaPositions.length;
          
          return {
            signatures: [signatureInfo],
            activeSignature: 0,
            activeParameter: Math.min(activeParameter, parameters.length - 1)
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    logger.error(`Error providing signature help: ${error}`);
    return null;
  }
});

// Document formatting
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    const text = document.getText();
    
    // Simple HQL formatting - maintain indentation based on parentheses
    const lines = text.split('\n');
    const formattedLines: string[] = [];
    let indent = 0;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Skip empty lines and comments
      if (line === '' || line.startsWith(';')) {
        formattedLines.push(line);
        continue;
      }
      
      // Handle parentheses
      const openCount = (line.match(/\(/g) || []).length;
      const closeCount = (line.match(/\)/g) || []).length;
      
      // Calculate the right indent for this line
      const currIndent = ' '.repeat(indent * params.options.tabSize);
      formattedLines.push(currIndent + line);
      
      // Adjust indent for the next line
      indent += openCount;
      indent -= closeCount;
      
      // Keep indent non-negative
      indent = Math.max(0, indent);
    }
    
    // Create a TextEdit for the whole document
    const formatted = formattedLines.join('\n');
    return [TextEdit.replace(
      {
        start: { line: 0, character: 0 },
        end: { line: document.lineCount, character: 0 }
      },
      formatted
    )];
  } catch (error) {
    logger.error(`Error formatting document: ${error}`);
    return [];
  }
});

// Code actions
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    const codeActions: CodeAction[] = [];
    
    // Handle unmatched parentheses
    const unmatchedParenDiagnostic = params.context.diagnostics.find(d => 
      d.message.includes('parenthese') || d.message.includes('bracket') || d.message.includes('brace')
    );
    
    if (unmatchedParenDiagnostic) {
      const fixAction = CodeAction.create(
        'Fix unmatched delimiters',
        {
          changes: {
            [params.textDocument.uri]: []
          }
        },
        CodeActionKind.QuickFix
      );
      
      // Create a command action that will be handled by the client
      fixAction.command = {
        title: 'Fix unmatched delimiters',
        command: 'hql.fixParentheses',
        arguments: [params.textDocument.uri, params.range]
      };
      
      codeActions.push(fixAction);
    }
    
    // Handle extracting expressions
    if (params.range.start.line === params.range.end.line) {
      const line = document.getText(params.range);
      
      // Only offer extract variable for non-empty, non-delimiter-only selections
      if (line.trim() && !/^[\(\)\[\]\{\}]+$/.test(line.trim())) {
        const extractAction = CodeAction.create(
          'Extract to variable',
          {
            changes: {
              [params.textDocument.uri]: []
            }
          },
          CodeActionKind.RefactorExtract
        );
        
        extractAction.command = {
          title: 'Extract to variable',
          command: 'hql.extractVariable',
          arguments: [params.textDocument.uri, params.range, line]
        };
        
        codeActions.push(extractAction);
      }
    }
    
    return codeActions;
  } catch (error) {
    logger.error(`Error providing code actions: ${error}`);
    return [];
  }
});

// Start listening for connections
documents.listen(connection);
connection.listen();//