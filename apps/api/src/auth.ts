import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'qr_admin_session';
const SESSION_SECONDS = 60 * 60 * 12;

function sessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('SESSION_SECRET must contain at least 32 characters.');
    }
    return secret;
}

function sign(value: string) {
    return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

export function createSession(email: string) {
    const payload = Buffer.from(JSON.stringify({
        email,
        exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
}

export function readSession(token?: string) {
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
            email: string;
            exp: number;
        };
        return session.exp > Date.now() / 1000 ? session : null;
    } catch {
        return null;
    }
}

export function setSessionCookie(response: Response, token: string) {
    response.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_SECONDS * 1000,
        path: '/',
    });
}

export function clearSessionCookie(response: Response) {
    response.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    });
}

export function requireSession(request: Request, response: Response, next: NextFunction) {
    const token = request.cookies?.[COOKIE_NAME] as string | undefined;
    const session = readSession(token);
    if (!session) {
        response.status(401).json({ error: 'Authentification requise.' });
        return;
    }
    response.locals.adminEmail = session.email;
    next();
}

function parseHttpOrigin(value: string) {
    try {
        const origin = new URL(value);
        return ['http:', 'https:'].includes(origin.protocol) ? origin : null;
    } catch {
        return null;
    }
}

export function isTrustedOrigin(
    origin: string | undefined,
    configuredOrigins = process.env.FRONTEND_URL,
    production = process.env.NODE_ENV === 'production',
) {
    const requestOrigin = origin ? parseHttpOrigin(origin) : null;
    const allowedOrigins = configuredOrigins
        ?.split(',')
        .map((value) => parseHttpOrigin(value.trim()))
        .filter((value): value is URL => value !== null) ?? [];

    if (!requestOrigin) return false;

    return allowedOrigins.some((allowedOrigin) => {
        if (requestOrigin.protocol !== allowedOrigin.protocol) return false;
        if (production) return requestOrigin.origin === allowedOrigin.origin;

        const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
        return requestOrigin.hostname === allowedOrigin.hostname
            || (localHosts.has(requestOrigin.hostname) && localHosts.has(allowedOrigin.hostname))
            || localHosts.has(requestOrigin.hostname);
    });
}

export function requireTrustedOrigin(request: Request, response: Response, next: NextFunction) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)
        && !isTrustedOrigin(request.get('origin'))) {
        response.status(403).json({ error: 'Origine non autorisée.' });
        return;
    }
    next();
}