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
import * as path from 'path';
import * as fs from 'fs';
import { parse, SExp, SList, SSymbol } from '../../parser';
import { isList, isSymbol, isString } from '../../s-exp/types';
import { SymbolManager, ExtendedSymbolInformation } from '../symbolManager';

// List of reserved keywords that cannot be used as symbol names
const RESERVED_KEYWORDS = ['vector'];

/**
* Handle completions for export statements
*/
export function handleExportCompletions(
    document: TextDocument,
    currentLine: string,
    fullText: string
): CompletionItem[] {
    // Match export vector start: (export [
    const exportVectorStart = currentLine.match(/export\s+\[\s*$/);
    if (exportVectorStart) {
        // We're at the beginning of an export vector
        return getExportableSymbols(document);
    }
    
    // Match export vector with partial symbol: (export [sym
    const exportSymbolMatch = currentLine.match(/export\s+\[\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (exportSymbolMatch) {
        const partialSymbol = exportSymbolMatch[1];
        // If user is typing a reserved keyword, show error message
        if (RESERVED_KEYWORDS.some(kw => kw.startsWith(partialSymbol.toLowerCase()))) {
            return [{
                label: `/* '${partialSymbol}' is a reserved keyword */`,
                kind: CompletionItemKind.Text,
                detail: 'Cannot use reserved keywords as symbol names',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'This is a reserved keyword in HQL and cannot be used as a symbol name.'
                }
            }];
        }
        return getExportableSymbols(document).filter(item => 
            item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())
        );
    }
    
    // Match export vector with continuation: (export [sym1, sym
    const exportContinueMatch = currentLine.match(/export\s+\[.+,\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (exportContinueMatch) {
        const partialSymbol = exportContinueMatch[1];
        
        // If user is typing a reserved keyword, show error message
        if (RESERVED_KEYWORDS.some(kw => kw.startsWith(partialSymbol.toLowerCase()))) {
            return [{
                label: `/* '${partialSymbol}' is a reserved keyword */`,
                kind: CompletionItemKind.Text,
                detail: 'Cannot use reserved keywords as symbol names',
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: 'This is a reserved keyword in HQL and cannot be used as a symbol name.'
                }
            }];
        }
        
        // Find symbols that are already in the export list
        const alreadyExported = currentLine.match(/export\s+\[(.*)\s*,\s*[^,\s]*$/)?.[1].split(',')
        .map(s => s.trim().split(/\s+as\s+/)[0].trim()) || [];
        
        return getExportableSymbols(document).filter(item => 
            item.label.toLowerCase().startsWith(partialSymbol.toLowerCase()) &&
            !alreadyExported.includes(item.label)
        );
    }
    
    // Match "as" keyword for aliasing: (export [sym1, symbol as
    const exportAliasMatch = currentLine.match(/export\s+\[.*\b([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s*$/);
    if (exportAliasMatch) {
        // Suggest an alias based on the symbol name
        const symbolName = exportAliasMatch[1];
        return [{
            label: `${symbolName}Alias`,
            kind: CompletionItemKind.Value,
            detail: `Alias for ${symbolName}`,
            insertText: `${symbolName}Alias`,
            sortText: '01-alias'
        }];
    }
    
    // If just typed 'export', suggest the vector template
    if (currentLine.trim() === 'export' || currentLine.trim() === '(export') {
        return [{
            label: 'export-vector',
            kind: CompletionItemKind.Snippet,
            detail: 'Export symbols using vector syntax',
            insertText: 'export [${1:symbol1}${2:, symbol2}]',
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
                kind: MarkupKind.Markdown,
                value: 'Export symbols using the recommended vector syntax'
            }
        }];
    }
    
    return [];
}

/**
* Get exportable symbols from current document
*/
export function getExportableSymbols(document: TextDocument): CompletionItem[] {
    const exportableSymbols: CompletionItem[] = [];
    
    try {
        const text = document.getText();
        const expressions = parse(text, true);
        
        // Track imported symbols with their details
        const importedSymbols: Map<string, { source: string, kind: CompletionItemKind }> = new Map();
        
        // First pass: Collect all imported symbols
        for (const expr of expressions) {
            if (isList(expr) && expr.elements.length > 1 && isSymbol(expr.elements[0])) {
                const keyword = expr.elements[0].name;
                
                // Check for import statements
                if (keyword === 'import' && expr.elements.length >= 4) {
                    const secondElement = expr.elements[1];
                    
                    // Find 'from' keyword position
                    let fromIndex = -1;
                    for (let i = 2; i < expr.elements.length; i++) {
                        if (isSymbol(expr.elements[i]) && (expr.elements[i] as SSymbol).name === 'from') {
                            fromIndex = i;
                            break;
                        }
                    }
                    
                    if (fromIndex !== -1 && fromIndex + 1 < expr.elements.length && isString(expr.elements[fromIndex + 1])) {
                        const modulePath = (expr.elements[fromIndex + 1] as { value: string }).value;
                        
                        // Vector import: (import [sym1, sym2] from "path")
                        if (isList(secondElement)) {
                            const importList = secondElement as SList;
                            
                            // Process each symbol in the import list
                            for (const element of importList.elements) {
                                if (isSymbol(element)) {
                                    // Skip reserved keywords in imports
                                    const symbolName = element.name;
                                    if (RESERVED_KEYWORDS.includes(symbolName.toLowerCase())) {
                                        console.log(`[Import] Skipping reserved keyword: ${symbolName}`);
                                        continue;
                                    }
                                    
                                    // Simple import: symbol
                                    console.log(`[Import] Found symbol: ${symbolName} from ${modulePath}`);
                                    importedSymbols.set(symbolName, { 
                                        source: modulePath, 
                                        kind: CompletionItemKind.Variable 
                                    });
                                } else if (isList(element)) {
                                    // Handle 'as' syntax: original as alias
                                    const asList = element as SList;
                                    if (asList.elements.length > 2 && 
                                        isSymbol(asList.elements[0]) && 
                                        isSymbol(asList.elements[1]) && 
                                        (asList.elements[1] as SSymbol).name === 'as' && 
                                        isSymbol(asList.elements[2])) {
                                        
                                        const originalName = (asList.elements[0] as SSymbol).name;
                                        const aliasName = (asList.elements[2] as SSymbol).name;
                                        
                                        // Skip if either name is a reserved keyword
                                        if (RESERVED_KEYWORDS.includes(originalName.toLowerCase()) || 
                                            RESERVED_KEYWORDS.includes(aliasName.toLowerCase())) {
                                            console.log(`[Import] Skipping reserved keyword in alias: ${originalName} as ${aliasName}`);
                                            continue;
                                        }
                                        
                                        console.log(`[Import] Found alias: ${aliasName} (${originalName}) from ${modulePath}`);
                                        importedSymbols.set(aliasName, { 
                                            source: modulePath, 
                                            kind: CompletionItemKind.Variable
                                        });
                                    }
                                }
                            }
                        }
                        // Namespace import: (import namespace from "path")
                        else if (isSymbol(secondElement)) {
                            const namespaceName = (secondElement as SSymbol).name;
                            // Skip if namespace name is a reserved keyword
                            if (RESERVED_KEYWORDS.includes(namespaceName.toLowerCase())) {
                                console.log(`[Import] Skipping reserved keyword as namespace: ${namespaceName}`);
                                continue;
                            }
                            
                            console.log(`[Import] Found namespace: ${namespaceName} from ${modulePath}`);
                            importedSymbols.set(namespaceName, { 
                                source: modulePath, 
                                kind: CompletionItemKind.Module
                            });
                        }
                    }
                }
            }
        }
        
        // Second pass: Collect exportable definitions (fn, fx, let, var, enum, etc.)
        for (const expr of expressions) {
            if (isList(expr) && expr.elements.length > 1 && isSymbol(expr.elements[0])) {
                const keyword = expr.elements[0].name;
                
                // Check if this is a definition that can be exported
                if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
                    if (isSymbol(expr.elements[1])) {
                        const symbolName = expr.elements[1].name;
                        
                        // Skip if symbol name is a reserved keyword
                        if (RESERVED_KEYWORDS.includes(symbolName.toLowerCase())) {
                            console.log(`[Export] Skipping reserved keyword in definition: ${symbolName}`);
                            continue;
                        }
                        
                        let kind: CompletionItemKind = CompletionItemKind.Variable;
                        
                        // Determine completion item kind based on the symbol type
                        switch (keyword) {
                            case 'fn':
                            case 'fx':
                            kind = CompletionItemKind.Function;
                            break;
                            case 'enum':
                            kind = CompletionItemKind.EnumMember;
                            break;
                            case 'class':
                            case 'struct':
                            kind = CompletionItemKind.Class;
                            break;
                            case 'macro':
                            kind = CompletionItemKind.Method;
                            break;
                        }
                        
                        console.log(`[Export] Found exportable symbol: ${symbolName} (${keyword})`);
                        exportableSymbols.push({
                            label: symbolName,
                            kind,
                            detail: `${keyword} ${symbolName}`,
                            documentation: {
                                kind: MarkupKind.Markdown,
                                value: `Export the ${keyword} \`${symbolName}\``
                            },
                            insertText: symbolName,
                            sortText: `0${keyword.length}-${symbolName}`
                        });
                    }
                }
            }
        }
        
        // Add imported symbols to the exportable list
        for (const [symbolName, details] of importedSymbols.entries()) {
            // Skip reserved keywords
            if (RESERVED_KEYWORDS.includes(symbolName.toLowerCase())) {
                console.log(`[Export] Skipping reserved keyword from imports: ${symbolName}`);
                continue;
            }
            
            console.log(`[Export] Adding imported symbol to exports: ${symbolName} from ${details.source}`);
            exportableSymbols.push({
                label: symbolName,
                kind: details.kind,
                detail: `Imported from ${details.source}`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `Re-export the imported symbol \`${symbolName}\``
                },
                insertText: symbolName,
                sortText: `7-imported-${symbolName}`,
                data: {
                    imported: true,
                    sourceModule: details.source
                }
            });
        }
    } catch (error) {
        console.error(`Error getting exportable symbols: ${error}`);
    }
    
    return exportableSymbols;
}

/**
* Handle completions for import statements
*/
export function handleImportCompletions(
    document: TextDocument,
    linePrefix: string,
    currentLine: string,
    fullText: string,
    workspaceFolders: { uri: string }[] | null
): CompletionItem[] {
    // Special case for empty import with no symbol and just a dot: (import from ".|")
    const emptyImportDotMatch = linePrefix.match(/import\s+from\s+(['"])(\.*)(["']?)$/);
    if (emptyImportDotMatch) {
        const [_, quoteType, dotPrefix, endQuote] = emptyImportDotMatch;
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
    
    // Special case for import with empty symbol and empty quotations: (import from "")
    const emptyQuoteMatch = linePrefix.match(/import\s+from\s+(['"])$/);
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
    
    // Match when a directory has been selected from autocompletion
    // This specifically handles cases after selecting a directory from completion
    const directorySelectedMatch = linePrefix.match(/import(?:\s+\[[^\]]*\]|\s+[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+(['"])([^'"]*\/)(["']?)$/);
    if (directorySelectedMatch) {
        const [_, quoteType, directoryPath] = directorySelectedMatch;
        
        // Provide path completions for the selected directory
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        
        const completions = getRelativePathCompletionItems(documentDir, directoryPath);
        
        // Ensure all items have a trigger for the next autocompletion
        return completions.map(item => {
            if (item.kind === CompletionItemKind.Folder && !item.command) {
                item.command = {
                    title: 'Trigger Suggestion',
                    command: 'editor.action.triggerSuggest'
                };
            }
            return item;
        });
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
    
    // Match import with vector style syntax, including both empty vector and partial symbol
    // - Case 1: (import [] from "./path.hql")
    // - Case 2: (import [sym from "./path.hql")
    // - Case 3: (import [] - empty brackets at end of line
    // - Case 4: (import [symbol - partial symbol at end of line
    const importVectorMatch = currentLine.match(/import\s+\[(\s*|\s*[^,\s]*)$/);
    const importVectorEndOfLineMatch = linePrefix.match(/import\s+\[\s*([^,\s]*)$/);
    
    // Handle all import vector cases
    if (importVectorMatch || importVectorEndOfLineMatch) {
        // Get partial symbol from either match
        const partialSymbol = (importVectorMatch?.[1] || importVectorEndOfLineMatch?.[1] || '').trim();
        
        // Look for the module path in different ways, starting with the current line
        let modulePath;
        
        // Check if the current line has the full pattern with path
        const currentLinePathMatch = currentLine.match(/import\s+\[.*\]\s+from\s+["']([^"']+)["']/);
        if (currentLinePathMatch) {
            modulePath = currentLinePathMatch[1];
        }
        
        // Also check for a path following the cursor position
        if (!modulePath) {
            // Look in the full text for a completed statement
            modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
            
            // If not found, check for an incomplete statement with path
            if (!modulePath) {
                const fromPathMatch = fullText.match(/import\s+\[.*\s+from\s+["']([^"']+)["']/);
                if (fromPathMatch) {
                    modulePath = fromPathMatch[1];
                }
            }
            
            // If still not found, scan subsequent lines for a 'from' clause
            if (!modulePath) {
                const lines = fullText.split('\n');
                const currentLineIndex = lines.findIndex(line => line.includes(currentLine.trim()));
                if (currentLineIndex !== -1) {
                    // Check next several lines for a 'from' clause
                    for (let i = currentLineIndex; i < Math.min(currentLineIndex + 5, lines.length); i++) {
                        const fromMatch = lines[i].match(/\s*from\s+["']([^"']+)["']/);
                        if (fromMatch) {
                            modulePath = fromMatch[1];
                            break;
                        }
                    }
                }
            }
        }
        
        // If we found a module path, get its exported symbols
        if (modulePath) {
            console.log(`Found module path for import completion: ${modulePath}`);
            const importables = getImportableSymbols(modulePath, workspaceFolders);
            
            // Even if empty, add a message
            if (importables.length === 0) {
                return [{
                    label: '/* No exports found */',
                    kind: CompletionItemKind.Text,
                    detail: `No exported symbols found in ${modulePath}`
                }];
            }
            
            // List of common data structure templates to exclude from import suggestions
            const dataStructureKeywords = ['vector', 'array', 'list', 'set', 'map', 'object'];
            
            // Filter based on partial symbol and exclude data structure templates that aren't actual exports
            const filteredItems = importables
                .filter(item => {
                    // Skip common data structure templates unless they are truly exported symbols
                    if (dataStructureKeywords.includes(item.label.toLowerCase())) {
                        const isActualExport = item.data && 
                                              typeof item.data.sourceModule === 'string' && 
                                              item.data.sourceModule === modulePath;
                        return isActualExport;
                    }
                    
                    // For regular symbols, filter by partial match if needed
                    return !partialSymbol || item.label.toLowerCase().includes(partialSymbol.toLowerCase());
                })
                .map(item => {
                    // Apply sorting: exact prefix matches first
                    if (partialSymbol && item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())) {
                        item.sortText = `01-${item.label}`;
                    }
                    return item;
                });
                
            // Make sure we're not showing general template completions in import context
            return filteredItems;
        }
        
        // If we still can't determine the module path, look for path in quotes on the same line
        const inLinePathMatch = currentLine.match(/from\s+["']([^"']*)["']/);
        if (inLinePathMatch) {
            const possiblePath = inLinePathMatch[1];
            if (possiblePath) {
                return getImportableSymbols(possiblePath, workspaceFolders)
                    .filter(item => !partialSymbol || item.label.toLowerCase().includes(partialSymbol.toLowerCase()));
            }
        }
        
        // If we still can't determine anything, show a helpful message
        return [{
            label: '/* Specify a module path with from "..." */',
            kind: CompletionItemKind.Text,
            detail: 'Complete the import statement with a module path'
        }];
    }
    
    // Match import with continuation of vector symbols: (import [sym1, sym
    const importVectorContinueMatch = currentLine.match(/import\s+\[.+,\s*([^,\s]*)$/);
    if (importVectorContinueMatch) {
        const partialSymbol = importVectorContinueMatch[1] || '';
        // Get module path from the line
        const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
        
        if (modulePath) {
            // Filter symbols that are already imported
            const alreadyImportedSymbols = currentLine.match(/import\s+\[(.*)\s*,\s*[^,\s]*$/)?.[1].split(',')
            .map(s => s.trim().split(/\s+as\s+/)[0].trim()) || [];
            
            return getImportableSymbols(modulePath, workspaceFolders)
            .filter(item => 
                item.label.toLowerCase().startsWith(partialSymbol.toLowerCase()) &&
                !alreadyImportedSymbols.includes(item.label)
            );
        }
        return [];
    }
    
    // Match namespace import: (import namesp
    const namespaceImportMatch = currentLine.match(/import\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (namespaceImportMatch) {
        // Suggest common namespace names or module names based on available modules
        const partialName = namespaceImportMatch[1];
        return getSuggestedNamespaces(partialName, workspaceFolders);
    }
    
    // Match 'from' keyword: (import [...] from
    const fromKeywordMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+$/);
    if (fromKeywordMatch) {
        // The user has typed 'from', suggest quote, "./" and "../" options
        const results = [];
        
        // Add double quote suggestion
        results.push({
            label: '"',
            kind: CompletionItemKind.Operator,
            detail: 'Start path string',
            insertText: '""',
            insertTextFormat: InsertTextFormat.Snippet,
            command: {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
            }
        });
        
        // Add ./ suggestion for current directory
        results.push({
            label: './',
            kind: CompletionItemKind.Folder,
            detail: 'Current directory',
            insertText: '"./"',
            insertTextFormat: InsertTextFormat.Snippet,
            command: {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
            }
        });
        
        // Add ../ suggestion for parent directory
        results.push({
            label: '../',
            kind: CompletionItemKind.Folder,
            detail: 'Parent directory',
            insertText: '"../"',
            insertTextFormat: InsertTextFormat.Snippet,
            command: {
                title: 'Trigger Suggestion',
                command: 'editor.action.triggerSuggest'
            }
        });
        
        return results;
    }
    
    // Match "from ." without quotes yet
    const fromDotMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+([\.]+)$/);
    if (fromDotMatch) {
        const dotPrefix = fromDotMatch[1];
        const results = [];
        
        if (dotPrefix === '.') {
            // After typing just a dot, suggest "./" and "../"
            results.push({
                label: './',
                kind: CompletionItemKind.Folder,
                detail: 'Current directory',
                insertText: '"./"',
                insertTextFormat: InsertTextFormat.PlainText,
                command: {
                    title: 'Trigger Suggestion',
                    command: 'editor.action.triggerSuggest'
                }
            });
            
            results.push({
                label: '../',
                kind: CompletionItemKind.Folder,
                detail: 'Parent directory',
                insertText: '"../"',
                insertTextFormat: InsertTextFormat.PlainText,
                command: {
                    title: 'Trigger Suggestion',
                    command: 'editor.action.triggerSuggest'
                }
            });
        } else if (dotPrefix === '..') {
            // After typing two dots, suggest "../"
            results.push({
                label: '../',
                kind: CompletionItemKind.Folder,
                detail: 'Parent directory',
                insertText: '"../"',
                insertTextFormat: InsertTextFormat.PlainText,
                command: {
                    title: 'Trigger Suggestion',
                    command: 'editor.action.triggerSuggest'
                }
            });
        }
        
        return results;
    }
    
    // Match paths after 'from': (import [...] from "path
    // Use a more precise regex that handles both single and double quotes
    const pathMatch = currentLine.match(/import\s+(?:\[[^\]]*\]|[a-zA-Z_][a-zA-Z0-9_]*|\s*)?\s+from\s+(['"])([^'"]*?)$/);
    if (pathMatch) {
        // Extract quote type and partial path
        const [_, quoteType, partialPath] = pathMatch;
        
        console.log(`Import path with quote type ${quoteType}: "${partialPath}"`);
        
        // Provide path completions relative to current document
        const documentPath = document.uri.replace('file://', '');
        const documentDir = path.dirname(documentPath);
        
        // Get completions but preserve the quote type
        const completions = getRelativePathCompletionItems(documentDir, partialPath);
        
        // Return completions with original quote preserved
        return completions;
    }
    
    return [];
}

/**
* Get file system completion items for a path relative to the active document
*/
export function getRelativePathCompletionItems(
    documentDir: string,
    partialPath: string
): CompletionItem[] {
    const completionItems: CompletionItem[] = [];
    
    try {
        // Determine base directory for the search
        let basePath = documentDir;
        let searchPath = partialPath;
        
        // Handle relative paths
        if (partialPath.startsWith('./')) {
            searchPath = partialPath.substring(2);
        } else if (partialPath.startsWith('../')) {
            // For parent directory references, navigate up
            let parentCount = 0;
            let currentPath = partialPath;
            
            while (currentPath.startsWith('../')) {
                parentCount++;
                currentPath = currentPath.substring(3);
            }
            
            // Navigate up parent directories
            let tempBasePath = basePath;
            for (let i = 0; i < parentCount; i++) {
                tempBasePath = path.dirname(tempBasePath);
            }
            
            basePath = tempBasePath;
            searchPath = currentPath;
        } else if (partialPath === '.' || partialPath === '..') {
            // Just a dot or double dot
            searchPath = '';
            if (partialPath === '..') {
                basePath = path.dirname(basePath);
            }
        }
        
        // If partial path contains additional directory parts, use them as base
        const lastSlashIndex = searchPath.lastIndexOf('/');
        if (lastSlashIndex >= 0) {
            basePath = path.join(basePath, searchPath.substring(0, lastSlashIndex));
            searchPath = searchPath.substring(lastSlashIndex + 1);
        }
        
        // Read the directory
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        
        // Filter entries that match the search path
        for (const entry of entries) {
            // Skip hidden files unless explicitly looking for them
            if (entry.name.startsWith('.') && !searchPath.startsWith('.')) {
                continue;
            }
            
            // Skip node_modules and other typical exclude directories
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
                continue;
            }
            
            // Check if entry matches search prefix
            if (searchPath === '' || entry.name.toLowerCase().startsWith(searchPath.toLowerCase())) {
                let entryPath = lastSlashIndex >= 0 
                ? `${partialPath.substring(0, lastSlashIndex + 1)}${entry.name}`
                : entry.name;
                
                // Preserve the starting ./ or ../ in the completion
                if (partialPath.startsWith('./') && !entryPath.startsWith('./')) {
                    entryPath = `./${entryPath}`;
                } else if (partialPath.startsWith('../') && !entryPath.startsWith('../')) {
                    // Count the number of ../ at the beginning
                    const match = partialPath.match(/^(\.\.\/)+/);
                    if (match && match[0]) {
                        entryPath = `${match[0]}${entryPath}`;
                    }
                }
                
                const isDir = entry.isDirectory();
                const isHqlFile = entry.name.endsWith('.hql');
                const isJsFile = entry.name.endsWith('.js');
                
                // Include directories, .hql and .js files
                if (isDir || isHqlFile || isJsFile) {
                    const completionItem: CompletionItem = {
                        label: entry.name,
                        kind: isDir ? CompletionItemKind.Folder : CompletionItemKind.File,
                        detail: isDir ? 'Directory' : (isHqlFile ? 'HQL Module' : 'JS Module'),
                        insertText: isDir ? `${entry.name}/` : entry.name,
                        sortText: isDir ? `0-${entry.name}` : `1-${entry.name}` // Sort directories first
                    };
                    
                    // For files, insert just the name (even if file extension isn't in search)
                    if ((isHqlFile && !searchPath.endsWith('.hql')) || 
                    (isJsFile && !searchPath.endsWith('.js'))) {
                        completionItem.insertText = entry.name;
                    }
                    
                    // Add command to automatically trigger suggestion after selecting a folder
                    if (isDir) {
                        completionItem.command = {
                            title: 'Trigger Suggestion',
                            command: 'editor.action.triggerSuggest'
                        };
                    }
                    
                    completionItems.push(completionItem);
                }
            }
        }
    } catch (error) {
        console.error(`Error getting path completions: ${error}`);
    }
    
    return completionItems;
}

/**
* Get suggested namespace names for namespace imports
*/
export function getSuggestedNamespaces(partialName: string, workspaceFolders: { uri: string }[] | null): CompletionItem[] {
    // This could be enhanced to look at available modules and suggest names based on filenames
    const namespaces: CompletionItem[] = [];
    
    try {
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return namespaces;
        }
        
        const workspaceRoot = workspaceFolders[0].uri.replace('file://', '');
        
        // Recursively find .hql files in the workspace
        const findHqlFiles = (dir: string, depth: number = 0): string[] => {
            if (depth > 3) return []; // Limit recursion depth
            
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                let files: string[] = [];
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory() && 
                    entry.name !== 'node_modules' && 
                    entry.name !== '.git' && 
                    !entry.name.startsWith('.')) {
                        files = [...files, ...findHqlFiles(fullPath, depth + 1)];
                    } else if (entry.isFile() && entry.name.endsWith('.hql')) {
                        files.push(fullPath);
                    }
                }
                
                return files;
            } catch (error) {
                return [];
            }
        };
        
        const hqlFiles = findHqlFiles(workspaceRoot);
        
        // Create suggested namespace names from filenames
        for (const filePath of hqlFiles) {
            const relativePath = path.relative(workspaceRoot, filePath);
            const fileName = path.basename(filePath, '.hql');
            
            // Convert filename to camelCase for namespace suggestion
            const namespaceName = fileName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            
            if (namespaceName.toLowerCase().startsWith(partialName.toLowerCase())) {
                namespaces.push({
                    label: namespaceName,
                    kind: CompletionItemKind.Module,
                    detail: `Namespace for ${relativePath}`,
                    insertText: namespaceName,
                    sortText: `09-${namespaceName}`
                });
            }
        }
    } catch (error) {
        console.error(`Error getting namespace suggestions: ${error}`);
    }
    
    return namespaces;
}


/**
* Get importable symbols from a module
*/
export function getImportableSymbols(modulePath: string, workspaceFolders: { uri: string }[] | null): CompletionItem[] {
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return [];
    }
    
    try {
        // Get workspace root folder
        const workspaceRoot = workspaceFolders[0].uri.replace('file://', '');
        
        // Resolve the module path, handling different extensions
        let fullPath = path.resolve(workspaceRoot, modulePath);
        
        // If the file doesn't exist as is, try adding extensions
        if (!fs.existsSync(fullPath)) {
            // Try with .hql extension if not already specified
            if (!fullPath.endsWith('.hql') && !fullPath.endsWith('.js')) {
                const hqlPath = `${fullPath}.hql`;
                if (fs.existsSync(hqlPath)) {
                    fullPath = hqlPath;
                } else {
                    // Try with .js extension
                    const jsPath = `${fullPath}.js`;
                    if (fs.existsSync(jsPath)) {
                        fullPath = jsPath;
                    } else {
                        // Try looking for index files in the directory
                        const indexHql = path.join(fullPath, 'index.hql');
                        const indexJs = path.join(fullPath, 'index.js');
                        
                        if (fs.existsSync(indexHql)) {
                            fullPath = indexHql;
                        } else if (fs.existsSync(indexJs)) {
                            fullPath = indexJs;
                        } else {
                            console.warn(`Could not resolve module path: ${modulePath}`);
                            return [];
                        }
                    }
                }
            } else {
                console.warn(`File not found: ${fullPath}`);
                return [];
            }
        }
        
        console.log(`Reading module from: ${fullPath}`);
        
        // Read the file
        const moduleText = fs.readFileSync(fullPath, 'utf-8');
        
        // Extract exported symbols from the module based on file type
        const exportedSymbols = extractExportedSymbols(moduleText, fullPath);
        
        // If no exported symbols found but it's a JS file, it might have a default export
        if (exportedSymbols.length === 0 && fullPath.endsWith('.js')) {
            // Add default as a fallback for JS modules
            exportedSymbols.push('default');
        }
        
        // Get file extension to determine completion kind
        const isJsFile = fullPath.endsWith('.js');
        
        // Convert to completion items with appropriate icons and details
        return exportedSymbols.map(symbol => {
            // Use only safe values to avoid type errors
            let kind = CompletionItemKind.Value;
            
            if (isJsFile) {
                // For JS files, all symbols use the same kind to avoid type errors
                kind = CompletionItemKind.Value;
            } else {
                // For HQL files, also use a safe kind
                kind = CompletionItemKind.Value;
            }
            
            // Add a prefix to the detail to indicate the likely type
            let typePrefix = "";
            if (symbol === 'default') {
                typePrefix = "[Module] ";
            } else if (symbol.startsWith('get') || symbol.startsWith('set') || 
                       symbol.endsWith('Function') || 
                       symbol.startsWith('handle') || symbol.includes('Handler')) {
                typePrefix = "[Function] ";
            } else if (symbol.endsWith('Component') || 
                      symbol[0] === symbol[0].toUpperCase()) {
                typePrefix = "[Class] ";
            }
            
            const extension = path.extname(fullPath);
            const fileType = extension.slice(1).toUpperCase(); // Remove the dot and uppercase
            
            return {
                label: symbol,
                kind: kind,
                detail: `${typePrefix}${symbol} (${fileType} export from ${path.basename(modulePath)})`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `Symbol exported from \`${modulePath}\`\n\nFull path: \`${fullPath}\``
                },
                insertText: symbol,
                sortText: `01-${symbol}`, // Give exported symbols high priority
                data: {
                    sourceModule: modulePath,
                    fullPath: fullPath
                }
            };
        });
    } catch (error) {
        console.error(`Error getting importable symbols: ${error}`);
        return [];
    }
}

/**
* Extract exported symbols from a module
*/
export function extractExportedSymbols(moduleText: string, moduleFilePath: string = ''): string[] {
    const rawSymbols: string[] = [];
    
    try {
      // Check if this is a JS file by examining file extension or text content.
      const isJavaScript = moduleFilePath.endsWith('.js') ||
                             moduleText.includes('module.exports') ||
                             moduleText.includes('export function') ||
                             moduleText.includes('export const') ||
                             moduleText.includes('export let') ||
                             moduleText.includes('export class');
      
      if (isJavaScript) {
        // Handle JavaScript exports.
        return extractJavaScriptExports(moduleText);
      }
      
      // For HQL files, parse the module text.
      const expressions = parse(moduleText, true);
      
      // Look for explicit export forms.
      for (const expr of expressions) {
        if (isList(expr) && expr.elements.length > 0) {
          const first = expr.elements[0];
          if (isSymbol(first) && first.name === 'export') {
            // Check for the export list syntax: (export [sym1, sym2, ...])
            if (expr.elements.length > 1 && isList(expr.elements[1])) {
              const exportList = expr.elements[1];
              for (const elem of exportList.elements) {
                if (isSymbol(elem)) {
                  rawSymbols.push(elem.name);
                } else if (isList(elem)) {
                  if (
                    elem.elements.length > 2 &&
                    isSymbol(elem.elements[0]) &&
                    isSymbol(elem.elements[1]) &&
                    elem.elements[1].name === 'as' &&
                    isSymbol(elem.elements[2])
                  ) {
                    rawSymbols.push(elem.elements[0].name);
                  }
                }
              }
            }
            // Check for legacy string-based export: (export "name" symbol)
            else if (expr.elements.length > 2 && isString(expr.elements[1]) && isSymbol(expr.elements[2])) {
              rawSymbols.push(expr.elements[1].value);
            }
          }
        }
      }
      
      // If no explicit exports were found, look for top-level definitions that can be implicitly exported.
      if (rawSymbols.length === 0) {
        for (const expr of expressions) {
          if (isList(expr) && expr.elements.length > 1 && isSymbol(expr.elements[0])) {
            const keyword = expr.elements[0].name;
            if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
              if (isSymbol(expr.elements[1])) {
                rawSymbols.push(expr.elements[1].name);
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`Error extracting exported symbols: ${error}`);
    }
    
    // Post-process the raw symbols:
    // 1. Remove duplicates while preserving the order.
    // 2. For "vector": if it appeared only once in rawSymbols, it is omitted;
    //    if it appears two or more times, then keep one occurrence.
    const vectorCount = rawSymbols.filter(sym => sym === "vector").length;
    const seen = new Set<string>();
    const uniqueSymbols: string[] = [];
    for (const sym of rawSymbols) {
      if (sym === "vector") {
        if (vectorCount > 1 && !seen.has("vector")) {
          uniqueSymbols.push("vector");
          seen.add("vector");
        }
        // Otherwise, skip "vector" if it occurred only once or if already added.
      } else {
        if (!seen.has(sym)) {
          uniqueSymbols.push(sym);
          seen.add(sym);
        }
      }
    }

    return uniqueSymbols;
  }
  

/**
 * Extract exports from JavaScript files
 */
function extractJavaScriptExports(jsText: string): string[] {
    const exports: string[] = [];
    
    try {
        // Handle different export patterns
        
        // Named exports: export const foo = ...
        const namedExportRegex = /export\s+(const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let match;
        while ((match = namedExportRegex.exec(jsText)) !== null) {
            exports.push(match[2]);
        }
        
        // Default export: export default function foo() or export default foo
        const defaultExportFnRegex = /export\s+default\s+(?:function\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)/;
        const defaultMatch = jsText.match(defaultExportFnRegex);
        if (defaultMatch) {
            exports.push(defaultMatch[1]);
            exports.push('default'); // Also add 'default' as an option
        }
        
        // module.exports = { foo, bar }
        const moduleExportsRegex = /module\.exports\s*=\s*{([^}]*)}/;
        const moduleExportsMatch = jsText.match(moduleExportsRegex);
        if (moduleExportsMatch) {
            const exportsText = moduleExportsMatch[1];
            const exportItems = exportsText.split(',').map(item => {
                // Handle both foo: bar and foo
                const colonMatch = item.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
                if (colonMatch) {
                    return colonMatch[1].trim();
                }
                return item.trim();
            }).filter(Boolean);
            
            exports.push(...exportItems);
        }
        
        // Handle exports.foo = ...
        const exportsPropertyRegex = /exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
        while ((match = exportsPropertyRegex.exec(jsText)) !== null) {
            exports.push(match[1]);
        }
        
    } catch (error) {
        console.error(`Error extracting JS exports: ${error}`);
    }
    
    return exports;
}

/**
 * Extract filename from a path (without extension)
 */
function extractFilename(path: string): string {
    const parts = path.split('/');
    const filenameWithExtension = parts[parts.length - 1];
    const filenameWithoutExtension = filenameWithExtension.split('.')[0];
    return filenameWithoutExtension;
}