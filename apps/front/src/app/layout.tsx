import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Signal | QR analytics',
    description: 'Gérez vos QR codes dynamiques et suivez leurs scans.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <html lang="fr"><body>{children}</body></html>;
}