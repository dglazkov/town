// ring: checkout
// A fake wall for checkout tests: of kind `none`, it returns the spawn it
// was given and keeps every enclosure it was asked for, so a test reads
// what the runtime built and where a wall reached.

import type { Enclosure, Wall } from "../../src/wall.js";

export interface Enclosed {
  file: string;
  args: string[];
  within: Enclosure;
}

export interface RecordingWall extends Wall {
  /** Every spawn enclosed, in order. */
  readonly seen: Enclosed[];
}

export function recordingWall(): RecordingWall {
  const seen: Enclosed[] = [];
  return {
    kind: "none",
    seen,
    enclose(file, args, within) {
      seen.push({ file, args: [...args], within: { reads: [...within.reads], writes: [...within.writes], ports: [...within.ports] } });
      return { file, args: [...args] };
    },
  };
}
