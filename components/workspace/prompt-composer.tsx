'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, FileText, Plus, Square, Upload, X } from 'lucide-react';

type PromptComposerProps = {
  type: string;
  placeholder: string;
  busy: boolean;
  suggestedDraft?: string;
  onSubmit: (text: string) => Promise<boolean>;
  onStop: () => void;
};

export function PromptComposer({
  type,
  placeholder,
  busy,
  suggestedDraft,
  onSubmit,
  onStop,
}: PromptComposerProps) {
  const [draft, setDraft] = useState('');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const imageAttachments = useMemo(
    () =>
      selectedFiles
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => file.type.startsWith('image/'))
        .map(({ file, index }) => ({
          file,
          index,
          previewUrl: URL.createObjectURL(file),
        })),
    [selectedFiles],
  );
  const documentAttachments = selectedFiles
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => !file.type.startsWith('image/'));

  useEffect(() => {
    if (suggestedDraft) setDraft(suggestedDraft);
  }, [suggestedDraft]);

  useEffect(
    () => () => {
      imageAttachments.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    },
    [imageAttachments],
  );

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;

    setDraft('');
    const success = await onSubmit(text);
    if (!success) setDraft(text);
  }

  function removeAttachment(index: number) {
    setSelectedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <form
      className={`chat-composer ${type == 'workspace' ? 'max-w-110' : 'max-w-92'}`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          setSelectedFiles((current) => [...current, ...files]);
          event.target.value = '';
          setFileMenuOpen(false);
        }}
      />
      {selectedFiles.length > 0 && (
        <div className="composer-attachments">
          {imageAttachments.length > 0 && (
            <div className="image-attachments">
              {imageAttachments.map(({ file, index, previewUrl }) => (
                <div className="image-attachment" key={`${file.name}-${index}`}>
                  <img src={previewUrl} alt={file.name} />
                  <button
                    className="attachment-remove"
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeAttachment(index)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {documentAttachments.length > 0 && (
            <div className="document-attachments">
              {documentAttachments.map(({ file, index }) => (
                <div className="document-attachment" key={`${file.name}-${index}`}>
                  <FileText size={18} aria-hidden="true" />
                  <span>{file.name}</span>
                  <button
                    className="attachment-remove"
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeAttachment(index)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="composer-row">
        <div className="relative">
          {fileMenuOpen && (
            <button
              className="button upload-file-button"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} />
              Upload file
            </button>
          )}
          <button
            className="button add-file-button"
            type="button"
            aria-label="Add file"
            aria-expanded={fileMenuOpen}
            onClick={() => setFileMenuOpen((open) => !open)}
          >
            <Plus size={20} />
          </button>
        </div>
        <textarea
          aria-label={placeholder}
          placeholder={placeholder}
          value={draft}
          maxLength={6000}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {busy ? (
          <button
            className="button send-button"
            type="button"
            aria-label="Stop response"
            onClick={onStop}
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            className="button send-button"
            aria-label="Send question"
            disabled={!draft.trim()}
          >
            <ArrowUp size={20} />
          </button>
        )}
      </div>
    </form>
  );
}
