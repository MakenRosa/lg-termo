export function makeQrCanvas(text, { size = 560, margin = 16 } = {}) {
  const lib = globalThis.qrcode;
  if (!lib) throw new Error("QR library not loaded");

  // Force UTF-8 encoding so emoji grids work.
  if (lib.stringToBytesFuncs && lib.stringToBytesFuncs["UTF-8"]) {
    lib.stringToBytes = lib.stringToBytesFuncs["UTF-8"];
  }

  const qr = lib(0, "M"); // 0 = auto type number
  qr.addData(String(text));
  qr.make();

  const count = qr.getModuleCount();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.imageSmoothingEnabled = false;

  const available = size - margin * 2;
  const cell = Math.floor(available / count);
  if (cell <= 0) throw new Error("QR too large for canvas");

  const qrSize = cell * count;
  const offset = Math.floor((size - qrSize) / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#000000";
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
      }
    }
  }

  return canvas;
}
