import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Lock,
  Download,
  Trash2,
  ShieldCheck,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notifyRecordChatterUpdated } from '../../utils/urlState';

const DOCUMENT_TYPES = [
  'National ID / QID / Iqama',
  'Passport Copy',
  'Visa & Residence Permit',
  'Employment Contract',
  'Bank Confirmation Letter',
  'Educational Credentials',
  'Medical Fitness Report',
  'Other Document',
];

export function EmployeeDocumentsTab({ employeeId, employeeName }) {
  const auth = useAuth();
  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState(DOCUMENT_TYPES[0]);
  const [dragActive, setDragActive] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  const getAuthHeaders = () => {
    const token =
      auth?.sessionToken ||
      auth?.token ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
        : '') ||
      '';
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchDocuments = async () => {
    if (!employeeId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/employees/${employeeId}/documents`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error('Failed to load documents:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [employeeId]);

  const handleUpload = async (file) => {
    if (!file) return;

    // Validate size (15 MB)
    if (file.size > 15 * 1024 * 1024) {
      setFeedbackMessage({
        text: 'File exceeds 15 MB limit. Please select a smaller document.',
        type: 'error',
      });
      return;
    }

    // Validate executable extensions
    const forbidden = ['.exe', '.sh', '.bat', '.js', '.py', '.cmd', '.vbs'];
    const lowerName = file.name.toLowerCase();
    if (forbidden.some((ext) => lowerName.endsWith(ext))) {
      setFeedbackMessage({
        text: 'Security violation: Executable scripts cannot be uploaded to encrypted vault.',
        type: 'error',
      });
      return;
    }

    setIsUploading(true);
    setFeedbackMessage({ text: '', type: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', selectedType);

    try {
      const res = await fetch(`/api/v1/employees/${employeeId}/documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed.');
      }

      setFeedbackMessage({
        text: `Document '${file.name}' uploaded successfully.`,
        type: 'success',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      notifyRecordChatterUpdated(employeeId, 'employees');
      await fetchDocuments();
    } catch (err) {
      setFeedbackMessage({ text: err.message, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Are you sure you want to permanently purge '${filename}' from the encrypted vault?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/employees/${employeeId}/documents/${docId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setFeedbackMessage({
          text: `Document '${filename}' deleted.`,
          type: 'success',
        });
        notifyRecordChatterUpdated(employeeId, 'employees');
        await fetchDocuments();
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Delete failed.');
      }
    } catch (err) {
      setFeedbackMessage({ text: err.message, type: 'error' });
    }
  };

  const handleDownload = async (doc) => {
    if (!doc || !doc.id) return;
    setDownloadingDocId(doc.id);
    try {
      const res = await fetch(`/api/v1/employees/${employeeId}/documents/${doc.id}/download`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = blobUrl;
      link.download = doc.original_filename || `document_${doc.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1500);
    } catch (err) {
      console.error('Download error:', err);
      setFeedbackMessage({
        text: `Error downloading document: ${err.message}`,
        type: 'error',
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handlePreview = async (doc) => {
    if (!doc || !doc.id) return;
    try {
      const res = await fetch(
        `/api/v1/employees/${employeeId}/documents/${doc.id}/download?inline=true`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!res.ok) {
        throw new Error(`Preview failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      console.error('Preview error:', err);
      setFeedbackMessage({
        text: `Error previewing document: ${err.message}`,
        type: 'error',
      });
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Vault Security Header Pill */}
      <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AES-256-GCM Encrypted Document Vault</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              All physical files are encrypted at rest with authenticated GCM ciphers before writing to disk.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>FIPS 140-2 Compliant</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
              Upload New Confidential Document
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              PDF, PNG, JPEG, DOC, DOCX up to 15 MB. Executables strictly rejected.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium shrink-0">
              Document Type:
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drag & Drop Box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-8 rounded-xl border-2 border-dashed transition text-center cursor-pointer flex flex-col items-center justify-center ${
            dragActive
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleUpload(e.target.files[0]);
              }
            }}
          />

          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>

          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {isUploading ? 'Encrypting & Persisting Document...' : 'Click to browse or drag file here'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Ciphertext is written directly to tenant file store • Zero unencrypted temporary files
          </p>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage.text && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              feedbackMessage.type === 'error'
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
            }`}
          >
            {feedbackMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}
      </div>

      {/* Documents Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
              Vault Documents ({documents.length})
            </h4>
          </div>
          <button
            type="button"
            onClick={fetchDocuments}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="Refresh documents list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 space-y-1">
            <p>No documents uploaded for this employee yet.</p>
            <p className="text-[11px] text-slate-500">Upload identity cards, passports, or employment agreements above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {doc.original_filename}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        {doc.document_type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                        <Lock className="w-2.5 h-2.5" />
                        AES-256-GCM
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono flex-wrap">
                      <span>Size: {formatFileSize(doc.file_size_bytes)}</span>
                      <span>•</span>
                      <span>Uploaded: {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'N/A'}</span>
                      {doc.sha256_checksum && (
                        <>
                          <span>•</span>
                          <span title={`SHA-256 Checksum: ${doc.sha256_checksum}`}>
                            SHA: {doc.sha256_checksum.slice(0, 10)}...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handlePreview(doc)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer border border-slate-200 dark:border-slate-700"
                    title="Open / Preview in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingDocId === doc.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold transition cursor-pointer border border-blue-200 dark:border-blue-800 disabled:opacity-50"
                    title={`Download ${doc.original_filename}`}
                  >
                    {downloadingDocId === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.original_filename)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    title="Purge from vault"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
