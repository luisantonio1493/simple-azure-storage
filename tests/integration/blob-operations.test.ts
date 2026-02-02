import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SimpleBlobClient, BlobNotFoundError } from '../../src';
import { BlobServiceClient } from '@azure/storage-blob';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, unlink, mkdir } from 'fs/promises';

/**
 * Integration tests using Azurite (local Azure Storage emulator)
 *
 * Prerequisites:
 * 1. Install Azurite: npm install -g azurite
 * 2. Start Azurite: azurite --silent --skipApiVersionCheck --location ./azurite-data --debug ./azurite-debug.log
 *
 * Or run with Docker:
 * docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 mcr.microsoft.com/azure-storage/azurite azurite --skipApiVersionCheck
 */

const AZURITE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
const TEST_CONTAINER = 'integration-test-container';

describe('SimpleBlobClient - Integration Tests', () => {
  let client: SimpleBlobClient;
  let blobServiceClient: BlobServiceClient;

  beforeAll(async () => {
    // Create the test container
    blobServiceClient = BlobServiceClient.fromConnectionString(AZURITE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(TEST_CONTAINER);

    try {
      await containerClient.create();
    } catch (error: any) {
      // Container might already exist
      if (error.statusCode !== 409) {
        throw error;
      }
    }

    client = new SimpleBlobClient(AZURITE_CONNECTION_STRING, TEST_CONTAINER);
  });

  afterAll(async () => {
    // Clean up: delete the test container
    const containerClient = blobServiceClient.getContainerClient(TEST_CONTAINER);
    try {
      await containerClient.delete();
    } catch {
      // Ignore errors during cleanup
    }
  });

  beforeEach(async () => {
    // Clean up all blobs before each test
    const containerClient = blobServiceClient.getContainerClient(TEST_CONTAINER);
    for await (const blob of containerClient.listBlobsFlat()) {
      await containerClient.getBlockBlobClient(blob.name).delete();
    }
  });

  describe('String operations', () => {
    it('should upload and download string content', async () => {
      const blobName = 'test-string.txt';
      const content = 'Hello, Azure Blob Storage!';

      await client.uploadFromString(blobName, content);
      const downloaded = await client.downloadAsString(blobName);

      expect(downloaded).toBe(content);
    });

    it('should handle unicode content correctly', async () => {
      const blobName = 'unicode.txt';
      const content = 'Hello 世界! مرحبا 🎉';

      await client.uploadFromString(blobName, content);
      const downloaded = await client.downloadAsString(blobName);

      expect(downloaded).toBe(content);
    });

    it('should handle large string content', async () => {
      const blobName = 'large.txt';
      const content = 'A'.repeat(1024 * 1024); // 1MB of 'A's

      await client.uploadFromString(blobName, content);
      const downloaded = await client.downloadAsString(blobName);

      expect(downloaded).toBe(content);
    });
  });

  describe('Buffer operations', () => {
    it('should upload and download buffer content', async () => {
      const blobName = 'test-buffer.bin';
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

      await client.uploadFromBuffer(blobName, buffer);
      const downloaded = await client.downloadAsBuffer(blobName);

      expect(downloaded).toEqual(buffer);
    });

    it('should handle empty buffer', async () => {
      const blobName = 'empty.bin';
      const buffer = Buffer.alloc(0);

      await client.uploadFromBuffer(blobName, buffer);
      const downloaded = await client.downloadAsBuffer(blobName);

      expect(downloaded).toEqual(buffer);
    });
  });

  describe('JSON operations', () => {
    it('should upload and download JSON', async () => {
      const blobName = 'config.json';
      const data = {
        apiUrl: 'https://api.example.com',
        timeout: 5000,
        features: ['a', 'b', 'c'],
        nested: { deep: { value: true } },
      };

      await client.uploadJson(blobName, data);
      const downloaded = await client.downloadAsJson<typeof data>(blobName);

      expect(downloaded).toEqual(data);
    });

    it('should handle arrays as JSON', async () => {
      const blobName = 'array.json';
      const data = [1, 2, 3, 'four', { five: 5 }];

      await client.uploadJson(blobName, data);
      const downloaded = await client.downloadAsJson<typeof data>(blobName);

      expect(downloaded).toEqual(data);
    });
  });

  describe('File operations', () => {
    const tempDir = join(tmpdir(), 'simple-azure-storage-test');

    beforeAll(async () => {
      await mkdir(tempDir, { recursive: true });
    });

    it('should download blob to file', async () => {
      const blobName = 'download-test.txt';
      const content = 'Content for file download';
      const filePath = join(tempDir, 'downloaded.txt');

      await client.uploadFromString(blobName, content);
      await client.downloadToFile(blobName, filePath);

      const fileContent = await readFile(filePath, 'utf-8');
      expect(fileContent).toBe(content);

      // Cleanup
      await unlink(filePath);
    });

    it('should create parent directories when downloading', async () => {
      const blobName = 'nested-download.txt';
      const content = 'Nested content';
      const filePath = join(tempDir, 'nested', 'deep', 'downloaded.txt');

      await client.uploadFromString(blobName, content);
      await client.downloadToFile(blobName, filePath);

      const fileContent = await readFile(filePath, 'utf-8');
      expect(fileContent).toBe(content);

      // Cleanup
      await unlink(filePath);
    });
  });

  describe('exists', () => {
    it('should return true for existing blob', async () => {
      const blobName = 'exists-test.txt';
      await client.uploadFromString(blobName, 'test');

      expect(await client.exists(blobName)).toBe(true);
    });

    it('should return false for non-existing blob', async () => {
      expect(await client.exists('does-not-exist.txt')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing blob', async () => {
      const blobName = 'delete-test.txt';
      await client.uploadFromString(blobName, 'test');

      expect(await client.exists(blobName)).toBe(true);

      await client.delete(blobName);

      expect(await client.exists(blobName)).toBe(false);
    });

    it('should throw BlobNotFoundError for non-existing blob', async () => {
      await expect(client.delete('non-existent.txt')).rejects.toThrow(BlobNotFoundError);
    });
  });

  describe('list', () => {
    it('should list all blobs', async () => {
      await client.uploadFromString('file1.txt', 'content1');
      await client.uploadFromString('file2.txt', 'content2');
      await client.uploadFromString('file3.txt', 'content3');

      const blobs = await client.list();

      expect(blobs).toHaveLength(3);
      expect(blobs.map((b) => b.name).sort()).toEqual([
        'file1.txt',
        'file2.txt',
        'file3.txt',
      ]);
    });

    it('should filter by prefix', async () => {
      await client.uploadFromString('docs/readme.md', 'readme');
      await client.uploadFromString('docs/guide.md', 'guide');
      await client.uploadFromString('images/logo.png', 'logo');

      const docs = await client.list('docs/');

      expect(docs).toHaveLength(2);
      expect(docs.map((b) => b.name).sort()).toEqual(['docs/guide.md', 'docs/readme.md']);
    });

    it('should limit results', async () => {
      await client.uploadFromString('a.txt', 'a');
      await client.uploadFromString('b.txt', 'b');
      await client.uploadFromString('c.txt', 'c');
      await client.uploadFromString('d.txt', 'd');
      await client.uploadFromString('e.txt', 'e');

      const blobs = await client.list(undefined, 3);

      expect(blobs).toHaveLength(3);
    });
  });

  describe('metadata', () => {
    it('should get blob metadata', async () => {
      const blobName = 'metadata-test.txt';
      await client.uploadFromString(blobName, 'test content', {
        metadata: { author: 'test', version: '1.0' },
      });

      const metadata = await client.getMetadata(blobName);

      expect(metadata.contentType).toBe('text/plain');
      expect(metadata.contentLength).toBe(12); // 'test content'.length
      expect(metadata.metadata).toEqual({ author: 'test', version: '1.0' });
    });

    it('should set blob metadata', async () => {
      const blobName = 'set-metadata.txt';
      await client.uploadFromString(blobName, 'test');

      await client.setMetadata(blobName, { updated: 'true', count: '42' });

      const metadata = await client.getMetadata(blobName);
      expect(metadata.metadata).toEqual({ updated: 'true', count: '42' });
    });
  });

  describe('content type detection', () => {
    it('should detect content type from extension', async () => {
      await client.uploadFromString('test.json', '{}');
      const jsonMeta = await client.getMetadata('test.json');
      expect(jsonMeta.contentType).toBe('application/json');

      await client.uploadFromString('test.html', '<html></html>');
      const htmlMeta = await client.getMetadata('test.html');
      expect(htmlMeta.contentType).toBe('text/html');

      await client.uploadFromBuffer('image.png', Buffer.from([0x89, 0x50]));
      const pngMeta = await client.getMetadata('image.png');
      expect(pngMeta.contentType).toBe('image/png');
    });

    it('should use provided content type over detected', async () => {
      await client.uploadFromString('custom.txt', 'data', {
        contentType: 'application/octet-stream',
      });

      const metadata = await client.getMetadata('custom.txt');
      expect(metadata.contentType).toBe('application/octet-stream');
    });
  });

  describe('progress tracking', () => {
    it('should report download progress', async () => {
      const content = 'A'.repeat(10000);
      await client.uploadFromString('progress-test.txt', content);

      const progressEvents: number[] = [];

      await client.downloadAsBuffer('progress-test.txt', {
        onProgress: (progress) => {
          progressEvents.push(progress.loadedBytes);
        },
      });

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1]).toBe(content.length);
    });
  });

  describe('error handling', () => {
    it('should throw BlobNotFoundError for non-existing blob download', async () => {
      await expect(
        client.downloadAsString('absolutely-does-not-exist.txt')
      ).rejects.toThrow(BlobNotFoundError);
    });

    it('should include blob name in error', async () => {
      try {
        await client.downloadAsString('my-missing-blob.txt');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BlobNotFoundError);
        expect((error as BlobNotFoundError).blobName).toBe('my-missing-blob.txt');
        expect((error as BlobNotFoundError).containerName).toBe(TEST_CONTAINER);
      }
    });
  });
});
