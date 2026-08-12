(function exposeStoredZipWriter(global) {
  "use strict";

  const encoder = new TextEncoder();
  const crcTable = createCrcTable();
  const MAX_UINT16 = 0xffff;
  const MAX_UINT32 = 0xffffffff;

  class StoredZipWriter {
    constructor() {
      this.entries = [];
    }

    file(name, data) {
      this.entries.push({
        name: normalizeName(name),
        data
      });
      return this;
    }

    async generateAsync(options = {}, onUpdate = null) {
      if (this.entries.length > MAX_UINT16) {
        throw new Error("ZIP64 is not supported: too many files");
      }

      const files = [];

      for (let index = 0; index < this.entries.length; index += 1) {
        const entry = this.entries[index];
        const bytes = await toBytes(entry.data);
        const nameBytes = encoder.encode(entry.name);

        if (nameBytes.length > MAX_UINT16) {
          throw new Error(`ZIP filename is too long: ${entry.name}`);
        }
        if (bytes.length > MAX_UINT32) {
          throw new Error(`ZIP64 is not supported: ${entry.name} is too large`);
        }

        files.push({
          name: entry.name,
          nameBytes,
          bytes,
          crc: crc32(bytes)
        });

        report(onUpdate, ((index + 1) / Math.max(this.entries.length, 1)) * 50);
      }

      const timestamp = toDosDateTime(new Date());
      const localParts = [];
      const centralParts = [];
      let localOffset = 0;
      let centralSize = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const local = createLocalEntry(file, timestamp);
        const central = createCentralEntry(file, timestamp, localOffset);

        localParts.push(local);
        centralParts.push(central);
        localOffset += local.length;
        centralSize += central.length;

        if (localOffset > MAX_UINT32 || centralSize > MAX_UINT32) {
          throw new Error("ZIP64 is not supported: archive is too large");
        }

        report(onUpdate, 50 + ((index + 1) / Math.max(files.length, 1)) * 50);
      }

      const end = createEndRecord(files.length, centralSize, localOffset);
      const totalSize = localOffset + centralSize + end.length;

      if (totalSize > MAX_UINT32) {
        throw new Error("ZIP64 is not supported: archive is too large");
      }

      const archive = concatenate([...localParts, ...centralParts, end], totalSize);
      report(onUpdate, 100);

      if (options.type === "uint8array") {
        return archive;
      }
      if (options.type === "base64") {
        return toBase64(archive);
      }

      return new Blob([archive], { type: "application/zip" });
    }
  }

  function createLocalEntry(file, timestamp) {
    const output = new Uint8Array(30 + file.nameBytes.length + file.bytes.length);
    const view = new DataView(output.buffer);

    setUint32(view, 0, 0x04034b50);
    setUint16(view, 4, 20);
    setUint16(view, 6, 0x0800);
    setUint16(view, 8, 0);
    setUint16(view, 10, timestamp.time);
    setUint16(view, 12, timestamp.date);
    setUint32(view, 14, file.crc);
    setUint32(view, 18, file.bytes.length);
    setUint32(view, 22, file.bytes.length);
    setUint16(view, 26, file.nameBytes.length);
    setUint16(view, 28, 0);

    output.set(file.nameBytes, 30);
    output.set(file.bytes, 30 + file.nameBytes.length);
    return output;
  }

  function createCentralEntry(file, timestamp, localOffset) {
    const output = new Uint8Array(46 + file.nameBytes.length);
    const view = new DataView(output.buffer);

    setUint32(view, 0, 0x02014b50);
    setUint16(view, 4, 20);
    setUint16(view, 6, 20);
    setUint16(view, 8, 0x0800);
    setUint16(view, 10, 0);
    setUint16(view, 12, timestamp.time);
    setUint16(view, 14, timestamp.date);
    setUint32(view, 16, file.crc);
    setUint32(view, 20, file.bytes.length);
    setUint32(view, 24, file.bytes.length);
    setUint16(view, 28, file.nameBytes.length);
    setUint16(view, 30, 0);
    setUint16(view, 32, 0);
    setUint16(view, 34, 0);
    setUint16(view, 36, 0);
    setUint32(view, 38, 0);
    setUint32(view, 42, localOffset);

    output.set(file.nameBytes, 46);
    return output;
  }

  function createEndRecord(fileCount, centralSize, centralOffset) {
    const output = new Uint8Array(22);
    const view = new DataView(output.buffer);

    setUint32(view, 0, 0x06054b50);
    setUint16(view, 4, 0);
    setUint16(view, 6, 0);
    setUint16(view, 8, fileCount);
    setUint16(view, 10, fileCount);
    setUint32(view, 12, centralSize);
    setUint32(view, 16, centralOffset);
    setUint16(view, 20, 0);
    return output;
  }

  function createCrcTable() {
    const table = new Uint32Array(256);

    for (let index = 0; index < table.length; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }

    return table;
  }

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  async function toBytes(data) {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return new Uint8Array(await data.arrayBuffer());
    }
    if (typeof data === "string") {
      return encoder.encode(data);
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return encoder.encode(String(data ?? ""));
  }

  function normalizeName(name) {
    const parts = String(name || "file")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..");

    return parts.join("/") || "file";
  }

  function toDosDateTime(input) {
    const date = new Date(input);
    const year = Math.min(2107, Math.max(1980, date.getFullYear()));
    return {
      time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
      date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
    };
  }

  function concatenate(parts, totalSize) {
    const output = new Uint8Array(totalSize);
    let offset = 0;

    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }

    return output;
  }

  function toBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
  }

  function report(callback, percent) {
    if (typeof callback === "function") {
      callback({ percent: Math.max(0, Math.min(100, percent)) });
    }
  }

  function setUint16(view, offset, value) {
    view.setUint16(offset, value & MAX_UINT16, true);
  }

  function setUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  global.StoredZipWriter = StoredZipWriter;
})(typeof self !== "undefined" ? self : globalThis);
