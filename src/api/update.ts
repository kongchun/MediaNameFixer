import { checkRemoteVersion as backendCheckVersion } from "./tauri";

const UPDATE_URLS = [
  "https://techwebplus.cn/medianamefixer/version.json",
  "http://10.67.11.158:8000/medianamefixer/version.json"
];

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export async function checkRemoteVersion(): Promise<VersionInfo | null> {
  for (const url of UPDATE_URLS) {
    try {
      const info = await backendCheckVersion(url);
      return {
        version: info.version,
        downloadUrl: info.downloadUrl,
        releaseNotes: info.releaseNotes,
      };
    } catch (e) {
      console.error(`[update] check failed for ${url}:`, e);
    }
  }
  return null;
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
