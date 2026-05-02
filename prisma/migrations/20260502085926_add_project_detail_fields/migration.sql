-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "contractorName" TEXT,
ADD COLUMN     "contractorPhone" TEXT,
ADD COLUMN     "smsAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urgency" TEXT NOT NULL DEFAULT 'LOW';
