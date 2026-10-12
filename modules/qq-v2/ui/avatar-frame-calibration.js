import { t } from '../../i18n/index.js';
import { loadImage } from '../../settings-app/services/media-upload/core.js';
import { createCropRuntimeAdapter, mountPhoneImageCropOverlay } from '../../settings-app/services/media-upload/crop.js';
import {
    AVATAR_FRAME_SCALE_MAX,
    AVATAR_FRAME_SCALE_MIN,
    moveAvatarFrameTransform,
    normalizeAvatarFrameTransform,
} from '../resources/avatar-frame-transform.js';

export async function openAvatarFrameCalibrationDialog(rawDataUrl, options = {}) {
    const source = String(rawDataUrl || '');
    if (!source) return null;

    await loadImage(source);
    const runtime = createCropRuntimeAdapter(options.runtime || options.pageRuntime);
    if (runtime.isDisposed()) return null;

    const title = String(options.title || t("校准头像框")).trim() || t("校准头像框");
    const description = String(options.description || t("拖动头像框图片，让圆圈与头像区域对齐。")).trim();
    const overlay = document.createElement('div');
    overlay.className = 'phone-image-crop-overlay phone-avatar-frame-calibration-overlay';
    overlay.innerHTML = `
        <div class="phone-image-crop-dialog phone-avatar-frame-calibration-dialog" role="dialog" aria-modal="true">
            <div class="phone-image-crop-head phone-avatar-frame-calibration-head">
                <div class="phone-image-crop-title"></div>
                <button type="button" class="phone-settings-btn phone-image-crop-confirm">${t`确认上传`}</button>
            </div>
            <div class="phone-image-crop-desc"></div>
            <div class="phone-image-crop-stage-wrap">
                <div class="phone-avatar-frame-calibration-stage">
                    <img class="phone-avatar-frame-calibration-image" alt="${t`待校准头像框`}">
                    <div class="phone-avatar-frame-calibration-mask" aria-hidden="true"></div>
                    <div class="phone-avatar-frame-calibration-guide" aria-hidden="true"></div>
                </div>
            </div>
            <div class="phone-image-crop-actions">
                <div class="phone-image-crop-actions-secondary yuzi-qq-settings-range-row">
                    <button type="button" class="phone-settings-btn phone-image-crop-reset">${t`重置`}</button>
                    <div class="phone-ios-slider-row phone-avatar-frame-calibration-zoom">
                        <input type="range" class="phone-avatar-frame-calibration-scale"
                            min="${AVATAR_FRAME_SCALE_MIN}" max="${AVATAR_FRAME_SCALE_MAX}" step="0.001"
                            aria-label="${t`调整头像框大小`}">
                    </div>
                </div>
                <div class="phone-image-crop-actions-main">
                    <button type="button" class="phone-settings-btn phone-image-crop-cancel">${t`取消`}</button>
                </div>
            </div>
        </div>
    `;

    const titleEl = overlay.querySelector('.phone-image-crop-title');
    const descEl = overlay.querySelector('.phone-image-crop-desc');
    const imageEl = overlay.querySelector('.phone-avatar-frame-calibration-image');
    const stageEl = overlay.querySelector('.phone-avatar-frame-calibration-stage');
    const resetBtn = overlay.querySelector('.phone-image-crop-reset');
    const scaleInput = overlay.querySelector('.phone-avatar-frame-calibration-scale');
    const cancelBtn = overlay.querySelector('.phone-image-crop-cancel');
    const confirmBtn = overlay.querySelector('.phone-image-crop-confirm');

    overlay.querySelector('[role="dialog"]')?.setAttribute('aria-label', title);
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    if (imageEl instanceof HTMLImageElement) imageEl.src = source;

    const initialTransform = normalizeAvatarFrameTransform(options.initialTransform);
    let transform = { ...initialTransform };
    let dragState = null;
    let isClosed = false;
    let resolvePromise;
    let unmountOverlay = () => {};
    const isDialogActive = () => !isClosed && !runtime.isDisposed();

    const renderTransform = () => {
        if (!isDialogActive() || !(imageEl instanceof HTMLElement)) return;
        imageEl.style.transform = `translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale})`;
        if (scaleInput instanceof HTMLInputElement) scaleInput.value = String(transform.scale);
    };

    const stopDragging = () => {
        dragState = null;
        overlay.classList.remove('is-dragging');
        imageEl?.classList.remove('is-dragging');
    };

    const startDragging = (event) => {
        if (!isDialogActive() || !(stageEl instanceof HTMLElement)) return;
        const stageRect = stageEl.getBoundingClientRect();
        if (stageRect.width <= 0 || stageRect.height <= 0) return;
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            frameWidth: stageRect.width * 1.2,
            frameHeight: stageRect.height * 1.2,
            startTransform: { ...transform },
        };
        overlay.classList.add('is-dragging');
        imageEl?.classList.add('is-dragging');
        event.preventDefault();
    };

    const handlePointerMove = (event) => {
        if (!isDialogActive() || !dragState) return;
        const dx = (event.clientX - dragState.startX) / Math.max(1, dragState.frameWidth);
        const dy = (event.clientY - dragState.startY) / Math.max(1, dragState.frameHeight);
        transform = moveAvatarFrameTransform(dragState.startTransform, dx, dy);
        renderTransform();
    };

    const closeDialog = (result) => {
        if (isClosed) return;
        isClosed = true;
        stopDragging();
        runtime.cleanupAll();
        unmountOverlay();
        overlay.classList.remove('is-visible');
        try {
            overlay.remove();
        } catch {}
        resolvePromise(result);
    };

    const handleKeydown = (event) => {
        if (!isDialogActive()) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog(null);
        }
    };

    runtime.addEventListener(imageEl, 'pointerdown', startDragging);
    runtime.addEventListener(window, 'pointermove', handlePointerMove);
    runtime.addEventListener(window, 'pointerup', stopDragging);
    runtime.addEventListener(window, 'pointercancel', stopDragging);
    runtime.addEventListener(window, 'keydown', handleKeydown);

    runtime.addEventListener(resetBtn, 'click', () => {
        if (!isDialogActive()) return;
        transform = { ...initialTransform };
        renderTransform();
    });
    runtime.addEventListener(scaleInput, 'input', () => {
        if (!isDialogActive() || !(scaleInput instanceof HTMLInputElement)) return;
        transform = normalizeAvatarFrameTransform({ ...transform, scale: scaleInput.valueAsNumber });
        renderTransform();
    });
    runtime.addEventListener(cancelBtn, 'click', () => closeDialog(null));
    runtime.addEventListener(confirmBtn, 'click', () => {
        if (isDialogActive()) closeDialog(normalizeAvatarFrameTransform(transform));
    });
    runtime.addEventListener(overlay, 'click', (event) => {
        if (event.target === overlay) closeDialog(null);
    });

    const resultPromise = new Promise((resolve) => {
        resolvePromise = resolve;
    });

    if (runtime.isDisposed()) return null;
    unmountOverlay = mountPhoneImageCropOverlay(overlay, () => {
        if (!isClosed) closeDialog(null);
    });
    if (!unmountOverlay) {
        runtime.cleanupAll();
        return null;
    }
    runtime.registerCleanup(() => {
        unmountOverlay();
        overlay.remove();
    });
    runtime.requestAnimationFrame(() => {
        if (!isDialogActive()) return;
        overlay.classList.add('is-visible');
        renderTransform();
    });

    return resultPromise;
}
