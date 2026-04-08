import * as React from 'react';
import { Extension, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../../utils/cn';
import { docToText, textToDoc } from '../../utils/contentUtils';
import {
  appendPromptHistoryEntry,
  loadPromptHistory,
  navigatePromptHistory,
  savePromptHistory,
} from '../../utils/promptHistory';
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
  const [historyEntries, setHistoryEntries] = React.useState<string[]>(() =>
    loadPromptHistory(),
  );
  const historyEntriesRef = React.useRef(historyEntries);
  const historyIndexRef = React.useRef<number | null>(null);
  const historyDraftRef = React.useRef('');
  const isRunningRef = React.useRef(isRunning);
  const skipHistorySyncRef = React.useRef(false);

  React.useEffect(() => {
    historyEntriesRef.current = historyEntries;
  }, [historyEntries]);

  React.useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const replaceEditorText = React.useCallback((value: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    skipHistorySyncRef.current = true;
    editor.commands.setContent(textToDoc(value), false);
    editor.commands.focus('end');
    setIsEmpty(!value.trim());
  }, []);

  const submit = React.useCallback(() => {
    if (isRunning) return;
    const editor = editorRef.current;
    if (!editor) return;
    const json = editor.getJSON();
    if (getIsEmpty(json)) return;
    const submittedText = docToText(json);

    Promise.resolve()
      .then(() => onSubmit(json))
      .then((result) => {
        if (result === false) return false;
        const nextHistory = appendPromptHistoryEntry(
          historyEntriesRef.current,
          submittedText,
        );
        if (nextHistory !== historyEntriesRef.current) {
          historyEntriesRef.current = nextHistory;
          setHistoryEntries(nextHistory);
          savePromptHistory(nextHistory);
        }
        historyIndexRef.current = null;
        historyDraftRef.current = '';
        editor.commands.clearContent(true);
        setIsEmpty(true);
        return true;
      })
      .catch(() => {
        // keep editor content on submit failure/cancel
      });
  }, [isRunning, onSubmit]);

  const submitRef = React.useRef(submit);

  React.useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

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
      const content = props.editor.getJSON();
      setIsEmpty(getIsEmpty(content));

      if (skipHistorySyncRef.current) {
        skipHistorySyncRef.current = false;
        return;
      }

      historyIndexRef.current = null;
      historyDraftRef.current = docToText(content);
    },
    editorProps: {
      attributes: {
        class:
          'tiptap-content tiptap-default min-h-[44px] max-h-40 overflow-y-auto px-2 py-2 text-sm text-slate-700',
      },
      handleKeyDown: (view, event) => {
        if (
          !event.isComposing &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          const { selection, doc } = view.state;
          const atStart =
            selection.empty &&
            selection.$from.parentOffset === 0 &&
            selection.$from.index(0) === 0;
          const atEnd =
            selection.empty &&
            selection.$from.parentOffset ===
              selection.$from.parent.content.size &&
            selection.$from.index(0) === doc.childCount - 1;
          const shouldRecall =
            (event.key === 'ArrowUp' && atStart) ||
            (event.key === 'ArrowDown' && atEnd);

          if (shouldRecall) {
            const currentValue = docToText(view.state.doc.toJSON());
            const { nextIndex, nextValue, nextDraft } = navigatePromptHistory({
              entries: historyEntriesRef.current,
              currentIndex: historyIndexRef.current,
              currentValue,
              draft: historyDraftRef.current,
              direction: event.key === 'ArrowUp' ? -1 : 1,
            });

            if (nextValue !== null) {
              event.preventDefault();
              historyIndexRef.current = nextIndex;
              historyDraftRef.current = nextDraft;
              replaceEditorText(nextValue);
              return true;
            }
          }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          if (isRunningRef.current) return true;
          const isList =
            view.state.doc.resolve(view.state.selection.$from.pos).parent.type
              .name === 'listItem';
          if (!isList) {
            event.preventDefault();
            submitRef.current();
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
          'rounded-lg border border-t border-slate-200',
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
