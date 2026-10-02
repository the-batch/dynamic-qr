'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, QrCode } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        apiRequest('/api/auth/session')
            .then(() => router.replace('/'))
            .catch(() => setChecking(false));
    }, [router]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiRequest('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            router.replace('/');
        } catch (requestError) {
            setError(requestError instanceof ApiError ? requestError.message : 'Connexion impossible. Vérifiez que le service est disponible.');
        } finally {
            setBusy(false);
        }
    }

    if (checking) return <div className="auth-loading">Vérification de la session…</div>;

    return (
        <main className="login-page">
            <section className="login-art" aria-label="Signal analytics">
                <div className="brand"><span className="brand-mark"><QrCode size={20} /></span>signal</div>
                <div className="login-art-copy">
                    <p className="eyebrow">Le lien entre scan et destination</p>
                    <h1>Chaque scan raconte quelque chose.</h1>
                    <p>Des QR codes dynamiques, des destinations modifiables et une lecture claire de votre audience.</p>
                </div>
                <div className="login-art-foot">Un espace privé pour vos campagnes.</div>
            </section>
            <section className="login-side">
                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="brand"><span className="brand-mark"><QrCode size={20} /></span>signal</div>
                    <h2>Bon retour.</h2>
                    <p>Connectez-vous à votre espace analytics.</p>
                    {error && <div className="inline-error" role="alert">{error}</div>}
                    <label className="form-field">
                        Adresse e-mail
                        <input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </label>
                    <label className="form-field">
                        Mot de passe
                        <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                    </label>
                    <button className="button" disabled={busy} type="submit">
                        {busy ? 'Connexion…' : 'Se connecter'} <ArrowRight size={16} />
                    </button>
                    <div className="login-meta"><BarChart3 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Vos statistiques restent privées.</div>
                </form>
            </section>
        </main>
    );
}