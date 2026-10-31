import zod from "zod";

/** POST /auth/register — the installation's first (and only) user. */
export const RegisterUserInSchema = zod.object({
	email: zod.string(),
	username: zod.string(),
	password: zod.string(),
});

/** POST /auth/register — the account was made. */
export const RegisterUserOutSchema = zod.object({
	status: zod.literal("ok"),
});

/** POST /auth/login/:provider — the session: an access token, and a refresh token to renew it. */
export const LoginUserOutSchema = zod.object({
	accessToken: zod.string(),
	refreshToken: zod.string(),
});

/** POST /auth/refresh — the refresh token to renew the session with. */
export const RefreshTokenInSchema = zod.object({
	refreshToken: zod.string(),
});

/** POST /auth/refresh — the renewed session (the refresh token rotates). */
export const RefreshTokenOutSchema = zod.object({
	accessToken: zod.string(),
	refreshToken: zod.string(),
});

/** GET /auth/setup-status — whether the installation has its user yet. */
export const SetupStatusOutSchema = zod.object({
	hasUser: zod.boolean(),
});

/** POST /auth/register — the installation's first (and only) user. */
export type RegisterUserIn = zod.infer<typeof RegisterUserInSchema>;
/** POST /auth/register — the account was made. */
export type RegisterUserOut = zod.infer<typeof RegisterUserOutSchema>;
/** POST /auth/login/:provider — the session: an access token, and a refresh token to renew it. */
export type LoginUserOut = zod.infer<typeof LoginUserOutSchema>;
/** POST /auth/refresh — the refresh token to renew the session with. */
export type RefreshTokenIn = zod.infer<typeof RefreshTokenInSchema>;
/** POST /auth/refresh — the renewed session (the refresh token rotates). */
export type RefreshTokenOut = zod.infer<typeof RefreshTokenOutSchema>;
/** GET /auth/setup-status — whether the installation has its user yet. */
export type SetupStatusOut = zod.infer<typeof SetupStatusOutSchema>;
