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
  slug: string;
  country: string;
  companyName: string;
  companyAbbr: string;
  ownerEmail: string;
  /** Optional overrides — derived from country defaults if omitted */
  currency?: string;
  timezone?: string;
  language?: string;
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
