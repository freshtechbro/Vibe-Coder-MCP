import logger from '../../logger.js';

import { BaseHandler } from './base-handler.js';
import { FullstackStarterKitHandler } from './fullstack-starter-kit-handler.js';

export class HandlerFactory {
  private static instance: HandlerFactory;
  private handlers: Map<string, BaseHandler>;

  private constructor() {
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  public static getInstance(): HandlerFactory {
    if (!HandlerFactory.instance) {
      HandlerFactory.instance = new HandlerFactory();
    }
    return HandlerFactory.instance;
  }

  private registerDefaultHandlers(): void {
    this.registerHandler(new FullstackStarterKitHandler());
  }

  public registerHandler(handler: BaseHandler): void {
    this.handlers.set(handler.name, handler);
    logger.info({ handlerName: handler.name }, 'Registered handler');
  }

  public getHandler(name: string): BaseHandler | undefined {
    return this.handlers.get(name);
  }

  public getAllHandlers(): BaseHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Clear all registered handlers
   * Used primarily for testing purposes
   */
  public clearHandlers(): void {
    this.handlers.clear();
    logger.info('Cleared all handlers');
  }
}

export const handlerFactory = HandlerFactory.getInstance();
