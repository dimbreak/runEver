import type { JSONContent } from '@tiptap/core';

/**
 * Converts plain text to a Tiptap JSONContent document structure
 * Handles paragraph breaks and line breaks appropriately
 * @param text - The plain text string to convert
 * @returns A Tiptap JSONContent document with properly formatted paragraphs and line breaks
 */
export const textToDoc = (text: string): JSONContent => {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.length
        ? paragraph.split('\n').flatMap((line, idx, arr) => {
            const nodes: any[] = [];
            if (line.length) nodes.push({ type: 'text', text: line });
            if (idx !== arr.length - 1) nodes.push({ type: 'hardBreak' });
            return nodes;
          })
        : [],
    })),
  };
};

