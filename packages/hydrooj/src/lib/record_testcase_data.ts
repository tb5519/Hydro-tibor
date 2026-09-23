import { load } from 'js-yaml';
import type { Readable } from 'stream';
import type { TestCase } from '@hydrooj/common';
import { convertIniConfig, normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/common';
import { readYamlCases } from '@hydrooj/common/cases';
import type { ProblemDoc, User } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import problem from '../model/problem';
import storage from '../model/storage';

const PREVIEW_FILE_LIMIT = 128 * 1024;
const PREVIEW_TOTAL_LIMIT = 1024 * 1024;
const PREVIEW_CASE_LIMIT = 200;
const PREVIEW_UNIQUE_FILE_LIMIT = 400;
const CONFIG_INI_LIMIT = 128 * 1024;

export interface TestcaseFilePreview {
    name: string;
    content: string;
    size: number;
    truncated: boolean;
    missing: boolean;
}

export interface TestcaseDataPreview {
    input: TestcaseFilePreview;
    output: TestcaseFilePreview;
}

export type RecordTestcaseData = Record<string, Record<string, TestcaseDataPreview>>;

type TestdataViewer = Pick<User, 'hasPerm' | 'hasPriv' | 'own'>;

export function canViewRecordTestcaseData(viewer: TestdataViewer, pdoc: ProblemDoc) {
    return viewer.own(pdoc)
        || viewer.hasPriv(PRIV.PRIV_READ_PROBLEM_DATA)
        || viewer.hasPerm(PERM.PERM_READ_PROBLEM_DATA);
}

function emptyPreview(name: string): TestcaseFilePreview {
    return {
        name,
        content: '',
        size: 0,
        truncated: false,
        missing: false,
    };
}

async function readTextPreview(stream: Readable, limit: number) {
    const chunks: Buffer[] = [];
    let length = 0;
    let truncated = false;
    for await (const value of stream) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const available = Math.max(0, limit - length);
        if (chunk.length > available) {
            if (available) chunks.push(chunk.subarray(0, available));
            length += available;
            truncated = true;
            break;
        }
        chunks.push(chunk);
        length += chunk.length;
    }
    if (truncated && !stream.destroyed) stream.destroy();
    return { content: Buffer.concat(chunks).toString('utf8'), length, truncated };
}

function parseRawConfig(rawConfig: ProblemDoc['config']) {
    if (typeof rawConfig !== 'string') return rawConfig || {};
    if (!rawConfig.trim()) return {};
    const parsed = load(rawConfig);
    return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Resolve the same (subtask id, case id) pairs used by the judge into testdata
 * filenames. This deliberately returns filenames only; callers still have to
 * enforce the data-read permission before opening storage objects.
 */
export async function resolveRecordTestcaseFiles(
    rawConfig: ProblemDoc['config'], filenames: string[], rawIniConfig?: string,
) {
    const parsedConfig = rawIniConfig === undefined ? parseRawConfig(rawConfig) : convertIniConfig(rawIniConfig);
    const config = await readYamlCases(parsedConfig as any);
    const configuredSubtasks = config.subtasks?.length
        ? config.subtasks
        : readSubtasksFromFiles(filenames, config);
    if (!configuredSubtasks?.length) return new Map<string, { input: string, output: string }>();
    const normalized = normalizeSubtasks(
        configuredSubtasks,
        (name) => name,
        config.time,
        config.memory,
        true,
    );
    const result = new Map<string, { input: string, output: string }>();
    for (const subtask of normalized) {
        for (const testcase of subtask.cases) {
            result.set(`${subtask.id}:${testcase.id}`, {
                input: testcase.input,
                output: testcase.output,
            });
        }
    }
    return result;
}

/**
 * Load bounded, text-only previews of the current problem testdata for record
 * cases. Unauthorized callers receive null and no testdata object is opened.
 *
 * Reference problems intentionally return an empty authorized result. Their
 * source data may belong to another domain, where the viewer can have different
 * permissions; silently inheriting the target-domain permission would leak it.
 */
export async function loadRecordTestcaseData(
    viewer: TestdataViewer,
    domainId: string,
    pid: number,
    testCases: TestCase[] = [],
): Promise<RecordTestcaseData | null> {
    const accessPdoc = await problem.get(domainId, pid, [
        'domainId', 'docId', 'pid', 'owner', 'maintainer', 'reference',
    ], true);
    if (!accessPdoc || !canViewRecordTestcaseData(viewer, accessPdoc)) return null;
    if (accessPdoc.reference) return {};

    const dataPdoc = await problem.get(domainId, pid, [
        'domainId', 'docId', 'data', 'config',
    ], true);
    if (!dataPdoc) return {};
    const files = new Map((dataPdoc.data || []).map((file) => [file.name, file]));
    let rawIniConfig: string | undefined;
    const iniFile = files.get('config.ini');
    const hasYamlConfig = files.has('config.yaml') || files.has('config.yml');
    if (!hasYamlConfig && iniFile && (!iniFile.size || iniFile.size <= CONFIG_INI_LIMIT)) {
        try {
            const stream = await storage.get(
                `problem/${domainId}/${dataPdoc.docId}/testdata/config.ini`,
            ) as Readable;
            const loaded = await readTextPreview(stream, CONFIG_INI_LIMIT);
            if (!loaded.truncated && (!iniFile.size || iniFile.size <= loaded.length)) rawIniConfig = loaded.content;
        } catch { /* Fall back to YAML/filename discovery below. */ }
    }
    let caseFiles: Awaited<ReturnType<typeof resolveRecordTestcaseFiles>>;
    try {
        caseFiles = await resolveRecordTestcaseFiles(dataPdoc.config, [...files.keys()], rawIniConfig);
    } catch {
        return {};
    }

    let remaining = PREVIEW_TOTAL_LIMIT;
    let displayRemaining = PREVIEW_TOTAL_LIMIT;
    const cache = new Map<string, TestcaseFilePreview>();
    const requestedFiles = new Set<string>();
    const previewFile = async (name: string): Promise<TestcaseFilePreview | null> => {
        if (!name || name === '/dev/null') return emptyPreview(name || '/dev/null');
        if (cache.has(name)) return cache.get(name)!;
        if (requestedFiles.size >= PREVIEW_UNIQUE_FILE_LIMIT) return null;
        requestedFiles.add(name);
        const file = files.get(name);
        if (!file) {
            const missing = {
                name,
                content: '',
                size: 0,
                truncated: false,
                missing: true,
            };
            cache.set(name, missing);
            return missing;
        }
        const limit = Math.max(0, Math.min(PREVIEW_FILE_LIMIT, remaining));
        if (!limit) {
            const omitted = {
                name,
                content: '',
                size: file.size || 0,
                truncated: true,
                missing: false,
            };
            cache.set(name, omitted);
            return omitted;
        }
        try {
            const stream = await storage.get(`problem/${domainId}/${dataPdoc.docId}/testdata/${name}`) as Readable;
            const loaded = await readTextPreview(stream, limit);
            remaining -= loaded.length;
            const result = {
                name,
                content: loaded.content,
                size: file.size || loaded.length,
                truncated: loaded.truncated || (file.size || 0) > loaded.length,
                missing: false,
            };
            cache.set(name, result);
            return result;
        } catch {
            const missing = {
                name,
                content: '',
                size: file.size || 0,
                truncated: false,
                missing: true,
            };
            cache.set(name, missing);
            return missing;
        }
    };

    const requestedCases = (testCases.length
        ? testCases
        : [...caseFiles.keys()].map((key) => {
            const [subtaskId, id] = key.split(':').map(Number);
            return { subtaskId, id } as TestCase;
        })).slice(0, PREVIEW_CASE_LIMIT);
    const result: RecordTestcaseData = {};
    const displayPreview = (preview: TestcaseFilePreview): TestcaseFilePreview => {
        // Reused files are read once, but rendered once per testcase. Bound the
        // serialized page/WS payload too, without modifying the shared cache.
        const bytes = Buffer.from(preview.content);
        const length = Math.min(bytes.length, displayRemaining);
        displayRemaining -= length;
        return length === bytes.length ? preview : {
            ...preview,
            content: bytes.subarray(0, length).toString('utf8'),
            truncated: true,
        };
    };
    for (const testcase of requestedCases) {
        const key = `${testcase.subtaskId ?? 1}:${testcase.id ?? 1}`;
        const pair = caseFiles.get(key);
        if (!pair) continue;
        // Keep the shared preview budget deterministic; parallel reads could
        // both reserve the same remaining bytes and exceed the total cap.
        // eslint-disable-next-line no-await-in-loop
        const input = await previewFile(pair.input);
        // eslint-disable-next-line no-await-in-loop
        const output = await previewFile(pair.output);
        if (!input || !output) continue;
        const subtaskId = String(testcase.subtaskId ?? 1);
        const caseId = String(testcase.id ?? 1);
        result[subtaskId] ||= {};
        result[subtaskId][caseId] = { input: displayPreview(input), output: displayPreview(output) };
    }
    return result;
}
