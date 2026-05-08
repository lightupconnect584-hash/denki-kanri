CREATE TABLE "SeasonalMessage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startMD" INTEGER NOT NULL,
  "endMD" INTEGER NOT NULL,
  "message" TEXT NOT NULL,
  "imageUrl" TEXT,
  "animation" TEXT NOT NULL DEFAULT 'none',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonalMessage_pkey" PRIMARY KEY ("id")
);
