import type { AIRequest } from '../shared/contracts';
import { WorkspaceService } from './workspace';

export function validateEndpoint(address: string): URL {
  let url: URL;
  try { url = new URL(address); } catch { throw new Error('Enter a valid AI API endpoint URL.'); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (!['https:','http:'].includes(url.protocol) || (url.protocol === 'http:' && !local) || url.username || url.password || url.hash) throw new Error('Use HTTPS, or HTTP on loopback only. URL credentials and fragments are not allowed.');
  return url;
}
export async function requestAI(request: AIRequest, workspace: WorkspaceService): Promise<string> {
  if (!request || !['openai-compatible','anthropic-compatible'].includes(request.provider)) throw new Error('Select a supported provider.');
  const endpoint = validateEndpoint(request.endpoint);
  const text = request.question?.trim();
  if (!text || text.length > 5000) throw new Error('Enter an engineering question under 5,000 characters.');
  if (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 150) throw new Error('Enter a valid model name.');
  if (request.code && (typeof request.code !== 'string' || request.code.length > 40000)) throw new Error('File context exceeds the 40,000-character limit.');
  if (typeof request.authorized !== 'boolean' || !request.authorized) throw new Error('Explicit context transfer approval is required for each AI request.');
  if (request.code) workspace.requireWorkspace(true);
  const basename = typeof request.fileName === 'string' ? request.fileName.split(/[/\\]/).at(-1)?.slice(0,120) : undefined;
  const prompt = `${text}${request.code ? `\n\nUser-approved file context (${basename || 'unnamed file'}):\n\u0060\u0060\u0060\n${request.code}\n\u0060\u0060\u0060` : ''}`;
  const system = 'You are RYVEN AI Engineer. Provide concrete engineering help. Do not claim code was executed, tests passed, or vulnerabilities were ruled out unless actual evidence was supplied. Suggest changes but do not claim to apply them.';
  const isAnthropic = request.provider === 'anthropic-compatible';
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (request.apiKey) {
    if (typeof request.apiKey !== 'string' || request.apiKey.length > 4000) throw new Error('Invalid API key.');
    if (isAnthropic) headers['x-api-key'] = request.apiKey;
    else headers.Authorization = `Bearer ${request.apiKey}`;
  }
  if (isAnthropic) headers['anthropic-version'] = '2023-06-01';
  const body = isAnthropic ? { model: request.model, max_tokens: 1200, system, messages: [{ role: 'user', content: prompt }] } : { model: request.model, max_tokens: 1200, stream: false, messages: [{role:'system',content:system},{role:'user',content:prompt}] };
  let response: Response;
  try { response = await fetch(endpoint.href, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(90000) }); }
  catch (error) { throw new Error(`Provider request failed: ${(error as Error).message}`); }
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check your endpoint, model and credentials.`);
  if (Number(response.headers.get('content-length') || 0) > 1_000_000) throw new Error('Provider response exceeds the 1 MB limit.');
  let raw: string;
  try { raw = await response.text(); } catch { throw new Error('Could not read provider response.'); }
  if (raw.length > 1_000_000) throw new Error('Provider response exceeds the 1 MB limit.');
  try {
    const data = JSON.parse(raw) as { choices?: {message?:{content?:string}}[]; content?:{text?:string}[] };
    const content = isAnthropic ? data.content?.map(x=>x.text||'').join('\n') : data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') throw new Error('Provider returned no readable text.');
    return content.slice(0, 60000);
  } catch (error) { throw new Error(`Invalid provider response: ${(error as Error).message}`); }
}
