import moment from 'moment-timezone';
import { Context } from '../context';
import assetStorage from '../lib/asset_storage';
import { AssetReferenceGate, createAssetStorageModel } from '../lib/asset_storage_model';
import db from '../service/db';
import storage from '../service/storage';
import ScheduleModel from './schedule';
import system from './system';

declare module '../service/db' {
    interface Collections { 'storage.asset': AssetReferenceGate }
}

export class StorageModel extends createAssetStorageModel({
    coll: db.collection('storage'), assets: db.collection('storage.asset'), storage, assetStorage,
}) {}

async function cleanFiles() {
    const submissionKeepDate = system.get('submission.saveDays');
    if (submissionKeepDate) {
        const shouldDelete = moment().subtract(submissionKeepDate, 'day').toDate();
        const res = await StorageModel.coll.find({
            path: /^submission\//g,
            lastModified: { $lt: shouldDelete },
        }).toArray();
        const paths = res.map((i) => i.path);
        await StorageModel.del(paths);
    }
    if (system.get('server.keepFiles')) return;
    await StorageModel.cleanFiles();
}

export async function apply(ctx: Context) {
    await StorageModel.recoverAbandonedGates();
    ctx.on('domain/delete', async (domainId) => {
        const [problemFiles, contestFiles, trainingFiles] = await Promise.all([
            StorageModel.list(`problem/${domainId}`),
            StorageModel.list(`contest/${domainId}`),
            StorageModel.list(`training/${domainId}`),
        ]);
        await StorageModel.del(problemFiles.concat(contestFiles).concat(trainingFiles).map((i) => i.path));
    });
    await ctx.inject(['worker'], (c) => {
        c.worker.addHandler('storage.prune', cleanFiles);
    });
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    await db.ensureIndexes(
        StorageModel.coll,
        { key: { path: 1 }, name: 'path' },
        { key: { path: 1, autoDelete: 1 }, sparse: true, name: 'autoDelete' },
        { key: { link: 1 }, sparse: true, name: 'link' },
        { key: { 'remoteAsset.key': 1, 'remoteAsset.bucket': 1, 'remoteAsset.region': 1 }, sparse: true, name: 'remoteAsset' },
    );
    if (!await ScheduleModel.count({ type: 'schedule', subType: 'storage.prune' })) {
        await ScheduleModel.add({
            type: 'schedule',
            subType: 'storage.prune',
            executeAfter: moment().startOf('hour').toDate(),
            interval: [1, 'hour'],
        });
    }
}

global.Hydro.model.storage = StorageModel;
export default StorageModel;
