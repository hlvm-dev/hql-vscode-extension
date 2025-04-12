// src/paredit/utils/delimiter-utils.ts

/**
 * Get the matching delimiter for a given delimiter
 */
export function getMatchingDelimiter(delimiter: string): string {
    switch (delimiter) {
      case '(': return ')';
      case ')': return '(';
      case '[': return ']';
      case ']': return '[';
      case '{': return '}';
      case '}': return '{';
      default: return '';
    }
  }
  
  /**
   * Check if a character is a opening delimiter
   */
  export function isOpeningDelimiter(char: string): boolean {
    return ['(', '[', '{'].includes(char);
  }
  
  /**
   * Check if a character is a closing delimiter
   */
  export function isClosingDelimiter(char: string): boolean {
    return [')', ']', '}'].includes(char);
  }
  
  /**
   * Check if a character is any delimiter
   */
  export function isDelimiter(char: string): boolean {
    return isOpeningDelimiter(char) || isClosingDelimiter(char);
  }
  
  /**
   * Check if a character is whitespace
   */
  export function isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }