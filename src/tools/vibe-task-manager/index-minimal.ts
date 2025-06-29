// HANG DETECTION: Minimal version to test import hanging
import logger from '../../logger.js';

logger.error('HANG DETECTION: Minimal vibe-task-manager loaded successfully');

export const testFunction = () => {
  return "test successful";
};
