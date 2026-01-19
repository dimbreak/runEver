let pendingAuthDeepLink: string | null = null;

export const setPendingAuthDeepLink = (url: string) => {
  pendingAuthDeepLink = url;
};

export const peekPendingAuthDeepLink = () => pendingAuthDeepLink;

export const consumePendingAuthDeepLink = () => {
  const url = pendingAuthDeepLink;
  pendingAuthDeepLink = null;
  return url;
};

export const clearPendingAuthDeepLink = () => {
  pendingAuthDeepLink = null;
};
