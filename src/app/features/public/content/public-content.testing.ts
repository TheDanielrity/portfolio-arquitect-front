import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import type {
  PublicProfile,
  PublicSetting,
  PublicService,
  PublicSocialLink,
} from '../../../core/api/generated/types.gen';
export const profileFixture: PublicProfile = {
  first_name: 'Test',
  last_name: 'Architect',
  professional_title: 'Architect',
  short_bio: 'A public introduction.',
  biography: 'A public biography.',
  email: 'studio@example.test',
  phone: '+51 123456789',
  location: 'Test location',
  profile_media: null,
  cv_media: null,
};
export function emptyPublicContentApi() {
  return {
    profile: () => throwError(() => new ApiError(404, null, [], null, null)),
    allServices: () => of([] as PublicService[]),
    allSocialLinks: () => of([] as PublicSocialLink[]),
    settings: () => of([{ key: 'contact_enabled', value: false }] as PublicSetting[]),
    contact: () => of({ detail: 'Message received' as const }),
  };
}
