// src/transpiler/hql_ir.ts - Updated with enum types

export enum IRNodeType {
    // Basic program structure
    Program,
  
    // Literals
    StringLiteral,
    NumericLiteral,
    BooleanLiteral,
    NullLiteral,
  
    // Identifiers
    Identifier,
  
    // Expressions
    CallExpression,
    MemberExpression,
    CallMemberExpression,
    NewExpression,
    BinaryExpression,
    UnaryExpression,
    ConditionalExpression,
    ArrayExpression,
    ArrayConsExpression,
    FunctionExpression,
  
    // Object literal support (for maps)
    ObjectExpression,
    ObjectProperty,
  
    // Statements/Declarations
    VariableDeclaration,
    VariableDeclarator,
    FunctionDeclaration,
    ReturnStatement,
    BlockStatement,
  
    // Import/Export
    ImportDeclaration,
    ImportSpecifier,
    ExportNamedDeclaration,
    ExportSpecifier,
    ExportVariableDeclaration,
  
    // JS Interop
    InteropIIFE,
  
    // Other
    CommentBlock,
    Raw,
  
    // For representing a JS import reference from (js-import "module")
    JsImportReference,
    AssignmentExpression,
    SpreadAssignment,
    ExpressionStatement,
    FxFunctionDeclaration,
    FnFunctionDeclaration,
    IfStatement,
  
    ClassDeclaration,
    ClassField,
    ClassMethod,
    ClassConstructor,
    GetAndCall,
  
    // Enum Types (NEW)
    EnumDeclaration,
    EnumCase,
  }
  
  export interface IRNode {
    type: IRNodeType;
  }
  
  export interface IRProgram extends IRNode {
    type: IRNodeType.Program;
    body: IRNode[];
  }
  
  // Literals
  export interface IRStringLiteral extends IRNode {
    type: IRNodeType.StringLiteral;
    value: string;
  }
  
  export interface IRNumericLiteral extends IRNode {
    type: IRNodeType.NumericLiteral;
    value: number;
  }
  
  export interface IRBooleanLiteral extends IRNode {
    type: IRNodeType.BooleanLiteral;
    value: boolean;
  }
  
  export interface IRNullLiteral extends IRNode {
    type: IRNodeType.NullLiteral;
  }
  
  // Identifiers
  export interface IRIdentifier extends IRNode {
    type: IRNodeType.Identifier;
    name: string;
    isJS?: boolean;
  }
  
  // Expressions
  export interface IRCallExpression extends IRNode {
    type: IRNodeType.CallExpression;
    callee: IRNode;
    arguments: IRNode[];
  }
  
  export interface IRMemberExpression extends IRNode {
    type: IRNodeType.MemberExpression;
    object: IRNode;
    property: IRNode;
    computed: boolean;
  }
  
  export interface IRCallMemberExpression extends IRNode {
    type: IRNodeType.CallMemberExpression;
    object: IRNode;
    property: IRNode;
    arguments: IRNode[];
  }
  
  export interface IRNewExpression extends IRNode {
    type: IRNodeType.NewExpression;
    callee: IRNode;
    arguments: IRNode[];
  }
  
  export interface IRBinaryExpression extends IRNode {
    type: IRNodeType.BinaryExpression;
    operator: string;
    left: IRNode;
    right: IRNode;
  }
  
  export interface IRUnaryExpression extends IRNode {
    type: IRNodeType.UnaryExpression;
    operator: string;
    argument: IRNode;
  }
  
  export interface IRConditionalExpression extends IRNode {
    type: IRNodeType.ConditionalExpression;
    test: IRNode;
    consequent: IRNode;
    alternate: IRNode;
  }
  
  export interface IRArrayExpression extends IRNode {
    type: IRNodeType.ArrayExpression;
    elements: IRNode[];
  }
  
  export interface IRArrayConsExpression extends IRNode {
    type: IRNodeType.ArrayConsExpression;
    item: IRNode;
    array: IRNode;
  }
  
  export interface IRFunctionExpression extends IRNode {
    type: IRNodeType.FunctionExpression;
    id: IRIdentifier | null;
    params: IRIdentifier[];
    body: IRBlockStatement;
  }
  
  // Object literal support (for maps)
  export interface IRObjectProperty extends IRNode {
    type: IRNodeType.ObjectProperty;
    key: IRNode;
    value: IRNode;
    computed?: boolean;
  }
  
  export interface IRSpreadAssignment extends IRNode {
    type: IRNodeType.SpreadAssignment;
    expression: IRNode;
  }
  
  export interface IRExpressionStatement extends IRNode {
    type: IRNodeType.ExpressionStatement;
    expression: IRNode;
  }
  
  // Update the ObjectExpression interface:
  export interface IRObjectExpression extends IRNode {
    type: IRNodeType.ObjectExpression;
    properties: (IRObjectProperty | IRSpreadAssignment)[];
  }
  
  // Statements/Declarations
  export interface IRVariableDeclaration extends IRNode {
    type: IRNodeType.VariableDeclaration;
    kind: "const" | "let" | "var";
    declarations: IRVariableDeclarator[];
  }
  
  export interface IRVariableDeclarator extends IRNode {
    type: IRNodeType.VariableDeclarator;
    id: IRIdentifier;
    init: IRNode;
  }
  
  export interface IRFunctionDeclaration extends IRNode {
    type: IRNodeType.FunctionDeclaration;
    id: IRIdentifier;
    params: IRIdentifier[];
    body: IRBlockStatement;
  }
  
  export interface IRReturnStatement extends IRNode {
    type: IRNodeType.ReturnStatement;
    argument: IRNode;
  }
  
  export interface IRBlockStatement extends IRNode {
    type: IRNodeType.BlockStatement;
    body: IRNode[];
  }
  
  // Import/Export
  export interface IRImportDeclaration extends IRNode {
    type: IRNodeType.ImportDeclaration;
    source: string;
  }
  
  export interface IRExportNamedDeclaration extends IRNode {
    type: IRNodeType.ExportNamedDeclaration;
    specifiers: IRExportSpecifier[];
  }
  
  export interface IRExportSpecifier extends IRNode {
    type: IRNodeType.ExportSpecifier;
    local: IRIdentifier;
    exported: IRIdentifier;
  }
  
  export interface IRExportVariableDeclaration extends IRNode {
    type: IRNodeType.ExportVariableDeclaration;
    declaration: IRVariableDeclaration;
    exportName: string;
  }
  
  // JS Interop
  export interface IRInteropIIFE extends IRNode {
    type: IRNodeType.InteropIIFE;
    object: IRNode;
    property: IRStringLiteral;
  }
  
  // IR node for JS import references
  export interface IRJsImportReference extends IRNode {
    type: IRNodeType.JsImportReference;
    name: string;
    source: string;
  }
  
  // Other
  export interface IRCommentBlock extends IRNode {
    type: IRNodeType.CommentBlock;
    value: string;
  }
  
  export interface IRRaw extends IRNode {
    type: IRNodeType.Raw;
    code: string;
  }
  
  export interface IRImportSpecifier extends IRNode {
    type: IRNodeType.ImportSpecifier;
    imported: IRIdentifier;
    local: IRIdentifier;
  }
  
  // Update the ImportDeclaration interface to use the new ImportSpecifier
  export interface IRImportDeclaration extends IRNode {
    type: IRNodeType.ImportDeclaration;
    source: string;
    specifiers: IRImportSpecifier[];
  }
  
  export interface IRAssignmentExpression extends IRNode {
    type: IRNodeType.AssignmentExpression;
    operator: string;
    left: IRNode;
    right: IRNode;
  }
  
  /**
   * IR node for fx function declarations with type information
   */
  export interface IRFxFunctionDeclaration extends IRNode {
    type: IRNodeType.FxFunctionDeclaration;
    id: IRIdentifier;
    params: IRIdentifier[];
    defaults: { name: string; value: IRNode }[];
    paramTypes: { name: string; type: string }[];
    returnType: string;
    body: IRBlockStatement;
  }
  
  /**
   * IR node for fn function declarations with default values (no types)
   */
  export interface IRFnFunctionDeclaration extends IRNode {
    type: IRNodeType.FnFunctionDeclaration;
    id: IRIdentifier;
    params: IRIdentifier[];
    defaults: { name: string; value: IRNode }[];
    body: IRBlockStatement;
  }
  
  export interface IRIfStatement extends IRNode {
    type: IRNodeType.IfStatement;
    test: IRNode;
    consequent: IRNode;
    alternate: IRNode | null;
  }
  
  export interface IRClassDeclaration extends IRNode {
    type: IRNodeType.ClassDeclaration;
    id: IRIdentifier;
    fields: IRClassField[];
    constructor: IRClassConstructor | null;
    methods: IRClassMethod[];
  }
  
  export interface IRClassField extends IRNode {
    type: IRNodeType.ClassField;
    name: string;
    mutable: boolean;
    initialValue: IRNode | null;
  }
  
  export interface IRClassMethod extends IRNode {
    type: IRNodeType.ClassMethod;
    name: string;
    params: IRIdentifier[];
    defaults?: { name: string, value: IRNode }[]; // Add this field to store defaults
    body: IRBlockStatement;
  }
  
  export interface IRClassConstructor extends IRNode {
    type: IRNodeType.ClassConstructor;
    params: IRIdentifier[];
    body: IRBlockStatement;
  }
  
  export interface IRGetAndCall extends IRNode {
    type: IRNodeType.GetAndCall;
    object: IRNode;
    method: IRStringLiteral;
    arguments: IRNode[];
  }
  
  // --- Enum Types (Enhanced definitions) ---
  
  /**
   * Associated value for enum cases with parameters
   * @example (case success: value: Int message: String)
   */
  export interface IREnumAssociatedValue {
    name: string;
    type: string;
  }
  
  /**
   * Represents an enum declaration: (enum TypeName ...)
   */
  export interface IREnumDeclaration extends IRNode {
    type: IRNodeType.EnumDeclaration;
    id: IRIdentifier;
    rawType?: string;
    cases: IREnumCase[];
    hasAssociatedValues?: boolean;
  }
  
  /**
   * Represents an enum case declaration
   * 
   * @example (case success)           - Simple case
   * @example (case error 404)         - Case with raw value
   * @example (case data: value: Int)  - Case with associated values
   */
  export interface IREnumCase extends IRNode {
    type: IRNodeType.EnumCase;
    id: IRIdentifier;
    rawValue?: IRNode;
    associatedValues?: IREnumAssociatedValue[];
    hasAssociatedValues?: boolean;
  }