import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresCollaborationRepository } from '../backend/src/database/postgres-collaboration.repository.js';

// Users
const directorUser = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4'; // SS Rajamouli
const writerUser = '018f4ce4-82c4-7808-ae50-28293c570bd5';   // V. Vijayendra Prasad
const offlineAdUser = '018f4ce4-8a12-7001-be12-333344445555';// Assistant Director (offline client)
const intruderUser = '018f4ce4-8999-79aa-94a6-09195b7d9999'; // Rival / Intruder

// Orgs and Films
const orgMythri = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const orgRival = '018f4ce4-a888-79aa-94a6-09195b7d8888';
const filmVaranasi = '018f4ce4-b3df-75c9-8d26-424bb512c0cf'; // Varanasi Chronicles
const filmRival = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

// Devices
const deviceDirector = '018f4ce4-d111-7000-8000-000000000001';
const deviceWriter = '018f4ce4-d222-7000-8000-000000000002';
const deviceOffline = '018f4ce4-d333-7000-8000-000000000003';

// Content IDs
const docId = '018f4ce4-c111-7000-8000-000000000011';
const sceneId = '018f4ce4-c222-7000-8000-000000000022';
const blockId = '018f4ce4-c333-7000-8000-000000000033';

async function main(): Promise<void> {
  const database = new PGlite();
  const migrationDirectory = fileURLToPath(
    new URL('../infra/database/migrations/', import.meta.url),
  );
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();

  try {
    for (const name of migrationNames) {
      await database.exec(
        await readFile(
          new URL(`../infra/database/migrations/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }

    // Seed users, devices, orgs, films, and document content
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${directorUser}', 'SS Rajamouli', 'rajamouli@studio.test'),
        ('${writerUser}', 'V. Vijayendra Prasad', 'prasad@studio.test'),
        ('${offlineAdUser}', 'Assistant Director', 'ad@studio.test'),
        ('${intruderUser}', 'Rival Spy', 'spy@rival.test');

      INSERT INTO devices (id, user_id, label, platform) VALUES
        ('${deviceDirector}', '${directorUser}', 'macbook-pro-director', 'web'),
        ('${deviceWriter}', '${writerUser}', 'thinkpad-writer', 'web'),
        ('${deviceOffline}', '${offlineAdUser}', 'pixel-tablet-ad', 'android');

      -- Set Director session to create org & film
      SELECT set_config('app.user_id', '${directorUser}', false);
      SELECT app_security.create_organization('${orgMythri}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmVaranasi}', '${orgMythri}', 'వారణాసి క్షేత్రం (Varanasi Chronicles)');

      -- Add Writer and Offline AD to film_memberships
      INSERT INTO film_memberships (film_id, user_id, status) VALUES
        ('${filmVaranasi}', '${writerUser}', 'active'),
        ('${filmVaranasi}', '${offlineAdUser}', 'active');

      -- Seed Document & Scenes
      INSERT INTO documents (id, film_id, title, kind, language, created_by) VALUES
        ('${docId}', '${filmVaranasi}', 'వారణాసి - అసలు కథ స్క్రిప్ట్', 'screenplay', 'te-IN', '${directorUser}');

      INSERT INTO scenes (id, film_id, document_id, slugline) VALUES
        ('${sceneId}', '${filmVaranasi}', '${docId}', 'EXT. VARANASI GHATS - SUNRISE');

      -- Rival Org and Film
      SELECT set_config('app.user_id', '${intruderUser}', false);
      SELECT app_security.create_organization('${orgRival}', 'Rival Productions');
      SELECT app_security.create_film('${filmRival}', '${orgRival}', 'Rival Project');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresCollaborationRepository(pool);

    // Switch session to Director
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);

    // =========================================================================
    // 1. Thread Creation with Anchor & Telugu Initial Comment
    // =========================================================================
    process.stdout.write('Test 1: Creating collaboration thread anchored on screenplay block...\n');
    const threadResult = await repo.createThread(
      {
        filmId: filmVaranasi,
        targetType: 'screenplay_block',
        targetId: blockId,
        anchorRange: {
          blockId,
          startOffset: 0,
          endOffset: 25,
          selectedText: 'గంగా నది తీరంలో శంఖనాదం',
          sceneNumber: '1',
        },
        title: 'శంఖనాదం శబ్ద ప్రభావం చర్చ',
        initialComment: 'ఈ శంఖనాదం సౌండ్ డిజైన్ అత్యంత గంభీరంగా ఉండాలి. నేపథ్య సంగీతం నెమ్మదిగా ప్రారంభం కావాలి.',
        contentFormat: 'plain',
      },
      directorUser,
    );

    assert.equal(threadResult.thread.filmId, filmVaranasi);
    assert.equal(threadResult.thread.targetType, 'screenplay_block');
    assert.equal(threadResult.thread.targetId, blockId);
    assert.equal(threadResult.thread.status, 'open');
    assert.equal(threadResult.thread.title, 'శంఖనాదం శబ్ద ప్రభావం చర్చ');
    assert.equal(threadResult.comments.length, 1);
    assert.equal(threadResult.comments[0]?.authorUserId, directorUser);
    assert.ok(threadResult.comments[0]?.content.includes('శంఖనాదం సౌండ్ డిజైన్'));

    const threadId = threadResult.thread.id;
    const initialCommentId = threadResult.comments[0]!.id;

    // =========================================================================
    // 2. Threaded Replies & Multi-User Comments (Switch to Writer)
    // =========================================================================
    process.stdout.write('Test 2: Collaborator replies to thread with Telugu Unicode text...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [writerUser]);

    const reply1 = await repo.addComment(
      {
        filmId: filmVaranasi,
        threadId,
        parentCommentId: initialCommentId,
        content: 'ఖచ్చితంగా అంగీకరిస్తున్నాను. మంత్రోచ్ఛారణలతో పాటు శంఖనాదం కలిస్తే దృశ్యానికి దివ్యత్వం వస్తుంది.',
        contentFormat: 'plain',
      },
      writerUser,
    );

    assert.equal(reply1.authorUserId, writerUser);
    assert.equal(reply1.parentCommentId, initialCommentId);
    assert.ok(reply1.content.includes('మంత్రోచ్ఛారణలతో పాటు'));

    // Switch back to Director and add nested confirmation
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [directorUser]);
    const reply2 = await repo.addComment(
      {
        filmId: filmVaranasi,
        threadId,
        parentCommentId: reply1.id,
        content: 'సంగీత దర్శకుడికి ఈ నోట్స్ పంపించాం. ఫైనల్ చేసాము.',
      },
      directorUser,
    );
    assert.equal(reply2.authorUserId, directorUser);

    // Fetch full thread with comments
    const loadedThread = await repo.getThread(threadId);
    assert.ok(loadedThread);
    assert.equal(loadedThread.comments.length, 3);
    assert.equal(loadedThread.comments[1]?.id, reply1.id);
    assert.equal(loadedThread.comments[2]?.id, reply2.id);

    // =========================================================================
    // 3. Anchored Annotations (Highlight Ranges)
    // =========================================================================
    process.stdout.write('Test 3: Creating and querying text highlight annotations...\n');
    const annotation = await repo.createAnnotation(
      {
        filmId: filmVaranasi,
        threadId,
        targetType: 'screenplay_block',
        targetId: blockId,
        colorCategory: 'blue',
        startOffset: 27,
        endOffset: 55,
        highlightedText: 'ఉషోదయ కిరణాలు ఆలయ శిఖరాన్ని తాకుతున్నాయి',
        note: 'గోల్డెన్ అవర్ లైటింగ్ అవసరం',
      },
      directorUser,
    );

    assert.equal(annotation.colorCategory, 'blue');
    assert.equal(annotation.startOffset, 27);
    assert.equal(annotation.endOffset, 55);
    assert.ok(annotation.highlightedText.includes('ఉషోదయ కిరణాలు'));

    const annotationsList = await repo.listAnnotations(filmVaranasi, 'screenplay_block', blockId);
    assert.equal(annotationsList.length, 1);
    assert.equal(annotationsList[0]?.id, annotation.id);

    // =========================================================================
    // 4. Resolve & Reopen Workflow
    // =========================================================================
    process.stdout.write('Test 4: Resolving and reopening collaboration thread...\n');
    const resolvedThread = await repo.resolveThread(threadId, directorUser, 'resolved');
    assert.ok(resolvedThread);
    assert.equal(resolvedThread.status, 'resolved');
    assert.equal(resolvedThread.resolvedByUserId, directorUser);
    assert.ok(resolvedThread.resolvedAt);

    // Filter threads by status
    const openThreads = await repo.listThreads(filmVaranasi, { status: 'open' });
    assert.equal(openThreads.length, 0);
    const resolvedThreads = await repo.listThreads(filmVaranasi, { status: 'resolved' });
    assert.equal(resolvedThreads.length, 1);

    // Reopen thread
    const reopenedThread = await repo.reopenThread(threadId);
    assert.ok(reopenedThread);
    assert.equal(reopenedThread.status, 'open');
    assert.equal(reopenedThread.resolvedByUserId, null);
    assert.equal(reopenedThread.resolvedAt, null);

    // =========================================================================
    // 5. Real-Time Presence: Two Online Editors + One Offline Third Client
    // =========================================================================
    process.stdout.write('Test 5: Two online editors + one offline client presence tracking...\n');
    // Editor 1 (Director) active heartbeat
    await repo.updatePresence(
      {
        filmId: filmVaranasi,
        deviceId: deviceDirector,
        clientType: 'web',
        activeDocumentId: docId,
        activeSceneId: sceneId,
        cursorPosition: { blockId, offset: 45, line: 1 },
        state: 'active',
      },
      directorUser,
    );

    // Editor 2 (Writer) active heartbeat
    await repo.updatePresence(
      {
        filmId: filmVaranasi,
        deviceId: deviceWriter,
        clientType: 'web',
        activeDocumentId: docId,
        activeSceneId: sceneId,
        cursorPosition: { blockId, offset: 12, line: 1 },
        state: 'active',
      },
      writerUser,
    );

    // Third client (Offline AD): Insert presence heartbeat from 300 seconds ago (simulating offline client)
    await database.exec(`
      INSERT INTO collaboration_presence_sessions (
        film_id, user_id, device_id, client_type, active_document_id, active_scene_id, cursor_position, state, last_heartbeat
      ) VALUES (
        '${filmVaranasi}', '${offlineAdUser}', '${deviceOffline}', 'android', '${docId}', '${sceneId}', '{"blockId": "${blockId}"}'::jsonb, 'offline', now() - interval '300 seconds'
      ) ON CONFLICT (film_id, user_id, device_id) DO UPDATE SET
        state = 'offline',
        last_heartbeat = now() - interval '300 seconds';
    `);

    // Query active presence with 60-second window
    const activeSessions = await repo.listActivePresence(filmVaranasi, docId, 60);
    assert.equal(activeSessions.length, 2, 'Only 2 online editors should be active; offline client excluded');
    const activeUserIds = activeSessions.map((s) => s.userId);
    assert.ok(activeUserIds.includes(directorUser));
    assert.ok(activeUserIds.includes(writerUser));
    assert.ok(!activeUserIds.includes(offlineAdUser), 'Offline AD should not appear in active sessions');

    // =========================================================================
    // 6. Collaboration Notifications & Mentions
    // =========================================================================
    process.stdout.write('Test 6: Notification creation and read state tracking...\n');
    const notification = await repo.createNotification({
      filmId: filmVaranasi,
      recipientUserId: writerUser,
      senderUserId: directorUser,
      eventType: 'mention',
      entityType: 'collaboration_thread',
      entityId: threadId,
      payload: {
        message: 'శంఖనాదం చర్చలో మిమ్మల్ని ప్రస్తావించారు',
        threadTitle: 'శంఖనాదం శబ్ద ప్రభావం చర్చ',
      },
    });

    assert.equal(notification.recipientUserId, writerUser);
    assert.equal(notification.eventType, 'mention');
    assert.equal(notification.isRead, false);

    // Writer checks notifications
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [writerUser]);
    const unreadNotifications = await repo.listNotifications(writerUser, filmVaranasi, true);
    assert.equal(unreadNotifications.length, 1);
    assert.equal(unreadNotifications[0]?.id, notification.id);

    // Writer marks notification as read
    const markedRead = await repo.markNotificationRead(notification.id, writerUser);
    assert.equal(markedRead, true);

    const postReadUnread = await repo.listNotifications(writerUser, filmVaranasi, true);
    assert.equal(postReadUnread.length, 0);

    // =========================================================================
    // 7. Access Revocation Taking Effect
    // =========================================================================
    process.stdout.write('Test 7: Access revocation test...\n');
    // Revoke Offline AD from film
    await database.exec(`
      DELETE FROM film_memberships
      WHERE film_id = '${filmVaranasi}' AND user_id = '${offlineAdUser}';
    `);

    // Offline AD tries to list threads -> Should receive empty list (membership check blocks access)
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [offlineAdUser]);
    const revokedThreads = await repo.listThreads(filmVaranasi);
    assert.equal(revokedThreads.length, 0, 'Revoked user cannot read film threads');

    // =========================================================================
    // 8. Strict Tenant & RLS Isolation
    // =========================================================================
    process.stdout.write('Test 8: Strict multi-tenant isolation against rival user...\n');
    await pool.query(`SELECT set_config('app.user_id', $1, false)`, [intruderUser]);

    const intruderThreads = await repo.listThreads(filmVaranasi);
    assert.equal(intruderThreads.length, 0, 'Intruder cannot list threads of another film');

    const intruderGetThread = await repo.getThread(threadId);
    assert.equal(intruderGetThread, null, 'Intruder cannot get thread details');

    const intruderAnnotations = await repo.listAnnotations(filmVaranasi);
    assert.equal(intruderAnnotations.length, 0, 'Intruder cannot list annotations of another film');

    const intruderPresence = await repo.listActivePresence(filmVaranasi);
    assert.equal(intruderPresence.length, 0, 'Intruder cannot see presence of another film');

    const intruderNotifications = await repo.listNotifications(intruderUser, filmVaranasi);
    assert.equal(intruderNotifications.length, 0, 'Intruder cannot receive notifications from another film');

    await pool.end();
    await database.close();

    process.stdout.write('✅ All 8 Multi-User Collaboration checks PASSED successfully!\n');
  } catch (error) {
    process.stderr.write(`❌ Multi-user collaboration test failed: ${error}\n`);
    await database.close();
    process.exit(1);
  }
}

main();
