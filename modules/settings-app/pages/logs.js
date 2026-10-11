import { t } from '../../i18n/index.js';
import { escapeHtml } from '../../utils/dom-escape.js';
import { qqFailureLog } from '../../qq-v2/request/failure-log.js';
import { writeToClipboard } from '../../utils/clipboard.js';
import { buildSettingsPageFrame } from '../layout/primitives.js';
import { createScrollPreserver } from '../ui/settings-scroll-binding.js';

export function formatFailureLog(entry) {
    return [
        `${entry.source} · ${entry.title}`, entry.time, entry.conversation, entry.model,
        ...(entry.kind === 'tts' ? [] : [t("本次 AI 原始返回"), entry.response || t("本次未取得 AI 回复正文")]),
        t("这次是什么问题"), entry.explanation, t("你可以怎么做"), entry.suggestion,
        t("技术详情"), entry.detail || t("当前调用通道未提供详细错误信息"),
    ].filter(Boolean).join('\n');
}

export function buildFailureLogCard(entry) {
    const response = escapeHtml(entry.response || t("本次未取得 AI 回复正文"));
    const details = (label, bodyHtml) => `<details class="phone-ios-details">
        <summary class="phone-ios-row"><span class="phone-ios-row-label">${label}</span><span class="phone-ios-row-chevron" aria-hidden="true">›</span></summary>
        <div class="phone-ios-row is-block">${bodyHtml}</div>
    </details>`;
    return `<article class="phone-ios-group yuzi-failure-log" data-log-id="${entry.id}">
        <div class="phone-ios-row yuzi-failure-log-head">
            <div class="phone-ios-row-label">
                <strong>${escapeHtml(entry.source)} · <span class="yuzi-failure-log-kind">${escapeHtml(entry.title)}</span></strong>
                <span class="phone-ios-row-sub">${escapeHtml([entry.time, entry.conversation, entry.model].filter(Boolean).join(' · '))}</span>
            </div>
            <button type="button" class="phone-ios-mini-btn" data-copy-log="${entry.id}" aria-label="${t`复制本条日志`}">${t`复制`}</button>
        </div>
        ${entry.kind === 'tts' ? '' : details(t("本次 AI 原始返回"), `<pre>${response}</pre>`)}
        ${details(t("这次是什么问题"), `<p>${escapeHtml(entry.explanation)}</p>`)}
        ${details(t("你可以怎么做"), `<p>${escapeHtml(entry.suggestion)}</p>`)}
        ${details(t("技术详情"), `<pre>${escapeHtml(entry.detail || t("当前调用通道未提供详细错误信息"))}</pre>`)}
    </article>`;
}

export function createLogsPage(ctx) {
    const { container, state, render, pageRuntime, showToast } = ctx;
    const log = ctx.failureLog || qqFailureLog;
    const scroll = createScrollPreserver(container, state, undefined, pageRuntime);
    let unsubscribe = null;
    let disposed = false;
    let mounted = false;
    let revision = log.getSnapshot().revision;
    const sync = () => {
        if (disposed) return;
        const snapshot = log.getSnapshot();
        const list = container.querySelector('.yuzi-failure-log-list');
        if (!list) return;
        if (mounted) scroll.captureScroll('logsScrollTop');
        mounted = true;
        if (revision !== snapshot.revision) state.logsScrollTop = 0;
        revision = snapshot.revision;
        const ids = new Set(snapshot.entries.map(entry => String(entry.id)));
        for (const card of [...list.children]) {
            if (!ids.has(card.dataset.logId)) card.remove();
        }
        // Keep existing cards and native <details> intact; copying never rebuilds the page.
        for (const entry of [...snapshot.entries].reverse()) {
            if (!list.querySelector(`[data-log-id="${entry.id}"]`)) {
                list.insertAdjacentHTML('afterbegin', buildFailureLogCard(entry));
            }
        }
        container.querySelector('[data-log-empty]').hidden = snapshot.entries.length > 0;
        container.querySelector('[data-log-count]').textContent = t`${snapshot.entries.length} / 50 条`;
        container.querySelector('[data-log-trimmed]').hidden = !snapshot.trimmed;
        container.querySelector('[data-clear-logs]').disabled = snapshot.entries.length === 0;
        scroll.restoreScroll('logsScrollTop');
    };
    return {
        mount() {
            container.innerHTML = buildSettingsPageFrame({
                title: t("日志"),
                bodyClass: 'phone-app-body phone-settings-scroll phone-ios-grouped-page yuzi-failure-logs',
                bodyHtml: `<h2 class="phone-ios-group-header">${t("QQ / TTS 日志")}</h2>
                    <section class="phone-ios-group">
                        <div class="phone-ios-row"><span class="phone-ios-row-label" data-log-count role="status"></span></div>
                        <div class="phone-ios-row phone-ios-row-empty is-danger" data-log-trimmed hidden>${t`日志文本已达到内存上限，部分最旧记录已移除。`}</div>
                        <button type="button" class="phone-ios-row is-action is-danger" data-clear-logs>${t("清空日志")}</button>
                    </section>
                    <p class="phone-ios-group-footer">${t("仅记录失败，最新的在前。最近 50 条；刷新或切换酒馆聊天后清空。")}</p>
                    <section class="phone-ios-group yuzi-failure-log-empty" data-log-empty><p class="phone-ios-row phone-ios-row-empty">${t`暂无失败日志。已读不回和正常取消不会记为错误。`}</p></section>
                    <div class="yuzi-failure-log-list"></div>`,
            });
            pageRuntime.addEventListener(container, 'click', async event => {
                const target = event.target.closest('button');
                if (!target) return;
                if (target.matches('.phone-nav-back')) {
                    state.mode = 'home';
                    render();
                } else if (target.matches('[data-clear-logs]')) {
                    log.clear();
                } else if (target.matches('[data-copy-log]')) {
                    const entry = log.getSnapshot().entries.find(item => String(item.id) === target.dataset.copyLog);
                    if (!entry) return;
                    try {
                        const copied = await writeToClipboard(formatFailureLog(entry));
                        if (copied === false) throw new Error('clipboard unavailable');
                        if (!disposed) showToast(container, t("日志已复制，请留意其中的对话隐私。"), false, pageRuntime);
                    } catch {
                        if (!disposed) showToast(container, t("复制失败，请展开原文后手动复制。"), true, pageRuntime);
                    }
                }
            });
            unsubscribe = log.subscribe(sync);
            sync();
        },
        dispose() {
            disposed = true;
            scroll.captureScroll('logsScrollTop');
            unsubscribe?.();
        },
    };
}
