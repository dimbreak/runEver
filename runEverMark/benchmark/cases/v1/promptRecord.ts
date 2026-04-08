import fs from 'fs';
import path from 'path';

type PromptRecord = {
  prompt?: Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  }>;
};

type PromptContent =
  | string
  | Array<{ type?: string; text?: string }>
  | undefined;

const readPromptText = (content: PromptContent) => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (item): item is { type?: string; text: string } =>
          item?.type === 'text' && typeof item.text === 'string',
      )
      .map((item) => item.text)
      .join('\n');
  }
  return '';
};

const escapeControlCharsInJsonStrings = (raw: string) => {
  let result = '';
  let inString = false;
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === '\n') {
        result += '\\n';
        continue;
      }
      if (char === '\r') {
        result += '\\r';
        continue;
      }
      if (char === '\t') {
        result += '\\t';
        continue;
      }

      const code = char.charCodeAt(0);
      if (code < 0x20) {
        result += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    }

    result += char;
  }

  return result;
};

const extractJsonLikeString = (raw: string, marker: string) => {
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }

  let result = '';
  let escaping = false;
  for (
    let index = markerIndex + marker.length;
    index < raw.length;
    index += 1
  ) {
    const char = raw[index];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      result += char;
      continue;
    }

    if (char === '"') {
      return result
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }

    result += char;
  }

  return '';
};

export const loadPromptRecord = (relativePath: string) => {
  const promptRecordPath = path.resolve(process.cwd(), relativePath);
  const rawRecord = fs.readFileSync(promptRecordPath, 'utf8');
  let record: PromptRecord;
  let userPrompt = '';
  let systemPrompt = '';

  try {
    record = JSON.parse(rawRecord) as PromptRecord;
  } catch {
    try {
      record = JSON.parse(
        escapeControlCharsInJsonStrings(rawRecord),
      ) as PromptRecord;
    } catch {
      userPrompt = extractJsonLikeString(
        rawRecord,
        '"role":"user","content":[{"type":"text","text":"',
      );
      systemPrompt = extractJsonLikeString(
        rawRecord,
        '"role":"system","content":"',
      );
      record = {};
    }
  }

  userPrompt ||= readPromptText(
    record.prompt?.find((item) => item.role === 'user')?.content,
  );
  systemPrompt ||= readPromptText(
    record.prompt?.find((item) => item.role === 'system')?.content,
  );

  if (!userPrompt || !systemPrompt) {
    throw new Error(`invalid prompt record: ${promptRecordPath}`);
  }

  return {
    userPrompt,
    systemPrompt,
  };
};
