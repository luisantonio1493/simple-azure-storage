import { Readable } from 'stream';
import { ProgressEvent } from '../types.js';

/**
 * Converts a readable stream to a Buffer
 * @param stream - The readable stream to convert
 * @param totalBytes - Optional total size for progress tracking
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to a Buffer with all stream data
 */
export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  totalBytes?: number,
  onProgress?: (progress: ProgressEvent) => void
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let loadedBytes = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    loadedBytes += buffer.length;

    if (onProgress) {
      const progress: ProgressEvent = {
        loadedBytes,
        totalBytes,
        percentComplete: totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : undefined,
      };
      onProgress(progress);
    }
  }

  return Buffer.concat(chunks);
}

/**
 * Converts a readable stream to a string
 * @param stream - The readable stream to convert
 * @param encoding - Character encoding (default: 'utf-8')
 * @param totalBytes - Optional total size for progress tracking
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to a string
 */
export async function streamToString(
  stream: NodeJS.ReadableStream,
  encoding: BufferEncoding = 'utf-8',
  totalBytes?: number,
  onProgress?: (progress: ProgressEvent) => void
): Promise<string> {
  const buffer = await streamToBuffer(stream, totalBytes, onProgress);
  return buffer.toString(encoding);
}

/**
 * Creates a readable stream from a Buffer
 * @param buffer - The Buffer to convert
 * @returns A readable stream
 */
export function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/**
 * Determines the content type based on file extension
 * @param filename - The filename or path
 * @returns The MIME content type or undefined if unknown
 */
export function getContentTypeFromExtension(filename: string): string | undefined {
  const ext = filename.toLowerCase().split('.').pop();

  const mimeTypes: Record<string, string> = {
    // Text
    'txt': 'text/plain',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'csv': 'text/csv',
    'xml': 'application/xml',

    // JavaScript/TypeScript
    'js': 'application/javascript',
    'mjs': 'application/javascript',
    'ts': 'application/typescript',
    'json': 'application/json',

    // Images
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'bmp': 'image/bmp',

    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    'zip': 'application/zip',
    'gz': 'application/gzip',
    'tar': 'application/x-tar',
    '7z': 'application/x-7z-compressed',
    'rar': 'application/vnd.rar',

    // Media
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'webm': 'video/webm',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',

    // Other
    'wasm': 'application/wasm',
    'md': 'text/markdown',
    'yaml': 'application/yaml',
    'yml': 'application/yaml',
  };

  return ext ? mimeTypes[ext] : undefined;
}
