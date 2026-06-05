const UPDATE_URLS = [
  "https://techwebplus.cn/medianamefixer/version.json"
  //"http://10.67.11.158:8000/medianamefixer/version.json",
];

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
}

async function fetchVersion(url: string): Promise<VersionInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { cache: "no-cache", signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: VersionInfo = await res.json();
    return data;
  } catch {
    return null;
  }
}

export async function checkRemoteVersion(): Promise<VersionInfo | null> {
  // 同时请求多个地址，取第一个成功的
  const results = await Promise.all(UPDATE_URLS.map(fetchVersion));
  return results.find((r) => r !== null) || null;
}

export function isNewVersion(current: string, remote: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const cur = parse(current);
  const rem = parse(remote);
  for (let i = 0; i < Math.max(cur.length, rem.length); i++) {
    const a = cur[i] || 0;
    const b = rem[i] || 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}
