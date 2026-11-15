import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MobileLocalRepository } from '../database/mobile-repository';
import type {
  MobileFilmRecord,
  MobileDocumentRecord,
  MobileSceneRecord,
} from '../database/mobile-repository';
import { createDatabaseAdapter } from '../database/mobile-database';
import { mobileCredentialStorage } from '../storage/credential-storage';
import type { DeviceRegistration } from '../storage/credential-storage';
import { MobileScreenplayEditor } from './MobileScreenplayEditor';
import { MobileSyncAndExportSheet } from './MobileSyncAndExportSheet';

export function ProjectDashboard() {
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [films, setFilms] = useState<MobileFilmRecord[]>([]);
  const [selectedFilm, setSelectedFilm] = useState<MobileFilmRecord | null>(null);
  const [documents, setDocuments] = useState<MobileDocumentRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<MobileDocumentRecord | null>(null);
  const [scenes, setScenes] = useState<MobileSceneRecord[]>([]);
  const [selectedScene, setSelectedScene] = useState<MobileSceneRecord | null>(null);
  const [showSyncSheet, setShowSyncSheet] = useState(false);
  const [device, setDevice] = useState<DeviceRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [repo, setRepo] = useState<MobileLocalRepository | null>(null);

  // New project modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLogline, setNewLogline] = useState('');
  const [saving, setSaving] = useState(false);

  // New Scene modal state
  const [sceneModalVisible, setSceneModalVisible] = useState(false);
  const [newSceneHeading, setNewSceneHeading] = useState('');

  // Initialize DB and load projects
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const db = await createDatabaseAdapter();
        const localRepo = new MobileLocalRepository(db);
        const dev = await mobileCredentialStorage.getOrCreateDeviceRegistration('Pixel 8 Pro Android 15');
        if (mounted) {
          setRepo(localRepo);
          setDevice(dev);
          const list = await localRepo.listFilms(false);
          setFilms(list);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const loadFilms = useCallback(
    async (tab: 'active' | 'archived') => {
      if (!repo) return;
      setLoading(true);
      const list = await repo.listFilms(tab === 'archived');
      setFilms(list);
      setLoading(false);
    },
    [repo]
  );

  const handleTabChange = (tab: 'active' | 'archived') => {
    setActiveTab(tab);
    setSelectedFilm(null);
    setSelectedDoc(null);
    setSelectedScene(null);
    loadFilms(tab);
  };

  const handleSelectFilm = async (film: MobileFilmRecord) => {
    setSelectedFilm(film);
    setSelectedDoc(null);
    setSelectedScene(null);
    if (!repo) return;
    await mobileCredentialStorage.setActiveFilmId(film.id);
    const docs = await repo.listDocuments(film.id);
    setDocuments(docs);
  };

  const handleSelectDoc = async (doc: MobileDocumentRecord) => {
    setSelectedDoc(doc);
    setSelectedScene(null);
    if (!repo) return;
    const sceneList = await repo.listScenes(doc.id);
    setScenes(sceneList);
  };

  const handleCreateScene = async () => {
    if (!newSceneHeading.trim() || !repo || !selectedDoc) return;
    setSaving(true);
    const sceneId = `scene_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sortOrder = scenes.length + 1;
    await repo.upsertScene({
      id: sceneId,
      documentId: selectedDoc.id,
      heading: newSceneHeading.trim(),
      sortOrder,
    });
    setNewSceneHeading('');
    setSaving(false);
    setSceneModalVisible(false);
    const updated = await repo.listScenes(selectedDoc.id);
    setScenes(updated);
  };

  const handleCreateFilm = async () => {
    if (!newTitle.trim() || !repo) return;
    setSaving(true);
    const filmId = `film_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // Upsert into local SQLite
    await repo.upsertFilm({
      id: filmId,
      title: newTitle.trim(),
      ...(newLogline.trim() ? { logline: newLogline.trim() } : {}),
      state: 'draft',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      localVersion: 1,
    });

    // Create default Screenplay document
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await repo.upsertDocument({
      id: docId,
      filmId,
      title: 'Feature Screenplay',
      kind: 'screenplay',
      createdAt: now,
      updatedAt: now,
    });

    // Enqueue outbox mutation for background sync
    await repo.enqueueOutbox({
      id: `outbox_${Date.now()}`,
      filmId,
      entityType: 'film',
      entityId: filmId,
      operationType: 'create',
      payload: { title: newTitle.trim(), logline: newLogline.trim() },
      deviceSeq: 1,
    });

    setNewTitle('');
    setNewLogline('');
    setSaving(false);
    setModalVisible(false);
    await loadFilms(activeTab);
  };

  const handleToggleArchive = async (filmId: string, currentArchived: number) => {
    if (!repo) return;
    await repo.setFilmArchived(filmId, currentArchived === 0);
    if (selectedFilm?.id === filmId) {
      setSelectedFilm(null);
    }
    await loadFilms(activeTab);
  };

  return (
    <View style={styles.container}>
      {/* Top Header & Device Identity */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>STORYFORGE STUDIO — ANDROID</Text>
          <Text style={styles.headerTitle}>Film Projects</Text>
        </View>
        <View style={styles.devicePill}>
          <View style={styles.onlineDot} />
          <Text style={styles.deviceText} numberOfLines={1}>
            {device?.deviceName ?? 'Android Device'}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => handleTabChange('active')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'active' }}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
            Active Films
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archived' && styles.activeTab]}
          onPress={() => handleTabChange('archived')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'archived' }}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.activeTabText]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#f3b74f" />
        </View>
      ) : showSyncSheet && selectedFilm && repo ? (
        <MobileSyncAndExportSheet
          filmId={selectedFilm.id}
          filmTitle={selectedFilm.title}
          {...(selectedDoc ? { documentId: selectedDoc.id } : {})}
          repo={repo}
          onBack={() => setShowSyncSheet(false)}
        />
      ) : selectedFilm && selectedDoc && selectedScene && repo ? (
        // Active Mobile Screenplay Editor View
        <MobileScreenplayEditor
          filmId={selectedFilm.id}
          documentId={selectedDoc.id}
          scene={selectedScene}
          repo={repo}
          onBack={() => setSelectedScene(null)}
        />
      ) : selectedFilm && selectedDoc ? (
        // Scenes Navigation / Scene List View
        <View style={styles.detailContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedDoc(null)}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>← Back to Documents</Text>
          </TouchableOpacity>
          <Text style={styles.filmTitle}>{selectedDoc.title}</Text>
          <Text style={styles.filmLogline}>Scenes ({scenes.length})</Text>

          {scenes.length === 0 ? (
            <Text style={styles.emptyText}>No scenes added yet.</Text>
          ) : (
            <FlatList
              data={scenes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.sceneCard}
                  onPress={() => setSelectedScene(item)}
                  accessibilityRole="button"
                >
                  <Text style={styles.sceneHeading}>{item.heading}</Text>
                  {item.synopsis ? <Text style={styles.sceneSynopsis}>{item.synopsis}</Text> : null}
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setSceneModalVisible(true)}
            accessibilityRole="button"
          >
            <Text style={styles.createButtonText}>+ Add New Scene</Text>
          </TouchableOpacity>
        </View>
      ) : selectedFilm ? (
        // Selected Film Documents View
        <View style={styles.detailContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedFilm(null)}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>← Back to Projects</Text>
          </TouchableOpacity>
          <Text style={styles.filmTitle}>{selectedFilm.title}</Text>
          {selectedFilm.logline ? (
            <Text style={styles.filmLogline}>{selectedFilm.logline}</Text>
          ) : null}

          <Text style={styles.sectionHeader}>Documents</Text>
          {documents.length === 0 ? (
            <Text style={styles.emptyText}>No documents created yet.</Text>
          ) : (
            <FlatList
              data={documents}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.docCard}
                  onPress={() => handleSelectDoc(item)}
                  accessibilityRole="button"
                >
                  <Text style={styles.docTitle}>{item.title}</Text>
                  <Text style={styles.docKind}>Type: {item.kind.toUpperCase()} (Tap to Edit)</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity
            style={styles.syncSheetBtn}
            onPress={() => setShowSyncSheet(true)}
            accessibilityRole="button"
          >
            <Text style={styles.syncSheetBtnText}>🔄 Sync & Export Screenplay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.archiveActionBtn}
            onPress={() => handleToggleArchive(selectedFilm.id, selectedFilm.is_archived)}
            accessibilityRole="button"
          >
            <Text style={styles.archiveActionBtnText}>
              {selectedFilm.is_archived ? 'Restore to Active' : 'Archive Project'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Films List View
        <View style={styles.listContainer}>
          {films.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>
                {activeTab === 'active' ? 'No active films found' : 'No archived films'}
              </Text>
              <Text style={styles.emptySubtitle}>
                Create a new project to start authoring screenplays with offline durability.
              </Text>
            </View>
          ) : (
            <FlatList
              data={films}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.filmCard}
                  onPress={() => handleSelectFilm(item)}
                  accessibilityRole="button"
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardState}>{item.state.toUpperCase()}</Text>
                  </View>
                  {item.logline ? (
                    <Text style={styles.cardLogline} numberOfLines={2}>
                      {item.logline}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
          )}

          {activeTab === 'active' ? (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setModalVisible(true)}
              accessibilityRole="button"
            >
              <Text style={styles.createButtonText}>+ Create New Film Project</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* New Project Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>New Film Project</Text>
            <Text style={styles.modalSubtitle}>
              Initializes local SQLite metadata with instant offline availability.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Film Title (e.g., మాయాబజార్ / Mayabazar)"
              placeholderTextColor="#8a94a6"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />

            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Logline / Premise"
              placeholderTextColor="#8a94a6"
              value={newLogline}
              onChangeText={setNewLogline}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !newTitle.trim() && styles.disabledBtn]}
                onPress={handleCreateFilm}
                disabled={!newTitle.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0b0e14" />
                ) : (
                  <Text style={styles.saveBtnText}>Create Project</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Scene Modal */}
      <Modal visible={sceneModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Screenplay Scene</Text>
            <Text style={styles.modalSubtitle}>
              Create a new scene heading with instant local durability.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. INT. కోట గది - DAY / INT. CASTLE - DAY"
              placeholderTextColor="#8a94a6"
              value={newSceneHeading}
              onChangeText={setNewSceneHeading}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSceneModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !newSceneHeading.trim() && styles.disabledBtn]}
                onPress={handleCreateScene}
                disabled={!newSceneHeading.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0b0e14" />
                ) : (
                  <Text style={styles.saveBtnText}>Add Scene</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0e14', paddingHorizontal: 16, paddingTop: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2430',
  },
  headerSub: { color: '#f3b74f', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  headerTitle: { color: '#f5f7fb', fontSize: 24, fontWeight: '800' },
  devicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b24',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262d3d',
    maxWidth: 160,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399', marginRight: 6 },
  deviceText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#12161f',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#1e2430' },
  tabText: { color: '#8a94a6', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#f5f7fb', fontWeight: '700' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { flex: 1, justifyContent: 'space-between', paddingBottom: 20 },
  filmCard: {
    backgroundColor: '#151a23',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#232a39',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#f5f7fb', fontSize: 18, fontWeight: '700', flex: 1 },
  cardState: {
    color: '#f3b74f',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#262015',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  cardLogline: { color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 18 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#f5f7fb', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#8a94a6', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  createButton: {
    backgroundColor: '#f3b74f',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  createButtonText: { color: '#0b0e14', fontSize: 15, fontWeight: '700' },
  detailContainer: { flex: 1, paddingBottom: 20 },
  backButton: { marginBottom: 12 },
  backButtonText: { color: '#f3b74f', fontSize: 14, fontWeight: '600' },
  filmTitle: { color: '#f5f7fb', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  filmLogline: { color: '#94a3b8', fontSize: 14, marginBottom: 16, lineHeight: 20 },
  sectionHeader: { color: '#f5f7fb', fontSize: 16, fontWeight: '700', marginVertical: 12 },
  emptyText: { color: '#8a94a6', fontStyle: 'italic', marginBottom: 16 },
  docCard: {
    backgroundColor: '#151a23',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#232a39',
    marginBottom: 10,
  },
  docTitle: { color: '#f5f7fb', fontSize: 15, fontWeight: '600' },
  docKind: { color: '#8a94a6', fontSize: 12, marginTop: 4 },
  sceneCard: {
    backgroundColor: '#151a23',
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#232a39',
    marginBottom: 10,
  },
  sceneHeading: { color: '#f5f7fb', fontSize: 14, fontWeight: '700' },
  sceneSynopsis: { color: '#8a94a6', fontSize: 12, marginTop: 4 },
  syncSheetBtn: {
    backgroundColor: '#1e2430',
    borderWidth: 1,
    borderColor: '#f3b74f',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  syncSheetBtnText: { color: '#f3b74f', fontSize: 14, fontWeight: '700' },
  archiveActionBtn: {
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  archiveActionBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
  modalTitle: { color: '#f5f7fb', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  modalSubtitle: { color: '#8a94a6', fontSize: 12, marginBottom: 16 },
  input: {
    backgroundColor: '#0b0e14',
    borderWidth: 1,
    borderColor: '#262d3d',
    borderRadius: 6,
    padding: 12,
    color: '#f5f7fb',
    fontSize: 14,
    marginBottom: 12,
  },
  multilineInput: { height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6 },
  cancelBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#f3b74f',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  disabledBtn: { opacity: 0.5 },
  saveBtnText: { color: '#0b0e14', fontSize: 14, fontWeight: '700' },
});
