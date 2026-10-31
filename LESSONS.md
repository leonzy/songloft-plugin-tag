# 开发经验 / Development lessons

## LYR-001：识别正确不代表补充歌词正确

2026-10-31，leonFN 日志显示《一无所有》声纹识别为崔健、0.98，但 enrichment 采用咪咕 0.42 的候选，再兜底下载 QQ 歌词；实际保存文本含 `[ti:错]`。原算法取最高分而无身份约束，兜底又遍历所有候选，专辑相同、歌手相同也会借入不同歌曲。现在补充字段只使用歌名与完整歌手身份均一致的候选，下载后的 LRC 若明确标注不同标题/歌手则丢弃并返回诊断；升级结果缓存命名空间，旧错误补充不再复用。真实反例的两个 enrichment 回归在旧代码失败，52 项回归通过。Seen 1×。

English: On 2026-10-31 NAS logs identified Cui Jian's “一无所有” at 0.98 fingerprint confidence, then selected a 0.42 Migu enrichment and borrowed QQ lyrics tagged `[ti:错]`. Highest-score selection lacked an identity gate and fallback traversed unrelated candidates. Enrichment now requires the correct title and complete artist names; conflicting LRC title/artist headers are rejected with diagnostics. A new result-cache namespace excludes old unsafe enrichments. Two real-counterexample enrichment regressions fail on old code; all 52 tests pass. Seen 1×.
