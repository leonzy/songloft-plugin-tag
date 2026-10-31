export interface SourceDiagnostic { count: number; score: number; error?: string }
const LABELS: Record<string, string> = { qqmusic: 'QQ音乐', migu: '咪咕', netease: '网易云', kugou: '酷狗', kuwo: '酷我', acoustid: '音频指纹' };
export function sourceLabel(source: string): string { return LABELS[source] || source; }
export function formatSourceDiagnostic(source: string, value: SourceDiagnostic, threshold: number): string {
  const prefix = sourceLabel(source) + '：';
  if (!value.count) return prefix + (value.error ? `接口失败（${value.error}）` : '搜索成功，但没有候选歌曲');
  return prefix + `候选最高得分 ${value.score.toFixed(2)}，${value.score >= threshold ? '达到' : '低于'}阈值 ${threshold.toFixed(2)}`
    + (value.error ? '；部分搜索请求失败' : '');
}
