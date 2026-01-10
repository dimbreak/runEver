import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Quill from 'quill';
import { readSession, writeSession } from '../utils/session';

const STORAGE_KEY = 'runEverMark_email_inbox';
const EMAIL_AUTH_KEY = 'runEverMark_email_auth';

type EmailMessage = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
};

const defaultEmails: EmailMessage[] = [
  {
    id: 'email-1',
    from: 'ops@runEverMark.dev',
    subject: 'Welcome to the benchmark lane',
    preview: 'Your inbox is ready for automation tasks.',
    body: 'Hi there! This inbox is seeded with dummy emails so flows have data to act on.',
    timestamp: '09:12 AM'
  },
  {
    id: 'email-2',
    from: 'support@merchant.test',
    subject: 'Invoice #A-221 ready',
    preview: 'The invoice for your recent order is attached.',
    body: 'Download the invoice when ready. Let us know if you need changes.',
    timestamp: '10:27 AM'
  },
  {
    id: 'email-3',
    from: 'alerts@shipping.test',
    subject: 'Shipment delay warning',
    preview: 'Delivery window moved by 24 hours.',
    body: 'The shipment moved to tomorrow due to weather conditions. Thanks for your patience.',
    timestamp: '11:45 AM'
  }
];

export default function EmailPlatformPage() {
  const [isAuthed, setIsAuthed] = useState(() => readSession<boolean>(EMAIL_AUTH_KEY, false));
  const [emails, setEmails] = useState<EmailMessage[]>(() =>
    readSession(STORAGE_KEY, defaultEmails)
  );
  const [activeId, setActiveId] = useState(emails[0]?.id ?? '');
  const [showInject, setShowInject] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    writeSession(STORAGE_KEY, emails);
  }, [emails]);

  const activeEmail = useMemo(
    () => emails.find((email) => email.id === activeId) ?? emails[0],
    [emails, activeId]
  );

  const handleInject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const from = String(formData.get('from') || 'system@injector.test');
    const subject = String(formData.get('subject') || 'Injected email');
    const preview = String(formData.get('preview') || 'This message was injected via flow.');
    const body = String(formData.get('body') || preview);
    const message: EmailMessage = {
      id: `email-${Date.now()}`,
      from,
      subject,
      preview,
      body,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setEmails((current) => [message, ...current]);
    setActiveId(message.id);
    setShowInject(false);
    event.currentTarget.reset();
  };

  const handleComposeSend = (subject: string, body: string, to: string) => {
    const message: EmailMessage = {
      id: `email-${Date.now()}`,
      from: `to:${to}`,
      subject,
      preview: body.replace(/<[^>]+>/g, '').slice(0, 60) || 'New composed email',
      body,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setEmails((current) => [message, ...current]);
    setActiveId(message.id);
    setShowCompose(false);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    writeSession('runEverMark_email_user', email);
    writeSession(EMAIL_AUTH_KEY, true);
    setIsAuthed(true);
  };

  if (!isAuthed) {
    return (
      <section className="panel">
        <h2>Email platform login</h2>
        <p className="muted">First-time login gates inbox access for this session.</p>
        <form className="form" onSubmit={handleLogin}>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" required />
          </label>
          <button className="button" type="submit">
            Sign in
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Email platform</h2>
          <p className="muted">Inbox with inject + compose flows (sessionStorage backed).</p>
        </div>
        <div className="panel-actions">
          <button className="button ghost" onClick={() => setShowInject(true)}>
            Inject email
          </button>
          <button className="button" onClick={() => setShowCompose(true)}>
            Compose
          </button>
        </div>
      </header>

      <div className="split">
        <aside className="list">
          {emails.map((email) => (
            <button
              key={email.id}
              type="button"
              className={`list-item ${email.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(email.id)}
            >
              <div>
                <p className="list-title">{email.subject}</p>
                <p className="list-meta">{email.from}</p>
              </div>
              <span className="badge">{email.timestamp}</span>
            </button>
          ))}
        </aside>
        <article className="detail">
          {activeEmail ? (
            <>
              <h3>{activeEmail.subject}</h3>
              <p className="muted">From: {activeEmail.from}</p>
              <div
                className="email-body"
                dangerouslySetInnerHTML={{ __html: activeEmail.body }}
              />
            </>
          ) : (
            <p className="muted">Select an email to preview.</p>
          )}
        </article>
      </div>

      {showInject && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleInject}>
            <h3>Inject email</h3>
            <label>
              From
              <input name="from" placeholder="alerts@test.dev" />
            </label>
            <label>
              Subject
              <input name="subject" placeholder="Injected subject" />
            </label>
            <label>
              Preview
              <input name="preview" placeholder="Short preview line" />
            </label>
            <label>
              Body
              <textarea name="body" rows={4} placeholder="Full email body" />
            </label>
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setShowInject(false)}>
                Cancel
              </button>
              <button type="submit" className="button">
                Inject
              </button>
            </div>
          </form>
        </div>
      )}

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSend={handleComposeSend} />
      )}
    </section>
  );
}

type ComposeModalProps = {
  onClose: () => void;
  onSend: (subject: string, body: string, to: string) => void;
};

function ComposeModal({ onClose, onSend }: ComposeModalProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');

  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      quillRef.current = new Quill(editorRef.current, {
        theme: 'snow',
        placeholder: 'Write a message...'
      });
    }
    return () => {
      quillRef.current = null;
    };
  }, []);

  const handleSend = () => {
    const html = quillRef.current?.root.innerHTML ?? '';
    onSend(subject || 'Untitled message', html, to || 'unknown@recipient.test');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal large">
        <h3>Compose email</h3>
        <label>
          To
          <input value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Subject
          <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <div className="rte" ref={editorRef} />
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose}>
            Close
          </button>
          <button className="button" onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
