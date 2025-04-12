import {
  TextDocument
} from 'vscode-languageserver-textdocument';

import {
  Position,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  InsertTextFormat,
  Range,
  MarkupKind
} from 'vscode-languageserver';
import { getStdLibCompletions } from "./autocompletion/stdlib"
import { getDocumentSymbolCompletions } from "./autocompletion/document"
import { 
  getClassStructFieldCompletions, 
  getClassInstantiationCompletions,
  getClassNameCompletions
} from "./autocompletion/class"
import {
  getClassDeclarationCompletions,
  getClassInstantiationSnippets,
  getClassMethodCompletions,
  getMethodCallCompletions
} from "./autocompletion/class-extended"
import { handleImportCompletions, handleExportCompletions, getRelativePathCompletionItems } from "./autocompletion/import-export"
import { 
  getFunctionSpecificCompletions, 
  getParameterCompletions, 
  getParameterValueCompletions 
} from "./autocompletion/fn"
import { 
  handleDotChainCompletions, 
  handleSpecialSyntaxCompletions, 
  getDataStructureLiteralCompletions, 
  getCondPatternCompletions, 
  getLoopBindingCompletions,
  getTypeCompletions,
  getTemplateCompletions,
  handleMethodChainCompletions,
  getCompletionKindForSymbol
} from "./autocompletion/core"
import {
  getBlockCompletions,
  getBranchingCompletions
} from "./autocompletion/control"
import {
  getMacroCompletions,
  getMacroUsageCompletions
} from "./autocompletion/macro"
import {
  getRepeatCompletions,
  getForLoopCompletions,
  getWhileLoopCompletions,
  getCondCompletions,
  getWhenUnlessCompletions,
  getLoopRecurCompletions,
  getLetBindingControlCompletions,
  getClassCompletions,
  getCoreMacroCompletions
} from "./autocompletion/controlflow"
import { 
  getAllEnumCaseCompletions, 
  processEnumForCompletion, 
  getEnumValueCompletions, 
  getExpectedTypeFromContext, 
  handleEnumDotCompletions,
  getParameterEnumValueCompletions,
} from "./autocompletion/enum"
import * as path from 'path';
import * as fs from 'fs';
import { parse, SExp } from '../parser';
import { isList, isSymbol, isString } from '../s-exp/types';
import { SymbolManager, ExtendedSymbolInformation } from './symbolManager';
// Import centralized regex patterns
import * as RegexPatterns from './utils/regex-patterns';

/**
 * CompletionProvider handles intelligent code completion for HQL
 * @see {import('vscode-languageserver').CompletionItem}
 * @see {import('vscode-languageserver').CompletionItemKind}
 */
export class CompletionProvider {
  private symbolManager: SymbolManager;
  private workspaceFolders: { uri: string }[] | null = null;
  private dynamicValueCache: Map<string, CompletionItem[]> = new Map();
  
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
      
      // PARAMETERIZED FUNCTION CALL WITH DOT NOTATION - DYNAMIC VERSION
      // Check for any function call with parameter type and dot notation (like install os: .)
      const functionParamDotMatch = linePrefix.match(RegexPatterns.FUNCTION_PARAM_DOT_REGEX);
      if (functionParamDotMatch) {
        const [_, funcName, paramName] = functionParamDotMatch;
        console.log(`[HQL Completion] Function parameter dot notation: ${funcName} ${paramName}:`);
        
        // Force re-parse to ensure we have the latest function definitions
        const symbols = this.symbolManager.getDocumentSymbols(document.uri);
        // Explicitly search for current function definition in the current document text
        const text = document.getText();
        const fnMatch = text.match(new RegExp(`\\(fn\\s+${funcName}\\s+\\(([^)]+)\\)`, 'i'));
        
        if (fnMatch) {
          console.log(`[HQL Completion] Found function definition: ${fnMatch[0]}`);
          const paramText = fnMatch[1];
          console.log(`[HQL Completion] Parameter text: ${paramText}`);
          
          // Try to extract parameter type directly from the source code
          const paramTypeMatch = paramText.match(new RegExp(`${paramName}:\\s*([A-Za-z0-9_]+)`, 'i'));
          if (paramTypeMatch) {
            const extractedType = paramTypeMatch[1];
            console.log(`[HQL Completion] Direct parsed parameter type: ${extractedType}`);
            
            // Verify this is an enum type
            if (this.symbolManager.isEnumType(extractedType)) {
              console.log(`[HQL Completion] ${extractedType} is confirmed as enum type`);
              const enumValues = getEnumValueCompletions(document, extractedType, true, this.symbolManager, this.dynamicValueCache);
              if (enumValues && enumValues.length > 0) {
                console.log(`[HQL Completion] Found ${enumValues.length} enum values for ${extractedType}`);
                return enumValues;
              }
            } else {
              console.log(`[HQL Completion] ${extractedType} is not recognized as enum type`);
            }
          }
        }
        
        // Fall back to symbol manager lookup if direct parsing fails
        // Look up the parameter type from function definition - this is the key part
        const paramType = this.symbolManager.getParameterType(funcName, paramName, document.uri);
        console.log(`[HQL Completion] Parameter type from symbol manager for ${paramName}: ${paramType}`);
        
        if (paramType && this.symbolManager.isEnumType(paramType)) {
          // Return enum values for the correctly determined parameter type
          const enumValues = getEnumValueCompletions(document, paramType, true, this.symbolManager, this.dynamicValueCache);
          if (enumValues && enumValues.length > 0) {
            console.log(`[HQL Completion] Found ${enumValues.length} enum values for ${paramType}`);
            return enumValues;
          }
        }
        
        // If we still haven't found the parameter type, use direct name match as a fallback
        // This is a final attempt - try to find an enum with the same name as the parameter (common pattern)
        const enumWithParamName = symbols.find(s => s.kind === 10 && s.name === paramName);
        if (enumWithParamName) {
          console.log(`[HQL Completion] Found enum with same name as parameter: ${paramName}`);
          const enumValues = getEnumValueCompletions(document, paramName, true, this.symbolManager, this.dynamicValueCache);
          if (enumValues && enumValues.length > 0) {
            return enumValues;
          }
        }
        
        // Don't show any enum cases if we can't determine the correct type
        console.log(`[HQL Completion] No specific enum type found for parameter, showing no completions`);
        return [];
      }
      
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
        return getRelativePathCompletionItems(documentDir, cleanPath);
      }
      
      // Detect when a directory has just been selected from autocomplete
      // This handles the case when the user selects a directory that gets inserted with trailing slash
      const recentlySelectedDirMatch = linePrefix.match(/import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/(?:[^\/'"]+)\/)(["']?)$/);
      if (recentlySelectedDirMatch) {
        const [_, quoteType, directoryPath, endQuote] = recentlySelectedDirMatch;
        
        // Provide path completions inside this directory
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        return getRelativePathCompletionItems(documentDir, directoryPath);
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
        return getRelativePathCompletionItems(documentDir, fullPath);
      }
      
      // Check for enum values in function call context: (install os: |)
      const paramWithTypeMatch = linePrefix.match(RegexPatterns.PARAM_WITH_TYPE_REGEX);
      if (paramWithTypeMatch) {
        // Find the function and parameter name to get type context
        const funcParamMatch = linePrefix.match(RegexPatterns.FUNC_PARAM_REGEX);
        if (funcParamMatch) {
          const [_, funcName, paramName] = funcParamMatch;
          // Get completions for this typed parameter
          const enumCompletions = getParameterEnumValueCompletions(document, funcName, paramName, false, this.symbolManager, this.dynamicValueCache);
          if (enumCompletions.length > 0) {
            return enumCompletions;
          }
        }
      }
      
      // Check for enum dot notation shorthand: (= .|) or (install os: .|)
      const enumDotMatch = linePrefix.match(RegexPatterns.ENUM_DOT_REGEX);
      if (enumDotMatch) {
        // Check if it's in parameter context for an enum type
        const paramContextMatch = linePrefix.match(RegexPatterns.PARAM_CONTEXT_REGEX);
        if (paramContextMatch) {
          const paramName = paramContextMatch[1];
          // Find parameter type for full context
          const functionMatch = linePrefix.match(RegexPatterns.FUNCTION_MATCH_REGEX);
          if (functionMatch) {
            const funcName = functionMatch[1];
            console.log(`[HQL Completion] Parameter context: ${funcName} ${paramName}:`);
            const enumCompletions = getParameterEnumValueCompletions(document, funcName, paramName, true, this.symbolManager, this.dynamicValueCache);
            if (enumCompletions.length > 0) {
              return enumCompletions;
            }
          }
        }
        
        // Check if we're in a direct function call with dot
        const directFunctionDotMatch = linePrefix.match(RegexPatterns.DIRECT_FUNCTION_DOT_REGEX);
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
              return getEnumValueCompletions(document, firstParam.type, true, this.symbolManager, this.dynamicValueCache);
            }
          }
        }
        
        // Use context-aware enum completions or none at all - don't fall back to all enums
        const expectedType = getExpectedTypeFromContext(document, position, this.symbolManager);
        if (expectedType && this.symbolManager.isEnumType(expectedType)) {
          return getEnumValueCompletions(document, expectedType, true, this.symbolManager, this.dynamicValueCache);
        }
        return []; // Return empty if we can't determine the type - don't show everything
      }
      
      // Check for function call context: (functionName |
      const funcCallMatch = linePrefix.match(RegexPatterns.FUNC_CALL_REGEX);
      if (funcCallMatch) {
        const functionName = funcCallMatch[1];
        console.log(`[HQL Completion] Function call detected: ${functionName}`);
        const paramCompletions = getParameterCompletions(document, functionName, this.symbolManager, this.dynamicValueCache);
        console.log(`[HQL Completion] Parameter completions count: ${paramCompletions.length}`);
        if (paramCompletions.length > 0) {
          console.log(`[HQL Completion] Returning parameter completions for ${functionName}`);
          return paramCompletions;
        }
      }
      
      // Check for class instantiation: (new |
      const newClassMatch = linePrefix.match(RegexPatterns.NEW_CLASS_REGEX);
      if (newClassMatch) {
        console.log(`[HQL Completion] Class instantiation detected`);
        return getClassInstantiationCompletions(document, this.symbolManager);
      }
      
      // Check for class name typing to suggest instantiation (at start of line or inside parentheses)
      const classNameMatch = linePrefix.match(RegexPatterns.CLASS_NAME_REGEX);
      if (classNameMatch) {
        const word = classNameMatch[1];
        if (word && word.length > 0) {
          const classCompletions = getClassNameCompletions(document, word, this.symbolManager);
          if (classCompletions.length > 0) {
            return classCompletions;
          }
        }
      }
      
      // Check for named parameter in function call: (functionName param: |
      const namedParamMatch = linePrefix.match(RegexPatterns.NAMED_PARAM_REGEX);
      if (namedParamMatch) {
        console.log(`[HQL Completion] Named parameter context detected`);
        // Extract function and parameter name to provide type-specific completions
        const funcParamParts = linePrefix.match(RegexPatterns.FUNC_PARAM_REGEX);
        if (funcParamParts) {
          const [_, funcName, paramName] = funcParamParts;
          console.log(`[HQL Completion] Function: ${funcName}, Parameter: ${paramName}`);
          // Check if we should return enum values first
          const enumCompletions = getParameterEnumValueCompletions(document, funcName, paramName, false, this.symbolManager, this.dynamicValueCache);
          console.log(`[HQL Completion] Enum completions count: ${enumCompletions.length}`);
          if (enumCompletions.length > 0) {
            console.log(`[HQL Completion] Returning enum completions for ${paramName}`);
            return enumCompletions;
          }
          
          // Otherwise fall back to regular parameter value completions
          const valueCompletions = getParameterValueCompletions(document, funcName, paramName, this.symbolManager, this.dynamicValueCache);
          console.log(`[HQL Completion] Parameter value completions count: ${valueCompletions.length}`);
          return valueCompletions;
        }
      }
      
      // Check for import completions
      if (currentLine.includes('import') && (
          linePrefix.includes('import') || 
          linePrefix.includes('from') || 
          linePrefix.includes('['))) {
        return handleImportCompletions(document, linePrefix, currentLine, fullText, this.workspaceFolders);
      }
      
      // Check for export completions
      const exportPattern = /\(\s*export\s+\[/;
      const isExportContext = currentLine.match(exportPattern) !== null;
      if (isExportContext) {
        console.log('[HQL] Detected export context');
        return handleExportCompletions(document, linePrefix, fullText);
      }
      
      // Check for enum value completions with dot notation
      if (linePrefix.includes('.')) {
        const dotCompletions = handleEnumDotCompletions(document, position, this.symbolManager, this.dynamicValueCache);
        if (dotCompletions.length > 0) {
          return dotCompletions;
        }
        
        // Check for method chain completions
        const methodChainCompletions = handleMethodChainCompletions(document, linePrefix, this.symbolManager);
        if (methodChainCompletions.length > 0) {
          return methodChainCompletions;
        }
      }
      
      // Check for special syntax completions for class, struct, loop, etc.
      const specialSyntaxCompletions = handleSpecialSyntaxCompletions(document, linePrefix, position);
      if (specialSyntaxCompletions.length > 0) {
        return specialSyntaxCompletions;
      }

      // Check for dot chain completions (numbers.filter .map) 
      if (linePrefix.match(RegexPatterns.DOT_CHAIN_REGEX)) {
        const chainCompletions = handleDotChainCompletions(document, linePrefix);
        if (chainCompletions.length > 0) {
          return chainCompletions;
        }
      }

      // Simplified import context detection
      const importPattern = /\(\s*import\s+\[/;
      const isImportContext = currentLine.match(importPattern) !== null;
      console.log(`[HQL] Line: "${currentLine}" | Import context: ${isImportContext}`);
      
      // Check for data structure literal completions (but not in import or export contexts)
      if (linePrefix.trim().endsWith('[') && !isImportContext && !isExportContext) {
        console.log('[HQL] Detected vector start: [ - Not in import/export context, providing completions');
        return getDataStructureLiteralCompletions('[');
      } else if (linePrefix.trim().endsWith('[') && (isImportContext || isExportContext)) {
        console.log('[HQL] Detected vector start: [ - In import/export context, suppressing completions');
        // Return empty array to prevent data structure completions in import/export context
        return [];
      } else if (linePrefix.trim().endsWith('{') && !isImportContext && !isExportContext) {
        console.log('Detected map start: {');
        return getDataStructureLiteralCompletions('{');
      } else if (linePrefix.trim().endsWith('#[') && !isImportContext && !isExportContext) {
        console.log('Detected set start: #[');
        return getDataStructureLiteralCompletions('#[');
      } else if (linePrefix.trim().endsWith('#') && !isImportContext && !isExportContext) {
        console.log('Detected set start shorthand: #');
        return getDataStructureLiteralCompletions('#[');
      } else if (linePrefix.trim().endsWith("'") && !isImportContext && !isExportContext) {
        console.log('Detected list start: \'');
        return getDataStructureLiteralCompletions("'");
      }

      // Check for cond pattern completions
      if (linePrefix.match(RegexPatterns.COND_REGEX)) {
        return getCondPatternCompletions();
      }

      // Check for for-loop completions
      if (linePrefix.match(RegexPatterns.FOR_REGEX)) {
        return getForLoopCompletions();
      }

      // Check for loop/recur pattern
      if (linePrefix.match(RegexPatterns.LOOP_REGEX)) {
        return getLoopRecurCompletions();
      }

      // Check for struct/class field completions
      if (linePrefix.match(RegexPatterns.CLASS_STRUCT_REGEX)) {
        const isStruct = linePrefix.includes('struct');
        return getClassStructFieldCompletions(isStruct);
      }

      // Method definitions in class/struct and data structure literal completions 
      // are already handled by the specialSyntaxCompletions and dataStructureMatch checks above

      // Get the word at the cursor position
      const word = this.getWordAtPosition(linePrefix);
      
      // Start building completion items
      let completions: CompletionItem[] = [];
      
      // Check if we're in an import vector context
      const inImportContext = this.isInImportVectorContext(linePrefix, currentLine);
      
      // Only add standard library completions if NOT in import context
      if (!inImportContext) {
        completions = completions.concat(getStdLibCompletions(word));
        
        // Add document symbols
        completions = completions.concat(
          getDocumentSymbolCompletions(document, position, word, this.symbolManager)
        );
        
        // Check for function context - add corresponding templates
        const enclosingFunction = this.findEnclosingFunction(document, position);
        if (enclosingFunction) {
          const functionSpecificCompletions = getFunctionSpecificCompletions(enclosingFunction.name);
          if (functionSpecificCompletions.length > 0) {
            completions = completions.concat(functionSpecificCompletions);
          }
        }
        
        // Add template completions
        completions = completions.concat(
          getTemplateCompletions(word)
        );
        
        // Add type completions
        if (word.length > 0) {
          completions = completions.concat(
            getTypeCompletions(word)
          );
        }
      }
      
      // After handling all special cases, attempt to provide completions based on the current word
      const currentWord = this.getWordAtPosition(linePrefix);
      console.log(`[HQL Completion] Current word: "${currentWord}"`);
      
      // Always provide document symbols (functions, variables) as completion options
      const documentItems = getDocumentSymbolCompletions(document, position, currentWord, this.symbolManager);
      
      // Check if we're after a left parenthesis, which suggests the start of an expression
      if (linePrefix.trim().endsWith('(')) {
        const symbolItems = this.symbolManager.getDocumentSymbols(document.uri)
          .filter(s => s.name.startsWith(currentWord))
          .map(s => {
            return {
              label: s.name,
              kind: getCompletionKindForSymbol(s.kind),
              detail: s.name,
              documentation: {
                kind: MarkupKind.PlainText, 
                value: s.data?.documentation || s.name
              }
            } as CompletionItem;
          });
          
        // Combine with standard library items and template completions
        let completions = [...symbolItems];
        
        // Add standard library and template completions
        const stdlibItems = getStdLibCompletions(currentWord);
        completions = [...completions, ...stdlibItems];
        
        // Add control flow completions
        completions = [...completions, ...getWhenUnlessCompletions()];
        completions = [...completions, ...getCondCompletions()];
        completions = [...completions, ...getWhileLoopCompletions()];
        completions = [...completions, ...getForLoopCompletions()];
        completions = [...completions, ...getLoopRecurCompletions()];
        completions = [...completions, ...getRepeatCompletions()];
        completions = [...completions, ...getLetBindingControlCompletions()];
        completions = [...completions, ...getBlockCompletions()];
        completions = [...completions, ...getBranchingCompletions()];
        
        // Add macro usage completions
        completions = [...completions, ...getMacroUsageCompletions()];
        
        // Add class related completions
        completions = [...completions, ...getClassDeclarationCompletions()];
        completions = [...completions, ...getClassInstantiationSnippets()];
        
        return this.mergeAndDeduplicate(completions, currentWord);
      }
      
      // Check for word-based completions (outside of expression starts)
      if (currentWord && !linePrefix.trimEnd().endsWith('(')) {
        console.log(`[HQL Completion] Providing word-based completions for: ${currentWord}`);
        
        // Get template-based completions
        const templateItems = getTemplateCompletions(currentWord);
        
        // Get type completions
        const typeItems = getTypeCompletions(currentWord);
        
        // Get standard library completions
        const stdlibItems = getStdLibCompletions(currentWord);
        
        // Get control flow items (when appropriate based on context)
        let controlItems: CompletionItem[] = [];
        let macroItems: CompletionItem[] = [];
        let classItems: CompletionItem[] = [];
        
        // Add relevant completions based on the current word
        if ('if'.includes(currentWord) || 'when'.includes(currentWord) || 
            'unless'.includes(currentWord) || 'cond'.includes(currentWord)) {
          controlItems = getWhenUnlessCompletions();
        }
        
        if ('loop'.includes(currentWord) || 'for'.includes(currentWord) || 
            'while'.includes(currentWord) || 'recur'.includes(currentWord)) {
          controlItems = [...controlItems, ...getWhileLoopCompletions()];
          controlItems = [...controlItems, ...getForLoopCompletions()];
          controlItems = [...controlItems, ...getLoopRecurCompletions()];
          controlItems = [...controlItems, ...getRepeatCompletions()];
        }
        
        if ('do'.includes(currentWord) || 'let'.includes(currentWord)) {
          controlItems = [...controlItems, ...getBlockCompletions()];
        }
        
        if ('try'.includes(currentWord) || 'catch'.includes(currentWord) || 
            'throw'.includes(currentWord) || 'case'.includes(currentWord)) {
          controlItems = [...controlItems, ...getBranchingCompletions()];
        }
        
        // Add macro completions if we're potentially writing a macro
        if ('defmacro'.includes(currentWord) || 'macro'.includes(currentWord)) {
          macroItems = getMacroCompletions();
        }
        
        // If standard core macros are being typed (or, and, not, etc.)
        if ('or'.includes(currentWord) || 'and'.includes(currentWord) || 
            'not'.includes(currentWord) || 'inc'.includes(currentWord) ||
            'dec'.includes(currentWord) || 'str'.includes(currentWord) ||
            'empty'.includes(currentWord) || 'contains'.includes(currentWord) ||
            'first'.includes(currentWord) || 'rest'.includes(currentWord) ||
            'nil'.includes(currentWord) || 'length'.includes(currentWord)) {
          macroItems = [...macroItems, ...getMacroUsageCompletions()];
        }
        
        // Add class related completions
        if ('class'.includes(currentWord) || 'struct'.includes(currentWord)) {
          classItems = getClassDeclarationCompletions();
        }
        
        if ('new'.includes(currentWord)) {
          classItems = [...classItems, ...getClassInstantiationSnippets()];
        }
        
        if ('constructor'.includes(currentWord) || 'init'.includes(currentWord) ||
            'method'.includes(currentWord) || 'fn'.includes(currentWord) ||
            'fx'.includes(currentWord) || 'static'.includes(currentWord) ||
            'get'.includes(currentWord) || 'set'.includes(currentWord)) {
          classItems = [...classItems, ...getClassMethodCompletions()];
        }
        
        if ('call'.includes(currentWord) || 'method'.includes(currentWord) ||
            'field'.includes(currentWord) || 'chain'.includes(currentWord)) {
          classItems = [...classItems, ...getMethodCallCompletions()];
        }
        
        // Combine all completions
        let completions = [...documentItems, ...templateItems, ...typeItems, ...stdlibItems, 
                          ...controlItems, ...macroItems, ...classItems];
                          
        return this.mergeAndDeduplicate(completions, currentWord);
      }
      
      // Add cases for the HQL control structures
      if (linePrefix.match(RegexPatterns.REPEAT_REGEX)) {
        return getRepeatCompletions();
      }
      
      if (linePrefix.match(RegexPatterns.FOR_DECLARATION_REGEX)) {
        return getForLoopCompletions();
      }

      if (linePrefix.match(RegexPatterns.WHILE_REGEX)) {
        return getWhileLoopCompletions();
      }

      if (linePrefix.match(RegexPatterns.WHEN_UNLESS_REGEX)) {
        return getWhenUnlessCompletions();
      }

      if (linePrefix.match(RegexPatterns.LOOP_DECLARATION_REGEX)) {
        return getLoopRecurCompletions();
      }

      if (linePrefix.match(RegexPatterns.IF_WHEN_LET_REGEX)) {
        return getLetBindingControlCompletions();
      }

      if (linePrefix.match(RegexPatterns.CLASS_DECLARATION_REGEX)) {
        return getClassCompletions();
      }
      
      if (linePrefix.match(RegexPatterns.COND_COMPLETION_REGEX)) {
        return getCondCompletions();
      }
      
      // Return empty array if nothing else matched
      return [];
      
    } catch (error) {
      console.error('[HQL Completion] Error providing completions:', error);
      return [];
    }
  }
    
  /**
   * Extract the current word from text up to the cursor position
   */
  private getWordAtPosition(linePrefix: string): string {
    const wordMatch = linePrefix.match(RegexPatterns.WORD_MATCH_REGEX);
    if (wordMatch) {
      return wordMatch[0];
    }
    return '';
  }
  
  /**
   * Merge completions from different sources and remove duplicates,
   * prioritizing items by match type: prefix, suffix, then fuzzy
   */
  private mergeAndDeduplicate(completions: CompletionItem[], currentWord: string = ''): CompletionItem[] {
    // Check if we're in an import context by examining all completions
    const isImportContext = completions.some(item => {
      const doc = item.documentation;
      return item.detail?.includes('export from') || 
             (typeof doc === 'object' && doc.value?.includes('exported from'));
    });
    
    // Data structure templates that shouldn't appear in import contexts
    const dataStructureKeywords = ['vector', 'array', 'list', 'set', 'map', 'object'];
    
    // Filter completions if in import context
    if (isImportContext) {
      completions = completions.filter(item => {
        // Remove data structure templates in import context
        if (dataStructureKeywords.includes(item.label.toLowerCase())) {
          // Keep only if it has export metadata
          return item.data && (
            item.data.sourceModule || 
            item.data.fullPath || 
            item.detail?.includes('export from')
          );
        }
        return true;
      });
    }
    
    // Ensure each item has a sortText that reflects match type priority
    if (currentWord) {
      const currentWordLower = currentWord.toLowerCase();
      
      for (const item of completions) {
        const label = item.label.toLowerCase();
        const originalSortText = item.sortText || item.label;
        
        // Already has priority prefix (e.g., "20-functionName") - keep the original prefix
        const sortPrefix = originalSortText.includes('-') ? 
          originalSortText.split('-')[0] : '99';
          
        // Add match type to sort text: 1=prefix, 2=suffix, 3=fuzzy
        if (label.startsWith(currentWordLower)) {
          // Prefix match (highest priority)
          item.sortText = `${sortPrefix}-1-${item.label}`;
        } else if (label.endsWith(currentWordLower)) {
          // Suffix match (medium priority)
          item.sortText = `${sortPrefix}-2-${item.label}`;
        } else {
          // Fuzzy match (lowest priority)
          item.sortText = `${sortPrefix}-3-${item.label}`;
        }
      }
    }
    
    // Sort completions by sortText
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
   * Update cache of dynamic values from document
   */
  private updateDynamicValues(document: TextDocument): void {
    try {
      // Clear the entire cache to ensure fresh data
      this.dynamicValueCache.clear();
      
      // Parse the document to find all enum declarations and their values
      const text = document.getText();
      const expressions = parse(text, true);
      
      // Process expressions to find enum declarations
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'enum') {
            processEnumForCompletion(expr, document.uri, this.symbolManager, this.dynamicValueCache);
          }
        }
      }
      
      // Get document symbols from open documents
      const uri = document.uri;
      
      // Process all function definitions to correctly map enum parameter types
      const symbols = this.symbolManager.getDocumentSymbols(uri);
      const functionSymbols = symbols.filter(s => s.kind === 12 || s.kind === 6); // Function or Method
      
      console.log(`[HQL Completion] Processing ${functionSymbols.length} function symbols to update parameter types`);
      
      // Update the symbol manager with the latest parameter types
      for (const func of functionSymbols) {
        if (func.data?.params) {
          console.log(`[HQL Completion] Function ${func.name} has ${func.data.params.length} parameters`);
          for (const param of func.data.params) {
            if (param.type) {
              console.log(`[HQL Completion] Parameter ${param.name}: ${param.type}`);
            }
          }
        }
      }
      
      // Force re-parse any enum types in the document
      const enumTypes = symbols.filter(s => s.kind === 10); // Enum type
      for (const enumType of enumTypes) {
        console.log(`[HQL Completion] Processing enum ${enumType.name}`);
        // Find the enum declaration
        for (const expr of expressions) {
          if (isList(expr) && expr.elements.length > 1) {
            const first = expr.elements[0];
            const second = expr.elements[1];
            if (isSymbol(first) && first.name === 'enum' && 
                isSymbol(second) && second.name === enumType.name) {
              processEnumForCompletion(expr, document.uri, this.symbolManager, this.dynamicValueCache);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error updating dynamic values: ${error}`);
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

  // Simplify the isInImportVectorContext method to focus on what matters
  private isInImportVectorContext(linePrefix: string, currentLine: string): boolean {
    return linePrefix.includes('import [') ||
      linePrefix.includes('import [') ||
      currentLine.match(RegexPatterns.IMPORT_REGEX) !== null;
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
  
  // Special handling for print and console.log functions to ensure cursor is positioned inside parentheses
  const printOrLogFunctions = ['print', 'println', 'console.log', 'console.error', 'console.warn', 'console.info', 'console.debug', 'console.trace'];
  if ((completionItem.kind === CompletionItemKind.Function || completionItem.kind === CompletionItemKind.Method) && 
      printOrLogFunctions.includes(completionItem.label) &&
      completionItem.insertTextFormat === InsertTextFormat.Snippet &&
      completionItem.insertText) {
    
    // Make sure cursor is positioned between quotes
    if (!completionItem.insertText.includes('"${1}"')) {
      // Add quotes around the cursor position
      completionItem.insertText = completionItem.insertText.replace(/\$\{[01]\}/, '"${1}"');
    }
  }
  
  return completionItem;
}