import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  MobileScreenplayEditorEngine,
  type MobileScreenplayBlock,
  type ScreenplayBlockType,
} from '../editor/mobile-screenplay-editor-engine';
import { MobileDraftPersistenceManager } from '../editor/mobile-draft-persistence';
import type { MobileLocalRepository, MobileSceneRecord } from '../database/mobile-repository';

export interface MobileScreenplayEditorProps {
  readonly filmId: string;
  readonly documentId: string;
  readonly scene: MobileSceneRecord;
  readonly repo: MobileLocalRepository;
  readonly onBack: () => void;
}

const BLOCK_TYPES: { type: ScreenplayBlockType; label: string }[] = [
  { type: 'scene_heading', label: 'Scene Heading' },
  { type: 'action', label: 'Action' },
  { type: 'character', label: 'Character' },
  { type: 'parenthetical', label: 'Parenthetical' },
  { type: 'dialogue', label: 'Dialogue' },
  { type: 'transition', label: 'Transition' },
  { type: 'shot', label: 'Shot' },
];

export function MobileScreenplayEditor({
  filmId,
  documentId,
  scene,
  repo,
  onBack,
}: MobileScreenplayEditorProps) {
  const [engine, setEngine] = useState<MobileScreenplayEditorEngine | null>(null);
  const [blocks, setBlocks] = useState<readonly MobileScreenplayBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [persistenceManager] = useState(
    () => new MobileDraftPersistenceManager(filmId, documentId, repo)
  );

  const deviceSeqRef = useRef(1);

  // Initialize and load blocks from local durability layer
  useEffect(() => {
    let mounted = true;
    async function initEditor() {
      const recovered = await persistenceManager.recoverDraft(scene.id);
      const initial = recovered && recovered.length > 0 ? recovered : undefined;
      const eng = new MobileScreenplayEditorEngine(scene.id, initial);
      if (mounted) {
        setEngine(eng);
        const state = eng.getState();
        setBlocks(state.blocks);
        setActiveBlockId(state.activeBlockId);
      }
    }
    initEditor();
    return () => {
      mounted = false;
    };
  }, [scene.id, persistenceManager]);

  // Persist draft on text update
  const handleTextChange = useCallback(
    (blockId: string, text: string) => {
      if (!engine) return;
      engine.updateBlockText(blockId, text);
      const state = engine.getState();
      setBlocks(state.blocks);
      setSaveStatus('dirty');

      // Auto-save debounced / instantaneous
      void persistenceManager.persistDraft(scene.id, state.blocks, state.revision).then(() => {
        setSaveStatus('saved');
      });
    },
    [engine, persistenceManager, scene.id]
  );

  const handleTypeSelect = (type: ScreenplayBlockType) => {
    if (!engine || !activeBlockId) return;
    engine.setBlockType(activeBlockId, type);
    const state = engine.getState();
    setBlocks(state.blocks);
    setSaveStatus('dirty');
    void persistenceManager.persistDraft(scene.id, state.blocks, state.revision).then(() => {
      setSaveStatus('saved');
    });
  };

  const handleEnterKey = (blockId: string) => {
    if (!engine) return;
    const newId = engine.handleEnterOnBlock(blockId);
    const state = engine.getState();
    setBlocks(state.blocks);
    setActiveBlockId(newId);
    setSaveStatus('dirty');
    void persistenceManager.persistDraft(scene.id, state.blocks, state.revision).then(() => {
      setSaveStatus('saved');
    });
  };

  const handleManualSave = async () => {
    if (!engine) return;
    setSaveStatus('saving');
    const state = engine.getState();
    deviceSeqRef.current++;
    await persistenceManager.commitDraftToOutbox(scene.id, state.blocks, deviceSeqRef.current);
    engine.markCommitted();
    setSaveStatus('saved');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backButtonText}>← Scenes</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.sceneHeadingText} numberOfLines={1}>
            {scene.heading}
          </Text>
          <Text style={styles.saveStatusText}>
            {saveStatus === 'saved'
              ? '● Saved locally'
              : saveStatus === 'saving'
              ? '○ Committing...'
              : '● Unsaved edits'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.commitButton}
          onPress={handleManualSave}
          accessibilityRole="button"
        >
          <Text style={styles.commitButtonText}>Commit</Text>
        </TouchableOpacity>
      </View>

      {/* Block Type Ribbon / Action Bar */}
      <View style={styles.ribbonContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ribbonScroll}>
          {BLOCK_TYPES.map((bt) => {
            const activeBlock = blocks.find((b) => b.id === activeBlockId);
            const isSelected = activeBlock?.type === bt.type;
            return (
              <TouchableOpacity
                key={bt.type}
                style={[styles.ribbonChip, isSelected && styles.ribbonChipSelected]}
                onPress={() => handleTypeSelect(bt.type)}
                accessibilityRole="button"
              >
                <Text style={[styles.ribbonChipText, isSelected && styles.ribbonChipTextSelected]}>
                  {bt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Screenplay Document Canvas */}
      <FlatList
        data={blocks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.canvasContainer}
        renderItem={({ item }) => {
          const isActive = item.id === activeBlockId;
          const blockStyle = getBlockStyle(item.type);

          return (
            <View style={[styles.blockRow, isActive && styles.activeBlockRow]}>
              <View style={styles.blockTypeIndicator}>
                <Text style={styles.blockTypeIndicatorText}>
                  {item.type.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
              <TextInput
                style={[styles.baseInput, blockStyle]}
                value={item.text}
                onChangeText={(text) => handleTextChange(item.id, text)}
                onFocus={() => setActiveBlockId(item.id)}
                onSubmitEditing={() => handleEnterKey(item.id)}
                placeholder={getPlaceholder(item.type)}
                placeholderTextColor="#4b5563"
                multiline
                scrollEnabled={false}
              />
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

function getPlaceholder(type: ScreenplayBlockType): string {
  switch (type) {
    case 'scene_heading':
      return 'INT. LOCATION - DAY';
    case 'action':
      return 'Describe physical action or setting... (తెలుగులో కూడా టైప్ చేయవచ్చు)';
    case 'character':
      return 'CHARACTER NAME';
    case 'parenthetical':
      return '(wryly)';
    case 'dialogue':
      return 'Dialogue line...';
    case 'transition':
      return 'CUT TO:';
    case 'shot':
      return 'CLOSE UP ON';
    default:
      return '';
  }
}

function getBlockStyle(type: ScreenplayBlockType) {
  switch (type) {
    case 'scene_heading':
      return styles.headingBlock;
    case 'character':
      return styles.characterBlock;
    case 'parenthetical':
      return styles.parentheticalBlock;
    case 'dialogue':
      return styles.dialogueBlock;
    case 'transition':
      return styles.transitionBlock;
    case 'shot':
      return styles.shotBlock;
    case 'action':
    default:
      return styles.actionBlock;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0e14' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#12161f',
    borderBottomWidth: 1,
    borderBottomColor: '#1e2430',
  },
  backButton: { paddingVertical: 4, paddingHorizontal: 8 },
  backButtonText: { color: '#f3b74f', fontSize: 13, fontWeight: '700' },
  headerTitleBox: { flex: 1, marginHorizontal: 12 },
  sceneHeadingText: { color: '#f5f7fb', fontSize: 14, fontWeight: '800' },
  saveStatusText: { color: '#94a3b8', fontSize: 11, fontWeight: '500', marginTop: 2 },
  commitButton: {
    backgroundColor: '#f3b74f',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  commitButtonText: { color: '#0b0e14', fontSize: 13, fontWeight: '700' },
  ribbonContainer: {
    backgroundColor: '#161b24',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#232a39',
  },
  ribbonScroll: { paddingHorizontal: 12, gap: 8 },
  ribbonChip: {
    backgroundColor: '#0e1219',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262d3d',
  },
  ribbonChipSelected: {
    backgroundColor: '#f3b74f',
    borderColor: '#f3b74f',
  },
  ribbonChipText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  ribbonChipTextSelected: { color: '#0b0e14', fontWeight: '800' },
  canvasContainer: { padding: 16, paddingBottom: 40 },
  blockRow: {
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBlockRow: {
    backgroundColor: 'rgba(243, 183, 79, 0.05)',
  },
  blockTypeIndicator: {
    marginBottom: 2,
  },
  blockTypeIndicatorText: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  baseInput: {
    color: '#f5f7fb',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
    padding: 0,
  },
  headingBlock: {
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#f5f7fb',
  },
  actionBlock: {
    fontWeight: '400',
    color: '#e2e8f0',
  },
  characterBlock: {
    textAlign: 'center',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#f3b74f',
    marginTop: 8,
  },
  parentheticalBlock: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#94a3b8',
  },
  dialogueBlock: {
    marginHorizontal: 24,
    color: '#ffffff',
    lineHeight: 24,
  },
  transitionBlock: {
    textAlign: 'right',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#cbd5e1',
    marginTop: 8,
  },
  shotBlock: {
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#38bdf8',
  },
});

