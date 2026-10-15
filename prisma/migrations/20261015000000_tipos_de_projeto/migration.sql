-- AlterEnum
ALTER TYPE "TipoCaptacao" ADD VALUE 'PUBLICITARIO';

-- AlterTable
ALTER TABLE "Projeto" ADD COLUMN "detalhes" JSONB;
