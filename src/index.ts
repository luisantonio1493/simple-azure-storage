// Main client export
export { SimpleBlobClient } from './SimpleBlobClient';

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
} from './types';

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
} from './errors';

// Utilities (for advanced usage)
export {
  streamToBuffer,
  streamToString,
  bufferToStream,
  getContentTypeFromExtension,
} from './utils/stream-helpers';
