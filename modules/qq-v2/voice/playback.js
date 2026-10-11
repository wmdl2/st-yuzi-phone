import { t } from '../../i18n/index.js';

export function createVoicePlaybackController({ AudioCtor = globalThis.Audio, report = () => {} } = {}) {
    let audio = null;
    let current = null;
    const listeners = new Set();

    const notify = () => {
        const state = current && audio ? { key: current.key, paused: audio.paused === true } : null;
        for (const listener of [...listeners]) {
            try {
                listener(state);
            } catch (error) {
                report(error);
            }
        }
    };

    const ensureAudio = () => {
        if (audio) return audio;
        if (typeof AudioCtor !== 'function') return null;
        audio = new AudioCtor();
        audio.preload = 'auto';
        audio.addEventListener('play', notify);
        audio.addEventListener('pause', notify);
        audio.addEventListener('ended', () => {
            release();
        });
        return audio;
    };

    const release = () => {
        const previous = current;
        current = null;
        if (previous?.release) {
            try {
                previous.release();
            } catch (error) {
                report(error);
            }
        }
        notify();
    };

    const stop = () => {
        const element = audio;
        if (element) {
            try {
                element.pause();
            } catch {
                // 元素已卸载时暂停会抛错，不影响租约释放。
            }
            try {
                element.removeAttribute('src');
            } catch {
                // 忽略宿主实现的差异。
            }
        }
        release();
    };

    return Object.freeze({
        async play({ key, url, release: releaseLease } = {}) {
            const element = ensureAudio();
            if (!element) {
                releaseLease?.();
                const error = new Error(t("当前环境不支持音频播放"));
                error.code = 'voice_playback_unavailable';
                throw error;
            }
            if (current?.key === key) {
                if (releaseLease && releaseLease !== current.release) releaseLease();
                if (element.paused !== true) {
                    element.pause();
                    notify();
                    return Object.freeze({ paused: true });
                }
                try {
                    await element.play();
                } catch (error) {
                    stop();
                    throw error;
                }
                notify();
                return Object.freeze({ paused: false });
            }
            stop();
            current = { key, release: releaseLease };
            element.src = url;
            try {
                await element.play();
            } catch (error) {
                stop();
                throw error;
            }
            notify();
            return Object.freeze({ paused: false });
        },
        pause() {
            if (audio && audio.paused !== true) audio.pause();
            notify();
        },
        stop,
        isPlaying: (key) => Boolean(audio && current?.key === key && audio.paused !== true),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    });
}

