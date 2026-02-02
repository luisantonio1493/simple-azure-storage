// Main client export
export { SimpleBlobClient } from './SimpleBlobClient.js';

// Types
export {
  UploadOptions,
  DownloadOptions,
  ProgressEvent,
  BlobItem,
  BlobMetadata,
  SimpleBlobClientOptions,
  BlobCredential,
  GetMetadataOptions,
  ListOptions,
} from './types.js';

// Errors
export {
  BlobStorageError,
  BlobNotFoundError,
  ContainerNotFoundError,
  AuthenticationError,
  BlobUploadError,
  BlobDownloadError,
  ContainerOperationError,
  ConfigurationError,
} from './errors.js';

// Utilities (for advanced usage)
export {
  streamToBuffer,
  streamToString,
  bufferToStream,
  getContentTypeFromExtension,
} from './utils/stream-helpers.js';
