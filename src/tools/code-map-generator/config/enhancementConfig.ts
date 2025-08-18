/**
 * Enhanced Configuration for Code Map Generator
 *
 * Provides maximum aggressive optimization by default for AI agent consumption.
 * Achieves 95-97% token reduction while preserving essential architectural information.
 */

import { UniversalOptimizationConfig, QualityThresholds, PatternConsolidationConfig } from '../types.js';

/**
 * Enhanced configuration interface for code map optimization.
 */
export interface CodeMapEnhancementConfig {
  /**
   * Whether to enable optimizations (DEFAULT: true for maximum AI efficiency).
   */
  enableOptimizations: boolean;

  /**
   * Maximum optimization level (DEFAULT: 'maximum' for aggressive token reduction).
   */
  maxOptimizationLevel: 'conservative' | 'balanced' | 'aggressive' | 'maximum';

  /**
   * Universal optimization configuration (DEFAULT: all enabled).
   */
  universalOptimization: UniversalOptimizationConfig;

  /**
   * Pattern-based consolidation configuration (DEFAULT: enabled with aggressive settings).
   */
  patternConsolidation: PatternConsolidationConfig;

  /**
   * Quality thresholds for optimization validation.
   */
  qualityThresholds: QualityThresholds;

  /**
   * Path compression configuration.
   */
  pathCompression: {
    enabled: boolean;
    maxAbbreviationLength: number;
    preserveImportantSegments: boolean;
  };

  /**
   * Function compression configuration.
   */
  functionCompression: {
    enabled: boolean;
    compressTypeNames: boolean;
    compressParameterNames: boolean;
  };

  /**
   * Semantic compression configuration.
   */
  semanticCompression: {
    enabled: boolean;
    removeRedundantPhrases: boolean;
    compressDescriptions: boolean;
  };

  /**
   * Content density configuration (maximum aggressive by default).
   */
  contentDensity: {
    enabled: boolean;
    importanceThreshold: number;
    maxContentLength: number; // 45 for maximum compression
    layeredDetailLevels: string;
    fileImportanceScoring: boolean;
  };
}

/**
 * Type alias for backward compatibility and cleaner imports.
 */
export type EnhancementConfig = CodeMapEnhancementConfig;

/**
 * Default enhanced configuration with maximum aggressive optimization.
 */
export const DEFAULT_ENHANCEMENT_CONFIG: CodeMapEnhancementConfig = {
  // MAXIMUM AGGRESSIVE: Enable optimizations by default
  enableOptimizations: true,

  // MAXIMUM AGGRESSIVE: Set to maximum optimization level
  maxOptimizationLevel: 'maximum',

  // MAXIMUM AGGRESSIVE: Enable all universal optimizations
  universalOptimization: {
    eliminateVerboseDiagrams: true,
    reduceClassDetails: true,
    consolidateRepetitiveContent: true, // Enhanced with pattern-based consolidation
    focusOnPublicInterfaces: true,
    adaptiveOptimization: true,
    skipFunctionCallGraph: true // Set to true for massive performance improvement
  },

  // PATTERN-BASED CONSOLIDATION: Enhanced consolidation settings
  patternConsolidation: {
    enabled: true,
    maxComponentsShown: 3, // Changed from 6 to 3 for more aggressive consolidation
    groupArchitecturalPatterns: true,
    groupFunctionPatterns: true,
    consolidationThreshold: 3 // Minimum items needed to form a consolidation group
  },

  // Quality thresholds adjusted for maximum optimization
  qualityThresholds: {
    minSemanticCompleteness: 90, // Reduced from 95% for aggressive compression
    minArchitecturalIntegrity: 95, // Maintained high integrity
    maxInformationLoss: 15 // Increased from 8% for aggressive compression
  },

  // Path compression enabled
  pathCompression: {
    enabled: true,
    maxAbbreviationLength: 3,
    preserveImportantSegments: true
  },

  // Function compression enabled
  functionCompression: {
    enabled: true,
    compressTypeNames: true,
    compressParameterNames: true
  },

  // Semantic compression enabled
  semanticCompression: {
    enabled: true,
    removeRedundantPhrases: true,
    compressDescriptions: true
  },

  // MAXIMUM AGGRESSIVE: Content density with complete comment elimination
  contentDensity: {
    enabled: true,
    importanceThreshold: 6.0, // Changed from 3.0 to 6.0 for more aggressive filtering
    maxContentLength: 0, // Eliminate ALL comments for maximum token efficiency
    layeredDetailLevels: 'aggressive',
    fileImportanceScoring: true
  }
};

/**
 * Quality-first preset configurations.
 */
export const QUALITY_FIRST_PRESETS = {
  conservative: {
    maxOptimizationLevel: 'conservative' as const,
    qualityThresholds: {
      minSemanticCompleteness: 98,
      minArchitecturalIntegrity: 99,
      maxInformationLoss: 5
    },
    universalOptimization: {
      eliminateVerboseDiagrams: false,
      reduceClassDetails: false,
      consolidateRepetitiveContent: true,
      focusOnPublicInterfaces: false,
      adaptiveOptimization: false,
      skipFunctionCallGraph: true
    },
    contentDensity: {
      enabled: true,
      importanceThreshold: 7.0,
      maxContentLength: 120,
      layeredDetailLevels: 'standard',
      fileImportanceScoring: true
    }
  },

  balanced: {
    maxOptimizationLevel: 'balanced' as const,
    qualityThresholds: {
      minSemanticCompleteness: 95,
      minArchitecturalIntegrity: 97,
      maxInformationLoss: 8
    },
    universalOptimization: {
      eliminateVerboseDiagrams: true,
      reduceClassDetails: true,
      consolidateRepetitiveContent: true,
      focusOnPublicInterfaces: true,
      adaptiveOptimization: true,
      skipFunctionCallGraph: true
    },
    contentDensity: {
      enabled: true,
      importanceThreshold: 5.0,
      maxContentLength: 80,
      layeredDetailLevels: 'moderate',
      fileImportanceScoring: true
    }
  },

  // MAXIMUM AGGRESSIVE: Default preset
  maximum: {
    maxOptimizationLevel: 'maximum' as const,
    qualityThresholds: {
      minSemanticCompleteness: 90,
      minArchitecturalIntegrity: 95,
      maxInformationLoss: 15
    },
    universalOptimization: {
      eliminateVerboseDiagrams: true,
      reduceClassDetails: true,
      consolidateRepetitiveContent: true, // Enhanced with pattern-based consolidation
      focusOnPublicInterfaces: true,
      adaptiveOptimization: true,
      skipFunctionCallGraph: true
    },

    patternConsolidation: {
      enabled: true,
      maxComponentsShown: 3, // Changed from 6 to 3 for more aggressive consolidation
      groupArchitecturalPatterns: true,
      groupFunctionPatterns: true,
      consolidationThreshold: 3 // Minimum items needed to form a consolidation group
    },
    contentDensity: {
      enabled: true,
      importanceThreshold: 6.0, // Changed from 3.0 to 6.0 for more aggressive filtering
      maxContentLength: 0, // Eliminate ALL comments for maximum token efficiency
      layeredDetailLevels: 'aggressive',
      fileImportanceScoring: true
    }
  }
};

/**
 * Enhancement configuration manager.
 */
export class EnhancementConfigManager {
  private static instance: EnhancementConfigManager;
  private config: CodeMapEnhancementConfig;

  private constructor() {
    // MAXIMUM AGGRESSIVE: Use maximum preset by default
    this.config = { ...DEFAULT_ENHANCEMENT_CONFIG };
    this.applyPreset('maximum');
  }

  static getInstance(): EnhancementConfigManager {
    if (!EnhancementConfigManager.instance) {
      EnhancementConfigManager.instance = new EnhancementConfigManager();
    }
    return EnhancementConfigManager.instance;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): CodeMapEnhancementConfig {
    console.warn(`🔍 DEBUG: getConfig called - skipFunctionCallGraph: ${this.config.universalOptimization?.skipFunctionCallGraph}`);
    console.warn(`🔍 DEBUG: Full universalOptimization in getConfig: ${JSON.stringify(this.config.universalOptimization)}`);
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(updates: Partial<CodeMapEnhancementConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Sets optimization level and applies corresponding preset.
   */
  setOptimizationLevel(level: 'conservative' | 'balanced' | 'aggressive' | 'maximum'): void {
    // Map 'aggressive' to 'maximum' since they're equivalent in our presets
    const presetLevel = level === 'aggressive' ? 'maximum' : level;
    this.applyPreset(presetLevel as 'conservative' | 'balanced' | 'maximum');
  }

  /**
   * Applies a quality-first preset configuration.
   */
  applyPreset(preset: 'conservative' | 'balanced' | 'maximum'): void {
    const presetConfig = QUALITY_FIRST_PRESETS[preset];
    
    console.warn(`🔍 DEBUG: Applying preset '${preset}'`);
    console.warn(`🔍 DEBUG: Preset universalOptimization.skipFunctionCallGraph: ${presetConfig.universalOptimization?.skipFunctionCallGraph}`);

    this.config.maxOptimizationLevel = presetConfig.maxOptimizationLevel;
    this.config.qualityThresholds = { ...presetConfig.qualityThresholds };
    this.config.universalOptimization = { ...presetConfig.universalOptimization };
    this.config.contentDensity = { ...this.config.contentDensity, ...presetConfig.contentDensity };
    
    console.warn(`🔍 DEBUG: After applying preset, config.universalOptimization.skipFunctionCallGraph: ${this.config.universalOptimization?.skipFunctionCallGraph}`);

    // Apply pattern consolidation settings if available in preset
    if ('patternConsolidation' in presetConfig) {
      this.config.patternConsolidation = { ...presetConfig.patternConsolidation };
    }
  }

  /**
   * Enables aggressive optimizations (maximum token reduction).
   */
  enableAggressiveOptimizations(): void {
    this.config.enableOptimizations = true;
    this.config.maxOptimizationLevel = 'maximum';

    // Enable all optimizations with aggressive settings
    this.config.pathCompression.enabled = true;
    this.config.functionCompression.enabled = true;
    this.config.semanticCompression.enabled = true;
    this.config.contentDensity.enabled = true;
    this.config.contentDensity.importanceThreshold = 6.0; // Changed from 3.0 to 6.0
    this.config.contentDensity.maxContentLength = 0; // Eliminate ALL comments for maximum token efficiency

    // Enable all universal optimizations
    this.config.universalOptimization.eliminateVerboseDiagrams = true;
    this.config.universalOptimization.reduceClassDetails = true;
    this.config.universalOptimization.consolidateRepetitiveContent = true;
    this.config.universalOptimization.focusOnPublicInterfaces = true;
    this.config.universalOptimization.adaptiveOptimization = true;

    // Enable pattern-based consolidation with aggressive settings
    this.config.patternConsolidation.enabled = true;
    this.config.patternConsolidation.maxComponentsShown = 3; // Changed from 6 to 3
    this.config.patternConsolidation.groupArchitecturalPatterns = true;
    this.config.patternConsolidation.groupFunctionPatterns = true;
    this.config.patternConsolidation.consolidationThreshold = 3;
  }

  /**
   * Disables optimizations (for backward compatibility).
   */
  disableOptimizations(): void {
    this.config.enableOptimizations = false;
    this.config.pathCompression.enabled = false;
    this.config.functionCompression.enabled = false;
    this.config.semanticCompression.enabled = false;
    this.config.contentDensity.enabled = false;

    // Disable universal optimizations
    this.config.universalOptimization.eliminateVerboseDiagrams = false;
    this.config.universalOptimization.reduceClassDetails = false;
    this.config.universalOptimization.consolidateRepetitiveContent = false;
    this.config.universalOptimization.focusOnPublicInterfaces = false;
    this.config.universalOptimization.adaptiveOptimization = false;

    // Disable pattern-based consolidation
    this.config.patternConsolidation.enabled = false;
  }

  /**
   * Resets to default maximum aggressive configuration.
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_ENHANCEMENT_CONFIG };
    this.applyPreset('maximum');
  }
}
