import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat
} from 'vscode-languageserver';

/**
 * Get conditional completions
 */
export function getConditionalCompletions(): CompletionItem[] {
  return [
    {
      label: 'if',
      kind: CompletionItemKind.Snippet,
      detail: 'Simple if expression',
      insertText: '(if ${1:condition}\n  ${2:then-expr}\n  ${3:else-expr})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Simple conditional branching'
      }
    },
    {
      label: 'if-with-do',
      kind: CompletionItemKind.Snippet,
      detail: 'If with multiple expressions',
      insertText: '(if ${1:condition}\n  (do\n    ${2:then-expr1}\n    ${3:then-expr2})\n  (do\n    ${4:else-expr1}\n    ${5:else-expr2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Conditional with multiple expressions in each branch'
      }
    },
    {
      label: 'when',
      kind: CompletionItemKind.Snippet,
      detail: 'When expression',
      insertText: '(when ${1:condition}\n  ${2:expr1}\n  ${3:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute expressions only when condition is true'
      }
    },
    {
      label: 'unless',
      kind: CompletionItemKind.Snippet,
      detail: 'Unless expression',
      insertText: '(unless ${1:condition}\n  ${2:expr1}\n  ${3:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute expressions only when condition is false'
      }
    },
    {
      label: 'cond',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional expression',
      insertText: '(cond\n  ((${1:condition1}) ${2:result1})\n  ((${3:condition2}) ${4:result2})\n  ((else) ${5:default-result}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Multi-way conditional expression'
      }
    },
    {
      label: 'cond-with-do',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional with multiple expressions',
      insertText: '(cond\n  ((${1:condition1}) (do\n    ${2:expr1}\n    ${3:expr2}))\n  ((${4:condition2}) (do\n    ${5:expr3}\n    ${6:expr4}))\n  ((else) (do\n    ${7:expr5}\n    ${8:expr6})))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Multi-way conditional with multiple expressions in each branch'
      }
    },
    {
      label: 'if-let',
      kind: CompletionItemKind.Snippet,
      detail: 'If-let binding',
      insertText: '(if-let [${1:name} ${2:value}]\n  ${3:then-expr}\n  ${4:else-expr})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and branch based on whether it\'s truthy'
      }
    },
    {
      label: 'when-let',
      kind: CompletionItemKind.Snippet,
      detail: 'When-let binding',
      insertText: '(when-let [${1:name} ${2:value}]\n  ${3:expr1}\n  ${4:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and execute body only when the value is truthy'
      }
    }
  ];
}

/**
 * Get loop completions
 */
export function getLoopCompletions(): CompletionItem[] {
  return [
    {
      label: 'loop-basic',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic loop with counter',
      insertText: '(loop (${1:i} ${2:0})\n  (if (< ${1:i} ${3:10})\n    (do\n      ${4:body}\n      (recur (+ ${1:i} 1)))\n    ${5:result}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Basic loop with counter variable'
      }
    },
    {
      label: 'loop-accumulator',
      kind: CompletionItemKind.Snippet,
      detail: 'Loop with accumulator',
      insertText: '(loop (${1:i} ${2:0} ${3:sum} ${4:0})\n  (if (< ${1:i} ${5:10})\n    (recur (+ ${1:i} 1) (+ ${3:sum} ${1:i}))\n    ${3:sum}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Loop that builds up a result in an accumulator'
      }
    },
    {
      label: 'loop-collection',
      kind: CompletionItemKind.Snippet,
      detail: 'Loop over collection',
      insertText: '(loop (${1:items} ${2:collection} ${3:result} [])\n  (if (empty? ${1:items})\n    ${3:result}\n    (recur (rest ${1:items}) (conj ${3:result} (first ${1:items})))))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Loop that processes items in a collection'
      }
    },
    {
      label: 'while',
      kind: CompletionItemKind.Snippet,
      detail: 'While loop',
      insertText: '(while ${1:condition}\n  ${2:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute body while condition is true'
      }
    },
    {
      label: 'while-counter',
      kind: CompletionItemKind.Snippet,
      detail: 'While loop with counter',
      insertText: '(let [${1:i} ${2:0}]\n  (while (< ${1:i} ${3:10})\n    ${4:body}\n    (set! ${1:i} (+ ${1:i} 1))))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'While loop with a counter variable'
      }
    },
    {
      label: 'for-basic',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic for loop',
      insertText: '(for [${1:i} (range ${2:10})]\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Basic for loop using range'
      }
    },
    {
      label: 'for-range',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with specific range',
      insertText: '(for [${1:i} (range ${2:1} ${3:10} ${4:1})]\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'For loop with start, end, and step values'
      }
    },
    {
      label: 'for-collection',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop over collection',
      insertText: '(for [${1:item} ${2:items}]\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'For loop that iterates over items in a collection'
      }
    },
    {
      label: 'for-with-let',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with let binding',
      insertText: '(for [${1:i} (range ${2:10})]\n  (let [${3:value} (* ${1:i} 2)]\n    ${4:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'For loop with local bindings in each iteration'
      }
    },
    {
      label: 'repeat',
      kind: CompletionItemKind.Snippet,
      detail: 'Repeat n times',
      insertText: '(repeat ${1:10}\n  ${2:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Repeat an expression a fixed number of times'
      }
    },
    {
      label: 'recur',
      kind: CompletionItemKind.Snippet,
      detail: 'Recursive call',
      insertText: '(recur ${1:updated-values})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Tail-recursive call within a loop'
      }
    },
    {
      label: 'doseq',
      kind: CompletionItemKind.Snippet,
      detail: 'Sequence iteration',
      insertText: '(doseq [${1:item} ${2:items}]\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Iterate over a sequence for side effects'
      }
    }
  ];
}

/**
 * Get do/block completions
 */
export function getBlockCompletions(): CompletionItem[] {
  return [
    {
      label: 'do',
      kind: CompletionItemKind.Snippet,
      detail: 'Do block',
      insertText: '(do\n  ${1:expr1}\n  ${2:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute multiple expressions in sequence'
      }
    },
    {
      label: 'do-let',
      kind: CompletionItemKind.Snippet,
      detail: 'Do block with let binding',
      insertText: '(do\n  (let [${1:name} ${2:value}]\n    ${3:expr1}\n    ${4:expr2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute multiple expressions with local bindings'
      }
    },
    {
      label: 'let',
      kind: CompletionItemKind.Snippet,
      detail: 'Let binding',
      insertText: '(let [${1:name} ${2:value}]\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create local bindings'
      }
    },
    {
      label: 'let-multi',
      kind: CompletionItemKind.Snippet,
      detail: 'Multiple let bindings',
      insertText: '(let [${1:name1} ${2:value1}\n      ${3:name2} ${4:value2}]\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create multiple local bindings'
      }
    }
  ];
}

/**
 * Get branching and exception handling completions
 */
export function getBranchingCompletions(): CompletionItem[] {
  return [
    {
      label: 'try-catch',
      kind: CompletionItemKind.Snippet,
      detail: 'Try-catch block',
      insertText: '(try\n  ${1:body}\n  (catch ${2:Error} ${3:e}\n    ${4:handler}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Handle exceptions with try-catch'
      }
    },
    {
      label: 'try-catch-finally',
      kind: CompletionItemKind.Snippet,
      detail: 'Try-catch-finally block',
      insertText: '(try\n  ${1:body}\n  (catch ${2:Error} ${3:e}\n    ${4:handler})\n  (finally\n    ${5:cleanup}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Handle exceptions with cleanup code'
      }
    },
    {
      label: 'throw',
      kind: CompletionItemKind.Snippet,
      detail: 'Throw exception',
      insertText: '(throw (new ${1:Error} ${2:"Error message"}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Throw an exception'
      }
    },
    {
      label: 'case',
      kind: CompletionItemKind.Snippet,
      detail: 'Case expression',
      insertText: '(case ${1:expr}\n  ${2:value1} ${3:result1}\n  ${4:value2} ${5:result2}\n  ${6:default-result})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Pattern matching with case'
      }
    }
  ];
} 