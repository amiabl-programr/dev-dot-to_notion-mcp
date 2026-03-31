/*
  Warnings:

  - A unique constraint covering the columns `[notionWorkspaceId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_notionWorkspaceId_key" ON "User"("notionWorkspaceId");
