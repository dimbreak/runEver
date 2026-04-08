import * as React from 'react';
import type { Message } from '../../state/agentStoreV2';
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
      className={cn('flex flex-col', {
        'mr-4 ml-8 items-end': isUser,
        'mr-8 ml-4 items-start': !isUser,
      })}
    >
      <p
        className={cn(
          'flex h-4 items-center text-[10px] font-semibold tracking-wide uppercase',
          {
            'text-blue-500': isUser,
            'text-slate-400': !isUser,
          },
        )}
      >
        {isUser ? 'You' : 'Agent'}
      </p>
      <div
        className={cn(
          'relative rounded-2xl px-3.5 py-3 text-sm leading-relaxed shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]',
          {
            'bg-linear-to-br from-blue-500 to-sky-400 text-white': isUser,
            'border border-slate-200 bg-white text-slate-800': !isUser,
          },
        )}
      >
        {message.tag && (
          <span
            className={`mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              isUser ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {message.tag}
          </span>
        )}
        {message.role === 'assistant' && message.text !== undefined ? (
          <pre className="font-mono text-[12px] leading-relaxed wrap-break-word whitespace-pre-wrap text-slate-800">
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
              className="block h-auto max-w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
});
