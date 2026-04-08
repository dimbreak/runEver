/* eslint-disable no-new-func */
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FilePart, ImagePart } from '@ai-sdk/provider-utils';

export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type CodexCredentialMode = 'apiKey' | 'login';
export type CodexModelTier = 'hi' | 'mid' | 'low';

type CodexAttachment = ImagePart | FilePart;

type CodexSdkInputEntry =
  | {
      type: 'local_image';
      path: string;
    }
  | {
      type: 'text';
      text: string;
    };

type CodexSdkInput = string | CodexSdkInputEntry[];

type CodexSdkThreadItem = {
  id: string;
  type: string;
  message?: string;
  text?: string;
};

type CodexSdkUsage = {
  cached_input_tokens: number;
  input_tokens: number;
  output_tokens: number;
};

type CodexSdkThreadEvent =
  | {
      item: CodexSdkThreadItem;
      type: 'item.completed' | 'item.started' | 'item.updated';
    }
  | {
      message: string;
      type: 'error';
    }
  | {
      error: {
        message: string;
      };
      type: 'turn.failed';
    }
  | {
      type: 'turn.completed';
      usage: CodexSdkUsage;
    }
  | {
      type: 'thread.started' | 'turn.started';
    };

type CodexSdkThread = {
  runStreamed(input: CodexSdkInput): Promise<{
    events: AsyncIterable<CodexSdkThreadEvent>;
  }>;
};

type CodexSdkClient = {
  startThread(options: {
    additionalDirectories?: string[];
    approvalPolicy?: 'never' | 'on-failure' | 'on-request' | 'untrusted';
    model?: string;
    modelReasoningEffort?: 'high' | 'low' | 'medium' | 'minimal' | 'xhigh';
    networkAccessEnabled?: boolean;
    sandboxMode?: 'danger-full-access' | 'read-only' | 'workspace-write';
    skipGitRepoCheck?: boolean;
    webSearchEnabled?: boolean;
    workingDirectory?: string;
  }): CodexSdkThread;
};

type CodexSdkConstructor = new (options: {
  apiKey?: string;
  baseUrl?: string;
}) => CodexSdkClient;

const buildCodexSdkOptions = (config: {
  apiKey?: string;
  baseUrl?: string;
  authMode?: CodexCredentialMode;
}) => {
  const options: {
    apiKey?: string;
    baseUrl?: string;
  } = {};

  if (config.authMode !== 'login' && config.baseUrl) {
    options.baseUrl = config.baseUrl;
  }

  const trimmedKey = config.apiKey?.trim();
  if (config.authMode !== 'login' && trimmedKey) {
    options.apiKey = trimmedKey;
  }

  return options;
};

type CodexStreamOptions = {
  prompt: string;
  systemPrompt?: string;
  attachments?: CodexAttachment[] | null;
  model: string | string[];
  reasoningEffort: CodexReasoningEffort;
};

type CodexPreparedInput = {
  additionalDirectories: string[];
  cleanup: () => Promise<void>;
  input: CodexSdkInput;
};

type CodexStreamResponse = {
  finalResponse: string;
  items: CodexSdkThreadItem[];
  messages: Array<{
    content: string;
    role: 'assistant';
  }>;
  usage: CodexSdkUsage | null;
};

const DEFAULT_CODEX_MODELS: Record<CodexModelTier, string[]> = {
  hi: ['gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5-codex'],
  mid: ['gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5-codex'],
  low: ['gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.1-codex-mini', 'gpt-5-codex'],
};

const importCodexSdk = () =>
  new Function('return import("@openai/codex-sdk")')() as Promise<{
    Codex: CodexSdkConstructor;
  }>;

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isMissingModelError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('model') &&
    (message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('unsupported'))
  );
};

const sanitizeFilename = (value: string, fallback: string) => {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return sanitized.length > 0 ? sanitized : fallback;
};

const extensionFromMediaType = (
  mediaType: string | undefined,
  fallback = 'bin',
) => {
  if (!mediaType) {
    return fallback;
  }

  const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
  switch (normalized) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
    case 'text/plain':
      return 'txt';
    case 'application/json':
      return 'json';
    default: {
      const slashIndex = normalized.indexOf('/');
      if (slashIndex !== -1 && slashIndex < normalized.length - 1) {
        return normalized.slice(slashIndex + 1);
      }
      return fallback;
    }
  }
};

const ensureLocalPath = async (value: string) => {
  const candidates = [value, path.resolve(value)];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return null;
};

const decodeDataUrl = (value: string) => {
  const match = value.match(
    /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i,
  );
  if (!match) {
    return null;
  }

  const mediaType = match[1] || undefined;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return {
    buffer,
    mediaType,
  };
};

const toBuffer = (value: string | Uint8Array | ArrayBuffer | Buffer) => {
  if (typeof value === 'string') {
    const decoded = decodeDataUrl(value);
    if (decoded) {
      return decoded.buffer;
    }
    return Buffer.from(value, 'utf8');
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(value);
};

const createTempDir = async () =>
  fs.mkdtemp(path.join(os.tmpdir(), 'runever-codex-'));

const materializeImage = async (
  attachment: ImagePart,
  tempDir: string,
): Promise<string> => {
  const { image } = attachment;
  const extension = extensionFromMediaType(attachment.mediaType, 'png');

  if (image instanceof URL) {
    if (image.protocol === 'file:') {
      return fileURLToPath(image);
    }
    throw new Error(
      `Codex SDK only supports local image attachments. Remote image URL not supported: ${image.toString()}`,
    );
  }

  if (typeof image === 'string') {
    if (isHttpUrl(image)) {
      throw new Error(
        `Codex SDK only supports local image attachments. Remote image URL not supported: ${image}`,
      );
    }

    const existingPath = await ensureLocalPath(image);
    if (existingPath) {
      return existingPath;
    }

    const decoded = decodeDataUrl(image);
    const buffer = decoded ? decoded.buffer : Buffer.from(image, 'base64');
    const filePath = path.join(tempDir, `${randomUUID()}.${extension}`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  const filePath = path.join(tempDir, `${randomUUID()}.${extension}`);
  await fs.writeFile(filePath, toBuffer(image));
  return filePath;
};

const materializeFile = async (
  attachment: FilePart,
  tempDir: string,
): Promise<string> => {
  const preferredName = attachment.filename || `${randomUUID()}.bin`;
  const extension = extensionFromMediaType(
    attachment.mediaType,
    preferredName.includes('.')
      ? preferredName.split('.').pop() || 'bin'
      : 'bin',
  );
  const baseName = preferredName.includes('.')
    ? preferredName.slice(0, preferredName.lastIndexOf('.'))
    : preferredName;
  const fileName = `${sanitizeFilename(baseName, 'attachment')}.${extension}`;
  const filePath = path.join(tempDir, fileName);

  if (attachment.data instanceof URL) {
    if (attachment.data.protocol === 'file:') {
      return fileURLToPath(attachment.data);
    }
    throw new Error(
      `Codex SDK only supports local file attachments. Remote file URL not supported: ${attachment.data.toString()}`,
    );
  }

  await fs.writeFile(filePath, toBuffer(attachment.data));
  return filePath;
};

const prepareInput = async ({
  prompt,
  systemPrompt,
  attachments,
}: {
  prompt: string;
  systemPrompt?: string;
  attachments?: CodexAttachment[] | null;
}): Promise<CodexPreparedInput> => {
  let tempDir: string | null = null;
  const input: CodexSdkInputEntry[] = [];
  const additionalDirectories = new Set<string>();
  const filePaths: string[] = [];

  const ensureTempDir = async () => {
    if (!tempDir) {
      tempDir = await createTempDir();
      additionalDirectories.add(tempDir);
    }
    return tempDir;
  };

  for (const attachment of attachments ?? []) {
    if (attachment.type === 'image') {
      const imagePath = await materializeImage(
        attachment,
        await ensureTempDir(),
      );
      additionalDirectories.add(path.dirname(imagePath));
      input.push({
        type: 'local_image',
        path: imagePath,
      });
      continue;
    }

    const filePath = await materializeFile(attachment, await ensureTempDir());
    additionalDirectories.add(path.dirname(filePath));
    filePaths.push(filePath);
  }

  const textSections: string[] = [];
  if (systemPrompt?.trim()) {
    textSections.push(
      ['Follow these system instructions exactly:', systemPrompt.trim()].join(
        '\n',
      ),
    );
  }

  let promptText = prompt;
  if (filePaths.length > 0) {
    promptText = [
      prompt,
      'Attached files are available at these local paths:',
      ...filePaths.map((filePath) => `- ${filePath}`),
      'Read those files from disk before answering if they are relevant.',
    ].join('\n');
  }
  textSections.push(promptText);

  input.unshift({
    type: 'text',
    text: textSections.join('\n\n'),
  });

  return {
    additionalDirectories: [...additionalDirectories],
    cleanup: async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    },
    input,
  };
};

const buildResponse = ({
  finalResponse,
  items,
  usage,
}: {
  finalResponse: string;
  items: CodexSdkThreadItem[];
  usage: CodexSdkUsage | null;
}): CodexStreamResponse => ({
  finalResponse,
  items,
  messages: [
    {
      content: finalResponse,
      role: 'assistant',
    },
  ],
  usage,
});

export const createCodexWrapper = (config: {
  apiKey?: string;
  baseUrl?: string;
  authMode?: CodexCredentialMode;
}) => {
  let codexPromise: Promise<CodexSdkClient> | null = null;
  const getCodex = async () => {
    if (!codexPromise) {
      codexPromise = importCodexSdk().then(
        ({ Codex }) => new Codex(buildCodexSdkOptions(config)),
      );
    }
    return codexPromise;
  };

  return {
    models: DEFAULT_CODEX_MODELS,
    async stream({
      prompt,
      systemPrompt,
      attachments,
      model,
      reasoningEffort,
    }: CodexStreamOptions) {
      let resolveResponse!: (value: CodexStreamResponse) => void;
      let rejectResponse!: (reason?: unknown) => void;
      const response = new Promise<CodexStreamResponse>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });

      const modelCandidates = Array.isArray(model) ? model : [model];
      const preparedInput = await prepareInput({
        prompt,
        systemPrompt,
        attachments,
      });

      const textStream = (async function* () {
        try {
          let lastError: unknown;
          const codex = await getCodex();

          for (const candidate of modelCandidates) {
            const thread = codex.startThread({
              additionalDirectories: preparedInput.additionalDirectories,
              approvalPolicy: 'never',
              model: candidate,
              modelReasoningEffort: reasoningEffort,
              networkAccessEnabled: false,
              sandboxMode: 'read-only',
              skipGitRepoCheck: true,
              webSearchEnabled: false,
              workingDirectory: process.cwd(),
            });
            const { events } = await thread.runStreamed(preparedInput.input);
            const completedItems: CodexSdkThreadItem[] = [];
            const messageTexts = new Map<string, string>();
            const messageOrder: string[] = [];
            let usage: CodexSdkUsage | null = null;
            let turnError: Error | null = null;
            let yieldedText = false;

            for await (const event of events) {
              switch (event.type) {
                case 'item.started':
                  if (
                    event.item.type === 'agent_message' &&
                    !messageTexts.has(event.item.id)
                  ) {
                    if (event.item.text) {
                      yieldedText = true;
                      yield event.item.text;
                    }
                    messageTexts.set(event.item.id, event.item.text ?? '');
                    messageOrder.push(event.item.id);
                  }
                  break;
                case 'item.updated':
                case 'item.completed':
                  if (event.item.type === 'agent_message') {
                    const previousText = messageTexts.get(event.item.id) ?? '';
                    const nextText = event.item.text ?? '';
                    if (!messageTexts.has(event.item.id)) {
                      messageOrder.push(event.item.id);
                    }
                    messageTexts.set(event.item.id, nextText);

                    const delta = nextText.startsWith(previousText)
                      ? nextText.slice(previousText.length)
                      : nextText;
                    if (delta) {
                      yieldedText = true;
                      yield delta;
                    }
                  }

                  if (event.type === 'item.completed') {
                    completedItems.push(event.item);
                    if (event.item.type === 'error' && event.item.message) {
                      turnError = new Error(event.item.message);
                    }
                  }
                  break;
                case 'turn.completed':
                  usage = event.usage;
                  break;
                case 'turn.failed':
                  turnError = new Error(event.error.message);
                  break;
                case 'error':
                  turnError = new Error(event.message);
                  break;
                default:
                  break;
              }

              if (turnError) {
                break;
              }
            }

            if (turnError) {
              lastError = turnError;
              if (isMissingModelError(turnError) && !yieldedText) {
                continue;
              }
              rejectResponse(turnError);
              throw turnError;
            }

            const finalResponse = messageOrder
              .map((id) => messageTexts.get(id) ?? '')
              .filter(Boolean)
              .join('\n\n');
            const resolvedResponse = buildResponse({
              finalResponse,
              items: completedItems,
              usage,
            });
            resolveResponse(resolvedResponse);
            return;
          }

          const error =
            lastError ?? new Error('No Codex model candidate is available.');
          rejectResponse(error);
          throw error;
        } finally {
          await preparedInput.cleanup();
        }
      })();

      return {
        textStream,
        response,
      };
    },
  };
};
