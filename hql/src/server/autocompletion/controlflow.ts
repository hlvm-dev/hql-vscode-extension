import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat
} from 'vscode-languageserver';

/**
 * Get repeat loop completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getRepeatCompletions(): CompletionItem[] {
  return [
    {
      label: 'repeat',
      kind: CompletionItemKind.Snippet,
      detail: 'Repeat n times',
      insertText: '(repeat ${1:count}\n  ${2:expression})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Repeats an expression a specific number of times without requiring an index variable.\n\n```lisp\n(repeat 3\n  (print "Hello, world!"))\n```'
      }
    },
    {
      label: 'repeat-multiple',
      kind: CompletionItemKind.Snippet,
      detail: 'Repeat with multiple expressions',
      insertText: '(repeat ${1:count}\n  ${2:expression1}\n  ${3:expression2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Repeats multiple expressions a specific number of times.\n\n```lisp\n(repeat 2\n  (print "First line")\n  (print "Second line"))\n```'
      }
    }
  ];
}

/**
 * Get for loop completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getForLoopCompletions(): CompletionItem[] {
  return [
    {
      label: 'for-simple',
      kind: CompletionItemKind.Snippet,
      detail: 'Simple for loop with count',
      insertText: '(for (${1:i} ${2:5})\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Iterates from 0 to count-1.\n\n```lisp\n(for (i 5)\n  (print i))\n```'
      }
    },
    {
      label: 'for-range',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with start and end',
      insertText: '(for (${1:i} ${2:1} ${3:10})\n  ${4:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Iterates from start to end-1.\n\n```lisp\n(for (i 1 10)\n  (print i))\n```'
      }
    },
    {
      label: 'for-range-step',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with start, end, and step',
      insertText: '(for (${1:i} ${2:0} ${3:10} ${4:2})\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Iterates from start to end-1 with custom step size.\n\n```lisp\n(for (i 0 10 2)\n  (print i))\n```'
      }
    },
    {
      label: 'for-named-to',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with named "to" parameter',
      insertText: '(for (${1:i} to: ${2:10})\n  ${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Named parameter style: iterates from 0 to end-1.\n\n```lisp\n(for (i to: 10)\n  (print i))\n```'
      }
    },
    {
      label: 'for-named-from-to',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with named "from" and "to" parameters',
      insertText: '(for (${1:i} from: ${2:1} to: ${3:10})\n  ${4:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Named parameter style: iterates from start to end-1.\n\n```lisp\n(for (i from: 1 to: 10)\n  (print i))\n```'
      }
    },
    {
      label: 'for-named-full',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with all named parameters',
      insertText: '(for (${1:i} from: ${2:0} to: ${3:10} by: ${4:2})\n  ${5:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Named parameter style: iterates from start to end-1 with custom step size.\n\n```lisp\n(for (i from: 0 to: 10 by: 2)\n  (print i))\n```'
      }
    },
    {
      label: 'for-named-to-by',
      kind: CompletionItemKind.Snippet,
      detail: 'For loop with named "to" and "by" parameters',
      insertText: '(for (${1:i} to: ${2:10} by: ${3:2})\n  ${4:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Named parameter style: iterates from 0 to end-1 with custom step size.\n\n```lisp\n(for (i to: 10 by: 2)\n  (print i))\n```'
      }
    }
  ];
}

/**
 * Get while loop completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getWhileLoopCompletions(): CompletionItem[] {
  return [
    {
      label: 'while',
      kind: CompletionItemKind.Snippet,
      detail: 'Simple while loop',
      insertText: '(while ${1:condition}\n  ${2:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Executes body repeatedly while condition is true.\n\n```lisp\n(while (< count 3)\n  (print "Iteration:" count)\n  (set! count (+ count 1)))\n```'
      }
    },
    {
      label: 'while-with-counter',
      kind: CompletionItemKind.Snippet,
      detail: 'While loop with counter',
      insertText: '(var ${1:count} ${2:0})\n(while (< ${1:count} ${3:max})\n  ${4:body}\n  (set! ${1:count} (+ ${1:count} 1)))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'While loop pattern with a counter variable.\n\n```lisp\n(var count 0)\n(while (< count 3)\n  (print "Iteration:" count)\n  (set! count (+ count 1)))\n```'
      }
    }
  ];
}

/**
 * Get cond completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getCondCompletions(): CompletionItem[] {
  return [
    {
      label: 'cond',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic conditional',
      insertText: '(cond\n  ((${1:condition1}) ${2:result1})\n  ((${3:condition2}) ${4:result2})\n  (else ${5:default-result}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Multi-way conditional expression.\n\n```lisp\n(cond\n  ((> n 100) "large")\n  ((> n 50) "medium")\n  (else "small"))\n```'
      }
    },
    {
      label: 'cond-with-do',
      kind: CompletionItemKind.Snippet,
      detail: 'Conditional with multiple expressions',
      insertText: '(cond\n  ((${1:condition1}) (do\n    ${2:expr1}\n    ${3:expr2}))\n  ((${4:condition2}) (do\n    ${5:expr3}\n    ${6:expr4}))\n  (else (do\n    ${7:expr5}\n    ${8:expr6})))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Multi-way conditional with multiple expressions in each branch.\n\n```lisp\n(cond\n  ((< x 0) (do\n    (print "Negative")\n    (* x -1)))\n  (else x))\n```'
      }
    }
  ];
}

/**
 * Get when/unless completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getWhenUnlessCompletions(): CompletionItem[] {
  return [
    {
      label: 'when',
      kind: CompletionItemKind.Snippet,
      detail: 'When expression',
      insertText: '(when ${1:condition}\n  ${2:expr1}\n  ${3:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute expressions only when condition is true.\n\n```lisp\n(when (> x 5)\n  (print "x is greater than 5")\n  (set! x 5))\n```'
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
        value: 'Execute expressions only when condition is false.\n\n```lisp\n(unless (< x 5)\n  (print "x is not less than 5")\n  (set! x 5))\n```'
      }
    }
  ];
}

/**
 * Get loop/recur completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getLoopRecurCompletions(): CompletionItem[] {
  return [
    {
      label: 'loop-recur',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic loop/recur pattern',
      insertText: '(loop (${1:i} ${2:0})\n  (when (< ${1:i} ${3:max})\n    ${4:body}\n    (recur (+ ${1:i} 1))))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'The fundamental loop/recur mechanism with a counter.\n\n```lisp\n(loop (i 0)\n  (when (< i 3)\n    (print "Iteration:" i)\n    (recur (+ i 1))))\n```'
      }
    },
    {
      label: 'loop-recur-accumulator',
      kind: CompletionItemKind.Snippet,
      detail: 'Loop with accumulator',
      insertText: '(loop (${1:i} ${2:0} ${3:acc} ${4:initial})\n  (if (< ${1:i} ${5:max})\n    (recur (+ ${1:i} 1) (${6:operation} ${3:acc} ${1:i}))\n    ${3:acc}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Loop pattern with a counter and accumulator.\n\n```lisp\n(loop (i 0 sum 0)\n  (if (< i 5)\n    (recur (+ i 1) (+ sum i))\n    sum))\n```'
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
        value: 'Used for tail-recursive calls within a loop construct.\n\n```lisp\n(recur (+ i 1))\n```'
      }
    }
  ];
}

/**
 * Get if-let and when-let completions
 * Based on actual HQL syntax from examples/documentation
 */
export function getLetBindingControlCompletions(): CompletionItem[] {
  return [
    {
      label: 'if-let',
      kind: CompletionItemKind.Snippet,
      detail: 'If-let binding',
      insertText: '(if-let (${1:name} ${2:value})\n  ${3:then-expr}\n  ${4:else-expr})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and branch based on whether it\'s truthy.\n\n```lisp\n(if-let (x (get-number))\n  (str "Got number: " x)\n  "No number")\n```'
      }
    },
    {
      label: 'when-let',
      kind: CompletionItemKind.Snippet,
      detail: 'When-let binding',
      insertText: '(when-let (${1:name} ${2:value})\n  ${3:expr1}\n  ${4:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and execute body only when the value is truthy.\n\n```lisp\n(when-let (x (get-string))\n  (print "Got string: " x)\n  (process-string x))\n```'
      }
    }
  ];
}

/**
 * Get class-related completions
 */
export function getClassCompletions(): CompletionItem[] {
  return [
    {
      label: 'class-declaration',
      kind: CompletionItemKind.Snippet,
      detail: 'Class declaration',
      insertText: '(class ${1:ClassName}\n  ;; Class fields\n  (var ${2:fieldName})\n\n  ;; Constructor\n  (constructor (${3:params})\n    (do\n      (set! this.${2:fieldName} ${3:params})))\n      \n  ;; Method\n  (fn ${4:methodName} (${5:params})\n    ${6:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Declaration of a class with fields, constructor, and methods.'
      }
    },
    {
      label: 'class-instantiation',
      kind: CompletionItemKind.Snippet,
      detail: 'Class instantiation',
      insertText: '(let ${1:instance} (new ${2:ClassName} ${3:params}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create an instance of a class.'
      }
    },
    {
      label: 'method-call',
      kind: CompletionItemKind.Snippet,
      detail: 'Call method on instance',
      insertText: '(${1:instance}.${2:methodName} ${3:params})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Call a method on a class instance.'
      }
    }
  ];
}

/**
 * Get completions for key HQL macros
 */
export function getCoreMacroCompletions(): CompletionItem[] {
  return [
    {
      label: 'or',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical OR',
      insertText: '(or ${1:expr1} ${2:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns the first truthy expression or the last expression.'
      }
    },
    {
      label: 'and',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical AND',
      insertText: '(and ${1:expr1} ${2:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns the first falsy expression or the last expression.'
      }
    },
    {
      label: 'not',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical NOT',
      insertText: '(not ${1:expr})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns the logical negation of the expression.'
      }
    },
    {
      label: 'inc',
      kind: CompletionItemKind.Snippet,
      detail: 'Increment by 1',
      insertText: '(inc ${1:x})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Increments a number by 1.'
      }
    },
    {
      label: 'dec',
      kind: CompletionItemKind.Snippet,
      detail: 'Decrement by 1',
      insertText: '(dec ${1:x})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Decrements a number by 1.'
      }
    },
    {
      label: 'print',
      kind: CompletionItemKind.Snippet,
      detail: 'Print to console',
      insertText: '(print ${1:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Prints arguments to the console.'
      }
    },
    {
      label: 'str',
      kind: CompletionItemKind.Snippet,
      detail: 'Convert to string',
      insertText: '(str ${1:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Concatenates arguments into a string.'
      }
    },
    {
      label: 'empty?',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if collection is empty',
      insertText: '(empty? ${1:coll})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns true if collection is empty or nil.'
      }
    },
    {
      label: 'contains?',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if collection contains key',
      insertText: '(contains? ${1:coll} ${2:key})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns true if collection contains the key.'
      }
    },
    {
      label: 'nth',
      kind: CompletionItemKind.Snippet,
      detail: 'Get element at index',
      insertText: '(nth ${1:coll} ${2:index})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns the element at the specified index in the collection.'
      }
    },
    {
      label: 'list',
      kind: CompletionItemKind.Snippet,
      detail: 'Create a list',
      insertText: '(list ${1:items})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Creates a new list with the given items.'
      }
    },
    {
      label: 'first',
      kind: CompletionItemKind.Snippet,
      detail: 'Get first item',
      insertText: '(first ${1:coll})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns the first item in the collection.'
      }
    },
    {
      label: 'rest',
      kind: CompletionItemKind.Snippet,
      detail: 'Get all items after first',
      insertText: '(rest ${1:coll})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns all items after the first item.'
      }
    }
  ];
} 