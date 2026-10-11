import { t } from '../../i18n/index.js';
import { applyQQVoiceSettingsPatch, normalizeQQVoiceSettings, QQ_VOICE_API_KEY_ID } from './settings.js';

const STORAGE_KEY = 'qq-v2.resources.voice-presets';
const secretId = id => `qq-voice-preset:${id}`;
const text = (value, limit = 256) => String(value ?? '').trim().slice(0, limit);

function fail(message, code = 'voice_preset_invalid') {
    const error = new Error(message);
    error.code = code;
    throw error;
}

/** TTS 预设只拥有连接；密钥复用公共密钥库，音色仓库不属于任何预设。 */
export function createQQVoicePresetStore({ storage, apiKeys, cryptoApi = globalThis.crypto }) {
    let pending = Promise.resolve();
    const mutate = operation => {
        const result = pending.then(operation);
        pending = result.catch(() => {});
        return result;
    };
    const read = async () => {
        const state = await storage.get(STORAGE_KEY);
        return Array.isArray(state?.presets)
            ? { presets: state.presets.map(preset => ({ ...preset })), selectedPresetId: text(state.selectedPresetId) }
            : null;
    };
    const readKey = async id => {
        if (!id) return '';
        try {
            return await apiKeys.get(id);
        } catch (error) {
            if (error?.code === 'api_key_reentry_required') return '';
            throw error;
        }
    };
    const requireSelected = state => {
        const preset = state?.presets.find(item => item.presetId === state.selectedPresetId);
        return preset || fail(t("请先选择或保存 TTS 预设"), 'voice_preset_required');
    };
    const save = async (state, input, existing = null) => {
        const name = text(input.name ?? existing?.name, 120);
        if (!name) fail(t("请填写预设名称"));
        if (state.presets.some(item => item.name === name && item.presetId !== existing?.presetId)) {
            fail(t("已经存在同名 TTS 预设"));
        }
        const presetId = existing?.presetId || `voice-preset-${cryptoApi?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        const { apiKeySaved: _apiKeySaved, ...settings } = applyQQVoiceSettingsPatch(existing, input);
        const record = { presetId, name, ...settings };
        const apiKey = text(input.apiKey, 8192);
        if (/[\r\n]/u.test(apiKey)) fail(t("语音 API Key 无效"), 'voice_api_key_invalid');
        if (apiKey) await apiKeys.set(secretId(presetId), apiKey);
        if (existing) state.presets[state.presets.indexOf(existing)] = record;
        else state.presets.push(record);
        state.selectedPresetId = presetId;
        await storage.set(STORAGE_KEY, state);
        return presetId;
    };
    return Object.freeze({
        initialize: settings => mutate(async () => {
            if (await read()) return;
            const state = { presets: [], selectedPresetId: '' };
            await save(state, { ...normalizeQQVoiceSettings(settings), name: t("默认 TTS 预设"), apiKey: await readKey(QQ_VOICE_API_KEY_ID) });
            await apiKeys.delete(QQ_VOICE_API_KEY_ID);
        }),
        async snapshot() {
            await pending;
            const state = await read();
            return {
                selectedPresetId: state?.selectedPresetId || '',
                presets: await Promise.all((state?.presets || []).map(async preset => ({
                    ...preset, apiKeySaved: Boolean(await readKey(secretId(preset.presetId))),
                }))),
            };
        },
        async connection(presetId = null) {
            await pending;
            const state = await read();
            if (!state) return null;
            const preset = state.presets.find(item => item.presetId === (presetId === null ? state.selectedPresetId : text(presetId)));
            return {
                settings: normalizeQQVoiceSettings(preset),
                apiKey: preset ? await readKey(secretId(preset.presetId)) : '',
            };
        },
        save: input => mutate(async () => {
            const state = await read();
            if (!state) fail(t("TTS 预设尚未初始化"));
            const id = text(input.presetId);
            const existing = id ? state.presets.find(item => item.presetId === id) : null;
            if (id && !existing) fail(t("TTS 预设不存在"), 'voice_preset_not_found');
            return save(state, input, existing);
        }),
        updateSettings: patch => mutate(async () => {
            const state = await read();
            return save(state, patch, requireSelected(state));
        }),
        select: id => mutate(async () => {
            const state = await read();
            const presetId = text(id);
            if (!state?.presets.some(item => item.presetId === presetId)) {
                fail(t("TTS 预设不存在"), 'voice_preset_not_found');
            }
            state.selectedPresetId = presetId;
            await storage.set(STORAGE_KEY, state);
        }),
        delete: id => mutate(async () => {
            const state = await read();
            const presetId = text(id);
            if (!state?.presets.some(item => item.presetId === presetId)) return false;
            state.presets = state.presets.filter(item => item.presetId !== presetId);
            if (state.selectedPresetId === presetId) state.selectedPresetId = '';
            await storage.set(STORAGE_KEY, state);
            await apiKeys.delete(secretId(presetId));
            return true;
        }),
        setApiKey: value => mutate(async () => {
            const state = await read();
            const apiKey = text(value, 8192);
            if (/[\r\n]/u.test(apiKey)) fail(t("语音 API Key 无效"), 'voice_api_key_invalid');
            const id = state ? secretId(requireSelected(state).presetId) : QQ_VOICE_API_KEY_ID;
            if (apiKey) await apiKeys.set(id, apiKey);
            else await apiKeys.delete(id);
            return Boolean(apiKey);
        }),
    });
}
