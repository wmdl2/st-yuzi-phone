import { t } from '../../i18n/index.js';
import { showSettingsOptionSheet } from '../../settings-app/ui/settings-layer.js';

/** 人物页只选择仓库中的声音，不在这里管理仓库或手填 ID。 */
export async function pickQQVoice({ facade, value = '', runtime, isCurrent = () => true, onSelect }) {
    const result = await facade.query.voiceLibrary();
    if (!isCurrent()) return;
    if (!result.ok) throw new Error(t("读取音色仓库失败"));
    return showSettingsOptionSheet({
        title: t("角色音色"), runtime, className: 'yuzi-qq-settings-layer',
        groups: [{
            options: [
                { value: '', label: t("未配置"), selected: !result.entries.some(entry => entry.voiceId === value) },
                ...result.entries.map(entry => ({
                    value: entry.voiceId, label: entry.name, selected: entry.voiceId === value,
                })),
            ],
        }],
        onSelect: next => { if (isCurrent()) onSelect?.(next); },
    });
}
