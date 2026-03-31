-- CreateTable
CREATE TABLE "WorkspaceProvisioning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tenantId" TEXT,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WorkspaceProvisioning_userId_idx" ON "WorkspaceProvisioning"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioning_jobId_idx" ON "WorkspaceProvisioning"("jobId");
