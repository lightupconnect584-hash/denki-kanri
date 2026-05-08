CREATE TABLE "SeasonalImageStock" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "filename"     TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "label"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
