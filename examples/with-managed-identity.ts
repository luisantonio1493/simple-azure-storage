/**
 * Managed Identity example for simple-azure-storage
 *
 * This example demonstrates how to use Azure Managed Identity
 * (DefaultAzureCredential) for authentication instead of connection strings.
 *
 * This is the recommended approach for production Azure deployments
 * (App Service, Azure Functions, AKS, VMs with managed identity, etc.)
 */

import { SimpleBlobClient } from '../src';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

// Your storage account name (without .blob.core.windows.net)
const accountName = process.env.AZURE_STORAGE_ACCOUNT || 'mystorageaccount';
const containerName = 'my-container';

async function usingDefaultCredential() {
  console.log('=== Using DefaultAzureCredential ===\n');

  // DefaultAzureCredential will try multiple authentication methods:
  // 1. Environment variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET)
  // 2. Managed Identity (when running in Azure)
  // 3. Azure CLI credentials (when running locally)
  // 4. Azure PowerShell credentials
  // 5. Visual Studio Code credentials

  // Simply pass account name without credential - DefaultAzureCredential is used automatically
  const client = new SimpleBlobClient(accountName, containerName);

  // Now use the client normally
  await client.uploadFromString(
    'managed-identity-test.txt',
    'Hello from Managed Identity!'
  );
  console.log('Uploaded successfully with DefaultAzureCredential');

  const content = await client.downloadAsString('managed-identity-test.txt');
  console.log(`Downloaded content: "${content}"`);

  await client.delete('managed-identity-test.txt');
  console.log('Cleaned up test file');
}

async function usingCustomCredential() {
  console.log('\n=== Using Custom Credential ===\n');

  // You can also pass a specific credential if needed
  const credential = new ManagedIdentityCredential();

  const client = new SimpleBlobClient(accountName, containerName, credential);

  // Use the client
  const exists = await client.exists('some-file.txt');
  console.log(`File exists: ${exists}`);
}

async function usingUserAssignedManagedIdentity() {
  console.log('\n=== Using User-Assigned Managed Identity ===\n');

  // For user-assigned managed identity, specify the client ID
  const clientId = process.env.AZURE_CLIENT_ID;

  if (!clientId) {
    console.log('AZURE_CLIENT_ID not set, skipping user-assigned identity example');
    return;
  }

  const credential = new ManagedIdentityCredential(clientId);
  const client = new SimpleBlobClient(accountName, containerName, credential);

  const blobs = await client.list();
  console.log(`Found ${blobs.length} blobs`);
}

async function main() {
  console.log('Managed Identity Examples\n');
  console.log(`Storage Account: ${accountName}`);
  console.log(`Container: ${containerName}\n`);

  try {
    await usingDefaultCredential();
    await usingCustomCredential();
    await usingUserAssignedManagedIdentity();
  } catch (error) {
    console.error('Error:', error);
    console.log('\nNote: This example requires:');
    console.log('  1. A valid Azure Storage account');
    console.log('  2. Proper RBAC permissions (Storage Blob Data Contributor role)');
    console.log('  3. Azure CLI login (az login) for local development');
    console.log('  4. Or running in Azure with Managed Identity enabled');
  }
}

main().catch(console.error);
