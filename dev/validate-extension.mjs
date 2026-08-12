import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const manifestBytes = readFileSync(manifestPath);

assert.notDeepEqual([...manifestBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "manifest.json must not contain a UTF-8 BOM");

const manifest = JSON.parse(manifestBytes.toString("utf8"));
assert.equal(manifest.manifest_version, 3, "Manifest V3 is required");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "Version must use x.y.z format");
assert.ok(manifest.name && manifest.description, "Manifest name and description are required");
assert.equal(manifest.content_scripts, undefined, "The scanner must be injected on demand, not on every website");
assert.equal(manifest.host_permissions, undefined, "Persistent host permissions are not required");

const allowedPermissions = new Set(["activeTab", "scripting", "downloads", "storage"]);
for (const permission of manifest.permissions || []) {
  assert.ok(allowedPermissions.has(permission), `Unexpected permission: ${permission}`);
}

const referencedFiles = new Set();
const add = (value) => {
  if (typeof value === "string" && value && !/^(?:https?:|data:|#)/i.test(value)) {
    referencedFiles.add(value.split(/[?#]/, 1)[0]);
  }
};

Object.values(manifest.icons || {}).forEach(add);
Object.values(manifest.action?.default_icon || {}).forEach(add);
add(manifest.action?.default_popup);
add(manifest.background?.service_worker);

for (const file of [...referencedFiles]) {
  assert.ok(existsSync(resolve(root, file)), `Missing manifest file: ${file}`);
}

const popup = manifest.action?.default_popup;
if (popup) {
  const html = readFileSync(resolve(root, popup), "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    add(match[1]);
  }
}

const worker = manifest.background?.service_worker;
if (worker) {
  const source = readFileSync(resolve(root, worker), "utf8");
  for (const match of source.matchAll(/importScripts\(["']([^"']+)["']\)/g)) {
    add(match[1]);
  }
}

for (const file of referencedFiles) {
  assert.ok(existsSync(resolve(root, file)), `Missing referenced file: ${file}`);
}

console.log(`Validated ${manifest.name} ${manifest.version} (${referencedFiles.size} referenced files).`);
