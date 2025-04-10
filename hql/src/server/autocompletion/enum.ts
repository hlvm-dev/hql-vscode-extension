import { TextDocument, Position, } from 'vscode-languageserver-textdocument';
import { SymbolManager } from '../symbolManager';  
import {
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    InsertTextFormat
} from 'vscode-languageserver';
import { isList, isSymbol, isString } from '../../s-exp/types';
import { parse, SExp } from '../../parser';

/**
 * Get all enum case completions from all enum types in the document
 * This is now restricted to only work when we specifically ask for all enum cases,
 * and should generally be avoided in favor of the type-specific versions
 */
export function getAllEnumCaseCompletions(document: TextDocument, symbolManager: SymbolManager): CompletionItem[] {
    console.log(`[HQL Completion] getAllEnumCaseCompletions called`);
    
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    const allEnumCases: CompletionItem[] = [];
    
    // Find all enum types
    const enumTypes = symbols.filter(s => s.kind === 10); // Enum type
    console.log(`[HQL Completion] Found ${enumTypes.length} enum types`);
    
    for (const enumType of enumTypes) {
      const enumName = enumType.name;
      const enumCases = symbols.filter(s => 
        s.kind === 11 && // EnumMember
        s.data?.enumName === enumName
      );
      
      console.log(`[HQL Completion] Enum ${enumName} has ${enumCases.length} cases`);
      
      for (const enumCase of enumCases) {
        // Extract just the case name without the enum prefix
        const caseName = enumCase.name.includes('.') 
          ? enumCase.name.split('.')[1] 
          : enumCase.name;
          
        allEnumCases.push({
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum ${enumName}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: enumCase.data?.documentation || `Enum case from \`${enumName}\``
          },
          insertText: caseName,
          sortText: `0-${caseName}`, // Sort enum cases to the top
          data: {
            enumName: enumName,
            fullName: `${enumName}.${caseName}`
          }
        });
      }
    }
    
    console.log(`[HQL Completion] Returning ${allEnumCases.length} total enum cases`);
    return allEnumCases;
  }

  /**
   * Process an enum expression for completion suggestions
   */
  export function processEnumForCompletion(
    expr: SExp, 
    documentUri: string, 
    symbolManager: SymbolManager, 
    dynamicValueCache: Map<string, CompletionItem[]>
  ): void {
    if (!isList(expr) || expr.elements.length < 3) return;
    
    const first = expr.elements[0];
    const second = expr.elements[1];
    
    if (!isSymbol(first) || first.name !== 'enum' || !isSymbol(second)) return;
    
    const enumName = second.name;
    console.log(`[HQL Completion] Processing enum definition: ${enumName}`);
    
    // Map to store enum cases
    const enumCases: string[] = [];
    const enumCompletions: CompletionItem[] = [];
    
    // Extract enum cases
    for (let i = 2; i < expr.elements.length; i++) {
      const caseExpr = expr.elements[i];
      
      if (isList(caseExpr) && caseExpr.elements.length >= 2) {
        const caseKeyword = caseExpr.elements[0];
        const caseName = caseExpr.elements[1];
        
        if (isSymbol(caseKeyword) && caseKeyword.name === 'case' && isSymbol(caseName)) {
          const caseNameStr = caseName.name;
          enumCases.push(caseNameStr);
          
          // Create completion item for this case
          enumCompletions.push({
            label: caseNameStr,
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
          
          console.log(`[HQL Completion] Added enum case ${caseNameStr} to ${enumName}`);
        }
      }
    }
    
    // Store enum cases in the symbol manager
    if (enumCases.length > 0) {
      symbolManager.registerEnumType(enumName, enumCases);
      dynamicValueCache.set(`enum:${enumName}`, enumCompletions);
      console.log(`[HQL Completion] Registered enum ${enumName} with ${enumCases.length} cases`);
    }
  }
  
  /**
   * Get completion items for enum values based on type
   */
  export function getEnumValueCompletions(
    document: TextDocument, 
    enumType: string, 
    shorthandDotNotation: boolean = false, 
    symbolManager: SymbolManager, 
    dynamicValueCache: Map<string, CompletionItem[]>
  ): CompletionItem[] {
    // Check if we have cached values for this enum
    const cachedItems = dynamicValueCache.get(`enum:${enumType}`);
    if (cachedItems) {
      return cachedItems.map(item => {
        // Clone the item so we don't modify the cached version
        const newItem = { ...item };
        
        if (shorthandDotNotation) {
          // For shorthand dot notation, we just need the case name
          newItem.label = item.label;
          newItem.insertText = item.label;
        } else {
          // For regular notation, use proper enum format: EnumType.CaseName
          newItem.label = item.label;
          newItem.insertText = `${enumType}.${item.label}`;
        }
        
        // High priority sorting for enum values
        newItem.sortText = `00-${item.label}`;
        return newItem;
      });
    }
    
    // If not in cache, look through document symbols
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    
    // First find the enum type
    const enumSymbol = symbols.find(s => 
      s.kind === 10 && // Enum
      s.name === enumType
    );
    
    if (!enumSymbol) {
      return [];
    }
    
    // Find enum members for this type
    const enumMembers = symbols.filter(s => 
      s.kind === 11 && // EnumMember
      s.data?.enumName === enumType
    );
    
    if (enumMembers.length > 0) {
      const enumCompletions = enumMembers.map(enumMember => {
        // Extract just the case name without the enum prefix
        const caseName = enumMember.name.includes('.') 
          ? enumMember.name.split('.')[1] 
          : enumMember.name;
          
        return {
          label: caseName,
          kind: CompletionItemKind.EnumMember,
          detail: `Case of enum ${enumType}`,
          documentation: {
            kind: MarkupKind.Markdown,
            value: enumMember.data?.documentation || `Enum case from \`${enumType}\``
          },
          insertText: shorthandDotNotation ? caseName : `${enumType}.${caseName}`,
          sortText: `00-${caseName}`, // High priority for enum values
          data: {
            enumName: enumType,
            fullName: `${enumType}.${caseName}`
          }
        };
      });
      
      // Cache these for future use
      dynamicValueCache.set(`enum:${enumType}`, enumCompletions);
      
      return enumCompletions;
    }
    
    // If no members found directly, try parsing the document for enum declarations
    try {
      const text = document.getText();
      const expressions = parse(text, true);
      
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'enum') {
            const enumNameExpr = expr.elements[1];
            if (isSymbol(enumNameExpr) && enumNameExpr.name === enumType) {
              // Found the enum declaration, process its cases
              const cases: CompletionItem[] = [];
              
              for (let i = 2; i < expr.elements.length; i++) {
                const caseExpr = expr.elements[i];
                
                if (isList(caseExpr) && caseExpr.elements.length >= 2) {
                  const caseKeyword = caseExpr.elements[0];
                  const caseName = caseExpr.elements[1];
                  
                  if (isSymbol(caseKeyword) && caseKeyword.name === 'case' && isSymbol(caseName)) {
                    cases.push({
                      label: caseName.name,
                      kind: CompletionItemKind.EnumMember,
                      detail: `Case of enum ${enumType}`,
                      documentation: {
                        kind: MarkupKind.Markdown,
                        value: `Enum case from \`${enumType}\``
                      },
                      insertText: shorthandDotNotation ? caseName.name : `${enumType}.${caseName.name}`,
                      sortText: `00-${caseName.name}`,
                      data: {
                        enumName: enumType,
                        fullName: `${enumType}.${caseName.name}`
                      }
                    });
                  }
                }
              }
              
              if (cases.length > 0) {
                dynamicValueCache.set(`enum:${enumType}`, cases);
                return cases;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing enum cases: ${error}`);
    }
    
    return [];
  }

    
  /**
   * Handle completions for enum dot notation
   */
  export function handleEnumDotCompletions(document: TextDocument, position: Position, symbolManager: SymbolManager, dynamicValueCache: Map<string, CompletionItem[]>): CompletionItem[] {
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line] || '';
    const linePrefix = currentLine.substring(0, position.character);
    
    if (!linePrefix.endsWith('.')) return [];
    
    console.log(`[HQL Completion] handleEnumDotCompletions for: "${linePrefix}"`);
    
    const beforeDot = linePrefix.slice(0, -1).trim();
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    
    // DYNAMIC PARAMETER CONTEXT - no hardcoded function names or types
    // Find any function call with a parameter and colon
    const funcParamTypeMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/);
    if (funcParamTypeMatch) {
      const [_, funcName, paramName] = funcParamTypeMatch;
      console.log(`[HQL Completion] Parameter type match: ${funcName} ${paramName}:`);
      
      // Try direct parsing first to bypass any stale symbol manager data
      const fnMatch = text.match(new RegExp(`\\(fn\\s+${funcName}\\s+\\(([^)]+)\\)`, 'i'));
      if (fnMatch) {
        const paramText = fnMatch[1];
        console.log(`[HQL Completion] Parameter text: ${paramText}`);
        
        // Extract parameter type directly from text
        const paramTypeMatch = paramText.match(new RegExp(`${paramName}:\\s*([A-Za-z0-9_]+)`, 'i'));
        if (paramTypeMatch) {
          const extractedType = paramTypeMatch[1];
          console.log(`[HQL Completion] Direct parsed parameter type: ${extractedType}`);
          
          // Check if this is an enum type
          if (symbolManager.isEnumType(extractedType)) {
            return getEnumValueCompletions(document, extractedType, true, symbolManager, dynamicValueCache);
          }
        }
      }
      
      // Fall back to symbol manager
      const paramType = symbolManager.getParameterType(funcName, paramName, document.uri);
      console.log(`[HQL Completion] Parameter type from symbol manager: ${paramType}`);
      
      if (paramType && symbolManager.isEnumType(paramType)) {
        // Return enum case completions for this parameter type
        const typedCompletions = getEnumValueCompletions(document, paramType, true, symbolManager, dynamicValueCache);
        if (typedCompletions.length > 0) {
          return typedCompletions;
        }
      }
    }
    
    // 2. Check for direct function call with dot: (install .)
    const directFunctionCallMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+\.$/);
    if (directFunctionCallMatch) {
      const [_, funcName] = directFunctionCallMatch;
      
      // Find function symbol
      const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === funcName
      );
      
      // Check if function has parameters and the first one is an enum
      if (functionSymbol && 
          functionSymbol.data?.params && 
          functionSymbol.data.params.length > 0) {
        
        const firstParam = functionSymbol.data.params[0];
        if (firstParam.type && symbolManager.isEnumType(firstParam.type)) {
          // If first parameter is an enum, show its cases
          return getEnumValueCompletions(document, firstParam.type, true, symbolManager, dynamicValueCache);
        }
      }
    }
    
    // 3. Check for direct enum type reference (Type.case)
    const enumMatch = beforeDot.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    if (enumMatch) {
      const [_, typeName] = enumMatch;
      
      // Verify this is actually an enum type
      const enumType = symbols.find(s => 
        s.kind === 10 && // Enum
        s.name === typeName
      );
      
      if (enumType) {
        return getEnumValueCompletions(document, typeName, true, symbolManager, dynamicValueCache);
      }
    }
    
    // 4. Check if we're in a pattern matching case for an enum
    const matchPatternMatch = currentLine.match(/\(\s*match\s+(\w+).*\(\s*\.\s*$/);
    if (matchPatternMatch) {
      const [_, matchedVar] = matchPatternMatch;
      
      // Find the type of the matched variable
      const varSymbol = symbols.find(s => 
        s.kind === 13 && // Variable
        s.name === matchedVar &&
        s.data?.type
      );
      
      if (varSymbol && symbolManager.isEnumType(varSymbol.data!.type!)) {
        return getEnumValueCompletions(document, varSymbol.data!.type!, true, symbolManager, dynamicValueCache);
      }
    }
    
    // 5. If we're in a function parameter list, don't show unrelated enum completions
    const inParamListMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+[^)]*\.$/);
    if (inParamListMatch) {
      // Try to extract function name
      const funcMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        
        // Find function symbol
        const functionSymbol = symbols.find(s => 
          (s.kind === 12 || s.kind === 6) && // Function or Method
          s.name === funcName
        );
        
        if (functionSymbol && 
            functionSymbol.data?.params && 
            functionSymbol.data.params.length > 0) {
          
          // If dot is used in position where enum parameter would be expected,
          // return all enum cases that would be valid for any parameter of this function
          const enumParams = functionSymbol.data.params
            .filter(p => p.type && symbolManager.isEnumType(p.type));
          
          if (enumParams.length > 0) {
            // Get completions for first enum parameter
            return getEnumValueCompletions(document, enumParams[0].type!, true, symbolManager, dynamicValueCache);
          }
        }
      }
    }
    
    // 6. Try to determine expected type, but fallback to all enum cases if we can't
    const startOfArg = linePrefix.match(/[\(,]\s*\.$/);
    if (startOfArg) {
      // Try to determine the expected type from context
      const expectedType = getExpectedTypeFromContext(document, position, symbolManager);
      if (expectedType && symbolManager.isEnumType(expectedType)) {
        // If we found an expected enum type, only show values from that enum
        return getEnumValueCompletions(document, expectedType, true, symbolManager, dynamicValueCache);
      }
      
      // If we couldn't determine the type, don't show any completions
      console.log(`[HQL Completion] Couldn't determine expected type, showing no enum cases`);
      return [];
    }
    
    // For any other dot context, don't show anything
    // Only show enum cases when we can determine the proper context
    return [];
  }

    /**
   * Try to determine the expected type from context
   * This is used to filter enum case completions when using dot notation
   */
   export function getExpectedTypeFromContext(document: TextDocument, position: Position, symbolManager: SymbolManager): string | null {
        const text = document.getText();
        const lines = text.split('\n');
        const currentLine = lines[position.line] || '';
        const linePrefix = currentLine.substring(0, position.character);
        
        // Case 1: We're inside a function call - extract function name and argument position
        const funcCallMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+(.*?)\.$/);
        if (funcCallMatch) {
          const [_, funcName, argText] = funcCallMatch;
          // Count commas to determine which parameter we're at
          const commaCount = (argText.match(/,/g) || []).length;
          const paramIndex = commaCount; // Zero-based, first param has no commas before it
          
          // Get function info from document symbols directly instead of using a helper method
          const symbols = symbolManager.getDocumentSymbols(document.uri);
          const functionSymbol = symbols.find(s => 
            (s.kind === 12 || s.kind === 6) && // Function or Method
            s.name === funcName
          );
          
          if (functionSymbol && functionSymbol.data?.params && functionSymbol.data.params.length > paramIndex) {
            const paramType = functionSymbol.data.params[paramIndex].type;
            if (paramType && symbolManager.isEnumType(paramType)) {
              return paramType;
            }
          }
        }
        
        // Case 2: We're in a parameter with explicit type
        const paramWithTypeMatch = linePrefix.match(/\([a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*:\s+\.$/);
        if (paramWithTypeMatch) {
          const funcParamMatch = linePrefix.match(/\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/);
          if (funcParamMatch) {
            const [_, funcName, paramName] = funcParamMatch;
            const paramType = symbolManager.getParameterType(funcName, paramName, document.uri);
            if (paramType && symbolManager.isEnumType(paramType)) {
              return paramType;
            }
          }
        }
        
        return null;
      }

          /**
   * Get enum value completions for a parameter that expects an enum type
   */
    export function getParameterEnumValueCompletions(
        document: TextDocument, 
        functionName: string,
        paramName: string,
        shorthandDotNotation: boolean = false,
        symbolManager: SymbolManager,
        dynamicValueCache: Map<string, CompletionItem[]>
      ): CompletionItem[] {
        console.log(`[HQL Completion] getParameterEnumValueCompletions for ${functionName}.${paramName}:`);
        
        // Find the function in document symbols
        const symbols = symbolManager.getDocumentSymbols(document.uri);
        console.log(`[HQL Completion] Found ${symbols.length} symbols in document`);
        
        // Debug information about function symbols to help diagnose the issue
        const functionSymbols = symbols.filter(s => 
          (s.kind === 12 || s.kind === 6) && // Function or Method
          s.name === functionName
        );
        console.log(`[HQL Completion] Found ${functionSymbols.length} matching function symbols for ${functionName}`);
        
        // Print detailed info about each function symbol to diagnose any issues
        for (const func of functionSymbols) {
          console.log(`[HQL Completion] Function ${func.name} details:`, 
            JSON.stringify({
              params: func.data?.params,
              returnType: func.data?.returnType,
              range: func.location.range
            })
          );
        }
        
        const functionSymbol = functionSymbols[0]; // Take the first matching function
        
        // If we can't find the function or it has no parameters, return empty
        if (!functionSymbol || !functionSymbol.data?.params) {
          console.log(`[HQL Completion] Function symbol not found or has no params`);
          return [];
        }
        
        // Find the specific parameter and log all parameters to debug
        console.log(`[HQL Completion] All parameters:`, JSON.stringify(functionSymbol.data.params));
        
        const param = functionSymbol.data.params.find(p => p.name === paramName);
        if (!param || !param.type) {
          console.log(`[HQL Completion] Parameter ${paramName} not found or has no type`);
          // If no exact parameter match, check if this is the first parameter position
          // and function has any parameters that are enums
          if (functionSymbol.data.params.length > 0) {
            const firstParam = functionSymbol.data.params[0];
            console.log(`[HQL Completion] First parameter: ${firstParam.name}: ${firstParam.type}`);
            if (firstParam.type && symbolManager.isEnumType(firstParam.type)) {
              console.log(`[HQL Completion] Using first parameter as fallback: ${firstParam.name}: ${firstParam.type}`);
              // Clear the cache entry for this enum to ensure we get fresh values
              dynamicValueCache.delete(`enum:${firstParam.type}`);
              return getEnumValueCompletions(document, firstParam.type, shorthandDotNotation, symbolManager, dynamicValueCache);
            }
          }
          return [];
        }
        
        console.log(`[HQL Completion] Found parameter ${paramName}: ${param.type}`);
        
        // Check if parameter is an enum type
        const enumType = symbols.find(s => 
          s.kind === 10 && // Enum
          s.name === param.type
        );
        
        if (enumType) {
          console.log(`[HQL Completion] Found enum type symbol for ${param.type}`);
          // Clear the cache entry for this enum to ensure we get fresh values
          dynamicValueCache.delete(`enum:${param.type}`);
          // Return enum case completions
          return getEnumValueCompletions(document, param.type, shorthandDotNotation, symbolManager, dynamicValueCache);
        }
        
        // Try to check directly with symbol manager
        if (symbolManager.isEnumType(param.type)) {
          console.log(`[HQL Completion] Symbol manager confirms ${param.type} is an enum type`);
          // Clear the cache entry for this enum to ensure we get fresh values
          dynamicValueCache.delete(`enum:${param.type}`);
          return getEnumValueCompletions(document, param.type, shorthandDotNotation, symbolManager, dynamicValueCache);
        }
        
        console.log(`[HQL Completion] ${param.type} is not detected as an enum type`);
        return [];
      }

  /**
   * Get completions for enum cases
   */
export function getEnumCaseCompletions(): CompletionItem[] {
    return [
      {
        label: 'case-simple',
        kind: CompletionItemKind.Snippet,
        detail: 'Simple enum case',
        insertText: "${1:CaseName}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add a simple enum case'
        }
      },
      {
        label: 'case-raw-value',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with raw value',
        insertText: "${1:CaseName} ${2:rawValue}",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add an enum case with a raw value'
        }
      },
      {
        label: 'case-associated-values',
        kind: CompletionItemKind.Snippet,
        detail: 'Enum case with associated values',
        insertText: "${1:CaseName} (${2:valueName} ${3:valueType})",
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Add an enum case with associated values'
        }
      }
    ];
  }