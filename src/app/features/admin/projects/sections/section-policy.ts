import type {
  MediaResponse,
  MediaType,
  SectionType,
} from '../../../../core/api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-error';
import { projectError } from '../project-errors';
type Policy = { label: string; media: MediaType | null; maximum: number; text: boolean };
export const SECTION_POLICY: Record<SectionType, Policy> = {
  TEXT: { label: 'Texto', media: null, maximum: 0, text: true },
  IMAGE: { label: 'Imagen', media: 'IMAGE', maximum: 1, text: false },
  GALLERY: { label: 'Galería de imágenes', media: 'IMAGE', maximum: 100, text: false },
  VIDEO: { label: 'Video', media: 'VIDEO', maximum: 1, text: false },
  MODEL_3D: { label: 'Modelo 3D', media: 'MODEL_3D', maximum: 1, text: false },
  QUOTE: { label: 'Cita destacada', media: null, maximum: 0, text: true },
  SPLIT: { label: 'Imagen y texto', media: 'IMAGE', maximum: 1, text: true },
};
export const SECTION_TYPES = Object.keys(SECTION_POLICY) as SectionType[];
export const EDITABLE_SECTION_TYPES: readonly SectionType[] = ['TEXT', 'GALLERY', 'MODEL_3D'];
export function compatible(type: SectionType, asset: MediaResponse): boolean {
  return (
    asset.type === SECTION_POLICY[type].media &&
    (type !== 'MODEL_3D' || asset.mime_type === 'model/gltf-binary')
  );
}
export function sectionError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400)
    return 'Revisa el contenido y los archivos compatibles. Una sección visible debe estar completa; texto y cita no admiten archivos.';
  if (error instanceof ApiError && error.status === 409)
    return 'La sección o relación entra en conflicto con el estado actual. Revisa los datos antes de reintentar.';
  return projectError(error);
}
