import { z } from 'zod';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  schema: string;
  ssl: boolean;
  poolSize: number;
}

const configSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  schema: z.string(),
  ssl: z.boolean(),
  poolSize: z.number(),
});

export function generatePostgresConfig(
  config: PostgresConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'database/connection.ts',
      content: `
import { Pool } from 'pg';
import { config } from './config';
import logger from '../logger';

const pool = new Pool({
  host: '${validatedConfig.host}',
  port: ${validatedConfig.port},
  database: '${validatedConfig.database}',
  ssl: ${validatedConfig.ssl},
  max: ${validatedConfig.poolSize}
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle client');
  process.exit(-1);
});

export { pool };`,
    },
    {
      path: 'database/types.ts',
      content: `
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  schema: string;
  ssl: boolean;
  poolSize: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: Array<{
    name: string;
    tableID: number;
    columnID: number;
    dataTypeID: number;
    dataTypeSize: number;
    dataTypeModifier: number;
    format: string;
  }>;
}`,
    },
    {
      path: 'database/config.ts',
      content: `
import { DatabaseConfig } from './types';

export const config: DatabaseConfig = {
  host: '${validatedConfig.host}',
  port: ${validatedConfig.port},
  database: '${validatedConfig.database}',
  schema: '${validatedConfig.schema}',
  ssl: ${validatedConfig.ssl},
  poolSize: ${validatedConfig.poolSize}
};`,
    },
    {
      path: 'database/migrations/index.ts',
      content: `
import { migrator } from './migrator';
import { pool } from '../connection';
import logger from '../../logger';

export async function runMigrations() {
  try {
    await migrator.migrate(pool);
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to run migrations');
    throw error;
  }
}`,
    },
    {
      path: 'database/seeds/index.ts',
      content: `
import { pool } from '../connection';
import logger from '../../logger';

export async function runSeeds() {
  try {
    // Add seed data here
    logger.info('Seeds completed successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to run seeds');
    throw error;
  }
}`,
    },
  ];
}
