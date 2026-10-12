const FRAME_BOX_RATIO = 1.2;

export const AVATAR_FRAME_SCALE_MIN = 1 / FRAME_BOX_RATIO;
export const AVATAR_FRAME_SCALE_MAX = AVATAR_FRAME_SCALE_MIN * 4;
export const AVATAR_FRAME_SCALE_STEP = 1.1;

function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

export function avatarFrameOffsetLimit(scale) {
    const safeScale = clamp(scale, AVATAR_FRAME_SCALE_MIN, AVATAR_FRAME_SCALE_MAX, 1);
    // Decorative frames may move to the avatar's edge; they need not cover the avatar.
    return (FRAME_BOX_RATIO * safeScale + 1) / (2 * FRAME_BOX_RATIO);
}

export function normalizeAvatarFrameTransform(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const scale = clamp(source.scale, AVATAR_FRAME_SCALE_MIN, AVATAR_FRAME_SCALE_MAX, 1);
    const offsetLimit = avatarFrameOffsetLimit(scale);
    return {
        x: clamp(source.x, -offsetLimit, offsetLimit, 0),
        y: clamp(source.y, -offsetLimit, offsetLimit, 0),
        scale,
    };
}

export function moveAvatarFrameTransform(value, dx = 0, dy = 0) {
    const current = normalizeAvatarFrameTransform(value);
    return normalizeAvatarFrameTransform({
        ...current,
        x: current.x + Number(dx || 0),
        y: current.y + Number(dy || 0),
    });
}

export function scaleAvatarFrameTransform(value, direction) {
    const current = normalizeAvatarFrameTransform(value);
    const sign = Number(direction) < 0 ? -1 : 1;
    const nextScale = sign < 0
        ? current.scale / AVATAR_FRAME_SCALE_STEP
        : current.scale * AVATAR_FRAME_SCALE_STEP;
    return normalizeAvatarFrameTransform({
        ...current,
        scale: nextScale,
    });
}
