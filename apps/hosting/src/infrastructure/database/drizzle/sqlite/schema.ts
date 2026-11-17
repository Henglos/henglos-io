import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, blob, primaryKey, unique } from 'drizzle-orm/sqlite-core';

// The hosting's SQLite schema (Drizzle). A change here needs a migration:
// `npm run db:generate -- --name <what>` — see drizzle/migrations.

// The user accounts. `password` is its argon2id hash; `refresh_token` the
// SHA-256 of the current session's refresh token.
export const users = sqliteTable('users', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	username: text('username', { length: 30 }).notNull().unique(),
	email: text('email', { length: 254 }).notNull().unique(),
	password: text('password', { length: 255 }).notNull(),

	refreshToken: text('refresh_token', { length: 64 }).unique(),
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),

	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
	accountPackages: many(accountPackages),
	workflows: many(workflows),
	drivers: many(drivers),
}));


// Every package version read from a registry — once per spec@version, shared
// by every user who installs it. `schema` is its board or component schema;
// `platform`, the platform versions it works with.
export const packages = sqliteTable('packages', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text('name', { length: 214 }).notNull(),
	spec: text('spec', { length: 214 }).notNull(),
	version: text('version', { length: 256 }).notNull(),
	author: text('author', { length: 512 }).notNull().default(''),
	description: text('description', { length: 1024 }).notNull().default(''),
	type: text('type', { enum: ['board', 'component'] }).notNull(),
	schema: text('schema', { mode: 'json' }).notNull(),
	registry: text('registry', { length: 512 }).notNull(),
	platform: text('platform', { length: 32 }).notNull(),
}, (table) => [
	unique('packages_spec_version_unique').on(table.spec, table.version),
]);

export const packagesRelations = relations(packages, ({ many }) => ({
	accountPackages: many(accountPackages),
	packageLinks: many(packageLinks),
}));

// The users' libraries: which package versions each one installed — with the
// registry token, for a private package.
export const accountPackages = sqliteTable('account_packages', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id),
	packageId: text('package_id', { length: 36 }).notNull().references(() => packages.id),
	token: text('token', { length: 512 }),
}, (table) => [
	unique('account_packages_user_package_unique').on(table.userId, table.packageId),
]);

// The default packages (config/default-packages.json) each user was already
// offered, by name — installed then, or found in the library. A package added
// to that list later is installed on the next start; one the user removed
// stays removed.
export const defaultPackageOffers = sqliteTable('default_package_offers', {
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name', { length: 214 }).notNull(),
	offeredAt: integer('offered_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
	primaryKey({ columns: [table.userId, table.name] }),
]);

export const accountPackagesRelations = relations(accountPackages, ({ one, many }) => ({
	user: one(users, { fields: [accountPackages.userId], references: [users.id] }),
	package: one(packages, { fields: [accountPackages.packageId], references: [packages.id] }),
	packageLinks: many(packageLinks),
}));

// What a workflow points at for its board and its components: an account
// package (`user`) or a package (`native`). Both null: detached — its package
// was removed (DeletePackage).
export const packageLinks = sqliteTable('package_links', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	packageId: text('package_id', { length: 36 }).references(() => packages.id),
	accountPackageId: text('account_package_id', { length: 36 }).references(() => accountPackages.id),
	origin: text('origin', { enum: ['user', 'native'] }).notNull(),
});

export const packageLinksRelations = relations(packageLinks, ({ one, many }) => ({
	package: one(packages, { fields: [packageLinks.packageId], references: [packages.id] }),
	accountPackage: one(accountPackages, { fields: [packageLinks.accountPackageId], references: [accountPackages.id] }),
	workflowComponents: many(workflowComponents),
}));

// The workflows. `data` is the workflow itself (@henglosio/workflow's model,
// as JSON); `board_id`, the package link of its board.
export const workflows = sqliteTable('workflows', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id),
	data: text('data', { mode: 'json' }).notNull(),
	// Yjs state of the collaborative doc (see WorkflowCollabService). `data` stays the
	// source of truth — this only keeps Yjs history so reconnecting clients merge cleanly.
	collabState: blob('collab_state', { mode: 'buffer' }),

	boardId: text('board_id', { length: 36 }).notNull(),
	platform: text('platform', { length: 32 }).notNull(),

	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
	user: one(users, { fields: [workflows.userId], references: [users.id] }),
	workflowComponents: many(workflowComponents),
	files: many(workflowFiles),
}));

// The explicit join table of the many-to-many Workflow <-> PackageLink: a
// workflow's components (Prisma used to make it implicitly).
export const workflowComponents = sqliteTable('workflow_components', {
	workflowId: text('workflow_id', { length: 36 }).notNull().references(() => workflows.id, { onDelete: 'cascade' }),
	packageLinkId: text('package_link_id', { length: 36 }).notNull().references(() => packageLinks.id),
}, (table) => [
	primaryKey({ columns: [table.workflowId, table.packageLinkId] }),
]);

export const workflowComponentsRelations = relations(workflowComponents, ({ one }) => ({
	workflow: one(workflows, { fields: [workflowComponents.workflowId], references: [workflows.id] }),
	packageLink: one(packageLinks, { fields: [workflowComponents.packageLinkId], references: [packageLinks.id] }),
}));

// Files attached to a workflow's configs (`type: file`) — a bitmap for a
// display... Small (WORKFLOW_FILE_MAX_BYTES), so kept in the database; they
// reach the board with the components when a session starts.
export const workflowFiles = sqliteTable('workflow_files', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	workflowId: text('workflow_id', { length: 36 }).notNull().references(() => workflows.id, { onDelete: 'cascade' }),
	name: text('name', { length: 255 }).notNull(),
	mime: text('mime', { length: 127 }).notNull(),
	size: integer('size').notNull(),
	sha256: text('sha256', { length: 64 }).notNull(),
	data: blob('data', { mode: 'buffer' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const workflowFilesRelations = relations(workflowFiles, ({ one }) => ({
	workflow: one(workflows, { fields: [workflowFiles.workflowId], references: [workflows.id] }),
}));

// A user's credentials (n8n-style) — `data` is every field, as JSON,
// encrypted (SecretBox): the hosting reads it only to put it on a board or
// show the non-secret fields back.
export const credentials = sqliteTable('credentials', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
	type: text('type', { length: 64 }).notNull(),
	name: text('name', { length: 100 }).notNull(),
	data: text('data').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const credentialsRelations = relations(credentials, ({ one }) => ({
	user: one(users, { fields: [credentials.userId], references: [users.id] }),
}));

// The pair tokens waiting for a driver to use them — 15 minutes each.
export const driverPairTokens = sqliteTable('driver_pair_token', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id),
	token: text('pair_token', { length: 64 }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date(Date.now() + 15 * 60 * 1000)),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});


// The drivers paired with the accounts: one machine (and OS user) each.
// `refresh_token` is the SHA-256 of its refresh token.
export const drivers = sqliteTable('drivers', {
	id: text('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id', { length: 36 }).notNull().references(() => users.id),
	
	refreshToken: text('refresh_token', { length: 64 }).unique(),
	refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),

	deviceName: text('device_name', { length: 255 }),
	deviceUser: text('device_user', { length: 255 }),

	name: text('name', { length: 100 }).notNull(),
});

export const driversRelations = relations(drivers, ({ one }) => ({
	user: one(users, { fields: [drivers.userId], references: [users.id] }),
}));

// The tables and their relations, together. (SqliteConnection builds the
// Drizzle database from this whole module, so it has every one of them.)
export const schema = {
	users,
	usersRelations,
	packages,
	packagesRelations,
	accountPackages,
	accountPackagesRelations,
	packageLinks,
	packageLinksRelations,
	workflows,
	workflowsRelations,
	workflowComponents,
	workflowComponentsRelations,
	workflowFiles,
	workflowFilesRelations,
	drivers,
	driverPairTokens,
	driversRelations,
};
