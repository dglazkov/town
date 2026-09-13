// A bundle: a shop's directory as one text stream, a ustar tar of plain
// files, made with `tar --format ustar -cf - -C <dir> .` and sent on a
// hall call's stdin. `readBundle` reads it and nothing cleverer: 512-byte
// blocks, each entry a header and its content padded to a block, ended by
// a zero block or the end of the text. A file and a directory are read; a
// link, a pax or GNU header, a path outside the root, and a stream that
// is not such a tar are refused, one line naming what was found and the
// command that makes a tar the town reads. Nothing is expanded, nothing is
// followed, and nothing is written here.

/** The one command that makes a tar the town reads. */
export const TAR_COMMAND = "tar --format ustar -cf - -C <dir> .";

const BLOCK = 512;

/** A file of a bundle: its content, and its mode with the owner-execute bit kept. */
export interface BundleFile {
  content: string;
  mode: number;
}

/** The files of a bundle by path relative to the shop's root, `/`-separated; or the one refusal. */
export type Bundle = { files: Map<string, BundleFile> } | { refusal: string };

/** Header type flags, by what they are, for the refusal's words. */
const REFUSED_TYPES: Record<string, string> = {
  "1": "a hard link",
  "2": "a symbolic link",
  "3": "a character device",
  "4": "a block device",
  "6": "a named pipe",
  "7": "a contiguous file",
  x: "a pax header (type x)",
  g: "a pax global header (type g)",
  L: "a GNU long-name header (type L)",
  K: "a GNU long-link header (type K)",
};

/** A header field: its bytes up to the first NUL, as text. */
function field(block: Buffer, offset: number, length: number): string {
  const bytes = block.subarray(offset, offset + length);
  const nul = bytes.indexOf(0);
  return (nul === -1 ? bytes : bytes.subarray(0, nul)).toString("utf8");
}

/** An octal number field, NUL- or space-terminated; null when it is not one. */
function octal(block: Buffer, offset: number, length: number): number | null {
  const text = field(block, offset, length).trim();
  return /^[0-7]+$/.test(text) ? parseInt(text, 8) : null;
}

/**
 * Reads `text`, a hall call's stdin, as a ustar tar of a shop's directory:
 * the files by path with their content and mode, or the one refusal. A
 * path is `prefix/name` with a leading `./` dropped; the root's own entry
 * is skipped; `manifest.yaml` must be at the root.
 */
export function readBundle(text: string | null): Bundle {
  const refuse = (found: string, fix: string): Bundle => ({ refusal: `${found}; ${fix} (spec §1)` });
  const make = `make the tar with ${TAR_COMMAND}`;
  if (text === null || text === "") return refuse("stdin: is empty", `send the shop's directory on stdin, as ${TAR_COMMAND} makes it`);
  const bytes = Buffer.from(text, "utf8");
  const files = new Map<string, BundleFile>();
  let at = 0;
  while (at < bytes.length) {
    const header = bytes.subarray(at, at + BLOCK);
    if (header.every((b) => b === 0)) break;
    if (header.length < BLOCK) return refuse(`stdin: the tar ends inside a header at byte ${at}`, `send the whole of what ${TAR_COMMAND} makes`);
    const size = octal(header, 124, 12);
    if (size === null) return refuse(`stdin: is not a ustar tar (the header at byte ${at} has no size)`, make);
    const mode = octal(header, 100, 8) ?? 0o644;
    const type = String.fromCharCode(header[156]!);
    const prefix = field(header, 345, 155);
    const name = field(header, 0, 100);
    const raw = prefix === "" ? name : `${prefix}/${name}`;
    const shown = JSON.stringify(raw);
    const start = at + BLOCK;
    const end = start + size;
    if (end > bytes.length) return refuse(`${shown}: the tar ends ${end - bytes.length} bytes into its content`, `send the whole of what ${TAR_COMMAND} makes`);
    at = start + Math.ceil(size / BLOCK) * BLOCK;

    const refused = REFUSED_TYPES[type];
    if (refused?.startsWith("a pax") || refused?.startsWith("a GNU")) {
      return refuse(`${shown}: is ${refused}, which a long path or an odd name needs`, `shorten the path and ${make}`);
    }
    if (refused) return refuse(`${shown}: is ${refused}, not a plain file`, `a shop is plain files, so put the file itself there and ${make}`);
    if (type !== "0" && type !== "\0" && type !== "5") return refuse(`${shown}: is an entry of type ${JSON.stringify(type)}, not a plain file or a directory`, make);
    if (raw.startsWith("/")) return refuse(`${shown}: is an absolute path`, `${make}, so every path is inside the shop`);
    const segments = raw.split("/");
    if (segments.includes("..")) return refuse(`${shown}: holds a .. segment`, `${make}, so every path is inside the shop`);
    const path = segments.filter((s) => s !== "" && s !== ".").join("/");
    if (type === "5") continue;
    if (path === "") return refuse(`${shown}: is a file with no name`, make);
    files.set(path, { content: bytes.subarray(start, end).toString("utf8"), mode: mode & 0o777 });
  }
  for (const p of files.keys()) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const above = parts.slice(0, i).join("/");
      if (files.has(above)) return refuse(`${JSON.stringify(above)}: is a file and a directory both`, make);
    }
  }
  if (!files.has("manifest.yaml")) {
    return refuse("manifest.yaml: is not at the root of the tar", `make it with ${TAR_COMMAND}, from the shop's directory, so the shop's files are`);
  }
  return { files };
}
