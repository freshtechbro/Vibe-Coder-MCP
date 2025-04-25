import logger from '../../logger.js';
import { CallToolResult } from '../../types/mcp.js';

/**
 * Defines the structure for storing a single interaction within a session's history.
 */
export interface InteractionHistory {
  /** Details of the tool call made. */
  toolCall: {
    /** The name of the tool that was called. */
    name: string;
    /** The parameters passed to the tool. */
    params: Record<string, unknown>;
    /** Timestamp (ms since epoch) when the tool call was initiated. */
    timestamp: number;
  };
  /** The result returned by the tool call. */
  response: CallToolResult & {
    /** Timestamp (ms since epoch) when the tool response was received/recorded. */
    timestamp: number;
  };
}

// In-memory store: Map<sessionId, InteractionHistory[]>
// Stores an array of interactions for each session ID.
const sessionHistories = new Map<string, InteractionHistory[]>();

// Configuration for history limits
const MAX_HISTORY_LENGTH = 10; // Keep the last N interactions per session

/**
 * Adds a completed interaction to a session's history.
 * Enforces history length limits by removing the oldest entry if the limit is exceeded.
 * Logs a warning if no sessionId is provided.
 *
 * @param sessionId The unique identifier for the session. Must be a non-empty string.
 * @param historyEntry The interaction details (tool call and response) to add.
 */
export function addInteraction(
  sessionId: string,
  historyEntry: InteractionHistory
): void {
  if (!sessionId || typeof sessionId !== 'string') {
    logger.warn('Attempted to add interaction without a valid session ID.');
    return;
  }

  if (!sessionHistories.has(sessionId)) {
    sessionHistories.set(sessionId, []);
  }

  const history = sessionHistories.get(sessionId)!;
  history.push(historyEntry);

  // Enforce history limit - remove oldest entry if over limit
  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
    logger.debug(
      `History limit reached for session ${sessionId}. Removed oldest entry.`
    );
  }

  logger.debug(
    `Added interaction to history for session ${sessionId}. History length: ${history.length}`
  );
}

/**
 * Retrieves the most recent interaction for a given session.
 *
 * @param sessionId The unique identifier for the session.
 * @returns The last InteractionHistory entry, or undefined if the session ID is invalid or no history exists.
 */
export function getLastInteraction(
  sessionId: string
): InteractionHistory | undefined {
  if (!sessionId || typeof sessionId !== 'string') return undefined;

  const history = sessionHistories.get(sessionId);
  if (history && history.length > 0) {
    return history[history.length - 1];
  }
  logger.debug(
    `No history found for session ${sessionId} when getting last interaction.`
  );
  return undefined;
}

/**
 * Retrieves the entire interaction history for a given session.
 *
 * @param sessionId The unique identifier for the session.
 * @returns An array of InteractionHistory entries, or an empty array if the session ID is invalid or no history exists.
 */
export function getSessionHistory(sessionId: string): InteractionHistory[] {
  if (!sessionId || typeof sessionId !== 'string') return [];
  return sessionHistories.get(sessionId) || [];
}

/**
 * Clears the interaction history for a specific session.
 *
 * @param sessionId The unique identifier for the session whose history should be cleared.
 */
export function clearSessionHistory(sessionId: string): void {
  if (!sessionId || typeof sessionId !== 'string') return;
  if (sessionHistories.has(sessionId)) {
    sessionHistories.delete(sessionId);
    logger.info(`Cleared history for session ${sessionId}.`);
  } else {
    logger.debug(
      `Attempted to clear history for non-existent session ${sessionId}.`
    );
  }
}

/**
 * Clears all stored session histories. Useful for server restarts or specific reset commands.
 */
export function clearAllHistories(): void {
  sessionHistories.clear();
  logger.info('Cleared all session histories.');
}
