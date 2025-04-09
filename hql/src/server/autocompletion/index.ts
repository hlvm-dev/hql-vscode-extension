// Export types
export * from './types';

// Export individual providers
export { DataStructureCompletionProvider } from './dataStructures';
export { DotChainCompletionProvider } from './dotChain';
export { StandardLibraryCompletionProvider } from './standardLibrary';
export { 
  SpecialSyntaxCompletionProvider,
  ClassStructFieldCompletionProvider,
  EnumCaseCompletionProvider,
  LoopRecurCompletionProvider,
  ConditionalCompletionProvider,
  BindingCompletionProvider,
  ForLoopCompletionProvider
} from './specialSyntax';

import { SymbolManager } from '../symbolManager';
import { CompletionContext, ICompletionProvider } from './types';
import { DataStructureCompletionProvider } from './dataStructures';
import { DotChainCompletionProvider } from './dotChain';
import { StandardLibraryCompletionProvider } from './standardLibrary';
import { SpecialSyntaxCompletionProvider } from './specialSyntax';

/**
 * Creates and configures all the completion providers
 */
export function createCompletionProviders(symbolManager: SymbolManager): ICompletionProvider[] {
  return [
    // Special syntax providers have highest priority
    new SpecialSyntaxCompletionProvider(symbolManager),
    
    // Data structure literals
    new DataStructureCompletionProvider(),
    
    // Method chaining
    new DotChainCompletionProvider(),
    
    // Standard library (lowest priority)
    new StandardLibraryCompletionProvider()
  ];
} 