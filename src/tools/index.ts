// Import all tool modules to ensure their registration logic runs
import logger from '../logger.js';

// Research tools
import './research-manager/index.js';

// Generation tools
import './rules-generator/index.js';
import './prd-generator/index.js';
import './task-list-generator/index.js';

// Code tools
import './code-stub-generator/index.js';
import './code-refactor-generator/index.js';
import './git-summary-generator/index.js';
import './dependency-analyzer/index.js';

// Workflow tools
import './workflow-runner/index.js';

logger.info('All tool modules imported for registration.');

// This file ensures all tools are registered when imported
import { HandlerFactory } from '../core/handlers/handler-factory.js';
import { FullstackStarterKitHandler } from '../core/handlers/fullstack-starter-kit-handler.js';

// Register all handlers
const handlerFactory = HandlerFactory.getInstance();
handlerFactory.registerHandler(new FullstackStarterKitHandler());
