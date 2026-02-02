import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

// Mock @azure/storage-blob
const mockUploadData = vi.fn();
const mockDownload = vi.fn();
const mockExists = vi.fn();
const mockDelete = vi.fn();
const mockGetProperties = vi.fn();
const mockGetTags = vi.fn();
const mockSetMetadata = vi.fn();
const mockCreateIfNotExists = vi.fn();
const mockListBlobsFlat = vi.fn();
const mockUploadFile = vi.fn();

vi.mock('@azure/storage-blob', () => {
  return {
    BlobServiceClient: class MockBlobServiceClient {
      static fromConnectionString = vi.fn().mockImplementation(() => {
        return new MockBlobServiceClient();
      });

      getContainerClient() {
        return {
          getBlockBlobClient: vi.fn().mockImplementation(() => ({
            uploadData: mockUploadData,
            uploadFile: mockUploadFile,
            download: mockDownload,
            exists: mockExists,
            delete: mockDelete,
            getProperties: mockGetProperties,
            getTags: mockGetTags,
            setMetadata: mockSetMetadata,
          })),
          createIfNotExists: mockCreateIfNotExists,
          listBlobsFlat: mockListBlobsFlat,
        };
      }
    },
    ContainerClient: vi.fn(),
    BlockBlobClient: vi.fn(),
    StorageSharedKeyCredential: vi.fn(),
  };
});

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

// Helper to create a mock readable stream
function createMockReadableStream(content: string): NodeJS.ReadableStream {
  const readable = new Readable();
  readable.push(content);
  readable.push(null);
  return readable;
}

// Import after mocks are set up
import {
  SimpleBlobClient,
  BlobNotFoundError,
  BlobDownloadError,
  ConfigurationError,
} from '../../src';

describe('SimpleBlobClient', () => {
  let client: SimpleBlobClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock implementations
    mockUploadData.mockResolvedValue({});
    mockUploadFile.mockResolvedValue({});
    mockExists.mockResolvedValue(true);
    mockDelete.mockResolvedValue({});
    mockGetTags.mockResolvedValue({ tags: {} });
    mockSetMetadata.mockResolvedValue({});
    mockCreateIfNotExists.mockResolvedValue({});
    mockListBlobsFlat.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield {
          name: 'test.txt',
          properties: {
            contentLength: 100,
            lastModified: new Date('2024-01-01'),
            contentType: 'text/plain',
          },
          metadata: {},
        };
      },
    });

    client = new SimpleBlobClient(
      'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
      'test-container'
    );
  });

  describe('constructor', () => {
    it('should create client with connection string', () => {
      const connStringClient = new SimpleBlobClient(
        'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
        'my-container'
      );
      expect(connStringClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with development storage connection string', () => {
      const devClient = new SimpleBlobClient(
        'UseDevelopmentStorage=true',
        'my-container'
      );
      expect(devClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with account-level SAS URL', () => {
      const sasClient = new SimpleBlobClient(
        'https://myaccount.blob.core.windows.net?sv=2021-08-06&ss=b&srt=sco&sp=rwdlacx&sig=test',
        'my-container'
      );
      expect(sasClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with container-level SAS URL', () => {
      const containerSasClient = new SimpleBlobClient(
        'https://myaccount.blob.core.windows.net/my-container?sv=2021-08-06&sr=c&sp=rwdl&sig=test',
        'my-container'
      );
      expect(containerSasClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with account URL', () => {
      const urlClient = new SimpleBlobClient(
        'https://myaccount.blob.core.windows.net',
        'my-container'
      );
      expect(urlClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with http URL (Azurite)', () => {
      // Azurite URL without container path - account level
      const httpClient = new SimpleBlobClient(
        'http://127.0.0.1:10000',
        'my-container'
      );
      expect(httpClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with Azurite path-style account URL', () => {
      // Azurite URL with account name in path
      const httpClient = new SimpleBlobClient(
        'http://127.0.0.1:10000/devstoreaccount1',
        'my-container'
      );
      expect(httpClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should create client with Azurite path-style container URL', () => {
      const httpClient = new SimpleBlobClient(
        'http://127.0.0.1:10000/devstoreaccount1/my-container',
        'my-container'
      );
      expect(httpClient).toBeInstanceOf(SimpleBlobClient);
    });

    it('should reject blob-level SAS URLs', () => {
      expect(() => {
        new SimpleBlobClient(
          'https://myaccount.blob.core.windows.net/container/blob.txt?sv=2021-08-06&sig=test',
          'container'
        );
      }).toThrow(ConfigurationError);
    });

    it('should reject container name mismatch for container-level URL', () => {
      expect(() => {
        new SimpleBlobClient(
          'https://myaccount.blob.core.windows.net/container-a?sv=2021-08-06&sig=test',
          'container-b'
        );
      }).toThrow(ConfigurationError);
    });

    it('should support StorageSharedKeyCredential', () => {
      // Mock credential with accountName property
      const mockSharedKeyCredential = {
        accountName: 'myaccount',
        computeHMACSHA256: vi.fn(),
      };

      const client = new SimpleBlobClient(
        'myaccount',
        'my-container',
        mockSharedKeyCredential as any
      );

      expect(client).toBeInstanceOf(SimpleBlobClient);
    });

    it('should support options passed as 4th parameter when 3rd is undefined', async () => {
      const clientWithFourthParamOptions = new SimpleBlobClient(
        'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
        'my-container',
        undefined,
        { createContainerIfNotExists: true }
      );

      mockCreateIfNotExists.mockResolvedValue({});
      await clientWithFourthParamOptions.uploadFromString('test.txt', 'content');

      expect(mockCreateIfNotExists).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadAsString', () => {
    it('should download blob content as string', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('Hello World'),
        contentLength: 11,
      });

      const content = await client.downloadAsString('test.txt');
      expect(content).toBe('Hello World');
    });

    it('should throw BlobNotFoundError when blob does not exist', async () => {
      mockDownload.mockRejectedValue({
        statusCode: 404,
        code: 'BlobNotFound',
        message: 'Blob not found',
      });

      await expect(client.downloadAsString('nonexistent.txt')).rejects.toThrow(
        BlobNotFoundError
      );
    });

    it('should throw BlobDownloadError when stream is missing', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: null,
        contentLength: 0,
      });

      await expect(client.downloadAsString('test.txt')).rejects.toThrow(
        BlobDownloadError
      );
    });

    it('should support custom encoding as string parameter (backward compatibility)', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('Hello'),
        contentLength: 5,
      });

      const content = await client.downloadAsString('test.txt', 'utf-8');
      expect(content).toBe('Hello');
    });

    it('should support options with encoding', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('Hello'),
        contentLength: 5,
      });

      const content = await client.downloadAsString('test.txt', {
        encoding: 'utf-8'
      });
      expect(content).toBe('Hello');
    });

    it('should support progress callback in options', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('Hello World'),
        contentLength: 11,
      });

      const progressEvents: number[] = [];
      await client.downloadAsString('test.txt', {
        onProgress: (event) => {
          progressEvents.push(event.loadedBytes);
        }
      });

      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should support range download in options', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('partial'),
        contentLength: 7,
      });

      await client.downloadAsString('test.txt', {
        range: { start: 0, end: 6 }
      });

      expect(mockDownload).toHaveBeenCalledWith(0, 7);
    });

    it('should throw ConfigurationError for invalid range where end is smaller than start', async () => {
      await expect(
        client.downloadAsString('test.txt', {
          range: { start: 10, end: 5 },
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for non-integer range values', async () => {
      await expect(
        client.downloadAsString('test.txt', {
          range: { start: 1.2, end: 5 },
        })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('downloadAsBuffer', () => {
    it('should download blob content as buffer', async () => {
      const testContent = 'Binary content';
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream(testContent),
        contentLength: testContent.length,
      });

      const buffer = await client.downloadAsBuffer('test.bin');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe(testContent);
    });

    it('should support range downloads', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('partial'),
        contentLength: 7,
      });

      await client.downloadAsBuffer('test.bin', {
        range: { start: 0, end: 6 },
      });

      expect(mockDownload).toHaveBeenCalledWith(0, 7);
    });

    it('should throw ConfigurationError for negative range values', async () => {
      await expect(
        client.downloadAsBuffer('test.bin', {
          range: { start: -1, end: 6 },
        })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('downloadAsJson', () => {
    it('should download and parse JSON content', async () => {
      const jsonData = { name: 'test', value: 42 };
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream(JSON.stringify(jsonData)),
        contentLength: JSON.stringify(jsonData).length,
      });

      const result = await client.downloadAsJson<{ name: string; value: number }>(
        'config.json'
      );
      expect(result).toEqual(jsonData);
    });

    it('should throw BlobDownloadError for invalid JSON', async () => {
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream('not valid json'),
        contentLength: 14,
      });

      await expect(client.downloadAsJson('invalid.json')).rejects.toThrow(
        BlobDownloadError
      );
    });

    it('should support progress callback in options', async () => {
      const jsonData = { test: 'data' };
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream(JSON.stringify(jsonData)),
        contentLength: JSON.stringify(jsonData).length,
      });

      const progressEvents: number[] = [];
      const result = await client.downloadAsJson('config.json', {
        onProgress: (event) => {
          progressEvents.push(event.loadedBytes);
        }
      });

      expect(result).toEqual(jsonData);
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should support range download in options', async () => {
      const jsonData = { partial: true };
      mockDownload.mockResolvedValue({
        readableStreamBody: createMockReadableStream(JSON.stringify(jsonData)),
        contentLength: JSON.stringify(jsonData).length,
      });

      await client.downloadAsJson('config.json', {
        range: { start: 0, end: 50 }
      });

      expect(mockDownload).toHaveBeenCalledWith(0, 51);
    });
  });

  describe('uploadFromString', () => {
    it('should upload string content', async () => {
      await client.uploadFromString('test.txt', 'Hello World');

      expect(mockUploadData).toHaveBeenCalledWith(
        Buffer.from('Hello World', 'utf-8'),
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'text/plain',
          }),
        })
      );
    });

    it('should use custom content type when provided', async () => {
      await client.uploadFromString('test.txt', 'Hello', {
        contentType: 'text/html',
      });

      expect(mockUploadData).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'text/html',
          }),
        })
      );
    });

    it('should include metadata when provided', async () => {
      await client.uploadFromString('test.txt', 'Hello', {
        metadata: { author: 'test' },
      });

      expect(mockUploadData).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: { author: 'test' },
        })
      );
    });

    it('should handle empty string upload with progress callback without NaN', async () => {
      const progressEvents: number[] = [];

      await client.uploadFromString('empty.txt', '', {
        onProgress: (event) => {
          progressEvents.push(event.percentComplete!);
        },
      });

      // Verify that percentComplete is 100, not NaN
      expect(progressEvents.every(p => p === 100)).toBe(true);
      expect(progressEvents.every(p => !isNaN(p))).toBe(true);
    });
  });

  describe('uploadFromBuffer', () => {
    it('should upload buffer content', async () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      await client.uploadFromBuffer('image.png', buffer);

      expect(mockUploadData).toHaveBeenCalledWith(
        buffer,
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'image/png',
          }),
        })
      );
    });

    it('should handle empty buffer upload with progress callback without division by zero', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const progressEvents: number[] = [];

      await client.uploadFromBuffer('empty.bin', emptyBuffer, {
        onProgress: (event) => {
          progressEvents.push(event.percentComplete!);
        },
      });

      // Verify that percentComplete is 100, not NaN or Infinity
      expect(progressEvents.every(p => p === 100)).toBe(true);
      expect(progressEvents.every(p => !isNaN(p) && isFinite(p))).toBe(true);
    });
  });

  describe('uploadJson', () => {
    it('should serialize and upload JSON', async () => {
      const data = { key: 'value', count: 42 };

      await client.uploadJson('config.json', data);

      expect(mockUploadData).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          blobHTTPHeaders: expect.objectContaining({
            blobContentType: 'application/json',
          }),
        })
      );
    });

    it('should throw ConfigurationError when JSON serialization fails', async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await expect(client.uploadJson('invalid.json', circular)).rejects.toThrow(
        ConfigurationError
      );
    });

    it('should throw ConfigurationError for non-serializable top-level values', async () => {
      await expect(client.uploadJson('invalid.json', undefined)).rejects.toThrow(
        ConfigurationError
      );
    });
  });

  describe('exists', () => {
    it('should return true when blob exists', async () => {
      mockExists.mockResolvedValue(true);

      const result = await client.exists('test.txt');
      expect(result).toBe(true);
    });

    it('should return false when blob does not exist', async () => {
      mockExists.mockResolvedValue(false);

      const result = await client.exists('nonexistent.txt');
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete blob successfully', async () => {
      mockDelete.mockResolvedValue({});

      await expect(client.delete('test.txt')).resolves.not.toThrow();
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error when blob does not exist', async () => {
      mockDelete.mockRejectedValue({
        statusCode: 404,
        code: 'BlobNotFound',
      });

      await expect(client.delete('nonexistent.txt')).rejects.toThrow(
        BlobNotFoundError
      );
    });
  });

  describe('list', () => {
    it('should list blobs in container', async () => {
      const blobs = await client.list();

      expect(blobs).toHaveLength(1);
      expect(blobs[0]).toEqual({
        name: 'test.txt',
        size: 100,
        lastModified: expect.any(Date),
        contentType: 'text/plain',
        metadata: {},
      });
    });

    it('should filter by prefix', async () => {
      await client.list('documents/');

      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: 'documents/',
        includeMetadata: true,
      });
    });

    it('should support maxResults as number (backward compatibility)', async () => {
      await client.list(undefined, 5);

      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: undefined,
        includeMetadata: true,
      });
    });

    it('should support ListOptions with includeMetadata false', async () => {
      await client.list('prefix/', {
        maxResults: 10,
        includeMetadata: false
      });

      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: 'prefix/',
        includeMetadata: false,
      });
    });

    it('should support ListOptions with includeMetadata true', async () => {
      await client.list('prefix/', {
        includeMetadata: true
      });

      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: 'prefix/',
        includeMetadata: true,
      });
    });

    it('should default includeMetadata to true when not specified', async () => {
      await client.list('prefix/', {
        maxResults: 5
      });

      expect(mockListBlobsFlat).toHaveBeenCalledWith({
        prefix: 'prefix/',
        includeMetadata: true,
      });
    });
  });

  describe('getMetadata', () => {
    it('should return blob metadata', async () => {
      mockGetProperties.mockResolvedValue({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: new Date('2024-01-01'),
        etag: '"abc123"',
        metadata: { author: 'test' },
      });

      const metadata = await client.getMetadata('test.txt');

      expect(metadata).toEqual({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: expect.any(Date),
        etag: '"abc123"',
        metadata: { author: 'test' },
        tags: undefined,
      });
    });

    it('should return blob metadata with tags when includeTags is true', async () => {
      mockGetProperties.mockResolvedValue({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: new Date('2024-01-01'),
        etag: '"abc123"',
        metadata: { author: 'test' },
      });

      const metadata = await client.getMetadata('test.txt', { includeTags: true });

      expect(metadata).toEqual({
        contentType: 'text/plain',
        contentLength: 100,
        lastModified: expect.any(Date),
        etag: '"abc123"',
        metadata: { author: 'test' },
        tags: {},
      });
      expect(mockGetTags).toHaveBeenCalled();
    });
  });

  describe('setMetadata', () => {
    it('should set blob metadata', async () => {
      await client.setMetadata('test.txt', { version: '1.0' });

      expect(mockSetMetadata).toHaveBeenCalledWith({ version: '1.0' });
    });
  });
});
