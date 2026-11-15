import type {
  CharacterResourceDto,
  CreateCharacterDto,
  UpdateCharacterDto,
  CharacterRelationshipDto,
  SceneCardResourceDto,
  GlobalSearchResponseDto,
} from '@film-studio/contracts';

export interface CharacterRepository {
  createCharacter(
    userId: string,
    filmId: string,
    id: string,
    input: CreateCharacterDto,
  ): Promise<CharacterResourceDto>;

  getCharacter(
    userId: string,
    filmId: string,
    characterId: string,
  ): Promise<CharacterResourceDto | undefined>;

  updateCharacter(
    userId: string,
    filmId: string,
    characterId: string,
    input: UpdateCharacterDto,
  ): Promise<CharacterResourceDto>;

  deleteCharacter(
    userId: string,
    filmId: string,
    characterId: string,
  ): Promise<void>;

  listCharacters(
    userId: string,
    filmId: string,
  ): Promise<readonly CharacterResourceDto[]>;

  addRelationship(
    userId: string,
    filmId: string,
    sourceId: string,
    targetId: string,
    type: string,
    description?: string,
  ): Promise<CharacterRelationshipDto>;

  listRelationships(
    userId: string,
    filmId: string,
    characterId?: string,
  ): Promise<readonly CharacterRelationshipDto[]>;

  listSceneCards(
    userId: string,
    filmId: string,
    documentId: string,
  ): Promise<readonly SceneCardResourceDto[]>;

  updateSceneMetadata(
    userId: string,
    filmId: string,
    documentId: string,
    sceneId: string,
    meta: {
      slugline?: string;
      timeOfDay?: string;
      settingLocation?: string;
      summary?: string;
    },
  ): Promise<void>;

  lockScene(
    userId: string,
    filmId: string,
    documentId: string,
    sceneId: string,
    lock: boolean,
  ): Promise<void>;

  reorderScenes(
    userId: string,
    filmId: string,
    documentId: string,
    sceneIdsInOrder: readonly string[],
  ): Promise<void>;

  recordSceneAppearance(
    userId: string,
    filmId: string,
    documentId: string,
    sceneId: string,
    characterId: string,
    dialogueBlockCount: number,
    dialogueWordCount: number,
  ): Promise<void>;

  globalSearch(
    userId: string,
    filmId: string,
    query: string,
  ): Promise<GlobalSearchResponseDto>;
}

