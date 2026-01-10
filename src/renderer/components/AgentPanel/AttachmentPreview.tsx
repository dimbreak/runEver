import * as React from 'react';
import type { Message } from '../../state/agentStore';
import { copyText } from '../../utils/clipboard';
import { buildDataUrl, downloadFile } from '../../utils/dataUtils';
import { formatBytes } from '../../utils/formatter';

type Attachment = NonNullable<Message['attachments']>[number];

type AttachmentPreviewProps = {
  file: Attachment;
  variant: 'user' | 'assistant';
};

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  file,
  variant,
}) => {
  const isImage = file.mimeType.startsWith('image/');
  const previewUrl = React.useMemo(() => {
    if (!isImage) return null;
    return URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
  }, [file.data, file.mimeType, isImage]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownload = React.useCallback(() => {
    downloadFile(file.data, file.name, file.mimeType);
  }, [file.data, file.mimeType, file.name]);

  const handleCopyLink = React.useCallback(async () => {
    const dataUrl = buildDataUrl(file);
    await copyText(dataUrl);
  }, [file]);

  return (
    <div className="mt-2 space-y-2">
      {previewUrl && (
        <div
          className={`overflow-hidden rounded-xl border ${
            variant === 'user'
              ? 'border-white/40 bg-white/10'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <img
            src={previewUrl}
            alt={file.name}
            className="max-w-full h-auto block"
          />
        </div>
      )}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-[11px] ${
          variant === 'user'
            ? 'bg-white/20 text-white'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        <div className="max-w-[200px] truncate font-semibold">{file.name}</div>
        <div className="opacity-70">
          {file.mimeType} · {formatBytes(file.size)}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            variant === 'user'
              ? 'bg-white/20 text-white'
              : 'bg-white text-slate-700'
          }`}
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            variant === 'user'
              ? 'bg-white/20 text-white'
              : 'bg-white text-slate-700'
          }`}
        >
          Copy Link
        </button>
      </div>
    </div>
  );
};
