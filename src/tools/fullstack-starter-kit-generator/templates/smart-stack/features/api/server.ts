import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import logger from '../../logger.js';

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Error handling
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, 'Server error');
    res.status(500).json({ error: 'Internal server error' });
  }
);

export { app };
