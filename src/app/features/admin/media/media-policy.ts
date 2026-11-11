import type { MediaType, UploadRequest } from '../../../core/api/generated/types.gen';
import { STL_MAX_BYTES } from '../../../shared/utils/stl-conversion';
// UX defaults from backend upload_policy.py / Settings. Presign max_file_size is authoritative.
const MiB = 1024 * 1024;
// Source-only format. MediaUpload converts it before requesting any backend authorization.
export const STL_SOURCE_MAX = STL_MAX_BYTES;
export function isStl(file: File): boolean {
  return /\.stl$/i.test(file.name);
}
export const MEDIA_FORMATS = [
  { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', type: 'IMAGE', max: 20 * MiB },
  { extensions: ['png'], mime: 'image/png', type: 'IMAGE', max: 20 * MiB },
  { extensions: ['webp'], mime: 'image/webp', type: 'IMAGE', max: 20 * MiB },
  { extensions: ['avif'], mime: 'image/avif', type: 'IMAGE', max: 20 * MiB },
  { extensions: ['pdf'], mime: 'application/pdf', type: 'PDF', max: 50 * MiB },
  { extensions: ['glb'], mime: 'model/gltf-binary', type: 'MODEL_3D', max: 100 * MiB },
  { extensions: ['mp4'], mime: 'video/mp4', type: 'VIDEO', max: 512 * MiB },
  { extensions: ['webm'], mime: 'video/webm', type: 'VIDEO', max: 512 * MiB },
] as const;
export const MEDIA_ACCEPT = [
  ...MEDIA_FORMATS.flatMap((f) => f.extensions.map((ext) => '.' + ext)),
  '.stl',
].join(',');
export const MEDIA_TYPES: readonly { value: MediaType; label: string }[] = [
  { value: 'IMAGE', label: 'Imagen' },
  { value: 'VIDEO', label: 'Vídeo' },
  { value: 'PDF', label: 'PDF' },
  { value: 'MODEL_3D', label: 'Modelo 3D' },
  { value: 'DOCUMENT', label: 'Documento' },
];
export function validateFile(file: File): UploadRequest {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format = MEDIA_FORMATS.find((f) => f.extensions.some((ext) => ext === extension));
  const stl = isStl(file);
  if (
    (!format && !stl) ||
    (format && file.type && file.type !== format.mime) ||
    (stl &&
      ![
        '',
        'model/stl',
        'application/sla',
        'application/vnd.ms-pki.stl',
        'application/octet-stream',
      ].includes(file.type))
  )
    throw new Error('Formato no admitido. Usa JPEG, PNG, WebP, AVIF, PDF, GLB, STL, MP4 o WebM.');
  if (
    !file.name.trim() ||
    file.name.length > 255 ||
    /[\\/]/.test(file.name) ||
    file.name.includes(String.fromCharCode(0))
  )
    throw new Error('El nombre del archivo no es válido.');
  const maximum = stl ? STL_SOURCE_MAX : format!.max;
  if (file.size < 1 || file.size > maximum)
    throw new Error(
      'El archivo debe tener contenido y no superar ' + maximum / MiB + ' MiB para este formato.',
    );
  // Browsers may leave MIME blank for GLB; derive the declared MIME from the verified extension.
  return {
    original_filename: file.name,
    mime_type: stl ? 'model/stl' : file.type || format!.mime,
    file_size: file.size,
    access: 'private',
  };
}
export function fileSize(bytes: number): string {
  return bytes < MiB ? (bytes / 1024).toFixed(1) + ' KiB' : (bytes / MiB).toFixed(1) + ' MiB';
}

export const MEDIA_UPLOAD_LIMITS = MEDIA_FORMATS.filter(
  (format, index, formats) => formats.findIndex((item) => item.type === format.type) === index,
)
  .map(
    (format) =>
      (MEDIA_TYPES.find((type) => type.value === format.type)?.label ?? format.type) +
      ' · ' +
      fileSize(format.max),
  )
  .join(' / ');

export function mediaTypeLabel(type: MediaType): string {
  return MEDIA_TYPES.find((item) => item.value === type)?.label ?? 'Archivo';
}
