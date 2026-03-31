export type ProvisioningJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ProvisioningStep =
  | "queued"
  | "site_created"
  | "erp_installed"
  | "scheduler_enabled"
  | "domain_registered"
  | "api_keys_generated"
  | "warmup_completed"
  | "completed";

export type CreateTenantInput = {
  workspaceName: string;
  ownerEmail: string;
};

export type CreateTenantResponse = {
  tenantId: string;
  jobId: string;
  status: ProvisioningJobStatus;
};

export type JobStatusResponse = {
  jobId: string;
  tenantId: string;
  status: ProvisioningJobStatus;
  currentStep: ProvisioningStep;
  failureReason?: string | null;
};
