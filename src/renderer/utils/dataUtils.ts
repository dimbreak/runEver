/**
 * Converts an ArrayBuffer to a base64-encoded string
 * @param buffer - The ArrayBuffer to convert
 * @returns A base64-encoded string representation of the buffer
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

/**
 * Builds a data URL from a file object with ArrayBuffer data
 * @param file - An object containing mimeType and data (ArrayBuffer)
 * @returns A data URL string in the format `data:{mimeType};base64,{base64Data}`
 */
export const buildDataUrl = (file: {
  mimeType: string;
  data: ArrayBuffer;
}): string => {
  const base64 = arrayBufferToBase64(file.data);
  return `data:${file.mimeType};base64,${base64}`;
};

/**
 * Downloads a file by creating a temporary link and triggering a download
 * @param data - The file data as ArrayBuffer
 * @param filename - The name to save the file as
 * @param mimeType - The MIME type of the file
 */
export const downloadFile = (
  data: ArrayBuffer,
  filename: string,
  mimeType: string,
): void => {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
