import { TokenCredential } from '@azure/identity';
import { StorageSharedKeyCredential } from '@azure/storage-blob';

/**
 * Progress event for tracking upload/download progress
 */
export interface ProgressEvent {
  /** Number of bytes loaded so far */
  loadedBytes: number;
  /** Total number of bytes (if known) */
  totalBytes?: number;
  /** Percentage complete (0-100) */
  percentComplete?: number;
}

/**
 * Options for upload operations
 */
export interface UploadOptions {
  /** MIME content type (auto-detected from extension if not provided) */
  contentType?: string;
  /** Custom metadata key-value pairs */
  metadata?: Record<string, string>;
  /** Blob index tags for querying */
  tags?: Record<string, string>;
  /** Whether to overwrite existing blob (default: true) */
  overwrite?: boolean;
  /** Progress callback for tracking upload progress */
  onProgress?: (progress: ProgressEvent) => void;
}

/**
 * Options for download operations
 */
export interface DownloadOptions {
  /** Progress callback for tracking download progress */
  onProgress?: (progress: ProgressEvent) => void;
  /** Byte range to download (inclusive, non-negative integers) */
  range?: { start: number; end: number };
}

/**
 * Simplified blob item returned from list operations
 */
export interface BlobItem {
  /** Full blob name (path) */
  name: string;
  /** Size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** MIME content type */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
}

/**
 * Detailed blob metadata and properties
 */
export interface BlobMetadata {
  /** MIME content type */
  contentType?: string;
  /** Size in bytes */
  contentLength: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** Entity tag for concurrency */
  etag: string;
  /** Custom metadata */
  metadata: Record<string, string>;
  /** Blob index tags */
  tags?: Record<string, string>;
}

/**
 * Options for getMetadata operations
 */
export interface GetMetadataOptions {
  /** Whether to include blob index tags (default: false) */
  includeTags?: boolean;
}

/**
 * Options for list operations
 */
export interface ListOptions {
  /** Maximum number of blobs to return */
  maxResults?: number;
  /** Whether to include blob metadata (default: true for backward compatibility) */
  includeMetadata?: boolean;
}

/**
 * Configuration options for SimpleBlobClient
 */
export interface SimpleBlobClientOptions {
  /** Create container if it doesn't exist */
  createContainerIfNotExists?: boolean;
  /** Allow path-style endpoints (Azurite/Azure Stack) */
  allowPathStyleEndpoints?: boolean;
}

/**
 * Credential type that can be used for authentication
 * - TokenCredential: For Azure AD authentication (DefaultAzureCredential, ClientSecretCredential, etc.)
 * - StorageSharedKeyCredential: For account key authentication
 */
export type BlobCredential = TokenCredential | StorageSharedKeyCredential;
