import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
  InsertTextFormat
} from 'vscode-languageserver';

/**
 * Get class declaration completions
 */
export function getClassDeclarationCompletions(): CompletionItem[] {
  return [
    {
      label: 'class-basic',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic class definition',
      insertText: '(class ${1:ClassName}\n  ;; Class fields\n  (var ${2:fieldName})\n\n  ;; Constructor\n  (constructor (${3:params})\n    (do\n      (set! this.${2:fieldName} ${3:params})))\n      \n  ;; Method\n  (fn ${4:methodName} (${5:params})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a basic class with fields, constructor and methods'
      }
    },
    {
      label: 'class-with-typed-methods',
      kind: CompletionItemKind.Snippet,
      detail: 'Class with typed methods',
      insertText: '(class ${1:ClassName}\n  ;; Class fields\n  (var ${2:fieldName})\n\n  ;; Constructor\n  (constructor (${3:params})\n    (do\n      (set! this.${2:fieldName} ${3:params})))\n      \n  ;; Regular method\n  (fn ${4:methodName} (${5:params})\n    ${6:body})\n\n  ;; Pure typed method\n  (fx ${7:pureMethod} (${8:param}: ${9:Type}) (-> ${10:ReturnType})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a class with both regular and pure typed methods'
      }
    },
    {
      label: 'class-with-inheritance',
      kind: CompletionItemKind.Snippet,
      detail: 'Class with inheritance',
      insertText: '(class ${1:ClassName} extends ${2:ParentClass}\n  ;; Class fields\n  (var ${3:fieldName})\n\n  ;; Constructor\n  (constructor (${4:params})\n    (do\n      (super ${4:params})\n      (set! this.${3:fieldName} ${4:params})))\n      \n  ;; Override method\n  (fn ${5:methodName} (${6:params})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a class that extends a parent class'
      }
    },
    {
      label: 'class-immutable',
      kind: CompletionItemKind.Snippet,
      detail: 'Immutable class',
      insertText: '(class ${1:ClassName}\n  ;; Immutable fields\n  (let ${2:fieldName})\n\n  ;; Constructor\n  (constructor (${3:params})\n    (do\n      (set! this.${2:fieldName} ${3:params})\n      this))\n      \n  ;; Methods that don\'t mutate state\n  (fx ${4:methodName} (${5:params}) (-> ${6:ReturnType})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define an immutable class with let fields and pure methods'
      }
    },
    {
      label: 'struct-basic',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic struct definition',
      insertText: '(struct ${1:StructName}\n  ;; Struct fields\n  (var ${2:fieldName})\n\n  ;; Initializer\n  (init (${3:params})\n    (do\n      (set! self.${2:fieldName} ${3:params})\n      self))\n      \n  ;; Method\n  (fn ${4:methodName} (${5:params})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a basic struct with fields, initializer and methods'
      }
    },
    {
      label: 'struct-with-typed-methods',
      kind: CompletionItemKind.Snippet,
      detail: 'Struct with typed methods',
      insertText: '(struct ${1:StructName}\n  ;; Struct fields\n  (var ${2:fieldName})\n\n  ;; Initializer\n  (init (${3:params})\n    (do\n      (set! self.${2:fieldName} ${3:params})\n      self))\n      \n  ;; Regular method\n  (fn ${4:methodName} (${5:params})\n    ${6:body})\n\n  ;; Pure typed method\n  (fx ${7:pureMethod} (${8:param}: ${9:Type}) (-> ${10:ReturnType})\n    ${0:body}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a struct with both regular and pure typed methods'
      }
    }
  ];
}

/**
 * Get class instantiation completions
 */
export function getClassInstantiationSnippets(): CompletionItem[] {
  return [
    {
      label: 'new-basic',
      kind: CompletionItemKind.Snippet,
      detail: 'Basic class instantiation',
      insertText: '(new ${1:ClassName} ${2:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create a new instance of a class'
      }
    },
    {
      label: 'new-with-let',
      kind: CompletionItemKind.Snippet,
      detail: 'Class instantiation with binding',
      insertText: '(let [${1:instance} (new ${2:ClassName} ${3:args})]\n  ${4:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create a new instance and bind it to a variable'
      }
    },
    {
      label: 'new-with-method-call',
      kind: CompletionItemKind.Snippet,
      detail: 'Instantiate and call method',
      insertText: '(let [${1:instance} (new ${2:ClassName} ${3:args})]\n  (${1:instance}.${4:methodName} ${5:methodArgs}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create a new instance and call a method on it'
      }
    },
    {
      label: 'new-with-chained-calls',
      kind: CompletionItemKind.Snippet,
      detail: 'Instantiate with chained method calls',
      insertText: '(-> (new ${1:ClassName} ${2:args})\n    (.${3:method1} ${4:args1})\n    (.${5:method2} ${6:args2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create a new instance and chain method calls'
      }
    },
    {
      label: 'new-with-field-access',
      kind: CompletionItemKind.Snippet,
      detail: 'Instantiate with field access',
      insertText: '(let [${1:instance} (new ${2:ClassName} ${3:args})]\n  (.-${4:fieldName} ${1:instance}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Create a new instance and access a field'
      }
    }
  ];
}

/**
 * Get class method completions
 */
export function getClassMethodCompletions(): CompletionItem[] {
  return [
    {
      label: 'fn-method',
      kind: CompletionItemKind.Snippet,
      detail: 'Regular method',
      insertText: '(fn ${1:methodName} (${2:param1} ${3:param2})\n  ${0:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a regular method for a class or struct'
      }
    },
    {
      label: 'fx-method',
      kind: CompletionItemKind.Snippet,
      detail: 'Pure typed method',
      insertText: '(fx ${1:methodName} (${2:param1}: ${3:Type1} ${4:param2}: ${5:Type2}) (-> ${6:ReturnType})\n  ${0:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a pure typed method for a class or struct'
      }
    },
    {
      label: 'constructor',
      kind: CompletionItemKind.Snippet,
      detail: 'Class constructor',
      insertText: '(constructor (${1:param1} ${2:param2})\n  (do\n    (set! this.${3:field1} ${1:param1})\n    (set! this.${4:field2} ${2:param2})\n    this))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a constructor for a class'
      }
    },
    {
      label: 'init',
      kind: CompletionItemKind.Snippet,
      detail: 'Struct initializer',
      insertText: '(init (${1:param1} ${2:param2})\n  (do\n    (set! self.${3:field1} ${1:param1})\n    (set! self.${4:field2} ${2:param2})\n    self))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define an initializer for a struct'
      }
    },
    {
      label: 'static-method',
      kind: CompletionItemKind.Snippet,
      detail: 'Static class method',
      insertText: '(static-fn ${1:methodName} (${2:param1} ${3:param2})\n  ${0:body})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a static method for a class'
      }
    },
    {
      label: 'getter',
      kind: CompletionItemKind.Snippet,
      detail: 'Getter method',
      insertText: '(fn get-${1:propertyName} ()\n  this.${2:fieldName})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a getter method for a class property'
      }
    },
    {
      label: 'setter',
      kind: CompletionItemKind.Snippet,
      detail: 'Setter method',
      insertText: '(fn set-${1:propertyName} (${2:value})\n  (do\n    (set! this.${3:fieldName} ${2:value})\n    this))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Define a setter method for a class property'
      }
    }
  ];
}

/**
 * Get method call completions
 */
export function getMethodCallCompletions(): CompletionItem[] {
  return [
    {
      label: 'method-call',
      kind: CompletionItemKind.Snippet,
      detail: 'Call method on object',
      insertText: '(${1:object}.${2:methodName} ${3:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Call a method on an object'
      }
    },
    {
      label: 'method-chain',
      kind: CompletionItemKind.Snippet,
      detail: 'Chain method calls',
      insertText: '(-> ${1:object}\n    (.${2:method1} ${3:args1})\n    (.${4:method2} ${5:args2}))',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Chain multiple method calls on an object'
      }
    },
    {
      label: 'field-access',
      kind: CompletionItemKind.Snippet,
      detail: 'Access object field',
      insertText: '(.-${1:fieldName} ${2:object})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Access a field on an object'
      }
    },
    {
      label: 'field-update',
      kind: CompletionItemKind.Snippet,
      detail: 'Update object field',
      insertText: '(set! ${1:object}.${2:fieldName} ${3:newValue})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Update a field on an object'
      }
    },
    {
      label: 'static-method-call',
      kind: CompletionItemKind.Snippet,
      detail: 'Call static method',
      insertText: '(${1:ClassName}.${2:staticMethod} ${3:args})',
      insertTextFormat: InsertTextFormat.Snippet,
      documentation: {
        kind: MarkupKind.Markdown,
        value: 'Call a static method on a class'
      }
    }
  ];
} 