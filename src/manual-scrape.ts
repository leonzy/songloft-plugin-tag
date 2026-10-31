import { jsonResponse } from '@songloft/plugin-sdk';
import { doScrape } from './scraper';
import { loadConfig } from './sources';

/** Error diagnostics must never disclose configured API addresses or keys. */
export function safeScrapeReason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[服务地址]')
    .replace(/((?:api[_-]?key|token|password|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .slice(0, 1200);
}

export function registerManualScrapeRoutes(router: { post: (path: string, handler: any) => void }): void {
  // Unlike /scrape/:id, this never writes tags, backups, or completion markers.
  router.post('/scrape/prepare/:id', async (_req: unknown, params: Record<string, string>) => {
    const id = Number(params?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonResponse({ error: '无效的歌曲 ID' }, 400);
    const reasons: string[] = [];
    try {
      const config = await loadConfig();
      const result = await doScrape(id, config, {
        skipCache: true,
        allowLowScore: true,
        onDiagnostic: reason => reasons.push(safeScrapeReason(reason)),
      });
      if (!result) {
        return jsonResponse({ error: '刮削未成功', detail: [...new Set(reasons)].join('\n') || '所有已启用的刮削源均无匹配结果' }, 422);
      }
      return jsonResponse({ result: { ...result, score_threshold: config.score_threshold,
        below_threshold: result.score < config.score_threshold, diagnostics: [...new Set(reasons)] } });
    } catch (error) {
      return jsonResponse({ error: '刮削失败', detail: safeScrapeReason(error) }, 502);
    }
  });
}
