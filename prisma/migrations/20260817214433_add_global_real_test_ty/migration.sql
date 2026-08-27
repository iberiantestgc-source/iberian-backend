/*
  Warnings:

  - You are about to drop the column `isActive` on the `laws` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TestType" ADD VALUE 'GLOBAL';
ALTER TYPE "TestType" ADD VALUE 'REAL';

-- AlterTable
ALTER TABLE "laws" DROP COLUMN "isActive";
