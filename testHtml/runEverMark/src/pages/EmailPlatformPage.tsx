import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Quill from 'quill';
import { readSession, writeSession } from '../utils/session';
import {
  Inbox,
  Star,
  Clock,
  Send,
  File,
  Zap,
  RotateCw,
  MoreVertical,
  Tag,
  ChevronRight,
  Trash2,
  Mail,
  ArrowLeft,
  Archive,
  AlertOctagon,
  FolderInput,
  Printer,
  ExternalLink,
  Reply,
  Paperclip,
  Smile,
  Image,
  Lock,
  HardDrive,
  Minimize2,
  Maximize2,
  X,
  Link,
  PenSquare
} from 'lucide-react';

const STORAGE_KEY = 'runEverMark_email_inbox';
const EMAIL_AUTH_KEY = 'runEverMark_email_auth';

type EmailMessage = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  isStarred: boolean;
  isImportant: boolean;
  isChecked: boolean;
  isRead: boolean;
};

const defaultEmails: EmailMessage[] = [
  {
    id: 'email-1',
    from: 'ops@runEverMark.dev',
    subject: 'Welcome to the benchmark lane',
    preview: 'Your inbox is ready for automation tasks.',
    body: 'Hi there! This inbox is seeded with dummy emails so flows have data to act on.',
    timestamp: '09:12 AM',
    isStarred: true,
    isImportant: true,
    isChecked: false,
    isRead: false
  },
  {
    id: 'email-2',
    from: 'support@merchant.test',
    subject: 'Invoice #A-221 ready',
    preview: 'The invoice for your recent order is attached.',
    body: 'Download the invoice when ready. Let us know if you need changes.',
    timestamp: '10:27 AM',
    isStarred: false,
    isImportant: false,
    isChecked: false,
    isRead: true
  },
  {
    id: 'email-3',
    from: 'alerts@shipping.test',
    subject: 'Shipment delay warning',
    preview: 'Delivery window moved by 24 hours.',
    body: 'The shipment moved to tomorrow due to weather conditions. Thanks for your patience.',
    timestamp: '11:45 AM',
    isStarred: false,
    isImportant: true,
    isChecked: false,
    isRead: false
  }
];

export default function EmailPlatformPage() {
  const [isAuthed, setIsAuthed] = useState(() => readSession<boolean>(EMAIL_AUTH_KEY, false));

  // Initialize emails with new fields if they don't exist
  const [emails, setEmails] = useState<EmailMessage[]>(() => {
    const saved = readSession(STORAGE_KEY, defaultEmails);
    return saved.map((email: any) => ({
      ...email,
      isStarred: email.isStarred ?? false,
      isImportant: email.isImportant ?? false,
      isChecked: false, // Don't persist selection state
      isRead: email.isRead ?? true
    }));
  });

  const [activeTab, setActiveTab] = useState('inbox');
  const [showInject, setShowInject] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    writeSession(STORAGE_KEY, emails);
  }, [emails]);

  const toggleStar = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, isStarred: !e.isStarred } : e));
  };

  const toggleImportant = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, isImportant: !e.isImportant } : e));
  };

  const toggleSelection = (id: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, isChecked: !e.isChecked } : e));
  };

  const toggleSelectAll = () => {
    const allSelected = emails.every(e => e.isChecked);
    setEmails(prev => prev.map(e => ({ ...e, isChecked: !allSelected })));
  };

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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStarred: false,
      isImportant: false,
      isChecked: false,
      isRead: false
    };
    setEmails((current) => [message, ...current]);
    setShowInject(false);
    event.currentTarget.reset();
  };

  const handleComposeSend = (subject: string, body: string, _to: string) => {
    const message: EmailMessage = {
      id: `email-${Date.now()}`,
      from: `me`, // Sent by user
      subject,
      preview: body.replace(/<[^>]+>/g, '').slice(0, 60) || 'New composed email',
      body,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStarred: false,
      isImportant: false,
      isChecked: false,
      isRead: true
    };
    // In a real app, this would go to "Sent", but here we just add it to list for visibility
    setEmails((current) => [message, ...current]);
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

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeEmail = useMemo(
    () => emails.find((email) => email.id === activeId),
    [emails, activeId]
  );

  const handleBack = () => {
    setActiveId(null);
  };

  if (!isAuthed) {
    return (
      <section className="panel center-panel">
        <div style={{ maxWidth: 400, margin: '40px auto' }}>
          <h2>Sign in</h2>
          <p className="muted">to continue to Gmail</p>
          <form className="form" onSubmit={handleLogin}>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" required />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
             <button className="button" type="submit">
                Next
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  return (
    <div className="gmail-layout">
      <aside className="gmail-sidebar">
        <div className="p-4">
           {/* Google-ish Compose Button */}
           <button className="gmail-compose-btn" onClick={() => setShowCompose(true)}>
             <PenSquare size={20} className="icon-mr" />
             Compose
           </button>
        </div>

        <nav className="gmail-nav">
          <a href="#" className={`nav-item ${activeTab === 'inbox' ? 'active' : ''}`} onClick={() => setActiveTab('inbox')}>
            <span className="icon"><Inbox size={18} /></span> Inbox <span className="count">{emails.filter(e => !e.isRead).length}</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'starred' ? 'active' : ''}`} onClick={() => setActiveTab('starred')}>
             <span className="icon"><Star size={18} /></span> Starred
          </a>
           <a href="#" className={`nav-item ${activeTab === 'snoozed' ? 'active' : ''}`} onClick={() => setActiveTab('snoozed')}>
             <span className="icon"><Clock size={18} /></span> Snoozed
          </a>
          <a href="#" className={`nav-item ${activeTab === 'sent' ? 'active' : ''}`} onClick={() => setActiveTab('sent')}>
             <span className="icon"><Send size={18} /></span> Sent
          </a>
           <a href="#" className={`nav-item ${activeTab === 'drafts' ? 'active' : ''}`} onClick={() => setActiveTab('drafts')}>
             <span className="icon"><File size={18} /></span> Drafts
          </a>
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); setShowInject(true); }}>
            <span className="icon"><Zap size={18} /></span> Inject Email
          </a>
        </nav>
      </aside>

      <main className="gmail-main">
        {!activeEmail ? (
          <>
            <header className="gmail-toolbar">
               <div className="checkbox-wrapper">
                 <input type="checkbox" onChange={toggleSelectAll} checked={emails.length > 0 && emails.every(e => e.isChecked)} />
               </div>
               <button className="icon-btn" title="Refresh"><RotateCw size={18} /></button>
               <button className="icon-btn" title="More"><MoreVertical size={18} /></button>
               <div className="spacer"></div>
               <span className="pagination-text">1-{emails.length} of {emails.length}</span>
            </header>

            <div className="email-list">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className={`email-row ${email.isRead ? 'read' : 'unread'} ${email.isChecked ? 'selected' : ''}`}
                  onClick={() => {
                     // Mark as read when opening
                     if (!email.isRead) {
                       setEmails(prev => prev.map(e => e.id === email.id ? { ...e, isRead: true } : e));
                     }
                     setActiveId(email.id);
                  }}
                >
                  <div className="col-controls" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={email.isChecked} onChange={() => toggleSelection(email.id)} />
                    <button className={`star-btn ${email.isStarred ? 'active' : ''}`} onClick={() => toggleStar(email.id)}>
                       {email.isStarred ? <Star size={18} fill="currentColor" /> : <Star size={18} />}
                    </button>
                    <button className={`important-btn ${email.isImportant ? 'active' : ''}`} onClick={() => toggleImportant(email.id)}>
                       {email.isImportant ? <Tag size={18} fill="currentColor" /> : <ChevronRight size={18} />}
                    </button>
                  </div>

                  <div className="col-sender">
                    {email.from}
                  </div>

                  <div className="col-content">
                    <span className="subject">{email.subject}</span>
                    <span className="separator">-</span>
                    <span className="preview">{email.preview}</span>
                  </div>

                  <div className="col-date">
                    {email.timestamp}
                  </div>

                   <div className="email-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="action-btn" title="Archive"><Inbox size={16} /></button>
                      <button className="action-btn" title="Delete"><Trash2 size={16} /></button>
                      <button className="action-btn" title="Mark as unread" onClick={(e) => {
                          e.stopPropagation();
                          setEmails(prev => prev.map(ev => ev.id === email.id ? { ...ev, isRead: !ev.isRead } : ev));
                      }}><Mail size={16} /></button>
                      <button className="action-btn" title="Snooze"><Clock size={16} /></button>
                   </div>
                </div>
              ))}
              {emails.length === 0 && (
                 <div className="empty-state">
                    <p>Your inbox is empty</p>
                 </div>
              )}
            </div>
          </>
        ) : (
          <div className="email-detail">
            <header className="detail-toolbar">
               <button className="icon-btn" onClick={handleBack} title="Back to Inbox">
                 <ArrowLeft size={18} />
               </button>
               <button className="icon-btn" title="Archive"><Archive size={18} /></button>
               <button className="icon-btn" title="Report spam"><AlertOctagon size={18} /></button>
               <button className="icon-btn" title="Delete"><Trash2 size={18} /></button>
               <div className="vr"></div>
               <button className="icon-btn" title="Mark as unread"><Mail size={18} /></button>
               <button className="icon-btn" title="Move to"><FolderInput size={18} /></button>
               <button className="icon-btn" title="Labels"><Tag size={18} /></button>
               <button className="icon-btn" title="More"><MoreVertical size={18} /></button>
            </header>

            <div className="detail-content">
               <div className="detail-header">
                 <h2 className="detail-subject">
                    {activeEmail.subject}
                    <span className="detail-badge">Inbox</span>
                 </h2>
                 <div className="detail-actions">
                   <button className="icon-btn"><Printer size={18} /></button>
                   <button className="icon-btn"><ExternalLink size={18} /></button>
                 </div>
               </div>

               <div className="message-card">
                 <div className="message-header">
                    <div className="avatar">{activeEmail.from.charAt(0).toUpperCase()}</div>
                    <div className="sender-info">
                       <span className="sender-name">
                          <strong>{activeEmail.from}</strong>
                          <span className="sender-email">&lt;{activeEmail.from}&gt;</span>
                       </span>
                       <span className="to-me">to me ▼</span>
                    </div>
                    <div className="message-meta">
                       {activeEmail.timestamp}
                       <button className="icon-btn small"><Star size={16} /></button>
                       <button className="icon-btn small"><Reply size={16} /></button>
                       <button className="icon-btn small"><MoreVertical size={16} /></button>
                    </div>
                 </div>

                 <div
                   className="message-body"
                   dangerouslySetInnerHTML={{ __html: activeEmail.body }}
                 />

                 <InlineReply />
               </div>
            </div>
          </div>
        )}
      </main>

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
    </div>
  );
}

type ComposeModalProps = {
  onClose: () => void;
  onSend: (subject: string, body: string, to: string) => void;
};


interface QuillEditorProps {
  placeholder?: string;
  onMount: (quill: Quill) => void;
  className?: string;
}

function QuillEditor({ placeholder, onMount, className }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);

  useEffect(() => {
    if (containerRef.current && !quillRef.current) {
      quillRef.current = new Quill(containerRef.current, {
        theme: 'snow',
        placeholder: placeholder || '',
        modules: { toolbar: false }
      });
      onMount(quillRef.current);
    }
    // Cleanup not strictly necessary for simple singleton-like usage here but good practice
    return () => {
      // Typically we'd cleanup, but Quill cleans itself up mostly on DOM removal
      // If we nulled quillRef.current here, we might lose reference if strict mode mounts/unmounts
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}

function InlineReply() {
  const quillRef = useRef<Quill | null>(null);

  const handleBold = () => {
    const format = quillRef.current?.getFormat();
    quillRef.current?.format('bold', !format?.bold);
  };

  const handleItalic = () => {
    const format = quillRef.current?.getFormat();
    quillRef.current?.format('italic', !format?.italic);
  };

  return (
    <div className="reply-wrapper">
       <div className="reply-box">
          <div className="avatar small">M</div>
          <div className="reply-content">
             <div className="reply-header">
                <span className="reply-type"><Reply size={16} className="icon-mr"/> Reply</span>
                <span className="icon">▼</span>
             </div>

             <QuillEditor
                className="reply-editor"
                placeholder="Reply to this email..."
                onMount={(quill) => { quillRef.current = quill; }}
             />

             <div className="reply-footer">
                <button className="button send-btn">Send</button>
                <button
                  className="icon-btn"
                  title="Bold"
                  style={{ fontWeight: 'bold' }}
                  onClick={handleBold}
                >
                  B
                </button>
                <button
                  className="icon-btn"
                  title="Italic"
                  style={{ fontStyle: 'italic', fontFamily: 'serif' }}
                  onClick={handleItalic}
                >
                  I
                </button>
                <button className="icon-btn"><Paperclip size={18} /></button>
                <button className="icon-btn"><Smile size={18} /></button>
                <button className="icon-btn"><Image size={18} /></button>
             </div>
          </div>
       </div>
    </div>
  );
}

function ComposeModal({ onClose, onSend }: ComposeModalProps) {
  const quillRef = useRef<Quill | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');

  const handleSend = () => {
    const html = quillRef.current?.root.innerHTML ?? '';
    onSend(subject || 'Untitled message', html, to || 'unknown@recipient.test');
  };

  const handleBold = () => {
     const format = quillRef.current?.getFormat();
     quillRef.current?.format('bold', !format?.bold);
  };

  const handleItalic = () => {
     const format = quillRef.current?.getFormat();
     quillRef.current?.format('italic', !format?.italic);
  };

  return (
    <div className="gmail-compose">
      <div className="compose-header">
        <span>New Message</span>
        <div className="compose-actions">
          <button className="icon-btn small" onClick={onClose}><Minimize2 size={16} /></button>
          <button className="icon-btn small"><Maximize2 size={16} /></button>
          <button className="icon-btn small" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className="compose-body">
        <input
          className="compose-input"
          placeholder="Recipients"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <input
          className="compose-input"
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <QuillEditor
          className="compose-editor"
          onMount={(q) => { quillRef.current = q; }}
        />
      </div>
      <div className="compose-footer">
        <button className="button send-btn" onClick={handleSend}>Send</button>
        <div className="compose-tools">
           <button
             className="icon-btn"
             title="Bold"
             style={{ fontWeight: 'bold' }}
             onClick={handleBold}
           >
             B
           </button>
           <button
             className="icon-btn"
             title="Italic"
             style={{ fontStyle: 'italic', fontFamily: 'serif' }}
             onClick={handleItalic}
           >
             I
           </button>
           <button className="icon-btn"><Paperclip size={18} /></button>
           <button className="icon-btn"><Link size={18} /></button>
           <button className="icon-btn"><Smile size={18} /></button>
           <button className="icon-btn"><HardDrive size={18} /></button>
           <button className="icon-btn"><Image size={18} /></button>
           <button className="icon-btn"><Lock size={18} /></button>
        </div>
        <button className="icon-btn" onClick={onClose}><Trash2 size={18} /></button>
      </div>
    </div>
  );
}
