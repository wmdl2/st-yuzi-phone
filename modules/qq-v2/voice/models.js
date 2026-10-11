import { t } from '../../i18n/index.js';
import {
    normalizeQQVoiceBaseUrl, QQ_VOICE_MODELS, QQ_VOICE_OFFICIAL_HOST, QQV2VoiceError,
} from './fish-client.js';

/** Fish 的 /model 是音色目录；官方合成模型用已声明的名单，中转查询 /models。 */
export async function loadQQVoiceModels(input = {}) {
    const baseUrl = normalizeQQVoiceBaseUrl(input.baseUrl);
    if (new URL(baseUrl).hostname.toLowerCase() === QQ_VOICE_OFFICIAL_HOST) {
        return { models: [...QQ_VOICE_MODELS], source: 'official' };
    }
    const apiKey = String(input.apiKey ?? '').trim();
    if (!apiKey || /[\r\n]/u.test(apiKey)) {
        throw new QQV2VoiceError(t("请先填写或保存密钥"), 'voice_api_key_missing');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (input.signal?.aborted) abort();
    else input.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 30000);
    const endpoint = `${baseUrl.replace(/\/+$/u, '')}/models`;
    try {
        const response = await (input.fetchImpl || globalThis.fetch)(
            input.directFetch === true ? endpoint : `/proxy/${endpoint}`,
            { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal, redirect: 'error' },
        );
        if (!response.ok) {
            throw new QQV2VoiceError(t`模型查询返回 HTTP ${response.status}，可继续手写模型`, 'voice_models_failed');
        }
        const data = await response.json();
        const entries = Array.isArray(data) ? data : (data?.data || data?.models || []);
        const models = Array.isArray(entries) ? [...new Set(entries
            .map(entry => String(typeof entry === 'string' ? entry : entry?.id ?? '').trim())
            .filter(model => model && model.length <= 120 && !/[\r\n]/u.test(model)))].slice(0, 2000) : [];
        if (!models.length) throw new QQV2VoiceError(t("服务未返回可用模型，可继续手写模型"), 'voice_models_empty');
        return { models, source: 'service' };
    } catch (error) {
        if (error instanceof QQV2VoiceError) throw error;
        throw new QQV2VoiceError(t("模型列表加载失败，可继续手写模型"), 'voice_models_failed');
    } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', abort);
    }
}
