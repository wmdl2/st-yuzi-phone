import { normalizeBubbleStyle } from '../resources/appearance-contract.js';
import { normalizeAvatarFrameTransform } from '../resources/avatar-frame-transform.js';

// The calibration guide spans 80% of its stage; displayed avatars use that guide as their basis.
const CALIBRATION_GUIDE_RATIO = 0.8;

export function decorateQQAvatar(element, url, frameTransform = null) {
    if (!url || element.classList.contains('yuzi-qq-group-avatar') || element.classList.contains('yuzi-qq-group-avatar-member')) return;
    element.style.setProperty('--yuzi-qq-avatar-frame-image', 'url(' + JSON.stringify(url) + ')');
    if (frameTransform && typeof frameTransform === 'object') {
        const transform = normalizeAvatarFrameTransform(frameTransform);
        element.style.setProperty('--yuzi-qq-avatar-frame-offset-x', `${transform.x / CALIBRATION_GUIDE_RATIO * 100}%`);
        element.style.setProperty('--yuzi-qq-avatar-frame-offset-y', `${transform.y / CALIBRATION_GUIDE_RATIO * 100}%`);
        element.style.setProperty('--yuzi-qq-avatar-frame-scale', String(transform.scale / CALIBRATION_GUIDE_RATIO));
    }
    element.setAttribute('data-qq-avatar-frame', '');
}
export function decorateQQBubble(element, url, parameters) {
    if (!url) return;
    const style = normalizeBubbleStyle(parameters) || {};
    element.setAttribute('data-qq-bubble', '');
    element.style.backgroundColor = 'transparent';
    element.style.padding = (style.padding ?? 12) + 'px';
    if (style.textColor) element.style.color = style.textColor;
    if (style.radius !== undefined) element.style.borderRadius = style.radius + 'px';
    if (style.slice > 0) {
        element.style.borderStyle = 'solid';
        element.style.borderWidth = Math.min(style.slice, 24) + 'px';
        element.style.borderImageSource = 'url(' + JSON.stringify(url) + ')';
        element.style.borderImageSlice = style.slice + ' fill';
        element.style.borderImageRepeat = 'stretch';
    } else {
        element.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
        element.style.backgroundSize = '100% 100%';
        element.style.backgroundRepeat = 'no-repeat';
    }
}
