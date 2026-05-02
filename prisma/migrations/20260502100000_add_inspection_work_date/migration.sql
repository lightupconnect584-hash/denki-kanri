-- AlterTable: 既存行にはcreatedAtをデフォルトとして使用
ALTER TABLE "Inspection" ADD COLUMN "workDate" TIMESTAMP(3) NOT NULL DEFAULT NOW();
-- デフォルトを削除（新規行は必須入力に）
ALTER TABLE "Inspection" ALTER COLUMN "workDate" DROP DEFAULT;
