import { useEffect, useMemo, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import FlowFrame from '../FlowFrame';

const emails = [
  {
    id: 'em-101',
    from: 'Product Studio',
    subject: 'Your onboarding kit is ready',
    preview: 'Grab the checklist, assets, and launch plan.'
  },
  {
    id: 'em-102',
    from: 'Billing',
    subject: 'Invoice paid - March 2025',
    preview: 'Thank you! Receipt attached for your records.'
  },
  {
    id: 'em-103',
    from: 'Ava Mora',
    subject: 'Weekly growth experiment notes',
    preview: 'We should test the new discovery surfaces.'
  },
  {
    id: 'em-104',
    from: 'Support',
    subject: 'Ticket #4421 resolved',
    preview: 'Your domain verification cleared successfully.'
  }
];

export default function EmailListFlow() {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const quillModules = useMemo(
    () => ({
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link']
      ]
    }),
    []
  );
  const isEditorEmpty = messageBody.replace(/<(.|\n)*?>/g, '').trim().length === 0;
  const closeComposer = () => {
    setIsComposerOpen(false);
    setMessageBody('');
  };

  useEffect(() => {
    if (!isComposerOpen || !editorRef.current || quillRef.current) {
      return;
    }

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: quillModules,
      placeholder: 'Start typing your message...'
    });

    quill.on('text-change', () => {
      setMessageBody(quill.root.innerHTML);
    });

    quillRef.current = quill;
    return () => {
      quillRef.current = null;
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
    };
  }, [isComposerOpen, quillModules]);
  return (
    <FlowFrame title="Inbox" subtitle="Flow: email_list" theme="mail">
      <div className="mail">
        <div className="mail__toolbar">
          <div className="mail__actions">
            <button className="btn btn--ghost" type="button">
              Delete
            </button>
            <button className="btn btn--primary" type="button" onClick={() => setIsComposerOpen(true)}>
              New message
            </button>
          </div>
          <div className="mail__filters">
            <button className="pill pill--active">Priority</button>
            <button className="pill">Unread</button>
            <button className="pill">Team</button>
          </div>
        </div>
        <div className="mail__list">
          {emails.map((email) => (
            <div key={email.id} className="mail__item">
              <input type="checkbox" aria-label={`Select ${email.subject}`} />
              <div>
                <p className="mail__from">{email.from}</p>
                <p className="mail__subject">{email.subject}</p>
                <p className="mail__preview">{email.preview}</p>
              </div>
              <span className="mail__time">09:4{email.id.slice(-1)} AM</span>
            </div>
          ))}
        </div>
      </div>
      {isComposerOpen && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__backdrop" onClick={closeComposer} />
          <div className="modal__content">
            <div className="modal__header">
              <h3>New message</h3>
              <button className="link" type="button" onClick={closeComposer}>
                Close
              </button>
            </div>
            <div className="modal__body">
              <label className="field">
                To
                <input type="email" placeholder="team@signalstack.io" />
              </label>
              <label className="field">
                Subject
                <input type="text" placeholder="Quarterly update" />
              </label>
              <div className="editor" role="textbox" aria-multiline="true">
                <div ref={editorRef} />
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" type="button">
                Save draft
              </button>
              <button className="btn btn--primary" type="button" disabled={isEditorEmpty}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </FlowFrame>
  );
}
