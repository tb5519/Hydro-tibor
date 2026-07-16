import Schema from 'schemastery';
import { migrateGlobalPointLotteryStates } from '../lib/point_lottery';
import { reconcileScorePoints } from '../model/contest';

export const apply = (ctx) => ctx.addScript(
    'migratePointLottery',
    'Migrates legacy per-domain lottery points into account-wide balances. Historical contest scores are not reissued by default.',
    Schema.object({
        // A legacy balance may already include points that were manually issued
        // or issued before the contest high-water marker existed. Replaying all
        // contests in that case credits the same score twice, so this repair is
        // intentionally opt-in rather than part of the normal migration.
        reconcile: Schema.boolean().default(false),
    }),
    async ({ reconcile }, report) => {
        const accounts = await migrateGlobalPointLotteryStates();
        if (!reconcile) {
            report({ message: `Migrated ${accounts} lottery point accounts. Historical contest scores were not replayed.` });
            return true;
        }
        const { contests, participants } = await reconcileScorePoints();
        report({
            message: `Migrated ${accounts} lottery point accounts; explicitly reconciled ${participants} participants in ${contests} contests.`,
        });
        return true;
    },
);
