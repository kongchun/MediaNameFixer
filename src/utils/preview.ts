import { FileInfo, RenameOperation, RenameMode, ArchiveOperation, ArchiveMode } from "../types";

function parseDateTime(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
    parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
  );
  return isNaN(d.getTime()) ? null : d;
}

function formatDateForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function extractDateTimeFromName(name: string): Date | null {
  const re = /(\d{4})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})/;
  const m = re.exec(name);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
    parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
  );
  return isNaN(d.getTime()) ? null : d;
}

export function isWithinTimeTolerance(oldName: string, newName: string, toleranceSeconds: number): boolean {
  if (oldName === newName) return true;
  if (toleranceSeconds <= 0) return oldName === newName;

  // 只有原文件名前几位满足 YYYY-MM-DD HHMMSS 格式时，才和新文件名比较
  const hasDateTimePrefix = /^\d{4}-\d{2}-\d{2} \d{6}/.test(oldName);
  if (!hasDateTimePrefix) return false;

  const oldDt = extractDateTimeFromName(oldName);
  const newDt = extractDateTimeFromName(newName);
  if (!oldDt || !newDt) return oldName === newName;

  const diff = Math.abs(oldDt.getTime() - newDt.getTime()) / 1000;
  return diff <= toleranceSeconds;
}

function makeUniqueName(name: string, ext: string, used: Set<string>): string {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  let candidate = name;
  let idx = 1;
  while (used.has(candidate)) {
    candidate = `${base}(${idx}).${ext}`;
    idx++;
  }
  used.add(candidate);
  return candidate;
}

export function computeRenamePreview(
  files: FileInfo[],
  mode: RenameMode,
  selectedPaths: Set<string>
): RenameOperation[] {
  const selectedFiles = files.filter((f) => selectedPaths.has(f.path));
  const usedNames = new Set<string>();
  // 只处理被选中文件之间的新名字冲突，不考虑文件夹中其他已有文件
  const ops: RenameOperation[] = [];

  for (const file of selectedFiles) {
    const extRaw = file.ext; // 保留原始扩展名大小写
    let newName: string | null = null;
    let timeSource: string | undefined;

    if (mode === "ByDateTime") {
      const taken = file.date_taken ? parseDateTime(file.date_taken) : null;
      const created = file.date_created ? parseDateTime(file.date_created) : null;
      const modified = file.date_modified ? parseDateTime(file.date_modified) : null;

      let dt: Date | null = null;
      if (taken) {
        dt = taken;
        timeSource = "exif";
      }
      if (created && (dt === null || created.getTime() < dt.getTime())) {
        dt = created;
        timeSource = "created";
      }
      if (modified && (dt === null || modified.getTime() < dt.getTime())) {
        dt = modified;
        timeSource = "modified";
      }

      if (dt) {
        newName = `${formatDateForFilename(dt)}.${extRaw}`;
      }
    } else if (mode === "ByFileName") {
      const re = /(\d{4})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})/;
      const m = re.exec(file.name);
      if (m) {
        newName = `${m[1]}-${m[2]}-${m[3]} ${m[4]}${m[5]}${m[6]}.${extRaw}`;
      }
    }

    if (newName) {
      const uniqueName = makeUniqueName(newName, extRaw, usedNames);
      const dirSep = file.path.lastIndexOf("\\");
      const dir = dirSep >= 0 ? file.path.slice(0, dirSep + 1) : "";
      ops.push({
        old_path: file.path,
        new_path: dir + uniqueName,
        old_name: file.name,
        new_name: uniqueName,
        date_taken: file.date_taken,
        date_created: file.date_created,
        date_modified: file.date_modified,
        time_source: timeSource,
      });
    }
  }

  return ops;
}

export function computeArchivePreview(
  files: FileInfo[],
  mode: ArchiveMode,
  selectedPaths: Set<string>
): ArchiveOperation[] {
  const selectedFiles = files.filter((f) => selectedPaths.has(f.path));
  const ops: ArchiveOperation[] = [];

  for (const file of selectedFiles) {
    let targetFolder: string | null = null;

    if (mode === "ByYear") {
      const dt = file.date_taken ? parseDateTime(file.date_taken)
        : file.date_modified ? parseDateTime(file.date_modified) : null;
      if (dt) {
        targetFolder = String(dt.getFullYear());
      }
    } else if (mode === "ByYearMonth") {
      const dt = file.date_taken ? parseDateTime(file.date_taken)
        : file.date_modified ? parseDateTime(file.date_modified) : null;
      if (dt) {
        const pad = (n: number) => String(n).padStart(2, "0");
        targetFolder = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
      }
    } else if (mode === "MergeSubfolders") {
      const dirSep = file.path.lastIndexOf("\\");
      const parentSep = file.path.lastIndexOf("\\", dirSep - 1);
      if (parentSep >= 0) {
        targetFolder = file.path.slice(parentSep + 1, dirSep);
      }
    }

    if (targetFolder) {
      const dirSep = file.path.lastIndexOf("\\");
      const dir = dirSep >= 0 ? file.path.slice(0, dirSep) : "";
      ops.push({
        old_path: file.path,
        new_path: `${dir}\\${targetFolder}\\${file.name}`,
        target_folder: targetFolder,
      });
    }
  }

  return ops;
}
