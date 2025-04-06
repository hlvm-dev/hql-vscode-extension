/**
 * Base error class for all transpiler errors
 */
export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Base version of a formatted message.
   * Derived classes can override this if needed.
   */
  public formatMessage(): string {
    return this.message;
  }
  
  /**
   * Get a suggestion based on this error
   */
  public getSuggestion(): string {
    return "Check your code for syntax errors or incorrect types.";
  }
}

/**
 * Enhanced base error class that adds source context information
 * This extends the existing TranspilerError without changing its API
 */
export class TranspilerError extends BaseError {
  public source?: string;
  public filePath?: string;
  public line?: number;
  public column?: number;
  public contextLines: string[] = [];
  private colorConfig: ColorConfig;

  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message);
    this.source = options.source;
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column;
    this.colorConfig = createColorConfig(options.useColors ?? true);
    
    // Extract context lines if we have all the location information
    if (this.source && this.line !== undefined) {
      this.extractContextLines();
    } else if (this.source) {
      // If we have source but no line, try to extract from message
      const lineMatch = message.match(/line (\d+)/i);
      const columnMatch = message.match(/column (\d+)/i);
      
      if (lineMatch) {
        this.line = parseInt(lineMatch[1], 10);
        if (columnMatch) {
          this.column = parseInt(columnMatch[1], 10);
        }
        this.extractContextLines();
      }
    }
    
    // Fix prototype chain
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }
  
  /**
   * Extract context lines from the source
   */
  private extractContextLines(): void {
    if (!this.source || this.line === undefined) return;
    
    const lines = this.source.split('\n');
    const lineIndex = this.line - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    // Clear any existing context lines
    this.contextLines = [];
    
    // Add lines before for context (up to 2)
    for (let i = Math.max(0, lineIndex - 2); i < lineIndex; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
    
    // Add the error line
    this.contextLines.push(`${lineIndex + 1} │ ${lines[lineIndex]}`);
    
    // Add pointer to the column
    if (this.column !== undefined) {
      this.contextLines.push(`  │ ${' '.repeat(Math.max(0, this.column - 1))}^`);
    }
    
    // Add lines after for context (up to 2)
    for (let i = lineIndex + 1; i < Math.min(lines.length, lineIndex + 3); i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
  }
  
  /**
   * Generate an enhanced error message with source context
   */
  public override formatMessage(): string {
    const c = this.colorConfig;
    
    // Start with basic message
    let result = c.red(c.bold(`Error: ${this.message}`));
    
    // Add file location if available
    if (this.filePath) {
      let locationPath = this.filePath;
      
      // Add line and column if available (creates clickable paths in editors)
      if (this.line !== undefined) {
        locationPath += `:${this.line}`;
        if (this.column !== undefined) {
          locationPath += `:${this.column}`;
        }
      }
      
      result += `\n${c.cyan("Location:")} ${locationPath}`;
    }
    
    // Add source context if available
    if (this.contextLines.length > 0) {
      result += '\n\n';
      
      for (let i = 0; i < this.contextLines.length; i++) {
        const line = this.contextLines[i];
        
        // Format the lines with different colors
        if (line.includes(" │ ")) {
          if (line.startsWith("  │ ")) {
            // Error pointer
            result += c.red(line) + '\n';
          } else if (i === this.contextLines.length - 3 || 
                    (this.contextLines.length <= 3 && i === this.contextLines.length - 2)) {
            // Error line
            result += c.yellow(line) + '\n';
          } else {
            // Context line
            result += c.gray(line) + '\n';
          }
        } else {
          result += line + '\n';
        }
      }
    } else if (this.source) {
      // If we have source but extraction failed, show the first few lines
      const lines = this.source.split('\n');
      const maxLines = Math.min(5, lines.length);
      
      result += '\n\n';
      for (let i = 0; i < maxLines; i++) {
        result += c.gray(`${i + 1} │ ${lines[i]}`) + '\n';
      }
      if (lines.length > maxLines) {
        result += c.gray(`... (${lines.length - maxLines} more lines)`) + '\n';
      }
    }
    
    return result;
  }
  
  /**
   * Create an enhanced error from a basic error
   */
  static fromError(
    error: Error,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ): TranspilerError {
    return new TranspilerError(
      error.message,
      options
    );
  }
}


/**
 * Helper function to wrap existing parse errors with enhanced formatting
 */
export function enhanceParseError(error: ParseError, useColors: boolean = true): EnhancedParseError {
  return new EnhancedParseError(
    error.message,
    error.position,
    error.source,
    useColors
  );
}

/**
 * Enhance errors by adding source context
 */
export function enhanceError(
  error: Error,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    useColors?: boolean;
  } = {}
): Error {
  // If it's already an enhanced error, just return it
  if (error instanceof TranspilerError) {
    return error;
  }
  
  // Handle specific error types
  if (error instanceof ParseError) {
    return enhanceParseError(error, options.useColors);
  }
  
  // For all other transpiler errors, create enhanced versions
  if (error instanceof BaseError) {
    return new TranspilerError(
      error.message,
      options
    );
  }
  
  // For generic errors, wrap them
  return TranspilerError.fromError(error, options);
}

/**
 * Macro expansion error
 */
export class MacroError extends TranspilerError {
  public macroName: string;
  public sourceFile?: string;
  public originalError?: Error;

  constructor(
    message: string,
    macroName: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message);
    this.name = "MacroError";
    this.macroName = macroName;
    this.sourceFile = sourceFile;
    this.originalError = originalError;
    Object.setPrototypeOf(this, MacroError.prototype);
  }

  public override formatMessage(): string {
    let result: string;

    if (this.sourceFile) {
      result =
        `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`;
    } else {
      result = `Error expanding macro '${this.macroName}': ${this.message}`;
    }

    // Include original error stack if available
    if (this.originalError?.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }

    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("not found") || msg.includes("undefined") || msg.includes("does not exist")) {
      return "Make sure the macro is defined and imported correctly before using it.";
    }
    if (msg.includes("parameter") || msg.includes("argument")) {
      return "Check that you're passing the correct number and types of arguments to the macro.";
    }
    
    return "Review your macro definition and usage. Check for proper syntax and parameter types.";
  }
}

/**
 * Import processing error
 */
export class ImportError extends TranspilerError {
  public importPath: string;
  public sourceFile?: string;
  public originalError?: Error;

  constructor(
    message: string,
    importPath: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message);
    this.name = "ImportError";
    this.importPath = importPath;
    this.sourceFile = sourceFile;
    this.originalError = originalError;
    Object.setPrototypeOf(this, ImportError.prototype);
  }

  public override formatMessage(): string {
    let result: string;

    if (this.sourceFile) {
      result =
        `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`;
    } else {
      result = `Error importing '${this.importPath}': ${this.message}`;
    }

    // Include original error stack if available
    if (this.originalError?.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }

    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("not found") || msg.includes("cannot find module")) {
      return "Check that the module path is correct and the file exists. Make sure you're using the correct import syntax.";
    }
    
    if (msg.includes("circular")) {
      return "You have a circular dependency in your imports. Check your import structure and break the cycle.";
    }
    
    return "Check your import statement syntax and ensure the module path is correct.";
  }
}

/**
 * Type checking error
 */
export class TypeError extends TranspilerError {
  public expectedType: string;
  public actualType: string;
  public contextName: string;

  constructor(
    message: string,
    expectedType: string,
    actualType: string,
    contextName: string,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
    } = {}
  ) {
    super(message, options);
    this.name = "TypeError";
    this.expectedType = expectedType;
    this.actualType = actualType;
    this.contextName = contextName;
    Object.setPrototypeOf(this, TypeError.prototype);
  }

  public override formatMessage(): string {
    const result = super.formatMessage();
    
    return `${result}\n\nExpected type: ${this.expectedType}\nActual type: ${this.actualType}\nContext: ${this.contextName}`;
  }
  
  public override getSuggestion(): string {
    return `Check that the value being used matches the expected type. You might need to convert the value or fix the type annotation.`;
  }
}

/**
 * Runtime error during evaluation
 */
export class RuntimeError extends TranspilerError {
  public expressionText: string;
  public originalError?: Error;

  constructor(
    message: string,
    expressionText: string,
    originalError?: Error,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
    } = {}
  ) {
    super(message, options);
    this.name = "RuntimeError";
    this.expressionText = expressionText;
    this.originalError = originalError;
    Object.setPrototypeOf(this, RuntimeError.prototype);
  }

  public override formatMessage(): string {
    let result = super.formatMessage();
    
    result += `\n\nExpression: ${this.expressionText}`;
    
    // Include original error stack if available
    if (this.originalError?.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }
    
    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("undefined") || msg.includes("not defined")) {
      return "Check that all variables and functions are properly defined before they are used.";
    }
    
    if (msg.includes("null") || msg.includes("undefined is not an object")) {
      return "You're trying to access a property or method on a null or undefined value. Check your object references.";
    }
    
    return "Review your code for runtime errors. Check variable definitions, type conversions, and function calls.";
  }
}

/**
 * Create a descriptive error report with suggestions for fixing the error
 */
export function createErrorReport(error: Error): string {
  let report = "";
  
  // Add error message
  if (error instanceof BaseError) {
    report += error.formatMessage();
    report += "\n\n";
    report += "Suggestion: " + error.getSuggestion();
  } else {
    report += `Error: ${error.message}`;
    
    if (error.stack) {
      report += `\n\nStack trace:\n${error.stack.split('\n').slice(1).join('\n')}`;
    }
  }
  
  return report;
}// src/error/errors.ts - Error handling utilities

/**
 * Colorizer function for terminal output
 */
export type ColorFn = (s: string) => string;

/**
 * Color configuration for error formatting
 */
export interface ColorConfig {
  red: ColorFn;
  yellow: ColorFn;
  gray: ColorFn;
  cyan: ColorFn;
  bold: ColorFn;
}

/**
 * Create a color configuration based on whether colors are enabled
 */
export function createColorConfig(useColors: boolean): ColorConfig {
  return useColors ? 
    { 
      red: (s: string) => `\x1b[31m${s}\x1b[0m`, 
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, 
      gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m` 
    } : 
    { 
      red: (s: string) => s, 
      yellow: (s: string) => s, 
      gray: (s: string) => s, 
      cyan: (s: string) => s,
      bold: (s: string) => s 
    };
}

/**
 * Parse error with source position information
 */
export class ParseError extends BaseError {
  public position: { line: number; column: number; offset: number };
  public source?: string;

  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
  ) {
    super(message);
    this.name = "ParseError";
    this.position = position;
    this.source = source;
    Object.setPrototypeOf(this, ParseError.prototype);
  }

  public override formatMessage(): string {
    let result =
      `${this.message} at line ${this.position.line}, column ${this.position.column}`;

    // Add a snippet of source if available
    if (this.source) {
      const lines = this.source.split("\n");
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";

      result += `\n\n${lineText}\n${pointer}\n`;
    }

    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
      return "Check for mismatched parentheses or brackets. You might have an extra closing delimiter or missing an opening one.";
    }
    if (msg.includes("unexpected end of input")) {
      return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
    }
    
    return "Review your syntax carefully, paying attention to brackets, quotes, and other delimiters.";
  }
}

/**
 * Parse errors with enhanced formatting
 */
export class EnhancedParseError extends ParseError {
  // Declare as public to match the parent class
  override source?: string;
  private colorConfig: ColorConfig;
  
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
    useColors: boolean = true
  ) {
    super(message, position, source);
    this.source = source;
    this.colorConfig = createColorConfig(useColors);
    
    // Fix prototype chain
    Object.setPrototypeOf(this, EnhancedParseError.prototype);
  }
  
  /**
   * Override message formatting for parse errors
   */
  override formatMessage(): string {
    const c = this.colorConfig;
    
    let result = c.red(c.bold(`Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`));
    
    // Add a snippet of source if available
    if (this.source) {
      const lines = this.source.split('\n');
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";
      
      result += '\n\n';
      
      // Add context before
      if (this.position.line > 1) {
        result += `${c.gray(`${this.position.line - 1} │ ${lines[this.position.line - 2]}`)}\n`;
      }
      
      // Add error line
      result += `${c.yellow(`${this.position.line} │ ${lineText}`)}\n`;
      
      // Add pointer
      result += `${c.red(`  │ ${pointer}`)}\n`;
      
      // Add context after
      if (this.position.line < lines.length) {
        result += `${c.gray(`${this.position.line + 1} │ ${lines[this.position.line]}`)}\n`;
      }
    }
    
    return result;
  }
}