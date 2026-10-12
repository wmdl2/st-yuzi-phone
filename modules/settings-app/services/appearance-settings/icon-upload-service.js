import { getAppearanceIconDisplayName } from './icon-slots.js';
import { t } from '../../../i18n/index.js';
import {
    getPhoneSettings,
    savePhoneSettingsPatch,
} from '../../../settings.js';
import { cacheRemove, CACHE_STORES } from '../../../cache-manager.js';
import { escapeHtml, escapeHtmlAttr } from '../../../utils/dom-escape.js';
import { formatFileSize } from '../../../utils/device.js';
import { Logger } from '../../../error-handler.js';
import { STORAGE_BUDGETS } from '../../constants.js';
import {
    estimateBase64Bytes,
    estimateIconsStorageBytes,
    pickImageFile,
} from '../media-upload.js';
import { showToast } from '../../ui/toast.js';
import { createScrollPreserver } from '../../ui/settings-scroll-binding.js';
import { collectAppearanceIconSlots } from './icon-slots.js';
import {
    buildAppIconAssignment,
    buildAppIconRemoval,
    collectAppearancePackIcons,
} from './icon-selection-state.js';
import {
    showAppearanceIconSourceMenu,
    showAppearancePackIconPicker,
} from './icon-picker-dialog.js';

const logger = Logger.withScope({ scope: 'settings-app/services/appearance-settings/icon-upload-service', feature: 'settings-app' });

export function createIconUploadService(deps = {}) {
    const getAppearancePack = typeof deps?.getAppearancePack === 'function'
        ? deps.getAppearancePack
        : null;
    const renderIconUploadList = (listEl, options = {}) => {
        if (!listEl) return () => {};

        const safeOptions = options && typeof options === 'object' ? options : {};
        const runtime = safeOptions.runtime || safeOptions.pageRuntime || null;
        const iconSlots = Array.isArray(safeOptions.items)
            ? safeOptions.items
            : collectAppearanceIconSlots();
        let disposed = false;
        let currentCleanups = [];

        const resetBoundListeners = () => {
            const tasks = [...currentCleanups];
            currentCleanups = [];
            tasks.reverse().forEach((cleanup) => {
                try {
                    cleanup();
                } catch (error) {
                    logger.warn('icon upload cleanup 执行失败', error);
                }
            });
        };

        const addCleanup = (cleanup) => {
            if (typeof cleanup === 'function') {
                currentCleanups.push(cleanup);
            }
        };

        const addListener = (target, type, listener, options) => {
            if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
                return;
            }
            target.addEventListener(type, listener, options);
            addCleanup(() => target.removeEventListener(type, listener, options));
        };

        let activePackState = {
            id: '',
            ready: true,
            source: null,
            promise: null,
        };

        const ensureActivePackSource = (settings) => {
            const packId = String(settings?.appearanceActivePackId || '').trim();
            if (!packId || !getAppearancePack) {
                activePackState = { id: packId, ready: true, source: null, promise: null };
                return Promise.resolve(null);
            }
            if (activePackState.id === packId && activePackState.ready) {
                return Promise.resolve(activePackState.source);
            }
            if (activePackState.id === packId && activePackState.promise) {
                return activePackState.promise;
            }

            activePackState = { id: packId, ready: false, source: null, promise: null };
            const promise = Promise.resolve()
                .then(() => getAppearancePack(packId))
                .then((result) => {
                    if (disposed || activePackState.id !== packId) return null;
                    const icons = result?.success && result?.pack
                        ? collectAppearancePackIcons(result.pack)
                        : [];
                    const source = icons.length > 0 ? {
                        id: packId,
                        name: String(result?.meta?.name || t("当前美化包")),
                        icons,
                    } : null;
                    activePackState = { id: packId, ready: true, source, promise: null };
                    return source;
                })
                .catch((error) => {
                    if (!disposed && activePackState.id === packId) {
                        logger.warn('读取当前美化包图标失败', error);
                        activePackState = { id: packId, ready: true, source: null, promise: null };
                    }
                    return null;
                });
            activePackState.promise = promise;
            return promise;
        };

        const saveIconSelection = (key, dataUrl, sourcePackId = '') => {
            if (disposed) return false;
            const iconBytes = estimateBase64Bytes(dataUrl);
            if (iconBytes > STORAGE_BUDGETS.appIconBytes) {
                showToast(listEl, t`单个图标过大（${formatFileSize(iconBytes, 2)} / ${formatFileSize(STORAGE_BUDGETS.appIconBytes, 2)}），请换更小图片`, true);
                return false;
            }

            const nextState = buildAppIconAssignment(getPhoneSettings(), key, dataUrl, sourcePackId);
            const nextTotalBytes = estimateIconsStorageBytes(nextState.appIcons);
            if (nextTotalBytes > STORAGE_BUDGETS.appIconsTotalBytes) {
                showToast(listEl, t`自定义图标总容量超出上限（${formatFileSize(nextTotalBytes, 2)} / ${formatFileSize(STORAGE_BUDGETS.appIconsTotalBytes, 2)}），当前图片未保存。请清理部分图标或换更小图片后重试`, true);
                return false;
            }

            const saved = savePhoneSettingsPatch(nextState);
            if (!saved) {
                showToast(listEl, t("图标保存失败，请重试"), true);
                return false;
            }

            cacheRemove(CACHE_STORES.images, `icon:${key}`).catch(() => {});
            render();
            showToast(listEl, t("图标已更新"));
            return true;
        };

        const openLocalIconUpload = (key, iconName) => {
            pickImageFile((dataUrl) => {
                saveIconSelection(key, dataUrl, '');
            }, {
                runtime,
                maxSizeMB: 6,
                maxWidth: 768,
                maxHeight: 768,
                quality: 0.68,
                cropTitle: t`裁剪 ${iconName}`,
                cropDescription: t("建议仅保留图标主体，范围越小越容易通过容量限制。"),
                cropPreset: 'icon',
                onError: (msg) => {
                    if (disposed) return;
                    showToast(listEl, msg || t("图标上传失败"), true);
                },
            });
        };

        const openPackIconPicker = (key, source, slotName = '') => {
            const mounted = showAppearancePackIconPicker({
                packName: source.name,
                icons: source.icons,
                slotName,
                runtime,
                onSelect: icon => saveIconSelection(key, icon.dataUrl, source.id),
            });
            if (!mounted) {
                showToast(listEl, t("图标选择器打开失败，请重试"), true);
            }
        };

        const removeIcon = (key) => {
            if (disposed || !key) return;
            const nextState = buildAppIconRemoval(getPhoneSettings(), key);
            savePhoneSettingsPatch(nextState);
            cacheRemove(CACHE_STORES.images, `icon:${key}`).catch(() => {});
            renderWithCleanupScroll();
            showToast(listEl, t("图标已清除"));
        };

        const buildIconArtHtml = (dataUrl, label) => (dataUrl
            ? `<img src="${escapeHtmlAttr(dataUrl)}" alt="">`
            : `<span aria-hidden="true">${escapeHtml(String(label || '').trim().charAt(0) || t("默认"))}</span>`);

        const render = () => {
            if (disposed) return;
            resetBoundListeners();

            const phoneSettings = getPhoneSettings();
            const currentIcons = phoneSettings.appIcons || {};
            const currentIconsBytes = estimateIconsStorageBytes(currentIcons);
            const totalLimitText = formatFileSize(STORAGE_BUDGETS.appIconsTotalBytes, 2);
            const totalUsageText = formatFileSize(currentIconsBytes, 2);
            const usageRatio = Math.min(1, currentIconsBytes / Math.max(1, STORAGE_BUDGETS.appIconsTotalBytes));

            if (iconSlots.length === 0) {
                listEl.innerHTML = `<div class="phone-empty-msg">${t("无数据")}</div>`;
                return;
            }

            const activePackPromise = ensureActivePackSource(phoneSettings);
            const activePackId = String(phoneSettings.appearanceActivePackId || '').trim();
            const activePackPending = !!activePackId
                && activePackState.id === activePackId
                && !activePackState.ready;

            const slotMap = new Map(iconSlots.map(item => [item.key, item]));

            const gridHtml = iconSlots.map((item) => {
                const customIcon = currentIcons[item.key] || '';
                const label = getAppearanceIconDisplayName(item);
                return `
                    <button type="button" class="phone-ios-icon-cell phone-icon-upload-btn${customIcon ? ' is-custom' : ''}" data-icon-key="${escapeHtmlAttr(item.key)}" data-icon-name="${escapeHtmlAttr(label)}" aria-haspopup="dialog" ${activePackPending ? 'disabled aria-busy="true"' : ''}>
                        <span class="phone-ios-icon-cell-art">${buildIconArtHtml(customIcon, label)}</span>
                        <span class="phone-ios-icon-cell-label">${escapeHtml(label)}</span>
                    </button>
                `;
            }).join('');

            const allCurrentIconEntries = Object.entries(currentIcons);
            const cleanupRowsHtml = allCurrentIconEntries.length > 0 ? allCurrentIconEntries.map(([key, dataUrl]) => {
                const slot = slotMap.get(key);
                const label = slot ? getAppearanceIconDisplayName(slot) : t("隐藏旧图标 / 无当前图标位");
                return `
                    <div class="phone-ios-row has-thumb phone-icon-cleanup-row" data-icon-key="${escapeHtmlAttr(key)}">
                        <img src="${escapeHtmlAttr(dataUrl)}" class="phone-ios-thumb" alt="">
                        <span class="phone-ios-row-label">${escapeHtml(label)}<span class="phone-ios-row-sub">${escapeHtml(key)}</span></span>
                        <span class="phone-ios-badge${slot ? ' is-muted' : ' is-danger'}">${slot ? t("当前图标位") : t("隐藏旧图标")}</span>
                        <button type="button" class="phone-ios-row-del phone-icon-delete-current-btn" aria-label="${escapeHtmlAttr(t`删除 ${label}`)}">${t`删除`}</button>
                    </div>
                `;
            }).join('') : `<div class="phone-ios-row phone-ios-row-empty">${t("当前没有自定义图标")}</div>`;

            listEl.innerHTML = `
                <div class="phone-ios-group is-scrollable">
                    <div class="phone-ios-icon-grid">${gridHtml}</div>
                </div>
                <p class="phone-ios-group-footer">${t("点按图标即可上传或恢复默认，右上角圆点表示已自定义。")}</p>
                <h3 class="phone-ios-group-header">${t`图标清理 · ${escapeHtml(String(allCurrentIconEntries.length))} 个`}</h3>
                <div class="phone-ios-group is-scrollable phone-icon-cleanup-scroll">
                    <div class="phone-ios-row">
                        <span class="phone-ios-row-label">${t("已用空间")}<span class="phone-ios-usage-bar${usageRatio >= 0.85 ? ' is-high' : ''}" style="--yuzi-settings-usage-ratio:${Math.round(usageRatio * 100)}%" aria-hidden="true"><span></span></span></span>
                        <span class="phone-ios-row-value">${t`${escapeHtml(totalUsageText)} / ${escapeHtml(totalLimitText)}`}</span>
                    </div>
                    ${cleanupRowsHtml}
                </div>
                <p class="phone-ios-group-footer">${t("仅移除图标，不影响表格数据或背景。")}</p>
            `;

            void activePackPromise.finally(() => {
                if (disposed) return;
                const currentActivePackId = String(getPhoneSettings().appearanceActivePackId || '').trim();
                if (currentActivePackId !== activePackState.id) return;
                listEl.querySelectorAll('.phone-icon-upload-btn[aria-busy="true"]').forEach((button) => {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                });
            });

            listEl.querySelectorAll('.phone-icon-upload-btn').forEach((btn) => {
                addListener(btn, 'click', () => {
                    if (disposed) return;
                    const key = btn.dataset?.iconKey;
                    if (!key) return;
                    const iconName = String(btn.dataset?.iconName || t("图标")).trim() || t("图标");
                    const source = activePackState.ready ? activePackState.source : null;
                    const hasCustom = !!getPhoneSettings().appIcons?.[key];
                    const mounted = showAppearanceIconSourceMenu({
                        packName: source?.name || '',
                        iconName,
                        previewHtml: btn.querySelector('.phone-ios-icon-cell-art')?.innerHTML || '',
                        runtime,
                        onLocalUpload: () => openLocalIconUpload(key, iconName),
                        onPackSelect: source ? () => openPackIconPicker(key, source, iconName) : undefined,
                        onReset: hasCustom ? () => removeIcon(key) : undefined,
                    });
                    if (!mounted) openLocalIconUpload(key, iconName);
                });
            });

            listEl.querySelectorAll('.phone-icon-delete-current-btn').forEach((btn) => {
                addListener(btn, 'click', () => {
                    if (disposed) return;
                    const row = btn.closest('.phone-icon-cleanup-row');
                    const key = row?.dataset?.iconKey;
                    if (!key) return;
                    removeIcon(key);
                });
            });
        };

        const renderWithCleanupScroll = createScrollPreserver(
            listEl,
            {},
            '.phone-icon-cleanup-scroll',
            runtime,
        ).createRerenderWithScroll('iconCleanupScrollTop', render);

        render();

        return () => {
            disposed = true;
            resetBoundListeners();
        };
    };

    return {
        renderIconUploadList,
    };
}
