/**
 * Basic usage example for simple-azure-storage
 *
 * This example demonstrates common blob operations using a connection string.
 */

import { SimpleBlobClient, BlobNotFoundError } from '../src';

// Replace with your actual connection string
const connectionString =
  process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true';
const containerName = 'my-container';

async function main() {
  // Create client with connection string
  const client = new SimpleBlobClient(connectionString, containerName, {
    createContainerIfNotExists: true,
  });

  console.log('=== Basic String Operations ===\n');

  // Upload a string
  await client.uploadFromString('hello.txt', 'Hello, Azure Blob Storage!');
  console.log('Uploaded: hello.txt');

  // Download as string
  const content = await client.downloadAsString('hello.txt');
  console.log(`Downloaded content: "${content}"`);

  console.log('\n=== JSON Operations ===\n');

  // Upload JSON data
  const config = {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    features: {
      logging: true,
      caching: false,
    },
  };
  await client.uploadJson('config.json', config);
  console.log('Uploaded: config.json');

  // Download and parse JSON
  interface Config {
    apiUrl: string;
    timeout: number;
    features: { logging: boolean; caching: boolean };
  }
  const downloadedConfig = await client.downloadAsJson<Config>('config.json');
  console.log('Downloaded config:', downloadedConfig);

  console.log('\n=== List Blobs ===\n');

  // List all blobs
  const blobs = await client.list();
  console.log('Blobs in container:');
  for (const blob of blobs) {
    console.log(`  - ${blob.name} (${blob.size} bytes, ${blob.contentType})`);
  }

  console.log('\n=== Check Existence ===\n');

  // Check if blob exists
  const exists = await client.exists('hello.txt');
  console.log(`hello.txt exists: ${exists}`);

  const notExists = await client.exists('nonexistent.txt');
  console.log(`nonexistent.txt exists: ${notExists}`);

  console.log('\n=== Metadata Operations ===\n');

  // Set metadata
  await client.setMetadata('hello.txt', {
    author: 'Example Script',
    version: '1.0',
  });
  console.log('Set metadata on hello.txt');

  // Get metadata
  const metadata = await client.getMetadata('hello.txt');
  console.log('Metadata:', metadata);

  console.log('\n=== Error Handling ===\n');

  // Handle blob not found
  try {
    await client.downloadAsString('does-not-exist.txt');
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      console.log(`Caught BlobNotFoundError: ${error.message}`);
    }
  }

  console.log('\n=== Cleanup ===\n');

  // Delete blobs
  await client.delete('hello.txt');
  console.log('Deleted: hello.txt');

  await client.delete('config.json');
  console.log('Deleted: config.json');

  console.log('\nDone!');
}

main().catch(console.error);
