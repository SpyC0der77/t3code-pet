import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function chatUrl(dataDirectory: string, threadId: string): string {
  const runtime = JSON.parse(readFileSync(join(dataDirectory, 'server-runtime.json'), 'utf8'));
  const environmentId = readFileSync(join(dataDirectory, 'environment-id'), 'utf8').trim();
  if (!/^[\w-]{1,512}$/.test(environmentId) || !/^[\w-]{1,512}$/.test(threadId)) {
    throw new Error('Invalid T3 Code chat address.');
  }
  const { host, port } = runtime;
  if (!['localhost', '127.0.0.1', '::1', '0.0.0.0', '::'].includes(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('T3 Code must be running locally to open a chat.');
  }
  const hostname = host === '::' || host === '::1' ? '[::1]' : host === '0.0.0.0' ? '127.0.0.1' : host;
  return `http://${hostname}:${port}/${environmentId}/${threadId}`;
}
