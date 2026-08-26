import type { Cookies } from '@sveltejs/kit';
import { findById, getSessionSecret, toSafeUser, type SafeUser } from '$lib/server/users';
import { signSession, verifySession } from '$lib/server/token';

const COOKIE_NAME = 'tentacle_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 jours

export function setSessionCookie(cookies: Cookies, userId: string, secure: boolean): void {
	cookies.set(COOKIE_NAME, signSession(userId, getSessionSecret(), MAX_AGE_SEC), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: MAX_AGE_SEC
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

/** Resolves the authenticated user from the request cookie, or null. */
export function userFromCookies(cookies: Cookies): SafeUser | null {
	const token = cookies.get(COOKIE_NAME);
	if (!token) return null;
	const uid = verifySession(token, getSessionSecret());
	if (!uid) return null;
	const user = findById(uid);
	return user ? toSafeUser(user) : null;
}
