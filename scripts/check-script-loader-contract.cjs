const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FILES = {
    loader: '酒馆助手脚本-玉子手机.json',
};

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function check(results, file, description, ok, details = '') {
    results.push({ file, description, ok, details });
}

function positionOf(source, snippet) {
    return source.indexOf(snippet);
}

function ordered(...indexes) {
    return indexes.every(index => index >= 0) && indexes.every((index, i) => i === 0 || indexes[i - 1] < index);
}

function main() {
    const results = [];
    let loaderJson;

    try {
        loaderJson = JSON.parse(read(FILES.loader));
        check(results, FILES.loader, 'loader JSON 可解析', true);
    } catch (error) {
        console.error(`[script-loader-contract-check] JSON 读取失败：${error.message}`);
        process.exitCode = 1;
        return;
    }

    const rawLoader = loaderJson.content;
    const loader = typeof rawLoader === 'string' ? rawLoader : '';
    const fallbackTag = 'y67';
    check(results, FILES.loader, 'loader content 是非空字符串', typeof rawLoader === 'string' && rawLoader.trim().length > 0);
    check(results, FILES.loader, 'fallback tag 指向当前已发布的 y 标签', /^y\d+$/.test(fallbackTag), fallbackTag);

    try {
        new Function('window', 'document', 'fetch', `return (async()=>{${loader}\n})();`);
        check(results, FILES.loader, 'loader content 可作为异步脚本解析', true);
    } catch (error) {
        check(results, FILES.loader, 'loader content 可作为异步脚本解析', false, error.message);
    }

    const requiredSnippets = [
        ['读取新仓库 GitHub tags API', "fetch('https://api.github.com/repos/yuzi52/st-yuzi-phone/tags?per_page=100')"],
        ['直接使用 tags API 第一项，不依赖 tag 命名规则', `return tags[0]?.name || '${fallbackTag}';`],
        ['tags API 异常回退到当前已发布 tag', `return '${fallbackTag}';`],
        ['jsDelivr base 使用新仓库和动态 version tag', 'https://gcore.jsdelivr.net/gh/yuzi52/st-yuzi-phone@${version}'],
        ['注入 dist CSS bundle', 'dist/yuzi-phone.bundle.css'],
        ['注入 dist JS bundle', 'dist/yuzi-phone.bundle.js'],
        ['CSS 注入 id 稳定', "link.id = 'yuzi-phone-css';"],
        ['JS 注入 id 稳定', "script.id = 'yuzi-phone-js';"],
        ['singleton key 与扩展一致', "const INSTANCE_KEY = '__YUZI_PHONE_INSTANCE__';"],
        ['重复加载统一走阻断原因', 'function getDuplicateLoadBlockReason()'],
    ];
    requiredSnippets.forEach(([description, snippet]) => check(results, FILES.loader, description, loader.includes(snippet), snippet));
    check(results, FILES.loader, '不筛选或排序 tag 名称', !loader.includes('.filter(') && !loader.includes('.sort('));

    ['yuzi-phone-root', 'yuzi-phone-standalone', 'yuzi-phone-toggle', 'yuzi-phone-settings', 'yuzi-phone-css', 'yuzi-phone-js']
        .forEach(id => check(results, FILES.loader, `旧痕互斥检测包含 ${id}`, loader.includes(`'${id}'`)));

    const initial = positionOf(loader, 'const initialBlockReason = getDuplicateLoadBlockReason();');
    const fetchCall = positionOf(loader, "fetch('https://api.github.com/repos/yuzi52/st-yuzi-phone/tags?per_page=100')");
    const postFetch = positionOf(loader, 'const postFetchBlockReason = getDuplicateLoadBlockReason();');
    const appendLink = positionOf(loader, 'appendChild(link)');
    const appendScript = positionOf(loader, 'appendChild(script)');
    check(results, FILES.loader, 'fetch 前和 append 前均复检重复加载', ordered(initial, fetchCall, postFetch, appendLink, appendScript));
    check(results, FILES.loader, 'loader 不使用顶层 return 逃逸', !loader.includes('return;'));
    check(results, FILES.loader, 'loader 不自动 destroy 旧实例', !loader.includes('.destroy(') && !loader.includes('destroy?.('));

    const failed = results.filter(item => !item.ok);
    if (failed.length > 0) {
        console.error('[script-loader-contract-check] 检查失败：');
        failed.forEach(item => console.error(`- ${item.file}: ${item.description}${item.details ? ` (${item.details})` : ''}`));
        process.exitCode = 1;
        return;
    }

    console.log('[script-loader-contract-check] 检查通过');
    results.forEach(item => console.log(`- OK | ${item.file} | ${item.description}`));
}

main();

