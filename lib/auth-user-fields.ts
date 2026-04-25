/**
 * Shared Better Auth `user.additionalFields` schema.
 * Imported by the server auth instance and the browser client so sign-up
 * types include custom fields (e.g. phone) without `any`.
 */
export const userAdditionalFields = {
  phone: {
    type: 'string',
    required: false,
    defaultValue: '',
  },
  currency: {
    type: 'string',
    required: false,
    defaultValue: 'USD',
  },
  businessName: {
    type: 'string',
    required: false,
    defaultValue: '',
  },
} as const
