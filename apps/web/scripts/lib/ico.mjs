// Builds a .ico file from PNG images (the PNG-in-ICO form every current browser
// and Google's favicon fetcher read): ICONDIR, one ICONDIRENTRY per image, then
// the PNG bytes as they are. No dependency.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height from a PNG's IHDR chunk; throws when the bytes are not a PNG. */
export function pngSize(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("ico: not a PNG");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * @param {ReadonlyArray<Buffer>} pngs square PNG images, each at most 256 pixels
 * @returns {Buffer} the .ico file, images in the order given
 */
export function buildIco(pngs) {
  if (pngs.length === 0) {
    throw new Error("ico: no images");
  }
  const headerSize = 6 + 16 * pngs.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = headerSize;
  pngs.forEach((png, index) => {
    const { width, height } = pngSize(png);
    if (width !== height || width > 256) {
      throw new Error(`ico: image ${index} is ${width}x${height}; icons are square and at most 256`);
    }
    const entry = 6 + 16 * index;
    header.writeUInt8(width === 256 ? 0 : width, entry); // 0 stands for 256
    header.writeUInt8(height === 256 ? 0 : height, entry + 1);
    header.writeUInt8(0, entry + 2); // no palette
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}

/** The images inside an .ico: `{ width, height, png }` for each entry (PNG payloads only). */
export function readIco(ico) {
  if (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error("ico: not an icon file");
  }
  const count = ico.readUInt16LE(4);
  const images = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + 16 * index;
    const size = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const png = ico.subarray(offset, offset + size);
    const { width, height } = pngSize(png);
    images.push({ width, height, png, declaredWidth: ico.readUInt8(entry) || 256 });
  }
  return images;
}
