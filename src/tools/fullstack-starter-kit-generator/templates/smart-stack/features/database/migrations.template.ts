import { z } from 'zod';

export interface MigrationsConfig {
  database: 'postgresql' | 'mysql';
  entities: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      unique?: boolean;
      references?: string;
    }>;
  }>;
}

const configSchema = z.object({
  database: z.enum(['postgresql', 'mysql']),
  entities: z.array(
    z.object({
      name: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          nullable: z.boolean().optional(),
          unique: z.boolean().optional(),
          references: z.string().optional(),
        })
      ),
    })
  ),
});

export function generateMigrations(
  config: MigrationsConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'database/migrations/20240101000000_initial.ts',
      content: `
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  ${validatedConfig.entities
    .map(
      (entity) => `
  await knex.schema.createTable('${entity.name}', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    ${entity.fields
      .map((field) => {
        let line = `table.${field.type}('${field.name}')`;
        if (field.nullable === false) line += '.notNullable()';
        if (field.unique) line += '.unique()';
        if (field.references) {
          line +=
            `.references('${field.references.split('.')[1] || 'id'}')` +
            `.inTable('${field.references.split('.')[0]}')` +
            `.onDelete('CASCADE')`;
        }
        return line + ';';
      })
      .join('\n    ')}
    table.timestamps(true, true);
  });`
    )
    .join('\n\n  ')}
}

export async function down(knex: Knex): Promise<void> {
  ${validatedConfig.entities
    .reverse()
    .map(
      (entity) => `
  await knex.schema.dropTableIfExists('${entity.name}');`
    )
    .join('\n  ')}
}`,
    },
    {
      path: 'database/migrations/migrator.ts',
      content: `
import { Knex } from 'knex';
import { config } from '../config';

const migrator = {
  async migrate(knex: Knex) {
    await knex.migrate.latest({
      directory: __dirname
    });
  },

  async rollback(knex: Knex) {
    await knex.migrate.rollback({
      directory: __dirname
    });
  },

  async reset(knex: Knex) {
    await knex.migrate.rollback({ all: true });
    await knex.migrate.latest();
  }
};

export { migrator };`,
    },
    {
      path: 'database/migrations/types.ts',
      content: `
export interface Migration {
  id: number;
  name: string;
  batch: number;
  migration_time: Date;
}

export interface MigrationConfig {
  directory: string;
  tableName?: string;
  schemaName?: string;
  disableTransactions?: boolean;
}`,
    },
  ];
}
