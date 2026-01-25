import { createAIClient } from '@apitrust/react';
import type { FilePart, ImagePart } from '@ai-sdk/provider-utils';

export type ApiTrustAttachment = ImagePart | FilePart;
export type ApiTrustTokenProvider =
  | string
  | null
  | (() => string | null | Promise<string | null>);

export type ApiTrustGatewayConfig = {
  clientId: string;
  redirectUri: string;
  apiUrl: string;
};

const resolveToken = async (provider: ApiTrustTokenProvider) => {
  if (typeof provider === 'function') {
    return provider();
  }
  return provider;
};

const buildMessages = (
  prompt: string,
  systemPrompt: string,
  attachments: ApiTrustAttachment[] | null,
) => {
  // TODO: ApiTrust doesn't accept attachment payloads yet. Skip API trust flow when attachments exist.
  if (attachments && attachments.length > 0) {
    return null;
  }

  if (systemPrompt) {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];
  }
  return [{ role: 'user', content: prompt }];
};

const streamApiTrust = async function* (
  config: ApiTrustGatewayConfig,
  token: string,
  messages: any[],
  model?: string,
): AsyncGenerator<string, void, void> {
  const client = createAIClient(
    {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      apiUrl: config.apiUrl,
    },
    token,
  );

  const queue: string[] = [];
  let finished = false;
  let failure: unknown = null;
  let notify: (() => void) | null = null;

  const push = (chunk: string) => {
    queue.push(chunk);
    if (notify) {
      notify();
      notify = null;
    }
  };

  const finalize = (error?: unknown) => {
    if (error) {
      failure = error;
    }
    finished = true;
    if (notify) {
      notify();
      notify = null;
    }
  };

  client
    .stream(messages, model ? { model } : undefined, push)
    .then(() => finalize())
    .catch((error) => finalize(error));

  while (true) {
    if (queue.length > 0) {
      yield queue.shift() as string;
      continue;
    }
    if (finished) {
      if (failure) {
        throw failure;
      }
      return;
    }
    // eslint-disable-next-line no-loop-func -- Safe: Promise is awaited before next iteration
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
};

export const getApiTrustStream = async (params: {
  config: ApiTrustGatewayConfig;
  tokenProvider: ApiTrustTokenProvider;
  prompt: string;
  systemPrompt?: string;
  attachments?: ApiTrustAttachment[] | null;
  model?: string;
}) => {
  const token = await resolveToken(params.tokenProvider);
  console.log('getApiTrustStream ===========> token', token);
  if (!token) {
    return null;
  }
  console.log('getApiTrustStream ===========> params', params);
  const messages = buildMessages(
    params.prompt,
    params.systemPrompt ?? '',
    params.attachments ?? null,
  );
  console.log('getApiTrustStream ===========> messages', messages);
  if (!messages) {
    return null;
  }
  return streamApiTrust(params.config, token, messages, params.model);
};
