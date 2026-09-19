import { Injectable } from '@nestjs/common';
import type { DocumentChunk } from './document-chunk.js';

@Injectable()
export class MarkdownDocumentChunkerService {
  chunk(source: string, markdown: string): DocumentChunk[] {
    const lines = markdown.split(/\r?\n/);
    const chunks: DocumentChunk[] = [];

    let currentSection: string | undefined;
    let currentLines: string[] = [];

    const flush = (): void => {
      const body = currentLines.join('\n').trim();

      if (!body) {
        currentLines = [];
        return;
      }

      const section = currentSection ?? 'Document Overview';
      const heading = currentSection ? `# ${currentSection}\n\n` : '';

      chunks.push({
        id: `${this.removeExtension(source)}#${this.slugify(section)}`,
        source,
        section,
        text: `${heading}${body}`,
      });

      currentLines = [];
    };

    for (const line of lines) {
      const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

      if (headingMatch) {
        flush();
        currentSection = headingMatch[2];
        continue;
      }

      currentLines.push(line);
    }

    flush();

    return chunks;
  }

  private removeExtension(filename: string): string {
    return filename.replace(/\.[^.]+$/, '');
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
