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

// Updated 2026-06-25 to reflect real running Control Plane contract.
// Manual QA returned 422 when sending only { workspaceName, ownerEmail }.
// Required fields confirmed at runtime: slug, country, companyName, companyAbbr.
export type CreateTenantInput = {
  slug: string;
  country: string;
  companyName: string;
  companyAbbr: string;
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
