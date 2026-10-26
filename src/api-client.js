import { accountHeaders } from './account-client.js';

export async function api(path, data, { signal } = {}) {
  const auth = await accountHeaders();
  const response = await fetch(path, { signal, credentials:'same-origin', headers:{...auth,...(data ? {'Content-Type':'application/json'} : {})}, method:data ? 'POST' : 'GET', body:data ? JSON.stringify(data) : undefined });
  let result;
  try { result = await response.json(); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(response.status===413?'drawing is too large to upload. your draft is still saved.':'the gallery returned an unreadable response. please try again.');
  }
  if (!response.ok) throw Object.assign(new Error(result.error || 'the gallery is unavailable'), { code: response.status === 401 && auth.Authorization ? 'account_session' : result.code, status: response.status });
  return result;
}
