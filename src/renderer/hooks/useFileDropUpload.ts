import * as React from 'react';
import {
  uploadService,
  type UploadedAttachment,
} from '../services/uploadService';

export type UseFileDropUploadOptions = {
  onError?: (err: Error) => void;
  upload?: (files: File[]) => Promise<UploadedAttachment[]>;
};

type PendingFile = {
  name: string;
  size: number;
  type: string;
};

const toPendingFiles = (dt: DataTransfer | null): PendingFile[] => {
  if (!dt) return [];
  return Array.from(dt.files ?? []).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type,
  }));
};

export const useFileDropUpload = (opts: UseFileDropUploadOptions = {}) => {
  const upload = opts.upload ?? uploadService.uploadFiles;
  const [attachments, setAttachments] = React.useState<UploadedAttachment[]>(
    [],
  );
  const [isUploading, setIsUploading] = React.useState(false);
  const [dragCounter, setDragCounter] = React.useState(0);
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);

  const isDragActive = dragCounter > 0;

  const addFiles = React.useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setIsUploading(true);
      try {
        const uploaded = await upload(files);
        setAttachments((prev) => [...prev, ...uploaded]);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        opts.onError?.(error);
      } finally {
        setIsUploading(false);
      }
    },
    [opts, upload],
  );

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const clearAttachments = React.useCallback(() => {
    setAttachments([]);
  }, []);

  const onDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingFiles(toPendingFiles(e.dataTransfer));
    setDragCounter((c) => c + 1);
  }, []);

  const onDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => {
      const next = Math.max(0, c - 1);
      if (next === 0) setPendingFiles([]);
      return next;
    });
  }, []);

  const onDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setPendingFiles(toPendingFiles(e.dataTransfer));
  }, []);

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragCounter(0);
      setPendingFiles([]);
      const files = Array.from(e.dataTransfer?.files ?? []);
      addFiles(files);
    },
    [addFiles],
  );

  const dropzoneProps = React.useMemo(
    () => ({
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    }),
    [onDragEnter, onDragLeave, onDragOver, onDrop],
  );

  return {
    attachments,
    isUploading,
    isDragActive,
    pendingFiles,
    addFiles,
    removeAttachment,
    clearAttachments,
    dropzoneProps,
  };
};
