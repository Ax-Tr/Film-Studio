/**
 * iOS Document Sharing & Native AirDrop/Files Export Service
 *
 * Extends mobile export capabilities for iOS with native sharing sheets:
 * - PDF 1.4 deterministic generation with confidential watermark presets
 * - Fountain screenplay plain text export
 * - AirDrop / Files app metadata and UTI (Uniform Type Identifier) support
 *   (e.g., `com.adobe.pdf` and `public.utf8-plain-text`)
 * - Document activity controller metadata preparation
 */

import type { MobileLocalRepository } from '../database/mobile-repository';
import { MobileExportService, type MobileExportResult } from './mobile-export-service';

export interface IosShareSheetPayload {
  readonly fileName: string;
  readonly mimeType: string;
  readonly uti: 'com.adobe.pdf' | 'public.utf8-plain-text';
  readonly sizeBytes: number;
  readonly contentData: Uint8Array;
  readonly shareTitle: string;
}

export class IosExportShareService {
  private baseExportService: MobileExportService;

  constructor(private readonly repo: MobileLocalRepository) {
    this.baseExportService = new MobileExportService(repo);
  }

  /**
   * Generates a PDF 1.4 binary export packaged with iOS AirDrop/Files metadata
   */
  async prepareIosPdfShare(
    filmTitle: string,
    documentId: string,
    options: {
      watermark?: string;
      author?: string;
    } = {}
  ): Promise<IosShareSheetPayload> {
    const exportResult: MobileExportResult = await this.baseExportService.exportScreenplayPdf(
      filmTitle,
      documentId,
      options
    );

    return {
      fileName: exportResult.fileName,
      mimeType: exportResult.mimeType,
      uti: 'com.adobe.pdf',
      sizeBytes: exportResult.sizeBytes,
      contentData: exportResult.contentData,
      shareTitle: `${filmTitle} - Screenplay Draft (PDF)`,
    };
  }

  /**
   * Generates a Fountain plain text export formatted for iOS AirDrop/Files
   */
  async prepareIosFountainShare(
    filmTitle: string,
    documentId: string
  ): Promise<IosShareSheetPayload> {
    const exportResult: MobileExportResult = await this.baseExportService.exportScreenplayFountain(
      filmTitle,
      documentId
    );

    return {
      fileName: exportResult.fileName,
      mimeType: exportResult.mimeType,
      uti: 'public.utf8-plain-text',
      sizeBytes: exportResult.sizeBytes,
      contentData: exportResult.contentData,
      shareTitle: `${filmTitle} - Fountain Script`,
    };
  }
}

