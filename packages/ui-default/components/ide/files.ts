export const IDE_FILE_BYTES = 128 * 1024;
export interface CodeFile { id: string; name: string; lang: string; code?: string; revision: number; updatedAt: string }
export function fileLanguage(name: string, current: string, available: Record<string, any>) {
  const extension = name.split('.').pop()?.toLowerCase();
  const family = extension === 'c' ? 'c' : extension === 'py' ? 'python' : ['cpp', 'cc', 'cxx', 'h', 'hpp'].includes(extension || '') ? 'cpp' : '';
  const matches = (lang: string) => family === 'python' ? lang === 'py3' || /^py[.]/.test(lang) || available[lang]?.monaco === 'python'
    : family === 'cpp' ? lang === 'cc' || /^cc[.]/.test(lang) || available[lang]?.monaco === 'cpp' : family === 'c' ? lang === 'c' : lang === current;
  return matches(current) ? current : Object.keys(available).find(matches) || '';
}
export function codeFileName(name: string, lang: string) {
  const value = (name || '我的程序').trim().replace(/[\x00-\x1f\x7f/\\]/g, '').slice(0, 72) || '我的程序';
  return /\.[a-z0-9]+$/i.test(value) ? value : `${value}${lang === 'py3' || lang.startsWith('py.') ? '.py' : lang === 'c' ? '.c' : '.cpp'}`;
}
export function validateLocalCode(file: File, text: string) {
  if (file.size > IDE_FILE_BYTES || new TextEncoder().encode(text).length > IDE_FILE_BYTES) throw new Error('代码文件不能超过 128 KB。');
  if (text.includes('\0') || !/\.(py|cpp|cc|cxx|c|h|hpp|txt)$/i.test(file.name)) throw new Error('请选择 Python、C++ 或文本代码文件。');
  return text.replace(/^\uFEFF/, '');
}
