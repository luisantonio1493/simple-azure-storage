# simple-azure-storage

A TypeScript wrapper that simplifies Azure Blob Storage operations by reducing boilerplate from ~15 lines to 1 line for common tasks.

Built on top of the official `@azure/storage-blob` SDK with a developer-friendly API.

## Features

- **Simple API** - Intuitive methods for common operations
- **TypeScript Native** - Full type safety and IntelliSense support
- **Multiple Auth Methods** - Connection string, managed identity, or custom credentials
- **Streaming Support** - Efficient handling of large files
- **Custom Errors** - Clear, actionable error messages
- **Progress Tracking** - Built-in upload/download progress callbacks
- **Escape Hatch** - Access underlying SDK client for advanced scenarios

## Installation

```bash
npm install simple-azure-storage
```

## Quick Start

```typescript
import { SimpleBlobClient } from 'simple-azure-storage';

// Using connection string
const client = new SimpleBlobClient(
  'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
  'my-container'
);

// Upload and download in one line
await client.uploadFromString('hello.txt', 'Hello World!');
const content = await client.downloadAsString('hello.txt');
console.log(content); // "Hello World!"
```

## Authentication

### Connection String

```typescript
const client = new SimpleBlobClient(
  'DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=...;EndpointSuffix=core.windows.net',
  'my-container'
);
```

### Managed Identity (Azure Services)

```typescript
// Uses DefaultAzureCredential - automatically detects environment
const client = new SimpleBlobClient('myaccount', 'my-container');
```

### Custom Credentials

#### Azure AD (Service Principal)

```typescript
import { ClientSecretCredential } from '@azure/identity';

const credential = new ClientSecretCredential('tenant-id', 'client-id', 'client-secret');

const client = new SimpleBlobClient('myaccount', 'my-container', credential);
```

#### Account Key (StorageSharedKeyCredential)

```typescript
import { StorageSharedKeyCredential } from '@azure/storage-blob';

const credential = new StorageSharedKeyCredential('myaccount', 'accountKey...');

const client = new SimpleBlobClient('myaccount', 'my-container', credential);
```

### SAS URL (Shared Access Signature)

```typescript
// Account-level SAS URL from Azure Portal or generated programmatically
const client = new SimpleBlobClient(
  'https://myaccount.blob.core.windows.net?sv=2021-08-06&ss=b&srt=sco&sp=rwdlacx&sig=...',
  'my-container'
);

// Container-level SAS URL (URL already includes container path)
// Useful when you have a SAS token scoped to a specific container
const client = new SimpleBlobClient(
  'https://myaccount.blob.core.windows.net/my-container?sv=2021-08-06&sr=c&sp=rwdl&sig=...',
  'my-container'
);

// Note: This wrapper operates at the container level
// For blob-specific operations, use the underlying Azure SDK's BlobClient
```

### Account URL with Credential

```typescript
import { ClientSecretCredential } from '@azure/identity';

const credential = new ClientSecretCredential('tenant-id', 'client-id', 'client-secret');

// Using full account URL
const client = new SimpleBlobClient(
  'https://myaccount.blob.core.windows.net',
  'my-container',
  credential
);
```

### Development (Azurite)

```typescript
const client = new SimpleBlobClient('UseDevelopmentStorage=true', 'my-container');
```

For Azurite path-style endpoints:

```typescript
const client = new SimpleBlobClient(
  'http://127.0.0.1:10000/devstoreaccount1',
  'my-container'
);
```

If you need path-style endpoints on non-local hosts (e.g., Azure Stack), pass:

```typescript
const client = new SimpleBlobClient(
  'https://my-azure-stack.example.com/account/container',
  'container',
  { allowPathStyleEndpoints: true }
);
```

## API Reference

### Upload Methods

#### `uploadFromString(blobName, content, options?)`

Upload a string to a blob.

```typescript
await client.uploadFromString('notes.txt', 'Hello World', {
  contentType: 'text/plain',
  metadata: { author: 'John' },
  tags: { env: 'prod' },
  overwrite: false, // Fail if blob exists
});
```

#### `uploadFromBuffer(blobName, buffer, options?)`

Upload a Buffer to a blob.

```typescript
const buffer = Buffer.from('binary data');
await client.uploadFromBuffer('data.bin', buffer, {
  contentType: 'application/octet-stream',
});
```

#### `uploadFromFile(blobName, filePath, options?)`

Upload a file from the filesystem.

```typescript
await client.uploadFromFile('documents/report.pdf', './local/report.pdf', {
  onProgress: (event) => {
    console.log(`Progress: ${event.percentComplete}%`);
  },
});
```

#### `uploadJson(blobName, data, options?)`

Serialize and upload JSON data.

```typescript
await client.uploadJson('config.json', {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
});
```

### Download Methods

#### `downloadAsString(blobName, encoding?)`

Download a blob as a string.

```typescript
const text = await client.downloadAsString('notes.txt');
const utf16 = await client.downloadAsString('data.txt', 'utf16le');
```

#### `downloadAsBuffer(blobName, options?)`

Download a blob as a Buffer.

```typescript
const buffer = await client.downloadAsBuffer('image.png', {
  onProgress: (event) => {
    console.log(`Downloaded: ${event.loadedBytes} bytes`);
  },
});
```

#### `downloadToFile(blobName, filePath, options?)`

Download a blob directly to a file.

```typescript
await client.downloadToFile('backup.zip', './downloads/backup.zip', {
  range: { start: 0, end: 1023 }, // Download first 1KB
});
```

#### `downloadAsJson<T>(blobName)`

Download and parse JSON data.

```typescript
interface Config {
  apiUrl: string;
  timeout: number;
}

const config = await client.downloadAsJson<Config>('config.json');
console.log(config.apiUrl);
```

### Utility Methods

#### `exists(blobName)`

Check if a blob exists.

```typescript
if (await client.exists('config.json')) {
  console.log('Config file found');
}
```

#### `delete(blobName)`

Delete a blob.

```typescript
await client.delete('old-file.txt');
```

#### `list(prefix?, maxResults?)`

List blobs in the container.

```typescript
// List all blobs
const allBlobs = await client.list();

// List blobs in a folder
const documents = await client.list('documents/');

// Get first 10 blobs
const firstTen = await client.list(undefined, 10);

allBlobs.forEach((blob) => {
  console.log(`${blob.name} - ${blob.size} bytes`);
});
```

#### `getMetadata(blobName, options?)`

Get blob metadata and properties.

```typescript
const metadata = await client.getMetadata('document.pdf', {
  includeTags: true, // Optional, default false
});

console.log(metadata.contentLength); // Size in bytes
console.log(metadata.lastModified); // Last modified date
console.log(metadata.metadata); // Custom metadata
console.log(metadata.tags); // Blob index tags (if includeTags: true)
```

#### `setMetadata(blobName, metadata)`

Update blob metadata.

```typescript
await client.setMetadata('document.pdf', {
  author: 'Jane Doe',
  version: '2.0',
  reviewed: 'true',
});
```

#### `getContainerClient()`

Get the underlying Azure SDK ContainerClient for advanced operations.

```typescript
const containerClient = client.getContainerClient();
// Use for operations not covered by SimpleBlobClient
await containerClient.setAccessPolicy('blob');
```

## Upload Options

```typescript
interface UploadOptions {
  contentType?: string; // MIME type (auto-detected from extension if not provided)
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  overwrite?: boolean; // Default: true
  onProgress?: (event: ProgressEvent) => void;
}
```

## Download Options

```typescript
interface DownloadOptions {
  range?: { start: number; end: number };
  onProgress?: (event: ProgressEvent) => void;
}
```

## Error Handling

The library provides specific error types for different failure scenarios:

```typescript
import {
  BlobNotFoundError,
  ContainerNotFoundError,
  AuthenticationError,
  BlobUploadError,
  BlobDownloadError,
  ContainerOperationError,
} from 'simple-azure-storage';

try {
  await client.downloadAsString('missing.txt');
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.log(`Blob not found: ${error.blobName}`);
  } else if (error instanceof ContainerNotFoundError) {
    console.log(`Container not found: ${error.containerName}`);
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication failed');
  } else {
    console.log('Unknown error:', error);
  }
}
```

## Client Options

```typescript
interface SimpleBlobClientOptions {
  createContainerIfNotExists?: boolean; // Auto-create container on upload
}

const client = new SimpleBlobClient(connectionString, 'my-container', {
  createContainerIfNotExists: true,
});
```

## Examples

### Upload Multiple Files

```typescript
const files = ['doc1.txt', 'doc2.txt', 'doc3.txt'];

for (const file of files) {
  await client.uploadFromFile(`backup/${file}`, `./local/${file}`, {
    onProgress: (e) => console.log(`${file}: ${e.percentComplete}%`),
  });
}
```

### Conditional Upload

```typescript
// Only upload if blob doesn't exist
try {
  await client.uploadFromString('data.txt', 'content', {
    overwrite: false,
  });
} catch (error) {
  if (error.message.includes('BlobAlreadyExists')) {
    console.log('File already exists, skipping upload');
  }
}
```

### List and Download

```typescript
const blobs = await client.list('reports/2024/');

for (const blob of blobs) {
  await client.downloadToFile(blob.name, `./downloads/${blob.name.split('/').pop()}`);
}
```

### Backup with Metadata

```typescript
const data = { users: [...], settings: {...} };

await client.uploadJson('backup.json', data, {
  metadata: {
    backupDate: new Date().toISOString(),
    version: '1.0'
  }
});

// Later, retrieve metadata
const meta = await client.getMetadata('backup.json');
console.log(`Backup from: ${meta.metadata.backupDate}`);
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run integration tests (requires Azurite)
npm run test:integration

# Lint
npm run lint

# Format code
npm run format
```

## Testing

Unit tests use mocked Azure SDK:

```bash
npm test
```

Integration tests require Azurite emulator:

```bash
# Start Azurite
docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0

# Run integration tests
npm run test:integration
```

## License

MIT

## Contributing

Issues and pull requests are welcome. Please open an issue to discuss major changes before submitting a PR.

## Release

To publish a release:

```bash
npm version patch
# or minor / major

git push --follow-tags
```

Pushing a tag like `v1.2.3` triggers the GitHub Actions workflow to publish to npm.

## Espanol

A continuacion se encuentra una version breve en espanol para referencia rapida. Para npm, la seccion en ingles es la principal.

Nota: esta seccion esta escrita en ASCII a proposito para mantener compatibilidad amplia.

### Instalacion

```bash
npm install simple-azure-storage
```

### Inicio rapido

```typescript
import { SimpleBlobClient } from 'simple-azure-storage';

const client = new SimpleBlobClient(
  'DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net',
  'mi-contenedor'
);

await client.uploadFromString('hola.txt', 'Hola mundo');
const contenido = await client.downloadAsString('hola.txt');
console.log(contenido);
```

### Autenticacion

- Cadena de conexion: `new SimpleBlobClient(connectionString, containerName)`
- Identidad administrada: `new SimpleBlobClient(accountName, containerName)`
- Credencial personalizada: `new SimpleBlobClient(accountName, containerName, credential)`

### Manejo de errores

```typescript
import { BlobNotFoundError } from 'simple-azure-storage';

try {
  await client.downloadAsString('missing.txt');
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.log('Blob no encontrado');
  }
}
```

## Troubleshooting

### "Container not found" error

Enable auto-creation:

```typescript
const client = new SimpleBlobClient(connectionString, 'my-container', {
  createContainerIfNotExists: true,
});
```

### "Blob index tags not supported" error

Pass `includeTags: false` when calling `getMetadata()`:

```typescript
const metadata = await client.getMetadata('file.txt', { includeTags: false });
```

### Authentication fails with DefaultAzureCredential

Ensure you have one of these configured:

- Environment variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`)
- Azure CLI logged in (`az login`)
- Managed Identity enabled (when running in Azure)

See [DefaultAzureCredential documentation](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/defaultazurecredential) for details.
