import { z } from 'zod';

export interface SeedsConfig {
  database: 'postgresql' | 'mysql';
  entities: Array<{
    name: string;
    data: Array<Record<string, unknown>>;
  }>;
}

const configSchema = z.object({
  database: z.enum(['postgresql', 'mysql']),
  entities: z.array(
    z.object({
      name: z.string(),
      data: z.array(z.record(z.unknown())),
    })
  ),
});

export function generateSeeds(
  config: SeedsConfig
): Array<{ path: string; content: string }> {
  const validatedConfig = configSchema.parse(config);

  return [
    {
      path: 'database/seeds/01_roles.ts',
      content: `
import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Delete existing entries
  await knex('roles').del();

  // Insert seed entries
  await knex('roles').insert([
    { name: 'admin', description: 'Administrator' },
    { name: 'user', description: 'Regular user' },
    { name: 'guest', description: 'Guest user' }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('roles').del();
}`,
    },
    {
      path: 'database/seeds/02_users.ts',
      content: `
import { Knex } from 'knex';
import { hashPassword } from '../../auth/password';

export async function seed(knex: Knex): Promise<void> {
  // Delete existing entries
  await knex('users').del();

  // Insert seed entries
  await knex('users').insert([
    {
      email: 'admin@example.com',
      password: await hashPassword('admin123'),
      role: 'admin',
      name: 'Admin User'
    },
    {
      email: 'user@example.com',
      password: await hashPassword('user123'),
      role: 'user',
      name: 'Regular User'
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('users').del();
}`,
    },
    {
      path: 'database/seeds/03_settings.ts',
      content: `
import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Delete existing entries
  await knex('settings').del();

  // Insert seed entries
  await knex('settings').insert([
    { key: 'maintenance_mode', value: 'false', type: 'boolean' },
    { key: 'site_name', value: 'My Application', type: 'string' },
    { key: 'max_upload_size', value: '5242880', type: 'number' }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex('settings').del();
}`,
    },
  ];
}
