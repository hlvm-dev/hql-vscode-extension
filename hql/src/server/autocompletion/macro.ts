import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat
} from 'vscode-languageserver';

/**
 * Get macro definition completions
 */
export function getMacroCompletions(): CompletionItem[] {
  return [
    {
      label: 'defmacro',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a macro',
      insertText: '(defmacro ${1:name} (${2:args})\n  `${3:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a new macro with template substitution'
      }
    },
    {
      label: 'defmacro-with-rest',
      kind: CompletionItemKind.Snippet,
      detail: 'Define a macro with rest parameters',
      insertText: '(defmacro ${1:name} (${2:arg1} & ${3:rest})\n  `${4:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a macro that can accept variable number of arguments'
      }
    },
    {
      label: 'or-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical OR macro',
      insertText: '(defmacro or (a b)\n  `(if ~a ~a ~b))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Standard logical OR macro implementation'
      }
    },
    {
      label: 'and-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical AND macro',
      insertText: '(defmacro and (x y)\n  `(if ~x ~y ~x))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Standard logical AND macro implementation'
      }
    },
    {
      label: 'not-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical NOT macro',
      insertText: '(defmacro not (x)\n  `(if ~x false true))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Standard logical NOT macro implementation'
      }
    },
    {
      label: 'unless-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Unless conditional macro',
      insertText: '(defmacro unless (test & body)\n  `(if ~test\n       nil\n       (do ~@body)))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute body only when test is false'
      }
    },
    {
      label: 'inc-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Increment macro',
      insertText: '(defmacro inc (x)\n  `(+ ~x 1))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Increment a value by 1'
      }
    },
    {
      label: 'dec-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Decrement macro',
      insertText: '(defmacro dec (x)\n  `(- ~x 1))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Decrement a value by 1'
      }
    },
    {
      label: 'when-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'When conditional macro',
      insertText: '(defmacro when (test & body)\n  `(if ~test\n       (do ~@body)\n       nil))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute body only when test is true'
      }
    },
    {
      label: 'when-let-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'When-let binding macro',
      insertText: '(defmacro when-let (binding & body)\n  (let (var-name (first binding)\n        var-value (second binding))\n    `((lambda (~var-name)\n         (when ~var-name\n             ~@body))\n       ~var-value)))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and execute body only when the value is truthy'
      }
    },
    {
      label: 'print-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Print macro',
      insertText: '(defmacro print (& args)\n  `(console.log ~@args))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Print values to the console'
      }
    },
    {
      label: 'cons-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Cons list construction macro',
      insertText: '(defmacro cons (item lst)\n  `(concat (list ~item) ~lst))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Add an item to the beginning of a list'
      }
    },
    {
      label: 'str-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'String concatenation macro',
      insertText: '(defmacro str (& args)\n  (cond\n    ((empty? args) `"")\n    ((= (length args) 1) `(+ "" ~(first args)))\n    (true `(+ ~@args))))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Convert values to strings and concatenate them'
      }
    },
    {
      label: 'empty?-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Empty collection check macro',
      insertText: '(defmacro empty? (coll)\n  `(or (nil? ~coll)\n       (= (length ~coll) 0)))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Check if a collection is empty'
      }
    },
    {
      label: 'contains?-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Collection contains key macro',
      insertText: '(defmacro contains? (coll key)\n  `(js-call ~coll "has" ~key))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Check if a collection contains a key'
      }
    },
    {
      label: 'nth-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Get nth item macro',
      insertText: '(defmacro nth (coll index)\n  `(get ~coll ~index))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the item at the specified index in a collection'
      }
    },
    {
      label: 'if-let-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'If-let binding macro',
      insertText: '(defmacro if-let (binding then-expr else-expr)\n  (let (var-name (first binding)\n        var-value (second binding))\n    `((lambda (~var-name)\n         (if ~var-name\n             ~then-expr\n             ~else-expr))\n       ~var-value)))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Bind a value and branch based on whether it\'s truthy'
      }
    },
    {
      label: 'nil?-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Nil check macro',
      insertText: '(defmacro nil? (x)\n  `(= ~x null))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Check if a value is nil (null)'
      }
    },
    {
      label: 'length-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Collection length macro',
      insertText: '(defmacro length (coll)\n  `(if (= ~coll null)\n       0\n       (js-get ~coll "length")))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the length of a collection'
      }
    },
    {
      label: 'first-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'First element macro',
      insertText: '(defmacro first (coll)\n  `(get ~coll 0))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the first element of a collection'
      }
    },
    {
      label: 'second-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Second element macro',
      insertText: '(defmacro second (coll)\n  `(if (and (not (nil? ~coll)) (> (length ~coll) 1))\n      (nth ~coll 1)\n      nil))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the second element of a collection'
      }
    },
    {
      label: 'rest-macro',
      kind: CompletionItemKind.Snippet,
      detail: 'Collection rest elements macro',
      insertText: '(defmacro rest (coll)\n  `(js-call ~coll "slice" 1))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get all but the first element of a collection'
      }
    }
  ];
}

/**
 * Get macro usage completions
 */
export function getMacroUsageCompletions(): CompletionItem[] {
  return [
    {
      label: 'or',
      kind: CompletionItemKind.Snippet,
      detail: 'Logical OR',
      insertText: '(or ${1:expr1} ${2:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Returns first truthy expr or last expr'
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
        value: 'Returns first falsey expr or last expr'
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
        value: 'Returns true if expr is falsey, false otherwise'
      }
    },
    {
      label: 'unless',
      kind: CompletionItemKind.Snippet,
      detail: 'Unless conditional',
      insertText: '(unless ${1:condition}\n  ${2:expr1}\n  ${3:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute expressions only when condition is false'
      }
    },
    {
      label: 'inc',
      kind: CompletionItemKind.Snippet,
      detail: 'Increment value',
      insertText: '(inc ${1:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Increment a value by 1'
      }
    },
    {
      label: 'dec',
      kind: CompletionItemKind.Snippet,
      detail: 'Decrement value',
      insertText: '(dec ${1:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Decrement a value by 1'
      }
    },
    {
      label: 'when',
      kind: CompletionItemKind.Snippet,
      detail: 'When conditional',
      insertText: '(when ${1:condition}\n  ${2:expr1}\n  ${3:expr2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Execute expressions only when condition is true'
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
    },
    {
      label: 'print',
      kind: CompletionItemKind.Snippet,
      detail: 'Print to console',
      insertText: '(print ${1:value1} ${2:value2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Print values to the console'
      }
    },
    {
      label: 'cons',
      kind: CompletionItemKind.Snippet,
      detail: 'Add item to list',
      insertText: '(cons ${1:item} ${2:list})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Add an item to the beginning of a list'
      }
    },
    {
      label: 'str',
      kind: CompletionItemKind.Snippet,
      detail: 'Concatenate as string',
      insertText: '(str ${1:item1} ${2:item2})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Convert values to strings and concatenate them'
      }
    },
    {
      label: 'empty?',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if collection is empty',
      insertText: '(empty? ${1:collection})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Return true if collection is empty or nil'
      }
    },
    {
      label: 'contains?',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if collection contains key',
      insertText: '(contains? ${1:collection} ${2:key})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Check if a collection contains a key'
      }
    },
    {
      label: 'nth',
      kind: CompletionItemKind.Snippet,
      detail: 'Get nth item',
      insertText: '(nth ${1:collection} ${2:index})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the item at the specified index in a collection'
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
      label: 'nil?',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if nil',
      insertText: '(nil? ${1:value})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Check if a value is nil (null)'
      }
    },
    {
      label: 'length',
      kind: CompletionItemKind.Snippet,
      detail: 'Get collection length',
      insertText: '(length ${1:collection})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the length of a collection'
      }
    },
    {
      label: 'first',
      kind: CompletionItemKind.Snippet,
      detail: 'Get first element',
      insertText: '(first ${1:collection})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the first element of a collection'
      }
    },
    {
      label: 'second',
      kind: CompletionItemKind.Snippet,
      detail: 'Get second element',
      insertText: '(second ${1:collection})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get the second element of a collection'
      }
    },
    {
      label: 'rest',
      kind: CompletionItemKind.Snippet,
      detail: 'Get rest of collection',
      insertText: '(rest ${1:collection})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Get all but the first element of a collection'
      }
    }
  ];
} 