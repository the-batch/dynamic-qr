'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowDownToLine, ArrowUpRight, BarChart3, CalendarDays, Check,
    Copy, Globe2, LogOut, MousePointer2, Pencil, Plus, QrCode, RefreshCw, X,
} from 'lucide-react';
import {
    CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiRequest, ApiError } from '@/lib/api';

type QrCodeEntry = {
    id: string;
    title: string;
    short_code: string;
    target_url: string;
    created_at: string;
    total_scans: number;
    qrCodeUrl?: string;
};

type CountItem = { label: string; count: number };
type Analytics = {
    qrCode: { id: string; title: string; short_code: string };
    total: number;
    timeline: { date: string; count: number }[];
    countries: CountItem[];
    cities: CountItem[];
    devices: CountItem[];
    browsers: CountItem[];
    systems: CountItem[];
};

function formatDate(date: string) {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

function Breakdown({ title, items }: { title: string; items: CountItem[] }) {
    return (
        <section className="panel">
            <div className="panel-header"><h2 className="panel-title">{title}</h2><span className="panel-note">Répartition</span></div>
            {items.length ? <div className="breakdown-list">
                {items.map((item) => <div className="breakdown-row" key={`${title}-${item.label}`}>
                    <span className="breakdown-name"><i className="breakdown-dot" />{item.label}</span>
                    <span className="breakdown-count">{item.count.toLocaleString('fr-FR')}</span>
                </div>)}
            </div> : <div className="empty-breakdown">Aucune donnée pour le moment</div>}
        </section>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [authenticated, setAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [codes, setCodes] = useState<QrCodeEntry[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editingUrl, setEditingUrl] = useState('');
    const [title, setTitle] = useState('');
    const [targetUrl, setTargetUrl] = useState('');
    const [creating, setCreating] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        apiRequest<{ email: string }>('/api/auth/session')
            .then((session) => {
                setEmail(session.email);
                setAuthenticated(true);
            })
            .catch(() => router.replace('/login'))
            .finally(() => setLoading(false));
    }, [router]);

    useEffect(() => {
        if (!authenticated) return;
        apiRequest<QrCodeEntry[]>('/api/qr')
            .then((entries) => {
                setCodes(entries);
                setSelectedId((current) => current || entries[0]?.id || '');
            })
            .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Chargement impossible.'));
    }, [authenticated]);

    useEffect(() => {
        if (!authenticated || !selectedId) {
            setAnalytics(null);
            return;
        }
        let active = true;
        setError('');
        apiRequest<Analytics>(`/api/qr/${selectedId}/analytics`)
            .then((result) => { if (active) setAnalytics(result); })
            .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Chargement impossible.'); });
        return () => { active = false; };
    }, [authenticated, selectedId]);

    const selectedCode = useMemo(() => codes.find((entry) => entry.id === selectedId), [codes, selectedId]);
    const totalScans = codes.reduce((sum, entry) => sum + Number(entry.total_scans), 0);

    async function refresh() {
        setError('');
        try {
            const entries = await apiRequest<QrCodeEntry[]>('/api/qr');
            setCodes(entries);
            if (selectedId) setAnalytics(await apiRequest<Analytics>(`/api/qr/${selectedId}/analytics`));
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Actualisation impossible.');
        }
    }

    async function createCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCreating(true);
        setError('');
        try {
            const entry = await apiRequest<QrCodeEntry>('/api/qr', {
                method: 'POST',
                body: JSON.stringify({ title, targetUrl }),
            });
            setCodes((current) => [entry, ...current]);
            setSelectedId(entry.id);
            setModalOpen(false);
            setTitle('');
            setTargetUrl('');
            setToast('QR code créé');
            window.setTimeout(() => setToast(''), 2400);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Création impossible.');
        } finally {
            setCreating(false);
        }
    }

    function openEdit(code: QrCodeEntry) {
        setSelectedId(code.id);
        setEditingUrl(code.target_url);
        setEditOpen(true);
    }

    async function updateDestination(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedCode) return;
        setUpdating(true);
        setError('');
        try {
            const updated = await apiRequest<QrCodeEntry>(`/api/qr/${selectedCode.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ targetUrl: editingUrl }),
            });
            setCodes((current) => current.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry));
            setEditOpen(false);
            setToast('Destination mise à jour');
            window.setTimeout(() => setToast(''), 2400);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Modification impossible.');
        } finally {
            setUpdating(false);
        }
    }

    async function copyLink() {
        if (!selectedCode) return;
        const link = selectedCode.qrCodeUrl ?? `${window.location.origin}/r/${selectedCode.short_code}`;
        await navigator.clipboard.writeText(link);
        setToast('Lien copié');
        window.setTimeout(() => setToast(''), 2400);
    }

    async function logout() {
        await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace('/login');
    }

    if (loading || !authenticated) return <div className="loading-state">Ouverture de votre espace…</div>;

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand"><span className="brand-mark"><QrCode size={19} /></span>signal</div>
                <div className="workspace-label">Espace de travail</div>
                <nav aria-label="Navigation principale">
                    <a className="nav-item active" href="#dashboard"><BarChart3 size={16} /><span>Vue d’ensemble</span></a>
                    <a className="nav-item" href="#codes"><QrCode size={16} /><span>Mes QR codes</span></a>
                </nav>
                <div className="sidebar-bottom">
                    <div className="sidebar-user">
                        <div className="avatar">{email.slice(0, 1).toUpperCase()}</div>
                        <div className="user-info"><strong>{email}</strong><span>Administrateur</span></div>
                        <button className="icon-button" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter"><LogOut size={15} /></button>
                    </div>
                </div>
            </aside>

            <main className="main" id="dashboard">
                <div className="topbar">
                    <div><p className="eyebrow">Votre activité</p><h1>Vue d’ensemble</h1><p className="subheading">Vos QR codes, leurs scans et les signaux qui comptent.</p></div>
                    <button className="button" onClick={() => setModalOpen(true)}><Plus size={16} /> Nouveau QR code</button>
                </div>

                {error && <div className="inline-error" role="alert">{error}</div>}

                <div className="stats-grid">
                    <section className="stat-card"><span className="stat-label"><MousePointer2 size={14} />Scans au total</span><BarChart3 className="stat-mark" size={17} /><p className="stat-value">{totalScans.toLocaleString('fr-FR')}</p></section>
                    <section className="stat-card"><span className="stat-label"><QrCode size={14} />QR codes actifs</span><QrCode className="stat-mark" size={17} /><p className="stat-value">{codes.length.toLocaleString('fr-FR')}</p></section>
                    <section className="stat-card"><span className="stat-label"><CalendarDays size={14} />Scans du code suivi</span><ArrowUpRight className="stat-mark" size={17} /><p className="stat-value">{Number(analytics?.total ?? 0).toLocaleString('fr-FR')}</p></section>
                </div>

                <div className="content-grid">
                    <section className="panel">
                        <div className="panel-header">
                            <div><h2 className="panel-title">Évolution des scans</h2><span className="panel-note">30 derniers jours</span></div>
                            <select className="qr-select" aria-label="QR code suivi" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                                {!codes.length && <option value="">Aucun QR code</option>}
                                {codes.map((code) => <option key={code.id} value={code.id}>{code.title}</option>)}
                            </select>
                        </div>
                        <div className="chart-wrap">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics?.timeline ?? []} margin={{ top: 8, right: 14, left: -16, bottom: 0 }}>
                                    <CartesianGrid stroke="#edf0ea" vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#89938d', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={25} />
                                    <YAxis allowDecimals={false} tick={{ fill: '#89938d', fontSize: 9 }} axisLine={false} tickLine={false} />
                                    <Tooltip labelFormatter={(label) => formatDate(String(label))} contentStyle={{ border: '1px solid #e6e9e3', borderRadius: 5, fontSize: 11 }} />
                                    <Line type="monotone" dataKey="count" name="Scans" stroke="#226b4b" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#df725b', stroke: '#fff', strokeWidth: 2 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                    <section className="panel detail-panel">
                        {selectedCode ? <>
                            <img className="qr-preview" src={`/api/qr/${selectedCode.id}/svg`} alt={`QR code ${selectedCode.title}`} />
                            <h3>{selectedCode.title}</h3>
                            <p>{selectedCode.target_url}</p>
                            <div className="detail-actions">
                                <button className="button secondary" onClick={copyLink}><Copy size={13} /> Copier le lien</button>
                                <button className="button secondary" onClick={() => openEdit(selectedCode)} title="Modifier la destination" aria-label="Modifier la destination"><Pencil size={13} /></button>
                                <a className="button secondary" href={`/api/qr/${selectedCode.id}/svg`} download={`${selectedCode.short_code}.svg`} title="Télécharger le QR code" aria-label="Télécharger le QR code"><ArrowDownToLine size={14} /></a>
                            </div>
                        </> : <div className="table-empty"><QrCode size={28} /><h3>Aucun QR code</h3><p>Créez un premier code pour commencer.</p></div>}
                    </section>
                </div>

                <div className="lower-grid">
                    <Breakdown title="Origine des scans" items={[...(analytics?.countries ?? []), ...(analytics?.cities ?? []).map((city) => ({ ...city, label: `${city.label} · ville` }))]} />
                    <Breakdown title="Appareils & logiciels" items={[...(analytics?.devices ?? []), ...(analytics?.browsers ?? []).map((item) => ({ ...item, label: `${item.label} · navigateur` })), ...(analytics?.systems ?? []).map((item) => ({ ...item, label: `${item.label} · OS` }))]} />
                </div>

                <section className="panel codes-panel" id="codes">
                    <div className="panel-header"><div><h2 className="panel-title">Vos QR codes</h2><span className="panel-note">{codes.length} code{codes.length === 1 ? '' : 's'} au total</span></div><button className="icon-button plain" onClick={refresh} title="Actualiser les données" aria-label="Actualiser les données"><RefreshCw size={15} /></button></div>
                    {codes.length ? <div className="table-wrap"><table>
                        <thead><tr><th>Nom / destination</th><th>Scans</th><th>Code</th><th></th></tr></thead>
                        <tbody>{codes.map((code) => <tr className={selectedId === code.id ? 'selected' : ''} key={code.id} onClick={() => setSelectedId(code.id)}>
                            <td><span className="code-title">{code.title}</span><span className="code-destination">{code.target_url}</span></td>
                            <td className="code-count">{Number(code.total_scans).toLocaleString('fr-FR')}</td>
                            <td className="mono">{code.short_code}</td>
                            <td><button className="icon-button plain" onClick={(event) => { event.stopPropagation(); openEdit(code); }} title="Modifier la destination" aria-label={`Modifier ${code.title}`}><Pencil size={14} /></button><a className="code-link" href={`/r/${code.short_code}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Ouvrir <ArrowUpRight size={12} /></a></td>
                        </tr>)}</tbody>
                    </table></div> : <div className="table-empty"><strong>Votre première campagne commence ici.</strong>Créez un QR code dynamique pour suivre les visites.</div>}
                </section>
                <p style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, margin: '13px 0 0', color: '#89938d', fontSize: 10 }}><Globe2 size={12} /> Localisation estimée à partir de l’adresse IP, puis anonymisée.</p>
            </main>

            {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
                <form className="modal" onSubmit={createCode} role="dialog" aria-modal="true" aria-labelledby="create-heading">
                    <div className="modal-top"><div><h2 id="create-heading">Créer un QR code</h2><p>Le lien restera modifiable et mesurable.</p></div><button className="icon-button plain" type="button" onClick={() => setModalOpen(false)} title="Fermer" aria-label="Fermer"><X size={17} /></button></div>
                    <label className="form-field">Nom de la campagne<input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Menu printemps" required /></label>
                    <label className="form-field">URL de destination<input type="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://exemple.fr" required /></label>
                    <div className="modal-footer"><button className="button secondary" type="button" onClick={() => setModalOpen(false)}>Annuler</button><button className="button" type="submit" disabled={creating}><Plus size={15} />{creating ? 'Création…' : 'Créer le QR code'}</button></div>
                </form>
            </div>}
            {editOpen && selectedCode && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}>
                <form className="modal" onSubmit={updateDestination} role="dialog" aria-modal="true" aria-labelledby="edit-heading">
                    <div className="modal-top"><div><h2 id="edit-heading">Modifier la destination</h2><p>{selectedCode.title} · le QR code imprimé reste identique.</p></div><button className="icon-button plain" type="button" onClick={() => setEditOpen(false)} title="Fermer" aria-label="Fermer"><X size={17} /></button></div>
                    <label className="form-field">Nouvelle URL<input autoFocus type="url" value={editingUrl} onChange={(event) => setEditingUrl(event.target.value)} required /></label>
                    <div className="modal-footer"><button className="button secondary" type="button" onClick={() => setEditOpen(false)}>Annuler</button><button className="button" type="submit" disabled={updating}><Check size={15} />{updating ? 'Enregistrement…' : 'Enregistrer'}</button></div>
                </form>
            </div>}
            {toast && <div className="modal-backdrop" style={{ placeItems: 'end center', background: 'transparent', pointerEvents: 'none', paddingBottom: 28 }}><div className="button" style={{ pointerEvents: 'auto', boxShadow: 'var(--shadow)' }}><Check size={15} />{toast}</div></div>}
        </div>
    );
}