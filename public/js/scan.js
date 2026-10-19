// Reads a QR code from a camera picture. Chrome on Android can do it itself (BarcodeDetector).
// Safari on iPhone cannot, so there we use the small jsQR library (public/js/vendor/jsqr.mjs), loaded only when needed.
export async function makeReader() {
  if ("BarcodeDetector" in globalThis) {
    const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
    return async (video) => {
      const found = await detector.detect(video);
      return found.length > 0 ? found[0].rawValue : null;
    };
  }
  const { default: jsQR } = await import("./vendor/jsqr.mjs");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!video.videoWidth) return null;
    const w = Math.min(640, video.videoWidth);
    const hgt = Math.round((video.videoHeight / video.videoWidth) * w);
    canvas.width = w;
    canvas.height = hgt;
    ctx.drawImage(video, 0, 0, w, hgt);
    const hit = jsQR(ctx.getImageData(0, 0, w, hgt).data, w, hgt, { inversionAttempts: "dontInvert" });
    return hit ? hit.data : null;
  };
}
// The phone camera only starts on secure pages (https) (or localhost). On a plain-http address like your PC on the home network, Safari refuses it.
export const cameraAllowed = () => Boolean(navigator.mediaDevices?.getUserMedia) && globalThis.isSecureContext !== false;
