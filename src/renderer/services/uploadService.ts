export type UploadedAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
  data: ArrayBuffer;
};

const createId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  const anyFile = file as any;
  if (typeof anyFile.arrayBuffer === 'function') {
    return anyFile.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('File read aborted'));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('Unexpected file read result'));
    };
    reader.readAsArrayBuffer(file);
  });
};

export const uploadService = {
  async uploadFiles(files: File[]): Promise<UploadedAttachment[]> {
    const normalized = (files ?? []).filter(Boolean);
    if (normalized.length === 0) return [];

    const uploaded = await Promise.all(
      normalized.map(async (file) => {
        const data = await readFileAsArrayBuffer(file);
        return {
          id: createId(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          lastModified: file.lastModified,
          data,
        } satisfies UploadedAttachment;
      }),
    );

    return uploaded;
  },
};
