import * as React from 'react';
import type { Message } from '../../state/agentStore';
import { TiptapContent } from '../TiptapContent';
import { AttachmentPreview } from './AttachmentPreview';
import { cn } from '../../utils/cn';

type MessageItemProps = {
  message: Message;
};

export const MessageItem = React.memo(({ message }: MessageItemProps) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex w-full', {
        'justify-end': isUser,
        'justify-start': !isUser,
      })}
    >
      <div
        className={cn('flex max-w-[85%] flex-col', {
          'items-start': !isUser,
          'items-end': isUser,
        })}
      >
        <div
          className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
            isUser ? 'text-blue-500' : 'text-slate-400'
          }`}
        >
          {isUser ? 'You' : 'Agent'}
        </div>
        <div
          className={cn(
            'relative rounded-2xl px-3.5 py-3 text-sm leading-relaxed shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]',
            {
              'bg-linear-to-br from-blue-500 to-sky-400 text-white': isUser,
              'bg-white border border-slate-200 text-slate-800': !isUser,
            },
          )}
        >
          {message.tag && (
            <span
              className={`mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                isUser
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {message.tag}
            </span>
          )}
          {message.role === 'assistant' && message.text !== undefined ? (
            <pre className="whitespace-pre-wrap wrap-break-word font-mono text-[12px] leading-relaxed text-slate-800">
              {message.text}
            </pre>
          ) : (
            <TiptapContent
              content={message.content}
              variant={message.role === 'user' ? 'inverse' : 'default'}
            />
          )}
          {message.attachments &&
            message.attachments.map((file) => (
              <AttachmentPreview
                key={`${message.id}-${file.name}-${file.size}`}
                file={file}
                variant={message.role}
              />
            ))}
          {message.llmResponding && (
            <div className="mt-1 text-xs opacity-60">...</div>
          )}
          {message.image && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <img
                src={message.image}
                alt="screenshot"
                className="max-w-full h-auto block"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
