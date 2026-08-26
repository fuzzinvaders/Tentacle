import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { hashPassword, verifyPassword } from '$lib/server/password';

export type User = {
	id: string;
	username: string;
	passwordHash: string;
	isAdmin: boolean;
	createdAt: string;
	/** Profil applicatif par utilisateur (connexions aux sources + préférences +
	 * radios), synchronisé côté serveur pour survivre au changement de navigateur.
	 * Blob opaque côté serveur — sa forme est définie par le client (profileSync). */
	profile?: unknown;
};

/** Public shape exposed to the client / put in locals — never includes the hash. */
export type SafeUser = { id: string; username: string; isAdmin: boolean; createdAt: string };

type Store = {
	users: User[];
	/** Session-signing secret; generated and persisted if AUTH_SECRET isn't provided. */
	secret?: string;
};

const DATA_DIR = env.DATA_DIR || '.data';
const DATA_FILE = join(DATA_DIR, 'users.json');

function readStore(): Store {
	if (!existsSync(DATA_FILE)) return { users: [] };
	try {
		const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
		return { users: Array.isArray(parsed.users) ? parsed.users : [], secret: parsed.secret };
	} catch {
		return { users: [] };
	}
}

function writeStore(store: Store): void {
	if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
	// Écriture atomique : fichier temporaire puis renommage.
	const tmp = `${DATA_FILE}.tmp`;
	writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
	renameSync(tmp, DATA_FILE);
}

export function toSafeUser(u: User): SafeUser {
	return { id: u.id, username: u.username, isAdmin: u.isAdmin, createdAt: u.createdAt };
}

// ---- API du store ----

export function userCount(): number {
	return readStore().users.length;
}

export function listUsers(): SafeUser[] {
	return readStore().users.map(toSafeUser);
}

export function findByUsername(username: string): User | undefined {
	const u = username.trim().toLowerCase();
	return readStore().users.find((x) => x.username.toLowerCase() === u);
}

export function findById(id: string): User | undefined {
	return readStore().users.find((x) => x.id === id);
}

export type CreateResult = { ok: true; user: SafeUser } | { ok: false; error: string };

export function createUser(username: string, password: string, isAdmin: boolean): CreateResult {
	const name = username.trim();
	if (name.length < 2) return { ok: false, error: "Nom d'utilisateur trop court (2 caractères min)." };
	if (password.length < 6) return { ok: false, error: 'Mot de passe trop court (6 caractères min).' };
	const store = readStore();
	if (store.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
		return { ok: false, error: 'Cet identifiant existe déjà.' };
	}
	const user: User = {
		id: randomBytes(9).toString('hex'),
		username: name,
		passwordHash: hashPassword(password),
		isAdmin,
		createdAt: new Date().toISOString()
	};
	store.users.push(user);
	writeStore(store);
	return { ok: true, user: toSafeUser(user) };
}

/** Profil applicatif sauvegardé côté serveur pour cet utilisateur (ou null). */
export function getProfile(id: string): unknown {
	return readStore().users.find((u) => u.id === id)?.profile ?? null;
}

export function setProfile(id: string, profile: unknown): boolean {
	const store = readStore();
	const idx = store.users.findIndex((u) => u.id === id);
	if (idx === -1) return false;
	store.users[idx] = { ...store.users[idx], profile };
	writeStore(store);
	return true;
}

export function deleteUser(id: string): void {
	const store = readStore();
	store.users = store.users.filter((u) => u.id !== id);
	writeStore(store);
}

/** Verifies credentials; returns the user on success. */
export function authenticate(username: string, password: string): User | null {
	const user = findByUsername(username);
	if (!user) return null;
	return verifyPassword(password, user.passwordHash) ? user : null;
}

/** Verifies a plaintext password against one specific account (used for self-service password changes). */
export function verifyPasswordForUser(id: string, password: string): boolean {
	const user = findById(id);
	if (!user) return false;
	return verifyPassword(password, user.passwordHash);
}

export type UpdateResult = { ok: true } | { ok: false; error: string };

/** Sets a new password for an existing account (self-service change or admin reset). */
export function updatePassword(id: string, newPassword: string): UpdateResult {
	if (newPassword.length < 6) return { ok: false, error: 'Mot de passe trop court (6 caractères min).' };
	const store = readStore();
	const idx = store.users.findIndex((u) => u.id === id);
	if (idx === -1) return { ok: false, error: 'Utilisateur introuvable.' };
	store.users[idx] = { ...store.users[idx], passwordHash: hashPassword(newPassword) };
	writeStore(store);
	return { ok: true };
}

// Cache mémoire : le secret est immuable pour toute la durée du process (fixé par
// AUTH_SECRET, ou généré une seule fois puis persisté) — évite une lecture disque
// a chaque requete une fois resolu.
let cachedSecret: string | null = null;

/** The secret used to sign session cookies. Prefers AUTH_SECRET, else persists a random one. */
export function getSessionSecret(): string {
	if (env.AUTH_SECRET) return env.AUTH_SECRET;
	if (cachedSecret) return cachedSecret;
	const store = readStore();
	if (store.secret) {
		cachedSecret = store.secret;
		return cachedSecret;
	}
	const secret = randomBytes(32).toString('hex');
	writeStore({ ...store, secret });
	cachedSecret = secret;
	return secret;
}
