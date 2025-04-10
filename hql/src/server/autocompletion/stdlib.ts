import {
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    InsertTextFormat,
  } from 'vscode-languageserver';


/**
   * Provide standard library function completions
   */
  export function getStdLibCompletions(prefix: string): CompletionItem[] {
    const stdLibItems = [
      // Core functions
      { name: 'print', kind: CompletionItemKind.Function, detail: 'Print to standard output' },
      { name: 'println', kind: CompletionItemKind.Function, detail: 'Print to standard output with newline' },
      { name: 'str', kind: CompletionItemKind.Function, detail: 'Convert to string' },
      { name: 'concat', kind: CompletionItemKind.Function, detail: 'Concatenate strings or collections' },
      
      // Console functions
      { name: 'console.log', kind: CompletionItemKind.Function, detail: 'Log to console' },
      { name: 'console.error', kind: CompletionItemKind.Function, detail: 'Log error to console' },
      { name: 'console.warn', kind: CompletionItemKind.Function, detail: 'Log warning to console' },
      { name: 'console.info', kind: CompletionItemKind.Function, detail: 'Log info to console' },
      { name: 'console.debug', kind: CompletionItemKind.Function, detail: 'Log debug to console' },
      
      // Math functions
      { name: 'Math.abs', kind: CompletionItemKind.Function, detail: 'Absolute value of a number' },
      { name: 'Math.min', kind: CompletionItemKind.Function, detail: 'Minimum of values' },
      { name: 'Math.max', kind: CompletionItemKind.Function, detail: 'Maximum of values' },
      { name: 'Math.floor', kind: CompletionItemKind.Function, detail: 'Round down to nearest integer' },
      { name: 'Math.ceil', kind: CompletionItemKind.Function, detail: 'Round up to nearest integer' },
      { name: 'Math.round', kind: CompletionItemKind.Function, detail: 'Round to nearest integer' },
      { name: 'Math.random', kind: CompletionItemKind.Function, detail: 'Random value between 0 and 1' },
      
      // Collection functions
      { name: 'map', kind: CompletionItemKind.Function, detail: 'Transform each element in a collection' },
      { name: 'filter', kind: CompletionItemKind.Function, detail: 'Filter elements in a collection' },
      { name: 'reduce', kind: CompletionItemKind.Function, detail: 'Reduce collection to a single value' },
      { name: 'forEach', kind: CompletionItemKind.Function, detail: 'Execute for each element in a collection' },
      { name: 'get', kind: CompletionItemKind.Function, detail: 'Get element by key or index' },
      { name: 'contains?', kind: CompletionItemKind.Function, detail: 'Check if collection contains value' },
      { name: 'empty?', kind: CompletionItemKind.Function, detail: 'Check if collection is empty' },
      { name: 'count', kind: CompletionItemKind.Function, detail: 'Count elements in a collection' },
      { name: 'range', kind: CompletionItemKind.Function, detail: 'Generate a range of numbers' },
      
      // Control flow keywords
      { name: 'if', kind: CompletionItemKind.Keyword, detail: 'Conditional expression' },
      { name: 'when', kind: CompletionItemKind.Keyword, detail: 'Conditional execution when true' },
      { name: 'unless', kind: CompletionItemKind.Keyword, detail: 'Conditional execution when false' },
      { name: 'cond', kind: CompletionItemKind.Keyword, detail: 'Multi-way conditional' },
      { name: 'do', kind: CompletionItemKind.Keyword, detail: 'Sequential execution block' },
      { name: 'let', kind: CompletionItemKind.Keyword, detail: 'Bind local variables' },
      { name: 'loop', kind: CompletionItemKind.Keyword, detail: 'Loop with recur' },
      { name: 'recur', kind: CompletionItemKind.Keyword, detail: 'Loop recursion point' },
      { name: 'for', kind: CompletionItemKind.Keyword, detail: 'Iterative loop' },
      { name: 'while', kind: CompletionItemKind.Keyword, detail: 'While loop' },
      { name: 'repeat', kind: CompletionItemKind.Keyword, detail: 'Repeat n times' },
      
      // Data structure literals
      { name: 'vector', kind: CompletionItemKind.Snippet, detail: 'Create a vector [1, 2, 3]' },
      { name: 'vector-empty', kind: CompletionItemKind.Snippet, detail: 'Create an empty vector []' },
      { name: 'vector-numbers', kind: CompletionItemKind.Snippet, detail: 'Create a vector with numbers [1, 2, 3, 4, 5]' },
      { name: 'vector-strings', kind: CompletionItemKind.Snippet, detail: 'Create a vector with strings ["item1", "item2", "item3"]' },
      { name: 'list', kind: CompletionItemKind.Snippet, detail: 'Create a list \'(1 2 3)' },
      { name: 'list-empty', kind: CompletionItemKind.Snippet, detail: 'Create an empty list \'()' },
      { name: 'list-numbers', kind: CompletionItemKind.Snippet, detail: 'Create a list with numbers \'(1 2 3 4 5)' },
      { name: 'list-strings', kind: CompletionItemKind.Snippet, detail: 'Create a list with strings \'("item1" "item2" "item3")' },
      { name: 'set', kind: CompletionItemKind.Snippet, detail: 'Create a set #[1, 2, 3]' },
      { name: 'set-empty', kind: CompletionItemKind.Snippet, detail: 'Create an empty set #[]' },
      { name: 'set-numbers', kind: CompletionItemKind.Snippet, detail: 'Create a set with numbers #[1, 2, 3, 4, 5]' },
      { name: 'set-strings', kind: CompletionItemKind.Snippet, detail: 'Create a set with strings #["apple", "banana", "cherry"]' },
      { name: 'map', kind: CompletionItemKind.Snippet, detail: 'Create a map {"key": "value"}' },
      { name: 'map-empty', kind: CompletionItemKind.Snippet, detail: 'Create an empty map {}' },
      { name: 'map-string-keys', kind: CompletionItemKind.Snippet, detail: 'Create a map with string keys {"name": "John", "age": 30}' },
      { name: 'map-keyword-keys', kind: CompletionItemKind.Snippet, detail: 'Create a map with keyword keys {:host "localhost", :port 8080}' },
      { name: 'json', kind: CompletionItemKind.Snippet, detail: 'Create a JSON-like map {"key": "value"}' },
      { name: 'object', kind: CompletionItemKind.Snippet, detail: 'Create an object-like map {"key": "value"}' },
    ];
    
    // Define the type for the standard library items to help TypeScript
    type StdLibItem = {
      name: string;
      kind: CompletionItemKind;
      detail: string;
    };
    
    // Filter by prefix if provided
    const filtered = stdLibItems.filter(item => 
      !prefix || item.name.toLowerCase().includes(prefix.toLowerCase())
    );
    
    // Convert to completion items
    const completions = filtered.map((item: StdLibItem) => {
      // For data structure snippets, provide direct snippet without function call wrapping
      if (item.name.startsWith('vector') || 
          item.name.startsWith('list') || 
          item.name.startsWith('set') || 
          item.name.startsWith('map') ||
          item.name === 'json' ||
          item.name === 'object') {
        
        let snippetText = '';
        
        switch(item.name) {
          case 'vector':
            snippetText = '[${1:1}, ${2:2}, ${3:3}]';
            break;
          case 'vector-empty':
            snippetText = '[]';
            break;
          case 'vector-numbers':
            snippetText = '[1, 2, 3, 4, 5]';
            break;
          case 'vector-strings':
            snippetText = '["item1", "item2", "item3"]';
            break;
          case 'list':
            snippetText = '\'(${1:1} ${2:2} ${3:3})';
            break;
          case 'list-empty':
            snippetText = '\'()';
            break;
          case 'list-numbers':
            snippetText = '\'(1 2 3 4 5)';
            break;
          case 'list-strings':
            snippetText = '\'("item1" "item2" "item3")';
            break;
          case 'set':
            snippetText = '#[${1:1}, ${2:2}, ${3:3}]';
            break;
          case 'set-empty':
            snippetText = '#[]';
            break;
          case 'set-numbers':
            snippetText = '#[1, 2, 3, 4, 5]';
            break;
          case 'set-strings':
            snippetText = '#["apple", "banana", "cherry"]';
            break;
          case 'map':
          case 'json':
          case 'object':
            snippetText = '{${1:"key"}: ${2:"value"}}';
            break;
          case 'map-empty':
            snippetText = '{}';
            break;
          case 'map-string-keys':
            snippetText = '{"name": "John", "age": 30, "active": true}';
            break;
          case 'map-keyword-keys':
            snippetText = '{:host "localhost", :port 8080, :secure true}';
            break;
          default:
            snippetText = item.name;
        }
        
        return {
          label: item.name,
          kind: item.kind,
          detail: item.detail,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${item.name}\` - ${item.detail}`
          },
          insertText: snippetText,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `01-${item.name}` // High priority for standard library items
        };
      }
      // For function/method items, provide them with parentheses for LISP syntax
      if (item.kind === CompletionItemKind.Function) {
        // Special handling for print and console.log
        if (item.name === 'print' || item.name === 'println' || item.name === 'console.log' || 
            item.name === 'console.error' || item.name === 'console.warn' || 
            item.name === 'console.info' || item.name === 'console.debug') {
          return {
            label: item.name,
            kind: item.kind,
            detail: item.detail,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `\`${item.name}\` - ${item.detail}`
            },
            // Position cursor between quotes for easier input
            insertText: `(${item.name} "\${1}")`,
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: `01-${item.name}` // High priority for standard library items
          };
        } else {
          return {
            label: item.name,
            kind: item.kind,
            detail: item.detail,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `\`${item.name}\` - ${item.detail}`
            },
            // Add parentheses and position cursor for argument
            insertText: `(${item.name} \${0})`,
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: `01-${item.name}` // High priority for standard library items
          };
        }
      } else {
        // For keywords and other types
        return {
          label: item.name,
          kind: item.kind,
          detail: item.detail,
          documentation: {
            kind: MarkupKind.Markdown,
            value: `\`${item.name}\` - ${item.detail}`
          },
          // Keywords typically start expressions and may need parens based on context
          insertText: item.kind === CompletionItemKind.Keyword ? `(${item.name} \${0})` : item.name,
          insertTextFormat: item.kind === CompletionItemKind.Keyword ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
          sortText: `01-${item.name}` // High priority for standard library items
        };
      }
    });

    // Include match type in sortText if there's a word
    if (prefix) {
      const wordLower = prefix.toLowerCase();
      
      for (const item of completions) {
        const label = item.label.toLowerCase();
        const originalSortText = item.sortText || item.label;
        
        // Already has priority prefix (e.g., "20-functionName") - keep the original prefix
        const sortPrefix = originalSortText.includes('-') ? 
          originalSortText.split('-')[0] : '99';
          
        // Add match type to sort text: 1=prefix, 2=suffix, 3=fuzzy
        if (label.startsWith(wordLower)) {
          // Prefix match (highest priority)
          item.sortText = `${sortPrefix}-1-${item.label}`;
        } else if (label.endsWith(wordLower)) {
          // Suffix match (medium priority)
          item.sortText = `${sortPrefix}-2-${item.label}`;
        } else {
          // Fuzzy match (lowest priority)
          item.sortText = `${sortPrefix}-3-${item.label}`;
        }
      }
    }

    return completions;
  }