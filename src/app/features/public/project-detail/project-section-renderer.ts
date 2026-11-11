import { Component, computed, input } from '@angular/core';
import type { PublicSection } from '../../../core/api/generated/types.gen';
import { PublicSectionMediaView } from './public-section-media';

@Component({
  selector: 'app-project-section-renderer',
  imports: [PublicSectionMediaView],
  templateUrl: './project-section-renderer.html',
  styleUrl: './project-section-renderer.scss',
})
export class ProjectSectionRenderer {
  readonly section = input.required<PublicSection>();
  readonly sequence = input(1);
  readonly mixedMedia = input(false);
  readonly media = computed(() => {
    const section = this.section();
    const type =
      section.section_type === 'VIDEO'
        ? 'VIDEO'
        : section.section_type === 'MODEL_3D'
          ? 'MODEL_3D'
          : 'IMAGE';
    const seen = new Set<string>();
    return section.media.filter((media) => {
      if ((!this.mixedMedia() && media.asset.type !== type) || seen.has(media.asset.url))
        return false;
      seen.add(media.asset.url);
      return true;
    });
  });
}
