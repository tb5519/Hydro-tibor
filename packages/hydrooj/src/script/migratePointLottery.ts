import Schema from 'schemastery';
import { migrateGlobalPointLotteryStates } from '../lib/point_lottery';
import { reconcileScorePoints } from '../model/contest';

export const apply = (ctx) => ctx.addScript(
    'migratePointLottery',
    'Migrates legacy per-domain lottery points into account-wide balances.',
    Schema.any(),
    async (_, report) => {
        const accounts = await migrateGlobalPointLotteryStates();
        const { contests, participants } = await reconcileScorePoints();
        report({ message: `Migrated ${accounts} lottery point accounts; reconciled ${participants} participants in ${contests} contests.` });
        return true;
    },
);
