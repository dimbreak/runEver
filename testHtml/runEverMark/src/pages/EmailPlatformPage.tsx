import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Quill from 'quill';
import { readSession, writeSession, setBenchmarkResult } from '../utils/session';
import {
  Inbox,
  Star,
  Clock,
  Send,
  File as FileIcon,
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
  attachments?: { name: string; size: number; type: string; url?: string }[];
  replies?: EmailMessage[];
};

const getRelativeTime = (minsAgo: number) => {
  const date = new Date(Date.now() - minsAgo * 60 * 1000);
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const defaultEmails: EmailMessage[] = [
  {
    id: 'email-1',
    from: 'ops@runEverMark.dev',
    subject: 'Welcome to the benchmark lane',
    preview: 'Your inbox is ready for automation tasks.',
    body: 'Hi there! This inbox is seeded with dummy emails so flows have data to act on.',
    timestamp: getRelativeTime(12), // 12 mins ago
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
    timestamp: getRelativeTime(45), // 45 mins ago
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
    timestamp: getRelativeTime(120), // 2 hours ago
    isStarred: false,
    isImportant: true,
    isChecked: false,
    isRead: false
  },
  {
    id: 'email-4',
    from: 'newsletter@techweekly.io',
    subject: 'The Future of AI Agents',
    preview: 'This week we dive deep into autonomous coding agents.',
    body: '<h1>Tech Weekly</h1><p>AI agents are changing how we build software. Read more to find out how.</p>',
    timestamp: getRelativeTime(24 * 60 + 30), // Yesterday
    isStarred: false,
    isImportant: false,
    isChecked: false,
    isRead: true
  },
  {
    id: 'email-5',
    from: 'security@gatepal.com',
    subject: 'New login detected',
    preview: 'We noticed a new login from Chrome on Windows.',
    body: 'If this was you, you can ignore this email. If not, please change your password immediately.',
    timestamp: getRelativeTime(24 * 60 + 180), // Yesterday
    isStarred: true,
    isImportant: true,
    isChecked: false,
    isRead: true
  },
  {
    id: 'email-6',
    from: 'promo@ramazon.com',
    subject: 'Deals you might like',
    preview: 'Up to 50% off on electronics this weekend.',
    body: 'Check out our latest flash sale. Do not miss out!',
    timestamp: getRelativeTime(48 * 60), // 2 days ago
    isStarred: false,
    isImportant: false,
    isChecked: false,
    isRead: true
  },
  {
    id: 'email-7',
    from: 'hr@sellfroce.com',
    subject: 'Open Enrollment',
    preview: 'It is time to choose your benefits for next year.',
    body: 'Please log in to the employee portal to make your selections by Friday.',
    timestamp: getRelativeTime(72 * 60), // 3 days ago
    isStarred: false,
    isImportant: true,
    isChecked: false,
    isRead: true
  },
  {
    id: 'email-8',
    from: 'notification@gogo.com',
    subject: 'Your storage is almost full',
    preview: 'You have used 90% of your Gogo Drive storage.',
    body: 'Upgrade now to get more space and keep your files safe.',
    timestamp: getRelativeTime(96 * 60), // 4 days ago
    isStarred: false,
    isImportant: false,
    isChecked: false,
    isRead: true
  },
  ...Array.from({ length: 30 }).map((_, i) => ({
    id: `email-noise-${i}`,
    from: ['marketing@ramazon.com', 'updates@gogo.com', 'sales@sellfroce.com', 'news@techdaily.com', 'notifications@social.net'][i % 5],
    subject: [
      'Big Savings Inside!',
      'Security Alert: New Sign-in',
      'Your Weekly Analytics Report',
      'Don\'t miss out on these trends',
      'Friend request from John Doe',
      'Your order has shipped',
      'Invoice #9923 paid',
      'Upcoming Maintenance Scheduled',
      'Welcome to our newsletter',
      'Your free trial is ending soon'
    ][i % 10] + ` (${i + 1})`,
    preview: 'Click here to read the full message and see what is new today.',
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    timestamp: getRelativeTime(100 + i * 180), // Staggered past times
    isStarred: i % 7 === 0,
    isImportant: i % 5 === 0,
    isChecked: false,
    isRead: true
  }))
];

const getInjectedEmail = () => {
  const injection = localStorage.getItem('runEverMark_inject_email');
  if (injection) {
    try {
      const data = JSON.parse(injection);
      if (data && typeof data === 'object') {
        const newEmail: EmailMessage = {
          id: data.id || `email-inj-${Date.now()}`,
          from: data.from || 'unknown',
          subject: data.subject || 'No Subject',
          preview: data.preview || '',
          body: data.body || '',
          timestamp: data.timestamp || new Date().toLocaleTimeString(),
          isStarred: !!data.isStarred,
          isImportant: !!data.isImportant,
          isChecked: false,
          isRead: false,
          attachments: data.attachments || []
        };
        localStorage.removeItem('runEverMark_inject_email')
        return newEmail;
      }
    } catch (e) {
      console.error('Failed to parse injected email', e);
    }
  }
  return null;
}

export default function EmailPlatformPage() {
  const [isAuthed, setIsAuthed] = useState(() => readSession<boolean>(EMAIL_AUTH_KEY, false));
  const entryPoint = readSession<string>('runEverMark_active_entryPoint', '');

  // Initialize emails with new fields if they don't exist
  const [emails, setEmails] = useState<EmailMessage[]>(() => {
    const saved = [...readSession(STORAGE_KEY, []), ...defaultEmails].filter(email=>!!email.id);
    const mails =saved.map((email: any) => ({
      ...email,
      isStarred: email.isStarred ?? false,
      isImportant: email.isImportant ?? false,
      isChecked: false, // Don't persist selection state
      isRead: email.isRead ?? true
    }));
    const injected = getInjectedEmail();
    if(injected) {
      mails.unshift(injected);
    }
    return mails;
  });

  const [activeTab, setActiveTab] = useState('inbox');
  const [showCompose, setShowCompose] = useState(false);

  const checkInjection = () => {
    const injected = getInjectedEmail();
    if(injected) {
      setEmails(prev => [injected, ...prev]);
    }
  };

  useEffect(() => {
    if(entryPoint==='#/ecomm/pro') {
      setBenchmarkResult(entryPoint, '2fa_email_landed', true);
    }
    const interval = setInterval(checkInjection, 1000);
    return () => clearInterval(interval);
  }, []);

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


  const handleComposeSend = (subject: string, body: string, _to: string, files: File[]) => {
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
      isRead: true,
      attachments: files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        url: URL.createObjectURL(f) // In a real app, this would be a server URL
      }))
    };
    // In a real app, this would go to "Sent", but here we just add it to list for visibility
    setEmails((current) => [message, ...current]);
    setShowCompose(false);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');

    if (entryPoint === '#/ecomm/pro') {
         if (email === 'pikachu@pokemon.com' && password === 'P@ssword321') {
             setBenchmarkResult(entryPoint, 'email_login', true);
         }
    } else if (entryPoint === '#/pos/basic') {
         if (email === 'pikachu@pokemon.com' && password === 'P@ssword321') {
             setBenchmarkResult(entryPoint, 'email_login', true);
         }
    } else if (entryPoint === '#/pos/pro') {
         if (email === 'pikachu@pokemon.com' && password === 'P@ssword321') {
             setBenchmarkResult(entryPoint, 'email_login', true);
         }
    }

    writeSession('runEverMark_email_user', email);
    writeSession(EMAIL_AUTH_KEY, true);
    setIsAuthed(true);
    // Sync URL on selection (activeId change is handled by effect or click)
    // Actually, we should just set URL, and let the Effect update activeId.
    // But for responsiveness, we can do both OR rely on the parent App to re-render us?
    // Since App re-renders on hash change, this component might re-render.
    // Let's rely on the Effect to be the source of truth for activeId if we want perfect history support.
  };

  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync state with URL hash
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('/email/')) {
        const id = hash.split('/email/')[1];
        if (id !== activeId) setActiveId(id);
    } else {
        if (activeId !== null) setActiveId(null);
    }
  }, [window.location.hash]); // We need to listen to hash changes

  // But we also need to trigger hash change.
  // We can't easily listen to window.location.hash prop changes if it's not passed down.
  // However, App.tsx forces a re-render when hash changes?
  // No, App.tsx holds 'route' state, so when hash changes, 'route' changes, App re-renders,
  // and EmailPlatformPage is re-rendered (if it's not memoized heavily or extracted).
  // Actually, since ActivePage is a component reference, <ActivePage /> re-renders.
  // Let's refine the effect to just parse window.location.hash directly.

  // Better approach:
  // When user CLICKS email -> update Hash.
  // When Hash changes -> App re-renders -> We check Hash in effect -> update activeId.

  useEffect(() => {
     const handleHashSync = () => {
         const hash = window.location.hash.replace('#', '');
         const prefix = '/email/';
         if (hash.startsWith(prefix)) {
             const id = hash.substring(prefix.length);
             setActiveId(id);
         } else if (hash === '/email') {
             setActiveId(null);
         }
     };

     handleHashSync(); // Check on mount/update
     // We don't need addEventListener 'hashchange' here because App.tsx does it and re-renders us?
     // Wait, App.tsx re-renders <ActivePage/>.
     // If we are already mounted, does react unmount/remount us?
     // If ActivePage reference is stable (it is EmailPlatformPage class/fn), React reconciles.
     // So we persist.
     // So we DO need to listen to changes, OR accept props? App.tsx doesn't pass props.
     // But App.tsx re-rendering the parent might not trigger our useEffect unless props change?
     // Actually, if App re-renders, it calls `ActivePage()` again? No, it's a component.
     // Let's just add a listener to be safe and unresponsive to App's implementation details.
     window.addEventListener('hashchange', handleHashSync);
     return () => window.removeEventListener('hashchange', handleHashSync);
  }, []);

  const activeEmail = useMemo(
    () => emails.find((email) => email.id === activeId),
    [emails, activeId]
  );

  const openEmail = (id: string) => {
      window.location.hash = `#/email/${id}`;
  };

  const closeEmail = () => {
      window.location.hash = `#/email`;
  };

  if (!isAuthed) {
    return (
      <div className="gmail-login-layout">
        <div className="gmail-login-card">
          <div className="google-logo">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48px" height="48px">
               <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
               <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
               <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
               <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
             </svg>
          </div>
          <h2 className="login-title">Sign in</h2>
          <p className="login-subtitle">to continue to RMail</p>
          <form className="login-form" onSubmit={handleLogin}>
            <div className="gmail-input-group">
              <input name="email" type="email" required className="gmail-input" placeholder=" " />
              <label>Email or phone</label>
            </div>
            <div className="gmail-input-group">
               <input name="password" type="password" required className="gmail-input" placeholder=" " />
               <label>Password</label>
            </div>
            <div className="forgot-email">
               <a href="#" onClick={(e) => e.preventDefault()}>Forgot email?</a>
            </div>

            <div className="login-info">
               Not your computer? Use Guest mode to sign in privately.
               <a href="#" onClick={(e) => e.preventDefault()}>Learn more</a>
            </div>

            <div className="login-footer">
               <button type="button" className="gmail-btn-ghost">Create account</button>
               <button type="submit" className="gmail-btn-primary">Next</button>
            </div>
          </form>
        </div>
      </div>
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
             <span className="icon"><FileIcon size={18} /></span> Drafts
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

                     if (entryPoint === '#/ecomm/pro' && (email.subject === 'Your Security Code of GatePal' || email.from === 'security@gatepal.com')) {
                         setBenchmarkResult(entryPoint, 'email_open_2fa', true);
                     }else if (entryPoint === '#/pos/basic' && (email.subject === 'Order Request: Desk chair')) {
                       setBenchmarkResult(entryPoint, 'email_open_order', true);
                     }else if(entryPoint==='#/pos/pro' && (email.subject==='Order Request: Office Setup')) {
                       setBenchmarkResult(entryPoint, 'email_open_order', true);
                     }

                     openEmail(email.id);
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
               <button className="icon-btn" onClick={closeEmail} title="Back to Inbox">
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
                       <button className="icon-btn small" onClick={() => {
                           const ep = readSession<string>('runEverMark_active_entryPoint', '');
                           if (ep === '#/pos/pro') setBenchmarkResult(ep, 'click_reply', true);
                       }}><Reply size={16} /></button>
                       <button className="icon-btn small"><MoreVertical size={16} /></button>
                    </div>
                 </div>

                 <div
                   className="message-body"
                   dangerouslySetInnerHTML={{ __html: activeEmail.body }}
                 />


                  {activeEmail.attachments && activeEmail.attachments.length > 0 && (
                    <div className="message-attachments">
                      <div className="attachments-header">
                        <Paperclip size={16} />
                        <span>{activeEmail.attachments.length} Attachments</span>
                      </div>
                      <div className="attachments-list">
                        {activeEmail.attachments.map((att, index) => (
                          <div key={index} className="attachment-chip">
                             <div className="att-icon"><FileIcon size={16} /></div>
                             <a
                               href={att.url}
                               download
                               className="att-info"
                               style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                               onClick={() => {
                                 const ep = readSession<string>('runEverMark_active_entryPoint', '');
                                 if (ep === '#/pos/pro') setBenchmarkResult(ep, 'click_email_attachment', true);
                             }}>
                               <div className="att-name">{att.name}</div>
                               <div className="att-size">{Math.round(att.size / 1024)} KB</div>
                             </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                   {activeEmail.replies && activeEmail.replies.map(reply => (
                       <div key={reply.id} className="message-card reply-card" style={{ marginLeft: 0, marginTop: 10 }}>
                           <div className="message-header">
                               <div className="avatar small">M</div>
                               <div className="sender-info">
                                   <span className="sender-name"><strong>me</strong></span>
                                   <span className="to-me">to {activeEmail.from}</span>
                               </div>
                               <div className="message-meta">
                                   {reply.timestamp}
                               </div>
                           </div>
                           <div className="message-body" dangerouslySetInnerHTML={{ __html: reply.body }} />
                           {reply.attachments && reply.attachments.length > 0 && (
                               <div className="message-attachments">
                                   <div className="attachments-list">
                                       {reply.attachments.map((att, index) => (
                                           <div key={index} className="attachment-chip">
                                               <div className="att-icon"><FileIcon size={16} /></div>
                                               <div className="att-info">
                                                   <div className="att-name">{att.name}</div>
                                                   <div className="att-size">{Math.round(att.size / 1024)} KB</div>
                                               </div>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}
                       </div>
                   ))}

                  <InlineReply onReply={(body, files) => {
                      if (entryPoint === '#/pos/pro' && files.length > 0) {
                          setBenchmarkResult(entryPoint, 'upload_reply_attachment', true);
                      }
                      if (entryPoint === '#/pos/pro') setBenchmarkResult(entryPoint, 'click_reply', true);

                      const replyMsg: EmailMessage = {
                          id: `email-reply-${Date.now()}`,
                          from: 'me',
                          subject: `Re: ${activeEmail.subject}`,
                          preview: body.replace(/<[^>]+>/g, '').slice(0, 60) || 'Reply...',
                          body: body,
                          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          isStarred: false,
                          isImportant: false,
                          isChecked: false,
                          isRead: true,
                          attachments: files.map(f => ({
                              name: f.name,
                              size: f.size,
                              type: f.type,
                              url: URL.createObjectURL(f)
                          }))
                      };

                      setEmails(prev => prev.map(e => {
                          if (e.id === activeEmail.id) {
                              return {
                                  ...e,
                                  replies: [...(e.replies || []), replyMsg]
                              };
                          }
                          return e;
                      }));
                  }} />
               </div>
            </div>
          </div>
        )}
      </main>

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSend={handleComposeSend} />
      )}
    </div>
  );
}

type ComposeModalProps = {
  onClose: () => void;
  onSend: (subject: string, body: string, to: string, files: File[]) => void;
};


interface QuillEditorProps {
  placeholder?: string;
  onMount: (quill: Quill) => void;
  className?: string;
  onTextChange?: (text: string) => void;
}

function QuillEditor({ placeholder, onMount, className, onTextChange }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onTextChangeRef = useRef(onTextChange);

  // Keep ref in sync with prop
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  useEffect(() => {
    if (containerRef.current && !quillRef.current) {
      quillRef.current = new Quill(containerRef.current, {
        theme: 'snow',
        placeholder: placeholder || '',
        modules: { toolbar: false }
      });

      quillRef.current.on('text-change', () => {
         // Aggressive trim: replace all whitespace including non-breaking spaces
         const text = quillRef.current?.getText()?.replace(/\s+/g, '') || '';
         if (onTextChangeRef.current) onTextChangeRef.current(text);
      });

      onMount(quillRef.current);
    }
    // Cleanup not strictly necessary for simple singleton-like usage here but good practice
    return () => {
    };
  }, []); // Empty deps is fine now because we use ref

  return <div ref={containerRef} className={className} />;
}

interface InlineReplyProps {
  onReply: (body: string, files: File[]) => void;
}

function InlineReply({ onReply }: InlineReplyProps) {
  const quillRef = useRef<Quill | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const html = quillRef.current?.root.innerHTML ?? '';
    onReply(html, files);
    setFiles([]);
    setIsEmpty(true); // Explicitly reset state
    if (quillRef.current) {
      quillRef.current.setText('');
    }
  };

  const handleBold = () => {
    const format = quillRef.current?.getFormat();
    quillRef.current?.format('bold', !format?.bold);
  };

  const handleItalic = () => {
    const format = quillRef.current?.getFormat();
    quillRef.current?.format('italic', !format?.italic);
  };

  console.log(isEmpty, files)
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
                onTextChange={(text) => setIsEmpty(text.length === 0)}
             />

             <div className="reply-footer">
                <button className="button send-btn" onClick={handleSend} disabled={isEmpty && files.length === 0}>Send</button>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
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
                <button className={`icon-btn ${files.length > 0 ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()}>
                   <Paperclip size={18} />
                   {files.length > 0 && <span className="badge-dot" />}
                </button>
                <button className="icon-btn"><Smile size={18} /></button>
                <button className="icon-btn"><Image size={18} /></button>
             </div>
              {files.length > 0 && (
                <div className="selected-files">
                  {files.map((file, i) => (
                    <div key={i} className="file-chip">
                      <span className="file-name">{file.name}</span>
                      <button className="remove-file" onClick={() => removeFile(i)}><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
          </div>
       </div>
    </div>
  );
}

function ComposeModal({ onClose, onSend }: ComposeModalProps) {
  const quillRef = useRef<Quill | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const html = quillRef.current?.root.innerHTML ?? '';
    onSend(subject || 'Untitled message', html, to || 'unknown@recipient.test', files);
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
        <input
             type="file"
             multiple
             ref={fileInputRef}
             style={{ display: 'none' }}
             onChange={handleFileSelect}
        />
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
           <button className={`icon-btn ${files.length > 0 ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={18} />
           </button>
           <button className="icon-btn"><Link size={18} /></button>
           <button className="icon-btn"><Smile size={18} /></button>
           <button className="icon-btn"><HardDrive size={18} /></button>
           <button className="icon-btn"><Image size={18} /></button>
           <button className="icon-btn"><Lock size={18} /></button>
        </div>
        <button className="icon-btn" onClick={onClose}><Trash2 size={18} /></button>
      </div>

      {files.length > 0 && (
         <div className="compose-files">
            {files.map((file, i) => (
              <div key={i} className="file-chip">
                 <span className="file-name">{file.name}</span>
                 <button className="remove-file" onClick={() => removeFile(i)}><X size={12} /></button>
              </div>
            ))}
         </div>
      )}
    </div>
  );
}
