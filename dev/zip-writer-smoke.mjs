import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "libs/zip-writer.js"), "utf8");
const context = {
  ArrayBuffer,
  Blob,
  DataView,
  Date,
  Math,
  String,
  TextEncoder,
  Uint8Array,
  Uint32Array
};
context.globalThis = context;
context.self = context;

vm.runInNewContext(source, context, { filename: "zip-writer.js" });
assert.equal(typeof context.StoredZipWriter, "function");

const progress = [];
const writer = new context.StoredZipWriter();
writer.file("hello.txt", "hello world");
writer.file("nested/data.json", JSON.stringify({ ok: true }));

const archive = await writer.generateAsync({ type: "uint8array" }, (update) => progress.push(update.percent));
const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);

assert.equal(view.getUint32(0, true), 0x04034b50, "Archive must start with a local ZIP entry");
assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50, "Archive must end with a ZIP directory record");
assert.equal(progress.at(-1), 100, "Progress callback must reach 100 percent");

console.log(`ZIP writer smoke test passed (${archive.length} bytes).`);
