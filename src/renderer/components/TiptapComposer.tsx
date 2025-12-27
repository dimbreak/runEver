import * as React from 'react';
import { Extension, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../utils/cn';
import { SubmitButton } from './SubmitButton';

export type TiptapComposerProps = {
  onSubmit: (content: JSONContent) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const getIsEmpty = (content: JSONContent) => {
  const nodes = content.content ?? [];
  if (!nodes.length) return true;
  return nodes.every((node) => {
    if (node.type !== 'paragraph') return false;
    const text = (node.content ?? [])
      .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
      .join('');
    return !text.trim();
  });
};

const ListEnterBehavior = Extension.create({
  name: 'listEnterBehavior',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const isList =
          this.editor.isActive('bulletList') ||
          this.editor.isActive('orderedList');
        if (!isList) return false;

        const { $from } = this.editor.state.selection;
        const isEmptyParagraph =
          $from.parent.type.name === 'paragraph' && !$from.parent.textContent;

        if (isEmptyParagraph) {
          return this.editor.commands.liftListItem('listItem');
        }
        return this.editor.commands.splitListItem('listItem');
      },
    };
  },
});

export function TiptapComposer({
  onSubmit,
  placeholder = 'Write something...',
  disabled,
  className,
}: TiptapComposerProps) {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      ListEnterBehavior,
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        class:
          'tiptap-content tiptap-default min-h-[44px] max-h-40 overflow-y-auto px-2 py-2 text-sm text-slate-700',
      },
    },
  });

  const submit = React.useCallback(() => {
    if (!editor) return;
    const json = editor.getJSON();
    if (getIsEmpty(json)) return;
    onSubmit(json);
    editor.commands.clearContent(true);
  }, [editor, onSubmit]);

  return (
    <div
      className={cn('border-t border-slate-100 bg-white px-4 py-3', className)}
    >
      <div
        className={cn(
          'border-t rounded-lg border border-slate-200',
          'flex items-center gap-2 p-2',
          disabled && 'opacity-50',
        )}
      >
        <EditorContent className="flex-1" editor={editor} />
        <SubmitButton onClick={submit} disabled={disabled} />
      </div>
    </div>
  );
}
