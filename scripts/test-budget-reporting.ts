import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import { Pool } from 'pg';
import { PostgresBudgetRepository } from '../backend/src/database/postgres-budget.repository.js';

const userOne = '018f4ce4-7a86-7f2e-96df-bf4e914f21d4';
const userTwo = '018f4ce4-82c4-7808-ae50-28293c570bd5';
const organizationOne = '018f4ce4-a249-79aa-94a6-09195b7d91cf';
const organizationTwo = '018f4ce4-a999-79aa-94a6-09195b7d9999';
const filmOne = '018f4ce4-b3df-75c9-8d26-424bb512c0cf';
const filmTwo = '018f4ce4-bb66-72e0-b28c-2584ed4f30e2';

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

    // Seed users, orgs, films
    await database.exec(`
      INSERT INTO users (id, display_name, primary_email) VALUES
        ('${userOne}', 'Executive Producer', 'ep@studio.test'),
        ('${userTwo}', 'Rival Producer', 'rival@studio.test');

      SELECT set_config('app.user_id', '${userOne}', false);
      SELECT app_security.create_organization('${organizationOne}', 'Mythri Movie Makers');
      SELECT app_security.create_film('${filmOne}', '${organizationOne}', 'Salaar Part 2: Shouryaanga Parvam');

      SELECT set_config('app.user_id', '${userTwo}', false);
      SELECT app_security.create_organization('${organizationTwo}', 'Isolated Studio');
      SELECT app_security.create_film('${filmTwo}', '${organizationTwo}', 'Isolated Budget Film');
    `);

    const pool = new Pool(createPgConfig(database));
    const repo = new PostgresBudgetRepository(pool);
    const client = await pool.connect();

    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [userOne]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmOne]);

      // 1. Create Production Budget with INR-first currency, 10% contingency, 18% GST
      const budgetTitle = 'ప్రధాన నిర్మాణ బడ్జెట్ (Master Principal Production Budget)';
      const budget = await repo.createBudget(
        {
          filmId: filmOne,
          title: budgetTitle,
          currency: 'INR',
          contingencyPercentage: 10.0,
          taxPercentage: 18.0,
          notes: 'మొదటి విడత చిత్రీకరణకు కేటాయించిన బడ్జెట్ వివరాలు',
        },
        userOne,
        client,
      );

      assert.equal(budget.title, budgetTitle);
      assert.equal(budget.versionNumber, 1);
      assert.equal(budget.currency, 'INR');
      assert.equal(budget.contingencyPercentage, 10.0);
      assert.equal(budget.taxPercentage, 18.0);
      assert.equal(budget.status, 'draft');
      process.stdout.write('  ✓ Production Budget created with INR-first currency, versioning, and tax policy\n');

      // 2. Create Rate Cards across chart-of-accounts categories
      const dopRateCard = await repo.createRateCard(
        {
          filmId: filmOne,
          name: 'సినిమాటోగ్రాఫర్ (Director of Photography - Daily Package)',
          category: 'below_the_line_production',
          rateUnit: 'daily',
          standardRateCents: 15000000, // ₹1,50,000.00 / day
          overtimeRateCents: 2500000,  // ₹25,000.00 / hr
          currency: 'INR',
          notes: 'Includes chief assistant and focus puller',
        },
        client,
      );

      const vfxRateCard = await repo.createRateCard(
        {
          filmId: filmOne,
          name: 'VFX క్లిష్టమైన సన్నివేశాల షాట్ ప్యాకేజ్ (High Complexity VFX Shot)',
          category: 'below_the_line_post',
          rateUnit: 'per_item',
          standardRateCents: 50000000, // ₹5,00,000.00 / shot
          currency: 'INR',
          notes: 'Creature simulation & crowd multiplication',
        },
        client,
      );

      assert.equal(dopRateCard.standardRateCents, 15000000);
      assert.equal(vfxRateCard.standardRateCents, 50000000);
      process.stdout.write('  ✓ Production Rate Cards created with standard and overtime rates\n');

      // 3. Create Budget Line Items across all 4 categories
      // Above The Line: Director Fee
      const directorItem = await repo.createLineItem(
        {
          filmId: filmOne,
          budgetId: budget.id,
          accountCode: '1100',
          category: 'above_the_line',
          description: 'దర్శకత్వం & కథా సహకారం (Director Services)',
          quantity: 1,
          unit: 'flat',
          unitRateCents: 1000000000, // ₹10,00,000.00 (10 Lakhs)
          fringePercentage: 0,
          assumptions: 'Milestone-based delivery: 25% script lock, 50% wrap, 25% final cut',
          sortOrder: 1,
        },
        client,
      );

      // Below The Line Production: DoP package for 30 shoot days
      const dopItem = await repo.createLineItem(
        {
          filmId: filmOne,
          budgetId: budget.id,
          rateCardId: dopRateCard.id,
          accountCode: '2100',
          category: 'below_the_line_production',
          description: 'సినిమాటోగ్రఫీ యూనిట్ కాల్ డేస్ (Camera Unit 30 Shoot Days)',
          quantity: 30,
          unit: 'days',
          unitRateCents: 15000000, // ₹1,50,000/day * 30 days = ₹45,00,000
          fringePercentage: 5, // 5% crew welfare / insurance fringe
          assumptions: '30 principal shoot days + travel days covered',
          sortOrder: 2,
        },
        client,
      );

      // Below The Line Post: 10 complex VFX shots
      const vfxItem = await repo.createLineItem(
        {
          filmId: filmOne,
          budgetId: budget.id,
          rateCardId: vfxRateCard.id,
          accountCode: '3200',
          category: 'below_the_line_post',
          description: 'క్లైమాక్స్ యుద్ధం VFX షాట్లు (Climax Battle VFX 10 Shots)',
          quantity: 10,
          unit: 'shots',
          unitRateCents: 50000000, // ₹5,00,000 * 10 = ₹50,00,000
          fringePercentage: 0,
          assumptions: 'Delivered in 4K EXR ACES color pipeline',
          sortOrder: 3,
        },
        client,
      );

      // Other / Overheads: Film Production Insurance
      const insuranceItem = await repo.createLineItem(
        {
          filmId: filmOne,
          budgetId: budget.id,
          accountCode: '4100',
          category: 'other_production',
          description: 'సమగ్ర చలనచిత్ర బీమా పాలసీ (Comprehensive Film Insurance Policy)',
          quantity: 1,
          unit: 'policy',
          unitRateCents: 50000000, // ₹5,00,000
          fringePercentage: 0,
          assumptions: 'Covers cast non-appearance, negative insurance, third-party liability',
          sortOrder: 4,
        },
        client,
      );

      assert.equal(directorItem.estimatedTotalCents, 1000000000); // 10,000,000
      // 30 * 15,000,000 = 450,000,000 * 1.05 = 472,500,000
      assert.equal(dopItem.estimatedTotalCents, 472500000);
      assert.equal(vfxItem.estimatedTotalCents, 500000000);
      assert.equal(insuranceItem.estimatedTotalCents, 50000000);
      process.stdout.write('  ✓ Budget Line Items created with automated fringe calculations and estimates\n');

      // 4. Update actual cost on DoP item
      const updatedDopItem = await repo.updateLineItemActual(
        dopItem.id,
        filmOne,
        460000000, // Actual expense came in slightly lower: ₹46,00,000
        client,
      );
      assert.equal(updatedDopItem.actualCostCents, 460000000);
      process.stdout.write('  ✓ Actual cost logging and tracking verified\n');

      // 5. Generate and Verify Top Sheet Summary with Formula Precision
      const topSheet = await repo.getTopSheet(budget.id, filmOne, client);
      assert.ok(topSheet !== null);

      // Expected Subtotal = 1000000000 + 472500000 + 500000000 + 50000000 = 2022500000 (₹2,02,25,000.00)
      const expectedSubtotal = 1000000000 + 472500000 + 500000000 + 50000000;
      assert.equal(topSheet.subtotalCents, expectedSubtotal);

      // Contingency (10%) = 202250000
      const expectedContingency = Math.round(expectedSubtotal * 0.10);
      assert.equal(topSheet.contingencyCents, expectedContingency);

      // Tax (18% on Subtotal + Contingency)
      const taxable = expectedSubtotal + expectedContingency; // 2224750000
      const expectedTax = Math.round(taxable * 0.18); // 400455000
      assert.equal(topSheet.taxCents, expectedTax);

      // Grand Total = taxable + tax = 2625205000 (₹2,62,52,050.00)
      const expectedGrandTotal = taxable + expectedTax;
      assert.equal(topSheet.grandTotalCents, expectedGrandTotal);

      assert.equal(topSheet.categories.length, 4);
      process.stdout.write('  ✓ Top Sheet formulas verified with exact mathematical precision\n');

      // 6. Approve Budget Lifecycle
      const approvedBudget = await repo.approveBudget(budget.id, filmOne, userOne, client);
      assert.equal(approvedBudget.status, 'approved');
      assert.equal(approvedBudget.approvedBy, userOne);
      assert.ok(approvedBudget.approvedAt !== null);
      process.stdout.write('  ✓ Budget approval workflow completed\n');

      // 7. Cost Report Generation and Snapshot
      const costReport = await repo.generateCostReport(
        budget.id,
        filmOne,
        'top_sheet',
        'ఆమోదించబడిన బడ్జెట్ టాప్ షీట్ రిపోర్ట్ (Approved Top Sheet Report)',
        userOne,
        client,
      );
      assert.equal(costReport.reportType, 'top_sheet');
      assert.equal(costReport.grandTotalCents, expectedGrandTotal);
      assert.ok(costReport.reportPayload !== null);
      process.stdout.write('  ✓ Production Cost Report snapshot generated and persisted\n');

      // 8. CSV Export Generation
      const csvContent = await repo.generateCsvExport(budget.id, filmOne, client);
      assert.ok(csvContent.includes('Account Code,Category,Description'));
      assert.ok(csvContent.includes('1100,above_the_line'));
      assert.ok(csvContent.includes('SUBTOTAL'));
      assert.ok(csvContent.includes('CONTINGENCY (10%)'));
      assert.ok(csvContent.includes('TAX/GST (18%)'));
      assert.ok(csvContent.includes('GRAND TOTAL (INR ₹)'));
      process.stdout.write('  ✓ Multi-tier CSV budget export generated with formula summaries\n');

      // 9. Multi-tenant RLS Isolation
      await client.query("SELECT set_config('app.user_id', $1, false)", [userTwo]);
      await client.query("SELECT set_config('app.film_id', $1, false)", [filmTwo]);

      const intruderBudgets = await repo.listBudgets(filmOne, client);
      assert.equal(intruderBudgets.length, 0, 'Intruder sees 0 budgets');

      const intruderRateCards = await repo.listRateCards(filmOne, client);
      assert.equal(intruderRateCards.length, 0, 'Intruder sees 0 rate cards');

      const intruderTopSheet = await repo.getTopSheet(budget.id, filmOne, client);
      assert.equal(intruderTopSheet, null, 'Intruder cannot retrieve top sheet');

      process.stdout.write('  ✓ Multi-tenant RLS isolation verified for budgets, rate cards, and reports\n');

      process.stdout.write('Sprint 30 Budget & Production Reporting verified successfully.\n');
    } finally {
      client.release();
      await pool.end();
    }
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
