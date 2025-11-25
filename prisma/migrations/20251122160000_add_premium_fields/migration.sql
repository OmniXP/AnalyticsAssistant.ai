-- AlterTable
ALTER TABLE "User"
ADD COLUMN "premium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "plan" TEXT,
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubId" TEXT,
ADD COLUMN "ga4PropertyId" TEXT,
ADD COLUMN "ga4PropertyName" TEXT;

