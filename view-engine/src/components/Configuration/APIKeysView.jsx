import React, { useState, useEffect, useCallback } from 'react';
import {
    KeyRound,
    Plus,
    Trash2,
    Copy,
    Check,
    ShieldCheck,
    Cpu,
    Network,
    AlertTriangle,
    RefreshCw,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function APIKeysView() {
    const { getAuthHeaders } = useAuth();
    const [apiKeys, setApiKeys] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newlyGeneratedKey, setNewlyGeneratedKey] = useState(null);
    const [copied, setCopied] = useState(false);

    const [formData, setFormData] = useState({
        owner: 'ZKTeco ProFaceX - Doha HQ Gate 1',
        role: 'service_daemon',
        allowed_cidrs: '192.168.10.0/24, 127.0.0.1/32',
        scopes: ['attendance:sync', 'terminals:heartbeat'],
    });

    const fetchKeys = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/iam/api-keys', {
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                setApiKeys(data.api_keys || []);
            }
        } catch (e) {
            console.error('Failed to load API keys:', e);
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    const handleCreateKey = async (e) => {
        e.preventDefault();
        const cidrs = formData.allowed_cidrs
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);

        const res = await fetch('/api/v1/iam/api-keys', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                owner: formData.owner.trim(),
                role: formData.role,
                allowed_cidrs: cidrs.length > 0 ? cidrs : ['0.0.0.0/0'],
                scopes: formData.scopes,
            }),
        });

        if (res.ok) {
            const data = await res.json();
            setNewlyGeneratedKey(data.api_key);
            setIsModalOpen(false);
            await fetchKeys();
        }
    };

    const handleRevokeKey = async (keyId, owner) => {
        if (!window.confirm(`Permanently revoke biometric API key for "${owner}"?`)) return;
        const res = await fetch(`/api/v1/iam/api-keys/${keyId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        if (res.ok) {
            await fetchKeys();
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200/80 dark:border-emerald-800/60">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Device Authentication</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        Device API Keys
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Manage API keys and IP allowlists for attendance clocks and external device connectors.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>New API Key</span>
                </button>
            </div>

            {/* One-Time Raw Key Reveal Banner */}
            {newlyGeneratedKey && (
                <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-700 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>Copy Secret API Key Now — Shown Only Once!</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setNewlyGeneratedKey(null)}
                            className="text-xs text-amber-700 dark:text-amber-300 underline cursor-pointer"
                        >
                            Dismiss
                        </button>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                        Save this key in a secure place — it will not be shown again. Paste it into your device's <code>X-API-Key</code> header:
                    </p>
                    <div className="flex items-center gap-2 bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-xs">
                        <span className="flex-1 break-all">{newlyGeneratedKey.raw_api_key}</span>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(newlyGeneratedKey.raw_api_key)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? 'Copied' : 'Copy Key'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Keys Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                            <th className="py-3.5 px-4">Key ID</th>
                            <th className="py-3.5 px-4">Terminal / Daemon Owner</th>
                            <th className="py-3.5 px-4">Allowed IP Ranges</th>
                            <th className="py-3.5 px-4">Authorized Scopes</th>
                            <th className="py-3.5 px-4">Created At</th>
                            <th className="py-3.5 px-4 text-right">Revoke</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {apiKeys.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400">
                                    No active biometric API keys provisioned yet.
                                </td>
                            </tr>
                        ) : (
                            apiKeys.map((k) => (
                                <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                        {k.id}
                                    </td>
                                    <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                        {k.owner}
                                    </td>
                                    <td className="py-3.5 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                                        {(k.allowed_cidrs || []).join(', ')}
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <div className="flex flex-wrap gap-1">
                                            {(k.scopes || []).map((s) => (
                                                <span
                                                    key={s}
                                                    className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-mono text-[10px]"
                                                >
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="py-3.5 px-4 font-mono text-slate-400">
                                        {k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="py-3.5 px-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleRevokeKey(k.id, k.owner)}
                                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            <span>Revoke</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Key Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                Provision Biometric ADMS API Key
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Terminal Name / Location *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.owner}
                                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                    placeholder="e.g. ZKTeco Gate #01 - Industrial Area Branch"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Allowed IP Ranges (Comma-Separated)
                                </label>
                                <input
                                    type="text"
                                    value={formData.allowed_cidrs}
                                    onChange={(e) => setFormData({ ...formData, allowed_cidrs: e.target.value })}
                                    placeholder="192.168.1.0/24, 10.0.0.0/8"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                >
                                    Generate Secret Key
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}