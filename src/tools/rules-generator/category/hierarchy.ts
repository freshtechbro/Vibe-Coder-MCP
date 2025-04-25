import logger from '../../../logger.js';
import { Rule, RuleCategory } from '../types.js';

interface CategoryNode {
  category: RuleCategory;
  rules: Rule[];
  children: CategoryNode[];
}

interface CategoryPath {
  categories: RuleCategory[];
  rule: Rule;
}

export class CategoryHierarchy {
  private root: CategoryNode;

  constructor() {
    this.root = {
      category: RuleCategory.Custom,
      rules: [],
      children: [],
    };
  }

  addRule(rule: Rule, categories: RuleCategory[]): void {
    try {
      const path: CategoryPath = { categories, rule };
      let currentNode = this.root;

      for (const category of categories) {
        let childNode = currentNode.children.find(
          (child) => child.category === category
        );

        if (!childNode) {
          childNode = {
            category,
            rules: [],
            children: [],
          };
          currentNode.children.push(childNode);
        }

        currentNode = childNode;
      }

      currentNode.rules.push(rule);
      logger.debug({ path }, 'Added rule to category hierarchy');
    } catch (error) {
      logger.error(
        { err: error, categories, rule },
        'Failed to add rule to hierarchy'
      );
      throw error;
    }
  }

  getRules(category: RuleCategory): Rule[] {
    try {
      const node = this.findNode(this.root, category);
      return node ? [...node.rules] : [];
    } catch (error) {
      logger.error(
        { err: error, category },
        'Failed to get rules for category'
      );
      return [];
    }
  }

  private findNode(
    node: CategoryNode,
    category: RuleCategory
  ): CategoryNode | null {
    if (node.category === category) {
      return node;
    }

    for (const child of node.children) {
      const found = this.findNode(child, category);
      if (found) {
        return found;
      }
    }

    return null;
  }
}
