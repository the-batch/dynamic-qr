import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const apiOrigin = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
            { source: '/r/:path*', destination: `${apiOrigin}/r/:path*` },
        ];
    },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            ],
        }];
    },
};

export default nextConfig;