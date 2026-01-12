import * as React from 'react';
import { Extension, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../../utils/cn';
import { SubmitButton } from './SubmitButton';

export type TiptapEditorProps = {
  onSubmit: (content: JSONContent) => void | boolean | Promise<void | boolean>;
  onStop?: () => void;
  isRunning?: boolean;
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

const EnterSubmitBehavior = Extension.create({
  name: 'enterSubmitBehavior',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const isList =
          this.editor.isActive('bulletList') ||
          this.editor.isActive('orderedList');

        if (isList) {
          const { $from } = this.editor.state.selection;
          const isEmptyParagraph =
            $from.parent.type.name === 'paragraph' && !$from.parent.textContent;

          if (isEmptyParagraph) {
            return this.editor.commands.liftListItem('listItem');
          }
          return this.editor.commands.splitListItem('listItem');
        }

        return false;
      },
      'Shift-Enter': () => {
        return this.editor.commands.setHardBreak();
      },
    };
  },
});

export function TiptapEditor({
  onSubmit,
  onStop,
  isRunning = false,
  placeholder = 'Write something...',
  disabled,
  className,
}: TiptapEditorProps) {
  const editorRef = React.useRef<any>(null);
  const [isEmpty, setIsEmpty] = React.useState(true);

  const submit = React.useCallback(() => {
    if (isRunning) return;
    const editor = editorRef.current;
    if (!editor) return;
    const json = editor.getJSON();
    if (getIsEmpty(json)) return;
    Promise.resolve()
      .then(() => onSubmit(json))
      .then((result) => {
        if (result === false) return;
        editor.commands.clearContent(true);
        setIsEmpty(true);
      })
      .catch(() => {
        // keep editor content on submit failure/cancel
      });
  }, [isRunning, onSubmit]);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      EnterSubmitBehavior,
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        dropcursor: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: (props) => {
      setIsEmpty(getIsEmpty(props.editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class:
          'tiptap-content tiptap-default min-h-[44px] max-h-40 overflow-y-auto px-2 py-2 text-sm text-slate-700',
      },
      // Handle Enter key press to submit
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          if (isRunning) return true;
          const isList =
            view.state.doc.resolve(view.state.selection.$from.pos).parent.type
              .name === 'listItem';
          // Only submit if not in a list
          if (!isList) {
            event.preventDefault();
            submit();
            return true;
          }
        }
        return false;
      },
    },
  });

  // Store editor reference for submit callback
  React.useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  return (
    <div className={cn('border-t border-slate-100 bg-white', className)}>
      <div
        className={cn(
          'border-t rounded-lg border border-slate-200',
          'flex items-center gap-2 p-2',
          disabled && 'opacity-50',
        )}
      >
        <EditorContent className="flex-1" editor={editor} />
        <SubmitButton
          mode={isRunning ? 'stop' : 'go'}
          onClick={isRunning ? (onStop ?? (() => {})) : submit}
          disabled={
            disabled || (!isRunning && isEmpty) || (isRunning && !onStop)
          }
          hidden={!isRunning && isEmpty}
        />
      </div>
    </div>
  );
}
