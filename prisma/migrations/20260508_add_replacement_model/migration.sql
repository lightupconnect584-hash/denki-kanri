CREATE TABLE "ReplacementModel" (
  "id"               TEXT NOT NULL,
  "existingModel"    TEXT NOT NULL,
  "replacementModel" TEXT NOT NULL,
  "maker"            TEXT,
  "color"            TEXT,
  "price"            INTEGER,
  "replacementCost"  INTEGER,
  "relatedParts"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"            TEXT,
  "updatedOn"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementModel_pkey" PRIMARY KEY ("id")
);
