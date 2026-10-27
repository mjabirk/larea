import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Shield,
  ShieldCheck,
  Building2,
  Lock,
  ArrowRight,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenancy } from '../../context/TenancyContext';
import { useAccessControl } from '../../context/AccessControlContext';
import { useTheme } from '../../context/ThemeContext';

/**
 * Lightweight inline Markdown renderer for AI responses
 */
function FormattedMessage({ content }) {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // H3 Header
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-sm font-bold text-slate-900 dark:text-white pt-1.5 pb-0.5 border-b border-slate-200/50 dark:border-slate-800">
              {formatInline(trimmed.replace('### ', ''))}
            </h3>
          );
        }

        // H4 Header
        if (trimmed.startsWith('#### ')) {
          return (
            <h4 key={idx} className="text-xs font-bold text-slate-800 dark:text-slate-100 pt-1">
              {formatInline(trimmed.replace('#### ', ''))}
            </h4>
          );
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-purple-500 font-bold leading-tight select-none">•</span>
              <span className="flex-1">{formatInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Standard line
        return (
          <p key={idx} className="leading-relaxed">
            {formatInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text) {
  // Split on bold (**text**) and code (`text`)
  const parts = [];
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-300 border border-slate-200/60 dark:border-slate-700"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export function AIAssistantModal({ isOpen, onClose, onNavigate }) {
  const auth = useAuth();
  const tenancy = useTenancy();
  const { hasPermission, hasAppAccess, hasMenuAccess } = useAccessControl();
  const { effectiveTheme } = useTheme();

  const sessionToken =
    auth?.sessionToken ||
    auth?.token ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('enterprise_auth_token') || sessionStorage.getItem('enterprise_auth_token')
      : '') ||
    '';

  const currentUser = auth?.currentUser || tenancy?.currentUser || null;
  const currentOrganization = tenancy?.currentOrganization || null;
  const currentBranch = tenancy?.currentBranch || null;
  const selectedBranchIds = tenancy?.selectedBranchIds || [];
  const isAllBranchesSelected = tenancy?.isAllBranchesSelected ?? true;
  const getAuthHeaders = tenancy?.getAuthHeaders;

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      text: `👋 **Welcome! I am your Permission-Scoped Enterprise AI Assistant.**\n\nI can analyze your authorized data across Employees, Attendance, Leaves, WPS Payroll, and Biometric Hardware under strict RBAC and multi-branch boundaries.\n\nAsk any question or pick a quick prompt chip below to begin.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom of messages container
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Escape key listener to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // User RBAC Scope Calculations
  const userRole = currentUser?.role || auth?.role || 'Authorized User';
  const orgName = currentOrganization?.legal_name || 'Active Tenant';
  const branchLabel = isAllBranchesSelected
    ? 'All Branches'
    : selectedBranchIds.length > 1
    ? `${selectedBranchIds.length} Branches`
    : currentBranch?.name || 'Main Branch';

  const canReadSalary = Boolean(
    hasPermission('hr.salary_read') ||
    hasPermission('hr.salary_manage') ||
    hasPermission('salary.read') ||
    auth?.is_superadmin
  );

  // Dynamic role-filtered prompt chips
  const promptChips = useMemo(() => {
    const chips = [];

    if (hasPermission('employees.read') || hasPermission('employee.read') || hasAppAccess('hr')) {
      chips.push({
        label: 'Show employees with QID expiring in 30 days',
        query: 'Show employees with QID expiring in 30 days',
        category: 'Compliance',
        icon: '📋',
      });
      chips.push({
        label: 'Total active headcount by department',
        query: 'What is our total active headcount by department?',
        category: 'Workforce',
        icon: '👥',
      });
      chips.push({
        label: 'Which employees have visas expiring soon?',
        query: 'Show employees with visa expiring in 30 days',
        category: 'Compliance',
        icon: '🛂',
      });
    }

    if (hasPermission('attendance.read') || hasAppAccess('attendance')) {
      chips.push({
        label: 'Open shifts & missing check-outs',
        query: 'Show attendance records with missing check-out',
        category: 'Attendance',
        icon: '⏱️',
      });
      chips.push({
        label: 'Overview of recent attendance logs',
        query: 'Provide an overview of recent attendance logs and shift statuses',
        category: 'Attendance',
        icon: '📊',
      });
      chips.push({
        label: 'Pending leave requests awaiting approval',
        query: 'Are there any pending leave requests waiting for supervisor or HR approval?',
        category: 'Leaves',
        icon: '🌴',
      });
    }

    if (hasPermission('payroll.read') || hasAppAccess('payroll')) {
      chips.push({
        label: 'Status of recent WPS payroll batches',
        query: 'Status of recent WPS payroll batches',
        category: 'Payroll',
        icon: '💵',
      });
    }

    if (hasPermission('hardware.read') || hasAppAccess('hardware')) {
      chips.push({
        label: 'List biometric hardware terminals',
        query: 'List biometric hardware terminals and their current online status',
        category: 'Hardware',
        icon: '📟',
      });
    }

    if (canReadSalary) {
      chips.push({
        label: 'Summarize compensation & salary distribution',
        query: 'Summarize compensation and base salary distribution for active employees',
        category: 'Compensation',
        icon: '💰',
      });
    }

    return chips;
  }, [hasPermission, hasAppAccess, canReadSalary]);

  const handleSendMessage = async (textToSend = null) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isLoading) return;

    const userMessage = {
      id: `msg_${Date.now()}_user`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const headers = getAuthHeaders ? getAuthHeaders(sessionToken) : {};
      headers['Content-Type'] = 'application/json';

      if (currentOrganization?.id) {
        headers['X-Organization-Id'] = currentOrganization.id;
      }
      if (isAllBranchesSelected) {
        headers['X-Branch-Ids'] = 'all';
      } else if (selectedBranchIds?.length > 0) {
        headers['X-Branch-Ids'] = selectedBranchIds.join(',');
      }

      const res = await fetch('/api/v1/ai/query', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          conversation_history: messages.slice(-4).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error (${res.status})`);
      }

      const data = await res.json();

      const assistantMessage = {
        id: `msg_${Date.now()}_assistant`,
        sender: 'assistant',
        text: data.answer || 'No answer returned.',
        suggested_navigation: data.suggested_navigation || null,
        allowed_scopes: data.allowed_scopes || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_err`,
          sender: 'assistant',
          text: `⚠️ **Unable to complete request**: ${err.message || 'Network communication error'}. Please verify your network and permissions.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `msg_${Date.now()}_reset`,
        sender: 'assistant',
        text: `🧹 **Chat conversation reset.** You are operating under active scope: **${orgName}** (${branchLabel}). How can I assist you?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn select-none">
      <div
        className="relative w-full max-w-3xl h-[86vh] max-h-[820px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
      >
        {/* ========================================================================= */}
        {/* 1. TOP HEADER & SECURITY BADGE STRIP                                      */}
        {/* ========================================================================= */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 id="ai-assistant-title" className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 tracking-tight leading-none">
                  <span>Enterprise AI Assistant</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    RBAC Protected
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mt-1">
                  Enforces zero-trust branch boundaries &amp; salary confidentiality
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Clear chat history"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Close AI Assistant (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Security Scope Badges */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1 border-t border-slate-200/60 dark:border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium mr-1 hidden sm:inline">Active Scope:</span>

            {/* Role Badge */}
            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-[10.5px] font-mono flex items-center gap-1">
              <Shield className="w-3 h-3 text-purple-500" />
              <span>{userRole}</span>
            </span>

            {/* Organization / Branch Badge */}
            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-[10.5px] font-mono flex items-center gap-1 truncate max-w-[200px] sm:max-w-xs">
              <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="truncate">{orgName} ({branchLabel})</span>
            </span>

            {/* Salary Masking Badge */}
            {canReadSalary ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10.5px] font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Salary Visible</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700 text-[10.5px] font-mono flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Salary Masked</span>
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. MESSAGES CONTAINER                                                     */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 select-text">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 animate-fadeIn ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs ${
                    isUser
                      ? 'bg-blue-600'
                      : 'bg-gradient-to-br from-purple-600 to-indigo-600'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 shadow-2xs border ${
                    isUser
                      ? 'bg-blue-600 text-white border-blue-500 rounded-tr-xs'
                      : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700/80 rounded-tl-xs'
                  }`}
                >
                  {isUser ? (
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  ) : (
                    <FormattedMessage content={msg.text} />
                  )}

                  {/* Clickable Suggested Navigation Chip */}
                  {msg.suggested_navigation && !isUser && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-purple-500" />
                        <span>Recommended Screen:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate?.(msg.suggested_navigation);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      >
                        <span>Open {msg.suggested_navigation.moduleId?.toUpperCase()} / {msg.suggested_navigation.menuId}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div
                    className={`mt-1.5 text-[10px] text-right ${
                      isUser ? 'text-blue-100/70' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Thinking / Loading Indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5 animate-fadeIn">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-xs p-3.5 shadow-2xs flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Querying permission-scoped database context...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ========================================================================= */}
        {/* 3. QUICK ROLE-FILTERED PROMPT CHIPS                                       */}
        {/* ========================================================================= */}
        {promptChips.length > 0 && (
          <div className="px-3 sm:px-4 py-2 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10.5px] font-semibold text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span>Suggestions:</span>
              </span>
              {promptChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(chip.query)}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-purple-700 dark:hover:text-purple-300 whitespace-nowrap transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5"
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. CHAT INPUT BAR                                                         */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question about employees, attendance, leaves, payroll, or hardware..."
              disabled={isLoading}
              className="flex-1 h-10 px-3.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white dark:focus:bg-slate-900 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className={`h-10 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm shrink-0 ${
                inputQuery.trim() && !isLoading
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-2 px-1">
            <span>Press <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">Enter</kbd> to send</span>
            <span>All queries audited under SOX 404 / ISO 27001</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AIAssistantModal;
