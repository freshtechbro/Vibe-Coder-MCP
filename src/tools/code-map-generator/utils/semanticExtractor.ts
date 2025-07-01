/**
 * Semantic information extraction and compression utilities
 * Preserves meaningful content while respecting character limits
 */

export interface CommentContext {
  type: 'file' | 'class' | 'method' | 'property' | 'function' | 'import';
  name?: string;
  parentClass?: string;
}

export interface EnhancedContext {
  structural: CommentContext;
  domains: string[];
  confidence: number;
}

/**
 * Automatically detect context from comment content and structure
 */
export function detectFullContext(comment: string, structuralContext?: CommentContext): EnhancedContext {
  const domains = [
    ...detectDomainContext(comment),
    ...detectNamingContext(structuralContext?.name),
    ...detectNamingContext(structuralContext?.parentClass)
  ];

  return {
    structural: structuralContext || { type: 'function' },
    domains: [...new Set(domains)], // Remove duplicates
    confidence: calculateContextConfidence(comment, domains)
  };
}

/**
 * Detect domain context from comment content
 */
function detectDomainContext(comment: string): string[] {
  const contexts: string[] = [];
  const lowerComment = comment.toLowerCase();

  // Authentication domain
  if (/\b(auth|login|password|token|session|credential|jwt|oauth|signin|signup|logout)\b/.test(lowerComment)) {
    contexts.push('authentication');
  }

  // Database domain
  if (/\b(database|db|query|sql|table|record|entity|repository|orm|migration|schema)\b/.test(lowerComment)) {
    contexts.push('database');
  }

  // API domain
  if (/\b(api|endpoint|request|response|http|rest|graphql|route|controller)\b/.test(lowerComment)) {
    contexts.push('api');
  }

  // Cache domain
  if (/\b(cache|redis|memory|store|expire|ttl|invalidate|evict)\b/.test(lowerComment)) {
    contexts.push('cache');
  }

  // Service domain
  if (/\b(service|manager|handler|processor|worker|job|task)\b/.test(lowerComment)) {
    contexts.push('service');
  }

  // Validation domain
  if (/\b(validate|validation|verify|check|sanitize|clean|format)\b/.test(lowerComment)) {
    contexts.push('validation');
  }

  // File/IO domain
  if (/\b(file|directory|path|read|write|upload|download|stream)\b/.test(lowerComment)) {
    contexts.push('file');
  }

  return contexts;
}

/**
 * Detect context from naming patterns
 */
function detectNamingContext(name?: string): string[] {
  if (!name) return [];

  const contexts: string[] = [];
  const lowerName = name.toLowerCase();

  // Authentication patterns
  if (/auth|login|password|token|session|jwt|credential/.test(lowerName)) {
    contexts.push('authentication');
  }

  // Database patterns
  if (/repository|dao|entity|model|query|db|table|record/.test(lowerName)) {
    contexts.push('database');
  }

  // API patterns
  if (/controller|router|endpoint|handler|middleware/.test(lowerName)) {
    contexts.push('api');
  }

  // Service patterns
  if (/service|manager|processor|worker|job/.test(lowerName)) {
    contexts.push('service');
  }

  // Cache patterns
  if (/cache|redis|memory|store/.test(lowerName)) {
    contexts.push('cache');
  }

  return contexts;
}

/**
 * Calculate confidence score for context detection
 */
function calculateContextConfidence(comment: string, domains: string[]): number {
  if (domains.length === 0) return 0.1;

  const wordCount = comment.split(/\s+/).length;
  const domainTermCount = domains.length;

  // Higher confidence for more domain terms relative to comment length
  return Math.min(0.9, (domainTermCount / wordCount) * 2);
}

/**
 * Extract semantic keywords from comment text with enhanced context
 */
export function extractSemanticKeywords(comment: string, context?: CommentContext): string[] {
  const keywords: string[] = [];
  
  // Extract action verbs (creates, handles, manages, etc.)
  const actionVerbs = comment.match(/\b(creates?|handles?|manages?|processes?|validates?|generates?|calculates?|performs?|executes?|returns?|gets?|sets?|builds?|parses?|formats?|converts?|transforms?|filters?|sorts?|searches?|finds?|loads?|saves?|updates?|deletes?|removes?|adds?|inserts?)\b/gi);
  if (actionVerbs) {
    keywords.push(...actionVerbs.map(verb => verb.toLowerCase()));
  }
  
  // Extract domain-specific terms
  const domainTerms = extractDomainTerms(comment, context);
  keywords.push(...domainTerms);
  
  // Extract purpose indicators with following words
  const purposeMatches = comment.match(/\b(for|to|that|which)\s+(\w+(?:\s+\w+){0,2})/gi);
  if (purposeMatches) {
    purposeMatches.forEach(match => {
      const words = match.split(/\s+/).slice(1); // Remove 'for', 'to', etc.
      keywords.push(...words.map(word => word.toLowerCase()));
    });
  }
  
  // Extract important nouns (likely domain concepts)
  const importantNouns = comment.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g);
  if (importantNouns) {
    keywords.push(...importantNouns.map(noun => noun.toLowerCase()));
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Compress comment content while preserving semantic meaning
 */
export function compressSemanticContent(comment: string, keywords: string[]): string {
  let compressed = comment;
  
  // Remove common redundant phrases
  compressed = compressed
    .replace(/\bthis (function|method|class|property|file|module|component)\b/gi, '')
    .replace(/\bis used (to|for)\b/gi, '')
    .replace(/\bprovides? (a|an|the)?\s*/gi, '')
    .replace(/\breturn[s]?\s+(a|an|the)\s+/gi, 'returns ')
    .replace(/\brepresents? (a|an|the)?\s*/gi, '')
    .replace(/\bcontains? (a|an|the)?\s*/gi, 'has ')
    .replace(/\bimplements? (a|an|the)?\s*/gi, 'implements ')
    .replace(/\bdefines? (a|an|the)?\s*/gi, 'defines ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If still too long, prioritize sentences with keywords
  if (compressed.length > 50) {
    const sentences = compressed.split(/[.!?]+/);
    if (sentences.length > 1) {
      const prioritized = sentences
        .map(sentence => ({
          text: sentence.trim(),
          score: calculateSemanticScore(sentence, keywords),
          length: sentence.trim().length
        }))
        .filter(item => item.text.length > 0)
        .sort((a, b) => {
          // Prioritize by semantic score, then by brevity
          if (b.score !== a.score) return b.score - a.score;
          return a.length - b.length;
        });
      
      if (prioritized.length > 0) {
        compressed = prioritized[0].text;
      }
    }
  }
  
  return compressed;
}

/**
 * Semantic keyword selection that preserves meaning over compression
 */
export function selectBestKeywords(comment: string, maxLength: number, context?: CommentContext): string {
  if (comment.length <= maxLength) return comment;

  // Step 1: Extract meaningful terms with semantic roles
  const meaningfulTerms = extractMeaningfulTerms(comment);

  // Step 2: Preserve semantic core (action + object)
  const semanticCore = preserveSemanticCore(meaningfulTerms);

  // Step 3: Enhance with context if space allows
  const contextEnhanced = enhanceWithContext(semanticCore, comment, context);

  // Step 4: Apply selective abbreviations only if needed
  const optimized = applySelectiveAbbreviations(contextEnhanced, maxLength);

  // Step 5: Validate semantic quality
  const result = validateAndFinalize(optimized, comment, maxLength);

  return result;
}

/**
 * Extract meaningful terms with semantic role classification
 */
function extractMeaningfulTerms(comment: string): { actions: string[], objects: string[], descriptors: string[], domains: string[] } {
  const words = comment.toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);

  const meaningfulTerms = {
    actions: [] as string[],
    objects: [] as string[],
    descriptors: [] as string[],
    domains: [] as string[]
  };

  // Action verbs (highest priority)
  const actionVerbs = [
    'validates', 'manages', 'processes', 'handles', 'creates', 'generates', 'executes',
    'retrieves', 'stores', 'updates', 'deletes', 'checks', 'verifies', 'authenticates',
    'authorizes', 'encrypts', 'decrypts', 'compresses', 'decompresses', 'parses',
    'formats', 'transforms', 'converts', 'filters', 'sorts', 'searches', 'finds',
    'loads', 'saves', 'sends', 'receives', 'connects', 'disconnects', 'initializes',
    'configures', 'optimizes', 'caches', 'invalidates', 'refreshes', 'synchronizes'
  ];

  // Specific objects (high priority)
  const objectNouns = [
    'user', 'users', 'credentials', 'password', 'token', 'tokens', 'session', 'sessions',
    'data', 'record', 'records', 'file', 'files', 'query', 'queries', 'request', 'requests',
    'response', 'responses', 'connection', 'connections', 'configuration', 'config',
    'settings', 'options', 'parameters', 'metadata', 'schema', 'table', 'database',
    'cache', 'memory', 'storage', 'repository', 'service', 'api', 'endpoint', 'route'
  ];

  // Technical descriptors (medium priority)
  const descriptors = [
    'secure', 'encrypted', 'cached', 'optimized', 'validated', 'authenticated',
    'authorized', 'compressed', 'formatted', 'parsed', 'filtered', 'sorted',
    'synchronized', 'asynchronous', 'concurrent', 'parallel', 'distributed',
    'scalable', 'reliable', 'efficient', 'fast', 'slow', 'large', 'small'
  ];

  // Domain terms (lowest priority - context only)
  const domainTerms = [
    'auth', 'authentication', 'database', 'db', 'sql', 'api', 'http', 'rest',
    'graphql', 'json', 'xml', 'html', 'css', 'javascript', 'typescript',
    'python', 'java', 'security', 'encryption', 'validation'
  ];

  // Classify words by semantic role
  for (const word of words) {
    if (actionVerbs.includes(word)) {
      meaningfulTerms.actions.push(word);
    } else if (objectNouns.includes(word)) {
      meaningfulTerms.objects.push(word);
    } else if (descriptors.includes(word)) {
      meaningfulTerms.descriptors.push(word);
    } else if (domainTerms.includes(word)) {
      meaningfulTerms.domains.push(word);
    }
  }

  return meaningfulTerms;
}

/**
 * Preserve semantic core (action + object combination)
 */
function preserveSemanticCore(terms: { actions: string[], objects: string[], descriptors: string[], domains: string[] }): string[] {
  const core: string[] = [];

  // Always include the first action verb (most important)
  if (terms.actions.length > 0) {
    core.push(terms.actions[0]);
  }

  // Include primary objects (up to 2)
  if (terms.objects.length > 0) {
    core.push(...terms.objects.slice(0, 2));
  }

  // If no action verb, include descriptors
  if (terms.actions.length === 0 && terms.descriptors.length > 0) {
    core.push(terms.descriptors[0]);
  }

  return core;
}

/**
 * Enhance with context while preserving core meaning
 */
function enhanceWithContext(core: string[], comment: string, _context?: CommentContext): string[] {
  const enhanced = [...core];

  // Only add context terms if they provide additional value
  const contextTerms = detectDomainContext(comment);

  // Add context term only if it's not redundant with existing terms
  for (const contextTerm of contextTerms) {
    const isRedundant = enhanced.some(term =>
      term.includes(contextTerm) || contextTerm.includes(term)
    );

    if (!isRedundant && enhanced.length < 4) {
      // Add abbreviated context term if space allows
      const abbreviatedContext = getContextAbbreviation(contextTerm);
      if (abbreviatedContext && abbreviatedContext !== contextTerm) {
        enhanced.push(abbreviatedContext);
      }
    }
  }

  return enhanced;
}

/**
 * Apply selective abbreviations only when necessary
 */
function applySelectiveAbbreviations(terms: string[], maxLength: number): string[] {
  const currentLength = terms.join(' ').length;

  if (currentLength <= maxLength) {
    return terms; // No abbreviation needed
  }

  const abbreviated = terms.map(term => {
    // Only abbreviate if it saves significant space and preserves meaning
    const abbrev = getSelectiveAbbreviation(term);
    return abbrev || term;
  });

  return abbreviated;
}

/**
 * Get context-appropriate abbreviation
 */
function getContextAbbreviation(contextTerm: string): string | null {
  const abbreviations: Record<string, string> = {
    'authentication': 'auth',
    'database': 'db',
    'configuration': 'config',
    'repository': 'repo',
    'application': 'app'
  };

  return abbreviations[contextTerm] || null;
}

/**
 * Get selective abbreviation only for long terms
 */
function getSelectiveAbbreviation(term: string): string | null {
  // Only abbreviate terms longer than 8 characters
  if (term.length <= 8) return null;

  const abbreviations: Record<string, string> = {
    'authentication': 'auth',
    'configuration': 'config',
    'repository': 'repo',
    'application': 'app',
    'management': 'mgmt',
    'processing': 'proc',
    'generation': 'gen',
    'initialization': 'init',
    'validation': 'valid'
  };

  return abbreviations[term] || null;
}

/**
 * Validate semantic quality and finalize result
 */
function validateAndFinalize(terms: string[], originalComment: string, maxLength: number): string {
  const result = terms.join(' ');

  // Check if result fits within length limit
  if (result.length > maxLength) {
    // Try removing least important terms
    const reduced = reduceToFit(terms, maxLength);
    return reduced;
  }

  // Validate semantic quality
  if (!hasSemanticMeaning(result, originalComment)) {
    // Fallback to intelligent truncation
    return intelligentTruncation(originalComment, maxLength);
  }

  return result;
}

/**
 * Reduce terms to fit within length limit
 */
function reduceToFit(terms: string[], maxLength: number): string {
  // Remove terms from least to most important
  const priorityOrder = [...terms];

  while (priorityOrder.length > 1 && priorityOrder.join(' ').length > maxLength) {
    // Remove last term (least important)
    priorityOrder.pop();
  }

  return priorityOrder.join(' ');
}

/**
 * Check if result has semantic meaning
 */
function hasSemanticMeaning(result: string, original: string): boolean {
  // Must have at least 2 meaningful words
  const words = result.split(' ').filter(w => w.length > 2);
  if (words.length < 2) return false;

  // Should contain at least one action or object from original
  const originalWords = original.toLowerCase().split(/\s+/);
  const hasRelevantTerm = words.some(word =>
    originalWords.some(orig => orig.includes(word) || word.includes(orig))
  );

  return hasRelevantTerm;
}

/**
 * Intelligent truncation fallback
 */
function intelligentTruncation(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find last complete word that fits
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace);
  }

  return truncated;
}

// Removed unused function prioritizeKeywordsByContext

// Removed unused function calculateKeywordContextScore

// Removed unused function applyContextAbbreviations

// Removed unused function selectKeywordsWithinLimit

/**
 * Extract domain-specific terms based on context
 */
function extractDomainTerms(comment: string, context?: CommentContext): string[] {
  const terms: string[] = [];
  
  // Programming-specific terms
  const progTerms = comment.match(/\b(API|HTTP|HTTPS|REST|GraphQL|JSON|XML|YAML|database|DB|cache|auth|authentication|authorization|config|configuration|util|utility|helper|service|controller|model|view|component|module|library|framework|middleware|router|handler|processor|manager|builder|factory|adapter|wrapper|decorator|observer|strategy|command|query|repository|entity|DTO|DAO)\b/gi);
  if (progTerms) {
    terms.push(...progTerms.map(term => term.toLowerCase()));
  }
  
  // Context-specific terms
  if (context?.type === 'class') {
    const classTerms = comment.match(/\b(manager|handler|processor|builder|factory|adapter|wrapper|controller|service|repository|entity|model|view|component)\b/gi);
    if (classTerms) {
      terms.push(...classTerms.map(term => term.toLowerCase()));
    }
  }
  
  if (context?.type === 'method' || context?.type === 'function') {
    const functionTerms = comment.match(/\b(validate|process|handle|manage|create|build|parse|format|convert|transform|filter|sort|search|find|load|save|update|delete|remove|add|insert|get|set|fetch|send|receive|execute|run|start|stop|init|initialize|cleanup|destroy)\b/gi);
    if (functionTerms) {
      terms.push(...functionTerms.map(term => term.toLowerCase()));
    }
  }
  
  // File type specific terms
  if (context?.type === 'file') {
    const fileTerms = comment.match(/\b(test|spec|config|configuration|utility|helper|service|controller|model|view|component|module|library|types|interface|constants|enum)\b/gi);
    if (fileTerms) {
      terms.push(...fileTerms.map(term => term.toLowerCase()));
    }
  }
  
  return terms;
}

/**
 * Calculate semantic score based on keyword presence
 */
function calculateSemanticScore(sentence: string, keywords: string[]): number {
  let score = 0;
  const lowerSentence = sentence.toLowerCase();
  
  keywords.forEach(keyword => {
    if (lowerSentence.includes(keyword)) {
      score += 1;
    }
  });
  
  // Bonus for action verbs at the beginning
  if (/^\s*(creates?|handles?|manages?|processes?|validates?|generates?|calculates?|performs?|executes?|returns?|gets?|sets?)/i.test(sentence)) {
    score += 0.5;
  }
  
  return score;
}
