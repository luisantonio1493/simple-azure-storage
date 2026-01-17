# simple-azure-storage (Espanol)

Un wrapper en TypeScript que simplifica las operaciones de Azure Blob Storage reduciendo el boilerplate de ~15 lineas a 1 linea para tareas comunes.

Construido sobre el SDK oficial `@azure/storage-blob` con una API amigable para developers.

## Instalacion

```bash
npm install simple-azure-storage
```

## Inicio rapido

```typescript
import { SimpleBlobClient } from "simple-azure-storage";

const client = new SimpleBlobClient(
  "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net",
  "mi-contenedor",
);

await client.uploadFromString("hola.txt", "Hola mundo");
const contenido = await client.downloadAsString("hola.txt");
console.log(contenido);
```

## Autenticacion

- Cadena de conexion: `new SimpleBlobClient(connectionString, containerName)`
- Identidad administrada: `new SimpleBlobClient(accountName, containerName)`
- Credencial personalizada: `new SimpleBlobClient(accountName, containerName, credential)`

## Manejo de errores

```typescript
import { BlobNotFoundError } from "simple-azure-storage";

try {
  await client.downloadAsString("missing.txt");
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.log("Blob no encontrado");
  }
}
```

## Troubleshooting

### "Container not found" error

Habilita la creacion automatica:

```typescript
const client = new SimpleBlobClient(connectionString, "my-container", {
  createContainerIfNotExists: true,
});
```

### "Blob index tags not supported" error

Pasa `includeTags: false` al llamar `getMetadata()`:

```typescript
const metadata = await client.getMetadata("file.txt", { includeTags: false });
```

### Authentication fails with DefaultAzureCredential

Asegurate de tener configurado uno de estos:

- Variables de entorno (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`)
- Azure CLI con login (`az login`)
- Identidad administrada habilitada (cuando corres en Azure)

Ver [DefaultAzureCredential documentation](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/defaultazurecredential) para mas detalles.
