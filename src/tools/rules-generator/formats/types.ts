/**
 * Version information for a rule
 */
export interface RuleVersion {
  major: number;
  minor: number;
  patch: number;
  date: string;
  author?: string;
  changes: string[];
}

/**
 * Impact analysis for a rule
 */
export interface RuleImpact {
  scope: {
    files: string[];
    components: string[];
    services: string[];
  };
  effort: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  benefits: string[];
  prerequisites: string[];
}

/**
 * Dependencies for a rule
 */
export interface RuleDependencies {
  requires: string[]; // IDs of rules that must be followed before this one
  conflicts: string[]; // IDs of rules that conflict with this one
  recommends: string[]; // IDs of rules that work well with this one
  alternatives: string[]; // IDs of alternative rules that could be used instead
}

/**
 * Change history entry for a rule
 */
export interface RuleChange {
  date: string;
  author?: string;
  type: 'added' | 'modified' | 'deprecated' | 'removed';
  description: string;
  version: string;
}

/**
 * Category relationship types
 */
export type CategoryRelationType =
  | 'parent'
  | 'child'
  | 'related'
  | 'requires'
  | 'conflicts';

/**
 * Category relationship
 */
export interface CategoryRelationship {
  type: CategoryRelationType;
  categoryId: string;
  description?: string;
}

/**
 * Category configuration
 */
export interface CategoryConfig {
  allowCustomRules: boolean;
  requireApproval: boolean;
  autoValidate: boolean;
  validateOnCommit: boolean;
  severity: 'error' | 'warning' | 'info';
}
