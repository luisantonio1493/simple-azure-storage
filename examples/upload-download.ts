/**
 * Upload and Download examples for simple-azure-storage
 *
 * This example demonstrates various upload and download scenarios
 * including file operations, progress tracking, and handling large files.
 */

import { SimpleBlobClient, ProgressEvent } from '../src';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const connectionString =
  process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';
const containerName = 'upload-download-examples';

async function main() {
  const client = new SimpleBlobClient(connectionString, containerName, {
    createContainerIfNotExists: true,
  });

  // Create temp directory for examples
  const tempDir = join(tmpdir(), 'blob-examples');
  mkdirSync(tempDir, { recursive: true });

  console.log('=== Upload from String ===\n');
  {
    await client.uploadFromString(
      'documents/readme.txt',
      'This is a readme file.\nWith multiple lines.'
    );
    console.log('Uploaded: documents/readme.txt');

    // With custom content type
    await client.uploadFromString('pages/index.html', '<html><body>Hello</body></html>', {
      contentType: 'text/html',
    });
    console.log('Uploaded: pages/index.html with custom content type');
  }

  console.log('\n=== Upload from Buffer ===\n');
  {
    // Simulate binary data (e.g., image)
    const binaryData = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG header
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52,
    ]);
    await client.uploadFromBuffer('images/sample.png', binaryData);
    console.log('Uploaded: images/sample.png (binary data)');
  }

  console.log('\n=== Upload from File ===\n');
  {
    // Create a local file
    const localFile = join(tempDir, 'local-document.txt');
    writeFileSync(localFile, 'Content from local file system.');

    await client.uploadFromFile('uploads/from-file.txt', localFile);
    console.log(`Uploaded: uploads/from-file.txt (from ${localFile})`);

    // Cleanup local file
    unlinkSync(localFile);
  }

  console.log('\n=== Upload with Metadata ===\n');
  {
    await client.uploadFromString('data/report.csv', 'id,name,value\n1,test,100', {
      contentType: 'text/csv',
      metadata: {
        author: 'Data Team',
        generated: new Date().toISOString(),
        version: '2.0',
      },
      tags: {
        department: 'analytics',
        confidential: 'false',
      },
    });
    console.log('Uploaded: data/report.csv with metadata and tags');

    const metadata = await client.getMetadata('data/report.csv');
    console.log('Metadata:', metadata.metadata);
  }

  console.log('\n=== Upload with Progress Tracking ===\n');
  {
    // Create larger content for progress demonstration
    const largeContent = 'X'.repeat(50000); // 50KB

    await client.uploadFromString('large/data.txt', largeContent, {
      onProgress: (progress: ProgressEvent) => {
        const percent = progress.percentComplete ?? 0;
        console.log(`Upload progress: ${percent}% (${progress.loadedBytes} bytes)`);
      },
    });
    console.log('Upload complete!');
  }

  console.log('\n=== Download as String ===\n');
  {
    const content = await client.downloadAsString('documents/readme.txt');
    console.log('Downloaded content:');
    console.log(content);
  }

  console.log('\n=== Download as Buffer ===\n');
  {
    const buffer = await client.downloadAsBuffer('images/sample.png');
    console.log(`Downloaded buffer: ${buffer.length} bytes`);
    console.log(`First 8 bytes: ${buffer.slice(0, 8).toString('hex')}`);
  }

  console.log('\n=== Download to File ===\n');
  {
    const downloadPath = join(tempDir, 'downloaded', 'readme.txt');
    await client.downloadToFile('documents/readme.txt', downloadPath);
    console.log(`Downloaded to: ${downloadPath}`);

    // Verify
    const { readFileSync } = await import('fs');
    const fileContent = readFileSync(downloadPath, 'utf-8');
    console.log(
      `File content (${fileContent.length} bytes): ${fileContent.substring(0, 50)}...`
    );
  }

  console.log('\n=== Download with Progress Tracking ===\n');
  {
    await client.downloadAsBuffer('large/data.txt', {
      onProgress: (progress: ProgressEvent) => {
        const percent = progress.percentComplete ?? 0;
        console.log(`Download progress: ${percent}% (${progress.loadedBytes} bytes)`);
      },
    });
    console.log('Download complete!');
  }

  console.log('\n=== Partial Download (Range) ===\n');
  {
    // Download only first 10 bytes
    const partial = await client.downloadAsBuffer('large/data.txt', {
      range: { start: 0, end: 9 },
    });
    console.log(`Partial download: ${partial.length} bytes`);
    console.log(`Content: "${partial.toString()}"`);
  }

  console.log('\n=== JSON Round-trip ===\n');
  {
    interface UserData {
      id: number;
      name: string;
      email: string;
      preferences: {
        theme: string;
        notifications: boolean;
      };
    }

    const user: UserData = {
      id: 12345,
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    };

    await client.uploadJson('users/12345.json', user);
    console.log('Uploaded user data');

    const downloaded = await client.downloadAsJson<UserData>('users/12345.json');
    console.log('Downloaded user:', downloaded);
    console.log('Type-safe access:', downloaded.preferences.theme);
  }

  console.log('\n=== Cleanup ===\n');
  {
    const blobs = await client.list();
    for (const blob of blobs) {
      await client.delete(blob.name);
      console.log(`Deleted: ${blob.name}`);
    }
  }

  console.log('\nAll examples completed!');
}

main().catch(console.error);
