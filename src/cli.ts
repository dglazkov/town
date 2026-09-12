// town, the agent's binary: a pipe from what it was typed to the town
// and back. Until gate phase 1 it reads no grant file and says only that
// it needs one.

export async function main(_argv: readonly string[]): Promise<number> {
  process.stderr.write("town: this command needs a grant file, .town/grant, and this build cannot read one yet\n");
  return 1;
}
