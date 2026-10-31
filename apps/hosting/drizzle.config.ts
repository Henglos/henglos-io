import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/infrastructure/database/drizzle/sqlite/schema.ts',
	out: './drizzle/migrations',
	dbCredentials: {
		url: process.env.HIO_DATABASE_URL!.replace(/^file:/, ''),
	},
});
