import { checkRemoteVersion as backendCheckVersion } from "./tauri";

const UPDATE_URLS = [
  "https://techwebplus.cn/medianamefixer/version.json",
  "http://10.67.11.158:8000/medianamefixer/version.json"
];

export type UpdateMode = "dual" | "public" | "local";

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export async function checkRemoteVersion(mode: UpdateMode = "dual"): Promise<VersionInfo | null> {
  const cacheBuster = Date.now();

  if (mode === "public") {
    try {
      const info = await backendCheckVersion(`${UPDATE_URLS[0]}?t=${cacheBuster}`);
      return { version: info.version, downloadUrl: info.downloadUrl, releaseNotes: info.releaseNotes };
    } catch (e) {
      console.error(`[update] public check failed:`, e);
      return null;
    }
  }

  if (mode === "local") {
    try {
      const info = await backendCheckVersion(`${UPDATE_URLS[1]}?t=${cacheBuster}`);
      return { version: info.version, downloadUrl: info.downloadUrl, releaseNotes: info.releaseNotes };
    } catch (e) {
      console.error(`[update] local check failed:`, e);
      return null;
    }
  }

  // dual 模式：并发请求两个地址，取版本号更高的
  const results = await Promise.allSettled(
    UPDATE_URLS.map((url) => backendCheckVersion(`${url}?t=${cacheBuster}`))
  );

  let best: VersionInfo | null = null;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      const info = result.value;
      const versionInfo: VersionInfo = {
        version: info.version,
        downloadUrl: info.downloadUrl,
        releaseNotes: info.releaseNotes,
      };
      if (!best || isNewVersion(best.version, versionInfo.version)) {
        best = versionInfo;
      }
    } else {
      console.error(`[update] check failed for ${UPDATE_URLS[i]}:`, result.reason);
    }
  }
  return best;
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
