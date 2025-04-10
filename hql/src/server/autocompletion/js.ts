import {
    Position,
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    CompletionParams,
    InsertTextFormat,
    Range
} from 'vscode-languageserver';

  export function getJavaScriptObjectCompletions(objectName: string): CompletionItem[] {
    // Define common JavaScript objects and their members
    const jsObjects: Record<string, Array<{ name: string, kind: CompletionItemKind, detail: string }>> = {
      // Console object
      'console': [
        { name: 'log', kind: CompletionItemKind.Method, detail: 'Log messages to the console' },
        { name: 'error', kind: CompletionItemKind.Method, detail: 'Output error messages to the console' },
        { name: 'warn', kind: CompletionItemKind.Method, detail: 'Output warning messages to the console' },
        { name: 'info', kind: CompletionItemKind.Method, detail: 'Output informational messages to the console' },
        { name: 'debug', kind: CompletionItemKind.Method, detail: 'Output debug messages to the console' },
        { name: 'trace', kind: CompletionItemKind.Method, detail: 'Output a stack trace to the console' },
        { name: 'time', kind: CompletionItemKind.Method, detail: 'Start a timer' },
        { name: 'timeEnd', kind: CompletionItemKind.Method, detail: 'End a timer and output elapsed time' },
        { name: 'count', kind: CompletionItemKind.Method, detail: 'Count number of times this is called' }
      ],
      
      // Math object
      'Math': [
        { name: 'abs', kind: CompletionItemKind.Method, detail: 'Absolute value of a number' },
        { name: 'ceil', kind: CompletionItemKind.Method, detail: 'Round up to the nearest integer' },
        { name: 'floor', kind: CompletionItemKind.Method, detail: 'Round down to the nearest integer' },
        { name: 'max', kind: CompletionItemKind.Method, detail: 'Return the largest of zero or more numbers' },
        { name: 'min', kind: CompletionItemKind.Method, detail: 'Return the smallest of zero or more numbers' },
        { name: 'pow', kind: CompletionItemKind.Method, detail: 'Return base to the exponent power' },
        { name: 'random', kind: CompletionItemKind.Method, detail: 'Return a random number between 0 and 1' },
        { name: 'round', kind: CompletionItemKind.Method, detail: 'Round to the nearest integer' },
        { name: 'sqrt', kind: CompletionItemKind.Method, detail: 'Square root of a number' },
        { name: 'PI', kind: CompletionItemKind.Constant, detail: 'Ratio of circumference to diameter of a circle' },
        { name: 'E', kind: CompletionItemKind.Constant, detail: 'Euler\'s number' }
      ],
      
      // String prototype methods
      'String': [
        { name: 'length', kind: CompletionItemKind.Property, detail: 'Length of the string' },
        { name: 'charAt', kind: CompletionItemKind.Method, detail: 'Return character at specified index' },
        { name: 'concat', kind: CompletionItemKind.Method, detail: 'Concatenate strings' },
        { name: 'indexOf', kind: CompletionItemKind.Method, detail: 'Find index of first occurrence' },
        { name: 'lastIndexOf', kind: CompletionItemKind.Method, detail: 'Find index of last occurrence' },
        { name: 'match', kind: CompletionItemKind.Method, detail: 'Match string against regular expression' },
        { name: 'replace', kind: CompletionItemKind.Method, detail: 'Replace matches with new substring' },
        { name: 'slice', kind: CompletionItemKind.Method, detail: 'Extract a section of a string' },
        { name: 'split', kind: CompletionItemKind.Method, detail: 'Split string into array of substrings' },
        { name: 'substring', kind: CompletionItemKind.Method, detail: 'Return part of the string' },
        { name: 'toLowerCase', kind: CompletionItemKind.Method, detail: 'Convert to lowercase' },
        { name: 'toUpperCase', kind: CompletionItemKind.Method, detail: 'Convert to uppercase' },
        { name: 'trim', kind: CompletionItemKind.Method, detail: 'Remove whitespace from start and end' }
      ],
      
      // Array prototype methods
      'Array': [
        { name: 'length', kind: CompletionItemKind.Property, detail: 'Number of elements' },
        { name: 'concat', kind: CompletionItemKind.Method, detail: 'Merge two or more arrays' },
        { name: 'filter', kind: CompletionItemKind.Method, detail: 'Create new array with elements that pass test' },
        { name: 'find', kind: CompletionItemKind.Method, detail: 'Return first element that satisfies test' },
        { name: 'forEach', kind: CompletionItemKind.Method, detail: 'Execute function for each element' },
        { name: 'includes', kind: CompletionItemKind.Method, detail: 'Check if array includes element' },
        { name: 'indexOf', kind: CompletionItemKind.Method, detail: 'Find index of first occurrence' },
        { name: 'join', kind: CompletionItemKind.Method, detail: 'Join elements into string' },
        { name: 'map', kind: CompletionItemKind.Method, detail: 'Create new array with results of callback' },
        { name: 'pop', kind: CompletionItemKind.Method, detail: 'Remove last element and return it' },
        { name: 'push', kind: CompletionItemKind.Method, detail: 'Add elements to end of array' },
        { name: 'reduce', kind: CompletionItemKind.Method, detail: 'Reduce array to single value' },
        { name: 'slice', kind: CompletionItemKind.Method, detail: 'Return shallow copy of portion of array' },
        { name: 'sort', kind: CompletionItemKind.Method, detail: 'Sort elements of array' }
      ],
      
      // Date object
      'Date': [
        { name: 'getDate', kind: CompletionItemKind.Method, detail: 'Get day of the month' },
        { name: 'getDay', kind: CompletionItemKind.Method, detail: 'Get day of the week' },
        { name: 'getFullYear', kind: CompletionItemKind.Method, detail: 'Get year' },
        { name: 'getHours', kind: CompletionItemKind.Method, detail: 'Get hour' },
        { name: 'getMinutes', kind: CompletionItemKind.Method, detail: 'Get minutes' },
        { name: 'getMonth', kind: CompletionItemKind.Method, detail: 'Get month' },
        { name: 'getSeconds', kind: CompletionItemKind.Method, detail: 'Get seconds' },
        { name: 'getTime', kind: CompletionItemKind.Method, detail: 'Get timestamp (milliseconds since epoch)' },
        { name: 'now', kind: CompletionItemKind.Method, detail: 'Return current timestamp' },
        { name: 'toISOString', kind: CompletionItemKind.Method, detail: 'Convert to ISO format string' },
        { name: 'toDateString', kind: CompletionItemKind.Method, detail: 'Convert to date string' },
        { name: 'toTimeString', kind: CompletionItemKind.Method, detail: 'Convert to time string' }
      ]
    };
    
    // Check if object name is a known JavaScript object
    if (objectName in jsObjects) {
      const members = jsObjects[objectName];
      
      // Convert to completion items
      return members.map(member => {
        const fullMethodName = `${objectName}.${member.name}`;
        
        if (member.kind === CompletionItemKind.Method) {
          // For methods, add LISP-style parentheses
          // Special handling for console methods
          if (objectName === 'console' && 
              (member.name === 'log' || member.name === 'error' || 
               member.name === 'warn' || member.name === 'info' || 
               member.name === 'debug' || member.name === 'trace')) {
            return {
              label: member.name,
              kind: member.kind,
              detail: `${fullMethodName} - ${member.detail}`,
              documentation: {
                kind: MarkupKind.Markdown,
                value: `\`${fullMethodName}\`\n\n${member.detail}`
              },
              insertText: `(${fullMethodName} "\${1}")`,
              insertTextFormat: InsertTextFormat.Snippet,
              sortText: `10-${member.name}`
            };
          } else {
            return {
              label: member.name,
              kind: member.kind,
              detail: `${fullMethodName} - ${member.detail}`,
              documentation: {
                kind: MarkupKind.Markdown,
                value: `\`${fullMethodName}\`\n\n${member.detail}`
              },
              insertText: `(${fullMethodName} \${0})`,
              insertTextFormat: InsertTextFormat.Snippet,
              sortText: `10-${member.name}`
            };
          }
        } else {
          // For properties and constants
          return {
            label: member.name,
            kind: member.kind,
            detail: `${fullMethodName} - ${member.detail}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `\`${fullMethodName}\`\n\n${member.detail}`
            },
            insertText: fullMethodName,
            sortText: `10-${member.name}`
          };
        }
      });
    }
    
    return [];
  }