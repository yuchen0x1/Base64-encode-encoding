"""Bug recheck for JSON precision, clipboard denial and insecure-context UUID.

Requires an existing local production server and Python Playwright / Chromium.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4186')
    args = parser.parse_args()
    checks = []
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url)
        page.wait_for_load_state('networkidle')

        def button(name):
            return page.get_by_role('button', name=name, exact=True)

        button('打开JSON 格式化 & 校验').click()
        editor = page.locator('.tool-component-wrapper .main-editor').first
        source = '{ "id": 9223372036854775807, "decimal": 0.1234567890123456789, "big": 1e999 }'
        compact = '{"id":9223372036854775807,"decimal":0.1234567890123456789,"big":1e999}'
        editor.fill(source)
        button('✨ 格式美化 (PRETTIFY)').click()
        assert '9223372036854775807' in editor.input_value()
        button('📦 压缩紧凑 (MINIFY)').click()
        expect(editor).to_have_value(compact)
        button('↕️ 键名排序').click()
        expect(page.get_by_role('alert')).to_contain_text('无法无损')
        expect(editor).to_have_value(compact)
        button('🧹 清理空值').click()
        expect(editor).to_have_value(compact)
        editor.fill('{"a":1,"a":2}')
        button('↕️ 键名排序').click()
        expect(page.get_by_role('alert')).to_contain_text('重复键')
        expect(editor).to_have_value('{"a":1,"a":2}')
        checks.append('JSON formatting/minification preserve original numbers; structural edits refuse lossy numbers')

        editor.fill('{"ok":true}')
        expect(page.get_by_role('alert')).to_have_count(0)
        button('TS 类型').click()
        expect(page.locator('.generated-output')).to_be_visible()
        editor.fill('{"changed":false}')
        expect(page.locator('.generated-output')).to_have_count(0)
        checks.append('manual JSON edits clear stale errors and generated types')

        deep = '[' * 5000 + '0' + ']' * 5000
        editor.fill(deep)
        button('✨ 格式美化 (PRETTIFY)').click()
        expect(page.get_by_role('alert')).to_contain_text('256')
        expect(editor).to_have_value(deep)
        button('TS 类型').click()
        expect(page.get_by_role('alert')).to_contain_text('256')
        button('📦 压缩紧凑 (MINIFY)').click()
        expect(editor).to_have_value(deep)
        checks.append('5000-level JSON does not overflow key statistics; expensive structural operations are bounded')

        page.evaluate("""Object.defineProperty(navigator, 'clipboard', {
            configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }
        })""")
        button('打开Base64 编解码').click()
        button('一键复制').click()
        expect(page.get_by_text('复制失败，请手动选择并复制', exact=True).last).to_be_visible()
        expect(button('一键复制')).to_be_visible()
        checks.append('clipboard denial gives a failure message and no false copied state')

        button('打开随机密码 & UUID 生成器').click()
        toggles = page.locator('.charset-grid input')
        for index in range(4):
            toggles.nth(index).uncheck()
        expect(page.get_by_role('alert')).to_contain_text('至少选择')
        expect(page.get_by_label('生成的密码')).to_have_value('')
        assert button('📋 一键复制').is_disabled()
        toggles.nth(2).check()
        expect(page.get_by_label('生成的密码')).to_have_value(re.compile(r'^\d{20}$'))
        toggles.nth(0).check()
        slider = page.get_by_role('slider', name='密码长度')
        slider.focus()
        slider.press('Home')
        password = page.get_by_label('生成的密码').input_value()
        assert len(password) == 8 and re.search('[A-Z]', password) and re.search('[0-9]', password)
        checks.append('empty password selection is rejected and every selected group is present')

        button('打开批量处理模式').click()
        page.get_by_label('第 1 步处理方式').select_option('json-minify')
        page.get_by_label('待处理文本，每行一条', exact=True).fill(source)
        button('开始处理').click()
        expect(page.locator('.run-message[role="status"]')).to_contain_text('处理完成')
        with page.expect_download() as info:
            button('JSON').click()
        data = json.loads(Path(info.value.path()).read_text(encoding='utf-8'))
        assert data['rows'][0]['output'] == compact
        page.get_by_label('第 1 步处理方式').select_option('sha256')
        page.get_by_label('待处理文本，每行一条', exact=True).fill('x' * 80 + 'suffix-needle')
        button('开始处理').click()
        expect(page.locator('.run-message[role="status"]')).to_contain_text('处理完成')
        page.get_by_label('筛选处理结果').fill('suffix-needle')
        expect(page.locator('.result-item')).to_have_count(1)
        checks.append('batch JSON download preserves precision; source search includes text beyond truncated labels')

        # Map an ordinary HTTP origin to the local build without changing DNS,
        # host configuration or browser security flags.
        context = browser.new_context()

        def local_response(route):
            url = urlsplit(route.request.url)
            response = route.fetch(url=args.url.rstrip('/') + url.path + ('?' + url.query if url.query else ''))
            route.fulfill(response=response)

        context.route('http://toolbox.test/**', local_response)
        lan = context.new_page()
        lan.on('pageerror', lambda error: errors.append(str(error)))
        lan.goto('http://toolbox.test/')
        lan.wait_for_load_state('networkidle')
        assert lan.evaluate('isSecureContext') is False
        assert lan.evaluate('typeof crypto.randomUUID') == 'undefined'
        lan.get_by_role('button', name='打开随机密码 & UUID 生成器', exact=True).click()
        expect(lan.locator('.uuid-text')).to_have_count(5)
        for value in lan.locator('.uuid-text').all_text_contents():
            assert re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', value)
        checks.append('real insecure HTTP context with no randomUUID still generates valid UUID v4 values')
        assert not errors, errors
        browser.close()

    report = {'status': 'PASS', 'checks': checks, 'pageErrors': errors}
    output = Path('.tmp-verify/regression-results.json')
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True))


if __name__ == '__main__':
    main()
