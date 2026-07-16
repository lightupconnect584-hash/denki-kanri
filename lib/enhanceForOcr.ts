// 書類写真をAIが読み取りやすいよう補正する（クライアント側・ブラウザのcanvas使用）
// - 長辺が小さい写真は拡大（細かい文字が潰れないように）
// - グレースケール化 + コントラスト強調で「スキャン風」に
// 原本ファイルは変更せず、AI送信用の新しいFileを返す。失敗時は元のfileをそのまま返す。
export async function enhanceForOcr(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/")) return file;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = dataUrl;
    });

    // 長辺を最低1800px・最大2400pxに揃える（小さい写真は拡大、大きすぎる写真は縮小）
    const MIN = 1800;
    const MAX = 2400;
    const longSide = Math.max(img.width, img.height);
    let scale = 1;
    if (longSide < MIN) scale = MIN / longSide;
    else if (longSide > MAX) scale = MAX / longSide;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    // グレースケール + コントラスト強調
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;
    const contrast = 1.35; // コントラスト係数（>1で強調）
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < px.length; i += 4) {
      // 輝度（グレースケール）
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // コントラスト強調
      let v = contrast * gray + intercept;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + "_scan.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
