/**
 * Declaration file for global types and module augmentations
 */

// Add Node.js process declarations
declare namespace NodeJS {
  export interface ProcessEnv {
    OPENROUTER_API_KEY: string;
    OPENROUTER_BASE_URL: string;
    GEMINI_MODEL: string;
    PERPLEXITY_MODEL: string;
    PORT: string;
    NODE_ENV: 'development' | 'production' | 'test';
  }
}

// Extend Express Request interface if needed
declare namespace Express {
  // This empty interface is intentional as a placeholder for future extension
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Request {
    // Add custom properties if needed
  }
}

// Add any global type declarations here

declare module 'ws';
declare module '@socket.io/redis-adapter';
declare module 'prom-client';
