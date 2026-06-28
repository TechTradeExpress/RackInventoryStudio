/**
 * DOM-dependent rack export helpers (canvas rasterization).
 * Kept in a separate module from rackExport.ts so pure helpers stay unit-testable
 * and this module can be easily mocked in component tests.
 */

/**
 * Rasterize an SVG string to a PNG byte array at 2× scale.
 * Returns `number[]` (array of byte values) suitable for `write_export_bytes`.
 */
export function rasterizeSvgToPng(svgContent: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const SCALE = 2;
      const w = img.naturalWidth || 900;
      const h = img.naturalHeight || 600;
      const canvas = document.createElement("canvas");
      canvas.width = w * SCALE;
      canvas.height = h * SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context not available"));
        return;
      }
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error("PNG blob generation failed"));
          return;
        }
        pngBlob
          .arrayBuffer()
          .then((buffer) => resolve(Array.from(new Uint8Array(buffer))))
          .catch(reject);
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG as image for PNG rasterization"));
    };

    img.src = url;
  });
}
