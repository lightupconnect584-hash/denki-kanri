// 既存の報告写真・現場写真を1280px/q62に再圧縮してBlob容量を削減する（一回限り）
// - 対象: Photo（報告写真）・ProjectPhoto（現場写真）のうち画像のみ
// - 対象外: PDF・【依頼書原本】（文字の判読性維持のため）
// - 新Blobをアップロード→DBのURLを更新→旧Blobを削除。15%以上縮む場合のみ置き換え
const { put, del } = require("@vercel/blob");
const { PrismaClient } = require("@prisma/client");
const sharp = require("sharp");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const p = new PrismaClient();

const isImageName = (n) => /\.(jpe?g|png|webp)$/i.test(n) || !/\.pdf$/i.test(n);

async function processOne(model, row) {
  if (!row.filename?.startsWith("http")) return null;
  if (/\.pdf$/i.test(row.originalName || "") || /\.pdf($|\?)/i.test(row.filename)) return null;
  if ((row.originalName || "").includes("依頼書原本")) return null;
  try {
    const res = await fetch(row.filename);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("pdf")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const oldSize = buf.length;
    if (oldSize < 120 * 1024) return { skipped: true, oldSize }; // 120KB未満はそのまま
    const out = await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 62 }).toBuffer();
    if (out.length > oldSize * 0.85) return { skipped: true, oldSize }; // 大して縮まないならそのまま
    const name = (row.originalName || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    const blob = await put(name, out, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" });
    await p[model].update({ where: { id: row.id }, data: { filename: blob.url } });
    await del(row.filename).catch(() => {});
    return { oldSize, newSize: out.length };
  } catch (e) {
    return { error: String(e).slice(0, 80) };
  }
}

(async () => {
  const photos = await p.photo.findMany({ select: { id: true, filename: true, originalName: true } });
  const projPhotos = await p.projectPhoto.findMany({ select: { id: true, filename: true, originalName: true } });
  const jobs = [
    ...photos.map((r) => ({ model: "photo", row: r })),
    ...projPhotos.map((r) => ({ model: "projectPhoto", row: r })),
  ];
  console.log("targets:", jobs.length);
  let done = 0, saved = 0, replaced = 0, skipped = 0, errors = 0;
  const CONC = 6;
  for (let i = 0; i < jobs.length; i += CONC) {
    const batch = jobs.slice(i, i + CONC);
    const results = await Promise.all(batch.map((j) => processOne(j.model, j.row)));
    for (const r of results) {
      done++;
      if (!r) { skipped++; continue; }
      if (r.error) { errors++; continue; }
      if (r.skipped) { skipped++; continue; }
      replaced++;
      saved += r.oldSize - r.newSize;
    }
    if (done % 120 < CONC) console.log(`progress: ${done}/${jobs.length} replaced=${replaced} saved=${(saved / 1024 / 1024).toFixed(1)}MB errors=${errors}`);
  }
  console.log(`DONE: replaced=${replaced} skipped=${skipped} errors=${errors} saved=${(saved / 1024 / 1024).toFixed(1)}MB`);
  await p.$disconnect();
})();
