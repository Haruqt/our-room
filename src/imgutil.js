/**
 * Image compression before anything hits storage.
 *
 * Photos were being stored as raw base64 straight from the file picker — a
 * single phone photo is easily 3–5MB, which alone can exhaust the ~5MB
 * localStorage budget. Downscaling and re-encoding as JPEG cuts that by
 * roughly 30–60x with no visible difference at the sizes shown here.
 */

const MAX_DIM = 1100;      // plenty for a polaroid on a page or a full-screen view
const QUALITY = 0.82;

export function compressDataUrl(dataUrl, maxDim = MAX_DIM, quality = QUALITY){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        // white behind, so transparent PNGs don't turn black as JPEG
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const out = c.toDataURL('image/jpeg', quality);
        resolve(out.length < dataUrl.length ? out : dataUrl);
      } catch(e){
        console.error('compress failed, keeping original', e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Read a File straight to a compressed data URL. */
export function fileToCompressedDataUrl(file, maxDim = MAX_DIM, quality = QUALITY){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => compressDataUrl(reader.result, maxDim, quality).then(resolve);
    reader.onerror = () => reject(new Error('could not read ' + file.name));
    reader.readAsDataURL(file);
  });
}

export function approxKb(dataUrl){
  return Math.round((dataUrl.length * 0.75) / 1024);
}
