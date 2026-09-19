import { Injectable } from '@nestjs/common';
import type { DocumentSearchResult } from './document-chunk.js';

@Injectable()
export class RagContextBuilderService {
  build(results: DocumentSearchResult[]): string {
    if (results.length === 0) {
      return [
        'Retrieved maintenance knowledge:',
        '',
        'No relevant document chunks were retrieved.',
      ].join('\n');
    }

    const chunks = results.map((result, index) => {
      const section = result.chunk.section ?? 'Unspecified';

      return [
        `--- Retrieved chunk ${index + 1} ---`,
        `Source: ${result.chunk.source}`,
        `Section: ${section}`,
        '',
        result.chunk.text.trim(),
        `--- End retrieved chunk ${index + 1} ---`,
      ].join('\n');
    });

    return ['Retrieved maintenance knowledge:', '', ...chunks].join('\n\n');
  }
}
