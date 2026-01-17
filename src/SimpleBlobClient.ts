import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { pipeline } from 'stream/promises';

import {
  UploadOptions,
  DownloadOptions,
  BlobItem,
  BlobMetadata,
  SimpleBlobClientOptions,
  BlobCredential,
  GetMetadataOptions,
  ListOptions,
} from './types';
import {
  BlobNotFoundError,
  BlobUploadError,
  BlobDownloadError,
  ConfigurationError,
  parseAzureError,
  parseContainerError,
} from './errors';
import {
  streamToBuffer,
  streamToString,
  getContentTypeFromExtension,
} from './utils/stream-helpers';

const LOCALHOST_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
]);

function isLocalhostHost(hostname: string): boolean {
  return LOCALHOST_HOSTNAMES.has(hostname);
}

/**
 * Simplified Azure Blob Storage client that wraps common operations
 *
 * @example
 * ```typescript
 * // Using connection string
 * const client = new SimpleBlobClient(connectionString, 'my-container');
 *
 * // Using managed identity
 * const client = new SimpleBlobClient('myaccount', 'my-container');
 *
 * // Upload and download
 * await client.uploadFromString('hello.txt', 'Hello World');
 * const content = await client.downloadAsString('hello.txt');
 * ```
 */
export class SimpleBlobClient {
  private readonly containerClient: ContainerClient;
  private readonly containerName: string;
  private readonly options: SimpleBlobClientOptions;

  /**
   * Creates a new SimpleBlobClient instance
   *
   * @param connectionStringOrAccountName - Azure Storage connection string, account name, or full URL (including SAS URLs)
   * @param containerName - Name of the blob container
   * @param credentialOrOptions - Optional credential for authentication or client options
   * @param options - Optional client configuration
   *
   * @example
   * ```typescript
   * // Connection string authentication
   * const client = new SimpleBlobClient(
   *   'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
   *   'my-container'
   * );
   *
   * // Managed identity (DefaultAzureCredential)
   * const client = new SimpleBlobClient('myaccount', 'my-container');
   *
   * // Custom credential (Azure AD)
   * const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
   * const client = new SimpleBlobClient('myaccount', 'my-container', credential);
   *
   * // Account key credential
   * const keyCredential = new StorageSharedKeyCredential(accountName, accountKey);
   * const client = new SimpleBlobClient('myaccount', 'my-container', keyCredential);
   *
   * // Account-level SAS URL
   * const client = new SimpleBlobClient(
   *   'https://myaccount.blob.core.windows.net?sv=2021-08-06&...',
   *   'my-container'
   * );
   *
   * // Container-level SAS URL (URL already includes container path)
   * const client = new SimpleBlobClient(
   *   'https://myaccount.blob.core.windows.net/my-container?sv=2021-08-06&...',
   *   'my-container'  // Still pass container name for internal reference
   * );
   *
   * // Account URL with credential
   * const client = new SimpleBlobClient(
   *   'https://myaccount.blob.core.windows.net',
   *   'my-container',
   *   myCredential
   * );
   * ```
   */
  constructor(
    connectionStringOrAccountName: string,
    containerName: string,
    credentialOrOptions?: BlobCredential | SimpleBlobClientOptions,
    options?: SimpleBlobClientOptions
  ) {
    this.containerName = containerName;

    // Determine if we have a credential or options as third parameter
    let credential: BlobCredential | undefined;
    if (credentialOrOptions) {
      // Check if it's a credential (TokenCredential has getToken, StorageSharedKeyCredential has accountName)
      if ('getToken' in credentialOrOptions || 'accountName' in credentialOrOptions) {
        credential = credentialOrOptions as BlobCredential;
        this.options = options || {};
      } else {
        this.options = credentialOrOptions as SimpleBlobClientOptions;
      }
    } else {
      this.options = {};
    }

    // Check if it's a connection string (contains AccountName= or UseDevelopmentStorage)
    if (
      connectionStringOrAccountName.includes('AccountName=') ||
      connectionStringOrAccountName.includes('UseDevelopmentStorage=true')
    ) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        connectionStringOrAccountName
      );
      this.containerClient = blobServiceClient.getContainerClient(containerName);
    }
    // Check if it's a full URL (starts with http:// or https://)
    else if (
      connectionStringOrAccountName.startsWith('http://') ||
      connectionStringOrAccountName.startsWith('https://')
    ) {
      // Parse URL to detect if container path is already included
      const parsedUrl = new URL(connectionStringOrAccountName);
      const pathParts = parsedUrl.pathname.split('/').filter(p => p.length > 0);
      const allowPathStyle =
        this.options.allowPathStyleEndpoints || isLocalhostHost(parsedUrl.hostname);

      // URL could be:
      // - Account URL: https://account.blob.core.windows.net (no path)
      // - Account SAS: https://account.blob.core.windows.net?sv=... (no path)
      // - Container URL: https://account.blob.core.windows.net/container (1 path segment)
      // - Container SAS: https://account.blob.core.windows.net/container?sv=... (1 path segment)
      // - Path-style: http://127.0.0.1:10000/account/container (Azurite/Azure Stack)

      const maxPathSegments = allowPathStyle ? 2 : 1;
      const containerSegmentIndex = allowPathStyle ? 1 : 0;

      // Validate: reject blob-level URLs (too many path segments)
      if (pathParts.length > maxPathSegments) {
        throw new ConfigurationError(
          `Blob-level SAS URLs are not supported. The URL contains a blob path: '${parsedUrl.pathname}'. ` +
          `This client operates at the container level. Please use a container-level or account-level SAS URL instead.`
        );
      }

      // Container-level URL: validate container name matches
      if (pathParts.length === maxPathSegments) {
        const urlContainerName = pathParts[containerSegmentIndex];
        if (urlContainerName !== containerName) {
          throw new ConfigurationError(
            `Container name mismatch: URL contains '${urlContainerName}' but containerName parameter is '${containerName}'. ` +
            `These must match. Either update the containerName parameter or use an account-level URL.`
          );
        }

        this.containerClient = new ContainerClient(
          connectionStringOrAccountName,
          credential
        );
      } else {
        // Account-level URL: construct container client from service client
        const blobServiceClient = new BlobServiceClient(
          connectionStringOrAccountName,
          credential
        );
        this.containerClient = blobServiceClient.getContainerClient(containerName);
      }
    }
    else {
      // Treat as account name, use credential or DefaultAzureCredential
      const accountUrl = `https://${connectionStringOrAccountName}.blob.core.windows.net`;
      const blobServiceClient = new BlobServiceClient(
        accountUrl,
        credential || new DefaultAzureCredential()
      );
      this.containerClient = blobServiceClient.getContainerClient(containerName);
    }
  }

  /**
   * Gets a BlockBlobClient for a specific blob
   */
  private getBlobClient(blobName: string): BlockBlobClient {
    return this.containerClient.getBlockBlobClient(blobName);
  }

  /**
   * Ensures the container exists (creates if not exists when option is enabled)
   */
  private async ensureContainer(): Promise<void> {
    if (this.options.createContainerIfNotExists) {
      try {
        await this.containerClient.createIfNotExists();
      } catch (error) {
        throw parseContainerError(error, this.containerName, 'create container');
      }
    }
  }

  // ==================== DOWNLOAD METHODS ====================

  /**
   * Downloads a blob as a UTF-8 string
   *
   * @param blobName - The name of the blob to download
   * @param encodingOrOptions - Character encoding (default: 'utf-8') or download options
   * @returns Promise that resolves to the blob content as string
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   * @throws {BlobDownloadError} If download fails for other reasons
   *
   * @example
   * ```typescript
   * // Simple usage
   * const content = await client.downloadAsString('data.txt');
   * console.log(content); // "Hello World"
   *
   * // With custom encoding
   * const content = await client.downloadAsString('data.txt', 'utf16le');
   *
   * // With options
   * const content = await client.downloadAsString('data.txt', {
   *   encoding: 'utf-8',
   *   onProgress: (e) => console.log(`Downloaded: ${e.percentComplete}%`),
   *   range: { start: 0, end: 100 }
   * });
   * ```
   */
  async downloadAsString(
    blobName: string,
    encodingOrOptions?: BufferEncoding | (DownloadOptions & { encoding?: BufferEncoding })
  ): Promise<string> {
    try {
      // Parse parameters - maintain backward compatibility
      let encoding: BufferEncoding = 'utf-8';
      let options: DownloadOptions | undefined;

      if (typeof encodingOrOptions === 'string') {
        encoding = encodingOrOptions;
      } else if (encodingOrOptions) {
        encoding = encodingOrOptions.encoding || 'utf-8';
        options = encodingOrOptions;
      }

      const blobClient = this.getBlobClient(blobName);
      const downloadResponse = await blobClient.download(
        options?.range?.start,
        options?.range ? options.range.end - options.range.start + 1 : undefined
      );

      if (!downloadResponse.readableStreamBody) {
        throw new BlobDownloadError(
          blobName,
          this.containerName,
          'No readable stream returned'
        );
      }

      return await streamToString(
        downloadResponse.readableStreamBody,
        encoding,
        downloadResponse.contentLength,
        options?.onProgress
      );
    } catch (error) {
      if (error instanceof BlobDownloadError || error instanceof BlobNotFoundError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'download');
    }
  }

  /**
   * Downloads a blob as a Buffer
   *
   * @param blobName - The name of the blob to download
   * @param options - Download options including progress callback
   * @returns Promise that resolves to the blob content as Buffer
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   * @throws {BlobDownloadError} If download fails for other reasons
   *
   * @example
   * ```typescript
   * const buffer = await client.downloadAsBuffer('image.png');
   * ```
   */
  async downloadAsBuffer(
    blobName: string,
    options?: DownloadOptions
  ): Promise<Buffer> {
    try {
      const blobClient = this.getBlobClient(blobName);
      const downloadResponse = await blobClient.download(
        options?.range?.start,
        options?.range ? options.range.end - options.range.start + 1 : undefined
      );

      if (!downloadResponse.readableStreamBody) {
        throw new BlobDownloadError(
          blobName,
          this.containerName,
          'No readable stream returned'
        );
      }

      return await streamToBuffer(
        downloadResponse.readableStreamBody,
        downloadResponse.contentLength,
        options?.onProgress
      );
    } catch (error) {
      if (error instanceof BlobDownloadError || error instanceof BlobNotFoundError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'download');
    }
  }

  /**
   * Downloads a blob directly to a file
   *
   * @param blobName - The name of the blob to download
   * @param filePath - Local file path to save the blob content
   * @param options - Download options including progress callback
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   * @throws {BlobDownloadError} If download fails for other reasons
   *
   * @example
   * ```typescript
   * await client.downloadToFile('documents/report.pdf', './downloads/report.pdf');
   * ```
   */
  async downloadToFile(
    blobName: string,
    filePath: string,
    options?: DownloadOptions
  ): Promise<void> {
    try {
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });

      const blobClient = this.getBlobClient(blobName);
      const downloadResponse = await blobClient.download(
        options?.range?.start,
        options?.range ? options.range.end - options.range.start + 1 : undefined
      );

      if (!downloadResponse.readableStreamBody) {
        throw new BlobDownloadError(
          blobName,
          this.containerName,
          'No readable stream returned'
        );
      }

      const writeStream = createWriteStream(filePath);

      // Track progress if callback provided
      if (options?.onProgress) {
        let loadedBytes = 0;
        const totalBytes = downloadResponse.contentLength;

        downloadResponse.readableStreamBody.on('data', (chunk: Buffer) => {
          loadedBytes += chunk.length;
          options.onProgress!({
            loadedBytes,
            totalBytes,
            percentComplete: totalBytes
              ? Math.round((loadedBytes / totalBytes) * 100)
              : undefined,
          });
        });
      }

      await pipeline(downloadResponse.readableStreamBody, writeStream);
    } catch (error) {
      if (error instanceof BlobDownloadError || error instanceof BlobNotFoundError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'download');
    }
  }

  /**
   * Downloads a blob and parses it as JSON
   *
   * @param blobName - The name of the blob to download
   * @param options - Download options including progress callback and range
   * @returns Promise that resolves to the parsed JSON object
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   * @throws {BlobDownloadError} If download or JSON parsing fails
   *
   * @example
   * ```typescript
   * interface Config {
   *   apiUrl: string;
   *   timeout: number;
   * }
   * const config = await client.downloadAsJson<Config>('config.json');
   * console.log(config.apiUrl);
   *
   * // With progress tracking
   * const config = await client.downloadAsJson<Config>('config.json', {
   *   onProgress: (e) => console.log(`Loaded: ${e.loadedBytes} bytes`)
   * });
   * ```
   */
  async downloadAsJson<T = unknown>(
    blobName: string,
    options?: DownloadOptions
  ): Promise<T> {
    const content = await this.downloadAsString(blobName, { ...options, encoding: 'utf-8' });

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new BlobDownloadError(
        blobName,
        this.containerName,
        'Content is not valid JSON',
        error as Error
      );
    }
  }

  // ==================== UPLOAD METHODS ====================

  /**
   * Uploads a string to a blob
   *
   * @param blobName - The name of the blob to create/update
   * @param content - The string content to upload
   * @param options - Upload options including content type and metadata
   *
   * @throws {BlobUploadError} If upload fails
   *
   * @example
   * ```typescript
   * await client.uploadFromString('notes.txt', 'Hello World');
   * ```
   */
  async uploadFromString(
    blobName: string,
    content: string,
    options?: UploadOptions
  ): Promise<void> {
    await this.ensureContainer();

    try {
      const blobClient = this.getBlobClient(blobName);
      const buffer = Buffer.from(content, 'utf-8');

      await blobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType:
            options?.contentType || getContentTypeFromExtension(blobName) || 'text/plain',
        },
        metadata: options?.metadata,
        tags: options?.tags,
        conditions: options?.overwrite === false ? { ifNoneMatch: '*' } : undefined,
        onProgress: options?.onProgress
          ? (progress) => {
              options.onProgress!({
                loadedBytes: progress.loadedBytes,
                totalBytes: buffer.length,
                percentComplete: buffer.length > 0
                  ? Math.round((progress.loadedBytes / buffer.length) * 100)
                  : 100,
              });
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof BlobUploadError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'upload');
    }
  }

  /**
   * Uploads a Buffer to a blob
   *
   * @param blobName - The name of the blob to create/update
   * @param buffer - The Buffer content to upload
   * @param options - Upload options including content type and metadata
   *
   * @throws {BlobUploadError} If upload fails
   *
   * @example
   * ```typescript
   * const imageBuffer = fs.readFileSync('photo.jpg');
   * await client.uploadFromBuffer('images/photo.jpg', imageBuffer);
   * ```
   */
  async uploadFromBuffer(
    blobName: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<void> {
    await this.ensureContainer();

    try {
      const blobClient = this.getBlobClient(blobName);

      await blobClient.uploadData(buffer, {
        blobHTTPHeaders: {
          blobContentType:
            options?.contentType ||
            getContentTypeFromExtension(blobName) ||
            'application/octet-stream',
        },
        metadata: options?.metadata,
        tags: options?.tags,
        conditions: options?.overwrite === false ? { ifNoneMatch: '*' } : undefined,
        onProgress: options?.onProgress
          ? (progress) => {
              options.onProgress!({
                loadedBytes: progress.loadedBytes,
                totalBytes: buffer.length,
                percentComplete: buffer.length > 0
                  ? Math.round((progress.loadedBytes / buffer.length) * 100)
                  : 100,
              });
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof BlobUploadError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'upload');
    }
  }

  /**
   * Uploads a file from the filesystem to a blob
   *
   * @param blobName - The name of the blob to create/update
   * @param filePath - Local file path to upload
   * @param options - Upload options including content type and metadata
   *
   * @throws {BlobUploadError} If upload fails
   *
   * @example
   * ```typescript
   * await client.uploadFromFile('documents/report.pdf', './local/report.pdf');
   * ```
   */
  async uploadFromFile(
    blobName: string,
    filePath: string,
    options?: UploadOptions
  ): Promise<void> {
    await this.ensureContainer();

    try {
      const blobClient = this.getBlobClient(blobName);

      await blobClient.uploadFile(filePath, {
        blobHTTPHeaders: {
          blobContentType:
            options?.contentType ||
            getContentTypeFromExtension(blobName) ||
            getContentTypeFromExtension(filePath) ||
            'application/octet-stream',
        },
        metadata: options?.metadata,
        tags: options?.tags,
        conditions: options?.overwrite === false ? { ifNoneMatch: '*' } : undefined,
        onProgress: options?.onProgress
          ? (progress) => {
              options.onProgress!({
                loadedBytes: progress.loadedBytes,
                totalBytes: undefined,
                percentComplete: undefined,
              });
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof BlobUploadError) {
        throw error;
      }
      throw parseAzureError(error, blobName, this.containerName, 'upload');
    }
  }

  /**
   * Uploads a JavaScript object as JSON to a blob
   *
   * @param blobName - The name of the blob to create/update
   * @param data - The data to serialize as JSON
   * @param options - Upload options including metadata
   *
   * @throws {BlobUploadError} If upload fails
   *
   * @example
   * ```typescript
   * await client.uploadJson('config.json', { apiUrl: 'https://api.example.com', timeout: 5000 });
   * ```
   */
  async uploadJson(
    blobName: string,
    data: unknown,
    options?: UploadOptions
  ): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.uploadFromString(blobName, content, {
      ...options,
      contentType: 'application/json',
    });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Checks if a blob exists
   *
   * @param blobName - The name of the blob to check
   * @returns Promise that resolves to true if the blob exists
   *
   * @example
   * ```typescript
   * if (await client.exists('config.json')) {
   *   const config = await client.downloadAsJson('config.json');
   * }
   * ```
   */
  async exists(blobName: string): Promise<boolean> {
    try {
      const blobClient = this.getBlobClient(blobName);
      return await blobClient.exists();
    } catch (error) {
      throw parseAzureError(error, blobName, this.containerName, 'other');
    }
  }

  /**
   * Deletes a blob
   *
   * @param blobName - The name of the blob to delete
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   *
   * @example
   * ```typescript
   * await client.delete('old-file.txt');
   * ```
   */
  async delete(blobName: string): Promise<void> {
    try {
      const blobClient = this.getBlobClient(blobName);
      await blobClient.delete();
    } catch (error) {
      throw parseAzureError(error, blobName, this.containerName, 'other');
    }
  }

  /**
   * Lists blobs in the container
   *
   * @param prefix - Optional prefix to filter blobs
   * @param optionsOrMaxResults - List options or maximum number of blobs (for backward compatibility)
   * @returns Promise that resolves to an array of blob items
   *
   * @example
   * ```typescript
   * // List all blobs
   * const blobs = await client.list();
   *
   * // List blobs in a folder
   * const documents = await client.list('documents/');
   *
   * // Get only first 10 blobs (backward compatible)
   * const firstTen = await client.list(undefined, 10);
   *
   * // Using options
   * const blobs = await client.list('documents/', {
   *   maxResults: 10,
   *   includeMetadata: false  // Skip metadata for better performance
   * });
   * ```
   */
  async list(
    prefix?: string,
    optionsOrMaxResults?: number | ListOptions
  ): Promise<BlobItem[]> {
    try {
      // Parse parameters - maintain backward compatibility
      let options: ListOptions;
      if (typeof optionsOrMaxResults === 'number') {
        options = { maxResults: optionsOrMaxResults, includeMetadata: true };
      } else {
        options = {
          maxResults: optionsOrMaxResults?.maxResults,
          includeMetadata: optionsOrMaxResults?.includeMetadata ?? true,
        };
      }

      const blobs: BlobItem[] = [];
      let count = 0;

      const iterator = this.containerClient.listBlobsFlat({
        prefix,
        includeMetadata: options.includeMetadata,
      });

      for await (const blob of iterator) {
        if (options.maxResults && count >= options.maxResults) {
          break;
        }

        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date(),
          contentType: blob.properties.contentType,
          metadata: blob.metadata,
        });

        count++;
      }

      return blobs;
    } catch (error) {
      throw parseContainerError(error, this.containerName, 'list blobs');
    }
  }

  /**
   * Gets metadata and properties for a blob
   *
   * @param blobName - The name of the blob
   * @param options - Options for metadata retrieval
   * @returns Promise that resolves to blob metadata
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   *
   * @example
   * ```typescript
   * const metadata = await client.getMetadata('document.pdf');
   * console.log(metadata.contentLength); // File size in bytes
   * console.log(metadata.lastModified); // Last modification date
   *
   * // Include tags (requires blob index permissions)
   * const metadataWithTags = await client.getMetadata('document.pdf', { includeTags: true });
   * console.log(metadataWithTags.tags); // Blob index tags
   * ```
   */
  async getMetadata(blobName: string, options?: GetMetadataOptions): Promise<BlobMetadata> {
    try {
      const blobClient = this.getBlobClient(blobName);
      const properties = await blobClient.getProperties();

      let tags: Record<string, string> | undefined;
      if (options?.includeTags) {
        const tagsResponse = await blobClient.getTags();
        tags = tagsResponse.tags;
      }

      return {
        contentType: properties.contentType,
        contentLength: properties.contentLength || 0,
        lastModified: properties.lastModified || new Date(),
        etag: properties.etag || '',
        metadata: properties.metadata || {},
        tags,
      };
    } catch (error) {
      throw parseAzureError(error, blobName, this.containerName, 'other');
    }
  }

  /**
   * Sets metadata for a blob
   *
   * @param blobName - The name of the blob
   * @param metadata - Key-value pairs of metadata to set
   *
   * @throws {BlobNotFoundError} If the blob doesn't exist
   *
   * @example
   * ```typescript
   * await client.setMetadata('document.pdf', {
   *   author: 'John Doe',
   *   version: '1.0'
   * });
   * ```
   */
  async setMetadata(
    blobName: string,
    metadata: Record<string, string>
  ): Promise<void> {
    try {
      const blobClient = this.getBlobClient(blobName);
      await blobClient.setMetadata(metadata);
    } catch (error) {
      throw parseAzureError(error, blobName, this.containerName, 'other');
    }
  }

  /**
   * Gets the underlying ContainerClient for advanced operations
   *
   * @returns The Azure SDK ContainerClient
   *
   * @example
   * ```typescript
   * const containerClient = client.getContainerClient();
   * // Use for advanced operations not covered by SimpleBlobClient
   * ```
   */
  getContainerClient(): ContainerClient {
    return this.containerClient;
  }
}
