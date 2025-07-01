/**
 * HTML language handler for the Code-Map Generator tool.
 * This file contains the language handler for HTML files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import path from 'path';

/**
 * Language handler for HTML.
 * Provides enhanced function name detection for HTML files.
 */
export class HtmlHandler extends BaseLanguageHandler {
  /**
   * Options for the handler.
   */
  protected options?: { filePath?: string };
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'element',
      'script_element',
      'style_element',
      'start_tag',
      'attribute'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'document',
      'element',
      'doctype'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'element',
      'attribute'
    ];
  }

  /**
   * Extracts the function name from an AST node.
   */
  protected extractFunctionName(
    node: SyntaxNode,
    sourceCode: string,
_options?: FunctionExtractionOptions
  ): string {
    try {
      // Handle elements
      if (node.type === 'element') {
        const tagNameNode = node.childForFieldName('tag_name');
        if (tagNameNode) {
          const tagName = getNodeText(tagNameNode, sourceCode);

          // Check for special elements
          if (tagName === 'script') {
            return 'script_element';
          } else if (tagName === 'style') {
            return 'style_element';
          } else if (tagName === 'link' && this.hasStylesheetAttribute(node, sourceCode)) {
            return 'stylesheet_link';
          } else if (tagName === 'form') {
            return this.extractFormName(node, sourceCode);
          } else if (tagName === 'input' || tagName === 'button') {
            return this.extractInputName(node, sourceCode);
          } else if (tagName === 'a') {
            return this.extractLinkName(node, sourceCode);
          } else if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(tagName)) {
            return this.extractContainerName(node, sourceCode);
          } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            return this.extractHeadingName(node, sourceCode);
          } else if (['ul', 'ol', 'dl'].includes(tagName)) {
            return this.extractListName(node, sourceCode);
          } else if (tagName === 'table') {
            return this.extractTableName(node, sourceCode);
          }

          return `element_${tagName}`;
        }
      }

      // Handle script elements
      if (node.type === 'script_element') {
        // Check for script attributes
        const attributesNode = node.childForFieldName('start_tag')?.childForFieldName('attributes');
        if (attributesNode) {
          // Check for type attribute
          const typeAttr = this.findAttribute(attributesNode, 'type', sourceCode);
          if (typeAttr) {
            const typeValue = this.getAttributeValue(typeAttr, sourceCode);
            if (typeValue === 'module') {
              return 'es_module_script';
            } else if (typeValue === 'application/json') {
              return 'json_script';
            } else if (typeValue === 'text/template' || typeValue === 'text/x-template') {
              return 'template_script';
            }
          }

          // Check for src attribute
          const srcAttr = this.findAttribute(attributesNode, 'src', sourceCode);
          if (srcAttr) {
            const srcValue = this.getAttributeValue(srcAttr, sourceCode);
            if (srcValue) {
              const filename = path.basename(srcValue);
              return `script_${filename}`;
            }
          }

          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `script_${idValue}`;
            }
          }
        }

        return 'inline_script';
      }

      // Handle style elements
      if (node.type === 'style_element') {
        return 'inline_style';
      }

      // Handle start tags
      if (node.type === 'start_tag') {
        const tagNameNode = node.childForFieldName('tag_name');
        if (tagNameNode) {
          return `tag_${getNodeText(tagNameNode, sourceCode)}`;
        }
      }

      // Handle attributes
      if (node.type === 'attribute') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for event handler attributes
          if (name.startsWith('on')) {
            return `event_${name.substring(2)}`;
          }

          // Check for data attributes
          if (name.startsWith('data-')) {
            return `data_${name.substring(5)}`;
          }

          // Check for special attributes
          if (['id', 'class', 'name', 'src', 'href', 'rel', 'type'].includes(name)) {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              const value = getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
              return `${name}_${value}`;
            }
          }

          return `attribute_${name}`;
        }
      }

      return 'html_element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML function name');
      return 'html_element';
    }
  }

  /**
   * Checks if an element has a stylesheet attribute.
   */
  private hasStylesheetAttribute(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          const relAttr = this.findAttribute(attributesNode, 'rel', sourceCode);
          if (relAttr) {
            const relValue = this.getAttributeValue(relAttr, sourceCode);
            return relValue === 'stylesheet';
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if HTML element has stylesheet attribute');
      return false;
    }
  }

  /**
   * Finds an attribute by name.
   */
  private findAttribute(attributesNode: SyntaxNode, name: string, sourceCode: string): SyntaxNode | null {
    try {
      for (let i = 0; i < attributesNode.childCount; i++) {
        const attr = attributesNode.child(i);
        if (attr?.type === 'attribute') {
          const nameNode = attr.childForFieldName('name');
          if (nameNode && getNodeText(nameNode, sourceCode) === name) {
            return attr;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: attributesNode.type }, 'Error finding HTML attribute');
      return null;
    }
  }

  /**
   * Gets the value of an attribute.
   */
  private getAttributeValue(attributeNode: SyntaxNode, sourceCode: string): string {
    try {
      const valueNode = attributeNode.childForFieldName('value');
      if (valueNode) {
        return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
      }

      return '';
    } catch (error) {
      logger.warn({ err: error, nodeType: attributeNode.type }, 'Error getting HTML attribute value');
      return '';
    }
  }

  /**
   * Extracts a name for a form element.
   */
  private extractFormName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `form_${idValue}`;
            }
          }

          // Check for name attribute
          const nameAttr = this.findAttribute(attributesNode, 'name', sourceCode);
          if (nameAttr) {
            const nameValue = this.getAttributeValue(nameAttr, sourceCode);
            if (nameValue) {
              return `form_${nameValue}`;
            }
          }

          // Check for action attribute
          const actionAttr = this.findAttribute(attributesNode, 'action', sourceCode);
          if (actionAttr) {
            const actionValue = this.getAttributeValue(actionAttr, sourceCode);
            if (actionValue) {
              const actionPath = actionValue.split('?')[0]; // Remove query parameters
              const actionName = path.basename(actionPath);
              return `form_${actionName}`;
            }
          }

          // Check for method attribute
          const methodAttr = this.findAttribute(attributesNode, 'method', sourceCode);
          if (methodAttr) {
            const methodValue = this.getAttributeValue(methodAttr, sourceCode);
            if (methodValue) {
              return `${methodValue.toLowerCase()}_form`;
            }
          }
        }
      }

      return 'form';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML form name');
      return 'form';
    }
  }

  /**
   * Extracts a name for an input element.
   */
  private extractInputName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for type attribute
          const typeAttr = this.findAttribute(attributesNode, 'type', sourceCode);
          let typeValue = '';
          if (typeAttr) {
            typeValue = this.getAttributeValue(typeAttr, sourceCode);
          }

          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return typeValue ? `${typeValue}_${idValue}` : `input_${idValue}`;
            }
          }

          // Check for name attribute
          const nameAttr = this.findAttribute(attributesNode, 'name', sourceCode);
          if (nameAttr) {
            const nameValue = this.getAttributeValue(nameAttr, sourceCode);
            if (nameValue) {
              return typeValue ? `${typeValue}_${nameValue}` : `input_${nameValue}`;
            }
          }

          // Use type if available
          if (typeValue) {
            return `${typeValue}_input`;
          }
        }
      }

      // Get the tag name
      const tagNameNode = node.childForFieldName('tag_name');
      if (tagNameNode) {
        return `${getNodeText(tagNameNode, sourceCode)}_element`;
      }

      return 'input_element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML input name');
      return 'input_element';
    }
  }

  /**
   * Extracts a name for a link element.
   */
  private extractLinkName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `link_${idValue}`;
            }
          }

          // Check for href attribute
          const hrefAttr = this.findAttribute(attributesNode, 'href', sourceCode);
          if (hrefAttr) {
            const hrefValue = this.getAttributeValue(hrefAttr, sourceCode);
            if (hrefValue) {
              // Handle different types of links
              if (hrefValue.startsWith('#')) {
                return `anchor_${hrefValue.substring(1)}`;
              } else if (hrefValue.startsWith('mailto:')) {
                return 'email_link';
              } else if (hrefValue.startsWith('tel:')) {
                return 'phone_link';
              } else if (hrefValue.startsWith('javascript:')) {
                return 'javascript_link';
              } else {
                const hrefPath = hrefValue.split('?')[0]; // Remove query parameters
                const hrefName = path.basename(hrefPath);
                return `link_${hrefName}`;
              }
            }
          }
        }
      }

      // Try to get the text content
      const textNode = this.findTextNode(node);
      if (textNode) {
        const text = getNodeText(textNode, sourceCode).trim();
        if (text.length > 0) {
          // Limit the length and convert to snake case
          const linkText = text.substring(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_');
          return `link_${linkText}`;
        }
      }

      return 'link';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML link name');
      return 'link';
    }
  }

  /**
   * Finds the first text node in an element.
   */
  private findTextNode(node: SyntaxNode): SyntaxNode | null {
    try {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'text') {
          return child;
        } else if (child?.childCount) {
          const textNode = this.findTextNode(child);
          if (textNode) {
            return textNode;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding HTML text node');
      return null;
    }
  }

  /**
   * Extracts a name for a container element.
   */
  private extractContainerName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `container_${idValue}`;
            }
          }

          // Check for class attribute
          const classAttr = this.findAttribute(attributesNode, 'class', sourceCode);
          if (classAttr) {
            const classValue = this.getAttributeValue(classAttr, sourceCode);
            if (classValue) {
              const classes = classValue.split(/\s+/);
              if (classes.length > 0) {
                return `container_${classes[0]}`;
              }
            }
          }

          // Check for role attribute
          const roleAttr = this.findAttribute(attributesNode, 'role', sourceCode);
          if (roleAttr) {
            const roleValue = this.getAttributeValue(roleAttr, sourceCode);
            if (roleValue) {
              return `${roleValue}_container`;
            }
          }
        }
      }

      // Get the tag name
      const tagNameNode = node.childForFieldName('tag_name');
      if (tagNameNode) {
        return `${getNodeText(tagNameNode, sourceCode)}_container`;
      }

      return 'container';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML container name');
      return 'container';
    }
  }

  /**
   * Extracts a name for a heading element.
   */
  private extractHeadingName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `heading_${idValue}`;
            }
          }
        }
      }

      // Try to get the text content
      const textNode = this.findTextNode(node);
      if (textNode) {
        const text = getNodeText(textNode, sourceCode).trim();
        if (text.length > 0) {
          // Limit the length and convert to snake case
          const headingText = text.substring(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_');
          return `heading_${headingText}`;
        }
      }

      // Get the tag name
      const tagNameNode = node.childForFieldName('tag_name');
      if (tagNameNode) {
        return `${getNodeText(tagNameNode, sourceCode)}_heading`;
      }

      return 'heading';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML heading name');
      return 'heading';
    }
  }

  /**
   * Extracts a name for a list element.
   */
  private extractListName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `list_${idValue}`;
            }
          }

          // Check for class attribute
          const classAttr = this.findAttribute(attributesNode, 'class', sourceCode);
          if (classAttr) {
            const classValue = this.getAttributeValue(classAttr, sourceCode);
            if (classValue) {
              const classes = classValue.split(/\s+/);
              if (classes.length > 0) {
                return `list_${classes[0]}`;
              }
            }
          }
        }
      }

      // Get the tag name
      const tagNameNode = node.childForFieldName('tag_name');
      if (tagNameNode) {
        const tagName = getNodeText(tagNameNode, sourceCode);
        if (tagName === 'ul') {
          return 'unordered_list';
        } else if (tagName === 'ol') {
          return 'ordered_list';
        } else if (tagName === 'dl') {
          return 'definition_list';
        }
      }

      return 'list';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML list name');
      return 'list';
    }
  }

  /**
   * Extracts a name for a table element.
   */
  private extractTableName(node: SyntaxNode, sourceCode: string): string {
    try {
      const startTagNode = node.childForFieldName('start_tag');
      if (startTagNode) {
        const attributesNode = startTagNode.childForFieldName('attributes');
        if (attributesNode) {
          // Check for id attribute
          const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
          if (idAttr) {
            const idValue = this.getAttributeValue(idAttr, sourceCode);
            if (idValue) {
              return `table_${idValue}`;
            }
          }

          // Check for class attribute
          const classAttr = this.findAttribute(attributesNode, 'class', sourceCode);
          if (classAttr) {
            const classValue = this.getAttributeValue(classAttr, sourceCode);
            if (classValue) {
              const classes = classValue.split(/\s+/);
              if (classes.length > 0) {
                return `table_${classes[0]}`;
              }
            }
          }
        }
      }

      // Check for caption
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'element') {
          const tagNameNode = child.childForFieldName('tag_name');
          if (tagNameNode && getNodeText(tagNameNode, sourceCode) === 'caption') {
            const textNode = this.findTextNode(child);
            if (textNode) {
              const text = getNodeText(textNode, sourceCode).trim();
              if (text.length > 0) {
                // Limit the length and convert to snake case
                const captionText = text.substring(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, '_');
                return `table_${captionText}`;
              }
            }
          }
        }
      }

      return 'table';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML table name');
      return 'table';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'document') {
        // Try to get the title
        const titleNode = this.findTitleNode(node);
        if (titleNode) {
          const textNode = this.findTextNode(titleNode);
          if (textNode) {
            const text = getNodeText(textNode, sourceCode).trim();
            if (text.length > 0) {
              // Limit the length and convert to snake case
              const titleText = text.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_');
              return `HTML_${titleText}`;
            }
          }
        }

        // Default to the filename without extension
        if (this.options?.filePath) {
          return `HTML_${path.basename(this.options.filePath, path.extname(this.options.filePath))}`;
        }
      } else if (node.type === 'element') {
        const tagNameNode = node.childForFieldName('tag_name');
        if (tagNameNode) {
          const tagName = getNodeText(tagNameNode, sourceCode);

          // Check for special elements
          if (tagName === 'html') {
            return 'HTML_Document';
          } else if (tagName === 'head') {
            return 'HTML_Head';
          } else if (tagName === 'body') {
            return 'HTML_Body';
          }

          // Check for id attribute
          const startTagNode = node.childForFieldName('start_tag');
          if (startTagNode) {
            const attributesNode = startTagNode.childForFieldName('attributes');
            if (attributesNode) {
              const idAttr = this.findAttribute(attributesNode, 'id', sourceCode);
              if (idAttr) {
                const idValue = this.getAttributeValue(idAttr, sourceCode);
                if (idValue) {
                  return `${tagName}_${idValue}`;
                }
              }
            }
          }

          return `${tagName}_element`;
        }
      } else if (node.type === 'doctype') {
        return 'HTML_Doctype';
      }

      return 'HTML_Element';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML class name');
      return 'HTML_Element';
    }
  }

  /**
   * Finds the title element in an HTML document.
   */
  private findTitleNode(node: SyntaxNode): SyntaxNode | null {
    try {
      // Find the head element
      let headNode = null;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'element') {
          const tagNameNode = child.childForFieldName('tag_name');
          if (tagNameNode && getNodeText(tagNameNode, node.text) === 'html') {
            // Found the html element, now look for the head
            for (let j = 0; j < child.childCount; j++) {
              const htmlChild = child.child(j);
              if (htmlChild?.type === 'element') {
                const htmlChildTagNameNode = htmlChild.childForFieldName('tag_name');
                if (htmlChildTagNameNode && getNodeText(htmlChildTagNameNode, node.text) === 'head') {
                  headNode = htmlChild;
                  break;
                }
              }
            }
            break;
          }
        }
      }

      // If we found the head, look for the title
      if (headNode) {
        for (let i = 0; i < headNode.childCount; i++) {
          const child = headNode.child(i);
          if (child?.type === 'element') {
            const tagNameNode = child.childForFieldName('tag_name');
            if (tagNameNode && getNodeText(tagNameNode, node.text) === 'title') {
              return child;
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding HTML title node');
      return null;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'element') {
        const tagNameNode = node.childForFieldName('tag_name');
        if (tagNameNode) {
          const tagName = getNodeText(tagNameNode, sourceCode);

          // Handle link elements
          if (tagName === 'link') {
            const startTagNode = node.childForFieldName('start_tag');
            if (startTagNode) {
              const attributesNode = startTagNode.childForFieldName('attributes');
              if (attributesNode) {
                const hrefAttr = this.findAttribute(attributesNode, 'href', sourceCode);
                if (hrefAttr) {
                  return this.getAttributeValue(hrefAttr, sourceCode);
                }
              }
            }
          }

          // Handle script elements
          if (tagName === 'script') {
            const startTagNode = node.childForFieldName('start_tag');
            if (startTagNode) {
              const attributesNode = startTagNode.childForFieldName('attributes');
              if (attributesNode) {
                const srcAttr = this.findAttribute(attributesNode, 'src', sourceCode);
                if (srcAttr) {
                  return this.getAttributeValue(srcAttr, sourceCode);
                }
              }
            }
          }

          // Handle img elements
          if (tagName === 'img') {
            const startTagNode = node.childForFieldName('start_tag');
            if (startTagNode) {
              const attributesNode = startTagNode.childForFieldName('attributes');
              if (attributesNode) {
                const srcAttr = this.findAttribute(attributesNode, 'src', sourceCode);
                if (srcAttr) {
                  return this.getAttributeValue(srcAttr, sourceCode);
                }
              }
            }
          }

          // Handle iframe elements
          if (tagName === 'iframe') {
            const startTagNode = node.childForFieldName('start_tag');
            if (startTagNode) {
              const attributesNode = startTagNode.childForFieldName('attributes');
              if (attributesNode) {
                const srcAttr = this.findAttribute(attributesNode, 'src', sourceCode);
                if (srcAttr) {
                  return this.getAttributeValue(srcAttr, sourceCode);
                }
              }
            }
          }
        }
      } else if (node.type === 'attribute') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Handle import attributes
          if (name === 'href' || name === 'src' || name === 'data-src' || name === 'import') {
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              return getNodeText(valueNode, sourceCode).replace(/^["']|["']$/g, '');
            }
          }
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // HTML doesn't have traditional function comments, but we can extract comments
      // that precede elements or look for title/alt attributes

      if (node.type === 'element') {
        const startTagNode = node.childForFieldName('start_tag');
        if (startTagNode) {
          const attributesNode = startTagNode.childForFieldName('attributes');
          if (attributesNode) {
            // Check for title attribute
            const titleAttr = this.findAttribute(attributesNode, 'title', sourceCode);
            if (titleAttr) {
              return this.getAttributeValue(titleAttr, sourceCode);
            }

            // Check for alt attribute
            const altAttr = this.findAttribute(attributesNode, 'alt', sourceCode);
            if (altAttr) {
              return this.getAttributeValue(altAttr, sourceCode);
            }

            // Check for aria-label attribute
            const ariaLabelAttr = this.findAttribute(attributesNode, 'aria-label', sourceCode);
            if (ariaLabelAttr) {
              return this.getAttributeValue(ariaLabelAttr, sourceCode);
            }
          }
        }
      }

      // Look for HTML comments before the node
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Extract the comment text
        const commentText = getNodeText(prev, sourceCode);

        // Remove comment markers and whitespace
        return commentText
          .replace(/^<!--\s*|\s*-->$/g, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'document') {
        // Try to get the meta description
        const metaDescription = this.findMetaDescription(node, sourceCode);
        if (metaDescription) {
          return metaDescription;
        }
      }

      // Look for HTML comments before the node
      const current = node;
      let prev = current.previousNamedSibling;

      while (prev && prev.type !== 'comment') {
        prev = prev.previousNamedSibling;
      }

      if (prev && prev.type === 'comment') {
        // Extract the comment text
        const commentText = getNodeText(prev, sourceCode);

        // Remove comment markers and whitespace
        return commentText
          .replace(/^<!--\s*|\s*-->$/g, '')
          .trim();
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting HTML class comment');
      return undefined;
    }
  }

  /**
   * Finds the meta description in an HTML document.
   */
  private findMetaDescription(node: SyntaxNode, sourceCode: string): string | null {
    try {
      // Find the head element
      let headNode = null;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'element') {
          const tagNameNode = child.childForFieldName('tag_name');
          if (tagNameNode && getNodeText(tagNameNode, sourceCode) === 'html') {
            // Found the html element, now look for the head
            for (let j = 0; j < child.childCount; j++) {
              const htmlChild = child.child(j);
              if (htmlChild?.type === 'element') {
                const htmlChildTagNameNode = htmlChild.childForFieldName('tag_name');
                if (htmlChildTagNameNode && getNodeText(htmlChildTagNameNode, sourceCode) === 'head') {
                  headNode = htmlChild;
                  break;
                }
              }
            }
            break;
          }
        }
      }

      // If we found the head, look for meta description
      if (headNode) {
        for (let i = 0; i < headNode.childCount; i++) {
          const child = headNode.child(i);
          if (child?.type === 'element') {
            const tagNameNode = child.childForFieldName('tag_name');
            if (tagNameNode && getNodeText(tagNameNode, sourceCode) === 'meta') {
              const startTagNode = child.childForFieldName('start_tag');
              if (startTagNode) {
                const attributesNode = startTagNode.childForFieldName('attributes');
                if (attributesNode) {
                  const nameAttr = this.findAttribute(attributesNode, 'name', sourceCode);
                  if (nameAttr && this.getAttributeValue(nameAttr, sourceCode) === 'description') {
                    const contentAttr = this.findAttribute(attributesNode, 'content', sourceCode);
                    if (contentAttr) {
                      return this.getAttributeValue(contentAttr, sourceCode);
                    }
                  }
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error finding HTML meta description');
      return null;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Bootstrap detection
      if (sourceCode.includes('bootstrap.') ||
          sourceCode.includes('class="container') ||
          sourceCode.includes('class="row')) {
        return 'bootstrap';
      }

      // Tailwind detection
      if (sourceCode.includes('tailwind') ||
          sourceCode.includes('class="text-') ||
          sourceCode.includes('class="bg-')) {
        return 'tailwind';
      }

      // React detection
      if (sourceCode.includes('react.') ||
          sourceCode.includes('ReactDOM') ||
          sourceCode.includes('data-reactroot')) {
        return 'react';
      }

      // Angular detection
      if (sourceCode.includes('ng-') ||
          sourceCode.includes('angular.') ||
          sourceCode.includes('[(ngModel)]')) {
        return 'angular';
      }

      // Vue detection
      if (sourceCode.includes('vue.') ||
          sourceCode.includes('v-') ||
          sourceCode.includes('data-v-')) {
        return 'vue';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting HTML framework');
      return null;
    }
  }
}
