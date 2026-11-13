# STORYFORGE STUDIO — Product Inputs Required

**Purpose:** Capture only the business, film-domain, ownership, and account inputs that cannot be safely invented during implementation. Technical architecture, security mechanisms, code structure, testing strategy, and vendor evaluation are owned by the CTO process.

Fill the fields marked **Owner input required**. A short answer, sample file, or “approve recommended default” is sufficient. Unknown answers may be resolved during Sprint S0 with an explicit decision record; they must not be silently guessed or hard-coded.

## 1. Decisions already confirmed

- Complete production scope: all 19 modules.
- Delivery: one sequential workstream, no parallel feature streams.
- Languages: Telugu (`te`), Hindi (`hi`), English (`en`), Tamil (`ta`), Kannada (`kn`), Malayalam (`ml`), Bengali (`bn`), and Marathi (`mr`).
- Platforms: responsive web on Windows/macOS; dedicated Android app for Android 15+; dedicated iOS app remains mandatory.
- Billing/payments: out of scope.
- Account model: a registered director or producer can create/administer a film and invite film-scoped users.
- Platform oversight: one or more tightly controlled Super Admin accounts monitor the service.
- Security and IP protection: required throughout the product.

## 2. CTO operating decisions

These are the defaults I will implement unless a business requirement requires a recorded change.

### Sequential delivery and quality

- One sprint is active at a time. A later feature does not begin until the current sprint's tests and exit evidence pass.
- AI-assisted/vibe coding may generate code, tests, documentation, and migrations, but generated work is reviewed and executed before acceptance.
- No screen is shipped with dummy actions, fake persistence, silently hard-coded business values, or untested permission behavior.
- All 19 modules are required for final GA. Earlier builds are internal or controlled previews.

### Supported clients

- Windows and macOS web: latest two stable Chrome, Edge, and Firefox releases; latest two stable Safari releases on supported macOS.
- Obsolete/vendor-unsupported browsers and Internet Explorer are excluded. A universal “all browsers” promise is not testable or supportable.
- Android: Android 15 and later, with the exact physical-device matrix chosen in S1.
- iOS: the current major iOS release and two prior major releases at launch, subject to real-device feasibility results.
- Responsive behavior outside the supported matrix is best effort; dedicated mobile functionality is validated in the native apps.

### Identity and authorization

- Every person has an individual login. No shared credentials and no “child login” owned by a director/producer.
- A film membership links a user to a film. A user may hold different roles in different films.
- Roles and permissions are stored in database tables and evaluated by the API, workers, WebSocket rooms, files, and exports—not only by UI visibility.
- Default role bundles can be adjusted through controlled, audited permission overrides. New roles do not require hard-coded UI authorization changes.
- Super Admin is a platform role and is never inherited inside a film.

### Super Admin privacy boundary

The Super Admin dashboard may show accounts, films, membership counts, storage/usage totals, system health, failed jobs, security events, abuse reports, and audit metadata.

By default, Super Admin cannot read or edit screenplay bodies, AI prompts/responses, provider secrets, or private file contents. Emergency support access must be:

1. Started for a recorded support/security reason.
2. Limited to the minimum film and permission set.
3. Time-limited and automatically revoked.
4. Fully audited, including views/downloads/changes.
5. Visible later to the film owner, except where a documented legal restriction applies.

Super Admin may suspend an account, revoke sessions, quarantine a malicious upload, disable a compromised integration, retry safe jobs, and restore service according to runbooks. Super Admin does not silently rewrite a user's screenplay.

## 3. Proposed film role model for approval

A registered director or producer who creates a film becomes its **Film Owner**. The owner can delegate **Film Admin** to another director or producer. A member may have more than one role where needed.

| Default role | Intended access |
|---|---|
| Film Owner | Full film control, membership, settings, creative and production data, approvals, export, deletion request, and ownership transfer. Exactly one accountable owner is required at a time. |
| Film Admin | Manage members and most film settings; full creative/production access; approve/lock/export. Cannot silently transfer ownership, permanently erase the film, or change the owner's security settings. |
| Director | Read/edit story, screenplay, characters, scenes, continuity and revisions; comment, review, approve/lock creative versions; read production information. Membership/budget powers require an added permission. |
| Producer | Read all film material; manage production, scheduling, budgets, reports, members, approvals and exports. Screenplay editing requires an added creative permission. |
| Screenwriter | Create/edit story, screenplay, characters and scenes; use revisions/comments; view continuity; export drafts when permitted. Cannot manage members or production budgets by default. |
| Co-writer | Edit assigned/all creative material as configured, comment and participate in revisions. Cannot approve/lock, manage members, or delete the film by default. |
| Dialogue Writer | Edit dialogue-related blocks and character voice material, create suggestions/comments, and view necessary scene context. Broader screenplay editing requires an added permission. |
| Script Editor | Review/edit screenplay and revisions, comment, compare versions, and propose changes. Approval/locking is separately granted. This is distinct from a picture/video editor. |
| Production Manager | Manage breakdowns, locations/elements, schedules, production reports and assigned budget data; read the approved screenplay. Cannot rewrite the screenplay by default. |
| Reviewer | Read assigned material and add comments/annotations; cannot directly change canonical content, manage members, export confidential files, or view budgets unless granted. |

### Permission groups implemented behind the roles

- `film.manage_settings`
- `film.manage_members`
- `film.transfer_ownership`
- `film.request_deletion`
- `creative.read`, `creative.edit`, `creative.approve`, `creative.lock`
- `characters.manage`, `scenes.manage`, `continuity.manage`
- `comments.create`, `comments.moderate`
- `production.read`, `production.manage`
- `schedule.manage`
- `budget.read`, `budget.manage`, `budget.approve`
- `ai.use`, `ai.configure_provider`, `ai.view_history`
- `files.upload`, `files.download`
- `exports.create`, `exports.download`
- `audit.read`

**Owner input required:** Approve this role model or list changes, particularly:

- Can both directors and producers create films? `[Approve / Change: ______]`
- Can Film Admin invite/remove other admins? `[Approve / Change: ______]`
- Can producers see and edit the screenplay by default? `[Approve / Change: ______]`
- Can directors see/edit budgets by default? `[Approve / Change: ______]`
- Who may approve and lock a screenplay? `[Answer: ______]`
- Who may export confidential screenplay/production files? `[Answer: ______]`
- Should Dialogue Writers be limited to dialogue blocks? `[Answer: ______]`
- Is “Script Editor” the intended meaning of editor, or is a film/video Editor role also needed? `[Answer: ______]`

## 4. Product identity and audience

**Owner input required:**

1. Final product name: `[Storyforge Studio / other: ______]`
2. Company/legal owner name: `[______]`
3. Primary launch country/market: `[______]`
4. Priority users: `[independent filmmakers / production houses / studios / education / other: ______]`
5. Brand assets available: `[logo / colors / fonts / none yet]`
6. Public website domain and support email, if owned: `[______]`
7. Expected launch scale: number of registered users, active films, members per film, and concurrent collaborators: `[______]`

## 5. Film-domain reference pack

Provide shareable, non-confidential or synthetic examples. These are acceptance references, not training data unless separately authorized.

**Owner input required:**

1. One complete Telugu screenplay and, if possible, one mixed Telugu/English screenplay.
2. Desired Telugu and international screenplay PDF examples showing page size, margins, headings, dialogue, continuations, and page numbers.
3. Character profile/relationship/arc examples.
4. Scene outline, beat sheet, sequence breakdown, and story-bible examples.
5. Continuity checklist and examples of intentional versus accidental continuity differences.
6. Production breakdown sheet with the element categories you expect.
7. Shooting schedule/stripboard example and the constraints that matter in your productions.
8. Budget workbook example, including INR categories, tax/contingency treatment, rate cards, and low/high estimates.
9. Pitch deck, coverage report, synopsis, treatment, and production-report examples.
10. Import/export fixtures you are allowed to share: DOCX, PDF, TXT, Fountain, FDX, CSV, and XLSX.

If an example cannot be shared, describe the fields and workflow or arrange a domain review using synthetic content.

## 6. Ownership, privacy, retention, and support access

**Owner input required:**

1. Who legally owns film content: the individual Film Owner, their production company, or another entity? `[______]`
2. What happens to a user's access and offline copy when removed from a film? `[Recommended: network access revoked immediately; encrypted local cache locked; owner-approved recovery of unsynced work for a short defined period.]`
3. Recovery window for deleted scenes/documents/films: `[Recommended starting proposal: 30 days; approve/change: ______]`
4. Account deletion and film deletion approval process: `[______]`
5. Backup retention and legal-hold needs: `[______]`
6. May Super Admin use the audited break-glass process described above? `[Approve / Change: ______]`
7. Should the Film Owner be notified after support accesses film content? `[Recommended: yes; approve/change: ______]`
8. Minimum age or educational/minor use expected? `[______]`
9. Privacy/legal contact who will approve Terms and Privacy Policy: `[______]`

## 7. Sign-up and account recovery experience

The CTO will select a secure standards-based identity implementation after hosting and cost review. The owner chooses the user experience.

**Owner input required:**

1. Allowed sign-in methods: `[email/password / passwordless email / passkey / Google / Apple / combination: ______]`
2. Is email verification mandatory? `[Recommended: yes]`
3. Is multifactor authentication mandatory for Film Admins? `[CTO recommendation: yes]`
4. Account recovery approval: `[verified email / support-assisted with identity checks / other: ______]`
5. May a Film Admin invite an email address that has not registered yet? `[Recommended: yes, expiring invitation]`

## 8. AI operating policy

AI remains optional and cannot be required for core writing, saving, sync, export, continuity rules, or production calculations.

**Owner input required:**

1. Provider preference, if any: `[OpenAI / Anthropic / Gemini / compatible endpoint / local / no preference]`
2. Credential model: `[user supplies key (BYOK) / platform pays / both / undecided]`
3. May screenplay excerpts be sent to approved third-party providers after exact preview and consent? `[yes/no]`
4. Maximum per-request/per-film cost policy: `[______]`
5. Should AI history be retained with the film, and for how long? `[______]`
6. Are local/on-premise models a launch requirement or future option? `[______]`
7. Who may configure providers and who may run AI jobs? `[______]`

## 9. Notifications and collaboration

**Owner input required:**

1. Launch notification channels: `[in-app / email / push / combination: ______]`
2. Events needing notification: invitations, comments, mentions, approvals, exports, AI jobs, sync conflicts, security alerts: `[approve all / changes: ______]`
3. Are read receipts or presence indicators required? `[______]`
4. Who may resolve comments and conflicts? `[______]`
5. Is an approval chain required before a screenplay becomes an approved/shooting version? `[describe: ______]`

## 10. Hosting, release, and operational ownership

The CTO will evaluate vendors and propose the secure/cost-effective stack. The following owner-controlled assets and constraints are still required.

**Owner input required:**

1. Monthly infrastructure budget range during development and after launch: `[______]`
2. Preferred hosting country/region or “CTO recommend”: `[______]`
3. Domain/DNS owner: `[______]`
4. Transactional email sender/domain owner: `[______]`
5. Apple Developer account owner: `[______ / not created]`
6. Google Play Console account owner: `[______ / not created]`
7. Production support contact and intended support hours: `[______]`
8. Who approves production launch and emergency rollback? `[______]`
9. Any fixed launch date or external commitment? `[______]`
10. Maximum acceptable planned maintenance window: `[______]`

## 11. Performance and scale acceptance inputs

**Owner input required:** Provide expected maximums or approve CTO test baselines during S0.

- Screenplay pages/scenes/blocks per film: `[______]`
- Characters and locations per film: `[______]`
- Files and total storage per film: `[______]`
- Members and simultaneous editors per film: `[______]`
- Maximum offline period before reconnect: `[______]`
- Maximum acceptable local save, sync, search, export, and app-start times: `[______]`
- Required service availability and acceptable recovery time after an outage: `[______]`

## 12. Approval record

After completion, record:

- Product owner name/role: `[______]`
- Film-domain reviewer name/role: `[______]`
- Date approved: `[______]`
- Sections approved with recommended defaults: `[______]`
- Open decisions with named owner and due gate: `[______]`

