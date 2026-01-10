import { uploadService } from '../renderer/services/uploadService';

describe('uploadService', () => {
  it('stores uploaded file data in memory', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const [uploaded] = await uploadService.uploadFiles([file]);
    expect(uploaded.name).toBe('hello.txt');
    expect(uploaded.mimeType).toBe('text/plain');
    expect(Buffer.from(uploaded.data).toString('utf-8')).toBe('hello');
  });

  it('supports multiple files', async () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['bb'], 'b.txt', { type: 'text/plain' });
    const uploaded = await uploadService.uploadFiles([a, b]);
    expect(uploaded).toHaveLength(2);
    expect(uploaded.map((v) => v.name).sort()).toEqual(['a.txt', 'b.txt']);
  });
});

