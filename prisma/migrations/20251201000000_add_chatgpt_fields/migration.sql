-- AlterTable
ALTER TABLE "User"
ADD COLUMN "chatgptUserId" TEXT,
ADD COLUMN "chatgptConnectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_chatgptUserId_key" ON "User"("chatgptUserId");
