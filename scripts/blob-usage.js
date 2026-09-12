// 現在のBlobストレージ使用量を集計（読み取りのみ）
require("dotenv").config({ path: ".env.local" });
const { list } = require("@vercel/blob");

(async () => {
  let cursor;
  let count = 0;
  let bytes = 0;
  do {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      count++;
      bytes += b.size;
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  console.log(`files: ${count}`);
  console.log(`total: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
})();
