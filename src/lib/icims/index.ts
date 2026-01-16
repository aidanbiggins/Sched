export type { IcimsClient } from './IcimsClient';
export { getIcimsClient, resetIcimsClient } from './IcimsClient';
export { IcimsClientMock, getMockApplications } from './IcimsClientMock';
export { IcimsClientReal } from './IcimsClientReal';
export {
  IcimsWritebackService,
  getIcimsWritebackService,
  resetIcimsWritebackService,
} from './IcimsWritebackService';
export {
  formatLinkCreatedNote,
  formatBookedNote,
  formatCanceledNote,
  formatRescheduledNote,
} from './noteFormatter';
export type {
  LinkCreatedNoteParams,
  BookedNoteParams,
  CanceledNoteParams,
  RescheduledNoteParams,
} from './noteFormatter';

// Config and validation
export {
  validateIcimsConfig,
  getIcimsConfig,
  isIcimsRealMode,
  getIcimsConfigSummary,
} from './icimsConfig';
export type { IcimsConfig, IcimsConfigValidationResult } from './icimsConfig';

// Errors
export {
  IcimsError,
  IcimsRateLimitError,
  IcimsAuthError,
  IcimsNotFoundError,
  IcimsBadRequestError,
  IcimsServerError,
  IcimsNetworkError,
  classifyIcimsError,
  isRetryableIcimsError,
  isIcimsAuthFailure,
  getRetryAfterMs,
} from './icimsErrors';

// Metrics
export {
  recordIcimsSuccess,
  recordIcimsFailure,
  getIcimsMetrics,
  getIcimsMetrics24h,
  getIcimsHealthStatus,
  getIcimsFullHealthStatus,
  resetIcimsMetrics,
} from './icimsMetrics';
export type { IcimsApiMetrics, IcimsHealthStatus } from './icimsMetrics';

// HTTP utilities
export { icimsRequest, generateIdempotencyKey } from './icimsHttp';
