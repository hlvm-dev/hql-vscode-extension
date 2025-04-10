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
import { parse, SExp } from '../../parser';
import { isList, isSymbol, isString } from '../../s-exp/types';
import { SymbolManager, ExtendedSymbolInformation } from '../symbolManager';


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
        return getExportableSymbols(document).filter(item => 
            item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())
        );
    }
    
    // Match export vector with continuation: (export [sym1, sym
    const exportContinueMatch = currentLine.match(/export\s+\[.+,\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (exportContinueMatch) {
        const partialSymbol = exportContinueMatch[1];
        
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
        
        // Look for exportable definitions (fn, fx, let, var, enum, etc.)
        for (const expr of expressions) {
            if (isList(expr) && expr.elements.length > 1 && isSymbol(expr.elements[0])) {
                const keyword = expr.elements[0].name;
                
                // Check if this is a definition that can be exported
                if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
                    if (isSymbol(expr.elements[1])) {
                        const symbolName = expr.elements[1].name;
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
                        
                        // Add the completion item for the exportable symbol
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
    
    // Match import with vector style syntax: (import [sym
    const importVectorStartMatch = currentLine.match(/import\s+\[\s*([^,\s]*)$/);
    if (importVectorStartMatch) {
        const partialSymbol = importVectorStartMatch[1] || '';
        // Get module path from elsewhere in the text if available
        const modulePath = fullText.match(/import\s+\[[^\]]*\]\s+from\s+["']([^"']+)["']/)?.[1];
        
        if (modulePath) {
            // We're in a vector import with a module path, offer symbols from that module
            return getImportableSymbols(modulePath, workspaceFolders).filter(item => 
                item.label.toLowerCase().startsWith(partialSymbol.toLowerCase())
            );
        }
        return [];
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
        
        // Resolve the module path
        const fullPath = path.join(workspaceRoot, modulePath);
        
        // Check if file exists
        if (!fs.existsSync(fullPath)) {
            return [];
        }
        
        // Read the file
        const moduleText = fs.readFileSync(fullPath, 'utf-8');
        
        // Extract exported symbols from the module
        const exportedSymbols = extractExportedSymbols(moduleText);
        
        // Convert to completion items
        return exportedSymbols.map(symbol => ({
            label: symbol,
            kind: CompletionItemKind.Value,
            detail: `Exported from ${path.basename(modulePath)}`,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `Symbol exported from module \`${modulePath}\``
            },
            data: {
                sourceModule: modulePath
            }
        }));
    } catch (error) {
        console.error(`Error getting importable symbols: ${error}`);
        return [];
    }
}

/**
* Extract exported symbols from a module
*/
export function extractExportedSymbols(moduleText: string): string[] {
    const exportedSymbols: string[] = [];
    
    try {
        // Parse the module text
        const expressions = parse(moduleText, true);
        
        // Look for export forms
        for (const expr of expressions) {
            if (isList(expr) && expr.elements.length > 0) {
                const first = expr.elements[0];
                if (isSymbol(first) && first.name === 'export') {
                    // Check vector export syntax: (export [sym1, sym2, ...])
                    if (expr.elements.length > 1 && isList(expr.elements[1])) {
                        const exportList = expr.elements[1];
                        
                        // Extract symbols from the export list
                        for (const elem of exportList.elements) {
                            if (isSymbol(elem)) {
                                exportedSymbols.push(elem.name);
                            } else if (isList(elem)) {
                                // Handle potential 'as' syntax: (export [[original as alias], ...])
                                // Check if this is an 'as' aliasing expression
                                if (elem.elements.length > 2 && 
                                    isSymbol(elem.elements[0]) && 
                                    isSymbol(elem.elements[1]) && 
                                    elem.elements[1].name === 'as' && 
                                    isSymbol(elem.elements[2])) {
                                        // Add the original name
                                        exportedSymbols.push(elem.elements[0].name);
                                    }
                                }
                            }
                        }
                        // Check legacy string-based export: (export "name" symbol)
                        else if (expr.elements.length > 2 && isString(expr.elements[1]) && isSymbol(expr.elements[2])) {
                            const exportName = expr.elements[1].value;
                            exportedSymbols.push(exportName);
                        }
                    }
                }
                
                // Also look for exportable definitions (fn, fx, let, var, enum, etc.)
                if (isList(expr) && expr.elements.length > 2 && isSymbol(expr.elements[0])) {
                    const keyword = expr.elements[0].name;
                    
                    // Only consider top-level definitions that can be exported
                    if (['fn', 'fx', 'let', 'var', 'enum', 'class', 'struct', 'macro'].includes(keyword)) {
                        if (isSymbol(expr.elements[1])) {
                            const symbolName = expr.elements[1].name;
                            
                            // Only add the symbol if it's not already in the exported list
                            // This way explicitly exported symbols take precedence over inferred exports
                            if (!exportedSymbols.includes(symbolName)) {
                                exportedSymbols.push(symbolName);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error extracting exported symbols: ${error}`);
        }
        
        return exportedSymbols;
    }