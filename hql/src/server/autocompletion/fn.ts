import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import {
    Position,
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    CompletionParams,
    InsertTextFormat,
    Range
} from 'vscode-languageserver';
import { SymbolManager } from '../symbolManager';
import { getEnumValueCompletions } from './enum';

/**
* Provides completions for parameter values, particularly for enum types
*/
export function getParameterValueCompletions(
    document: TextDocument,
    functionName: string,
    paramName: string,
    symbolManager: SymbolManager,
    dynamicValueCache: Map<string, CompletionItem[]>
): CompletionItem[] {
    // Find the function in document symbols
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === functionName
    );
    
    // If we can't find the function or it has no parameters, return empty
    if (!functionSymbol || !functionSymbol.data?.params) {
        return [];
    }
    
    // Find the specific parameter
    const param = functionSymbol.data.params.find(p => p.name === paramName);
    if (!param || !param.type) {
        return [];
    }
    
    // Check if parameter is an enum type
    const enumType = symbols.find(s => 
        s.kind === 10 && // Enum
        s.name === param.type
    );
    
    if (enumType) {
        // Return enum case completions
        return getEnumValueCompletions(document, param.type, false, symbolManager, dynamicValueCache);
    }
    
    // For other types, provide type-specific completions
    switch (param.type.toLowerCase()) {
        case 'bool':
        case 'boolean':
        return [
            {
                label: 'true',
                kind: CompletionItemKind.Value,
                detail: 'Boolean true value',
                sortText: '01-true'
            },
            {
                label: 'false',
                kind: CompletionItemKind.Value,
                detail: 'Boolean false value',
                sortText: '01-false'
            }
        ];
        
        case 'string':
        return [
            {
                label: '""',
                kind: CompletionItemKind.Value,
                detail: 'Empty string',
                insertText: '""',
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: '01-string'
            },
            {
                label: '"${1:text}"',
                kind: CompletionItemKind.Snippet,
                detail: 'String with placeholder',
                insertText: '"${1:text}"',
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: '02-string-placeholder'
            }
        ];
        
        case 'int':
        case 'float':
        case 'number':
        // For numeric types, we could suggest common values but for now keep it simple
        if (param.defaultValue) {
            return [{
                label: param.defaultValue,
                kind: CompletionItemKind.Value,
                detail: `Default value for ${paramName}`,
                sortText: '01-default'
            }];
        }
        return [];
        
        default:
        // For other types, no specific completion
        return [];
    }
}

/**
* Generate multiple function call pattern completions for a function symbol
*/
export function generateFunctionCallCompletions(
    document: TextDocument, 
    position: Position, 
    funcName: string,
    symbolManager: SymbolManager
): CompletionItem[] {
    console.log(`[HQL Completion] generateFunctionCallCompletions called for function: ${funcName}`);
    
    // 1. Find the function in document symbols
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === funcName
    );
    
    // If we can't find the function, return just a basic completion
    if (!functionSymbol) {
        console.log(`[HQL Completion] Function symbol not found`);
        // Special handling for print and console.log functions
        const printOrLogFunctions = ['print', 'println', 'console.log', 'console.error', 'console.warn', 'console.info', 'console.debug', 'console.trace'];
        if (printOrLogFunctions.includes(funcName)) {
            return [{
                label: funcName,
                kind: CompletionItemKind.Function,
                insertText: `(${funcName} "\${1}")`,
                sortText: `99-${funcName}`, // Lowest priority - use 99 to ensure it's last
                insertTextFormat: InsertTextFormat.Snippet
            }];
        } else {
            return [{
                label: funcName,
                kind: CompletionItemKind.Function,
                insertText: `(${funcName} \${0})`,
                sortText: `99-${funcName}`, // Lowest priority - use 99 to ensure it's last
                insertTextFormat: InsertTextFormat.Snippet
            }];
        }
    }
    
    // 2. Get the parameters for the function
    let params = functionSymbol.data?.params || [];
    console.log(`[HQL Completion] Function parameters:`, JSON.stringify(params));
    
    // Fix parameters that may have colons in their names
    params = fixParameterTypes(params);
    console.log(`[HQL Completion] Fixed parameters:`, JSON.stringify(params));
    
    const completions: CompletionItem[] = [];
    
    // 3. Generate completions for enum parameters (highest priority)
    let hasEnumParams = false;
    
    for (const param of params) {
        if (param.type && symbolManager.isEnumType(param.type)) {
            hasEnumParams = true;
            console.log(`[HQL Completion] Found enum parameter: ${param.name} of type ${param.type}`);
            
            // Add shorthand dot notation completion
            completions.push({
                label: `(${funcName} ${param.name}: .)`,
                kind: CompletionItemKind.Snippet,
                detail: `Call with ${param.name} using shorthand enum notation`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `Use \`.CaseName\` shorthand for enum \`${param.type}\``
                },
                insertText: `(${funcName} ${param.name}: .\${1})`,
                sortText: `01-${funcName}`, // Highest priority
                insertTextFormat: InsertTextFormat.Snippet,
                command: {
                    title: 'Trigger Suggestions',
                    command: 'editor.action.triggerSuggest'
                }
            });
            
            // Add qualified name completion
            completions.push({
                label: `(${funcName} ${param.name}: ${param.type}.)`,
                kind: CompletionItemKind.Snippet,
                detail: `Call with ${param.name} using qualified enum name`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `Use \`${param.type}.CaseName\` qualified name for enum \`${param.type}\``
                },
                insertText: `(${funcName} ${param.name}: ${param.type}.\${1})`,
                sortText: `02-${funcName}`, // Second priority
                insertTextFormat: InsertTextFormat.Snippet,
                command: {
                    title: 'Trigger Suggestions',
                    command: 'editor.action.triggerSuggest'
                }
            });
        }
    }
    
    // 4. Add named parameters completion (high priority)
    if (params.length > 0) {
        const namedSnippet = params.map((p, i) => `${p.name}: \${${i+1}:${p.type || 'Any'}}`).join(' ');
        
        completions.push({
            label: `(${funcName} ${params.map(p => `${p.name}: ${p.type || 'Any'}`).join(' ')})`,
            kind: CompletionItemKind.Snippet,
            detail: `Call with named parameters`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `Complete function call with named parameters.`
            },
            insertText: `(${funcName} ${namedSnippet})`,
            sortText: `03-${funcName}`, // Third priority
            insertTextFormat: InsertTextFormat.Snippet
        });
    }
    
    // 5. Add positional parameters completion (medium priority)
    if (params.length > 0) {
        const positionalSnippet = params.map((p, i) => `\${${i+1}:${p.type || 'Any'}}`).join(' ');
        
        completions.push({
            label: `(${funcName} ${params.map(p => p.type || 'Any').join(' ')})`,
            kind: CompletionItemKind.Snippet,
            detail: `Call with positional parameters`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `Complete function call with positional parameters.`
            },
            insertText: `(${funcName} ${positionalSnippet})`,
            sortText: `04-${funcName}`, // Fourth priority
            insertTextFormat: InsertTextFormat.Snippet
        });
    }
    
    console.log(`[HQL Completion] Generated ${completions.length} function call completions`);
    return completions;
}


/**
* Get function-specific completions based on the enclosing function
*/
export function getFunctionSpecificCompletions(functionName: string): CompletionItem[] {
    // Add specialized completion based on common function contexts
    switch (functionName) {
        case 'http:request':
        return [
            {
                label: 'method:',
                kind: CompletionItemKind.Property,
                detail: 'HTTP Method',
                insertText: 'method: "GET"',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'HTTP method to use: GET, POST, PUT, DELETE, etc.'
                }
            },
            {
                label: 'url:',
                kind: CompletionItemKind.Property,
                insertText: 'url: "https://',
                detail: 'Request URL',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'URL to make the request to'
                }
            },
            {
                label: 'headers:',
                kind: CompletionItemKind.Property,
                insertText: 'headers: {\n  $0\n}',
                insertTextFormat: InsertTextFormat.Snippet,
                detail: 'HTTP Headers',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'HTTP headers to include in the request'
                }
            },
            {
                label: 'body:',
                kind: CompletionItemKind.Property,
                detail: 'Request Body',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Request body content'
                }
            }
        ];
        
        case 'fs:read-file':
        return [
            {
                label: 'path:',
                kind: CompletionItemKind.Property,
                detail: 'File Path',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Path to the file to read'
                }
            },
            {
                label: 'encoding:',
                kind: CompletionItemKind.Property,
                detail: 'File Encoding',
                insertText: 'encoding: "utf-8"',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Encoding to use when reading the file'
                }
            }
        ];
        
        case 'enum':
        return [
            {
                label: 'case-simple',
                kind: CompletionItemKind.Snippet,
                detail: 'Enum case',
                insertText: '(case ${1:CaseName})',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a simple case in an enumeration'
                }
            },
            {
                label: 'case-with-value',
                kind: CompletionItemKind.Snippet,
                detail: 'Enum case with raw value',
                insertText: '(case ${1:CaseName} ${2:value})',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a case with raw value in an enumeration'
                }
            },
            {
                label: 'case-with-params',
                kind: CompletionItemKind.Snippet,
                detail: 'Enum case with associated values',
                insertText: '(case ${1:CaseName} ${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2})',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a case with associated values in an enumeration'
                }
            }
        ];
        
        case 'class':
        return [
            {
                label: 'var',
                kind: CompletionItemKind.Keyword,
                detail: 'Class field (mutable)',
                insertText: 'var ${1:fieldName}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a mutable field in a class'
                }
            },
            {
                label: 'let',
                kind: CompletionItemKind.Keyword,
                detail: 'Class field (immutable)',
                insertText: 'let ${1:fieldName} ${2:value}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define an immutable field in a class'
                }
            },
            {
                label: 'constructor',
                kind: CompletionItemKind.Keyword,
                detail: 'Class constructor',
                insertText: 'constructor (${1:params})\n  ${0:body}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a constructor for the class'
                }
            },
            {
                label: 'fn',
                kind: CompletionItemKind.Keyword,
                detail: 'Class method',
                insertText: 'fn ${1:calculate} (${2:value})\n  ${0:body}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a method for the class'
                }
            },
            {
                label: 'fx',
                kind: CompletionItemKind.Keyword,
                detail: 'Class pure method',
                insertText: 'fx ${1:multiply} (${2:x}: ${3:Int}) (-> ${4:Int})\n  ${0:body}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a pure method for the class'
                }
            }
        ];
        
        case 'struct':
        return [
            {
                label: 'field',
                kind: CompletionItemKind.Keyword,
                detail: 'Struct field',
                insertText: 'field ${1:fieldName}: ${0:Type}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Define a field in a struct'
                }
            }
        ];
        
        case 'cond':
        return [
            {
                label: 'condition-branch',
                kind: CompletionItemKind.Snippet,
                detail: 'Condition branch',
                insertText: '(${1:condition}) ${0:result}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Add a condition branch to cond expression'
                }
            },
            {
                label: 'else-branch',
                kind: CompletionItemKind.Snippet,
                detail: 'Else branch',
                insertText: '(else ${0:result})',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Add the default else branch to cond expression'
                }
            }
        ];
        
        case 'import':
        return [
            {
                label: 'from',
                kind: CompletionItemKind.Keyword,
                detail: 'Import source',
                insertText: 'from "${0:path}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Specify the source module path'
                }
            }
        ];
        
        case 'for':
        return [
            {
                label: 'from:',
                kind: CompletionItemKind.Property,
                detail: 'Loop start value',
                insertText: 'from: ${0:1}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Starting value for the loop counter'
                }
            },
            {
                label: 'to:',
                kind: CompletionItemKind.Property,
                detail: 'Loop end value',
                insertText: 'to: ${0:10}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Ending value for the loop counter'
                }
            },
            {
                label: 'by:',
                kind: CompletionItemKind.Property,
                detail: 'Loop increment',
                insertText: 'by: ${0:2}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Increment value for each iteration'
                }
            }
        ];
        
        case 'loop':
        return [
            {
                label: 'recur',
                kind: CompletionItemKind.Keyword,
                detail: 'Loop recursion',
                insertText: 'recur (+ i 1) (+ sum i)',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Recur back to the loop with new values'
                }
            }
        ];
        
        case 'console.log':
        case 'print':
        return [
            {
                label: 'String',
                kind: CompletionItemKind.Snippet,
                detail: 'Insert a string',
                insertText: '"${1}"',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Print a string'
                }
            },
            {
                label: 'String concatenation',
                kind: CompletionItemKind.Snippet,
                detail: 'Insert string formatting',
                insertText: '"${1:message}: " ${2:value}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Format values for printing with a label'
                }
            },
            {
                label: 'Simple value',
                kind: CompletionItemKind.Snippet,
                detail: 'Insert a simple value',
                insertText: '${1:value}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Print a simple value'
                }
            }
        ];
        
        case 'fn':
        case 'fx': 
        // When inside a function definition, suggest parameter with type annotations
        return [
            {
                label: 'param-with-type',
                kind: CompletionItemKind.Snippet,
                detail: 'Parameter with type annotation',
                insertText: '${1:name}: ${0:Int}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Add a parameter with type annotation'
                }
            },
            {
                label: 'param-with-default',
                kind: CompletionItemKind.Snippet,
                detail: 'Parameter with default value',
                insertText: '${1:name}: ${2:Int} = ${0:10}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Add a parameter with type and default value'
                }
            },
            {
                label: 'return-type',
                kind: CompletionItemKind.Snippet,
                detail: 'Function return type',
                insertText: '(-> ${0:Int})',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Specify the function return type'
                }
            },
            {
                label: 'enum-param',
                kind: CompletionItemKind.Snippet,
                detail: 'Enum type parameter',
                insertText: '${1:status}: ${0:Status}',
                insertTextFormat: InsertTextFormat.Snippet,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'Parameter with enum type annotation'
                }
            }
        ];
        
        // Add more function-specific completions as needed
        
        default:
        return [];
    }
}

/**
* Get parameter completions for a function
* Provides comprehensive function call patterns based on function signature
*/
export function getParameterCompletions(document: TextDocument, funcName: string, symbolManager: SymbolManager, dynamicValueCache: Map<string, CompletionItem[]>): CompletionItem[] {
    console.log(`[HQL Completion] getParameterCompletions called for function: ${funcName}`);
    
    // Find the function in document symbols
    const symbols = symbolManager.getDocumentSymbols(document.uri);
    const functionSymbol = symbols.find(s => 
        (s.kind === 12 || s.kind === 6) && // Function or Method
        s.name === funcName
    );
    
    // If we can't find the function or it has no parameters, return empty
    if (!functionSymbol || !functionSymbol.data?.params) {
        console.log(`[HQL Completion] Function symbol not found or has no params`);
        return [];
    }
    
    console.log(`[HQL Completion] Function found with params:`, JSON.stringify(functionSymbol.data.params));
    
    // Fix the parameters if they have colons in their names
    const fixedParams = fixParameterTypes(functionSymbol.data.params);
    console.log(`[HQL Completion] Fixed params:`, JSON.stringify(fixedParams));
    
    const params = fixedParams;
    const returnType = functionSymbol.data.returnType || 'Any';
    // Check if this is an fx function based on the isFx flag
    const isFx = functionSymbol.data?.isFx || false;
    
    // Check which parameters are required vs optional (have default values)
    const requiredParams = params.filter(p => !p.defaultValue);
    const optionalParams = params.filter(p => p.defaultValue);
    const allParamsHaveDefaults = requiredParams.length === 0 && optionalParams.length > 0;
    
    const completions: CompletionItem[] = [];
    
    // 1. Add enum value completions first (highest priority)
    if (params.length > 0) {
        // Check for enum parameters and prioritize them
        for (const param of params) {
            if (param.type && symbolManager.isEnumType(param.type)) {
                console.log(`[HQL Completion] Parameter ${param.name} is enum type: ${param.type}`);
                
                // Get enum values for this type
                const enumCompletions = getEnumValueCompletions(document, param.type, false, symbolManager, dynamicValueCache);
                console.log(`[HQL Completion] Found ${enumCompletions.length} enum values for ${param.type}`);
                
                // Format them as parameter values
                const formattedEnumCompletions = enumCompletions.map(comp => {
                    const item: CompletionItem = {
                        label: `${param.name}: ${comp.label}`,
                        kind: CompletionItemKind.EnumMember,
                        detail: `Set ${param.name} to ${comp.label} (${param.type})`,
                        documentation: comp.documentation,
                        insertText: `${param.name}: ${comp.insertText || comp.label}`,
                        sortText: `01-enum-${comp.label}`, // Highest priority
                        insertTextFormat: InsertTextFormat.PlainText
                    };
                    return item;
                });
                
                completions.push(...formattedEnumCompletions);
                
                // Also add shorthand dot notation for the enum param
                completions.push({
                    label: `${param.name}: .`,
                    kind: CompletionItemKind.Snippet,
                    detail: `Use shorthand dot notation for ${param.type} enum values`,
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `Shorthand dot notation for enum values. Type a dot to see available cases.`
                    },
                    insertText: `${param.name}: .\${1}`,
                    sortText: `02-enum-dot`, // Second priority
                    insertTextFormat: InsertTextFormat.Snippet,
                    command: {
                        title: 'Trigger Suggestions',
                        command: 'editor.action.triggerSuggest'
                    }
                });
            }
        }
    }
    
    // 2. Named parameters (third priority)
    if (params.length > 0) {
        const namedSnippet = params.map((p, i) => `${p.name}: \${${i+1}:${p.type || 'Any'}}`).join(' ');
        completions.push({
            label: `(${funcName} ${params.map(p => `${p.name}: ${p.type || 'Any'}`).join(' ')})`,
            kind: CompletionItemKind.Snippet,
            detail: `Complete call with named arguments`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `Complete function call with all parameters in named style.`
            },
            sortText: `03-named`, // Third priority
            insertText: namedSnippet,
            insertTextFormat: InsertTextFormat.Snippet
        });
    }
    
    // 3. Individual parameter completions - lower priority
    if (allParamsHaveDefaults || requiredParams.length === 1) {
        // If all params have defaults, or there's just one required param, we can offer named params
        params.forEach((param, index) => {
            // Create named parameter completion with correct type
            const item: CompletionItem = {
                label: `${param.name}: ${param.type || 'Any'}`,
                kind: CompletionItemKind.Property,
                detail: `Parameter: ${param.type || 'Any'}${param.defaultValue ? ` = ${param.defaultValue}` : ''}`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `Named parameter for \`${funcName}\`${param.defaultValue ? `\n\nDefault value: \`${param.defaultValue}\`` : ''}`
                },
                sortText: `04-param-${param.name}`, // Fourth priority
                insertText: `${param.name}: \${1:${param.type || 'Any'}}`,
                insertTextFormat: InsertTextFormat.Snippet
            };
            
            completions.push(item);
            console.log(`[HQL Completion] Added parameter completion: ${param.name}: ${param.type || 'Any'}`);
        });
    }
    
    // 4. Positional parameters (lowest priority)
    if (params.length > 0) {
        // Positional
        const positionalSnippet = params.map((p, i) => `\${${i+1}:${p.type || 'Any'}}`).join(' ');
        completions.push({
            label: `(${funcName} ${params.map(p => p.type || 'Any').join(' ')})`,
            kind: CompletionItemKind.Snippet,
            detail: `Complete call with positional arguments`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `Complete function call with all parameters in positional style.`
            },
            sortText: `05-positional`, // Lowest priority
            insertText: positionalSnippet,
            insertTextFormat: InsertTextFormat.Snippet
        });
        console.log(`[HQL Completion] Added positional completion: ${positionalSnippet}`);
    }
    
    console.log(`[HQL Completion] Returning ${completions.length} total completions`);
    return completions;
}


/**
* Fixes incorrectly parsed parameters that have colons in their names
*/
function fixParameterTypes(params: any[]): any[] {
    // If we have any parameters with names ending in colon, 
    // we might have the wrong parameter/type structure
    if (params.some(p => p.name && p.name.endsWith(':'))) {
        const fixedParams: any[] = [];
        
        // Process parameters in pairs to fix incorrect parsing
        for (let i = 0; i < params.length; i += 2) {
            const paramWithColon = params[i];
            
            // Check if this appears to be a wrongly parsed param:type pair
            if (paramWithColon && paramWithColon.name && 
                paramWithColon.name.endsWith(':') && 
                i + 1 < params.length) {
                    
                    // The next parameter is likely the type
                    const typeParam = params[i + 1];
                    
                    // Create fixed parameter with correct name and type
                    const fixedParam = {
                        name: paramWithColon.name.substring(0, paramWithColon.name.length - 1),
                        type: typeParam.name || typeParam.type || 'Any',
                        defaultValue: paramWithColon.defaultValue || typeParam.defaultValue
                    };
                    
                    fixedParams.push(fixedParam);
                } else {
                    // Just add the parameter as is if it doesn't match the pattern
                    fixedParams.push(paramWithColon);
                }
            }
            
            return fixedParams;
        }
        
        // No problematic params, return as is
        return params;
    }