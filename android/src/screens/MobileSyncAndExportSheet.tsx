import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MobileSyncCoordinator, type RemoteSyncClient } from '../sync/mobile-sync-coordinator';
import { MobileExportService, type MobileExportResult } from '../export/mobile-export-service';
import type { MobileLocalRepository, MobileConflictRecord } from '../database/mobile-repository';

export interface MobileSyncAndExportProps {
  readonly filmId: string;
  readonly filmTitle: string;
  readonly documentId?: string;
  readonly repo: MobileLocalRepository;
  readonly onBack: () => void;
}

export function MobileSyncAndExportSheet({
  filmId,
  filmTitle,
  documentId,
  repo,
  onBack,
}: MobileSyncAndExportProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{
    serverRevision: number;
    pendingCount: number;
    conflictCount: number;
  }>({ serverRevision: 0, pendingCount: 0, conflictCount: 0 });
  const [conflicts, setConflicts] = useState<MobileConflictRecord[]>([]);
  const [exportResult, setExportResult] = useState<MobileExportResult | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  // In-device remote client stub (or real API client)
  const remoteClient: RemoteSyncClient = {
    pushOperations: async (_fId, ops) => {
      return ops.map((op) => ({
        opId: op.opId,
        status: 'applied',
        serverRevision: 100 + op.deviceSeq,
      }));
    },
    pullOperations: async () => {
      return { serverRevision: 100, operations: [] };
    },
  };

  const coordinator = new MobileSyncCoordinator(filmId, repo, remoteClient);
  const exportService = new MobileExportService(repo);

  const loadStatus = useCallback(async () => {
    const st = await coordinator.getSyncState();
    const confList = await repo.listConflicts(filmId);
    setSyncInfo({
      serverRevision: st.lastServerRevision,
      pendingCount: st.pendingOutboxCount,
      conflictCount: st.unresolvedConflictCount,
    });
    setConflicts(confList.filter((c) => c.resolution_status === 'unresolved'));
  }, [coordinator, filmId, repo]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSyncNow = async () => {
    setSyncing(true);
    await coordinator.synchronize();
    await loadStatus();
    setSyncing(false);
  };

  const handleResolveConflict = async (conflictId: string, choice: 'keep_local' | 'keep_remote') => {
    await coordinator.resolveConflict(conflictId, choice);
    await loadStatus();
  };

  const handleExportPdf = async () => {
    if (!documentId) return;
    setExporting(true);
    const res = await exportService.exportScreenplayPdf(filmTitle, documentId, {
      watermark: 'CONFIDENTIAL PREVIEW (MOBILE)',
    });
    setExportResult(res);
    setExporting(false);
    setExportModalVisible(true);
  };

  const handleExportFountain = async () => {
    if (!documentId) return;
    setExporting(true);
    const res = await exportService.exportScreenplayFountain(filmTitle, documentId);
    setExportResult(res);
    setExporting(false);
    setExportModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backBtnText}>← Close</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Sync & Export Center</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.content}>
        {/* Sync Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>OFFLINE SYNC STATUS</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Server Revision:</Text>
            <Text style={styles.statusValue}>rev-{syncInfo.serverRevision}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Queued Outbox Mutations:</Text>
            <Text style={styles.statusValue}>{syncInfo.pendingCount} pending</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Active Conflicts:</Text>
            <Text style={[styles.statusValue, syncInfo.conflictCount > 0 && styles.conflictAlert]}>
              {syncInfo.conflictCount} conflicts
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.disabledBtn]}
            onPress={handleSyncNow}
            disabled={syncing}
            accessibilityRole="button"
          >
            {syncing ? (
              <ActivityIndicator color="#0b0e14" />
            ) : (
              <Text style={styles.syncButtonText}>Sync Now (Push / Pull)</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Conflicts List */}
        {conflicts.length > 0 ? (
          <View style={styles.card}>
            <Text style={[styles.cardHeader, styles.conflictAlert]}>UNRESOLVED CONFLICTS</Text>
            <FlatList
              data={conflicts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.conflictItem}>
                  <Text style={styles.conflictTitle}>
                    {item.entity_type.toUpperCase()} ({item.conflict_type})
                  </Text>
                  <Text style={styles.conflictDesc}>
                    Remote revision rev-{item.server_revision} differs from local edit (v{item.client_version}).
                  </Text>
                  <View style={styles.conflictActions}>
                    <TouchableOpacity
                      style={styles.resolveBtnLocal}
                      onPress={() => handleResolveConflict(item.id, 'keep_local')}
                    >
                      <Text style={styles.resolveBtnText}>Keep Local</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resolveBtnRemote}
                      onPress={() => handleResolveConflict(item.id, 'keep_remote')}
                    >
                      <Text style={styles.resolveBtnText}>Keep Remote</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        ) : null}

        {/* Screenplay Export Section */}
        {documentId ? (
          <View style={styles.card}>
            <Text style={styles.cardHeader}>DOCUMENT EXPORT & SHARING</Text>
            <Text style={styles.exportDesc}>
              Generate deterministic, searchable PDF with watermark presets or standard Fountain text.
            </Text>

            <View style={styles.exportRow}>
              <TouchableOpacity
                style={[styles.exportBtn, exporting && styles.disabledBtn]}
                onPress={handleExportPdf}
                disabled={exporting}
              >
                <Text style={styles.exportBtnText}>📄 Export PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportBtn, exporting && styles.disabledBtn]}
                onPress={handleExportFountain}
                disabled={exporting}
              >
                <Text style={styles.exportBtnText}>📝 Export Fountain</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      {/* Export Result Modal */}
      <Modal visible={exportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Export Generated Successfully</Text>
            {exportResult ? (
              <View style={styles.exportResultBox}>
                <Text style={styles.resFileText}>File: {exportResult.fileName}</Text>
                <Text style={styles.resMetaText}>Type: {exportResult.mimeType}</Text>
                <Text style={styles.resMetaText}>
                  Size: {(exportResult.sizeBytes / 1024).toFixed(1)} KB
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setExportModalVisible(false)}
            >
              <Text style={styles.closeModalBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0e14' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12161f',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2430',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backBtnText: { color: '#f3b74f', fontSize: 13, fontWeight: '700' },
  topBarTitle: { color: '#f5f7fb', fontSize: 15, fontWeight: '800' },
  spacer: { width: 40 },
  content: { padding: 16 },
  card: {
    backgroundColor: '#151a23',
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#232a39',
  },
  cardHeader: { color: '#f3b74f', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  statusLabel: { color: '#8a94a6', fontSize: 13 },
  statusValue: { color: '#f5f7fb', fontSize: 13, fontWeight: '600' },
  conflictAlert: { color: '#ef4444' },
  syncButton: {
    backgroundColor: '#f3b74f',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  disabledBtn: { opacity: 0.5 },
  syncButtonText: { color: '#0b0e14', fontSize: 14, fontWeight: '700' },
  conflictItem: {
    backgroundColor: '#1a1f2c',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  conflictTitle: { color: '#f87171', fontSize: 13, fontWeight: '700' },
  conflictDesc: { color: '#94a3b8', fontSize: 12, marginVertical: 4 },
  conflictActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  resolveBtnLocal: {
    backgroundColor: '#3b82f6',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  resolveBtnRemote: {
    backgroundColor: '#6b7280',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  resolveBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  exportDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1,
    backgroundColor: '#1e2430',
    borderWidth: 1,
    borderColor: '#262d3d',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportBtnText: { color: '#f5f7fb', fontSize: 13, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#151a23',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#232a39',
  },
  modalTitle: { color: '#f5f7fb', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  exportResultBox: {
    backgroundColor: '#0b0e14',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262d3d',
  },
  resFileText: { color: '#f3b74f', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  resMetaText: { color: '#94a3b8', fontSize: 12 },
  closeModalBtn: {
    backgroundColor: '#f3b74f',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  closeModalBtnText: { color: '#0b0e14', fontSize: 14, fontWeight: '700' },
});

