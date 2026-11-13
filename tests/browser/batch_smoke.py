"""Optional real-browser checks. Requires Python Playwright + Chromium.

Run against an already running build: python tests/browser/batch_smoke.py --url URL
Artifacts contain only test fixtures. No existing browser profile is used.
"""
import argparse
import base64
import csv
import hashlib
import io
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4186')
    parser.add_argument('--artifacts', default='.tmp-verify/browser')
    args = parser.parse_args()
    artifacts = Path(args.artifacts).resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    checks = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, downloads_path=str(artifacts))
        context = browser.new_context(viewport={'width': 1440, 'height': 1100})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.goto(args.url)
        page.wait_for_load_state('networkidle')

        def button(name):
            return page.get_by_role('button', name=name, exact=True)

        def run():
            button('开始处理').click()
            expect(page.locator('.run-message[role="status"]')).to_contain_text('处理完成', timeout=20000)

        def download(name):
            with page.expect_download() as info:
                button(name).click()
            return Path(info.value.path()).read_text(encoding='utf-8-sig')

        search = page.get_by_role('textbox', name='搜索工具', exact=True)
        search.fill('pipeline')
        expect(page.locator('.mini-tool-card')).to_have_count(1)
        card = button('打开批量处理模式')
        card.focus()
        card.press('Enter')
        expect(page.get_by_role('heading', name='批量处理模式', exact=True)).to_be_visible()
        search.fill('nothing-matches-this-fixture')
        expect(page.get_by_text('未找到匹配的工具，请调整关键词或分类。')).to_be_visible()
        button('重置筛选').click()
        checks.append('unique search result, keyboard navigation and empty search recovery')

        preset = page.get_by_label('选择常用配方')
        source = page.get_by_role('textbox', name='待处理文本，每行一条', exact=True)
        preset.select_option('decode-json')
        fixture = json.dumps({'name': '工具箱🚀', 'ready': True}, ensure_ascii=False)
        encoded = base64.b64encode(fixture.encode()).decode()
        source.fill(encoded + '\naGVsbG8=')
        run()
        expect(page.locator('.result-item')).to_have_count(2)
        expect(page.locator('.result-row.is-error')).to_have_count(1)
        expect(page.locator('.result-row.is-error')).to_contain_text('第 2 步')
        result = json.loads(download('JSON'))
        assert result['recipe']['steps'] == ['base64-decode', 'json-format']
        assert json.loads(result['rows'][0]['output'])['name'] == '工具箱🚀'
        assert result['rows'][1]['ok'] is False
        checks.append('multi-step Unicode conversion and per-row error isolation')

        page.get_by_label('第 1 步处理方式').select_option('url-encode')
        expect(page.get_by_role('status').filter(has_text='流程已修改')).to_be_visible()
        assert json.loads(download('JSON'))['recipe']['steps'][0] == 'base64-decode'
        recipe = download('导出配方')
        assert '工具箱' not in recipe and encoded not in recipe
        recipe_file = page.get_by_label('选择处理配方文件')
        recipe_file.set_input_files({'name': 'recipe.json', 'mimeType': 'application/json', 'buffer': recipe.encode()})
        expect(page.get_by_text('已导入 2 步处理配方', exact=True)).to_be_visible()
        recipe_file.set_input_files({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{"kind":"evil","version":1}'})
        expect(page.get_by_text('不支持的配方格式或版本', exact=True)).to_be_visible()
        expect(page.get_by_label('第 1 步处理方式')).to_have_value('url-encode')
        recipe_file.set_input_files({'name': 'oversized.json', 'mimeType': 'application/json', 'buffer': b' ' * 16385})
        expect(page.get_by_text('配方文件不能超过 16 KB', exact=True)).to_be_visible()
        button('上移第 2 步').click()
        expect(page.get_by_label('第 1 步处理方式')).to_have_value('json-format')
        button('下移第 1 步').click()
        expect(page.get_by_label('第 1 步处理方式')).to_have_value('url-encode')
        button('删除第 2 步').click()
        checks.append('recipe import/export, invalid import, reorder and historical export snapshot')

        page.get_by_label('第 1 步处理方式').select_option('base64-decode')
        source.fill('PTErMQ==\n=1+1')
        run()
        exported = list(csv.reader(io.StringIO(download('CSV'))))
        assert exported[1][3] == "'=1+1"
        assert exported[2][1] == "'=1+1"
        checks.append('downloaded CSV neutralizes formula output and source')

        button('文件批量').click()
        page.get_by_label('第 1 步处理方式').select_option('sha256')
        binary = bytes([255, 0, 254, 128])
        page.locator('input[type="file"][multiple]').set_input_files([
            {'name': 'binary.bin', 'mimeType': 'application/octet-stream', 'buffer': binary},
            {'name': 'empty.bin', 'mimeType': 'application/octet-stream', 'buffer': b''}
        ])
        run()
        exported = json.loads(download('JSON'))
        assert exported['rows'][0]['output'] == hashlib.sha256(binary).hexdigest()
        assert exported['rows'][1]['output'] == hashlib.sha256(b'').hexdigest()
        checks.append('real file upload, binary and empty-file SHA-256')

        button('文本批量').click()
        preset.select_option('binary-hash')
        source.fill(base64.b64encode(binary).decode())
        run()
        assert json.loads(download('JSON'))['rows'][0]['output'] == hashlib.sha256(binary).hexdigest()
        source.fill('\n'.join(['x'] * 1001))
        button('开始处理').click()
        expect(page.get_by_role('alert').filter(has_text='单次最多 1000 条')).to_be_visible()
        expect(page.locator('.result-item')).to_have_count(1)
        checks.append('binary Base64 -> hash and row limit preserves previous results')

        button('删除第 2 步').click()
        page.get_by_label('第 1 步处理方式').select_option('base64-encode')
        source.fill('\n'.join(f'entry-{index}' for index in range(250)))
        run()
        expect(page.locator('.result-item')).to_have_count(100)
        button('下一页').click()
        expect(page.locator('.result-item').first).to_contain_text('entry-100')
        page.get_by_label('筛选处理结果').fill('entry-249')
        expect(page.locator('.result-item')).to_have_count(1)
        page.get_by_label('筛选处理结果').fill('')
        expect(page.locator('.result-item').first).to_contain_text('entry-0')
        checks.append('250-row pagination and filtering resets the page')

        source.fill('\n'.join(['x' * 10000] * 1000))
        button('开始处理').click()
        expect(page.locator('.result-item').first).to_be_visible()
        assert page.get_by_label('第 1 步处理方式').is_disabled()
        button('停止').click()
        expect(page.get_by_role('status').filter(has_text='已停止')).to_be_visible()
        progress = page.get_by_role('progressbar', name='批量处理进度')
        assert int(progress.get_attribute('aria-valuenow')) < int(progress.get_attribute('aria-valuemax'))
        stopped = json.loads(download('JSON'))
        assert stopped['status'] == 'stopped' and 0 < stopped['total'] < stopped['requestedTotal']
        checks.append('cancellation terminates background work, preserves partial results and progress')

        button('清空').click()
        preset.select_option('decode-json')
        source.fill(encoded)
        run()
        expect(page.locator('.toast-item')).to_have_count(0)
        for width, height, filename in [(1440, 1100, 'batch-desktop-dark.png'), (768, 1024, 'batch-tablet-dark.png'), (390, 844, 'batch-mobile-dark.png')]:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('.recipe-panel').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
            page.screenshot(path=str(artifacts / filename), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1100})
        page.locator('.brand button[title="切换浅色模式"]').click()
        expect(page.locator('.recipe-step select').first).to_have_css('color', 'rgb(15, 23, 42)')
        page.screenshot(path=str(artifacts / 'batch-desktop-light.png'), full_page=True)
        checks.append('desktop/tablet/mobile no horizontal overflow; dark/light screenshots')

        button('打开二维码生成器').click()
        qr_input = page.locator('.tool-component-wrapper textarea')
        qr_input.fill('x' * 6000)
        expect(page.get_by_role('alert').filter(has_text='无法生成二维码')).to_be_visible()
        assert button('💾 保存下载 PNG').is_disabled()
        qr_input.fill('https://example.com')
        expect(page.get_by_alt_text('QR Code')).to_be_visible()
        assert button('💾 保存下载 PNG').is_enabled()
        checks.append('QR capacity error and recovery with download enablement')

        labels = page.locator('.mini-tool-card').evaluate_all('(els) => els.map(e => e.getAttribute("aria-label"))')
        assert len(labels) == 21
        for label in labels:
            button(label).click()
        assert not errors, errors
        checks.append('all 21 registered tools open without page or console errors')
        browser.close()

    report = {'status': 'PASS', 'url': args.url, 'checks': checks, 'pageErrors': errors}
    (artifacts / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True))


if __name__ == '__main__':
    main()
