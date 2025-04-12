/**
 * Centralized regex patterns for HQL language server
 * 
 * This file contains common regex patterns used throughout the codebase.
 * Using these pre-compiled patterns improves performance by avoiding
 * repeated regex compilation on each keystroke during autocompletion.
 */

// Function parameters and type patterns
export const PARAM_WITH_TYPE_REGEX = /\([a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/;
export const FUNC_PARAM_REGEX = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/;
export const FUNCTION_PARAM_DOT_REGEX = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/i;
export const PARAM_CONTEXT_REGEX = /\([a-zA-Z_][a-zA-Z0-9_]*\s+([a-zA-Z_][a-zA-Z0-9_]*):\s+\.$/;
export const NAMED_PARAM_REGEX = /\([a-zA-Z_][a-zA-Z0-9_]*\s+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/;

// Function and method patterns
export const FUNCTION_MATCH_REGEX = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s+/;
export const FUNC_CALL_REGEX = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
export const DIRECT_FUNCTION_DOT_REGEX = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s+\.$/;

// Dot notation patterns
export const ENUM_DOT_REGEX = /\S+\s+\.$/;
export const DOT_CHAIN_REGEX = /\)[.\s]*$/;

// Class and instantiation patterns
export const CLASS_NAME_REGEX = /(?:^|\()[\s]*([a-zA-Z_][a-zA-Z0-9_]*)$/;
export const NEW_CLASS_REGEX = /\(\s*new\s+$/;
export const CLASS_STRUCT_REGEX = /\((struct|class)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*$/;
export const CLASS_DECLARATION_REGEX = /\(\s*class\s*$/i;

// Import/export patterns
export const IMPORT_REGEX = /\(\s*import\s+\[/;

// Control flow patterns
export const COND_REGEX = /\(cond\s*$/;
export const COND_COMPLETION_REGEX = /\(\s*cond\s*$/i;
export const FOR_REGEX = /\(for\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*$/;
export const FOR_DECLARATION_REGEX = /\(\s*for\s*\(\s*[a-zA-Z0-9_]*\s*$/i;
export const LOOP_REGEX = /\(loop\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s+/;
export const LOOP_DECLARATION_REGEX = /\(\s*loop\s*\(\s*$/i;
export const REPEAT_REGEX = /\(\s*repeat\s*$/i;
export const WHILE_REGEX = /\(\s*while\s*$/i;
export const WHEN_UNLESS_REGEX = /\(\s*(when|unless)\s*$/i;
export const IF_WHEN_LET_REGEX = /\(\s*(if-let|when-let)\s*$/i;

// Utility patterns
export const WORD_MATCH_REGEX = /[a-zA-Z0-9_-]*$/;

// Parser patterns
export const TOKEN_PATTERN_REGEX = /TOKEN_PATTERN/;
export const LINE_MATCH_REGEX = /line/;
export const COLUMN_MATCH_REGEX = /column/;

// Import path patterns
export const IMPORT_FROM_DOT_REGEX = /import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])(\.*)(["']?)$/;
export const EMPTY_QUOTE_REGEX = /import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])$/;
export const IMPORT_PATH_REGEX = /import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/)(["']?)$/;
export const RECENTLY_SELECTED_DIR_REGEX = /import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?\/(?:[^\/'"]+)\/)(["']?)$/;
export const RECENTLY_ADDED_SLASH_REGEX = /import\s+(?:\[[^\]]*\]|\s*|[a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+(['"])([^'"]*?)(\/)$/; 