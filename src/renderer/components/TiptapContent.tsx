import * as React from 'react';
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { cn } from '../utils/cn';

export type TiptapContentProps = {
  content: JSONContent;
  className?: string;
  variant?: 'default' | 'inverse';
};

export function TiptapContent({
  content,
  className,
  variant = 'default',
}: TiptapContentProps) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap-content',
          variant === 'inverse' ? 'tiptap-inverse' : 'tiptap-default',
          className,
        ),
      },
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  return <EditorContent editor={editor} />;
}
