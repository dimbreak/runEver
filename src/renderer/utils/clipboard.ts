/**
 * Copies text to the clipboard using the modern Clipboard API or legacy fallback
 * @param text - The text string to copy to clipboard
 * @returns A promise that resolves to true if successful, false otherwise
 */
export const copyText = async (text: string): Promise<boolean> => {
  // Try modern Clipboard API first
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback to legacy method using textarea and execCommand
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
};

