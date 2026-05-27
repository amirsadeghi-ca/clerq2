import { useState, useRef } from 'react'
import { Mail, Paperclip, Send, X, Loader2, ArrowLeft, ArrowRight, Inbox } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useMailboxes, useMailMessages, useSendMail } from '../api/mail'
import { useUploadDocument } from '../api/runs'
import type { MailMessage } from '../types/workflow'

function MessageRow({ msg }: { msg: MailMessage }) {
  const [expanded, setExpanded] = useState(false)
  const isReply = msg.direction === 'outbound'

  return (
    <div
      className={[
        'cursor-pointer border-b border-[var(--c-border)] transition-colors hover:bg-[var(--c-hover-1)]',
        isReply ? 'border-l-2 border-l-indigo-500/40' : '',
      ].join(' ')}
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <div className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          isReply ? 'bg-indigo-500/10' : 'bg-[var(--c-surface-3)]',
        ].join(' ')}>
          {isReply
            ? <ArrowLeft size={9} className="text-indigo-400" />
            : <ArrowRight size={9} className="text-[var(--c-text-4)]" />
          }
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={[
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
              isReply
                ? 'bg-indigo-500/10 text-indigo-400'
                : 'bg-[var(--c-surface-3)] text-[var(--c-text-5)]',
            ].join(' ')}>
              {isReply ? 'Reply' : 'Sent'}
            </span>
            {msg.subject && (
              <span className="min-w-0 truncate text-[12px] font-medium text-[var(--c-text-2)]">{msg.subject}</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">
            {isReply
              ? `${msg.from_addr} → ${msg.to_addr}`
              : `${msg.from_addr} → ${msg.to_addr}`
            }
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[11px] text-[var(--c-text-5)]">
            {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[10px] text-[var(--c-text-6)]">
            {new Date(msg.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--c-border)] bg-[var(--c-surface-2)] px-5 py-3">
          {msg.body ? (
            <pre className="whitespace-pre-wrap font-mono text-[12px] text-[var(--c-text-2)]">{msg.body}</pre>
          ) : (
            <p className="text-[12px] text-[var(--c-text-5)]">(no body)</p>
          )}
        </div>
      )}
    </div>
  )
}

export function MailInbox() {
  const { data: mailboxes = [] } = useMailboxes()
  const { data: messages = [] } = useMailMessages()
  const uploadDoc = useUploadDocument()
  const sendMail = useSendMail()

  const [fromEmail, setFromEmail] = useState('you@example.com')
  const [toAddr, setToAddr] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSend() {
    if (!toAddr || !file) return
    setSending(true)
    try {
      const doc = await uploadDoc.mutateAsync(file)
      await sendMail.mutateAsync({
        to: toAddr,
        from_email: fromEmail,
        subject: subject || undefined,
        body: body || undefined,
        document_id: doc.id,
      })
      setSubject('')
      setBody('')
      setFile(null)
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    } finally {
      setSending(false)
    }
  }

  const canSend = toAddr.length > 0 && file !== null && !sending

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Compose panel */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-[var(--c-border)]">
          <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] px-5">
            <Mail size={14} className="text-[var(--c-text-4)]" />
            <span className="text-[14px] font-semibold text-[var(--c-text-1)]">New message</span>
          </div>

          <div className="flex flex-1 flex-col gap-0 overflow-y-auto">
            {/* From */}
            <div className="border-b border-[var(--c-border)] px-5 py-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">From</label>
              <input
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
              />
            </div>

            {/* To */}
            <div className="border-b border-[var(--c-border)] px-5 py-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">To</label>
              {mailboxes.length === 0 ? (
                <p className="text-[12px] text-[var(--c-text-5)]">
                  No mailboxes enabled. Enable an inbox on a policy or workflow first.
                </p>
              ) : (
                <select
                  value={toAddr}
                  onChange={e => setToAddr(e.target.value)}
                  className="w-full bg-transparent text-[13px] text-[var(--c-text-1)] outline-none"
                >
                  <option value="">Select a mailbox…</option>
                  {mailboxes.map(mb => (
                    <option key={`${mb.type}-${mb.id}`} value={mb.email_address}>
                      {mb.name} &lt;{mb.email_address}&gt;
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Subject */}
            <div className="border-b border-[var(--c-border)] px-5 py-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Optional subject"
                className="w-full bg-transparent text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
              />
            </div>

            {/* Body */}
            <div className="flex-1 border-b border-[var(--c-border)] px-5 py-3">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Message body (optional)"
                rows={5}
                className="w-full resize-none bg-transparent text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
              />
            </div>

            {/* Attachment */}
            <div className="border-b border-[var(--c-border)] px-5 py-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-2 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5">
                  <Paperclip size={11} className="shrink-0 text-[var(--c-text-4)]" />
                  <span className="flex-1 truncate text-[12px] text-[var(--c-text-2)]">{file.name}</span>
                  <button
                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-[12px] text-[var(--c-text-4)] transition-colors hover:text-[var(--c-text-2)]"
                >
                  <Paperclip size={12} />
                  Attach PDF or image
                </button>
              )}
            </div>

            {/* Send */}
            <div className="px-5 py-4">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex w-full h-8 items-center justify-center gap-2 rounded bg-indigo-600 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                {sending
                  ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                  : sent
                  ? 'Sent!'
                  : <><Send size={13} /> Send</>
                }
              </button>
              {!file && toAddr && (
                <p className="mt-2 text-center text-[11px] text-[var(--c-text-5)]">Attach a file to send</p>
              )}
            </div>
          </div>
        </div>

        {/* Inbox panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-5">
            <div className="flex items-center gap-2">
              <Inbox size={14} className="text-[var(--c-text-4)]" />
              <span className="text-[14px] font-semibold text-[var(--c-text-1)]">Messages</span>
              {messages.length > 0 && (
                <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--c-text-4)]">
                  {messages.length}
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--c-text-5)]">Sent messages and replies · refreshes every 5s</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                  <Mail size={20} className="text-[var(--c-text-5)]" />
                </div>
                <p className="text-[13px] font-medium text-[var(--c-text-4)]">No messages yet</p>
                <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-[var(--c-text-5)]">
                  Sent messages and automatic replies both appear here. Replies arrive once the validation run finishes.
                </p>
              </div>
            ) : (
              messages.map(msg => <MessageRow key={msg.id} msg={msg} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
