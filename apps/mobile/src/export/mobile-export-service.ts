import type { MobileLocalRepository } from '../database/mobile-repository';
import { generateScreenplayPdf, type ExportMetadata } from '@film-studio/pagination';
import type { ScreenplayDocument, ScreenplayBlock } from '@film-studio/screenplay-model';

export interface MobileExportResult {
  readonly fileName: string;
  readonly mimeType: 'application/pdf' | 'text/plain';
  readonly sizeBytes: number;
  readonly contentData: Uint8Array;
}

export class MobileExportService {
  constructor(private readonly repo: MobileLocalRepository) {}

  /**
   * Generates a fully compliant, searchable PDF 1.4 binary stream with
   * watermark presets directly on the mobile device.
   */
  async exportScreenplayPdf(
    filmTitle: string,
    documentId: string,
    options: {
      watermark?: string;
      author?: string;
    } = {}
  ): Promise<MobileExportResult> {
    const scenes = await this.repo.listScenes(documentId);
    const astScenes = [];

    for (const sc of scenes) {
      const blocks = await this.repo.listBlocks(sc.id);
      const astBlocks: ScreenplayBlock[] = [
        {
          id: `00000000-0000-4000-8000-${Math.random().toString(16).substring(2, 14).padEnd(12, '0')}`,
          type: 'scene-heading',
          text: sc.heading,
          attributes: {},
        },
      ];

      for (const b of blocks) {
        let blockType: ScreenplayBlock['type'] = 'action';
        if (b.type === 'scene_heading') blockType = 'scene-heading';
        else if (b.type === 'character') blockType = 'character';
        else if (b.type === 'dialogue') blockType = 'dialogue';
        else if (b.type === 'parenthetical') blockType = 'parenthetical';
        else if (b.type === 'transition') blockType = 'transition';
        else if (b.type === 'shot') blockType = 'shot';

        astBlocks.push({
          id: `00000000-0000-4000-8000-${Math.random().toString(16).substring(2, 14).padEnd(12, '0')}`,
          type: blockType,
          text: b.text,
          attributes: {},
        });
      }

      astScenes.push({
        id: `00000000-0000-4000-8000-${Math.random().toString(16).substring(2, 14).padEnd(12, '0')}`,
        blocks: astBlocks,
      });
    }

    const docAst: ScreenplayDocument = {
      schemaVersion: 1,
      documentId: `00000000-0000-4000-8000-${Math.random().toString(16).substring(2, 14).padEnd(12, '0')}`,
      scenes: astScenes,
    };

    const meta: ExportMetadata = {
      title: filmTitle,
      author: options.author ?? 'StoryForge Studio Mobile',
      watermark: options.watermark ?? 'CONFIDENTIAL MOBILE DRAFT',
    };

    const pdfBytes = generateScreenplayPdf(docAst, meta);
    const sanitizedTitle = filmTitle.replace(/[^\p{L}\p{N}_-]/gu, '_');
    const fileName = `${sanitizedTitle}_Draft.pdf`;

    return {
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBytes.byteLength,
      contentData: pdfBytes,
    };
  }

  /**
   * Generates Fountain plaintext format for export/sharing
   */
  async exportScreenplayFountain(
    filmTitle: string,
    documentId: string
  ): Promise<MobileExportResult> {
    const scenes = await this.repo.listScenes(documentId);
    const lines: string[] = [`Title: ${filmTitle}\nDraft date: ${new Date().toLocaleDateString()}\n\n`];

    for (const sc of scenes) {
      lines.push(`${sc.heading}\n\n`);
      const blocks = await this.repo.listBlocks(sc.id);
      for (const b of blocks) {
        if (b.type === 'character') {
          lines.push(`\n${b.text.toUpperCase()}\n`);
        } else if (b.type === 'dialogue') {
          lines.push(`${b.text}\n\n`);
        } else if (b.type === 'parenthetical') {
          lines.push(`(${b.text.replace(/[()]/g, '')})\n`);
        } else {
          lines.push(`${b.text}\n\n`);
        }
      }
    }

    const contentStr = lines.join('');
    const encoder = new TextEncoder();
    const bytes = encoder.encode(contentStr);
    const sanitizedTitle = filmTitle.replace(/[^\p{L}\p{N}_-]/gu, '_');
    const fileName = `${sanitizedTitle}.fountain`;

    return {
      fileName,
      mimeType: 'text/plain',
      sizeBytes: bytes.byteLength,
      contentData: bytes,
    };
  }
}
