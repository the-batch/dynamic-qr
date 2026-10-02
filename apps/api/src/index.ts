import { createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import geoip from 'geoip-lite';
import helmet from 'helmet';
import QRCode from 'qrcode';
import { UAParser } from 'ua-parser-js';
import { clearSessionCookie, createSession, requireSession, requireTrustedOrigin, setSessionCookie } from './auth';
import { pool } from './db';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const redirectBaseUrl = process.env.PUBLIC_REDIRECT_BASE_URL ?? 'http://localhost:4000';
const ipHashSecret = process.env.IP_HASH_SECRET;

if (!ipHashSecret || ipHashSecret.length < 32) {
    throw new Error('IP_HASH_SECRET must contain at least 32 characters.');
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32
    || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH || !process.env.FRONTEND_URL) {
    throw new Error('Configure SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH and FRONTEND_URL.');
}
if (!/^\$2[aby]\$\d{2}\$/.test(process.env.ADMIN_PASSWORD_HASH)
    || Number(process.env.ADMIN_PASSWORD_HASH.slice(4, 6)) < 10) {
    throw new Error('ADMIN_PASSWORD_HASH must be a bcrypt hash with a cost of at least 10.');
}
if (process.env.SESSION_SECRET === ipHashSecret) {
    throw new Error('SESSION_SECRET and IP_HASH_SECRET must be different values.');
}

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});
const redirectLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});

app.get('/health', (_request, response) => response.json({ status: 'ok' }));

app.post('/api/auth/login', loginLimiter, requireTrustedOrigin, async (request, response) => {
    const { email, password } = request.body ?? {};
    const adminEmail = process.env.ADMIN_EMAIL;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (typeof email !== 'string' || typeof password !== 'string' || !adminEmail || !passwordHash) {
        response.status(400).json({ error: 'Identifiants manquants ou configuration incomplète.' });
        return;
    }

    const emailMatches = email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
    const passwordMatches = await bcrypt.compare(password, passwordHash);
    if (!emailMatches || !passwordMatches) {
        response.status(401).json({ error: 'Adresse e-mail ou mot de passe invalide.' });
        return;
    }

    setSessionCookie(response, createSession(adminEmail));
    response.json({ email: adminEmail });
});

app.post('/api/auth/logout', requireTrustedOrigin, (_request, response) => {
    clearSessionCookie(response);
    response.status(204).end();
});

app.get('/api/auth/session', requireSession, (_request, response) => {
    response.json({ email: response.locals.adminEmail });
});

app.get('/r/:short_code', redirectLimiter, async (request, response) => {
    const { rows } = await pool.query(
        'SELECT id, target_url FROM qr_codes WHERE short_code = $1',
        [request.params.short_code],
    );
    const qrCode = rows[0] as { id: string; target_url: string } | undefined;
    if (!qrCode) {
        response.status(404).send('QR code introuvable.');
        return;
    }

    const userAgent = request.get('user-agent') ?? null;
    const parsedAgent = new UAParser(userAgent ?? '').getResult();
    const ip = request.ip?.replace(/^::ffff:/, '');
    const location = ip ? geoip.lookup(ip) : null;
    const ipHash = ip ? createHmac('sha256', ipHashSecret).update(ip).digest('hex') : null;

    void pool.query(
        `INSERT INTO scans
      (qr_code_id, country, city, ip_hash, user_agent, device_type, browser, os, referrer)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            qrCode.id,
            location?.country ?? null,
            location?.city ?? null,
            ipHash,
            userAgent,
            parsedAgent.device.type ?? 'Desktop',
            parsedAgent.browser.name ?? 'Unknown',
            parsedAgent.os.name ?? 'Unknown',
            request.get('referer') ?? null,
        ],
    ).catch((error: unknown) => console.error('Scan analytics insert failed:', error));

    response.redirect(302, qrCode.target_url);
});

app.use('/api', requireSession);
app.use('/api', requireTrustedOrigin);

app.get('/api/qr', async (_request, response) => {
    const { rows } = await pool.query(
        `SELECT q.id, q.title, q.short_code, q.target_url, q.created_at,
            COUNT(s.id)::int AS total_scans
     FROM qr_codes q LEFT JOIN scans s ON s.qr_code_id = q.id
     GROUP BY q.id ORDER BY q.created_at DESC`,
    );
    response.json(rows.map((row) => ({
        ...row,
        qrCodeUrl: `${redirectBaseUrl.replace(/\/$/, '')}/r/${row.short_code}`,
    })));
});

app.post('/api/qr', async (request, response) => {
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    const targetUrl = typeof request.body?.targetUrl === 'string' ? request.body.targetUrl.trim() : '';
    if (!title || title.length > 120) {
        response.status(400).json({ error: 'Le nom doit contenir entre 1 et 120 caractères.' });
        return;
    }

    let destination: URL;
    try {
        destination = new URL(targetUrl);
    } catch {
        response.status(400).json({ error: 'Saisissez une URL valide.' });
        return;
    }
    if (!['http:', 'https:'].includes(destination.protocol)) {
        response.status(400).json({ error: 'Seules les URL HTTP et HTTPS sont autorisées.' });
        return;
    }

    const shortCode = randomBytes(9).toString('base64url');
    const { rows } = await pool.query(
        'INSERT INTO qr_codes (title, short_code, target_url) VALUES ($1, $2, $3) RETURNING id, title, short_code, target_url, created_at',
        [title, shortCode, destination.toString()],
    );
    response.status(201).json({
        ...rows[0],
        total_scans: 0,
        qrCodeUrl: `${redirectBaseUrl.replace(/\/$/, '')}/r/${shortCode}`,
    });
});

app.patch('/api/qr/:id', async (request, response) => {
    const targetUrl = typeof request.body?.targetUrl === 'string' ? request.body.targetUrl.trim() : '';
    let destination: URL;
    try {
        destination = new URL(targetUrl);
    } catch {
        response.status(400).json({ error: 'Saisissez une URL valide.' });
        return;
    }
    if (!['http:', 'https:'].includes(destination.protocol)) {
        response.status(400).json({ error: 'Seules les URL HTTP et HTTPS sont autorisées.' });
        return;
    }

    const { rows } = await pool.query(
        'UPDATE qr_codes SET target_url = $1 WHERE id = $2 RETURNING id, title, short_code, target_url, created_at',
        [destination.toString(), request.params.id],
    );
    if (!rows[0]) {
        response.status(404).json({ error: 'QR code introuvable.' });
        return;
    }
    response.json({
        ...rows[0],
        qrCodeUrl: `${redirectBaseUrl.replace(/\/$/, '')}/r/${rows[0].short_code}`,
    });
});

app.get('/api/qr/:id/svg', async (request, response) => {
    const { rows } = await pool.query('SELECT short_code FROM qr_codes WHERE id = $1', [request.params.id]);
    if (!rows[0]) {
        response.status(404).json({ error: 'QR code introuvable.' });
        return;
    }
    const url = `${redirectBaseUrl.replace(/\/$/, '')}/r/${rows[0].short_code}`;
    const svg = await QRCode.toString(url, {
        type: 'svg',
        width: 240,
        margin: 1,
        color: { dark: '#17211d', light: '#ffffff' },
    });
    response.type('image/svg+xml').send(svg);
});

app.get('/api/qr/:id/analytics', async (request, response) => {
    const codeResult = await pool.query(
        'SELECT id, title, short_code FROM qr_codes WHERE id = $1',
        [request.params.id],
    );
    if (!codeResult.rows[0]) {
        response.status(404).json({ error: 'QR code introuvable.' });
        return;
    }

    const id = request.params.id;
    const [total, timeline, countries, cities, devices, browsers, systems] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS total FROM scans WHERE qr_code_id = $1', [id]),
        pool.query(`SELECT days.day::date AS date, COUNT(scans.id)::int AS count
      FROM generate_series(current_date - 29, current_date, INTERVAL '1 day') AS days(day)
      LEFT JOIN scans ON scans.qr_code_id = $1
        AND scans.scanned_at >= days.day
        AND scans.scanned_at < days.day + INTERVAL '1 day'
      GROUP BY days.day ORDER BY days.day`, [id]),
        pool.query(`SELECT COALESCE(country, 'Inconnu') AS label, COUNT(*)::int AS count
      FROM scans WHERE qr_code_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [id]),
        pool.query(`SELECT COALESCE(city, 'Inconnue') AS label, COUNT(*)::int AS count
      FROM scans WHERE qr_code_id = $1 AND city IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [id]),
        pool.query(`SELECT COALESCE(device_type, 'Inconnu') AS label, COUNT(*)::int AS count
      FROM scans WHERE qr_code_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [id]),
        pool.query(`SELECT COALESCE(browser, 'Inconnu') AS label, COUNT(*)::int AS count
      FROM scans WHERE qr_code_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [id]),
        pool.query(`SELECT COALESCE(os, 'Inconnu') AS label, COUNT(*)::int AS count
      FROM scans WHERE qr_code_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 6`, [id]),
    ]);

    response.json({
        qrCode: codeResult.rows[0],
        total: total.rows[0].total,
        timeline: timeline.rows,
        countries: countries.rows,
        cities: cities.rows,
        devices: devices.rows,
        browsers: browsers.rows,
        systems: systems.rows,
    });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error('Request failed:', error);
    response.status(500).json({ error: 'Une erreur inattendue est survenue.' });
});

app.listen(port, () => console.log(`QR analytics API listening on http://localhost:${port}`));