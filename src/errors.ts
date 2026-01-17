/**
 * Base error class for all blob storage errors
 */
export class BlobStorageError extends Error {
  public readonly code: string;
  public readonly originalError?: Error;

  constructor(message: string, code: string, originalError?: Error) {
    super(message);
    this.name = 'BlobStorageError';
    this.code = code;
    this.originalError = originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a blob is not found
 */
export class BlobNotFoundError extends BlobStorageError {
  public readonly blobName: string;
  public readonly containerName: string;

  constructor(blobName: string, containerName: string, originalError?: Error) {
    super(
      `Failed to access blob '${blobName}' in container '${containerName}': Blob not found. Verify the blob name exists in the container.`,
      'BLOB_NOT_FOUND',
      originalError
    );
    this.name = 'BlobNotFoundError';
    this.blobName = blobName;
    this.containerName = containerName;
  }
}

/**
 * Error thrown when a container is not found
 */
export class ContainerNotFoundError extends BlobStorageError {
  public readonly containerName: string;

  constructor(containerName: string, originalError?: Error) {
    super(
      `Container '${containerName}' not found. Verify the container name and that it exists in the storage account.`,
      'CONTAINER_NOT_FOUND',
      originalError
    );
    this.name = 'ContainerNotFoundError';
    this.containerName = containerName;
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends BlobStorageError {
  constructor(message: string, originalError?: Error) {
    super(
      `Authentication failed: ${message}. Check your connection string, credentials, or managed identity configuration.`,
      'AUTHENTICATION_ERROR',
      originalError
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when a blob upload fails
 */
export class BlobUploadError extends BlobStorageError {
  public readonly blobName: string;
  public readonly containerName: string;

  constructor(blobName: string, containerName: string, reason: string, originalError?: Error) {
    super(
      `Failed to upload blob '${blobName}' to container '${containerName}': ${reason}`,
      'BLOB_UPLOAD_ERROR',
      originalError
    );
    this.name = 'BlobUploadError';
    this.blobName = blobName;
    this.containerName = containerName;
  }
}

/**
 * Error thrown when a blob download fails
 */
export class BlobDownloadError extends BlobStorageError {
  public readonly blobName: string;
  public readonly containerName: string;

  constructor(blobName: string, containerName: string, reason: string, originalError?: Error) {
    super(
      `Failed to download blob '${blobName}' from container '${containerName}': ${reason}`,
      'BLOB_DOWNLOAD_ERROR',
      originalError
    );
    this.name = 'BlobDownloadError';
    this.blobName = blobName;
    this.containerName = containerName;
  }
}

/**
 * Error thrown when a container-level operation fails
 */
export class ContainerOperationError extends BlobStorageError {
  public readonly containerName: string;
  public readonly operation: string;

  constructor(containerName: string, operation: string, reason: string, originalError?: Error) {
    super(
      `Failed to ${operation} in container '${containerName}': ${reason}`,
      'CONTAINER_OPERATION_ERROR',
      originalError
    );
    this.name = 'ContainerOperationError';
    this.containerName = containerName;
    this.operation = operation;
  }
}

/**
 * Error thrown when SimpleBlobClient is configured incorrectly
 */
export class ConfigurationError extends BlobStorageError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/**
 * Parses Azure SDK errors and converts them to appropriate custom errors
 */
export function parseAzureError(
  error: unknown,
  blobName: string,
  containerName: string,
  operation: 'upload' | 'download' | 'other'
): BlobStorageError {
  const err = error as { statusCode?: number; code?: string; message?: string };

  if (err.statusCode === 404) {
    if (err.code === 'BlobNotFound') {
      return new BlobNotFoundError(blobName, containerName, error as Error);
    }
    if (err.code === 'ContainerNotFound') {
      return new ContainerNotFoundError(containerName, error as Error);
    }
    return new BlobNotFoundError(blobName, containerName, error as Error);
  }

  if (err.statusCode === 401 || err.statusCode === 403) {
    return new AuthenticationError(
      err.message || 'Access denied',
      error as Error
    );
  }

  const message = err.message || 'Unknown error';

  if (operation === 'upload') {
    return new BlobUploadError(blobName, containerName, message, error as Error);
  }

  if (operation === 'download') {
    return new BlobDownloadError(blobName, containerName, message, error as Error);
  }

  return new BlobStorageError(message, 'UNKNOWN_ERROR', error as Error);
}

/**
 * Parses Azure SDK errors for container-level operations
 */
export function parseContainerError(
  error: unknown,
  containerName: string,
  operation: string
): BlobStorageError {
  const err = error as { statusCode?: number; code?: string; message?: string };

  // 404 errors in container operations are always "container not found"
  // Be flexible with the error code as Azure SDK may vary
  if (err.statusCode === 404) {
    return new ContainerNotFoundError(containerName, error as Error);
  }

  if (err.statusCode === 401 || err.statusCode === 403) {
    return new AuthenticationError(
      err.message || 'Access denied',
      error as Error
    );
  }

  const message = err.message || 'Unknown error';
  return new ContainerOperationError(containerName, operation, message, error as Error);
}
